const views = require("../views");
const {
  ssoGetAccount,
  ssoEditAccountQuota,
  ssoEditAccountEnableSubmit,
  ssoEditAccountReminded,
  getCountSubmission,
  waMsgGetFreeTrialStatus,
  waMsgEditFreeTrialStatus,
  waMsgGetSubscribedNumbers,
  errorLogRecent,
  statsForAdmin,
} = require("../../models/functions");
const { unblock } = require("../state");

const MAX_PER_LOCATION = 30;
const FREE_TRIAL_QUOTA = 2;

async function handlePaymentImageReply({ msg, client, deps }) {
  const quoted = await msg.getQuotedMessage();
  if (!quoted) return null;
  if (!quoted._data || !quoted._data.caption) return null;
  const captionParts = quoted._data.caption.split("_");
  const wa_number_account = captionParts[0];

  // ya N (free trial uses ya 0)
  const yaMatch = msg.body.match(/^ya (\d+)$/);
  if (yaMatch) {
    const addition = parseInt(yaMatch[1], 10);
    const pay_sso_id = parseInt(captionParts[1], 10);

    if (addition === 0) {
      if (await waMsgGetFreeTrialStatus(wa_number_account)) {
        await client.sendMessage(
          wa_number_account,
          "Anda sudah pernah menggunakan *Free Trial*. Silakan beli kuota dengan paket 4x atau 16x."
        );
        await msg.react("❌");
        return { reply: null };
      }
      const account = await ssoGetAccount(pay_sso_id);
      const oldQ = account.available_quota;
      await waMsgEditFreeTrialStatus(wa_number_account, true);
      await ssoEditAccountQuota(pay_sso_id, oldQ + FREE_TRIAL_QUOTA);
      const updated = await ssoGetAccount(pay_sso_id);
      let submitEnabled = updated.enable_submit;
      const locCount = await getCountSubmission(true, updated.pick_location);
      if (locCount < MAX_PER_LOCATION) {
        await ssoEditAccountEnableSubmit(updated.id, 1);
        submitEnabled = 1;
      }
      await ssoEditAccountReminded(updated.id, false);
      await client.sendMessage(
        wa_number_account,
        submitEnabled
          ? views.paymentSuccess({
              email: updated.email,
              oldQuota: oldQ,
              newQuota: updated.available_quota,
              submitEnabled: true,
            })
          : views.paymentSuccessLocationFull({
              email: updated.email,
              newQuota: updated.available_quota,
            })
      );
      await msg.react(submitEnabled ? "👍" : "🥲");
      return { reply: null };
    }

    if (pay_sso_id <= 0 || isNaN(pay_sso_id)) {
      await msg.react("😭");
      return { reply: null };
    }
    const account = await ssoGetAccount(pay_sso_id);
    const oldQ = account.available_quota;
    const ok = await ssoEditAccountQuota(pay_sso_id, oldQ + addition);
    if (!ok) {
      await msg.react("😭");
      return { reply: null };
    }
    const updated = await ssoGetAccount(pay_sso_id);
    let submitEnabled = updated.enable_submit;
    const locCount = await getCountSubmission(true, updated.pick_location);
    if (locCount < MAX_PER_LOCATION) {
      await ssoEditAccountEnableSubmit(updated.id, 1);
      submitEnabled = 1;
    }
    await ssoEditAccountReminded(updated.id, false);
    await client.sendMessage(
      wa_number_account,
      submitEnabled
        ? views.paymentSuccess({
            email: updated.email,
            oldQuota: oldQ,
            newQuota: updated.available_quota,
            submitEnabled: true,
          })
        : views.paymentSuccessLocationFull({
            email: updated.email,
            newQuota: updated.available_quota,
          })
    );
    await msg.react(submitEnabled ? "👍" : "🥲");
    return { reply: null };
  }

  if (msg.body === "tidak") {
    await msg.react("❌");
    await client.sendMessage(wa_number_account, views.paymentRejected());
    return { reply: null };
  }

  return null;
}

async function handlePingResolveReply({ msg, client }) {
  const quoted = await msg.getQuotedMessage();
  if (!quoted || !quoted.body) return null;
  const parts = quoted.body.split("_");
  const wa_number_account = parts[0];
  const reason = parts[1];

  if (msg.body === "sudah" && reason === "ping") {
    await unblock(wa_number_account);
    await client.sendMessage(wa_number_account, views.pingResolved());
    await msg.react("👍");
    return { reply: null };
  }
  return null;
}

async function handleBangCommand({ msg, client, deps }) {
  if (msg.body === "!login") {
    if (deps.doLoginAccounts) {
      deps.doLoginAccounts();
      return { reply: "Logging in accounts..." };
    }
    return { reply: "Login task tidak tersedia." };
  }
  if (msg.body === "!kupon") {
    if (deps.sendCoupons) {
      deps.sendCoupons();
      return { reply: "Sending today's coupons..." };
    }
    return { reply: "Coupon task tidak tersedia." };
  }
  if (msg.body.startsWith("!kirim ")) {
    const sendMessage = msg.body.slice("!kirim ".length);
    const numbers = await waMsgGetSubscribedNumbers();
    let sent = 0;
    for (const wa of numbers) {
      try {
        await client.sendMessage(wa, sendMessage);
        sent += 1;
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
      } catch (e) {
        // skip failed sends silently
      }
    }
    await msg.react("👍");
    return { reply: `Broadcast terkirim ke ${sent} nomor.` };
  }
  if (msg.body === "!errors" || msg.body.startsWith("!errors ")) {
    const arg = msg.body.slice("!errors".length).trim();
    let limit = 10;
    if (arg) {
      const n = parseInt(arg, 10);
      if (!isNaN(n) && n > 0 && n <= 50) limit = n;
    }
    const rows = await errorLogRecent(limit);
    return { reply: views.adminErrors(rows) };
  }
  if (msg.body === "!stats") {
    const stats = await statsForAdmin();
    return { reply: views.adminStats(stats) };
  }
  if (msg.body === "!unread") {
    const chats = await client.getChats();
    let total = 0;
    let chatsTouched = 0;
    for (const chat of chats) {
      if (chat.isGroup) continue;
      if (chat.id._serialized === "status@broadcast") continue;
      if (!chat.unreadCount || chat.unreadCount <= 0) continue;

      const fetched = await chat.fetchMessages({ limit: Math.max(30, chat.unreadCount * 2) });
      const incoming = fetched.filter((m) => !m.fromMe);
      const unread = incoming.slice(-chat.unreadCount);

      for (const m of unread) {
        try {
          await deps.router.route(m, client, deps);
          total += 1;
        } catch (err) {
          console.error("[!unread] route() failed:", err);
        }
      }
      try {
        await chat.sendSeen();
      } catch (_) {}
      chatsTouched += 1;
    }
    await msg.react("👍");
    return { reply: `Replayed ${total} unread message(s) across ${chatsTouched} chat(s).` };
  }
  return null;
}

module.exports = {
  name: "admin",
  async handle(ctx) {
    const { msg } = ctx;
    if (msg.hasQuotedMsg) {
      const paymentReply = await handlePaymentImageReply(ctx);
      if (paymentReply !== null) return paymentReply;
      const pingReply = await handlePingResolveReply(ctx);
      if (pingReply !== null) return pingReply;
      return null;
    }
    return await handleBangCommand(ctx);
  },
};
