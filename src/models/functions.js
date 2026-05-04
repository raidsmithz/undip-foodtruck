// functions.js
const { Op } = require("sequelize");
const { encrypt, decrypt } = require("../utils/encryption");

const {
  RegisteredWhatsapp,
  SSOAccounts,
  WAMessages,
  TakenCoupons,
  ErrorLogs,
} = require("./tables");

const PENDING_ACTION_TTL_MS = 5 * 60 * 1000; // 5 min — abandons stale ya/batal
const BLOCKED_TTL_MS = 3 * 60 * 60 * 1000; // 3h — ping auto-expire

async function registeredNewAddAccount(wa_number, arr_sso_ids) {
  try {
    const account = await RegisteredWhatsapp.findOne({ where: { wa_number } });
    if (account) {
      console.log(`Account ${wa_number} already existed.`);
      return false;
    } else {
      const str_sso_ids = arr_sso_ids.join(", ");
      const new_account = await RegisteredWhatsapp.create({
        wa_number,
        sso_ids: str_sso_ids,
      });
      console.log(`Added account ${new_account.id}: ${new_account.sso_ids}`);
      return new_account.id;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function registeredAddAccountID(wa_number, sso_id) {
  try {
    const account = await registeredGetAccount(wa_number);
    if (account) {
      if (account.sso_ids === "") {
        account.sso_ids = sso_id;
        await account.save();
        console.log(`Update added account on ${wa_number}: ${sso_id}`);
        return sso_id;
      } else {
        const arr_sso_ids = account.sso_ids
          .split(",")
          .map((id) => parseInt(id.trim()));
        arr_sso_ids.push(sso_id);
        const str_sso_ids = arr_sso_ids.join(", ");
        account.sso_ids = str_sso_ids;
        await account.save();
        console.log(`Update added account on ${wa_number}: ${str_sso_ids}`);
        return str_sso_ids;
      }
    } else {
      console.log("New Account");
      return await registeredNewAddAccount(wa_number, [sso_id]);
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function registeredRemoveAccountID(wa_number, sso_idToRemove) {
  try {
    const account = await registeredGetAccount(wa_number);
    if (!account) {
      console.log(`Account ${wa_number} not found.`);
      return false;
    }
    const arr_sso_ids = account.sso_ids
      .split(",")
      .map((id) => parseInt(id.trim()));
    const indexToRemove = arr_sso_ids.indexOf(sso_idToRemove);
    if (indexToRemove === -1) {
      console.log(
        `SSO ID ${sso_idToRemove} not found in ${wa_number}'s account.`
      );
      return false;
    }
    arr_sso_ids.splice(indexToRemove, 1);
    const str_sso_ids = arr_sso_ids.join(", ");
    account.sso_ids = str_sso_ids;
    await account.save();

    console.log(
      `Removed SSO ID ${sso_idToRemove} from account ${wa_number}: ${str_sso_ids}`
    );
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function registeredGetWANumberBySSOID(sso_id) {
  try {
    // Find the first entry that matches the sso_id
    const registered = await RegisteredWhatsapp.findOne({
      where: { sso_ids: { [Op.like]: `%${sso_id}%` } }, // Assuming sso_ids is a comma-separated list
      attributes: ["wa_number"],
    });

    if (registered) {
      return registered.wa_number;
    } else {
      console.log(`No wa_number found for sso_id: ${sso_id}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching wa_number for sso_id ${sso_id}:`, error);
    throw error;
  }
}

async function registeredGetSSOIDS(wa_number) {
  try {
    const account = await RegisteredWhatsapp.findOne({ where: { wa_number } });
    if (account) {
      if (account.sso_ids === "") {
        return [];
      } else {
        const sso_ids = account.sso_ids
          .split(",")
          .map((id) => parseInt(id.trim()));
        return sso_ids;
      }
    }
    console.log(`Account ${wa_number} not found.`);
    return [];
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function registeredCountSSOIDS(wa_number) {
  try {
    const account = await RegisteredWhatsapp.findOne({ where: { wa_number } });
    if (account) {
      if (account.sso_ids === "") {
        return 0;
      } else {
        const sso_ids = account.sso_ids
          .split(",")
          .map((id) => parseInt(id.trim()));
        return sso_ids.length;
      }
    }
    return 0;
  } catch (error) {
    console.error(error);
    return 0;
  }
}

async function registeredGetAccount(wa_number) {
  try {
    const account = await RegisteredWhatsapp.findOne({ where: { wa_number } });
    if (account) {
      return account;
    }
    console.log(`Account ${wa_number} not found.`);
  } catch (error) {
    console.error(error);
  }
}

async function registeredGetPaySSOID(wa_number) {
  try {
    const account = await RegisteredWhatsapp.findOne({ where: { wa_number } });
    if (account) {
      return account.pay_sso_id;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function registeredEditPaySSOID(wa_number, pay_sso_id) {
  try {
    const account = await RegisteredWhatsapp.findOne({ where: { wa_number } });
    if (account) {
      account.pay_sso_id = pay_sso_id;
      await account.save();
      console.log(
        `Pay id on account ${account.wa_number}: ${account.pay_sso_id}`
      );
      return true;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function registeredTotalAccounts() {
  try {
    const count = await RegisteredWhatsapp.count();
    return count;
  } catch (error) {
    console.error(error);
  }
}

async function waMsgAddAccount(wa_number, last_messages) {
  // findOrCreate is atomic against the unique(wa_number) index — concurrent
  // first-contact messages from the same user can't produce duplicates.
  try {
    const [row] = await WAMessages.findOrCreate({
      where: { wa_number },
      defaults: { last_messages },
    });
    return row.wa_number;
  } catch (error) {
    console.error("[waMsgAddAccount]", error.message);
    return null;
  }
}

async function waMsgEditMessages(wa_number, last_messages) {
  try {
    const [row, created] = await WAMessages.findOrCreate({
      where: { wa_number },
      defaults: { last_messages },
    });
    if (!created) {
      row.last_messages = last_messages;
      await row.save();
    }
    return true;
  } catch (error) {
    console.error("[waMsgEditMessages]", error.message);
    return false;
  }
}

async function waMsgEditConfirmation(wa_number, confirmation) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      account.confirmation = confirmation;
      await account.save();
      console.log(
        `Confirmation on account ${account.wa_number}: ${account.confirmation}`
      );
      return true;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waMsgGetConfirmation(wa_number) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      return account.confirmation;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waMsgEditBlocked(wa_number, blocked) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      account.blocked = blocked;
      await account.save();
      console.log(
        `Blocked on account ${account.wa_number}: ${account.blocked}`
      );
      return true;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waMsgGetBlocked(wa_number) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      return account.blocked;
    } else {
      console.log(`No account ${wa_number}`);
      return -1;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waMsgEditRulesAccepted(wa_number, rules_accepted) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      account.rules_accepted = rules_accepted;
      await account.save();
      console.log(
        `RulesAccepted on account ${account.wa_number}: ${account.rules_accepted}`
      );
      return true;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waMsgGetRulesAccepted(wa_number) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      return account.rules_accepted;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waMsgGetFreeTrialStatus(wa_number) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      return account.free_trial;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waMsgEditFreeTrialStatus(wa_number, free_trial) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      account.free_trial = free_trial;
      await account.save();
      console.log(
        `Pay id on account ${account.wa_number}: ${account.free_trial}`
      );
      return true;
    } else {
      console.log(`No account ${wa_number}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function waMsgGetAllWANumber() {
  try {
    const messages = await WAMessages.findAll({
      attributes: ["wa_number"],
    });

    // Extract wa_number from the result
    const waNumbers = messages.map((msg) => msg.wa_number);

    return waNumbers;
  } catch (error) {
    console.error("Error fetching WA numbers:", error);
    throw error;
  }
}

async function waMsgGetLastMessages(wa_number) {
  try {
    const account = await WAMessages.findOne({ where: { wa_number } });
    if (account) {
      return account.last_messages;
    } else {
      console.log(`No account ${wa_number}`);
    }
  } catch (error) {
    console.error(error);
  }
}

async function ssoAddAccount(
  email,
  password,
  cookie,
  pick,
  quota,
  enable,
  status,
  reminded
) {
  try {
    const new_account = await SSOAccounts.create({
      email: encrypt(email),
      password: encrypt(password),
      login_cookie: cookie,
      pick_location: pick,
      available_quota: quota,
      enable_submit: enable,
      status_login: status,
      reminded: reminded,
    });
    console.log(
      `Added account ${new_account.id}: ${decrypt(new_account.email)}`
    );
    return new_account.id;
  } catch (error) {
    console.error(error);
  }
}

async function ssoCountTotalAccounts() {
  try {
    const count = await SSOAccounts.count();
    return count;
  } catch (error) {
    console.error(error);
  }
}

async function ssoGetAccount(account_id) {
  try {
    const account = await SSOAccounts.findByPk(account_id);
    if (account) {
      console.log(`Account ${account_id}: ${account}`);
      account.email = decrypt(account.email);
      account.password = decrypt(account.password);
      return account;
    }
    console.log(`Account ${account_id} not found.`);
  } catch (error) {
    console.error(error);
  }
}

async function ssoDeleteAccount(account_id) {
  try {
    const account = await SSOAccounts.findByPk(account_id);
    if (account) {
      await account.destroy();
      console.log(`Account ${account_id} has been deleted.`);
      return true;
    }
    console.log(`Account ${account_id} not found.`);
    return false;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function ssoEditAccountEmailPassword(account_id, email, password) {
  try {
    const account = await SSOAccounts.findByPk(account_id);
    if (account) {
      account.email = encrypt(email);
      account.password = encrypt(password);
      await account.save();
      console.log(
        `Updated account ${account.id}: ${decrypt(account.email)} ${decrypt(
          account.password
        )}`
      );
      return true;
    } else {
      console.log(`Account ${account_id} not found.`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function ssoEditAccountQuota(account_id, quota) {
  try {
    const account = await SSOAccounts.findByPk(account_id);
    if (account) {
      account.available_quota = quota;
      await account.save();
      console.log(`Account ${account.id} quota: ${account.available_quota}`);
      return true;
    } else {
      console.log(`Account ${account_id} not found.`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function ssoGetAccountQuota(account_id) {
  try {
    const account = await SSOAccounts.findByPk(account_id);
    if (account) {
      return account.available_quota;
    } else {
      console.log(`No account ${account_id}`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function ssoEditAccountLocation(account_id, location) {
  try {
    const account = await SSOAccounts.findByPk(account_id);
    if (account) {
      account.pick_location = location;
      await account.save();
      console.log(`Account ${account.id} location: ${account.pick_location}`);
      return true;
    } else {
      console.log(`Account ${account_id} not found.`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function ssoEditAccountEnableSubmit(account_id, enable_submit) {
  try {
    const account = await SSOAccounts.findByPk(account_id);
    if (account) {
      account.enable_submit = enable_submit;
      await account.save();
      console.log(
        `Account ${account.id} enable_submit: ${account.enable_submit}`
      );
      return true;
    } else {
      console.log(`Account ${account_id} not found.`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function ssoEditAccountByID(acc_id, updateFields) {
  try {
    const account = await SSOAccounts.findOne({ where: { id: acc_id } });
    if (account) {
      for (const [field, value] of Object.entries(updateFields)) {
        if (account[field] !== undefined) {
          if (field === "email" || field === "password") {
            account[field] = encrypt(value);
          } else {
            account[field] = value;
          }
        }
      }
      await account.save();
      console.log(`Updated account on ${account.id}`);
      return true;
    } else {
      console.log(`Account with ID ${acc_id} not found.`);
      return false;
    }
  } catch (error) {
    console.error(`Error updating account: ${error}`);
    return false;
  }
}

async function ssoEditAccountReminded(account_id, reminded) {
  try {
    const account = await SSOAccounts.findByPk(account_id);
    if (account) {
      account.reminded = reminded;
      await account.save();
      console.log(`Account ${account.id} reminded: ${account.reminded}`);
      return true;
    } else {
      console.log(`Account ${account_id} not found.`);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function couponsCountTakenEntries() {
  try {
    const count = await TakenCoupons.count({
      where: {
        taken_success: true,
      },
    });
    return count;
  } catch (error) {
    console.error(error);
  }
}

async function couponsAddEntry(
  sso_id,
  kupon_id,
  tanggal_id,
  coupon_file,
  validation_url,
  found_option_at,
  send_at,
  has_sent_at
) {
  try {
    const newEntry = await TakenCoupons.create({
      sso_id,
      kupon_id,
      tanggal_id,
      coupon_file,
      validation_url,
      found_option_at,
      send_at,
      has_sent_at,
    });
    return newEntry.id;
  } catch (error) {
    console.error(error);
  }
}

async function couponsGetCouponFile(sso_id) {
  try {
    const coupons = await TakenCoupons.findAll({
      where: { sso_id },
      attributes: ["coupon_file"],
    });
    return coupons.map((coupon) => coupon.coupon_file);
  } catch (error) {
    console.error(error);
  }
}

// Function to change wa_sent and wa_sent_at where sso_id matches
async function couponsUpdateWASent(sso_id) {
  try {
    const updated = await TakenCoupons.update(
      { wa_sent_at: new Date() },
      { where: { sso_id } }
    );
    return updated;
  } catch (error) {
    console.error(error);
  }
}

async function couponsLatestEntryDate() {
  try {
    const latestEntry = await TakenCoupons.findOne({
      order: [["created_at", "DESC"]],
      attributes: ["created_at"],
    });
    return latestEntry ? new Date(latestEntry.created_at) : null;
  } catch (e) {
    console.error("[couponsLatestEntryDate]", e.message);
    return null;
  }
}

async function couponsCountLatestEntriesLocation(pick_location, taken_success) {
  try {
    const latestEntry = await TakenCoupons.findOne({
      order: [["created_at", "DESC"]],
    });
    if (!latestEntry) {
      return 0;
    }
    const latestDate = latestEntry.created_at;
    const latestDateOnly = new Date(latestDate.setHours(0, 0, 0, 0)); // Set time to 00:00:00 to compare only the date
    const count = await TakenCoupons.count({
      where: {
        created_at: {
          [Op.between]: [
            latestDateOnly,
            new Date(latestDateOnly.getTime() + 24 * 60 * 60 * 1000),
          ],
        },
        taken_success: {
          [Op.in]: taken_success,
        },
        pick_location: pick_location,
      },
    });
    return count;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function couponsGetAllEntriesToday() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to 00:00:00
    const entries = await TakenCoupons.findAll({
      where: {
        created_at: {
          [Op.gte]: today, // Greater than or equal to today's date
        },
      },
    });
    return entries;
  } catch (error) {
    console.error("Error fetching entries created today:", error);
    throw error;
  }
}

async function couponsCheckTakenToday(sso_id) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to 00:00:00
    const entries = await TakenCoupons.findAll({
      where: {
        sso_id: sso_id,
        taken_success: true,
        created_at: {
          [Op.gte]: today, // Greater than or equal to today's date
        },
      },
    });
    if (entries.length > 0) return true;
    else return false;
  } catch (error) {
    console.error("Error fetching entries created today:", error);
    throw error;
  }
}

async function getCombinedSSOAccounts() {
  try {
    const registereds = await RegisteredWhatsapp.findAll({
      attributes: ["sso_ids"],
    });
    const ssoIdsArray = [];
    registereds.forEach((registered) => {
      const ids = registered.sso_ids
        ? registered.sso_ids.split(",").map((id) => parseInt(id.trim(), 10))
        : [];
      ssoIdsArray.push(...ids);
    });

    const uniqueSSOIds = [...new Set(ssoIdsArray)];
    const ssoAccounts = await SSOAccounts.findAll({
      where: {
        id: {
          [Op.in]: uniqueSSOIds,
        },
        status_login: {
          [Op.in]: [0, 3, 6, 7, 8],
        },
      },
      attributes: [
        "id",
        "email",
        "password",
        "login_cookie",
        "pick_location",
        "available_quota",
        "status_login",
      ],
    });
    return ssoAccounts;
  } catch (error) {
    console.error("Error fetching SSO accounts:", error);
    throw error;
  }
}

async function getFalseSubmissionAccountsToday() {
  try {
    const registereds = await RegisteredWhatsapp.findAll({
      attributes: ["sso_ids"],
    });
    const ssoIdsArray = [];
    registereds.forEach((registered) => {
      const ids = registered.sso_ids
        ? registered.sso_ids.split(",").map((id) => parseInt(id.trim(), 10))
        : [];
      ssoIdsArray.push(...ids);
    });

    const uniqueSSOIds = [...new Set(ssoIdsArray)];
    const ssoAccounts = await SSOAccounts.findAll({
      where: {
        id: {
          [Op.in]: uniqueSSOIds,
        },
        status_login: 1,
        enable_submit: 0,
      },
      attributes: [
        "id",
        "email",
        "password",
        "login_cookie",
        "pick_location",
        "available_quota",
        "reminded",
      ],
    });
    return ssoAccounts;
  } catch (error) {
    console.error("Error fetching SSO accounts:", error);
    throw error;
  }
}

async function getCountSubmission(submit, location) {
  try {
    const registereds = await RegisteredWhatsapp.findAll({
      attributes: ["sso_ids"],
    });
    const ssoIdsArray = [];
    registereds.forEach((registered) => {
      const ids = registered.sso_ids
        ? registered.sso_ids.split(",").map((id) => parseInt(id.trim(), 10))
        : [];
      ssoIdsArray.push(...ids);
    });

    const uniqueSSOIds = [...new Set(ssoIdsArray)];
    const ssoAccounts = await SSOAccounts.findAll({
      where: {
        id: {
          [Op.in]: uniqueSSOIds,
        },
        pick_location: location,
        enable_submit: submit,
      },
      attributes: [
        "id",
        "email",
        "password",
        "login_cookie",
        "pick_location",
        "available_quota",
      ],
    });
    return ssoAccounts.length;
  } catch (error) {
    console.error("Error fetching SSO accounts:", error);
    throw error;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Refactor additions: subscribed flag, pending_action FSM, blocked auto-expire,
// error log, balanced-location picker, atomic register-with-trial.
// ───────────────────────────────────────────────────────────────────────────

async function waMsgSetSubscribed(wa_number, value) {
  await WAMessages.update({ subscribed: value }, { where: { wa_number } });
}

async function waMsgGetSubscribedNumbers() {
  const rows = await WAMessages.findAll({
    where: { subscribed: true, blocked: 0 },
    attributes: ["wa_number"],
  });
  return rows.map((r) => r.wa_number);
}

async function waMsgSetPendingAction(wa_number, action) {
  await WAMessages.update(
    { pending_action: action, pending_action_at: new Date() },
    { where: { wa_number } }
  );
}

async function waMsgGetPendingAction(wa_number) {
  const row = await WAMessages.findOne({ where: { wa_number } });
  if (!row || !row.pending_action) return null;
  if (row.pending_action_at) {
    const age = Date.now() - new Date(row.pending_action_at).getTime();
    if (age > PENDING_ACTION_TTL_MS) {
      await waMsgClearPendingAction(wa_number);
      return null;
    }
  }
  return row.pending_action;
}

async function waMsgClearPendingAction(wa_number) {
  await WAMessages.update(
    { pending_action: null, pending_action_at: null },
    { where: { wa_number } }
  );
}

async function waMsgSetBlocked(wa_number, blocked, blocked_at = null) {
  await WAMessages.update(
    {
      blocked: blocked ? 1 : 0,
      blocked_at: blocked ? blocked_at || new Date() : null,
    },
    { where: { wa_number } }
  );
}

async function waMsgIsBlocked(wa_number) {
  const row = await WAMessages.findOne({ where: { wa_number } });
  if (!row) return -1;
  if (!row.blocked) return false;
  // Legacy rows blocked before the blocked_at column existed have NULL —
  // we have no idea when the block was set, so treat as expired and unblock.
  if (!row.blocked_at) {
    await waMsgSetBlocked(wa_number, false);
    return "expired";
  }
  const age = Date.now() - new Date(row.blocked_at).getTime();
  if (age > BLOCKED_TTL_MS) {
    await waMsgSetBlocked(wa_number, false);
    return "expired";
  }
  return true;
}

async function waMsgExpireStaleBlocks() {
  const cutoff = new Date(Date.now() - BLOCKED_TTL_MS);
  const [count] = await WAMessages.update(
    { blocked: 0, blocked_at: null },
    {
      where: {
        blocked: 1,
        [Op.or]: [
          { blocked_at: null },
          { blocked_at: { [Op.lt]: cutoff } },
        ],
      },
    }
  );
  return count;
}

async function errorLogAdd(wa_number, command, err) {
  try {
    await ErrorLogs.create({
      wa_number: wa_number || null,
      command: command ? command.slice(0, 255) : null,
      error_message: (err && err.message) || String(err),
      stack: (err && err.stack) || null,
    });
  } catch (logErr) {
    console.error("[errorLogAdd] failed to write log:", logErr.message);
  }
}

async function errorLogRecent(limit = 10) {
  try {
    return await ErrorLogs.findAll({
      order: [["id", "DESC"]],
      limit,
      attributes: ["id", "wa_number", "command", "error_message", "created_at"],
    });
  } catch (e) {
    console.error("[errorLogRecent]", e.message);
    return [];
  }
}

async function statsForAdmin() {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const last30d = new Date(now);
  last30d.setDate(last30d.getDate() - 30);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalRegistered,
    subscribedCount,
    blockedCount,
    totalSso,
    loggedInSso,
    couponsTodaySuccess,
    attemptsToday,
    newUsers30d,
    coupons30d,
    freeTrialUsed,
    errorsLast24h,
  ] = await Promise.all([
    RegisteredWhatsapp.count(),
    WAMessages.count({ where: { subscribed: true, blocked: 0 } }),
    WAMessages.count({ where: { blocked: 1 } }),
    SSOAccounts.count(),
    SSOAccounts.count({ where: { status_login: 1 } }),
    TakenCoupons.count({
      where: { created_at: { [Op.gte]: today }, taken_success: true },
    }),
    TakenCoupons.count({ where: { created_at: { [Op.gte]: today } } }),
    RegisteredWhatsapp.count({
      where: { created_at: { [Op.gte]: last30d } },
    }),
    TakenCoupons.count({
      where: { created_at: { [Op.gte]: last30d }, taken_success: true },
    }),
    WAMessages.count({ where: { free_trial: 1 } }),
    ErrorLogs.count({ where: { created_at: { [Op.gte]: last24h } } }),
  ]);

  const submitPerLocation = {};
  for (const loc of [1, 2, 3, 4]) {
    submitPerLocation[loc] = await getCountSubmission(true, loc);
  }

  return {
    totalRegistered,
    subscribedCount,
    blockedCount,
    totalSso,
    loggedInSso,
    couponsTodaySuccess,
    attemptsToday,
    newUsers30d,
    coupons30d,
    freeTrialUsed,
    errorsLast24h,
    submitPerLocation,
  };
}

// One-shot merge of a @lid wa_number into its @c.us canonical form.
// Called lazily by router whenever a @lid message arrives and resolves
// to a @c.us via WA Web's contact store. Idempotent: if no @lid row
// exists, this is a no-op.
// List every @lid wa_number that still exists in either table.
async function listLidWaNumbers() {
  const [waRows, regRows] = await Promise.all([
    WAMessages.findAll({
      where: { wa_number: { [Op.like]: "%@lid" } },
      attributes: ["wa_number"],
      raw: true,
    }),
    RegisteredWhatsapp.findAll({
      where: { wa_number: { [Op.like]: "%@lid" } },
      attributes: ["wa_number"],
      raw: true,
    }),
  ]);
  const set = new Set();
  for (const r of waRows) set.add(r.wa_number);
  for (const r of regRows) set.add(r.wa_number);
  return [...set];
}

async function mergeLidIntoCus(lidId, cusId) {
  if (!lidId || !cusId || lidId === cusId) return { changed: false };
  if (!lidId.endsWith("@lid") || !cusId.endsWith("@c.us")) return { changed: false };

  let changed = false;
  try {
    // 1. Migrate registereds (sso_ids tied to wa_number)
    const lidReg = await RegisteredWhatsapp.findOne({ where: { wa_number: lidId } });
    if (lidReg) {
      const cusReg = await RegisteredWhatsapp.findOne({ where: { wa_number: cusId } });
      if (!cusReg) {
        await lidReg.update({ wa_number: cusId });
      } else {
        // Combine sso_ids (comma-separated strings, dedupe ints)
        const merge = (s) =>
          (s || "")
            .split(",")
            .map((x) => parseInt(x.trim(), 10))
            .filter((n) => !isNaN(n));
        const combined = [...new Set([...merge(cusReg.sso_ids), ...merge(lidReg.sso_ids)])];
        await cusReg.update({
          sso_ids: combined.join(", "),
          pay_sso_id: cusReg.pay_sso_id || lidReg.pay_sso_id || 0,
        });
        await lidReg.destroy();
      }
      changed = true;
    }

    // 2. Migrate wa_messages (per-user state)
    const lidWa = await WAMessages.findOne({ where: { wa_number: lidId } });
    if (lidWa) {
      const cusWa = await WAMessages.findOne({ where: { wa_number: cusId } });
      if (!cusWa) {
        await lidWa.update({ wa_number: cusId });
      } else {
        // Take logical OR for boolean-ish fields, prefer existing c.us state
        await cusWa.update({
          subscribed: cusWa.subscribed || lidWa.subscribed,
          free_trial: cusWa.free_trial || lidWa.free_trial,
          // pending_action: keep c.us's (more recent state typically)
          // last_messages: keep c.us's
        });
        await lidWa.destroy();
      }
      changed = true;
    }
  } catch (e) {
    console.error("[mergeLidIntoCus]", e.message);
  }
  return { changed };
}

async function couponRunSummary(targetDate = null) {
  const day = targetDate ? new Date(targetDate) : new Date();
  day.setHours(0, 0, 0, 0);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);

  const rows = await TakenCoupons.findAll({
    where: { created_at: { [Op.gte]: day, [Op.lt]: next } },
    attributes: [
      "id",
      "sso_id",
      "taken_success",
      "pick_location",
      "found_option_at",
      "send_at",
      "has_sent_at",
      "wa_sent_at",
    ],
    raw: true,
  });

  const total = rows.length;
  const success = rows.filter((r) => r.taken_success).length;
  const failed = total - success;

  const perLocation = { 1: { ok: 0, fail: 0 }, 2: { ok: 0, fail: 0 }, 3: { ok: 0, fail: 0 }, 4: { ok: 0, fail: 0 } };
  for (const r of rows) {
    const loc = r.pick_location;
    if (!perLocation[loc]) perLocation[loc] = { ok: 0, fail: 0 };
    if (r.taken_success) perLocation[loc].ok += 1;
    else perLocation[loc].fail += 1;
  }

  const sentToWA = rows.filter((r) => r.wa_sent_at).length;
  const successWithFoundOption = rows.filter((r) => r.taken_success && r.found_option_at);
  let avgFoundLatencyMs = null;
  if (successWithFoundOption.length > 0) {
    const targetMs = new Date(day);
    targetMs.setHours(10, 0, 0, 0);
    const latencies = successWithFoundOption.map(
      (r) => new Date(r.found_option_at).getTime() - targetMs.getTime()
    );
    avgFoundLatencyMs =
      latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  return {
    date: day.toISOString().slice(0, 10),
    total,
    success,
    failed,
    sentToWA,
    perLocation,
    avgFoundLatencyMs,
  };
}

async function ssoPickBalancedLocation(maxPerLocation = 30) {
  const counts = [1, 2, 3, 4].map((loc) =>
    getCountSubmission(true, loc).then((n) => ({ loc, n }))
  );
  const resolved = await Promise.all(counts);
  const available = resolved.filter((r) => r.n < maxPerLocation);
  if (available.length === 0) {
    // every location full — pick at random anyway, submit will stay disabled
    return Math.floor(Math.random() * 4) + 1;
  }
  const minLoad = Math.min(...available.map((r) => r.n));
  const leastLoaded = available.filter((r) => r.n === minLoad);
  return leastLoaded[Math.floor(Math.random() * leastLoaded.length)].loc;
}

async function daftarFirstAccountWithTrial(wa_number, email, password, opts = {}) {
  const { trialQuota = 2, maxPerLocation = 30 } = opts;
  const existing = await registeredCountSSOIDS(wa_number);
  const isFirstAccount = existing === 0;

  let appliedTrial = false;
  if (isFirstAccount) {
    const waRow = await WAMessages.findOne({ where: { wa_number } });
    if (waRow && waRow.free_trial === 0) appliedTrial = true;
  }

  const location = await ssoPickBalancedLocation(maxPerLocation);
  const quota = appliedTrial ? trialQuota : 0;

  const sso_id = await ssoAddAccount(
    email,
    password,
    "",
    location,
    quota,
    0,
    0,
    0
  );
  if (!sso_id) return { ok: false, reason: "sso_add_failed" };

  const linkResult = await registeredAddAccountID(wa_number, sso_id);
  if (!linkResult) {
    // Linking failed — clean up the orphan SSO account so we don't leak rows.
    try {
      await ssoDeleteAccount(sso_id);
    } catch (_) {}
    return { ok: false, reason: "link_failed" };
  }

  let submitEnabled = false;
  if (appliedTrial) {
    const locCount = await getCountSubmission(true, location);
    if (locCount < maxPerLocation) {
      await ssoEditAccountEnableSubmit(sso_id, 1);
      submitEnabled = true;
    }
    await WAMessages.update({ free_trial: 1 }, { where: { wa_number } });
  }

  return {
    ok: true,
    sso_id,
    location,
    quota,
    submit_enabled: submitEnabled,
    applied_trial: appliedTrial,
    is_first_account: isFirstAccount,
    account_index: existing + 1,
  };
}

async function reverseEncryption() {
  try {
    const all_accounts = await SSOAccounts.findAll();
    all_accounts.forEach(async (acc) => {
      const account = await SSOAccounts.findByPk(acc.id);
      if (account) {
        account.email = encrypt(account.email);
        account.password = encrypt(account.password);
        await account.save();
        console.log(
          `Updated account ${account.id}: ${decrypt(account.email)} ${decrypt(
            account.password
          )}`
        );
        return true;
      } else {
        console.log(`Account ${account_id} not found.`);
        return false;
      }
    });
  } catch (error) {
    console.error(error);
    return false;
  }
}

module.exports = {
  registeredNewAddAccount,
  registeredAddAccountID,
  registeredRemoveAccountID,
  registeredGetWANumberBySSOID,
  registeredGetSSOIDS,
  registeredCountSSOIDS,
  registeredGetAccount,
  registeredGetPaySSOID,
  registeredEditPaySSOID,
  registeredTotalAccounts,
  waMsgAddAccount,
  waMsgEditMessages,
  waMsgGetLastMessages,
  waMsgEditConfirmation,
  waMsgGetConfirmation,
  waMsgEditBlocked,
  waMsgGetBlocked,
  waMsgEditRulesAccepted,
  waMsgGetRulesAccepted,
  waMsgGetFreeTrialStatus,
  waMsgEditFreeTrialStatus,
  waMsgGetAllWANumber,
  ssoCountTotalAccounts,
  ssoAddAccount,
  ssoGetAccount,
  ssoDeleteAccount,
  ssoEditAccountEmailPassword,
  ssoEditAccountLocation,
  ssoEditAccountQuota,
  ssoGetAccountQuota,
  ssoEditAccountEnableSubmit,
  ssoEditAccountByID,
  ssoEditAccountReminded,
  couponsAddEntry,
  couponsCountTakenEntries,
  couponsCheckTakenToday,
  couponsUpdateWASent,
  couponsCountLatestEntriesLocation,
  couponsLatestEntryDate,
  couponsGetAllEntriesToday,
  getCombinedSSOAccounts,
  getFalseSubmissionAccountsToday,
  getCountSubmission,
  waMsgSetSubscribed,
  waMsgGetSubscribedNumbers,
  waMsgSetPendingAction,
  waMsgGetPendingAction,
  waMsgClearPendingAction,
  waMsgSetBlocked,
  waMsgIsBlocked,
  waMsgExpireStaleBlocks,
  errorLogAdd,
  errorLogRecent,
  statsForAdmin,
  couponRunSummary,
  mergeLidIntoCus,
  listLidWaNumbers,
  ssoPickBalancedLocation,
  daftarFirstAccountWithTrial,
};
