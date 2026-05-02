const iconv = require("iconv-lite");

const LOCATION_NAMES = {
  1: "Gedung SA-MWA",
  2: "Student Center",
  3: "Auditorium FPIK",
  4: "Auditorium Imam Bardjo",
  5: "Halaman Gedung ART Center",
};

const STATUS_NAMES = {
  0: "Logging In by System",
  1: "Logged In",
  2: "Already Graduated",
  3: "Logged Out",
  4: "Incorrect Password",
  5: "Incorrect Username",
  6: "Incorrect Region",
  7: "Server Error",
  8: "System Error",
};

const UNDIP_EMAIL_RE = /^[\w.-]+@students\.undip\.ac\.id$/;

function locationName(id) {
  return LOCATION_NAMES[id] || "Unknown";
}

function statusName(code) {
  return STATUS_NAMES[code] || "Unknown";
}

function isUndipEmail(s) {
  return UNDIP_EMAIL_RE.test(s);
}

function snapshotLine(label, before, after) {
  if (before === after) return `*${label}:* _${before}_`;
  return `*${label}:* _${before}_ → _${after}_`;
}

function isWeekday(now = new Date()) {
  const d = now.getDay();
  return d >= 1 && d <= 5;
}

function isAfterTenThirty(now = new Date()) {
  const h = now.getHours();
  const m = now.getMinutes();
  if (h > 10) return true;
  if (h === 10 && m >= 30) return true;
  return false;
}

function isAfterNineFortyFive(now = new Date()) {
  const h = now.getHours();
  const m = now.getMinutes();
  if (h > 9) return true;
  if (h === 9 && m >= 45) return true;
  return false;
}

function convertFirstWordToLowerCase(input) {
  if (!input || typeof input !== "string") return input;
  const words = input.split(" ");
  if (words.length === 0) return input;
  words[0] = words[0].toLowerCase();
  return words.join(" ");
}

function sanitizeUtf8mb3(s) {
  if (!s) return "";
  const stripped = s.replace(/[^\x00-\x7F]/g, "");
  return iconv.decode(iconv.encode(Buffer.from(stripped, "utf8"), "utf8"), "utf8", {
    default: "",
  });
}

module.exports = {
  LOCATION_NAMES,
  STATUS_NAMES,
  UNDIP_EMAIL_RE,
  locationName,
  statusName,
  isUndipEmail,
  snapshotLine,
  isWeekday,
  isAfterTenThirty,
  isAfterNineFortyFive,
  convertFirstWordToLowerCase,
  sanitizeUtf8mb3,
};
