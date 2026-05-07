const { format } = require("date-fns");
const { locationName, statusName, snapshotLine } = require("./helpers");

const SYSTEM_VERSION = "v2.26.0503";
const PRICING = "Paket 4x Rp15.000 / 16x Rp50.000";
const LOCATION_LIST_LINE =
  "1. Gedung SA-MWA · 2. Student Center · 3. Pendopo FSM (FPIK) · 4. Audit. Imam Bardjo";

const welcome = (ssoCount) =>
  "Selamat datang di *Sistem UFood!* 🍱\n" +
  "Pengambilan kupon Foodtruck Undip otomatis lewat WhatsApp.\n\n" +
  `*Jumlah Akun Terdaftar:* _${ssoCount} akun_.\n\n` +
  "Cara pakai, aturan & info lengkap: ketik *_ufood_*.";

const ufoodPanduan = () =>
  "*Sistem UFood — Panduan*\n\n" +
  "Auto-ambil kupon Foodtruck Undip dari SSO, kirim QR ke WhatsApp. " +
  "Khusus mahasiswa aktif (*@students.undip.ac.id*).\n\n" +
  "*Cara pakai:*\n" +
  "1. Daftar: *_ufood daftar {email} {password}_*\n" +
  "2. (opsional) Atur lokasi: *_ufood akun 1 lokasi_*\n" +
  "3. Tunggu kupon hari kerja jam 10:00 WIB.\n\n" +
  "*Paket beli:*\n" +
  "- 2x Free (akun pertama)\n" +
  "- 4x Rp15.000\n" +
  "- 16x Rp50.000\n\n" +
  "*Aturan singkat:*\n" +
  "- Maks 3 akun/WA · 30 submit/lokasi\n" +
  "- Kuota _tidak dikurangi_ jika gagal ambil kupon\n" +
  "- Data SSO dienkripsi, sistem pribadi (bukan resmi Undip)\n\n" +
  "Daftar perintah: *_commands_*  ·  Bantuan admin: *_ping_*";

const commandsList = () =>
  "*Perintah UFood*\n\n" +
  "_Ganti angka *1* sesuai nomor akun (`ufood akun` untuk cek)_\n\n" +
  "*Mulai:*\n" +
  "`ufood` • `ufood daftar {email} {password}`\n\n" +
  "*Akun:*\n" +
  "`ufood akun` • `ufood akun 1`\n" +
  "`ufood akun 1 beli` — beli kuota (QRIS)\n" +
  "`ufood akun 1 ganti {email} {password}` — ganti kredensial\n" +
  "`ufood akun 1 lokasi` / `lokasi 1` — lihat/ubah lokasi\n" +
  "`ufood akun 1 submit` / `submit enable` / `submit disable`\n" +
  "`ufood akun 1 hapus`\n\n" +
  "*Lainnya:*\n" +
  "`ufood status` • `ufood subscribe` / `unsubscribe` • `ping`";

const daftarFormat = () =>
  "Format: *_ufood daftar {email} {password}_*\n\n" +
  "Contoh:\n*_ufood daftar akun@test.id abc123_*\n\n" +
  "Email harus berakhiran *@students.undip.ac.id*.";

const daftarMissingPassword = (msgBody) =>
  "Anda hanya memasukkan email. Tambahkan password.\n\n" +
  "Format: *_ufood daftar {email} {password}_*\n\n" +
  `*_${msgBody} rahasia123_*`;

const daftarBadEmail = () =>
  "Email harus berakhiran *@students.undip.ac.id* (akun SSO mahasiswa Undip).\n\n" +
  "Contoh:\n*_ufood daftar akun@test.id abc123_*";

const daftarMaxAccounts = (max) =>
  `Maksimal pendaftaran hanya ${max} akun per nomor WhatsApp.\n\n` +
  "Hapus salah satu akun: *_ufood akun 1 hapus_* _(ganti 1 sesuai nomor akun)_";

const daftarSuccessWithTrial = ({
  index,
  email,
  location,
  oldQuota,
  newQuota,
  submitEnabled,
}) =>
  `✅ *Akun ${index} terdaftar + Free Trial 2x!* 🎁\n\n` +
  `*Email:* _${email}_\n` +
  `*Lokasi:* _${locationName(location)}_\n` +
  `*Kuota:* _${oldQuota}x_ → _${newQuota}x_\n` +
  `*Submit:* _${submitEnabled ? "Enabled ✅" : "Disabled (lokasi penuh)"}_\n\n` +
  (submitEnabled
    ? ""
    : `Pilih lokasi lain: *_ufood akun ${index} lokasi_*\n\n`) +
  `Beli kuota: *_ufood akun ${index} beli_*\n\n` +
  "⏳ Login SSO sedang diproses, notif dalam <1 menit.";

const daftarSuccessNoTrial = ({ index, email, location, reason }) =>
  `✅ *Akun ${index} terdaftar*\n\n` +
  `*Email:* _${email}_\n` +
  `*Lokasi:* _${locationName(location)}_\n` +
  `*Kuota:* _0x_ · *Submit:* _Disabled_\n\n` +
  (reason === "trial_used"
    ? "ℹ️ Free trial sudah digunakan di nomor ini.\n\n"
    : reason === "not_first"
      ? "ℹ️ Free trial hanya untuk akun pertama.\n\n"
      : "") +
  `Beli kuota: *_ufood akun ${index} beli_*\n\n` +
  "⏳ Login SSO sedang diproses, notif dalam <1 menit.";

const loginResult = (idx, email, statusCode) => {
  switch (statusCode) {
    case 1:
      return (
        `✅ *Akun ${idx} (${email}) berhasil login!*\n\n` +
        "Akun siap untuk pengambilan kupon otomatis."
      );
    case 4:
      return (
        `❌ *Akun ${idx} (${email}) gagal login: password salah.*\n\n` +
        `Ganti password dengan: *_ufood akun ${idx} ganti {email} {password_baru}_*`
      );
    case 5:
      return (
        `❌ *Akun ${idx} (${email}) gagal login: email tidak terdaftar di SSO Undip.*\n\n` +
        `Ganti email dengan: *_ufood akun ${idx} ganti {email_baru} {password}_*`
      );
    case 2:
    case 6:
      return (
        `❌ *Akun ${idx} (${email}) terdeteksi sudah lulus / bukan mahasiswa aktif Undip.*\n\n` +
        "SSO Undip menolak akses untuk akun ini. Sistem layanan ini khusus mahasiswa aktif."
      );
    case 7:
      return (
        `⚠️ Login *Akun ${idx} (${email})* gagal — server SSO Undip sedang error.\n` +
        "Sistem akan coba ulang otomatis tiap 15 menit."
      );
    case 8:
    case -1:
    default:
      return (
        `⚠️ Login *Akun ${idx} (${email})* mengalami kendala teknis.\n` +
        "Sistem akan coba ulang otomatis tiap 15 menit. " +
        `Cek status terbaru via *_ufood akun_*.`
      );
  }
};

const akunListEmpty = () =>
  "Belum ada akun terdaftar. Mulai dengan:\n\n" +
  "*_ufood daftar {email} {password}_*";

const akunCouponLabel = ({ takenSuccessToday, anyTakenToday, weekday }) => {
  if (!weekday) return "Di Luar Jadwal";
  if (anyTakenToday) return takenSuccessToday ? "Dapat" : "Tidak Dapat";
  return "Menunggu";
};

const akunListItem = (idx, account, kuponLabel) =>
  `*${idx}) ${account.email}*\n` +
  `*Login:* _${format(new Date(account.updated_at), "dd/MM/yyyy HH:mm:ss")}_\n` +
  `*Status:* _${statusName(account.status_login)}_\n` +
  `*Kupon:* _${kuponLabel}_\n` +
  `*Lokasi:* _${locationName(account.pick_location)}_\n` +
  `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n` +
  `*Kuota:* _${account.available_quota}x_`;

const akunListFooter = (totalAccounts) => {
  const example = totalAccounts > 1 ? `1 sampai ${totalAccounts}` : "1";
  return (
    "*Konfigurasi per akun*\n" +
    `_Ganti angka *1* di bawah dengan nomor akun Anda (${example})._\n\n` +
    "- Detail akun: *_ufood akun 1_*\n" +
    "- Beli kuota: *_ufood akun 1 beli_*\n" +
    "- Atur lokasi: *_ufood akun 1 lokasi_*\n" +
    "- Atur submit: *_ufood akun 1 submit_*\n" +
    "- Ganti email/password: *_ufood akun 1 ganti {email} {password}_*\n" +
    "- Hapus akun: *_ufood akun 1 hapus_*\n\n" +
    "Lihat semua perintah: *_commands_*"
  );
};

const akunDetail = (idx, account) =>
  `*${idx}) ${account.email}*\n` +
  `*Lokasi:* _${locationName(account.pick_location)}_\n` +
  `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n` +
  `*Kuota:* _${account.available_quota}x_\n\n` +
  "*Tindakan:*\n" +
  `- Beli kuota: *_ufood akun ${idx} beli_*\n` +
  `- Ubah lokasi: *_ufood akun ${idx} lokasi_*\n` +
  `- Atur submit: *_ufood akun ${idx} submit_*\n` +
  `- Ganti email/password: *_ufood akun ${idx} ganti {email} {password}_*\n` +
  `- Hapus akun: *_ufood akun ${idx} hapus_*`;

const akunNotFound = (n) => `Anda tidak memiliki akun nomor (${n}).`;

const lokasiSnapshot = (idx, account, oldLoc, newLoc) =>
  `✅ *Akun ${idx} (${account.email})*\n\n` +
  snapshotLine("Lokasi", locationName(oldLoc), locationName(newLoc));

const LOCATION_OPTIONS_BLOCK =
  "*1.* Gedung SA-MWA\n" +
  "*2.* Student Center\n" +
  "*3.* Pendopo FSM (FPIK)\n" +
  "*4.* Audit. Imam Bardjo";

const lokasiInvalid = () =>
  "Lokasi tidak tersedia. Pilihan:\n\n" + LOCATION_OPTIONS_BLOCK;

const lokasiFullActive = () =>
  "⚠️ Lokasi tujuan sudah penuh dan submit Anda sedang aktif.\n\n" +
  "Pantau ketersediaan dengan *_ufood status_* atau pilih lokasi lain.";

const lokasiFormat = (idx, account) =>
  `*${idx}) ${account.email}*\n` +
  `*Lokasi:* _${locationName(account.pick_location)}_\n\n` +
  "Pilih lokasi:\n" +
  LOCATION_OPTIONS_BLOCK +
  `\n\nContoh:\n*_ufood akun ${idx} lokasi 3_*`;

const submitSnapshot = (idx, account, oldVal, newVal) =>
  `✅ *Akun ${idx} (${account.email})*\n\n` +
  snapshotLine(
    "Submit",
    oldVal ? "Enabled" : "Disabled",
    newVal ? "Enabled" : "Disabled",
  );

const submitNoQuota = (idx) =>
  "Kuota pengambilan akun ini sudah habis.\n\n" +
  `Beli kuota: *_ufood akun ${idx || 1} beli_*`;

const submitLocationFull = (idx) =>
  "⚠️ Lokasi akun ini sudah penuh (30/30). Submit tidak diaktifkan.\n\n" +
  `Pilih lokasi lain via *_ufood akun ${idx || 1} lokasi_* — cek ` +
  "ketersediaan dengan *_ufood status_*.";

const submitFormat = (idx, account) =>
  `*${idx}) ${account.email}*\n` +
  `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n\n` +
  `Aktifkan: *_ufood akun ${idx} submit enable_*\n` +
  `Nonaktifkan: *_ufood akun ${idx} submit disable_*`;

const gantiSnapshot = (idx, account, oldEmail, newEmail) =>
  `✅ *Akun ${idx}*\n\n` +
  `*Email:* _${newEmail}_\n` +
  "*Password:* _(sudah diganti)_\n\n" +
  "Status login akan terupdate dalam <30 menit.";

const gantiFormat = (idx) =>
  `Format: *_ufood akun ${idx} ganti {email} {password}_*\n\n` +
  `Contoh:\n*_ufood akun ${idx} ganti akun@test.id abc123_*`;

const beliQrisCaption = (idx, account, ssoCount) =>
  `*${idx}) ${account.email}*\n` +
  `*Kuota saat ini:* _${account.available_quota}x_\n\n` +
  "Bayar via *QRIS Mallocation* di atas, lalu kirim *screenshot bukti bayar* ke chat ini.\n\n" +
  "*Pilihan paket:*\n" +
  "- 4x — Rp15.000\n" +
  "- 16x — Rp50.000\n\n" +
  "_Kuota tidak dikurangi jika sistem gagal ambil kupon._";

const imageNoPaySelection = () =>
  "Belum memilih akun pembelian.\n\n" +
  "Ketik *_ufood akun 1 beli_* _(ganti 1 sesuai nomor akun)_ untuk dapat QRIS, " +
  "lalu kirim ulang bukti bayar.";

const imageNoAccounts = () =>
  "Belum punya akun terdaftar. Daftar dulu:\n\n" +
  "*_ufood daftar {email} {password}_*";

const paymentReceived = () =>
  "⏳ Bukti pembayaran diterima. Menunggu konfirmasi admin " +
  "(biasanya <30 menit jam kerja).";

const paymentSuccess = ({ email, oldQuota, newQuota, submitEnabled }) =>
  `👍 Pembayaran dikonfirmasi.\n\n*Akun _${email}_*\n` +
  snapshotLine("Kuota", `${oldQuota}x`, `${newQuota}x`) +
  "\n" +
  (submitEnabled
    ? "*Submit:* _Enabled_ (lokasi masih ada slot)"
    : "_(submit tetap pada status sebelumnya — cek dengan *_ufood akun_*)_") +
  "\n\nCek akun: *_ufood akun_*";

const paymentSuccessLocationFull = ({ email, newQuota }) =>
  `👍 Pembayaran dikonfirmasi.\n*Akun _${email}_* memiliki kuota _${newQuota}x_.\n\n` +
  "Kuota lokasi sudah penuh — submit otomatis tidak diaktifkan.\n\n" +
  "Pilih lokasi lain: *_ufood akun 1 lokasi_* _(ganti 1 sesuai nomor akun)_";

const paymentRejected = () =>
  "❌ Pembayaran tidak dikonfirmasi. Silakan ulangi pembayaran atau " +
  "hubungi admin via *_ping_*.";

const hapusConfirm = (idx, account) =>
  `*${idx}) ${account.email}*\n` +
  `*Lokasi:* _${locationName(account.pick_location)}_\n` +
  `*Kuota tersisa:* _${account.available_quota}x_\n\n` +
  `⚠️ Penghapusan akan *menghilangkan kuota tersisa _${account.available_quota}x_*.\n\n` +
  "Yakin? Ketik *_ya_* untuk konfirmasi atau *_batal_* untuk membatalkan.";

const hapusSuccess = (email, remainingCount) =>
  `✅ Akun *_${email}_* berhasil dihapus.\n\n` +
  (remainingCount > 0
    ? `Akun tersisa: *${remainingCount}* (penomoran ulang otomatis).`
    : "Tidak ada akun lain. Daftar baru: *_ufood daftar {email} {password}_*");

const hapusBatal = () => "Penghapusan akun dibatalkan.";

const pendingHint = (action) => {
  const label =
    action && action.startsWith("delete")
      ? "*penghapusan akun*"
      : action === "ping"
        ? "*ping admin*"
        : "*aksi sebelumnya*";
  return (
    `Anda sedang dalam konfirmasi ${label}.\n\n` +
    "Ketik *_ya_* untuk lanjut, atau *_batal_* untuk membatalkan.\n\n" +
    "Otomatis dibatalkan setelah 5 menit jika tidak ada respon."
  );
};

const pingConfirm = () =>
  "Akan menghubungi admin. Anda akan dinonaktifkan dari bot dan " +
  "chat akan berlanjut langsung dengan admin sampai admin mengembalikan " +
  "status. *Auto-aktif kembali setelah 3 jam* jika tidak ada respon admin.\n\n" +
  "Ketik *_ya_* untuk lanjut atau *_batal_* untuk membatalkan.";

const pingActive = () =>
  "✅ Bot dinonaktifkan. Sampaikan keluhan Anda — admin akan membalas " +
  "langsung di chat ini. Bot akan otomatis aktif lagi setelah 3 jam " +
  "jika tidak ada respon admin.";

const pingBatal = () => "Ping dibatalkan.";

const pingResolved = () =>
  "✅ Bot diaktifkan kembali. Ketik *_ufood akun_* untuk lanjut.";

const pingExpired = () =>
  "Mode bantuan admin sudah selesai (auto-expire 3 jam). Bot aktif kembali. " +
  "Ketik *_ufood_* untuk lanjut.";

const subscribed = () => "✅ Notifikasi update aktif.";
const unsubscribed = () =>
  "✅ Notifikasi update dimatikan. Aktifkan kembali dengan *_ufood subscribe_*.";

const status = ({
  totalCoupons,
  totalUsers,
  totalSso,
  perLocation,
  pickupToday,
  latestRunDate,
  maxPerLocation,
}) => {
  const lines = [
    `*Versi Sistem:* ${SYSTEM_VERSION}`,
    `*Total Pengambilan:* _${totalCoupons} kupon_`,
    `*Total Pengguna:* _${totalUsers} pengguna_`,
    `*Total Akun SSO:* _${totalSso} akun_`,
    "",
    "*Akun Aktif Submit:*",
  ];
  for (const loc of [1, 2, 3, 4]) {
    const n = perLocation[loc];
    const tag = n >= maxPerLocation ? " ❌" : "";
    lines.push(`_${locationName(loc)}:_ ${n}/${maxPerLocation}${tag}`);
  }
  let pickupHeader = "*Pengambilan Terakhir:*";
  if (latestRunDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const runDay = new Date(latestRunDate);
    runDay.setHours(0, 0, 0, 0);
    if (runDay.getTime() === today.getTime()) {
      pickupHeader = "*Pengambilan Hari Ini:*";
    } else {
      pickupHeader = `*Pengambilan Terakhir (${format(latestRunDate, "dd/MM/yyyy")}):*`;
    }
  }
  lines.push("", pickupHeader);
  for (const loc of [1, 2, 3, 4]) {
    const { success, total } = pickupToday[loc];
    lines.push(`_${locationName(loc)}:_ ${success}/${total}`);
  }
  return lines.join("\n");
};

const unknownCommand = () =>
  "Perintah tidak dikenali. Ketik *_ufood_* untuk panduan, atau *_ping_* " +
  "untuk hubungi admin.";

const commandError = () =>
  "Terjadi kendala sistem. Coba ulangi atau ketik *_ping_* untuk hubungi admin.";

const validationCapacityFull = () =>
  "Semua lokasi sudah penuh (30/30). Pantau dengan *_ufood status_* dan " +
  "coba lagi nanti.";

// Cron / system-initiated messages

const couponReceived = ({ email, quota }) =>
  `*Akun:* ${email}\n*Kuota:* _${quota}x_`;

const couponMissed = (email) =>
  `Akun *_${email}_* tidak mendapatkan kupon hari ini. ` +
  "Kuota *tidak* dikurangi.";

const reLoginPasswordWrong = (email, idx = 1) =>
  `❌ *${email}* — password salah.\n\n` +
  `Ganti: *_ufood akun ${idx} ganti {email} {password_baru}_*`;

const reLoginEmailWrong = (email, idx = 1) =>
  `❌ *${email}* — email salah.\n\n` +
  `Ganti: *_ufood akun ${idx} ganti {email_baru} {password}_*`;

const reLoginSuccess = (email) => `✅ *${email}* — berhasil login.`;

const reminderUnsubmitted = (email, quota, idx = 1) =>
  `*Reminder*\n\n*${email}* masih punya _${quota}x_ kuota tapi submit belum aktif.\n\n` +
  `Aktifkan: *_ufood akun ${idx} submit enable_*`;

const reminderQuotaEmpty = (email, idx = 1) =>
  `*Reminder*\n\n*${email}* kuota habis.\n\n` +
  `Beli: *_ufood akun ${idx} beli_*`;

const adminErrors = (rows) => {
  if (!rows || rows.length === 0)
    return "_Tidak ada error tercatat di error_logs._";
  const header = `*Last ${rows.length} errors* (terbaru di atas)\n`;
  const items = rows.map((r) => {
    const t = r.created_at
      ? format(new Date(r.created_at), "dd/MM HH:mm")
      : "?";
    const wa = r.wa_number ? r.wa_number.replace("@c.us", "") : "system";
    const cmd = (r.command || "").slice(0, 30);
    const err = (r.error_message || "").slice(0, 80);
    return `\`${t}\` *${wa}* → \`${cmd}\`\n   ${err}`;
  });
  return header + items.join("\n\n");
};

const adminHelp = () =>
  "*Admin Commands*\n\n" +
  "*Operasional:*\n" +
  "- *_!login_* — trigger SSO re-login; ringkasan dikirim ke admin setelah selesai\n" +
  "- *_!kupon_* — trigger pengiriman kupon hari ini\n" +
  "- *_!kirim {pesan}_* — broadcast ke semua user subscribed\n" +
  "- *_!kirim_inactive {pesan}_* — broadcast ke unsubscribed aktif 30 hari terakhir\n" +
  "- *_!unread_* — replay unread messages ke router\n\n" +
  "*Monitoring:*\n" +
  "- *_!stats_* — stats sistem (users, SSO, submit/lokasi, errors)\n" +
  "- *_!coupon_* — ringkasan run kupon hari ini\n" +
  "- *_!coupon YYYY-MM-DD_* — ringkasan run tanggal tertentu\n" +
  "- *_!errors_* — 10 error terakhir (Node + Python)\n" +
  "- *_!errors N_* — N error terakhir (max 50)\n\n" +
  "*Reply ke pesan:*\n" +
  "- Reply image bukti bayar dengan *_ya 0_* — aktifkan Free Trial 2x\n" +
  "- Reply image bukti bayar dengan *_ya 4_* / *_ya 16_* — tambah kuota\n" +
  "- Reply image bukti bayar dengan *_tidak_* — tolak pembayaran\n" +
  "- Reply pesan ping dengan *_sudah_* — resolve ping handoff\n\n" +
  "*Hadiah:*\n" +
  "- *_!gift N_* — tambah _N_ kupon ke akun SSO milik user subscribed (max 100)\n" +
  "- *_!gift_inactive N_* — tambah _N_ kupon ke akun SSO milik unsubscribed aktif 30 hari\n\n" +
  "*Maintenance:*\n" +
  "- *_!relogin_failed_* — reset akun salah password → 0, cron retry berikutnya\n" +
  "- *_!migrate_lid_* — proactive merge semua @lid rows ke @c.us via WA Store\n" +
  "- *_!sweep_inactive_* — unsubscribe user dorman (>90 hari)\n" +
  "- *_!dedupe_* — merge duplikat akun (email sama di 1 WA)";

const giftBonus = (n, accountCount) =>
  `🎁 *Bonus Kupon*\n\n` +
  `Anda dapat *${n}x kupon bonus* untuk *${accountCount} akun* terdaftar Anda. ` +
  `Selamat menikmati 🍱\n\n` +
  `Cek detail: *_ufood akun_*`;

const adminCouponRun = (r) => {
  const locNames = {
    1: "SA-MWA",
    2: "Student Center",
    3: "Pendopo FSM (FPIK)",
    4: "Audit. Imam Bardjo",
    5: "ART Center",
  };
  const successRate = r.total > 0 ? Math.round((r.success / r.total) * 100) : 0;
  let perLoc = "";
  for (const loc of Object.keys(r.perLocation)) {
    const v = r.perLocation[loc];
    if (v.ok === 0 && v.fail === 0) continue;
    perLoc += `\n_${locNames[loc] || `Lokasi ${loc}`}:_ ${v.ok} ✅ / ${v.fail} ❌`;
  }
  let latency = "";
  if (r.avgFoundLatencyMs !== null) {
    const sec = (r.avgFoundLatencyMs / 1000).toFixed(2);
    latency = `\n*Avg latency H+:* _${sec}s_ (vs 10:00:00)`;
  }
  return (
    `*Hasil Run Kupon — ${r.date}*\n\n` +
    `*Total upaya:* _${r.total}_\n` +
    `*Berhasil:* _${r.success}_ (${successRate}%)\n` +
    `*Gagal:* _${r.failed}_\n` +
    `*Terkirim ke WA:* _${r.sentToWA}_${latency}\n\n` +
    `*Per lokasi:*${perLoc || "\n_(belum ada data)_"}`
  );
};

const adminLoginSummary = ({
  total,
  loggedIn,
  wrongCreds,
  notActive,
  techFail,
  notYet,
}) => {
  const date = format(new Date(), "dd/MM/yyyy HH:mm");
  let body =
    `*Login Akun — ${date}*\n\n` +
    `*Total akun:* _${total}_\n` +
    `*Logged in:* _${loggedIn}_ ✅\n` +
    `*Salah kredensial:* _${wrongCreds}_ ❌\n`;
  if (notActive > 0) body += `*Tidak aktif/lulus:* _${notActive}_ ⛔\n`;
  if (techFail > 0) body += `*Error teknis:* _${techFail}_ ⚠️\n`;
  body += `*Belum login:* _${notYet}_`;
  return body;
};

const adminNewRegistration = ({ wa, email, index, kind, location }) => {
  if (kind === "updated") {
    return (
      `🔁 *Credential Update — Akun ${index}*\n` +
      `*WA:* _${wa}_\n` +
      `*Email:* _${email}_ (password baru)`
    );
  }
  const locNames = {
    1: "SA-MWA",
    2: "Student Center",
    3: "Pendopo FSM (FPIK)",
    4: "Audit. Imam Bardjo",
  };
  return (
    `🆕 *Pendaftaran Baru — Akun ${index}*\n` +
    `*WA:* _${wa}_\n` +
    `*Email:* _${email}_\n` +
    `*Lokasi:* _${locNames[location] || `Lokasi ${location}`}_`
  );
};

const adminGantiCredential = ({ wa, oldEmail, email, index }) =>
  `🔁 *Ganti Kredensial — Akun ${index}*\n` +
  `*WA:* _${wa}_\n` +
  `*Email:* _${oldEmail}_ → _${email}_`;

const adminLoginFailed = ({ idx, email, statusCode }) =>
  `⚠️ *Auto-Login Gagal — Akun ${idx}*\n` +
  `*Email:* _${email}_\n` +
  `*Kode:* _${statusCode === 7 ? "Server SSO error" : "Kendala teknis"}_\n` +
  `_(retry otomatis tiap 15 mnt)_`;

const adminStats = (s) =>
  `*Sistem Stats — admin*\n\n` +
  `*Pengguna terdaftar:* _${s.totalRegistered}_ ` +
  `(${s.subscribedCount} subscribed, ${s.blockedCount} blocked)\n` +
  `*Akun SSO:* _${s.totalSso}_ (${s.loggedInSso} logged in)\n\n` +
  `*Hari ini:* _${s.couponsTodaySuccess}_ kupon dapat / ` +
  `_${s.attemptsToday}_ upaya\n` +
  `*30 hari terakhir:* _${s.newUsers30d}_ pengguna baru, ` +
  `_${s.coupons30d}_ kupon dibagikan\n\n` +
  `*Submit aktif per lokasi:*\n` +
  `_SA-MWA:_ ${s.submitPerLocation[1]}/30 · ` +
  `_Student Center:_ ${s.submitPerLocation[2]}/30\n` +
  `_Pendopo FSM:_ ${s.submitPerLocation[3]}/30 · ` +
  `_Audit. Imam Bardjo:_ ${s.submitPerLocation[4]}/30\n\n` +
  `*Free Trial digunakan:* _${s.freeTrialUsed}_ pengguna\n` +
  `*Errors 24 jam terakhir:* _${s.errorsLast24h}_ ` +
  `(cek: *_!errors_*)`;

module.exports = {
  SYSTEM_VERSION,
  welcome,
  ufoodPanduan,
  commandsList,
  daftarFormat,
  daftarMissingPassword,
  daftarBadEmail,
  daftarMaxAccounts,
  daftarSuccessWithTrial,
  daftarSuccessNoTrial,
  loginResult,
  akunListEmpty,
  akunCouponLabel,
  akunListItem,
  akunListFooter,
  akunDetail,
  akunNotFound,
  lokasiSnapshot,
  lokasiInvalid,
  lokasiFullActive,
  lokasiFormat,
  submitSnapshot,
  submitNoQuota,
  submitLocationFull,
  submitFormat,
  gantiSnapshot,
  gantiFormat,
  beliQrisCaption,
  imageNoPaySelection,
  imageNoAccounts,
  paymentReceived,
  paymentSuccess,
  paymentSuccessLocationFull,
  paymentRejected,
  hapusConfirm,
  hapusSuccess,
  hapusBatal,
  pendingHint,
  pingConfirm,
  pingActive,
  pingBatal,
  pingResolved,
  pingExpired,
  subscribed,
  unsubscribed,
  status,
  unknownCommand,
  commandError,
  validationCapacityFull,
  couponReceived,
  couponMissed,
  reLoginPasswordWrong,
  reLoginEmailWrong,
  reLoginSuccess,
  reminderUnsubmitted,
  reminderQuotaEmpty,
  adminErrors,
  adminStats,
  adminCouponRun,
  adminHelp,
  giftBonus,
  adminLoginSummary,
  adminNewRegistration,
  adminGantiCredential,
  adminLoginFailed,
};
