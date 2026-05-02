const views = require("../views");
const {
  registeredGetSSOIDS,
  registeredGetPaySSOID,
  registeredEditPaySSOID,
} = require("../../models/functions");

module.exports = {
  name: "image",
  async handle({ msg, client, deps }) {
    const sso_ids = await registeredGetSSOIDS(msg.from);
    if (!sso_ids || sso_ids.length === 0)
      return { reply: views.imageNoAccounts(), react: "❌" };

    const pay_sso_id = await registeredGetPaySSOID(msg.from);
    if (!pay_sso_id || pay_sso_id <= 0)
      return { reply: views.imageNoPaySelection(), react: "❌" };

    const attachmentData = await msg.downloadMedia();
    if (deps.ADMIN_WHATSAPP) {
      await client.sendMessage(deps.ADMIN_WHATSAPP, attachmentData, {
        caption: `${msg.from}_${pay_sso_id}`,
      });
    }
    await registeredEditPaySSOID(msg.from, 0);
    return { reply: views.paymentReceived(), react: "⏳" };
  },
};
