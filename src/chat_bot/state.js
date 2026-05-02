const {
  waMsgGetPendingAction,
  waMsgSetPendingAction,
  waMsgClearPendingAction,
  waMsgIsBlocked,
  waMsgSetBlocked,
} = require("../models/functions");

async function getPending(wa_number) {
  return await waMsgGetPendingAction(wa_number);
}

async function setPending(wa_number, action) {
  await waMsgSetPendingAction(wa_number, action);
}

async function clearPending(wa_number) {
  await waMsgClearPendingAction(wa_number);
}

async function getBlockState(wa_number) {
  return await waMsgIsBlocked(wa_number);
}

async function block(wa_number) {
  await waMsgSetBlocked(wa_number, true);
}

async function unblock(wa_number) {
  await waMsgSetBlocked(wa_number, false);
}

function pendingMatches(pending, prefix) {
  if (!pending) return null;
  if (pending === prefix) return [];
  if (pending.startsWith(prefix + ":")) {
    return pending.slice(prefix.length + 1).split(":");
  }
  return null;
}

module.exports = {
  getPending,
  setPending,
  clearPending,
  getBlockState,
  block,
  unblock,
  pendingMatches,
};
