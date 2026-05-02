const LoginManager = require("./sso_login_manager");
const {
  getCombinedSSOAccounts,
  ssoEditAccountByID,
} = require("../models/functions");
const { encrypt, decrypt } = require("../utils/encryption");

function popKeyFromObject(obj, key) {
  let value;
  if (obj.hasOwnProperty(key)) {
    value = obj[key];
    delete obj[key];
  }
  return value;
}

function ssoGetStatusCode(statusString) {
  switch (statusString) {
    case "Not Logged In":
      return 0;
    case "Logged In":
      return 1;
    case "Already Graduated":
      return 2;
    case "Logged Out":
      return 3;
    case "Incorrect Password":
      return 4;
    case "Incorrect Username":
      return 5;
    case "Incorrect Region":
      return 6;
    case "Server Error":
      return 7;
    case "System Error":
      return 8;
    default:
      return -1; // or any default value for unknown errors
  }
}

async function loginMultipleAccounts(accounts) {
  const batchSize = 5;
  const results = [];
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const loginManagers = batch.map((account, index) => {
      return new LoginManager(
        account.id,
        account.email,
        account.password,
        index + 1
      );
    });
    const loginPromises = loginManagers.map((manager) =>
      manager.autoLoginGetCookie().catch((error) => {
        console.error(`Failed to login ${manager.email}: ${error.message}`);
        return null; // Return null on failure to keep consistent result length
      })
    );
    const batchResults = await Promise.all(loginPromises);
    batchResults.forEach((result, index) => {
      if (result != null) {
        const temp_status_login = ssoGetStatusCode(result);
        if (temp_status_login <= 6) {
          results.push({
            id: loginManagers[index].id,
            login_cookie: loginManagers[index].formAppSessionValue,
            status_login: temp_status_login,
          });
        }
      }
      // else {
      //   results.push({
      //     id: loginManagers[index].id,
      //     login_cookie: "",
      //     status_login: 8,
      //   });
      // }
    });
  }
  return results;
}

async function loginAccounts() {
  const accounts = await getCombinedSSOAccounts();
  const resultArray = accounts.map((account) => ({
    id: account.dataValues.id,
    email: decrypt(account.dataValues.email),
    password: decrypt(account.dataValues.password),
  }));
  console.log(`TASK: Logging in (${resultArray.length}) SSO accounts...`);
  const arrayID = [];
  await loginMultipleAccounts(resultArray).then(async (result) => {
    for (let i = 0; i < result.length; i++) {
      const input_id = popKeyFromObject(result[i], "id");
      await ssoEditAccountByID(input_id, result[i]);
      arrayID.push(input_id);
    }
  });
  return arrayID;
}

module.exports = loginAccounts;
