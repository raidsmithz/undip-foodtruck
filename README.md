# UFood — Undip Foodtruck Coupon Automation

Sistem otomatis untuk mengambil kupon Foodtruck Undip lewat portal SSO atas nama mahasiswa terdaftar dan mengirimkan QR-nya langsung ke WhatsApp. Pribadi, bukan layanan resmi Undip.

## Arsitektur

Tiga runtime, satu MariaDB:

```
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  Node WhatsApp bot  │     │  Python coupon-taker │     │  Next.js admin UI    │
│  src/chat_bot/      │     │  python/             │     │  client/             │
│  + Express :3000    │     │  cron 09:55 weekdays │     │  (boilerplate, TBD)  │
└──────────┬──────────┘     └──────────┬───────────┘     └──────────┬───────────┘
           │                           │                            │
           └───────────────┬───────────┴────────────────────────────┘
                           │
                ┌──────────▼──────────┐
                │  MariaDB 10.11      │
                │  sql_undip_foodtruck│
                └─────────────────────┘
```

| Runtime | Role | Entry |
|---|---|---|
| Node bot | WA chat handler + Express admin API + cron (sendCoupons, doLoginAccounts, reminders) | `src/app.js` → `src/chat_bot/bot.js` |
| Python coupon-taker | Logs into SSO (saved cookies), solves Cloudflare Turnstile, submits the daily form, downloads QR | `python/main.py` |
| Next.js admin UI | Web dashboard (planned) for the Express `/api/accounts` endpoints | `client/pages/index.tsx` |

Both runtimes share the same encryption key (AES-256-CBC) so cookies and credentials written by one are readable by the other.

## Stack

**Node** — Express, Sequelize, `whatsapp-web.js` (with `puppeteer-extra-plugin-stealth`), `node-schedule`, PM2.
**Python** — pyppeteer, BeautifulSoup, requests, SQLAlchemy, python-dotenv.
**Browser** — Chromium (snap on aarch64, regular on x86) launched headless under `xvfb` on production.
**Anti-bot solver** — CapSolver for Cloudflare Turnstile.
**Proxy** — IPRoyal residential, region-pinned to Indonesia (`country-id`) — required for the SSO portal.

## Setup

### 1. Clone & install deps

```bash
git clone git@github.com:raidsmithz/undip-foodtruck.git
cd undip-foodtruck
npm install
cd python && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && deactivate && cd ..
```

### 2. Environment

```bash
cp .env.example .env
# Edit .env to fill: MYSQL_*, ENCRYPTION_KEY/IV, ADMIN_WHATSAPP*, PROXY_*,
# CAPSOLVER_API_KEY, TURNSTILE_*, CHROME_EXECUTABLE_PATH, CHROME_HEADLESS
```

Generate fresh AES keys:
```bash
openssl rand -hex 32   # → ENCRYPTION_KEY
openssl rand -hex 16   # → ENCRYPTION_IV
```

These MUST match in `python/config.py` / `python/encryption.py` (it loads the same `.env`).

### 3. Database

The schema is managed by Sequelize `sync({ alter: true })` at bot boot:

```bash
mysql -uroot -p -e "CREATE DATABASE sql_undip_foodtruck CHARACTER SET utf8mb4;"
mysql -uroot -p -e "CREATE USER 'sql_undip_foodtruck'@'localhost' IDENTIFIED BY 'your-pwd';"
mysql -uroot -p -e "GRANT ALL ON sql_undip_foodtruck.* TO 'sql_undip_foodtruck'@'localhost';"
```

Restoring an existing dump:
```bash
mysql -usql_undip_foodtruck -p sql_undip_foodtruck < dump.sql
```

### 4. Run

Local dev:
```bash
npm run dev   # nodemon — watches src/, restarts on edit
```

The first run will print a WhatsApp QR in the terminal. Scan via `WhatsApp → Linked Devices → Link a device`. Session is saved at `src/chat_bot/wa_session/` so reboots skip the QR.

## Project structure

```
src/
  app.js                 ← Express server entry + sequelize.sync()
  chat_bot/
    bot.js               ← whatsapp-web.js client + cron registration
    router.js            ← single message dispatcher
    state.js             ← pending_action FSM helpers
    helpers.js           ← location/status names, time predicates
    views.js             ← all reply text (Indonesian)
    cron.js              ← scheduled jobs
    commands/            ← one file per command (~13 commands)
  config/database.js     ← Sequelize instance
  middleware/auth.js     ← JWT for /api/accounts
  models/
    tables.js            ← Sequelize models (5 tables)
    functions.js         ← DB helper functions used by commands
  routes/accounts.js     ← Express /api/accounts (encrypted JSON)
  undip_login/
    sso_login_manager.js ← Puppeteer driver for SSO login
    login_accounts.js    ← Batch login + single-account login
  utils/encryption.js    ← AES-256-CBC encrypt/decrypt

python/
  main.py                ← coupon-taker entry (cron 09:55)
  methods.py             ← BotUndipFoodTruck class, page interactions
  solver_v2.py           ← CapSolver client
  database.py            ← SQLAlchemy mirror of subset of tables
  config.py              ← .env loader
  encryption.py          ← matches src/utils/encryption.js byte-for-byte

client/                  ← Next.js boilerplate (admin UI TBD)

scripts/
  start.sh               ← xvfb-run wrapper for PM2
  test-router.js         ← 25-scenario smoke test for the bot router
  backup-mysql.sh        ← Daily mysqldump rotation

docs/
  wa-bot-ai-system-instruction.md   ← AI guide-mode prompt (deferred feature)
```

## Bot commands (Indonesian, sent via WhatsApp)

### User-facing

| Command | Effect |
|---|---|
| `ufood` | Panduan + aturan singkat |
| `commands` | Daftar perintah lengkap |
| `ufood daftar {email} {password}` | Register akun SSO. Akun pertama auto-grant Free Trial 2x |
| `ufood akun` | List akun + status |
| `ufood akun N` | Detail akun ke-N |
| `ufood akun N beli` | Beli kuota — bot kirim QRIS, user balas screenshot |
| `ufood akun N ganti {email} {password}` | Ganti kredensial (snapshot, no `ya`) |
| `ufood akun N lokasi {1-4}` | Atur lokasi pengambilan |
| `ufood akun N submit {enable\|disable}` | Toggle submit otomatis |
| `ufood akun N hapus` → `ya`/`batal` | Hapus akun (perlu konfirmasi) |
| `ufood status` | Statistik & ketersediaan kuota lokasi |
| `ufood subscribe` / `ufood unsubscribe` | Toggle notifikasi broadcast |
| `ping` → `ya`/`batal` | Minta admin handle manual (3h auto-expire) |

### Admin-only (sent from `ADMIN_WHATSAPP`)

| Command | Effect |
|---|---|
| Reply `ya N` ke forwarded payment image | Tambah N ke kuota user |
| Reply `ya 0` | Grant Free Trial 2x manual override |
| Reply `tidak` | Reject pembayaran |
| Reply `sudah` ke `{wa}_ping` notice | Re-enable user yang sebelumnya `ping` |
| `!login` | Force re-login semua akun SSO sekarang |
| `!kupon` | Force kirim kupon hari ini sekarang |
| `!kirim {message}` | Broadcast ke semua subscribed users (rate-limited 600-1200ms) |

### Pricing

- Free Trial: 2x (otomatis untuk akun pertama, max 1x per nomor WA)
- Paket 4x: Rp15.000
- Paket 16x: Rp50.000
- QRIS via Mallocation
- Kuota tidak berkurang kalau sistem gagal ambil kupon

### Locations

1. Gedung SA-MWA · 2. Student Center · 3. Audit. FPIK · 4. Audit. Imam Bardjo
(Maks 30 akun aktif submit per lokasi, total 120)

## Testing

```bash
node scripts/test-router.js
```

25 scenarios covering router dispatch, all command files, pending FSM, image refusal, broadcast filter, error_logs. Uses a marked test wa_number; cleans up after.

## Deployment

Production runs on **afit** — Oracle Cloud aarch64 Ubuntu 24.04 with BT-Panel (Chinese aaPanel).

```bash
# On afit (one-time)
git clone git@github.com:raidsmithz/undip-foodtruck.git
cp .env.example .env  # fill in production values
npm install
cd python && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && deactivate && cd ..
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Daily redeploy
ssh afit 'cd ~/undip-foodtruck && git pull --ff-only && pm2 restart ufood-bot'
```

The `ecosystem.config.js` runs the bot under `xvfb-run -a npm start` so puppeteer launches with a virtual display (snap chromium on aarch64 needs this for whatsapp-web.js to navigate cleanly).

Cron in user crontab handles the Python coupon-taker:
```
55 9 * * 1-5 cd /home/ubuntu/undip-foodtruck/python && /home/ubuntu/undip-foodtruck/python/.venv/bin/python main.py >> python/logs/cron.log 2>&1
0 3 * * *   /home/ubuntu/undip-foodtruck/scripts/backup-mysql.sh
```

## License

ISC. Private project. The `pay_qris_me.jpg` and any production data files are not for redistribution.
