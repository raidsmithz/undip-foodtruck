const views = require("../views");
const { setPending, clearPending, pendingMatches, block } = require("../state");

module.exports = {
  name: "ping",
  match(body) {
    return body === "ping" ? { kind: "request" } : null;
  },
  async handle({ msg }) {
    await setPending(msg.from, "ping");
    return { reply: views.pingConfirm() };
  },

  async resolveConfirm({ msg, pending, client, deps }) {
    const parts = pendingMatches(pending, "ping");
    if (!parts) return null;

    if (msg.body === "ya") {
      await clearPending(msg.from);
      await block(msg.from);
      const adminWa = deps.ADMIN_WHATSAPP;
      const adminSelf = deps.ADMIN_WHATSAPP_SELF;
      if (adminWa) await client.sendMessage(adminWa, `${msg.from}_ping`);
      if (adminSelf) {
        const phoneNumber = msg.from.replace("@c.us", "");
        await client.sendMessage(
          adminSelf,
          `Terdapat kendala dari ${phoneNumber} pada bot Undip Foodtruck!\n\n` +
            `Link: wa.me/${phoneNumber}`
        );
      }
      return { reply: views.pingActive() };
    }
    if (msg.body === "batal" || msg.body === "tidak") {
      await clearPending(msg.from);
      return { reply: views.pingBatal() };
    }
    return { reply: views.pendingHint(pending) };
  },
};
