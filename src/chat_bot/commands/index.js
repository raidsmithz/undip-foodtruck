// Command registry. Order matters — most-specific patterns first, generic last.

const ufood = require("./ufood");
const subscribe = require("./subscribe");
const status = require("./status");
const daftar = require("./daftar");
const akun_beli = require("./akun_beli");
const akun_ganti = require("./akun_ganti");
const akun_lokasi = require("./akun_lokasi");
const akun_submit = require("./akun_submit");
const akun_hapus = require("./akun_hapus");
const akun_list = require("./akun_list");
const ping = require("./ping");

const admin = require("./admin");
const image = require("./image");

module.exports = {
  // Tried in order. First match wins.
  text: [
    ping,
    ufood,
    subscribe,
    status,
    daftar,
    akun_beli,
    akun_ganti,
    akun_lokasi,
    akun_submit,
    akun_hapus,
    akun_list, // most generic — keep last
  ],
  // Resolution handlers for pending_action confirmation.
  // Each command that puts something in pending_action exports resolveConfirm.
  pending: {
    delete: akun_hapus,
    ping: ping,
  },
  admin,
  image,
};
