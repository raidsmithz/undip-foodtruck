const views = require("../views");
const { isUndipEmail, UNDIP_EMAIL_RE } = require("../helpers");
const {
  registeredCountSSOIDS,
  ssoGetAccount,
  daftarOrUpdateAccount,
  errorLogAdd,
} = require("../../models/functions");
const { loginSingleAccount } = require("../../undip_login/login_accounts");

const TECH_FAIL_STATUSES = new Set([7, 8, -1]);

async function loginAndNotify(client, wa_number, sso_id, accountIndex, email, password, adminWa = null) {
  let status;
  try {
    status = await loginSingleAccount({ sso_id, email, password });
  } catch (err) {
    console.error("[loginAndNotify] failed", err);
    await errorLogAdd(wa_number, `loginSingleAccount:${sso_id}`, err);
    status = 8;
  }
  if (TECH_FAIL_STATUSES.has(status)) {
    if (adminWa) {
      try {
        await client.sendMessage(
          adminWa,
          views.adminLoginFailed({ idx: accountIndex, email, statusCode: status })
        );
      } catch (_) {}
    }
  } else {
    try {
      await client.sendMessage(wa_number, views.loginResult(accountIndex, email, status));
    } catch (_) {}
  }
}

const MAX_ACCOUNTS = 3;
const TRIAL_QUOTA = 2;

const DAFTAR_FULL_RE = new RegExp(
  `^ufood daftar (${UNDIP_EMAIL_RE.source.slice(1, -1)}) (.+)$`
);
const DAFTAR_EMAIL_ONLY_RE = new RegExp(
  `^ufood daftar (${UNDIP_EMAIL_RE.source.slice(1, -1)})$`
);

module.exports = {
  name: "daftar",
  match(body) {
    if (body === "ufood daftar") return { kind: "format" };
    const full = body.match(DAFTAR_FULL_RE);
    if (full) return { kind: "register", email: full[1], password: full[2] };
    const emailOnly = body.match(DAFTAR_EMAIL_ONLY_RE);
    if (emailOnly) return { kind: "missing_password" };
    if (body.startsWith("ufood daftar ")) return { kind: "bad" };
    return null;
  },
  async handle({ msg, params, client, deps = {} }) {
    if (params.kind === "format") return { reply: views.daftarFormat() };
    if (params.kind === "missing_password")
      return { reply: views.daftarMissingPassword(msg.body) };
    if (params.kind === "bad") {
      const looksLikeEmail = /^ufood daftar \S+@\S+\.\S+/.test(msg.body);
      if (looksLikeEmail && !isUndipEmail(msg.body.split(" ")[2] || ""))
        return { reply: views.daftarBadEmail() };
      return { reply: views.daftarFormat() };
    }

    // MAX_ACCOUNTS check happens AFTER existing-email check inside
    // daftarOrUpdateAccount so a repeat-email submission is treated as an
    // update and never bumps the count.
    const result = await daftarOrUpdateAccount(
      msg.from,
      params.email,
      params.password,
      { trialQuota: TRIAL_QUOTA, maxAccounts: MAX_ACCOUNTS }
    );

    if (!result.ok) {
      if (result.kind === "max_reached")
        return { reply: views.daftarMaxAccounts(MAX_ACCOUNTS) };
      return {
        reply: "Terjadi kendala saat mendaftarkan akun. Silakan coba lagi.",
      };
    }

    if (result.kind === "updated") {
      // Re-trigger SSO login with the new credentials
      if (!deps.skipAutoLogin) {
        loginAndNotify(
          client,
          msg.from,
          result.sso_id,
          result.account_index,
          params.email,
          params.password,
          deps.ADMIN_WHATSAPP || null
        );
      }
      if (deps.ADMIN_WHATSAPP) {
        client.sendMessage(
          deps.ADMIN_WHATSAPP,
          views.adminNewRegistration({ wa: msg.from, email: params.email, index: result.account_index, kind: "updated" })
        ).catch(() => {});
      }
      return {
        reply:
          `🔁 *Akun ${result.account_index} (${params.email}) — kredensial diperbarui*\n\n` +
          "Email sudah terdaftar di nomor ini. Password lama digantikan dengan password baru. " +
          "Sistem akan login ulang dengan kredensial baru ini.\n\n" +
          "⏳ Notifikasi hasil login dikirim dalam <1 menit.",
      };
    }

    const reply = result.applied_trial
      ? views.daftarSuccessWithTrial({
          index: result.account_index,
          email: params.email,
          location: result.location,
          oldQuota: 0,
          newQuota: TRIAL_QUOTA,
          submitEnabled: result.submit_enabled,
        })
      : views.daftarSuccessNoTrial({
          index: result.account_index,
          email: params.email,
          location: result.location,
          reason: result.is_first_account ? "trial_used" : "not_first",
        });

    // Fire-and-forget: log this account into Undip SSO right away. The user
    // already got the snapshot reply showing "Logging In by System ⏳"; once
    // the login finishes (success or specific error) they'll get a follow-up
    // DM with the actual status. Tests can disable this via deps.skipAutoLogin.
    if (!deps.skipAutoLogin) {
      loginAndNotify(
        client,
        msg.from,
        result.sso_id,
        result.account_index,
        params.email,
        params.password,
        deps.ADMIN_WHATSAPP || null
      );
    }
    if (deps.ADMIN_WHATSAPP) {
      client.sendMessage(
        deps.ADMIN_WHATSAPP,
        views.adminNewRegistration({
          wa: msg.from,
          email: params.email,
          index: result.account_index,
          kind: "new",
          location: result.location,
        })
      ).catch(() => {});
    }

    return { reply };
  },
};
