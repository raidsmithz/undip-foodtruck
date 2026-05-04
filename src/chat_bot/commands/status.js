const views = require("../views");
const {
  couponsCountTakenEntries,
  registeredTotalAccounts,
  ssoCountTotalAccounts,
  couponsLatestEntryDate,
  getCountSubmissionAll,
  couponsCountLatestByLocation,
} = require("../../models/functions");

const MAX_PER_LOCATION = 30;
const HISTORICAL_OFFSET = 1771; // bot's running historical baseline

module.exports = {
  name: "status",
  match(body) {
    return body === "ufood status" ? {} : null;
  },
  async handle() {
    // 6 parallel queries instead of 4 + 12 sequential. Per-location data is
    // collapsed into 2 batched group-by queries.
    const [
      totalCoupons,
      totalUsers,
      totalSso,
      latestRunDate,
      perLocation,
      pickupToday,
    ] = await Promise.all([
      couponsCountTakenEntries(),
      registeredTotalAccounts(),
      ssoCountTotalAccounts(),
      couponsLatestEntryDate(),
      getCountSubmissionAll(true),
      couponsCountLatestByLocation(),
    ]);
    return {
      reply: views.status({
        totalCoupons: HISTORICAL_OFFSET + totalCoupons,
        totalUsers,
        totalSso,
        perLocation,
        pickupToday,
        latestRunDate,
        maxPerLocation: MAX_PER_LOCATION,
      }),
    };
  },
};
