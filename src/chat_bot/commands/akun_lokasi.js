const views = require("../views");
const {
  registeredGetSSOIDS,
  ssoGetAccount,
  ssoEditAccountLocation,
  getCountSubmission,
} = require("../../models/functions");

const MAX_PER_LOCATION = 30;

module.exports = {
  name: "akun_lokasi",
  match(body) {
    let m = body.match(/^ufood akun (\d+) lokasi (\d+)$/);
    if (m) return { kind: "set", n: parseInt(m[1], 10), loc: parseInt(m[2], 10) };
    m = body.match(/^ufood akun (\d+) lokasi$/);
    if (m) return { kind: "format", n: parseInt(m[1], 10) };
    return null;
  },
  async handle({ msg, params }) {
    const sso_ids = await registeredGetSSOIDS(msg.from);
    if (!sso_ids || sso_ids.length === 0)
      return { reply: views.akunListEmpty() };
    const id = sso_ids[params.n - 1];
    if (!id) return { reply: views.akunNotFound(params.n) };
    const account = await ssoGetAccount(id);

    if (params.kind === "format")
      return { reply: views.lokasiFormat(params.n, account) };

    if (params.loc < 1 || params.loc > 4)
      return { reply: views.lokasiInvalid() };

    if (account.pick_location === params.loc)
      return {
        reply: `*Akun ${params.n}* sudah berada di lokasi tersebut. Tidak ada perubahan.`,
      };

    if (account.enable_submit) {
      const count = await getCountSubmission(true, params.loc);
      if (count >= MAX_PER_LOCATION)
        return { reply: views.lokasiFullActive() };
    }

    const oldLoc = account.pick_location;
    const ok = await ssoEditAccountLocation(id, params.loc);
    if (!ok) return { reply: views.commandError() };

    return { reply: views.lokasiSnapshot(params.n, account, oldLoc, params.loc) };
  },
};
