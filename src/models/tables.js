const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database");

class RegisteredWhatsapp extends Model {}
RegisteredWhatsapp.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    wa_number: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sso_ids: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pay_sso_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "registereds",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

class SSOAccounts extends Model {}
SSOAccounts.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    login_cookie: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "",
    },
    pick_location: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    available_quota: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    enable_submit: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    status_login: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    reminded: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "sso_accounts",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

class WAMessages extends Model {}
WAMessages.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    wa_number: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    last_messages: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },
    confirmation: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    rules_accepted: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    blocked: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    free_trial: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "wa_messages",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

class TakenCoupons extends Model {}
TakenCoupons.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    sso_id: {
      type: DataTypes.INTEGER,
      references: {
        model: SSOAccounts,
        key: "id",
      },
    },
    kupon_id: {
      type: DataTypes.INTEGER,
    },
    tanggal_id: {
      type: DataTypes.INTEGER,
    },
    taken_success: {
      type: DataTypes.BOOLEAN,
    },
    pick_location: {
      type: DataTypes.INTEGER,
    },
    coupon_file: {
      type: DataTypes.STRING,
    },
    validation_url: {
      type: DataTypes.STRING,
    },
    found_option_at: {
      type: DataTypes.DATE,
    },
    send_at: {
      type: DataTypes.DATE,
    },
    has_sent_at: {
      type: DataTypes.DATE,
    },
    wa_sent_at: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: "taken_coupons",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = {
  RegisteredWhatsapp,
  SSOAccounts,
  WAMessages,
  TakenCoupons,
};
