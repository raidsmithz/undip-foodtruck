const { MessageTypes } = require("whatsapp-web.js");
const views = require("./views");
const helpers = require("./helpers");
const { getPending, getBlockState } = require("./state");
const commands = require("./commands");
const {
  waMsgEditMessages,
  waMsgAddAccount,
  ssoCountTotalAccounts,
  errorLogAdd,
} = require("../models/functions");

async function persistAudit(wa_number, body) {
  try {
    await waMsgEditMessages(wa_number, helpers.sanitizeUtf8mb3(body));
  } catch (e) {
    // last_messages is best-effort audit; never let it break the route
    console.error("[persistAudit]", e.message);
  }
}

async function applyResult(client, msg, result) {
  if (!result) return;
  if (result.media) {
    await client.sendMessage(msg.from, result.media, {
      caption: result.mediaCaption || "",
    });
  } else if (result.reply) {
    await msg.reply(result.reply);
  }
  if (result.react) {
    try {
      await msg.react(result.react);
    } catch (_) {}
  }
}

async function route(msg, client, deps) {
  // skip status broadcasts and group messages
  if (msg.from === "status@broadcast" || msg.author != null) return;

  // normalize the first word casing for keyword matching
  if (typeof msg.body === "string") {
    msg.body = helpers.convertFirstWordToLowerCase(msg.body);
  }

  // detect new user
  const blockState = await getBlockState(msg.from);

  if (blockState === -1) {
    // first contact — send welcome, create row
    const ssoCount = await ssoCountTotalAccounts();
    await waMsgAddAccount(msg.from, helpers.sanitizeUtf8mb3(msg.body || ""));
    await applyResult(client, msg, { reply: views.welcome(ssoCount) });
    return;
  }

  // currently blocked: only persist audit, drop the message
  if (blockState === true) {
    await persistAudit(msg.from, msg.body || "");
    return;
  }

  // 3-hour ping just expired: notify + treat as normal text (no command run)
  if (blockState === "expired") {
    await persistAudit(msg.from, msg.body || "");
    await applyResult(client, msg, { reply: views.pingExpired() });
    return;
  }

  await persistAudit(msg.from, msg.body || "");

  try {
    // image / document: dedicated handler regardless of pending state
    if (
      msg.type === MessageTypes.IMAGE ||
      msg.type === MessageTypes.DOCUMENT
    ) {
      const result = await commands.image.handle({ msg, client, deps });
      await applyResult(client, msg, result);
      return;
    }

    // admin commands first — admin replies to forwarded messages, !login, !kupon, !kirim
    if (
      deps.ADMIN_WHATSAPP &&
      (msg.from === deps.ADMIN_WHATSAPP || msg.from === deps.ADMIN_WHATSAPP_SELF)
    ) {
      const adminResult = await commands.admin.handle({ msg, client, deps });
      if (adminResult !== null) {
        await applyResult(client, msg, adminResult);
        return;
      }
      // fall through — admin can also invoke regular commands
    }

    // pending confirmation (hapus / ping)
    const pending = await getPending(msg.from);
    if (pending) {
      const prefix = pending.split(":")[0];
      const handler = commands.pending[prefix];
      if (handler && handler.resolveConfirm) {
        const result = await handler.resolveConfirm({
          msg,
          pending,
          client,
          deps,
        });
        await applyResult(client, msg, result);
        return;
      }
    }

    // text command dispatch
    if (msg.type === MessageTypes.TEXT && typeof msg.body === "string") {
      for (const cmd of commands.text) {
        const params = cmd.match(msg.body, msg);
        if (params) {
          const result = await cmd.handle({ msg, params, client, deps });
          await applyResult(client, msg, result);
          return;
        }
      }
    }

    // fallback
    await applyResult(client, msg, { reply: views.unknownCommand() });
  } catch (err) {
    console.error("[router] handler error", err);
    await errorLogAdd(msg.from, msg.body, err);
    try {
      await applyResult(client, msg, {
        reply: views.commandError(),
        react: "❌",
      });
    } catch (_) {}
  }
}

module.exports = { route };
