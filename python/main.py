import datetime, threading, time, json
from methods import *
from solver_v2 import solve_captcha
from database import (
    ssoEditAccountByID,
    getActiveSSOAccountLocationAndCookie,
    couponsAddEntry,
    errorLogAdd,
)

array_recaptcha_codes = []
len_array_recaptcha_codes = 0
check_login_threading_instances = []
solver_threading_instances = []
ticketing_threading_instances = []
retry_checking_option_threading_instances = []
downloading_threading_instances = []
logged_in_accounts = 0
ticket_taken_accounts = 0


def wait_until_h60s():
    while True:
        if (
            datetime.datetime.now().time()
            >= (
                datetime.datetime.combine(datetime.date.today(), target_time)
                - datetime.timedelta(seconds=60)
            ).time()
        ):
            break
        time.sleep(1)


def wait_until_h1s():
    while True:
        if (
            datetime.datetime.now().time()
            >= (
                datetime.datetime.combine(datetime.date.today(), target_time)
                - datetime.timedelta(seconds=1)
            ).time()
        ):
            break
        time.sleep(1)


def load_instances_from_json(file_path):
    with open(file_path, "r") as f:
        loaded_instances = json.load(f)
    return loaded_instances


def create_instances_from_data(data):
    instances = []
    for instance_data in data.values():
        instance = BotUndipFoodTruck(**instance_data)
        instances.append(instance)
    return instances


def load_accounts():
    data = getActiveSSOAccountLocationAndCookie(True)
    json_data = {}
    for idx, tup in enumerate(data):
        account_id, email, login_cookie, pick_location, available_quota = (
            tup  # Unpack the tuple
        )
        json_data[idx] = {
            "account_id": account_id,
            "name_object": email[: email.find("@")],
            "location": pick_location,
            "available_quota": available_quota,
            "form_app_session": login_cookie,  # Example value
        }
    instances = create_instances_from_data(json_data)
    print(f"**[SYS] There are {len(instances)} accounts loaded!")
    return instances


def checking_login_accounts(instances):
    global logged_in_accounts
    print("**[SYS] Checking logged in accounts...\n")

    for i, instance in enumerate(instances, 1):
        thread = threading.Thread(target=instance.run_checking_data, args=())
        thread.start()
        check_login_threading_instances.append(thread)
    for thread in check_login_threading_instances:
        thread.join()

    for i, instance in enumerate(instances, 1):
        if instance.logged_in:
            logged_in_accounts += 1

    print(f"\n**[SYS] There are {logged_in_accounts} accounts logged in successfully.")


def solving_recaptcha(instances, wait=True):
    global len_array_recaptcha_codes
    if wait:
        print("**[SYS] Waiting until H-60s...")
        wait_until_h60s()
    print("**[SYS] Running reCaptcha solver...")

    ticketing_index = 0
    solver_start_time = time.time()
    if logged_in_accounts > 0:
        for _ in range(int(logged_in_accounts * 2)):
            thread = threading.Thread(
                target=solve_captcha, args=(array_recaptcha_codes,)
            )
            len_array_recaptcha_codes += 1
            thread.start()
            solver_threading_instances.append(thread)
        while 1:
            if len(array_recaptcha_codes) > 0:
                if ticketing_index < len(instances):
                    single_instance = threading.Thread(
                        target=instances[ticketing_index].submit_form,
                        args=(array_recaptcha_codes,),
                    )
                    single_instance.start()
                    ticketing_threading_instances.append(single_instance)
                    ticketing_index += 1
                else:
                    break
            if len(solver_threading_instances) > 0:
                for index, thread in enumerate(solver_threading_instances):
                    if not thread.is_alive():
                        solver_threading_instances.pop(index)
            else:
                if ticketing_index >= len(instances):
                    break
            time.sleep(0.05)

    print(
        f"**[SYS] reCaptcha solver finished in {time.time() - solver_start_time:.2f}s and got {len_array_recaptcha_codes} codes"
    )
    print(f"**[SYS] reCaptcha solver got {len_array_recaptcha_codes} codes")


def submitting_forms(instances):
    global len_array_recaptcha_codes
    print("**[SYS] Waiting until H-1s...")
    wait_until_h1s()
    print("**[SYS] Submitting ticket forms...\n")

    for thread in ticketing_threading_instances:
        thread.join()
    if instances[0].found_option:
        print("\n**[SYS] Forms have been submitted.")
        return True
    else:
        print("\n**[SYS] Today's option hasn't been found. Checking options...")
        instances[0].check_form_options(True)
        if instances[0].found_option:
            print(
                "\n**[SYS] Option found at "
                + datetime.datetime.now().strftime("%H:%M:%S")
            )
            for i, instance in enumerate(instances, 1):
                thread = threading.Thread(
                    target=instance.check_form_options, args=(True,)
                )
                thread.start()
                retry_checking_option_threading_instances.append(thread)
            for thread in retry_checking_option_threading_instances:
                thread.join()

            ticketing_threading_instances.clear()
            solver_threading_instances.clear()
            array_recaptcha_codes.clear()
            len_array_recaptcha_codes = 0
            solving_recaptcha(instances, False)
            for thread in ticketing_threading_instances:
                thread.join()
            print("\n**[SYS] Forms have been submitted.")
            return True
        else:
            print("\n**[SYS] There's no coupon for today. Aborting...")
            return False


def downloading_tickets(instances):
    global ticket_taken_accounts
    print("**[SYS] Downloading the tickets...\n")

    for i, instance in enumerate(instances, 1):
        thread = threading.Thread(target=instance.download_qr_code, args=())
        thread.start()
        downloading_threading_instances.append(thread)
    for thread in downloading_threading_instances:
        thread.join()
    for i, instance in enumerate(instances, 1):
        if instance.ticket_taken:
            ticket_taken_accounts += 1

    print("\n**[SYS] Tickets have been downloaded.")


def uploading_data(instances):
    print("**[SYS] Uploading data to database...")

    for i, instance in enumerate(instances, 1):
        if instance.ticket_taken:
            quota = instance.available_quota - 1
            if quota > 0:
                ssoEditAccountByID(instance.account_id, {"available_quota": quota})
            else:
                ssoEditAccountByID(
                    instance.account_id,
                    {"available_quota": quota, "enable_submit": False},
                )
        couponsAddEntry(
            instance.account_id,
            instance.kupon_id,
            instance.tanggal_id,
            instance.ticket_taken,
            instance.coupon_file,
            instance.validation_url,
            instance.pick_location,
            instance.found_option_at,
            instance.send_at,
            instance.has_sent_at,
            None,
        )

    print("**[SYS] Data uploaded.")


if __name__ == "__main__":
    if current_time >= closed_time:
        print("Sorry, the submission is closed")
        sys.exit()

    print("**[SYS] Bot system starting...")

    try:
        objects = load_accounts()
        checking_login_accounts(objects)
        solving_recaptcha(objects)
        if submitting_forms(objects):
            downloading_tickets(objects)
            uploading_data(objects)

        print(
            f"**[SYS] Loaded accounts: {len(objects)}. Logged in: {logged_in_accounts}. Tickets taken: {ticket_taken_accounts}"
        )
        print("**[SYS] Bot system finished!")
    except Exception as e:
        print(f"**[SYS] FATAL: {type(e).__name__}: {e}")
        errorLogAdd("python:main", e)
        raise
