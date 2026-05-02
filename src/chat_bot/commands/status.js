const views = require("../views");
const {
  couponsCountTakenEntries,
  registeredTotalAccounts,
  ssoCountTotalAccounts,
  getCountSubmission,
  couponsCountLatestEntriesLocation,
} = require("../../models/functions");

const MAX_PER_LOCATION = 30;
const HISTORICAL_OFFSET = 1771; // bot's running historical baseline

module.exports = {
  name: "status",
  match(body) {
    return body === "ufood status" ? {} : null;
  },
  async handle() {
    const [totalCoupons, totalUsers, totalSso] = await Promise.all([
      couponsCountTakenEntries(),
      registeredTotalAccounts(),
      ssoCountTotalAccounts(),
    ]);
    const perLocation = {};
    const pickupToday = {};
    for (const loc of [1, 2, 3, 4]) {
      perLocation[loc] = await getCountSubmission(true, loc);
      const success = await couponsCountLatestEntriesLocation(loc, [true]);
      const total = await couponsCountLatestEntriesLocation(loc, [true, false]);
      pickupToday[loc] = { success, total };
    }
    return {
      reply: views.status({
        totalCoupons: HISTORICAL_OFFSET + totalCoupons,
        totalUsers,
        totalSso,
        perLocation,
        pickupToday,
        maxPerLocation: MAX_PER_LOCATION,
      }),
    };
  },
};
