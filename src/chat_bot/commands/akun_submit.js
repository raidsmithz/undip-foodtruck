const views = require("../views");
const {
  registeredGetSSOIDS,
  ssoGetAccount,
  ssoEditAccountEnableSubmit,
  getCountSubmission,
} = require("../../models/functions");

const MAX_PER_LOCATION = 30;

module.exports = {
  name: "akun_submit",
  match(body) {
    let m = body.match(/^ufood akun (\d+) submit (enable|disable)$/);
    if (m) return { kind: "set", n: parseInt(m[1], 10), enable: m[2] === "enable" };
    m = body.match(/^ufood akun (\d+) submit$/);
    if (m) return { kind: "format", n: parseInt(m[1], 10) };
    if (body.match(/^ufood akun (\d+) submit \S+$/))
      return { kind: "bad", n: parseInt(body.match(/^ufood akun (\d+)/)[1], 10) };
    return null;
  },
  async handle({ msg, params }) {
    const sso_ids = await registeredGetSSOIDS(msg.from);
    if (!sso_ids || sso_ids.length === 0)
      return { reply: views.akunListEmpty() };
    const id = sso_ids[params.n - 1];
    if (!id) return { reply: views.akunNotFound(params.n) };
    const account = await ssoGetAccount(id);

    if (params.kind === "format" || params.kind === "bad")
      return { reply: views.submitFormat(params.n, account) };

    if (params.enable && account.available_quota === 0)
      return { reply: views.submitNoQuota(params.n) };

    if (params.enable) {
      const count = await getCountSubmission(true, account.pick_location);
      if (count >= MAX_PER_LOCATION)
        return { reply: views.submitLocationFull(params.n) };
    }

    const oldVal = !!account.enable_submit;
    if (oldVal === params.enable)
      return {
        reply: `*Akun ${params.n}* sudah dalam status _${oldVal ? "Enabled" : "Disabled"}_. Tidak ada perubahan.`,
      };

    const ok = await ssoEditAccountEnableSubmit(id, params.enable ? 1 : 0);
    if (!ok) return { reply: views.commandError() };

    return {
      reply: views.submitSnapshot(params.n, account, oldVal, params.enable),
    };
  },
};
