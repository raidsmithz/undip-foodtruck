const views = require("../views");
const {
  isWeekday,
  isAfterTenThirty,
  isAfterNineFortyFive,
} = require("../helpers");
const {
  registeredGetSSOIDS,
  ssoGetAccount,
  couponsGetAllEntriesToday,
  couponsCheckTakenToday,
} = require("../../models/functions");

module.exports = {
  name: "akun_list",
  match(body) {
    if (body === "ufood akun") return { kind: "list" };
    const m = body.match(/^ufood akun (\d+)$/);
    if (m) return { kind: "detail", n: parseInt(m[1], 10) };
    return null;
  },
  async handle({ msg, params }) {
    const sso_ids = await registeredGetSSOIDS(msg.from);
    if (!sso_ids || sso_ids.length === 0)
      return { reply: views.akunListEmpty() };

    if (params.kind === "detail") {
      const idx = params.n - 1;
      const id = sso_ids[idx];
      if (!id) return { reply: views.akunNotFound(params.n) };
      const account = await ssoGetAccount(id);
      return { reply: views.akunDetail(params.n, account) };
    }

    const todayCoupons = await couponsGetAllEntriesToday();
    const anyTakenToday = todayCoupons.length > 0;
    const weekday = isWeekday();
    let waitingLabel = "Menunggu";
    if (!weekday) waitingLabel = "Di Luar Jadwal";
    else if (!anyTakenToday) {
      if (isAfterTenThirty()) waitingLabel = "Libur/Error";
      else if (isAfterNineFortyFive()) waitingLabel = "Sistem Standby";
      else waitingLabel = "Menunggu";
    }

    const items = [];
    for (let i = 0; i < sso_ids.length; i++) {
      const account = await ssoGetAccount(sso_ids[i]);
      let label;
      if (!weekday) label = "Di Luar Jadwal";
      else if (anyTakenToday) {
        const dapat = await couponsCheckTakenToday(account.id);
        label = dapat ? "Dapat" : "Tidak Dapat";
      } else label = waitingLabel;
      items.push(views.akunListItem(i + 1, account, label));
    }
    return { reply: items.join("\n\n") + "\n\n" + views.akunListFooter() };
  },
};
