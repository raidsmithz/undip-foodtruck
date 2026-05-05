const views = require("../views");
const { humanSleep } = require("../throttle");
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
  couponRunSummary,
  listLidWaNumbers,
  mergeLidIntoCus,
  waMsgUnsubscribeInactiveBefore,
  ssoBulkGiftSubscribed,
  dedupeSameEmailPerWa,
} = require("../../models/functions");

// Users inactive for this many days get auto-unsubscribed before any blast.
const INACTIVITY_DAYS = 90;
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
    // Prune dormant users first so we don't keep messaging dead inboxes
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
    const pruned = await waMsgUnsubscribeInactiveBefore(cutoff);
    const numbers = await waMsgGetSubscribedNumbers();
    let sent = 0;
    for (const wa of numbers) {
      if (sent > 0) await humanSleep();
      try {
        await client.sendMessage(wa, sendMessage);
        sent += 1;
      } catch (e) {
        // skip failed sends silently
      }
    }
    await msg.react("👍");
    return {
      reply:
        `Broadcast terkirim ke ${sent} nomor.\n` +
        (pruned > 0 ? `_(${pruned} dormant user (>${INACTIVITY_DAYS} hari) di-unsubscribe sebelum broadcast)_` : ""),
    };
  }
  if (msg.body.startsWith("!gift ")) {
    const n = parseInt(msg.body.slice("!gift ".length).trim(), 10);
    if (!Number.isInteger(n) || n <= 0 || n > 100) {
      return { reply: "Format: *_!gift N_* (1–100). Contoh: *_!gift 2_*" };
    }
    const result = await ssoBulkGiftSubscribed(n);
    if (result.users === 0) {
      return { reply: "Tidak ada user subscribed dengan akun terdaftar." };
    }
    // Notify each user with anti-ban jitter; send in background so the admin
    // gets the summary reply quickly even if there are many recipients.
    (async () => {
      let notified = 0;
      for (const u of result.perUser) {
        if (notified > 0) await humanSleep();
        try {
          await client.sendMessage(u.wa_number, views.giftBonus(n, u.sso_ids.length));
          notified += 1;
        } catch (_) {}
      }
      console.log(`[!gift] notified ${notified}/${result.users}`);
    })();
    await msg.react("🎁");
    return {
      reply:
        `🎁 *Gift +${n}x kupon* applied:\n` +
        `*Users:* _${result.users}_\n` +
        `*Akun SSO:* _${result.accounts}_\n` +
        `_(notif WA dikirim ke tiap user dengan jitter — selesai dalam ~${Math.round((result.users * 1.05) / 60)} menit)_`,
    };
  }
  if (msg.body === "!dedupe") {
    const r = await dedupeSameEmailPerWa();
    let body =
      `*Dedupe Same-Email-Same-WA*\n\n` +
      `*Groups merged:* _${r.groups}_\n` +
      `*Rows deleted:* _${r.mergedRows}_`;
    if (r.detail.length > 0) {
      body += "\n\n_Detail:_\n";
      for (const d of r.detail.slice(0, 10)) {
        body += `• ${d.email}: kept #${d.kept}, dropped #${d.dropped.join(", ")}\n`;
      }
      if (r.detail.length > 10) body += `... +${r.detail.length - 10} more\n`;
    }
    return { reply: body };
  }
  if (msg.body === "!sweep_inactive") {
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
    const pruned = await waMsgUnsubscribeInactiveBefore(cutoff);
    return {
      reply:
        `*Sweep Inactive*\n` +
        `*Cutoff:* updated_at < ${cutoff.toISOString().slice(0, 10)}\n` +
        `*Unsubscribed:* _${pruned} user_`,
    };
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
  if (msg.body === "!admin" || msg.body === "!help") {
    return { reply: views.adminHelp() };
  }
  if (msg.body === "!migrate_lid") {
    const lidIds = await listLidWaNumbers();
    let resolved = 0;
    let merged = 0;
    let unresolved = 0;
    const failed = [];
    for (const lidId of lidIds) {
      try {
        const c = await client.getContactById(lidId);
        if (c && c.id && c.id.server === "c.us" && c.id._serialized) {
          resolved += 1;
          const r = await mergeLidIntoCus(lidId, c.id._serialized);
          if (r.changed) merged += 1;
        } else {
          unresolved += 1;
          failed.push(lidId);
        }
      } catch (e) {
        unresolved += 1;
        failed.push(`${lidId} (${e.message.slice(0, 40)})`);
      }
      // pace ourselves so we don't hammer WA Web Store
      await new Promise((r) => setTimeout(r, 250));
    }
    let body =
      `*Migrate LID*\n\n` +
      `*Total LID rows:* _${lidIds.length}_\n` +
      `*Resolved → c.us:* _${resolved}_\n` +
      `*Merged:* _${merged}_\n` +
      `*Unresolved:* _${unresolved}_`;
    if (failed.length > 0) {
      body += `\n\n_Unresolved IDs:_\n` + failed.slice(0, 10).join("\n");
      if (failed.length > 10) body += `\n... +${failed.length - 10} more`;
    }
    return { reply: body };
  }
  if (msg.body === "!stats") {
    const stats = await statsForAdmin();
    return { reply: views.adminStats(stats) };
  }
  if (msg.body === "!coupon" || msg.body.startsWith("!coupon ")) {
    const arg = msg.body.slice("!coupon".length).trim();
    let target = null;
    if (arg) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
        return { reply: "Format: *!coupon* atau *!coupon YYYY-MM-DD*" };
      }
      target = arg;
    }
    const summary = await couponRunSummary(target);
    return { reply: views.adminCouponRun(summary) };
  }
  if (msg.body === "!unread") {
    console.log("[!unread] start");
    try {
      await msg.react("⏳");
    } catch (e) {
      console.log("[!unread] react failed:", e.message);
    }
    const chats = await client.getChats();
    console.log(`[!unread] getChats returned ${chats.length} chats`);
    let total = 0;
    let chatsTouched = 0;
    for (const chat of chats) {
      if (chat.isGroup) continue;
      if (chat.id._serialized === "status@broadcast") continue;
      if (!chat.unreadCount || chat.unreadCount <= 0) continue;

      console.log(`[!unread] chat ${chat.id._serialized} has ${chat.unreadCount} unread`);
      let fetched;
      try {
        fetched = await chat.fetchMessages({
          limit: Math.max(30, chat.unreadCount * 2),
        });
      } catch (e) {
        console.error(`[!unread] fetchMessages failed for ${chat.id._serialized}:`, e.message);
        continue;
      }
      const incoming = fetched.filter((m) => !m.fromMe);
      const unread = incoming.slice(-chat.unreadCount);
      console.log(`[!unread]   replaying ${unread.length} messages`);

      for (const m of unread) {
        if (total > 0) await humanSleep();
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
    console.log(`[!unread] done — replayed ${total} across ${chatsTouched} chats`);
    try {
      await msg.react("👍");
    } catch (_) {}
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
