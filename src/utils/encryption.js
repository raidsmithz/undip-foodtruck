const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config();

const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const iv = Buffer.from(process.env.ENCRYPTION_IV, "hex");

function encrypt(text) {
  let cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function decrypt(encryptedData) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encrypt, decrypt };
