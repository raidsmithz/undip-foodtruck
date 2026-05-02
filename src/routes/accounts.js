const express = require("express");
const router = express.Router();
const { encrypt, decrypt } = require("../utils/encryption");
const {
  getCombinedSSOAccounts,
  ssoEditAccountByID,
} = require("../models/functions");
const authenticateToken = require("../middleware/auth");

function popKeyFromObject(obj, key) {
  let value;
  if (obj.hasOwnProperty(key)) {
    value = obj[key];
    delete obj[key];
  }
  return value;
}

router.get("/accounts", authenticateToken, async (req, res) => {
  try {
    const accounts = await getCombinedSSOAccounts();
    const resultArray = accounts.map((account) => ({
      id: account.dataValues.id,
      email: decrypt(account.dataValues.email),
      password: decrypt(account.dataValues.password),
    }));
    const jsonString = JSON.stringify(resultArray);
    const encryptedResponse = encrypt(jsonString);
    res.json({ data: encryptedResponse });
    console.log("Success retrieving data accounts.");
  } catch (err) {
    res.status(500).json({ message: err.message });
    console.log("Error retrieving data accounts.");
  }
});

router.post("/accounts", authenticateToken, async (req, res) => {
  try {
    const formData = req.body.data;
    const decryptedData = JSON.parse(decrypt(formData));
    for (let i = 0; i < decryptedData.length; i++) {
      const input_id = popKeyFromObject(decryptedData[i], "id");
      ssoEditAccountByID(input_id, decryptedData[i]);
    }
    res.status(200).json({ message: "Form data received successfully" });
    console.log("Success posting data accounts.");
  } catch (err) {
    res.status(500).json({ message: err.message });
    console.log("Error posting data accounts.");
  }
});

module.exports = router;
