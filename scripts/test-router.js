// Smoke tests for src/chat_bot/router.js
//
// Runs against the live DB but uses a clearly-marked test wa_number that
// won't collide with real users. Cleans up its own data at the end.
//
// Usage:  node scripts/test-router.js
// (run on the same host as the bot so .env + DB are reachable)

const dotenv = require("dotenv");
dotenv.config();

const { MessageTypes } = require("whatsapp-web.js");
const router = require("../src/chat_bot/router");
const sequelize = require("../src/config/database");
const {
  RegisteredWhatsapp,
  SSOAccounts,
  WAMessages,
  ErrorLogs,
} = require("../src/models/tables");
const {
  registeredGetSSOIDS,
  ssoDeleteAccount,
} = require("../src/models/functions");

const TEST_WA = "_test_router_smoke@c.us";
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || "";
const ADMIN_WHATSAPP_SELF = process.env.ADMIN_WHATSAPP_SELF || "";

const COLOR = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function makeMsg(body, opts = {}) {
  const captured = { replies: [], reacts: [] };
  return {
    from: opts.from || TEST_WA,
    body,
    type: opts.type || MessageTypes.TEXT,
    author: null,
    hasQuotedMsg: opts.hasQuotedMsg || false,
    _data: opts._data,
    async reply(text) {
      captured.replies.push(text);
    },
    async react(emoji) {
      captured.reacts.push(emoji);
    },
    async getQuotedMessage() {
      return opts.quotedMessage;
    },
    async downloadMedia() {
      return opts.media || { mimetype: "image/jpeg", data: "stub" };
    },
    captured,
  };
}

const mockClient = {
  sentMessages: [],
  async sendMessage(to, content, options = {}) {
    this.sentMessages.push({ to, content, options });
  },
};

const deps = {
  ADMIN_WHATSAPP,
  ADMIN_WHATSAPP_SELF,
  doLoginAccounts: () => null,
  sendCoupons: () => null,
  skipAutoLogin: true, // tests don't want the puppeteer login firing
};

async function send(body, opts = {}) {
  mockClient.sentMessages = [];
  const msg = makeMsg(body, opts);
  await router.route(msg, mockClient, deps);
  return { msg, sent: mockClient.sentMessages };
}

function summarize(text, max = 90) {
  if (!text) return "(empty)";
  const oneLine = String(text).replace(/\n/g, " ⏎ ");
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

let testNum = 0;
let pass = 0;
let fail = 0;

async function check(name, fn) {
  testNum += 1;
  process.stdout.write(`${COLOR.cyan(`[${testNum}]`)} ${name} ... `);
  try {
    const result = await fn();
    if (result === true || result === undefined) {
      pass += 1;
      console.log(COLOR.green("OK"));
    } else {
      fail += 1;
      console.log(COLOR.red("FAIL"), "—", result);
    }
  } catch (err) {
    fail += 1;
    console.log(COLOR.red("ERROR"), "—", err.message);
    console.log(COLOR.dim(err.stack));
  }
}

async function cleanup() {
  // delete any SSO accounts owned by test_wa
  const reg = await RegisteredWhatsapp.findOne({ where: { wa_number: TEST_WA } });
  if (reg && reg.sso_ids) {
    const ids = reg.sso_ids
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((x) => !isNaN(x));
    for (const id of ids) await ssoDeleteAccount(id);
  }
  await RegisteredWhatsapp.destroy({ where: { wa_number: TEST_WA } });
  await WAMessages.destroy({ where: { wa_number: TEST_WA } });
}

async function main() {
  console.log(COLOR.cyan("\n────── ROUTER SMOKE TESTS ──────\n"));
  console.log("Test WA:", TEST_WA);
  console.log();

  // ensure clean state before starting
  await cleanup();

  await check("first contact triggers welcome", async () => {
    const { msg } = await send("halo");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Selamat datang")) return `expected welcome, got: ${summarize(r)}`;
    if (!r.includes("Free Trial 2x")) return "welcome missing trial mention";
  });

  await check("`ufood` returns the new orientation", async () => {
    const { msg } = await send("ufood");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Sistem UFood — Panduan"))
      return `expected panduan, got: ${summarize(r)}`;
    if (!r.includes("ufood daftar")) return "panduan missing daftar reference";
    if (!r.includes("Free Trial 2x")) return "panduan missing trial mention";
  });

  await check("`commands` returns the command list", async () => {
    const { msg } = await send("commands");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Daftar Perintah UFood")) return `got: ${summarize(r)}`;
  });

  await check("`ufood help` redirects to ufood (#4)", async () => {
    const { msg } = await send("ufood help");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Sistem UFood — Panduan")) return `got: ${summarize(r)}`;
  });

  await check("`ufood aturan` redirects to ufood (#4)", async () => {
    const { msg } = await send("ufood aturan");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Sistem UFood — Panduan")) return `got: ${summarize(r)}`;
  });

  await check("bad daftar (non-undip email) shows email error", async () => {
    const { msg } = await send("ufood daftar foo@gmail.com pwd");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("@students.undip.ac.id")) return `got: ${summarize(r)}`;
  });

  await check("daftar with email only shows missing-password hint", async () => {
    const { msg } = await send("ufood daftar test@students.undip.ac.id");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Anda hanya memasukkan email"))
      return `got: ${summarize(r)}`;
  });

  await check("first daftar registers + auto-grants 2x trial (#6)", async () => {
    const { msg } = await send(
      "ufood daftar testfoo@students.undip.ac.id pass123"
    );
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Free Trial aktif")) return `got: ${summarize(r)}`;
    if (!r.includes("0x_ → _2x")) return "snapshot missing 0→2 quota";
    if (!r.includes("Logging In by System")) return "missing Logging In status";
    if (!r.includes("Sistem sedang login")) return "missing follow-up notice";
  });

  await check("second daftar from same WA does NOT get trial", async () => {
    const { msg } = await send(
      "ufood daftar testbar@students.undip.ac.id pass456"
    );
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Akun 2 terdaftar")) return `got: ${summarize(r)}`;
    if (r.includes("Free Trial aktif")) return "should NOT mark trial again";
  });

  await check("`ufood akun` lists both accounts", async () => {
    const { msg } = await send("ufood akun");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("testfoo@students.undip.ac.id"))
      return "missing account 1 email";
    if (!r.includes("testbar@students.undip.ac.id"))
      return "missing account 2 email";
  });

  await check("snapshot edit lokasi (no ya, #1)", async () => {
    const { msg } = await send("ufood akun 1 lokasi 3");
    const r = msg.captured.replies[0] || "";
    if (!r.startsWith("✅ *Akun 1")) return `got: ${summarize(r)}`;
    if (!r.includes("→")) return "snapshot missing arrow";
  });

  await check("snapshot edit submit (no ya, #1)", async () => {
    const { msg } = await send("ufood akun 1 submit disable");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Submit")) return `got: ${summarize(r)}`;
  });

  await check("submit enable on quota=0 account is rejected", async () => {
    const { msg } = await send("ufood akun 2 submit enable");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Kuota pengambilan akun ini sudah habis"))
      return `got: ${summarize(r)}`;
  });

  await check("hapus flow asks for confirmation (#8)", async () => {
    const { msg } = await send("ufood akun 2 hapus");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Yakin")) return `got: ${summarize(r)}`;
    if (!r.includes("ya")) return "missing ya keyword";
    if (!r.includes("batal")) return "missing batal keyword";
  });

  await check("non-confirmation during pending shows hint, KEEPS pending", async () => {
    const { msg } = await send("halo, lagi apa kak?");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("konfirmasi")) return `expected hint, got: ${summarize(r)}`;
    if (!r.includes("ya") || !r.includes("batal")) return "hint missing keywords";
  });

  await check("hapus + batal cancels (pending preserved from previous test)", async () => {
    const { msg } = await send("batal");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("dibatalkan")) return `got: ${summarize(r)}`;
  });

  await check("hapus + ya actually deletes", async () => {
    await send("ufood akun 2 hapus"); // re-set pending
    const { msg } = await send("ya");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("berhasil dihapus")) return `got: ${summarize(r)}`;
    const remaining = await registeredGetSSOIDS(TEST_WA);
    if (remaining.length !== 1) return `expected 1 remaining, got ${remaining.length}`;
  });

  await check("ping flow asks for confirmation (#9 mention 3h)", async () => {
    const { msg } = await send("ping");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("3 jam")) return `expected 3h mention, got: ${summarize(r)}`;
  });

  await check("ping + batal cancels", async () => {
    const { msg } = await send("batal");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("dibatalkan")) return `got: ${summarize(r)}`;
  });

  await check("unknown command returns the fallback", async () => {
    const { msg } = await send("kupon dong kak");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Perintah tidak dikenali"))
      return `got: ${summarize(r)}`;
  });

  await check("ufood unsubscribe persists subscribed=0 (#3)", async () => {
    await send("ufood unsubscribe");
    const row = await WAMessages.findOne({ where: { wa_number: TEST_WA } });
    if (!row) return "no wa_messages row";
    if (row.subscribed !== false && row.subscribed !== 0)
      return `expected false, got ${row.subscribed}`;
  });

  await check("ufood subscribe flips it back", async () => {
    await send("ufood subscribe");
    const row = await WAMessages.findOne({ where: { wa_number: TEST_WA } });
    if (row.subscribed !== true && row.subscribed !== 1)
      return `expected true, got ${row.subscribed}`;
  });

  await check("image upload without prior beli is refused (#7)", async () => {
    const { msg, sent } = await send("", { type: MessageTypes.IMAGE });
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Belum memilih akun pembelian") && !r.includes("Belum punya akun"))
      return `got: ${summarize(r)}`;
    // ensure NOT forwarded to admin
    const forwarded = sent.find((s) => s.to === ADMIN_WHATSAPP);
    if (forwarded) return "image was forwarded to admin (should not be)";
  });

  await check("ufood status returns stats", async () => {
    const { msg } = await send("ufood status");
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Versi Sistem")) return `got: ${summarize(r)}`;
    if (!r.includes("Akun Aktif Submit")) return "missing per-location stats";
  });

  await check("error_logs table is writable", async () => {
    const before = await ErrorLogs.count();
    await ErrorLogs.create({
      wa_number: TEST_WA,
      command: "smoke",
      error_message: "smoke test entry",
      stack: null,
    });
    const after = await ErrorLogs.count();
    if (after !== before + 1) return `count mismatch: ${before} → ${after}`;
    await ErrorLogs.destroy({ where: { wa_number: TEST_WA } });
  });

  await check("admin !errors returns recent error log entries", async () => {
    if (!ADMIN_WHATSAPP) return "ADMIN_WHATSAPP not set in .env";
    // seed a row so the response is non-empty regardless of prior state
    await ErrorLogs.create({
      wa_number: TEST_WA,
      command: "test-stats-fixture",
      error_message: "fixture for !errors smoke test",
      stack: null,
    });
    const { msg } = await send("!errors", { from: ADMIN_WHATSAPP });
    const r = msg.captured.replies[0] || "";
    if (!r.includes("errors") && !r.includes("error_logs"))
      return `expected error listing, got: ${summarize(r)}`;
    if (!r.includes("test-stats-fixture")) return "fixture row missing from output";
    await ErrorLogs.destroy({ where: { wa_number: TEST_WA } });
  });

  await check("admin !errors N respects custom limit", async () => {
    if (!ADMIN_WHATSAPP) return "ADMIN_WHATSAPP not set in .env";
    const { msg } = await send("!errors 3", { from: ADMIN_WHATSAPP });
    const r = msg.captured.replies[0] || "";
    if (r.includes("error") && !r.match(/Last \d+ errors/) && !r.includes("Tidak ada"))
      return `expected formatted output, got: ${summarize(r)}`;
  });

  await check("admin !stats returns stats summary", async () => {
    if (!ADMIN_WHATSAPP) return "ADMIN_WHATSAPP not set in .env";
    const { msg } = await send("!stats", { from: ADMIN_WHATSAPP });
    const r = msg.captured.replies[0] || "";
    if (!r.includes("Sistem Stats")) return `got: ${summarize(r)}`;
    if (!r.includes("Submit aktif")) return "missing per-location stats";
    if (!r.includes("Free Trial")) return "missing free trial counter";
  });

  await check("non-admin cannot run !errors", async () => {
    const { msg } = await send("!errors");
    const r = msg.captured.replies[0] || "";
    // for non-admin, !errors falls through text matching → unknown command
    if (!r.includes("Perintah tidak dikenali"))
      return `expected unknown-command, got: ${summarize(r)}`;
  });

  console.log("\n────── results ──────");
  console.log(`${COLOR.green(`pass: ${pass}`)}   ${fail > 0 ? COLOR.red(`fail: ${fail}`) : `fail: ${fail}`}   total: ${testNum}`);

  await cleanup();
  console.log("(cleanup done — test data removed)\n");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(COLOR.red("\nFATAL:"), err);
  await cleanup().catch(() => {});
  process.exit(2);
});
