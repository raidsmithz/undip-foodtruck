const { MessageMedia } = require("whatsapp-web.js");
const views = require("../views");
const {
  registeredGetSSOIDS,
  registeredEditPaySSOID,
  ssoGetAccount,
  ssoCountTotalAccounts,
} = require("../../models/functions");

const QRIS_PATH = "./src/chat_bot/pay_qris_me.jpg";

module.exports = {
  name: "akun_beli",
  match(body) {
    const m = body.match(/^ufood akun (\d+) beli$/);
    if (m) return { n: parseInt(m[1], 10) };
    return null;
  },
  async handle({ msg, params }) {
    const sso_ids = await registeredGetSSOIDS(msg.from);
    if (!sso_ids || sso_ids.length === 0)
      return { reply: views.akunListEmpty() };
    const id = sso_ids[params.n - 1];
    if (!id) return { reply: views.akunNotFound(params.n) };
    const account = await ssoGetAccount(id);

    await registeredEditPaySSOID(msg.from, id);
    const ssoCount = await ssoCountTotalAccounts();
    const media = MessageMedia.fromFilePath(QRIS_PATH);
    return {
      media,
      mediaCaption: views.beliQrisCaption(params.n, account, ssoCount),
    };
  },
};
