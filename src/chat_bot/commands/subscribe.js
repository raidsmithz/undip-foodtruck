const views = require("../views");
const { waMsgSetSubscribed } = require("../../models/functions");

module.exports = {
  name: "subscribe",
  match(body) {
    if (body === "ufood subscribe") return { sub: true };
    if (body === "ufood unsubscribe") return { sub: false };
    return null;
  },
  async handle({ msg, params }) {
    await waMsgSetSubscribed(msg.from, params.sub);
    return { reply: params.sub ? views.subscribed() : views.unsubscribed() };
  },
};
