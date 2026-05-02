const dotenv = require("dotenv");
dotenv.config();

const { Client, LocalAuth } = require("whatsapp-web.js");

// Wrap puppeteer with the stealth plugin so WhatsApp Web's anti-bot detection
// can't pick up the obvious automation tells (navigator.webdriver, missing
// chrome.runtime, plugin-list mismatch, canvas fingerprint anomalies, etc.).
// We push the wrapped instance into Node's module cache under "puppeteer" so
// that whatsapp-web.js's internal require("puppeteer") resolves to it.
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(StealthPlugin());
require.cache[require.resolve("puppeteer")] = { exports: puppeteerExtra };

const qrcode_terminal = require("qrcode-terminal");

const router = require("./router");
const cron = require("./cron");

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || "";
const ADMIN_WHATSAPP_SELF = process.env.ADMIN_WHATSAPP_SELF || "";
const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_EXECUTABLE_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CHROME_HEADLESS =
  (process.env.CHROME_HEADLESS || "false").toLowerCase() === "true";

if (!ADMIN_WHATSAPP || !ADMIN_WHATSAPP_SELF) {
  console.warn(
    "[bot] ADMIN_WHATSAPP / ADMIN_WHATSAPP_SELF not set — admin flows disabled."
  );
}

let client;
let listenerInitialized = false;

const deps = {
  ADMIN_WHATSAPP,
  ADMIN_WHATSAPP_SELF,
  // late-bound: cron.start exposes these so admin's !login / !kupon can call them
  doLoginAccounts: () => cron.doLoginAccounts(client),
  sendCoupons: () => cron.sendCoupons(client),
};

(async () => {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./src/chat_bot/wa_session" }),
    puppeteer: {
      executablePath: CHROME_EXECUTABLE_PATH,
      headless: CHROME_HEADLESS,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--lang=id-ID,id",
      ],
    },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    // Let whatsapp-web.js use its bundled webVersion/webVersionCache; overriding
    // breaks the handshake and surfaces as "Try Again" on QR scan.
  });

  client.on("loading_screen", (p, m) => console.log("LOADING SCREEN", p, m));
  client.on("remote_session_saved", () => console.log("REMOTE AUTH DATA SAVED"));
  client.on("qr", (qr) => {
    qrcode_terminal.generate(qr, { small: true });
    console.log("QR RECEIVED", qr);
  });
  client.on("authenticated", () => console.log("AUTHENTICATED"));
  client.on("disconnected", (reason) => console.log(`DISCONNECTED: ${reason}`));
  client.on("auth_failure", (m) => console.error("AUTHENTICATION FAILURE", m));

  client.on("ready", async () => {
    console.log("READY");
    if (listenerInitialized) return;
    await new Promise((r) => setTimeout(r, 20000));

    cron.start(client);

    client.on("message", async (msg) => {
      try {
        await router.route(msg, client, deps);
      } catch (err) {
        console.error("[bot] route() unhandled", err);
      }
    });

    listenerInitialized = true;
  });

  client.initialize();
})();

module.exports = {
  get client() {
    return client;
  },
};
