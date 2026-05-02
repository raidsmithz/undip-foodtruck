const views = require("../views");
const {
  registeredGetSSOIDS,
  registeredRemoveAccountID,
  ssoGetAccount,
} = require("../../models/functions");
const { setPending, clearPending, pendingMatches } = require("../state");

module.exports = {
  name: "akun_hapus",
  match(body) {
    const m = body.match(/^ufood akun (\d+) hapus$/);
    if (m) return { kind: "request", n: parseInt(m[1], 10) };
    return null;
  },
  async handle({ msg, params }) {
    const sso_ids = await registeredGetSSOIDS(msg.from);
    if (!sso_ids || sso_ids.length === 0)
      return { reply: views.akunListEmpty() };
    const id = sso_ids[params.n - 1];
    if (!id) return { reply: views.akunNotFound(params.n) };
    const account = await ssoGetAccount(id);
    await setPending(msg.from, `delete:${id}`);
    return { reply: views.hapusConfirm(params.n, account) };
  },

  // Called by the router when user replies during a pending delete:N action.
  async resolveConfirm({ msg, pending }) {
    const parts = pendingMatches(pending, "delete");
    if (!parts) return null;
    const sso_id = parseInt(parts[0], 10);

    if (msg.body === "ya") {
      await clearPending(msg.from);
      const account = await ssoGetAccount(sso_id);
      const email = account ? account.email : "?";
      const ok = await registeredRemoveAccountID(msg.from, sso_id);
      if (!ok) return { reply: views.commandError() };
      const remaining = await registeredGetSSOIDS(msg.from);
      return { reply: views.hapusSuccess(email, remaining.length) };
    }
    if (msg.body === "batal" || msg.body === "tidak") {
      await clearPending(msg.from);
      return { reply: views.hapusBatal() };
    }
    // Anything else: keep pending, show hint. The 5-min auto-expire will
    // eventually clear it if the user truly walks away.
    return { reply: views.pendingHint(pending) };
  },
};
