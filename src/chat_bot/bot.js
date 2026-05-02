const {
  Client,
  LocalAuth,
  RemoteAuth,
  MessageTypes,
  MessageMedia,
} = require("whatsapp-web.js");
const puppeteer = require('puppeteer');
const qrcode_terminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const { format } = require("date-fns");
const iconv = require("iconv-lite");
const dotenv = require("dotenv");
const schedule = require("node-schedule");
const TelegramBot = require("node-telegram-bot-api");
const loginAccounts = require("../undip_login/login_accounts");
const {
  registeredNewAddAccount,
  registeredAddAccountID,
  registeredRemoveAccountID,
  registeredGetSSOIDS,
  registeredCountSSOIDS,
  registeredGetWANumberBySSOID,
  registeredGetAccount,
  registeredGetPaySSOID,
  registeredEditPaySSOID,
  registeredTotalAccounts,
  waMsgAddAccount,
  waMsgEditMessages,
  waMsgGetLastMessages,
  waMsgEditConfirmation,
  waMsgGetConfirmation,
  waMsgEditBlocked,
  waMsgGetBlocked,
  waMsgEditRulesAccepted,
  waMsgGetRulesAccepted,
  waMsgGetFreeTrialStatus,
  waMsgEditFreeTrialStatus,
  waMsgGetAllWANumber,
  ssoCountTotalAccounts,
  ssoAddAccount,
  ssoGetAccount,
  ssoDeleteAccount,
  ssoEditAccountEmailPassword,
  ssoEditAccountLocation,
  ssoEditAccountQuota,
  ssoGetAccountQuota,
  ssoEditAccountEnableSubmit,
  ssoEditAccountByID,
  ssoEditAccountReminded,
  couponsAddEntry,
  couponsCountTakenEntries,
  couponsCheckTakenToday,
  couponsUpdateWASent,
  couponsCountLatestEntriesLocation,
  couponsGetAllEntriesToday,
  getCombinedSSOAccounts,
  getFalseSubmissionAccountsToday,
  getCountSubmission,
} = require("../models/functions");

const { MongoStore } = require("wwebjs-mongo");
const mongoose = require("mongoose");
dotenv.config();

const times = [
  "5 10 * * 1-5",
  "6 10 * * 1-5",
  "7 10 * * 1-5",
  "8 10 * * 1-5",
  "9 10 * * 1-5",
  "10 10 * * 1-5",
  "15 10 * * 1-5",
  "20 10 * * 1-5",
  "25 10 * * 1-5",
  "30 10 * * 1-5",
  "35 10 * * 1-5",
  "40 10 * * 1-5",
  "45 10 * * 1-5",
  "50 10 * * 1-5",
  "55 10 * * 1-5",
  "0 11 * * 1-5",
  "5 11 * * 1-5",
];
times.forEach((time) => {
  schedule.scheduleJob(time, sendCoupons);
});
schedule.scheduleJob("15,45 * * * *", doLoginAccounts);
schedule.scheduleJob("0 7 * * 1-4", reminderActivationSubmission);

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || "";
const ADMIN_WHATSAPP_SELF = process.env.ADMIN_WHATSAPP_SELF || "";
const token = process.env.TELEGRAM_TOKEN || "";
const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_EXECUTABLE_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CHROME_HEADLESS =
  (process.env.CHROME_HEADLESS || "false").toLowerCase() === "true";

if (!ADMIN_WHATSAPP || !ADMIN_WHATSAPP_SELF) {
  console.warn(
    "[bot] ADMIN_WHATSAPP / ADMIN_WHATSAPP_SELF not set in .env — admin flows will be disabled."
  );
}
// const bot = new TelegramBot(token, {
//   polling: true,
//   request: {
//     agentOptions: {
//       keepAlive: true,
//       family: 4,
//     },
//   },
// });
// const chatId = "1296772370";

const systemVersion = "v2.24.1127";
const wwebVersion = "2.2407.3"; // 2.2412.54
const maxEntriesPerLocation = 30;
const maxAccountRegistration = 3;

const { executablePath } = require('puppeteer');

// Global variables
var methodRan = false;
var client;
var listenerInitialized = false;

(async () => {
  // await mongoose
  //   .connect(process.env.MONGODB_URI)
  //   .then(() => console.log("MongoDB connected!"))
  //   .catch((err) => console.error("MongoDB Connection Error:", err));

  // const store = new MongoStore({ mongoose: mongoose });
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: "./src/chat_bot/wa_session",
    }),
    // authStrategy: new RemoteAuth({
    //   dataPath: "./src/chat_bot/wa_session",
    //   store: store,
    //   backupSyncIntervalMs: 300000,
    // }),
    puppeteer: {
        executablePath: CHROME_EXECUTABLE_PATH,
        headless: CHROME_HEADLESS,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          // '--single-process',
          // '--no-zygote'
        ]
    },
    // webVersionCache: {
    //   type: "remote",
    //   remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${wwebVersion}.html`,
    // },
  });

  client.on("loading_screen", (percent, message) => {
    console.log("LOADING SCREEN", percent, message);
  });

  client.on("remote_session_saved", () => {
    console.log("REMOTE AUTH DATA SAVED");
  });

  client.on("qr", (qr) => {
    qrcode_terminal.generate(qr, { small: true });
    console.log("QR RECEIVED", qr);
  });

  client.on("authenticated", () => {
    console.log("AUTHENTICATED");
  });

  client.on("disconnected", (reason) => {
    console.log(`DISCONNECTED: ${reason}`);
  });

  client.on("auth_failure", (msg) => {
    console.error("AUTHENTICATION FAILURE", msg);
  });

  client.on("ready", async () => {
    console.log("READY");
    await new Promise(r => setTimeout(r, 20000));

    if (!listenerInitialized) {
        client.on("message", async (msg) => {
            if (msg.from !== "status@broadcast" && msg.author == null) {
              msg.body = convertFirstWordToLowerCase(msg.body);
              const hasBlocked = await waMsgGetBlocked(msg.from);
              if (!hasBlocked) {
                if (msg.type === MessageTypes.TEXT) {
                  if (await waMsgGetConfirmation(msg.from)) {
                    await sendPingMessageTelegram(msg); // ping
                    await selectRulesAccepted(msg); // ufood aturan setuju
                    await registerUserAccount(msg); // ufood daftar {email} {password}
                    await editUserAccount(msg); // ufood akun {nomorAkun} ganti {email} {password}
                    await selectLocationAccount(msg); // ufood akun {nomorAkun} lokasi {nomorLokasi}
                    await selectSubmissionAccount(msg); // ufood akun {nomorAkun} submit {enableDisable}
                    await deleteAccount(msg); // ufood akun {nomorAkun} hapus
                  } else {
                    if (msg.body === "ping") {
                      await confirmPingMessageTelegram(msg);
                    } else if (msg.body === "commands") {
                      await giveDetailCommandsToUser(msg);
                    } else if (msg.body === "ufood") {
                      await giveDetailAboutSystemToUser(msg);
                    } else if (msg.body === "ufood alur") {
                      await giveDetailGuidanceToUser(msg);
                    } else if (msg.body === "ufood aturan") {
                      await giveDetailRulesToUser(msg);
                    } else if (msg.body === "ufood help") {
                      await giveDetailHelpToUser(msg);
                    } else if (msg.body === "ufood aturan setuju") {
                      if (!(await waMsgGetRulesAccepted(msg.from))) {
                        await confirmRulesAccepted(msg);
                      } else {
                        msg.reply(
                          "Anda berhasil menyetujuinya. Selanjutnya, daftarkan akun SSO Undip Anda melalui perintah *_ufood daftar_*."
                        );
                      }
                    } else if (/ufood daftar/.test(msg.body)) {
                      if (await waMsgGetRulesAccepted(msg.from)) {
                        await confirmRegisterUserAccount(msg); // ufood akun {email} {password}
                      } else {
                        msg.reply(
                          "Anda belum membaca dan menyetujui aturan yang diberikan. Silahkan menggunakan perintah *_ufood aturan_* untuk membaca seluruh aturan sistem."
                        );
                      }
                    } else if (/ufood akun/.test(msg.body)) {
                      if (await waMsgGetRulesAccepted(msg.from)) {
                        if (!methodRan) await giveListDetailAccountsToUser(msg); // ufood akun
                        if (!methodRan) await selectListAccounts(msg); // ufood akun {nomorAkun}
                        if (!methodRan) await givePaymentMethodsToUser(msg); // ufood akun {nomorAkun} beli
                        if (!methodRan) await giveGuideEditUserAccount(msg); // ufood akun {nomorAkun} ganti
                        if (!methodRan) await confirmEditUserAccount(msg); // ufood akun {nomorAkun} ganti {email} {password}
                        if (!methodRan) await giveSelectionLocationAccount(msg); // ufood akun {nomorAkun} lokasi
                        if (!methodRan) await confirmLocationAccount(msg); // ufood akun {nomorAkun} lokasi {nomorLokasi}
                        if (!methodRan) await giveSelectionSubmissionAccount(msg); // ufood akun {nomorAkun} submit
                        if (!methodRan) await confirmSubmissionAccount(msg); // ufood akun {nomorAkun} submit {enableDisable}
                        if (!methodRan) await confirmDeleteAccount(msg); // ufood akun {nomorAkun} hapus
                        if (!methodRan) {
                          msg.reply(
                            "Format perintah yang Anda ketikkan tidak benar. Baca kembali petunjuk yang diberikan."
                          );
                        }
                        methodRan = false;
                      } else {
                        msg.reply(
                          "Anda belum membaca dan menyetujui aturan yang diberikan. Silahkan menggunakan perintah *_ufood aturan_* untuk membaca seluruh aturan sistem."
                        );
                      }
                    } else if (msg.body === "ufood status") {
                      if (await waMsgGetRulesAccepted(msg.from)) {
                        await giveSystemStatusToUser(msg); // ufood status
                      } else {
                        msg.reply(
                          "Anda belum membaca dan menyetujui aturan yang diberikan. Silahkan menggunakan perintah *_ufood aturan_* untuk membaca seluruh aturan sistem."
                        );
                      }
                    } else if (msg.body === "ufood subscribe") {
                      msg.reply("Informasi update dihidupkan.");
                    } else if (msg.body === "ufood unsubscribe") {
                      msg.reply(
                        "Informasi update dimatikan. Ketik *_ufood subscribe_* untuk menghidupkan kembali."
                      );
                    } else {
                      if (msg.from === ADMIN_WHATSAPP) {
                        if (msg.hasQuotedMsg) {
                          const quotedMessage = await msg.getQuotedMessage();
                          if (quotedMessage._data.caption) {
                            const message_caption =
                              quotedMessage._data.caption.split("_");
                            const wa_number_account = message_caption[0];
                            if (/^ya (\d+)$/.test(msg.body)) {
                              const match = msg.body.match(/^ya (\d+)$/);
                              const addition_quota = Number(match[1]);
                              const pay_sso_id = Number(message_caption[1]);
                              if (addition_quota === 0) {
                                if (
                                  (await waMsgGetFreeTrialStatus(wa_number_account)) ===
                                  1
                                ) {
                                  client.sendMessage(
                                    wa_number_account,
                                    `Anda sudah pernah menggunakan *Free Trial*. Silahkan lakukan pembelian dengan paket 4x atau 16x`
                                  );
                                  msg.react("❌");
                                } else {
                                  const addition_quota_free = 2;
                                  const available_quota = await ssoGetAccountQuota(
                                    pay_sso_id
                                  );
                                  await waMsgEditFreeTrialStatus(
                                    wa_number_account,
                                    true
                                  );
                                  await ssoEditAccountQuota(
                                    pay_sso_id,
                                    available_quota + addition_quota_free
                                  );
                                  new_account = await ssoGetAccount(pay_sso_id);
                                  if (
                                    (await getCountSubmission(
                                      true,
                                      new_account.pick_location
                                    )) < maxEntriesPerLocation
                                  ) {
                                    await ssoEditAccountEnableSubmit(
                                      new_account.id,
                                      true
                                    );
                                    client.sendMessage(
                                      wa_number_account,
                                      `*Free Trial* berhasil digunakan. *Akun _${new_account.email}_* memiliki kuota sebanyak *${new_account.available_quota}x*.\n\n` +
                                        `Pengecekan kembali dapat dilakukan melalui perintah *_ufood akun_*. Submit kupon otomatis diaktifkan.`
                                    );
                                    msg.react("👍");
                                  } else {
                                    if (new_account.enable_submit) {
                                      client.sendMessage(
                                        wa_number_account,
                                        `*Free Trial* berhasil digunakan. *Akun _${new_account.email}_* memiliki kuota sebanyak *${new_account.available_quota}x*.\n\n` +
                                          `Pengecekan kembali dapat dilakukan melalui perintah *_ufood akun_*.`
                                      );
                                    } else {
                                      client.sendMessage(
                                        wa_number_account,
                                        `*Free Trial* berhasil digunakan. *Akun _${new_account.email}_* memiliki kuota sebanyak *${new_account.available_quota}x*.\n\n` +
                                          `Pengecekan kembali dapat dilakukan melalui perintah *_ufood akun_*. Kuota pengguna mencapai maksimal, submit kupon tidak diaktifkan.`
                                      );
                                    }
                                    msg.react("🥲");
                                  }
                                  ssoEditAccountReminded(new_account.id, false);
                                }
                              } else {
                                if (pay_sso_id > 0) {
                                  const available_quota = await ssoGetAccountQuota(
                                    pay_sso_id
                                  );
                                  if (
                                    await ssoEditAccountQuota(
                                      pay_sso_id,
                                      available_quota + addition_quota
                                    )
                                  ) {
                                    new_account = await ssoGetAccount(pay_sso_id);
                                    if (
                                      (await getCountSubmission(
                                        true,
                                        new_account.pick_location
                                      )) < maxEntriesPerLocation
                                    ) {
                                      await ssoEditAccountEnableSubmit(
                                        new_account.id,
                                        true
                                      );
                                      client.sendMessage(
                                        wa_number_account,
                                        `Pembayaran berhasil dikonfirmasi. *Akun _${new_account.email}_* memiliki kuota sebanyak *${new_account.available_quota}x*.\n\n` +
                                          `Submit kupon otomatis diaktifkan. Pengecekan kembali dapat dilakukan melalui perintah *_ufood akun_*.`
                                      );
                                      msg.react("👍");
                                    } else {
                                      if (new_account.enable_submit) {
                                        client.sendMessage(
                                          wa_number_account,
                                          `Pembayaran berhasil dikonfirmasi. *Akun _${new_account.email}_* memiliki kuota sebanyak *${new_account.available_quota}x*.\n\n` +
                                            `Submit kupon sudah aktif. Pengecekan kembali dapat dilakukan melalui perintah *_ufood akun_*.`
                                        );
                                      } else {
                                        client.sendMessage(
                                          wa_number_account,
                                          `Pembayaran berhasil dikonfirmasi. *Akun _${new_account.email}_* memiliki kuota sebanyak *${new_account.available_quota}x*.\n\n` +
                                            `Kuota pengguna mencapai maksimal, submit kupon tidak diaktifkan. Pengecekan kembali dapat dilakukan melalui perintah *_ufood akun_*.`
                                        );
                                      }
                                      msg.react("🥲");
                                    }
                                    ssoEditAccountReminded(new_account.id, false);
                                  } else msg.react("😭");
                                } else msg.react("😭");
                              }
                            } else if (msg.body === "tidak") {
                              msg.react("❌");
                              client.sendMessage(
                                wa_number_account,
                                "Pembayaran gagal dikonfirmasi. Silahkan lakukan pembayaran ulang."
                              );
                            }
                          } else {
                            const message_body = quotedMessage.body.split("_");
                            const wa_number_account = message_body[0];
                            if (msg.body === "sudah") {
                              const reason = message_body[1];
                              if (reason === "ping") {
                                await waMsgEditBlocked(wa_number_account, false);
                                client.sendMessage(
                                  wa_number_account,
                                  "Chat bot sudah diaktifkan kembali!"
                                );
                                msg.react("👍");
                              }
                            }
                          }
                        } else {
                          if (msg.body === "!login") {
                            doLoginAccounts();
                            msg.reply("Logging in accounts...");
                          } else if (msg.body === "!kupon") {
                            sendCoupons();
                            msg.reply("Sending today's coupons...");
                          } else if (msg.body.startsWith("!kirim ")) {
                            let first_msg = msg.body.split(" ")[0];
                            let messageIndex =
                              msg.body.indexOf(first_msg) + first_msg.length + 1;
                            let send_message = msg.body.slice(
                              messageIndex,
                              msg.body.length
                            );
                            // client.sendMessage(ADMIN_WHATSAPP, send_message);
                            const wa_number_accounts = await waMsgGetAllWANumber();
                            for (const wa_number of wa_number_accounts) {
                              client.sendMessage(wa_number, send_message);
                            }
                            msg.react("👍");
                          }
                        }
                      } else {
                        client.sendMessage(
                          msg.from,
                          "Perintah yang Anda ketikkan tidak tersedia. Baca kembali instruksi di atas atau ketik *_ufood alur_* untuk melihat panduan sistem."
                        );
                      }
                    }
                  }
                } else if (
                  msg.type === MessageTypes.IMAGE ||
                  msg.type === MessageTypes.DOCUMENT
                ) {
                  const attachmentData = await msg.downloadMedia();
                  const pay_sso_id = await registeredGetPaySSOID(msg.from);
                  if (pay_sso_id > 0) {
                    client.sendMessage(ADMIN_WHATSAPP, attachmentData, {
                      caption: `${msg.from}_${pay_sso_id}`,
                    });
                    await registeredEditPaySSOID(msg.from, 0);
                    msg.react("⏳");
                  } else {
                    client.sendMessage(ADMIN_WHATSAPP, attachmentData, {
                      caption: `${msg.from}_Unknown`,
                    });
                    msg.react("❌");
                    msg.reply("Anda belum memilih akun untuk pembelian kuota.");
                  }
                }
              } else if (hasBlocked === -1) {
                client.sendMessage(
                  msg.from,
                  "Selamat datang di *Sistem UFood!* Kemudahan *pengambilan kupon otomatis* untuk *mahasiswa Undip*.\n\n" +
                    `*Jumlah Akun Terdaftar:* _${await ssoCountTotalAccounts()} akun_.\n\n` +
                    "Ketik *_ufood_* untuk melihat penjelasan sistem."
                );
              }
              await waMsgEditMessages(msg.from, convertToUtf8mb3(msg.body));
              // console.log(msg);
            }
          });
      listenerInitialized = true;
    }
    
  });
  
  client.initialize();
})();

async function doLoginAccounts() {
  const accounts = await getCombinedSSOAccounts();
  const resultArray = accounts.map((account) => ({
    id: account.dataValues.id,
    status_login: account.dataValues.status_login,
  }));
  const resultID = await loginAccounts();
  for (let i = 0; i < resultID.length; i++) {
    const account = await ssoGetAccount(resultID[i]);
    const wa_number = await registeredGetWANumberBySSOID(resultID[i]);
    switch (account.status_login) {
      case 1:
        const last_status_login = resultArray.find(
          (last_account) => last_account.id === account.id
        ).status_login;
        if (last_status_login == 0)
          client.sendMessage(
            wa_number,
            `Akun *_${account.email}_* berhasil login by sistem!`
          );
        break;
      case 4:
        client.sendMessage(
          wa_number,
          `Akun *_${account.email}_* password salah! Ganti password/akun melalui perintah *_ufood akun_*.`
        );
        break;
      case 5:
        client.sendMessage(
          wa_number,
          `Akun *_${account.email}_* email salah! Ganti email/akun melalui perintah *_ufood akun_*.`
        );
        break;
    }
  }
}

async function sendCoupons() {
  console.log("TASK: Sending taken coupons...");
  taken_coupons_today = await couponsGetAllEntriesToday();
  if (taken_coupons_today.length > 0) {
    let indexCount = 0;
    for (const coupon of taken_coupons_today) {
      const account = await ssoGetAccount(coupon.sso_id);
      const wa_number = await registeredGetWANumberBySSOID(coupon.sso_id);
      if (!coupon.wa_sent_at) {
        if (indexCount > 15) break;
        if (coupon.taken_success) {
          const kupon_media = MessageMedia.fromFilePath(
            `./python/${coupon.coupon_file}`
          );
          client.sendMessage(wa_number, kupon_media, {
            caption:
              `*Akun:* ${account.email}\n` +
              `*Kuota:* ${account.available_quota}x`,
          });
        } else {
          client.sendMessage(
            wa_number,
            `Akun *_${account.email}_* tidak mendapatkan kupon. Kuota tidak dikurangi.`
          );
        }
        await couponsUpdateWASent(coupon.sso_id);
        indexCount++;
      }
    }
  }
}

function convertFirstWordToLowerCase(input) {
  const words = input.split(" ");
  words[0] = words[0].toLowerCase();
  return words.join(" ");
}

function convertToUtf8mb3(inputString) {
  const utf8mb3String = inputString.replace(/[^\x00-\x7F]/g, "");
  const utf8Buffer = Buffer.from(utf8mb3String, "utf8");
  const sanitizedString = iconv.decode(
    iconv.encode(utf8Buffer, "utf8"),
    "utf8",
    { default: "" }
  );
  return sanitizedString;
}

function ssoGetStringLocation(location) {
  switch (location) {
    case 1:
      return "Gedung SA-MWA";
    case 2:
      return "Student Center";
    case 3:
      return "Audit. FPIK";
    case 4:
      return "Audit. Imam Bardjo";
    default:
      return "Unknown Error";
  }
}

function ssoGetStringStatus(status) {
  switch (status) {
    case 0:
      return "Logging In by System";
    case 1:
      return "Logged In";
    case 2:
      return "Already Graduated";
    case 3:
      return "Logged Out";
    case 4:
      return "Incorrect Password";
    case 5:
      return "Incorrect Username";
    case 6:
      return "Incorrect Region";
    case 7:
      return "Server Error";
    case 8:
      return "System Error";
    default:
      return "Unknown Error";
  }
}

function isWeekday() {
  const today = new Date();
  const day = today.getDay();
  return day >= 1 && day <= 5;
}

function isAfterTenThirty() {
  const now = new Date();
  const hours = now.getHours(); // Get the current hour (0-23)
  const minutes = now.getMinutes(); // Get the current minute (0-59)
  if (hours > 13) {
    return true;
  } else if (hours === 13 && minutes >= 30) {
    return true;
  } else {
    return false;
  }
}

function isAfterNineFortyFive() {
  const now = new Date();
  const hours = now.getHours(); // Get the current hour (0-23)
  const minutes = now.getMinutes(); // Get the current minute (0-59)
  if (hours > 12) {
    return true;
  } else if (hours === 12 && minutes >= 45) {
    return true;
  } else {
    return false;
  }
}

async function generateQRCodeBase64(text) {
  try {
    const base64Image = await QRCode.toDataURL(text);
    return base64Image;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw error;
  }
}

async function sendMessageTelegram(message) {
  try {
    await bot.sendMessage(chatId, message);
    console.log(`Telegram message sent: ${message}`);
  } catch (error) {
    console.error("Error send telegram:", error);
  }
}

async function confirmRulesAccepted(msg) {
  msg.reply(
    `Aturan sudah dibaca semua?\n\n` +
      `Jika sudah, ketik *_ya_*.\nSebaliknya, ketik apa saja.`
  );
  await waMsgEditConfirmation(msg.from, true);
}

async function selectRulesAccepted(msg) {
  const message = await waMsgGetLastMessages(msg.from);
  if (message === "ufood aturan setuju") {
    if (msg.body === "ya") {
      msg.reply(
        "Aturan telah disetujui. Selanjutnya, Anda bisa mendaftarkan akun SSO Undip melalui perintah *_ufood daftar_*."
      );
      await waMsgEditRulesAccepted(msg.from, true);
    } else {
      msg.reply("Aturan dibatalkan untuk disetujui!");
    }
    await waMsgEditConfirmation(msg.from, false);
  }
}

async function confirmPingMessageTelegram(msg) {
  msg.reply(
    `Apakah Anda yakin ingin mengirimkan ping kepada admin? Anda akan dinonaktifkan dari chat bot dan akan beralih ke pesan biasa sampai admin mengembalikan status penonaktifan Anda secara manual. Setelah itu, silakan sampaikan keluhan yang Anda alami.\n\n` +
      `Jika yakin, ketik *_ya_*.\nSebaliknya, ketik apa saja.`
  );
  await waMsgEditConfirmation(msg.from, true);
}

async function sendPingMessageTelegram(msg) {
  const message = await waMsgGetLastMessages(msg.from);
  if (message === "ping") {
    if (msg.body === "ya") {
      msg.reply(
        "Akun sudah dinonaktifkan dari chat bot dan menjadi pesan biasa. Silahkan sampaikan keluhan yang Anda alami."
      );
      await waMsgEditBlocked(msg.from, true);
      const phoneNumber = msg.from.replace("@c.us", "");
      client.sendMessage(ADMIN_WHATSAPP, `${msg.from}_ping`);
      client.sendMessage(
        ADMIN_WHATSAPP_SELF,
        `Terdapat kendala dari ${phoneNumber} pada bot Undip Foodtruck!\n\n` +
          `Link: wa.me/${phoneNumber}`
      );
    //   await sendMessageTelegram(
    //     `Terdapat kendala dari ${msg.from} pada bot Undip Foodtruck!`
    //   );
    } else {
      msg.reply("Ping dibatalkan untuk diberikan!");
    }
    await waMsgEditConfirmation(msg.from, false);
  }
}

async function confirmRegisterUserAccount(msg) {
  if (msg.body === "ufood daftar") {
    if ((await registeredCountSSOIDS(msg.from)) < maxAccountRegistration) {
      msg.reply(
        "Untuk mendaftarkan akun SSO Undip, gunakan perintah dengan format, seperti berikut:\n\n" +
          "Format perintah:\n" +
          "> *_ufood daftar {email} {password}_*\n\n" +
          "Contoh penggunaan:\n" +
          "> *_ufood daftar admin@students.undip.ac.id iniAdalahPassword123_*"
      );
    } else {
      msg.reply(`Maksimal pendaftaran hanya ${maxAccountRegistration} akun.`);
    }
  } else if (/^ufood daftar [\w.-]+@students\.undip\.ac\.id$/.test(msg.body)) {
    if ((await registeredCountSSOIDS(msg.from)) < maxAccountRegistration) {
      msg.reply(
        "Anda hanya memasukkan email. Masukkan juga password bersamaan dengan email.\n\nFormat yang benar:\n" +
          "> *_ufood daftar {email} {password}_*\n\n" +
          "Contoh penggunaan:\n" +
          `> *_${msg.body} iniAdalahPassword123_*`
      );
    } else {
      msg.reply(`Maksimal pendaftaran hanya ${maxAccountRegistration} akun.`);
    }
  } else if (
    /^ufood daftar [\w.-]+@students\.undip\.ac\.id .+$/.test(msg.body)
  ) {
    if ((await registeredCountSSOIDS(msg.from)) < maxAccountRegistration) {
      const match = msg.body.match(
        /^ufood daftar ([\w.-]+@students\.undip\.ac\.id) (.+)$/
      );
      const email = match[1];
      const password = match[2];
      msg.reply(
        `> *Email:* _${email}_\n` +
          `> *Password:* _${password}_\n\n` +
          `Apakah benar Anda ingin mendaftarkan akun di atas? Data email maupun password dapat diubah lagi setelah didaftarkan.\n\n` +
          `Jika benar, ketik *_ya_*.\nSebaliknya, ketik apa saja.`
      );
      await waMsgEditConfirmation(msg.from, true);
    } else {
      msg.reply(`Maksimal pendaftaran hanya ${maxAccountRegistration} akun.`);
    }
  } else {
    if ((await registeredCountSSOIDS(msg.from)) < maxAccountRegistration) {
      msg.reply(
        "Format yang Anda ketik tidak benar. Mohon ketik dengan benar *tanpa kurawal*.\n\nFormat yang benar:\n" +
          "> *_ufood daftar {email} {password}_*\n\n" +
          "Contoh penggunaan:\n" +
          "> *_ufood daftar admin@students.undip.ac.id iniAdalahPassword123_*"
      );
    } else {
      msg.reply(`Maksimal pendaftaran hanya ${maxAccountRegistration} akun.`);
    }
  }
}

async function registerUserAccount(msg) {
  const message = await waMsgGetLastMessages(msg.from);
  if (/^ufood daftar [\w.-]+@students\.undip\.ac\.id .+$/.test(message)) {
    if (msg.body === "ya") {
      const match = message.match(
        /^ufood daftar ([\w.-]+@students\.undip\.ac\.id) (.+)$/
      );
      const email = match[1];
      const password = match[2];
      const sso_id = await ssoAddAccount(email, password);
      const arr_sso_ids = await registeredAddAccountID(msg.from, sso_id);
      if (arr_sso_ids) {
        msg.reply(
          "Akun berhasil didaftarkan. Untuk melihat akun yang didaftarkan dan pengaturannya, gunakan perintah *_ufood akun_*.\n\n" +
            "Sistem akan memberikan notifikasi jika telah melakukan login terhadap akun tersebut."
        );
      } else {
        msg.reply("Terjadi error ketika akun didaftarkan!");
      }
    } else {
      msg.reply("Akun dibatalkan untuk didaftarkan!");
    }
    await waMsgEditConfirmation(msg.from, false);
  }
}

async function giveDetailHelpToUser(msg) {
  msg.reply(
    "Mohon dibaca kembali aturan dan alur yang telah diberikan oleh sistem. Jika memang ada kendala yang bingung untuk diselesaikan, Anda dapat menggunakan perintah *_ping_* untuk memberikan peringatan kepada admin dan sampaikan keluhannya."
  );
}

async function giveDetailRulesToUser(msg) {
  msg.reply(
    "> Sistem ini bersifat *pribadi* dan *tidak dimiliki* oleh *organisasi atau lembaga manapun*. Dirancang khusus untuk *mahasiswa aktif Undip* yang membutuhkan pengambilan kupon otomatis tanpa melalui website.\n\n" +
      "> Dilarang keras bertindak kasar, melanggar, atau menyebarkan informasi hoax. Gunakan sistem ini untuk keperluan pribadi sebagaimana mestinya.\n\n" +
      "> Penggunaan sistem ini terbatas 30 akun per tempat pengambilan kupon, total 120 pengguna. Kuota dihitung berdasarkan aktivasi fungsi submit pada akun.\n\n" +
      "> Semua akun memiliki kesempatan yang sama untuk mendapatkan kupon. Jika tidak berhasil mendapatkan kupon, kuota tidak akan dikurangi.\n\n" +
      "> Data dienkripsi dengan aman dan terisolasi dengan media Whatsapp, sehingga tidak dapat diakses oleh siapapun.\n\n" +
      "> Data hanya digunakan untuk pengambilan kupon dan dijalankan otomatis tanpa campur tangan manusia.*\n\n" +
      "Untuk melanjutkan, ketik *_ufood aturan setuju_* untuk menyetujui semua aturan."
  );
}

async function giveDetailAboutSystemToUser(msg) {
  msg.reply(
    "> *Layanan Otomatis:* Sistem UFood memungkinkan pengguna mendapatkan *_kupon Foodtruck_* tanpa harus melakukannya secara manual. Pengambilan kupon menggunakan sistem kuota dan dilakukan oleh sistem, serta kupon akan dikirimkan melalui WhatsApp.\n\n" +
      `> *Skema Berbayar:* Pengguna perlu melakukan pembelian kuota dengan paket *4x* pengambilan seharga *Rp15.000* atau *16x* pengambilan seharga *Rp50.000*. Jika sistem tidak berhasil mendapatkan kupon, kuota pengambilan *_tidak akan dikurangi_*. Pengguna juga dapat *mengaktifkan/menonaktifkan* pengambilan, sehingga kuota tetap *tersimpan selamanya*.\n\n` +
      "> *Free Trial:* Pengguna mendapatkan kuota gratis sebanyak *2x* untuk pertama kali penggunaan dan terbatas hanya 1 akun terdaftar.\n\n" +
      "> *Informasi yang Diperlukan:* Untuk menggunakan layanan ini, pengguna harus menyediakan *_email dan password_* dari akun *_SSO Undip_*. Informasi ini diperlukan untuk mendaftarkan akun pengguna ke sistem.\n\n" +
      "> *Akses Pengaturan dan Pengambilan Kupon:* Setelah informasi diberikan dan pembayaran dilakukan, pengguna bisa *_mengatur dan mengambil_* kupon Foodtruck sesuai jadwal pengambilan kupon yang telah ditentukan.\n\n" +
      "Untuk melanjutkan, ketik *_ufood alur_* untuk melihat panduan penggunaan sistem."
  );
}

async function giveDetailGuidanceToUser(msg) {
  msg.reply(
    "*Panduan Penggunaan Sistem UFood*\n\n" +
      "1. *Baca Aturan:* Gunakan perintah *_ufood aturan_*.\n" +
      "2. *Setujui Aturan:* Ketik *_ufood aturan setuju_*.\n" +
      "3. *Daftar Akun:* Gunakan perintah *_ufood daftar_*.\n" +
      "4. *Kelola Akun:* Lihat dan ubah akun melalui *_ufood akun_*.\n" +
      "5. *Aktifkan Submit:* Sistem akan mengambil kupon otomatis jika submit diaktifkan.\n" +
      "6. *Terima Kupon:* Kupon dikirim otomatis via WhatsApp.\n" +
      "7. *Status Sistem:* Gunakan perintah *_ufood status_*.\n" +
      "8. *Bantuan:* Gunakan perintah *_ufood help_*.\n" +
      "9. *Daftar Perintah:* Ketik *_commands_*.\n\n" +
      "Selamat menggunakan Sistem UFood!"
  );
}

async function giveDetailCommandsToUser(msg) {
  msg.reply(
    `Melihat informasi mengenai sistem:\n` +
      `> *_ufood_*\n\n` +
      `Melihat alur penggunaan sistem:\n` +
      `> *_ufood alur_*\n\n` +
      `Melihat aturan penggunaan sistem:\n` +
      `> *_ufood aturan_*\n\n` +
      `Mendaftarkan akun SSO Undip:\n` +
      `> *_ufood daftar_*\n\n` +
      `Melihat daftar akun dan konfigurasi:\n` +
      `> *_ufood akun_*\n\n` +
      `Melihat status sistem:\n` +
      `> *_ufood status_*\n\n` +
      `Matikan info update sistem:\n` +
      `> *_ufood unsubscribe_*\n\n` +
      `Mencari bantuan:\n` +
      `> *_ufood help_*`
  );
}

async function giveListDetailAccountsToUser(msg) {
  if (msg.body === "ufood akun") {
    const sso_id = await registeredGetSSOIDS(msg.from);
    if (sso_id.length > 0) {
      let messages = "";
      let kuponMessage = "Error";
      const coupon_accounts = await couponsGetAllEntriesToday();
      for (const [index, id] of sso_id.entries()) {
        const account = await ssoGetAccount(id);
        if (isWeekday()) {
          if (coupon_accounts.length > 0) {
            kuponMessage = (await couponsCheckTakenToday(account.id))
              ? "Dapat"
              : "Tidak Dapat";
          } else {
            if (isAfterTenThirty()) {
              kuponMessage = "Libur/Error";
            } else if (isAfterNineFortyFive()) {
              kuponMessage = "Sistem Standby";
            } else {
              kuponMessage = "Menunggu";
            }
          }
        } else {
          kuponMessage = "Di Luar Jadwal";
        }
        messages +=
          `> *${index + 1}) ${account.email}*\n` +
          `*Login:* _${format(
            new Date(account.updated_at),
            "dd/MM/yyyy HH:mm:ss"
          )}_\n` +
          `*Status:* _${ssoGetStringStatus(account.status_login)}_\n` +
          `*Kupon:* _${kuponMessage}_\n` +
          `*Lokasi:* _${ssoGetStringLocation(account.pick_location)}_\n` +
          `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n` +
          `*Kuota:* _${account.available_quota}x_\n\n`;
      }
      messages +=
        `*Daftar Perintah Konfigurasi Akun*\n` +
        `- Informasi Akun 1: *_ufood akun 1_*\n` +
        `- Beli Kuota: *_ufood akun 1 beli_*\n` +
        `- Ganti Akun: *_ufood akun 1 ganti_*\n` +
        `- Atur Lokasi: *_ufood akun 1 lokasi_*\n` +
        `- Atur Submit: *_ufood akun 1 submit_*\n` +
        `- Hapus Akun: *_ufood akun 1 hapus_*`;
      msg.reply(messages);
    } else {
      msg.reply(
        "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
      );
    }
    methodRan = true;
  }
}

async function giveSystemStatusToUser(msg) {
  /*
  > Total Pengambilan Kupon: 180 kupon
  > Total Pengguna: 180 orang
  > Pengguna Aktif Submit
  - Gedung SA-MWA : 25/30 orang
  - Student Center : 30/30 orang
  - Audit. FPIK : 15/30 orang
  - Audit. Imam Bardjo : 12/30 orang
  > Pengambilan Terakhir
  - Gedung SA-MWA : 25/25 orang
  - Student Center : 30/30 orang
  - Audit. FPIK : 15/30 orang
  - Audit. Imam Bardjo : 12/30 orang
  */
  msg.reply(
    `> *Versi Sistem:* ${systemVersion}\n` +
      `> *Total Pengambilan:* _${
        1771 + (await couponsCountTakenEntries())
      } kupon_\n` +
      `> *Total Pengguna:* _${await registeredTotalAccounts()} pengguna_\n` +
      `> *Total Akun SSO:* _${await ssoCountTotalAccounts()} akun_\n\n` +
      `> *Total Akun Aktif Submit:*\n` +
      `_*${ssoGetStringLocation(1)}:* ${await getCountSubmission(
        true,
        1
      )}/${maxEntriesPerLocation} akun_\n` +
      `_*${ssoGetStringLocation(2)}:* ${await getCountSubmission(
        true,
        2
      )}/${maxEntriesPerLocation} akun_\n` +
      `_*${ssoGetStringLocation(3)}:* ${await getCountSubmission(
        true,
        3
      )}/${maxEntriesPerLocation} akun_\n` +
      `_*${ssoGetStringLocation(4)}:* ${await getCountSubmission(
        true,
        4
      )}/${maxEntriesPerLocation} akun_\n\n` +
      `> *Total Pengambilan Terakhir:*\n` +
      `_*${ssoGetStringLocation(1)}:* ${await couponsCountLatestEntriesLocation(
        1,
        [true]
      )}/${await couponsCountLatestEntriesLocation(1, [
        true,
        false,
      ])} kupon_\n` +
      `_*${ssoGetStringLocation(2)}:* ${await couponsCountLatestEntriesLocation(
        2,
        [true]
      )}/${await couponsCountLatestEntriesLocation(2, [
        true,
        false,
      ])} kupon_\n` +
      `_*${ssoGetStringLocation(3)}:* ${await couponsCountLatestEntriesLocation(
        3,
        [true]
      )}/${await couponsCountLatestEntriesLocation(3, [
        true,
        false,
      ])} kupon_\n` +
      `_*${ssoGetStringLocation(4)}:* ${await couponsCountLatestEntriesLocation(
        4,
        [true]
      )}/${await couponsCountLatestEntriesLocation(4, [true, false])} kupon_`
  );
}

async function selectListAccounts(msg) {
  if (/^ufood akun (\d+)$/.test(msg.body)) {
    const sso_id = await registeredGetSSOIDS(msg.from);
    const match = msg.body.match(/^ufood akun (\d+)$/);
    const index_id = match[1] - 1;
    if (sso_id.length > 0) {
      const pick_sso_id = sso_id[index_id];
      if (pick_sso_id) {
        const account = await ssoGetAccount(pick_sso_id);
        const messages =
          `> *${index_id + 1}) ${account.email}*\n` +
          `*Lokasi:* _${ssoGetStringLocation(account.pick_location)}_\n` +
          `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n` +
          `*Kuota:* _${account.available_quota}x_\n\n` +
          `Anda memilih akun nomor *(${
            index_id + 1
          })*. Tambahkan perintah *_beli_*, *_ganti_*, *_lokasi_*, *_submit_*, dan *_hapus_* untuk melakukan pembelian dan pengaturan.`;
        msg.reply(messages);
      } else {
        msg.reply(`Anda tidak memiliki akun nomor (${index_id + 1}).`);
      }
    } else {
      msg.reply(
        "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
      );
    }
    methodRan = true;
  }
}

async function giveSelectionSubmissionAccount(msg) {
  if (/^ufood akun (\d+) submit$/.test(msg.body)) {
    const sso_id = await registeredGetSSOIDS(msg.from);
    const match = msg.body.match(/^ufood akun (\d+) submit$/);
    const index_id = Number(match[1]) - 1;
    if (sso_id.length > 0) {
      const pick_sso_id = sso_id[index_id];
      const account = await ssoGetAccount(pick_sso_id);
      msg.reply(
        `> *${index_id + 1}) ${account.email}*\n` +
          `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n\n` +
          `Tambahkan perintah *_enable_* atau *_disable_* untuk mengaktifkan atau menonaktifkan submisi kupon.\n\n` +
          `Contoh:\n` +
          `> *_${msg.body} enable_*`
      );
    } else {
      msg.reply(
        "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
      );
    }
    methodRan = true;
  }
}

async function giveGuideEditUserAccount(msg) {
  if (/^ufood akun (\d+) ganti$/.test(msg.body)) {
    const sso_id = await registeredGetSSOIDS(msg.from);
    const match = msg.body.match(/^ufood akun (\d+) ganti$/);
    const index_id = Number(match[1]) - 1;
    if (sso_id.length > 0) {
      const pick_sso_id = sso_id[index_id];
      const account = await ssoGetAccount(pick_sso_id);
      msg.reply(
        `> *${index_id + 1}) ${account.email}*\n` +
          `Untuk mengubah data email dan password akun, gunakan perintah dengan format *(tanpa kurawal)*, seperti berikut:\n\n` +
          `Format yang benar:\n` +
          `> *_${msg.body} {email} {password}_*\n\n` +
          `Contoh penggunaan:\n` +
          `> *_${msg.body} admin@students.undip.ac.id iniAdalahPassword123_*`
      );
    } else {
      msg.reply(
        "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
      );
    }
    methodRan = true;
  }
}

async function confirmEditUserAccount(msg) {
  if (
    /^ufood akun (\d+) ganti [\w.-]+@students\.undip\.ac\.id .+$/.test(msg.body)
  ) {
    const match = msg.body.match(
      /^ufood akun (\d+) ganti ([\w.-]+@students\.undip\.ac\.id) (.+)$/
    );
    const email = match[2];
    const password = match[3];
    msg.reply(
      `> *Email:* _${email}_\n` +
        `> *Password:* _${password}_\n\n` +
        `Apakah benar Anda ingin mengubah data akun dengan informasi di atas?\n\n` +
        `Jika benar, ketik *_ya_*.\nSebaliknya, ketik apa saja.`
    );
    await waMsgEditConfirmation(msg.from, true);
    methodRan = true;
  }
}

async function editUserAccount(msg) {
  const message = await waMsgGetLastMessages(msg.from);
  if (
    /^ufood akun (\d+) ganti [\w.-]+@students\.undip\.ac\.id .+$/.test(message)
  ) {
    if (msg.body === "ya") {
      const sso_id = await registeredGetSSOIDS(msg.from);
      const match = message.match(
        /^ufood akun (\d+) ganti ([\w.-]+@students\.undip\.ac\.id) (.+)$/
      );
      const index_id = Number(match[1]) - 1;
      const email = match[2];
      const password = match[3];
      if (sso_id.length > 0) {
        const pick_sso_id = sso_id[index_id];
        if (
          await ssoEditAccountByID(pick_sso_id, {
            email: email,
            password: password,
            status_login: 0,
          })
        ) {
          msg.reply("Email dan password akun berhasil diganti.");
        } else {
          msg.reply("Terjadi error dalam penggantian email dan password akun!");
        }
      } else {
        msg.reply(
          "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
        );
      }
    } else {
      msg.reply("Penggantian email dan password akun dibatalkan!");
    }
    await waMsgEditConfirmation(msg.from, false);
  }
}

async function confirmDeleteAccount(msg) {
  if (/^ufood akun (\d+) hapus$/.test(msg.body)) {
    const sso_id = await registeredGetSSOIDS(msg.from);
    const match = msg.body.match(/^ufood akun (\d+) hapus$/);
    const index_id = Number(match[1]) - 1;
    if (sso_id.length > 0) {
      const pick_sso_id = sso_id[index_id];
      const account = await ssoGetAccount(pick_sso_id);
      msg.reply(
        `> *${index_id + 1}) ${account.email}*\n` +
          `*Lokasi:* _${ssoGetStringLocation(account.pick_location)}_\n` +
          `*Submit:* _${account.enable_submit ? "Enabled" : "Disabled"}_\n` +
          `*Kuota:* _${account.available_quota}x_\n\n` +
          `Apakah benar Anda ingin menghapus akun di atas?\n\nJika benar, ketik *_ya_*.\nSebaliknya, ketik apa saja.`
      );
      await waMsgEditConfirmation(msg.from, true);
    } else {
      msg.reply(
        "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
      );
    }
    methodRan = true;
  }
}

async function deleteAccount(msg) {
  const message = await waMsgGetLastMessages(msg.from);
  if (/^ufood akun (\d+) hapus$/.test(message)) {
    if (msg.body === "ya") {
      const sso_id = await registeredGetSSOIDS(msg.from);
      const match = message.match(/^ufood akun (\d+) hapus$/);
      const index_id = Number(match[1]) - 1;
      if (sso_id.length > 0) {
        const pick_sso_id = sso_id[index_id];
        const account = await ssoGetAccount(pick_sso_id);
        if (await registeredRemoveAccountID(msg.from, pick_sso_id)) {
          // if (await ssoDeleteAccount(pick_sso_id))
          msg.reply(`Akun *_${account.email}_* berhasil dihapus.`);
          // else msg.reply(`Terjadi error dalam menghapus akun.`);
        } else msg.reply(`Terjadi error dalam menghapus akun.`);
      } else {
        msg.reply(
          "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
        );
      }
    } else {
      msg.reply("Penghapusan akun dibatalkan!");
    }
    await waMsgEditConfirmation(msg.from, false);
  }
}

async function confirmSubmissionAccount(msg) {
  if (/^ufood akun (\d+) submit \S+$/.test(msg.body)) {
    if (/^ufood akun (\d+) submit (enable|disable)$/.test(msg.body)) {
      const sso_id = await registeredGetSSOIDS(msg.from);
      const match = msg.body.match(
        /^ufood akun (\d+) submit (enable|disable)$/
      );
      const index_id = Number(match[1]) - 1;
      const submission = match[2] == "enable" ? true : false;
      if (sso_id.length > 0) {
        const pick_sso_id = sso_id[index_id];
        const account = await ssoGetAccount(pick_sso_id);
        if (account.available_quota > 0) {
          if (
            (await getCountSubmission(true, account.pick_location)) <
            maxEntriesPerLocation
          ) {
            msg.reply(
              `> *${index_id + 1}) ${account.email}*\n` +
                `*Submit:* _${
                  account.enable_submit ? "Enabled" : "Disabled"
                }_ *->* _${submission ? "Enabled" : "Disabled"}_\n\n` +
                `Apakah benar Anda ingin mengganti submisi akun dengan informasi di atas?.\n\nJika benar, ketik *_ya_*.\nSebaliknya, ketik apa saja.`
            );
            await waMsgEditConfirmation(msg.from, true);
          } else {
            msg.reply(
              "Kuota pengguna mencapai maksimal, dapat dipantau melalui *_ufood status_* dan mencari lokasi pengambilan yang lain jika masih tersedia."
            );
          }
        } else {
          msg.reply(
            "Kuota pengambilan akun sudah habis. Silahkan lakukan pembelian kuota."
          );
        }
      } else {
        msg.reply(
          "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
        );
      }
    } else {
      msg.reply(
        `Format yang Anda berikan salah. Berikan perintah *_enable_* atau *_disable_* untuk mengaktifkan atau menonaktifkan submisi kupon.\n\n` +
          `Contoh:\n` +
          `> *_ufood akun 1 submit enable_*`
      );
    }
    methodRan = true;
  }
}

async function selectSubmissionAccount(msg) {
  const message = await waMsgGetLastMessages(msg.from);
  if (/^ufood akun (\d+) submit (enable|disable)$/.test(message)) {
    if (msg.body === "ya") {
      const sso_id = await registeredGetSSOIDS(msg.from);
      const match = message.match(/^ufood akun (\d+) submit (enable|disable)$/);
      const index_id = Number(match[1]) - 1;
      const submission = match[2] == "enable" ? true : false;
      if (sso_id.length > 0) {
        const pick_sso_id = sso_id[index_id];
        const available_quota = await ssoGetAccountQuota(pick_sso_id);
        if (available_quota > 0) {
          if (await ssoEditAccountEnableSubmit(pick_sso_id, submission)) {
            if (submission) msg.reply("Submit akun berhasil diaktifkan.");
            else msg.reply("Submit akun berhasil dinonaktifkan.");
          } else {
            msg.reply("Terjadi error ketika lokasi akun diganti.");
          }
        } else {
          msg.reply(
            "Kuota pengambilan akun sudah habis. Silahkan lakukan pembelian kuota."
          );
        }
      } else {
        msg.reply(
          "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
        );
      }
    } else {
      msg.reply("Submit akun dibatalkan untuk diganti!");
    }
    await waMsgEditConfirmation(msg.from, false);
  }
}

async function givePaymentMethodsToUser(msg) {
  if (/^ufood akun (\d+) beli$/.test(msg.body)) {
    const sso_id = await registeredGetSSOIDS(msg.from);
    const match = msg.body.match(/^ufood akun (\d+) beli$/);
    const index_id = Number(match[1]) - 1;
    if (sso_id.length > 0) {
      const pick_sso_id = sso_id[index_id];
      await registeredEditPaySSOID(msg.from, pick_sso_id);
      const account = await ssoGetAccount(pick_sso_id);
      const pay_qris = MessageMedia.fromFilePath(
        "./src/chat_bot/pay_qris_me.jpg"
      );
      msg.reply(pay_qris, msg.from, {
        caption:
          `> *${index_id + 1}) ${account.email}*\n` +
          `> *Kuota:* _${account.available_quota}x_ *->* _${
            account.available_quota + 4
          }x/${account.available_quota + 16}x_\n\n` +
          `Anda telah memilih akun ini untuk pembelian dan penambahan kuota pengambilan. Silahkan lakukan pembayaran melalui QRIS (Mallocation) di atas dengan kriteria penambahan kuota sebanyak:\n\n` +
          `*⌛ :* _*Free Trial 2x*_\n` +
          `*💲 :* _Kirim Gambar QRIS di Atas_\n\n` +
          `*⌛ :* _*4x*_\n` +
          `*💲 :* _Rp15.000,00_\n\n` +
          `*⌛ :* _*16x*_\n` +
          `*💲 :* _Rp50.000,00_\n\n` +
          `*Reminder :* Jika sistem tidak berhasil mendapatkan kupon, kuota pengambilan tidak akan dikurangi. Pengguna juga dapat mengaktifkan/menonaktifkan pengambilan, sehingga kuota tetap tersimpan selamanya.\n\n` +
          `Setelah pembayaran, kirimkan bukti pembayaran di sini dan tunggu konfirmasi.\n\n` +
          `Cek ketersediaan kuota penggunaan sistem melalui perintah *_ufood status_*. Kuota dihitung berdasarkan akun dengan submit pengambilan diaktifkan. Pembayaran tetap bisa dilakukan, namun pengaktifan submit tergantung ketersediaan kuota.`,
      });
    } else {
      msg.reply(
        "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
      );
    }
    methodRan = true;
  }
}

async function giveSelectionLocationAccount(msg) {
  if (/^ufood akun (\d+) lokasi$/.test(msg.body)) {
    const sso_id = await registeredGetSSOIDS(msg.from);
    const match = msg.body.match(/^ufood akun (\d+) lokasi$/);
    const index_id = Number(match[1]) - 1;
    if (sso_id.length > 0) {
      const pick_sso_id = sso_id[index_id];
      const account = await ssoGetAccount(pick_sso_id);
      msg.reply(
        `> *${index_id + 1}) ${account.email}*\n` +
          `*Lokasi:* _${ssoGetStringLocation(account.pick_location)}_\n\n` +
          `Tambahkan nomor berikut untuk mengganti lokasi:\n` +
          `> *1)* ${ssoGetStringLocation(1)}\n` +
          `> *2)* ${ssoGetStringLocation(2)}\n` +
          `> *3)* ${ssoGetStringLocation(3)}\n` +
          `> *4)* ${ssoGetStringLocation(4)}\n\n` +
          // `Untuk Bulan Ramadhan, hari Jumat auto di-set ke Halaman Gedung ART Center Undip\n\n` +
          `Contoh:\n` +
          `> *_${msg.body} 3_*`
      );
    } else {
      msg.reply(
        "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
      );
    }
    methodRan = true;
  }
}

async function confirmLocationAccount(msg) {
  if (/^ufood akun (\d+) lokasi (\d+)$/.test(msg.body)) {
    const sso_id = await registeredGetSSOIDS(msg.from);
    const match = msg.body.match(/^ufood akun (\d+) lokasi (\d+)$/);
    const index_id = Number(match[1]) - 1;
    const location = Number(match[2]);
    if (location >= 1 && location <= 4) {
      if (sso_id.length > 0) {
        const pick_sso_id = sso_id[index_id];
        const account = await ssoGetAccount(pick_sso_id);
        if (
          (await getCountSubmission(true, location)) < maxEntriesPerLocation
        ) {
          msg.reply(
            `> *${index_id + 1}) ${account.email}*\n` +
              `> *Lokasi:* _${ssoGetStringLocation(
                account.pick_location
              )}_ *->* _${ssoGetStringLocation(location)}_\n\n` +
              `Apakah benar Anda ingin mengganti lokasi akun dengan informasi di atas?.\n\nJika benar, ketik *_ya_*.\nSebaliknya, ketik apa saja.`
          );
          await waMsgEditConfirmation(msg.from, true);
        } else {
          if (account.enable_submit) {
            msg.reply(
              "Kuota pengguna di lokasi tersebut mencapai maksimal. Pantau melalui perintah *_ufood status_* dan mencari lokasi pengambilan lain jika tersedia."
            );
          } else {
            msg.reply(
              `> *${index_id + 1}) ${account.email}*\n` +
                `> *Lokasi:* _${ssoGetStringLocation(
                  account.pick_location
                )}_ *->* _${ssoGetStringLocation(location)}_\n\n` +
                `Apakah benar Anda ingin mengganti lokasi akun dengan informasi di atas?.\n\nJika benar, ketik *_ya_*.\nSebaliknya, ketik apa saja.`
            );
            await waMsgEditConfirmation(msg.from, true);
          }
        }
      } else {
        msg.reply(
          "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
        );
      }
    } else {
      msg.reply("Lokasi yang dipilih tidak tersedia");
    }
    methodRan = true;
  }
}

async function selectLocationAccount(msg) {
  const message = await waMsgGetLastMessages(msg.from);
  if (/^ufood akun (\d+) lokasi (\d+)$/.test(message)) {
    if (msg.body === "ya") {
      const sso_id = await registeredGetSSOIDS(msg.from);
      const match = message.match(/^ufood akun (\d+) lokasi (\d+)$/);
      const index_id = match[1] - 1;
      const location = match[2];
      if (sso_id.length > 0) {
        const pick_sso_id = sso_id[index_id];
        if (await ssoEditAccountLocation(pick_sso_id, location)) {
          msg.reply("Lokasi akun berhasil diganti.");
        } else {
          msg.reply("Terjadi error ketika lokasi akun diganti.");
        }
      } else {
        msg.reply(
          "Tidak ada akun terdaftar. Gunakan perintah *_ufood daftar_* untuk mendaftarkan akun."
        );
      }
    } else {
      msg.reply("Lokasi akun dibatalkan untuk diganti!");
    }
    await waMsgEditConfirmation(msg.from, false);
  }
}

async function reminderActivationSubmission() {
  console.log(
    `TASK: Reminding to active submission and to buy another quota...`
  );
  const accounts = await getFalseSubmissionAccountsToday();
  for (const acc of accounts) {
    if (acc.available_quota > 0) {
      const account = await ssoGetAccount(acc.id);
      const wa_number = await registeredGetWANumberBySSOID(acc.id);
      client.sendMessage(
        wa_number,
        `*Reminder*\nAkun *_${account.email}_* masih memiliki kuota sebanyak ${account.available_quota}x dan belum melakukan aktivasi submit pengambilan otomatis!`
      );
    } else if (acc.reminded == 0) {
      const account = await ssoGetAccount(acc.id);
      const wa_number = await registeredGetWANumberBySSOID(acc.id);
      client.sendMessage(
        wa_number,
        `*Reminder*\nAkun *_${account.email}_* tidak memiliki kuota, silahkan lakukan pembelian kuota melalui *_ufood akun_*`
      );
      ssoEditAccountReminded(acc.id, true);
    }
  }
}
