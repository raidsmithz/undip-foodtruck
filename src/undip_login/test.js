const {
  getCombinedSSOAccounts,
  ssoEditAccountByID,
} = require("../models/functions");
const { encrypt, decrypt } = require("../utils/encryption");
const loginAccounts2 = require("./login_accounts");

async function loginAccounts3() {
  const accounts = await getCombinedSSOAccounts(); // Ensure this function exists
  const resultArray = accounts.map((account) => ({
    id: account.dataValues.id,
    email: decrypt(account.dataValues.email), // Ensure `decrypt` function exists
    password: decrypt(account.dataValues.password),
  }));
  console.log(`Logging in (${resultArray.length}) SSO accounts...`);
  return resultArray;
}

async function main2() {
  try {
    const accounts = await loginAccounts3(); // Declare with `const`
    console.log(JSON.stringify(accounts, null, 2)); // Better formatted output
  } catch (error) {
    console.error("Error in main():", error);
  }
}

main2();
loginAccounts2();
