import requests, datetime, time, os, io, sys, base64, imgkit, qrcode, pathlib, asyncio, threading, tempfile, shutil
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from concurrent.futures import ThreadPoolExecutor

from config import CHROMIUM_EXECUTABLE_PATH

url = "https://form.undip.ac.id/makanansehat/pendaftaran"
indonesian_days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
indonesian_months = {
    1: "Januari",
    2: "February",
    3: "Maret",
    4: "April",
    5: "Mei",
    6: "Juni",
    7: "Juli",
    8: "Agustus",
    9: "September",
    10: "Oktober",
    11: "November",
    12: "Desember",
}
ufood_locations = {
    1: "Halaman Parkir Gedung SA-MWA",
    2: "Student Center",
    # Slot 3 was "Auditorium FPIK" — server renamed it to
    # "Pendopo FSM (seberang pintu masuk FPIK)" sometime before May 2026.
    # `check_form_options` does substring match self.location in option_text,
    # so the value below MUST be present verbatim in the form HTML.
    3: "Pendopo FSM (seberang pintu masuk FPIK)",
    4: "Auditorium Imam Bardjo, S.H.",
    5: "Halaman Gedung ART Center Undip",
}

today = datetime.datetime.now()
day_name = indonesian_days[today.weekday()]
pick_date = "{} {} {}".format(today.day, indonesian_months[today.month], today.year)
target_time = datetime.time(10, 00, 0)
closed_time = datetime.time(12, 00, 0)
current_time = datetime.datetime.now().time()


def run_sync_in_thread(loop, div_id, output_image, cookie_session):
    """Render the Undip kupon (#kupon_makanansehat_<id>) to a PNG file.

    Replaced pyppeteer (broken on Python 3.12 + websockets ≥10 + snap chromium
    permissions) with Playwright, which uses its own bundled chromium and is
    actively maintained. The `loop` arg is kept for backward compatibility but
    unused — Playwright sync API manages its own loop.
    """
    attempts_retry = 0
    while True:
        if attempts_retry >= 5:
            print(f"{div_id}: Error cannot get coupon file.")
            return
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )
                context = browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    device_scale_factor=3.0,
                )
                context.add_cookies([{
                    "name": "form_app_session",
                    "value": cookie_session,
                    "domain": "form.undip.ac.id",
                    "path": "/",
                }])
                page = context.new_page()
                page.goto(url + "/riwayat", wait_until="networkidle", timeout=60000)
                page.wait_for_selector(f"#{div_id}", timeout=60000)
                page.wait_for_selector(".qr-container", timeout=60000)
                page.evaluate("""async () => {
                    const img = document.querySelector('.qr-container img');
                    if (img && (!img.complete || img.naturalWidth === 0)) {
                        await new Promise(r => { img.onload = r; img.onerror = r; });
                    }
                }""")
                page.wait_for_function(
                    "() => { const c = document.querySelector('.qr-container canvas'); return c && c.width > 0 && c.height > 0; }",
                    timeout=60000,
                )
                elem = page.query_selector(f"#{div_id}")
                if elem:
                    elem.scroll_into_view_if_needed()
                    elem.screenshot(path=output_image)
                browser.close()
            return
        except Exception as e:
            print(f"{div_id} attempt {attempts_retry + 1} failed: {e}")
            attempts_retry += 1
            continue


class BotUndipFoodTruck:
    MAX_SUBMIT_ATTEMPTS = 10

    def __init__(
        self,
        account_id,
        name_object,
        location,
        available_quota,
        form_app_session=None,
    ):
        self.account_id = account_id
        self.name_object = name_object
        self.location = ufood_locations[location] if day_name != "Jumat" else ufood_locations[5]
        self.available_quota = available_quota
        self.cookies = {"form_app_session": form_app_session}
        self.form_app_session = form_app_session

        self.kupon_id = 0
        self.tanggal_id = 0
        self.coupon_file = ""
        self.validation_url = ""
        self.pick_location = location
        self.found_option_at = None
        self.send_at = None
        self.has_sent_at = None

        self.status_login = 0
        self.attempts_submit_form = 1
        self.logged_in = False
        self.graduated = False
        self.ticket_taken = False
        self.found_option = False

    def run_checking_data(self):
        if self.check_login():
            self.logged_in = True
            self.status_login = 1
        if self.logged_in:
            print(f"[{self.form_data['nama']}] Logged In - {self.location}")
        else:
            if self.graduated:
                self.status_login = 2
                print(f"[{self.name_object}] Graduated")
            else:
                self.status_login = 3
                print(f"[{self.name_object}] Logged Out")

    def check_login(self):
        attempts = 0
        while attempts < 3:
            try:
                response = requests.get(url, cookies=self.cookies)
                break
            except requests.exceptions.TooManyRedirects:
                attempts += 1
                if attempts >= 3:
                    self.graduated = True
                    return False
            except requests.exceptions.RequestException as e:
                print(f"An error occurred: {e}")
                return False

        response_content = response.content.decode("utf-8")
        self.content_soup = BeautifulSoup(response_content, "html.parser")
        name = self.content_soup.find("input", {"name": "nama"})
        # SSO Undip rejects non-active students with various status strings.
        # Treat all of them as graduated so Node stops retrying puppeteer login.
        ineligible_markers = [
            "data anda = <b>Lulus studi",
            "data anda = <b>Undur Diri",
            "data anda = <b>Cuti",
            "data anda = <b>Drop Out",
            "data anda = <b>Mengundurkan Diri",
            "tidak memenuhi syarat untuk pengambilan",
        ]
        if any(m in response_content for m in ineligible_markers):
            self.graduated = True
        if name == None:
            # with open("test.txt", "w") as file:
            #     file.write(response.content.decode("utf-8"))
            return False
        else:
            self.get_form_data()
            return True

    def get_form_data(self):
        self.form_data = {
            "ci_csrf_token": "",
            "status": self.content_soup.find("input", {"name": "status"})["value"],
            "nama": self.content_soup.find("input", {"name": "nama"})["value"],
            "identity": self.content_soup.find("input", {"name": "identity"})["value"],
            "nama_prodi": self.content_soup.find("input", {"name": "nama_prodi"})[
                "value"
            ],
            "nama_fakultas": self.content_soup.find("input", {"name": "nama_fakultas"})[
                "value"
            ],
            "mobile_phone": self.content_soup.find("input", {"name": "mobile_phone"})[
                "value"
            ],
        }

    def check_form_options(self, check_time_long_term=False):
        if self.logged_in and not self.graduated:
            iteration = 1
            retry_after_failed_ten_zero_thirty = 0
            parse_failures = 0
            while 1:
                response = requests.get(url, cookies=self.cookies)
                response_content = response.content.decode("utf-8")
                soup = BeautifulSoup(response_content, "html.parser")
                option_elements = soup.find_all("option")
                option_value = 0
                for option in option_elements:
                    option_text = option.get_text(strip=True)
                    if pick_date in option_text and self.location in option_text:
                        option_value = option["value"]
                        break
                try:
                    self.form_data = {
                        "ci_csrf_token": "",
                        "status": soup.find("input", {"name": "status"})["value"],
                        "nama": soup.find("input", {"name": "nama"})["value"],
                        "identity": soup.find("input", {"name": "identity"})["value"],
                        "nama_prodi": soup.find("input", {"name": "nama_prodi"})["value"],
                        "nama_fakultas": soup.find("input", {"name": "nama_fakultas"})[
                            "value"
                        ],
                        "mobile_phone": soup.find("input", {"name": "mobile_phone"})[
                            "value"
                        ],
                        "tanggal": option_value,
                    }
                except Exception as e:
                    nama = getattr(self, "form_data", {}).get("nama", self.name_object)
                    parse_failures += 1
                    if parse_failures >= 10:
                        print(f"[{nama}] Aborting check_form_options after {parse_failures} parse failures: {e}")
                        break
                    print(f"[{nama}] Error: {e}. Retry...({parse_failures})")
                    time.sleep(0.5)
                    continue
                
                if option_value == 0:
                    if check_time_long_term:
                        if self.is_after_eleven():
                            print(
                                f"[{self.form_data['nama']}] Stop iteration at {iteration}."
                            )
                            break
                        time.sleep(1)
                    else:
                        if self.is_after_ten_zero_thirty():
                            if retry_after_failed_ten_zero_thirty < 15:
                                retry_after_failed_ten_zero_thirty += 1
                                time.sleep(1)
                                iteration += 1
                                continue
                            print(
                                f"[{self.form_data['nama']}] Stop iteration at {iteration}."
                            )
                            break
                    print(f"[{self.form_data['nama']}] Finding options...({iteration})")
                    iteration += 1
                    continue
                else:
                    self.found_option = True
                    self.found_option_at = datetime.datetime.now(datetime.timezone.utc)
                    break

    def is_after_ten_zero_thirty(self):
        current_time = datetime.datetime.now().time()
        return (
            current_time
            >= (
                datetime.datetime.combine(datetime.date.today(), target_time)
                + datetime.timedelta(seconds=30)
            ).time()
        )

    def is_after_eleven(self):
        current_time = datetime.datetime.now().time()
        return current_time >= closed_time

    def is_before_10_am(self):
        current_time = datetime.datetime.now().time()
        return (
            current_time
            >= (
                datetime.datetime.combine(datetime.date.today(), target_time)
                - datetime.timedelta(seconds=5)
            ).time()
        )

    def is_after_10_am(self):
        current_time = datetime.datetime.now().time()
        return (
            current_time
            >= (
                datetime.datetime.combine(datetime.date.today(), target_time)
                - datetime.timedelta(seconds=0)
            ).time()
        )

    def submit_form(self, g_recaptcha_response_value: list, recaptcha_code=None):
        if self.logged_in and not self.graduated:
            if self.attempts_submit_form > self.MAX_SUBMIT_ATTEMPTS:
                print(
                    "[" + getattr(self, "form_data", {}).get("nama", self.name_object) + "]",
                    f"Aborting submit_form after {self.attempts_submit_form - 1} attempts.",
                )
                return

            while not self.is_before_10_am():
                time.sleep(1)
            while not self.is_after_10_am():
                time.sleep(0.1)

            if not self.found_option:
                self.check_form_options()
            if not self.found_option:
                return

            attempts_failed_submit = 0
            self.send_at = datetime.datetime.now(datetime.timezone.utc)
            # Form now uses TWO captchas: Cloudflare Turnstile (widget) AND a
            # CodeIgniter image captcha solved via /ajax_/validate_captcha.
            # Server stores the image-captcha success in session, then the
            # final POST /save accepts the Turnstile token.
            # Use a session so cookies (form_app_session) carry across calls.
            post_headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
                "Referer": url,
                "Origin": "https://form.undip.ac.id",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
            }
            sess = requests.Session()
            sess.cookies.set("form_app_session", self.form_app_session, domain="form.undip.ac.id")

            # Step A: solve + validate the image captcha. Only after this
            # succeeds do we consume a Turnstile token from the shared pool —
            # otherwise we'd waste tokens on attempts that never reach /save.
            nama = self.form_data["nama"]
            try:
                from solver_v2 import solve_image_captcha as _solve_img
                ts = int(time.time() * 1000)
                img_resp = sess.get(
                    url + f"/captcha_image?t={ts}",
                    headers={**post_headers, "Accept": "image/avif,image/webp,*/*"},
                    timeout=15,
                )
                captcha_text = _solve_img(img_resp.content)
                if not captcha_text:
                    print(f"[{nama}] image captcha solver returned nothing")
                    self.attempts_submit_form += 1
                    self.submit_form(g_recaptcha_response_value)
                    return
                rv = sess.post(
                    url + "/ajax_/validate_captcha",
                    data={"captcha_input": captcha_text, "ci_csrf_token": ""},
                    headers={
                        **post_headers,
                        "X-Requested-With": "XMLHttpRequest",
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                    },
                    timeout=15,
                )
                jv = rv.json() if rv.headers.get("Content-Type", "").startswith("application/json") else {}
                if jv.get("status") != "ok":
                    print(f"[{nama}] image captcha rejected, retrying. attempts={self.attempts_submit_form}")
                    self.attempts_submit_form += 1
                    self.submit_form(g_recaptcha_response_value)
                    return
            except Exception as e:
                print(f"[{nama}] captcha pre-step exception: {type(e).__name__}: {e}")
                self.attempts_submit_form += 1
                self.submit_form(g_recaptcha_response_value)
                return

            # Now consume a Turnstile token (image captcha is validated)
            if recaptcha_code is None:
                if len(g_recaptcha_response_value) > 0:
                    recaptcha_code = g_recaptcha_response_value.pop(0)
                else:
                    print(f"[{nama}] no Turnstile codes left after image captcha valid")
                    return

            # Step B: POST /save with Turnstile token
            while 1:
                try:
                    self.form_data["cf-turnstile-response"] = recaptcha_code
                    multipart = {k: (None, str(v)) for k, v in self.form_data.items()}
                    response = sess.post(
                        url + "/save",
                        files=multipart,
                        headers=post_headers,
                        timeout=30,
                    )
                    submitted_time = datetime.datetime.now().strftime("**%H:%M:%S**")
                    self.has_sent_at = datetime.datetime.now(datetime.timezone.utc)
                    break
                except Exception:
                    if attempts_failed_submit >= 5:
                        print("[" + self.form_data["nama"] + "] Failed to submit form!")
                        return
                    else:
                        attempts_failed_submit += 1
                        continue

            # Logs Response
            current_time = datetime.datetime.now()
            formatted_date = current_time.strftime("%Y%m%d")
            milliseconds = int(current_time.timestamp() * 1000)
            name = self.form_data["nama"].replace(" ", "").lower()

            log_folder = os.path.join("logs", formatted_date)
            os.makedirs(log_folder, exist_ok=True)
            file_path = os.path.join(
                log_folder, f"response_{formatted_date}_{milliseconds}_{name}.txt"
            )
            with open(file_path, "w") as file:
                file.write(response.content.decode("utf-8"))

            if (
                "Gagal! Pendaftaran hanya dapat dilakukan satu kali di hari yang sama"
                in response.content.decode("utf-8")
            ):
                print(
                    "[" + self.form_data["nama"] + "]",
                    submitted_time,
                    "You've gotten the ticket.",
                )
            elif (
                "Lengkapi captcha dengan baik." in response.content.decode("utf-8")
                or "Captcha belum divalidasi" in response.content.decode("utf-8")
                or "captcha belum divalidasi" in response.content.decode("utf-8")
            ):
                if len(g_recaptcha_response_value) > 0:
                    print(
                        "[" + self.form_data["nama"] + "]",
                        submitted_time,
                        f"reCaptcha invalid! Retry...({self.attempts_submit_form})",
                    )
                    self.attempts_submit_form += 1
                    self.submit_form(g_recaptcha_response_value)
                else:
                    print(
                        "[" + self.form_data["nama"] + "]",
                        submitted_time,
                        f"reCaptcha invalid! Codes empty...({self.attempts_submit_form})",
                    )
            elif (
                "Kuota sudah habis silahkan memilih hari lain."
                in response.content.decode("utf-8")
            ):
                print(
                    "[" + self.form_data["nama"] + "]",
                    submitted_time,
                    "Sold out! You didn't get the ticket.",
                )
            elif (
                "Gagal! Pendaftaran hanya dapat dilakukan mulai pukul"
                in response.content.decode("utf-8")
                or "Pendaftaran hanya dapat dilakukan tiap hari mulai pukul"
                in response.content.decode("utf-8")
            ):
                print(
                    "[" + self.form_data["nama"] + "]",
                    submitted_time,
                    "Registration failed due to the schedule of open submission.",
                )
            elif "Simpan berhasil." in response.content.decode("utf-8"):
                print(
                    "[" + self.form_data["nama"] + "]",
                    submitted_time,
                    "Ticket has been taken successfully.",
                )
            else:
                print(
                    "[" + self.form_data["nama"] + "]",
                    submitted_time,
                    f"Null error. Retry...({self.attempts_submit_form})",
                )
                self.attempts_submit_form += 1
                self.submit_form(g_recaptcha_response_value)

    def download_qr_code(self):
        if self.logged_in and not self.graduated:
            retry = 3
            soup = None
            while retry > 0:
                try:
                    response = requests.post(url + "/riwayat", cookies=self.cookies)
                    soup = BeautifulSoup(response.content, "html.parser")
                    if soup.find("div", class_="qr-container"):
                        break
                    else:
                        retry -= 1
                except Exception as e:
                    retry -= 1
                    print(f"[{self.name_object}] download_qr_code retry: {e}")
                    continue
            if soup is not None and soup.find("div", class_="qr-container"):
                self.validation_url = soup.find("div", class_="qr-container")[
                    "data-content"
                ]
                self.kupon_id = soup.find(
                    "button", class_="btn btn-info btn-lg lihat btn-square"
                )["data-id"]

                self.form_data["tanggal"] = (
                    soup.find("div", {"data-content": self.validation_url})["id"]
                ).split("_")[2]
                self.tanggal_id = self.form_data["tanggal"]

                output_folder = f"kupon/{self.form_data['tanggal']}"
                try:
                    if not os.path.exists(output_folder):
                        os.makedirs(output_folder)
                except FileExistsError:
                    pass
                file_name = f"{self.kupon_id}_{self.form_data['tanggal']}_{self.location.replace(' ', '')}_{self.form_data['identity']}_{self.form_data['nama'].replace(' ', '')}.png"
                output_path = os.path.join(
                    output_folder,
                    file_name,
                )
                self.coupon_file = output_path

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                executor = ThreadPoolExecutor()
                future = executor.submit(
                    run_sync_in_thread,
                    loop,
                    "kupon_makanansehat_" + self.kupon_id,
                    output_path,
                    self.form_app_session,
                )
                future.result()
                loop.close()

                print(
                    "[" + self.form_data["nama"] + "] Coupon ID:",
                    self.kupon_id,
                )
                self.ticket_taken = True
            else:
                print("[" + self.form_data["nama"] + "]", "You didn't get the ticket.")
