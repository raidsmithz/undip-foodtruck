const views = require("../views");
const { isUndipEmail, UNDIP_EMAIL_RE } = require("../helpers");
const {
  registeredGetSSOIDS,
  ssoGetAccount,
  ssoEditAccountByID,
} = require("../../models/functions");

const GANTI_FULL_RE = new RegExp(
  `^ufood akun (\\d+) ganti (${UNDIP_EMAIL_RE.source.slice(1, -1)}) (.+)$`
);

module.exports = {
  name: "akun_ganti",
  match(body) {
    const full = body.match(GANTI_FULL_RE);
    if (full)
      return {
        kind: "set",
        n: parseInt(full[1], 10),
        email: full[2],
        password: full[3],
      };
    let m = body.match(/^ufood akun (\d+) ganti$/);
    if (m) return { kind: "format", n: parseInt(m[1], 10) };
    m = body.match(/^ufood akun (\d+) ganti .+$/);
    if (m) return { kind: "bad", n: parseInt(m[1], 10) };
    return null;
  },
  async handle({ msg, params, client, deps }) {
    const sso_ids = await registeredGetSSOIDS(msg.from);
    if (!sso_ids || sso_ids.length === 0)
      return { reply: views.akunListEmpty() };
    const id = sso_ids[params.n - 1];
    if (!id) return { reply: views.akunNotFound(params.n) };

    if (params.kind === "format") return { reply: views.gantiFormat(params.n) };
    if (params.kind === "bad") {
      const after = msg.body.match(/^ufood akun \d+ ganti (\S+)/);
      if (after && !isUndipEmail(after[1]))
        return { reply: views.daftarBadEmail() };
      return { reply: views.gantiFormat(params.n) };
    }

    const account = await ssoGetAccount(id);
    const oldEmail = account.email;
    const ok = await ssoEditAccountByID(id, {
      email: params.email,
      password: params.password,
      status_login: 0,
    });
    if (!ok) return { reply: views.commandError() };

    if (deps && deps.ADMIN_WHATSAPP && client) {
      client.sendMessage(
        deps.ADMIN_WHATSAPP,
        views.adminGantiCredential({ wa: msg.from, oldEmail, email: params.email, index: params.n })
      ).catch(() => {});
    }

    return { reply: views.gantiSnapshot(params.n, account, oldEmail, params.email) };
  },
};
