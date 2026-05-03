// Anti-ban helpers for any flow that sends multiple WA messages in succession.
// WhatsApp Web detects bursts of identical/near-identical messages as bot-like
// behavior; spacing them out with random jitter keeps cadence in the human band.

const MIN_DELAY_MS = 600;
const MAX_DELAY_MS = 1500;

function jitter() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function humanSleep() {
  return new Promise((r) => setTimeout(r, jitter()));
}

module.exports = { humanSleep, jitter };
