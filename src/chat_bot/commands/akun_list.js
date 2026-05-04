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
  couponsCheckTakenTodayBulk,
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

    // Parallelize: today-coupons probe + every account fetch run together
    const [todayCoupons, ...accounts] = await Promise.all([
      couponsGetAllEntriesToday(),
      ...sso_ids.map((id) => ssoGetAccount(id)),
    ]);
    const anyTakenToday = todayCoupons.length > 0;
    const weekday = isWeekday();
    let waitingLabel = "Menunggu";
    if (!weekday) waitingLabel = "Di Luar Jadwal";
    else if (!anyTakenToday) {
      if (isAfterTenThirty()) waitingLabel = "Libur/Error";
      else if (isAfterNineFortyFive()) waitingLabel = "Sistem Standby";
      else waitingLabel = "Menunggu";
    }

    // Batch the per-account "did I take a coupon today?" check into one query
    let takenSet = new Set();
    if (weekday && anyTakenToday) {
      takenSet = await couponsCheckTakenTodayBulk(accounts.filter((a) => a).map((a) => a.id));
    }

    const items = [];
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (!account) continue;
      let label;
      if (!weekday) label = "Di Luar Jadwal";
      else if (anyTakenToday) label = takenSet.has(account.id) ? "Dapat" : "Tidak Dapat";
      else label = waitingLabel;
      items.push(views.akunListItem(i + 1, account, label));
    }
    return {
      reply: items.join("\n\n") + "\n\n" + views.akunListFooter(sso_ids.length),
    };
  },
};
