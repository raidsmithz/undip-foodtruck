const schedule = require("node-schedule");
const { MessageMedia } = require("whatsapp-web.js");
const views = require("./views");
const { humanSleep } = require("./throttle");
const loginAccounts = require("../undip_login/login_accounts");
const {
  ssoGetAccount,
  registeredGetWANumberBySSOID,
  registeredGetIndexOfSSOID,
  couponsGetAllEntriesToday,
  couponsUpdateWASent,
  getCombinedSSOAccounts,
  getFalseSubmissionAccountsToday,
  ssoEditAccountReminded,
  waMsgExpireStaleBlocks,
} = require("../models/functions");

const COUPON_BATCH_LIMIT = 16;

// Cron schedule: every minute from 10:05 to 11:05 weekdays
const COUPON_TIMES = [
  "5 10 * * 1-5", "6 10 * * 1-5", "7 10 * * 1-5", "8 10 * * 1-5",
  "9 10 * * 1-5", "10 10 * * 1-5", "15 10 * * 1-5", "20 10 * * 1-5",
  "25 10 * * 1-5", "30 10 * * 1-5", "35 10 * * 1-5", "40 10 * * 1-5",
  "45 10 * * 1-5", "50 10 * * 1-5", "55 10 * * 1-5", "0 11 * * 1-5",
  "5 11 * * 1-5",
];

const RELOGIN_SCHEDULE = "15,45 * * * *";
const REMINDER_SCHEDULE = "0 7 * * 1-4";
const BLOCKED_SWEEP_SCHEDULE = "*/30 * * * *";

async function sendCoupons(client) {
  console.log("TASK: Sending taken coupons...");
  const taken = await couponsGetAllEntriesToday();
  if (!taken.length) return;
  let sent = 0;
  for (const coupon of taken) {
    if (sent >= COUPON_BATCH_LIMIT) break;
    if (coupon.wa_sent_at) continue;
    const account = await ssoGetAccount(coupon.sso_id);
    const wa = await registeredGetWANumberBySSOID(coupon.sso_id);
    if (!account || !wa) continue;
    if (sent > 0) await humanSleep();
    let delivered = false;
    if (coupon.taken_success) {
      try {
        const media = MessageMedia.fromFilePath(`./python/${coupon.coupon_file}`);
        await client.sendMessage(wa, media, {
          caption: views.couponReceived({
            email: account.email,
            quota: account.available_quota,
          }),
        });
        delivered = true;
      } catch (e) {
        console.error("[sendCoupons] media send failed", e.message);
      }
    } else {
      try {
        await client.sendMessage(wa, views.couponMissed(account.email));
        delivered = true;
      } catch (e) {
        console.error("[sendCoupons] miss notify failed", e.message);
      }
    }
    // Only mark wa_sent_at when the message actually went through. Otherwise
    // the next cron tick gets a chance to redeliver.
    if (delivered) {
      await couponsUpdateWASent(coupon.sso_id);
      sent += 1;
    }
  }
}

async function doLoginAccounts(client) {
  const before = await getCombinedSSOAccounts();
  const beforeMap = {};
  for (const acc of before) beforeMap[acc.dataValues.id] = acc.dataValues.status_login;
  const updatedIds = await loginAccounts();
  let notified = 0;
  for (const id of updatedIds) {
    const account = await ssoGetAccount(id);
    if (!account) continue;
    const wa = await registeredGetWANumberBySSOID(id);
    if (!wa) continue;
    let willSend = null;
    const idx = await registeredGetIndexOfSSOID(id);
    switch (account.status_login) {
      case 1: {
        const previous = beforeMap[id];
        if (previous === 0) willSend = views.reLoginSuccess(account.email);
        break;
      }
      case 4:
        willSend = views.reLoginPasswordWrong(account.email, idx);
        break;
      case 5:
        willSend = views.reLoginEmailWrong(account.email, idx);
        break;
    }
    if (willSend === null) continue;
    if (notified > 0) await humanSleep();
    try {
      await client.sendMessage(wa, willSend);
    } catch (_) {}
    notified += 1;
  }
}

async function reminderActivationSubmission(client) {
  console.log("TASK: Reminding to activate submission and buy quota...");
  const accounts = await getFalseSubmissionAccountsToday();
  let sent = 0;
  for (const acc of accounts) {
    const account = await ssoGetAccount(acc.id);
    if (!account) continue;
    const wa = await registeredGetWANumberBySSOID(acc.id);
    if (!wa) continue;
    const idx = await registeredGetIndexOfSSOID(acc.id);
    if (acc.available_quota > 0) {
      if (sent > 0) await humanSleep();
      try {
        await client.sendMessage(
          wa,
          views.reminderUnsubmitted(account.email, account.available_quota, idx)
        );
        sent += 1;
      } catch (_) {}
    } else if (acc.reminded === 0) {
      if (sent > 0) await humanSleep();
      try {
        await client.sendMessage(wa, views.reminderQuotaEmpty(account.email, idx));
        await ssoEditAccountReminded(acc.id, true);
        sent += 1;
      } catch (_) {}
    }
  }
}

async function sweepStaleBlocks() {
  try {
    const n = await waMsgExpireStaleBlocks();
    if (n > 0) console.log(`[cron] auto-expired ${n} stale ping blocks`);
  } catch (e) {
    console.error("[cron] sweepStaleBlocks failed", e.message);
  }
}

// All cron rules below are interpreted in WIB. Pass tz explicitly so the
// schedule is correct even if the host process forgets to set TZ env.
const TZ = "Asia/Jakarta";

function start(client) {
  for (const t of COUPON_TIMES)
    schedule.scheduleJob({ rule: t, tz: TZ }, () => sendCoupons(client));
  schedule.scheduleJob({ rule: RELOGIN_SCHEDULE, tz: TZ }, () =>
    doLoginAccounts(client)
  );
  schedule.scheduleJob({ rule: REMINDER_SCHEDULE, tz: TZ }, () =>
    reminderActivationSubmission(client)
  );
  schedule.scheduleJob({ rule: BLOCKED_SWEEP_SCHEDULE, tz: TZ }, sweepStaleBlocks);
}

module.exports = {
  start,
  sendCoupons,
  doLoginAccounts,
  reminderActivationSubmission,
  sweepStaleBlocks,
};
