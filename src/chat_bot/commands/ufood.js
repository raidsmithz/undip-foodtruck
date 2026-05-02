const views = require("../views");

module.exports = {
  name: "ufood",
  match(body) {
    if (body === "ufood" || body === "commands") return { which: body };
    if (body === "ufood help" || body === "ufood alur") return { which: "ufood" };
    if (body === "ufood aturan" || body === "ufood aturan setuju")
      return { which: "ufood" };
    return null;
  },
  async handle({ params }) {
    if (params.which === "commands") return { reply: views.commandsList() };
    return { reply: views.ufoodPanduan() };
  },
};
