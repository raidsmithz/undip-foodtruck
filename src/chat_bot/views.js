const { format } = require("date-fns");
const { locationName, statusName, snapshotLine } = require("./helpers");

const SYSTEM_VERSION = "v2.26.0503";
const PRICING = "Paket 4x Rp15.000 / 16x Rp50.000";
const LOCATION_LIST_LINE =
  "1. Gedung SA-MWA · 2. Student Center · 3. Audit. FPIK · 4. Audit. Imam Bardjo";

const welcome = (ssoCount) =>
  "Selamat datang di *Sistem UFood!* 🍱\n" +
  "Pengambilan kupon Foodtruck Undip otomatis lewat WhatsApp.\n\n" +
  `*Jumlah Akun Terdaftar:* _${ssoCount} akun_.\n\n` +
  "*Cara pakai:*\n" +
  "1. Daftar akun: *_ufood daftar {email} {password}_*\n" +
  "   _Otomatis dapat *Free Trial 2x* untuk akun pertama_\n" +
  "2. Atur lokasi (opsional): *_ufood akun 1 lokasi {1-4}_*\n" +
  "3. Tunggu kupon hari kerja jam 10:00.\n\n" +
  "Aturan & info lengkap: ketik *_ufood_*.";

const ufoodPanduan = () =>
  "*Sistem UFood — Panduan*\n\n" +
  "Sistem pribadi (bukan layanan resmi Undip) yang mengambil kupon " +
  "Foodtruck otomatis dari portal SSO atas nama Anda dan mengirim QR-nya " +
  "ke WhatsApp. Khusus mahasiswa aktif Undip dengan email " +
  "*@students.undip.ac.id*.\n\n" +
  "*Cara pakai:*\n" +
  "1. Daftar akun: *_ufood daftar {email} {password}_*\n" +
  "   _(otomatis dapat *Free Trial 2x* untuk akun pertama)_\n" +
  "2. Atur lokasi (opsional): *_ufood akun 1 lokasi {1-4}_*\n" +
  "3. Tunggu kupon dikirim setiap hari kerja sekitar jam 10:00 WIB.\n\n" +
  "*Aturan:*\n" +
  "• Sistem pribadi, bukan organisasi resmi Undip\n" +
  "• Maks 3 akun per nomor WA, 30 akun aktif submit per lokasi (total 120)\n" +
  "• Kuota *tidak* dikurangi jika sistem gagal ambil kupon\n" +
  "• Data SSO dienkripsi, hanya dipakai untuk ambil kupon\n" +
  "• Dilarang menyebar hoax, kasar, atau menyalahgunakan sistem\n\n" +
  `*Harga (setelah trial habis):* ${PRICING}\n\n` +
  `*Lokasi:* ${LOCATION_LIST_LINE}\n\n` +
  "Daftar perintah lengkap: *_commands_*  ·  Bantuan: *_ping_*";

const commandsList = () =>
  "*Daftar Perintah UFood*\n\n" +
  "*Mulai:*\n" +
  "• *_ufood_* — panduan & aturan\n" +
  "• *_ufood daftar {email} {password}_* — daftar akun (free trial 2x)\n\n" +
  "*Kelola akun:*\n" +
  "• *_ufood akun_* — daftar akun + status\n" +
  "• *_ufood akun N_* — detail akun ke-N\n" +
  "• *_ufood akun N beli_* — beli kuota (QRIS)\n" +
  "• *_ufood akun N ganti {email} {password}_* — ganti kredensial\n" +
  "• *_ufood akun N lokasi {1-4}_* — atur lokasi pengambilan\n" +
  "• *_ufood akun N submit {enable|disable}_* — atur submit otomatis\n" +
  "• *_ufood akun N hapus_* — hapus akun (perlu konfirmasi *ya*)\n\n" +
  "*Lainnya:*\n" +
  "• *_ufood status_* — statistik & kuota lokasi\n" +
  "• *_ufood subscribe_* / *_ufood unsubscribe_* — toggle notifikasi update\n" +
  "• *_ping_* — minta bantuan admin (perlu konfirmasi *ya*)";

const daftarFormat = () =>
  "Format: *_ufood daftar {email} {password}_*\n" +
  "Contoh: *_ufood daftar admin@students.undip.ac.id rahasia123_*\n" +
  "Email harus berakhiran *@students.undip.ac.id*.";

const daftarMissingPassword = (msgBody) =>
  "Anda hanya memasukkan email. Tambahkan password.\n\n" +
  "Format: *_ufood daftar {email} {password}_*\n" +
  `Contoh: *_${msgBody} rahasia123_*`;

const daftarBadEmail = () =>
  "Email harus berakhiran *@students.undip.ac.id* (akun SSO mahasiswa Undip).\n\n" +
  "Contoh: *_ufood daftar admin@students.undip.ac.id rahasia123_*";

const daftarMaxAccounts = (max) =>
  `Maksimal pendaftaran hanya ${max} akun per nomor WhatsApp.\n` +
  "Hapus salah satu akun lewat *_ufood akun N hapus_* untuk daftar akun baru.";

const daftarSuccessWithTrial = ({ index, email, location, oldQuota, newQuota, submitEnabled }) =>
  `✅ *Akun ${index} terdaftar + Free Trial aktif!* 🎁\n\n` +
  `*Email:* _${email}_\n` +
  `*Status:* _Logging In by System_ ⏳\n` +
  `*Lokasi:* _${locationName(location)}_ (otomatis)\n` +
  `*Kuota:* _${oldQuota}x_ → _${newQuota}x_ (Free Trial)\n` +
  `*Submit:* _Disabled_ → _${submitEnabled ? "Enabled" : "Disabled"}_\n\n` +
  "ℹ️ *Free Trial 2x* — sistem akan coba ambil kupon untuk Anda 2 kali. " +
  "Kuota _tidak dikurangi_ kalau sistem gagal dapat kupon. Trial otomatis " +
  "untuk akun pertama, hanya 1x per nomor WA.\n\n" +
  (submitEnabled
    ? `Sistem mulai coba ambil kupon di *${locationName(location)}* besok jam 10:00 WIB.\n\n`
    : `Lokasi *${locationName(location)}* sedang penuh — submit otomatis tidak aktif. ` +
      "Pilih lokasi lain via *_ufood akun N lokasi {1-4}_*.\n\n") +
  `Setelah trial habis, beli kuota: *_ufood akun ${index} beli_* (${PRICING})\n` +
  `Cek akun: *_ufood akun_*  ·  Ubah lokasi: *_ufood akun ${index} lokasi {1-4}_*\n\n` +
  "⏳ *Sistem sedang login ke akun SSO Undip Anda.* " +
  "Notifikasi hasil login akan dikirim dalam <1 menit.";

const daftarSuccessNoTrial = ({ index, email, location, reason }) =>
  `✅ *Akun ${index} terdaftar*\n\n` +
  `*Email:* _${email}_\n` +
  `*Status:* _Logging In by System_ ⏳\n` +
  `*Lokasi:* _${locationName(location)}_ (otomatis)\n` +
  `*Kuota:* _0x_   *Submit:* _Disabled_\n\n` +
  (reason === "trial_used"
    ? "ℹ️ Free trial sudah pernah digunakan di nomor WA ini.\n"
    : reason === "not_first"
    ? "ℹ️ Free trial hanya berlaku untuk akun pertama. Akun ini tidak mendapat trial.\n"
    : "") +
  `\nBeli kuota: *_ufood akun ${index} beli_* (${PRICING})\n` +
  `Atur lokasi: *_ufood akun ${index} lokasi {1-4}_*\n\n` +
  "⏳ *Sistem sedang login ke akun SSO Undip Anda.* " +
  "Notifikasi hasil login akan dikirim dalam <1 menit.";

const loginResult = (idx, email, statusCode) => {
  switch (statusCode) {
    case 1:
      return (
        `✅ *Akun ${idx} (${email}) berhasil login!*\n` +
        "Akun siap untuk pengambilan kupon otomatis."
      );
    case 4:
      return (
        `❌ *Akun ${idx} (${email}) gagal login: password salah.*\n` +
        `Ganti password dengan: *_ufood akun ${idx} ganti {email} {password_baru}_*`
      );
    case 5:
      return (
        `❌ *Akun ${idx} (${email}) gagal login: email tidak terdaftar di SSO Undip.*\n` +
        `Ganti email dengan: *_ufood akun ${idx} ganti {email_baru} {password}_*`
      );
    case 2:
    case 6:
      return (
        `❌ *Akun ${idx} (${email}) terdeteksi sudah lulus / bukan mahasiswa aktif Undip.*\n` +
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
  "Belum ada akun terdaftar. Mulai dengan:\n" +
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

const akunListFooter = () =>
  "*Daftar Perintah Konfigurasi*\n" +
  "Detail akun N: *_ufood akun N_*\n" +
  "Beli kuota: *_ufood akun N beli_*\n" +
  "Ganti email/password: *_ufood akun N ganti {email} {password}_*\n" +
  "Atur lokasi: *_ufood akun N lokasi {1-4}_*\n" +
  "Atur submit: *_ufood akun N submit {enable|disable}_*\n" +
  "Hapus akun: *_ufood akun N hapus_*";

const akunDetail = (idx, account) =>
  `*${idx}) ${account.email}*\n` +
  `*Lokasi:* _${locationName(account.pick_location)}_\n` +
  `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n` +
  `*Kuota:* _${account.available_quota}x_\n\n` +
  "Tambahkan: *_beli_*, *_ganti {email} {password}_*, " +
  "*_lokasi {1-4}_*, *_submit {enable|disable}_*, atau *_hapus_*.";

const akunNotFound = (n) => `Anda tidak memiliki akun nomor (${n}).`;

const lokasiSnapshot = (idx, account, oldLoc, newLoc) =>
  `✅ *Akun ${idx} (${account.email})*\n` +
  snapshotLine("Lokasi", locationName(oldLoc), locationName(newLoc));

const lokasiInvalid = () =>
  "Lokasi tidak tersedia. Pilihan:\n" +
  "*1* Gedung SA-MWA · *2* Student Center · " +
  "*3* Audit. FPIK · *4* Audit. Imam Bardjo";

const lokasiFullActive = () =>
  "⚠️ Lokasi tujuan sudah penuh dan submit Anda sedang aktif.\n" +
  "Pantau ketersediaan dengan *_ufood status_* atau pilih lokasi lain.";

const lokasiFormat = (idx, account) =>
  `*${idx}) ${account.email}*\n` +
  `*Lokasi:* _${locationName(account.pick_location)}_\n\n` +
  "Pilih lokasi:\n" +
  "*1* Gedung SA-MWA · *2* Student Center · " +
  "*3* Audit. FPIK · *4* Audit. Imam Bardjo\n\n" +
  `Contoh: *_ufood akun ${idx} lokasi 3_*`;

const submitSnapshot = (idx, account, oldVal, newVal) =>
  `✅ *Akun ${idx} (${account.email})*\n` +
  snapshotLine(
    "Submit",
    oldVal ? "Enabled" : "Disabled",
    newVal ? "Enabled" : "Disabled"
  );

const submitNoQuota = () =>
  "Kuota pengambilan akun ini sudah habis. Beli kuota dulu: " +
  "*_ufood akun N beli_*.";

const submitLocationFull = () =>
  "⚠️ Lokasi akun ini sudah penuh (30/30). Submit tidak diaktifkan.\n" +
  "Pilih lokasi lain via *_ufood akun N lokasi {1-4}_* — cek " +
  "ketersediaan dengan *_ufood status_*.";

const submitFormat = (idx, account) =>
  `*${idx}) ${account.email}*\n` +
  `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n\n` +
  `Aktifkan: *_ufood akun ${idx} submit enable_*\n` +
  `Nonaktifkan: *_ufood akun ${idx} submit disable_*`;

const gantiSnapshot = (idx, account, oldEmail, newEmail) =>
  `✅ *Akun ${idx}*\n` +
  snapshotLine("Email", oldEmail, newEmail) +
  "\n*Password:* _***_ → _***_   _(akan login ulang otomatis)_\n" +
  "Status login akan terupdate dalam <30 menit.";

const gantiFormat = (idx) =>
  "Format: *_ufood akun N ganti {email} {password}_*\n" +
  `Contoh: *_ufood akun ${idx} ganti baru@students.undip.ac.id passwordbaru_*`;

const beliQrisCaption = (idx, account, ssoCount) =>
  `*${idx}) ${account.email}*\n` +
  `*Kuota saat ini:* _${account.available_quota}x_\n\n` +
  "Lakukan pembayaran via *QRIS Mallocation* di atas, lalu kirim " +
  "*screenshot bukti bayar* ke chat ini.\n\n" +
  "*Pilihan paket:*\n" +
  `⌛ *4x* — Rp15.000 (kuota jadi _${account.available_quota + 4}x_)\n` +
  `⌛ *16x* — Rp50.000 (kuota jadi _${account.available_quota + 16}x_)\n\n` +
  "_Reminder: jika sistem gagal dapat kupon, kuota tidak dikurangi. " +
  "Submit bisa di-enable/disable kapan saja, kuota tersimpan permanen._\n\n" +
  `Cek ketersediaan kuota lokasi: *_ufood status_* (sistem _${ssoCount} akun_).`;

const imageNoPaySelection = () =>
  "Belum memilih akun pembelian. Ketik *_ufood akun N beli_* terlebih " +
  "dahulu untuk dapat QRIS, lalu kirim ulang bukti bayar.";

const imageNoAccounts = () =>
  "Belum punya akun terdaftar. Daftar dulu:\n" +
  "*_ufood daftar {email} {password}_*";

const paymentReceived = () =>
  "⏳ Bukti pembayaran diterima. Menunggu konfirmasi admin " +
  "(biasanya <30 menit jam kerja).";

const paymentSuccess = ({ email, oldQuota, newQuota, submitEnabled }) =>
  `👍 Pembayaran dikonfirmasi.\n*Akun _${email}_*\n` +
  snapshotLine("Kuota", `${oldQuota}x`, `${newQuota}x`) + "\n" +
  (submitEnabled
    ? "*Submit:* _Enabled_ (lokasi masih ada slot)"
    : "_(submit tetap pada status sebelumnya — cek dengan *_ufood akun_*)_") +
  "\n\nCek akun: *_ufood akun_*";

const paymentSuccessLocationFull = ({ email, newQuota }) =>
  `👍 Pembayaran dikonfirmasi.\n*Akun _${email}_* memiliki kuota _${newQuota}x_.\n` +
  "Kuota lokasi sudah penuh — submit otomatis tidak diaktifkan. " +
  "Pilih lokasi lain via *_ufood akun N lokasi {1-4}_*.";

const paymentRejected = () =>
  "❌ Pembayaran tidak dikonfirmasi. Silakan ulangi pembayaran atau " +
  "hubungi admin via *_ping_*.";

const hapusConfirm = (idx, account) =>
  `*${idx}) ${account.email}*\n` +
  `*Lokasi:* _${locationName(account.pick_location)}_\n` +
  `*Kuota tersisa:* _${account.available_quota}x_\n\n` +
  `⚠️ Penghapusan akan *menghilangkan kuota tersisa _${account.available_quota}x_*.\n` +
  "Yakin? Ketik *_ya_* untuk konfirmasi atau *_batal_* untuk membatalkan.\n" +
  "_(otomatis dibatalkan setelah 5 menit jika tidak ada balasan)_";

const hapusSuccess = (email, remainingCount) =>
  `✅ Akun *_${email}_* berhasil dihapus.\n` +
  (remainingCount > 0
    ? `Akun tersisa: *${remainingCount}* (penomoran ulang otomatis).`
    : "Tidak ada akun lain. Daftar baru: *_ufood daftar {email} {password}_*");

const hapusBatal = () => "Penghapusan akun dibatalkan.";

const pendingHint = (action) => {
  const label = action && action.startsWith("delete")
    ? "*penghapusan akun*"
    : action === "ping"
    ? "*ping admin*"
    : "*aksi sebelumnya*";
  return (
    `Anda sedang dalam konfirmasi ${label}.\n` +
    "Ketik *_ya_* untuk lanjut, atau *_batal_* untuk membatalkan. " +
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
  lines.push("", "*Pengambilan Hari Ini:*");
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

const reLoginPasswordWrong = (email) =>
  `Akun *_${email}_* password salah! ` +
  "Ganti password dengan: *_ufood akun N ganti {email} {password_baru}_*";

const reLoginEmailWrong = (email) =>
  `Akun *_${email}_* email salah! ` +
  "Ganti email dengan: *_ufood akun N ganti {email_baru} {password}_*";

const reLoginSuccess = (email) =>
  `Akun *_${email}_* berhasil login by sistem!`;

const reminderUnsubmitted = (email, quota) =>
  `*Reminder*\nAkun *_${email}_* masih memiliki kuota sebanyak ${quota}x ` +
  "dan belum mengaktifkan submit otomatis!\n" +
  "Aktifkan dengan *_ufood akun N submit enable_*.";

const reminderQuotaEmpty = (email) =>
  `*Reminder*\nAkun *_${email}_* tidak memiliki kuota. ` +
  "Beli kuota: *_ufood akun N beli_*.";

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
};
