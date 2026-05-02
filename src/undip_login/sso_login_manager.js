const puppeteer = require("puppeteer");
const dotenv = require("dotenv");
dotenv.config();

const PROXY_URL = process.env.PROXY_URL || "";
const PROXY_USERNAME = process.env.PROXY_USERNAME || "";
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || "";
// Same chrome the WhatsApp client uses (snap chromium on aarch64; bundled
// puppeteer chrome is x86-64 only and won't run on ARM hosts).
const CHROME_EXECUTABLE_PATH =
  process.env.CHROMIUM_EXECUTABLE_PATH ||
  process.env.CHROME_EXECUTABLE_PATH ||
  undefined; // fall through to puppeteer's bundled chrome on x86 hosts

async function waitForMultipleSelectors(page, selectors) {
  const selectorPromises = selectors.map((selector, index) =>
    page.waitForSelector(selector).then(() => ({
      winner: `selector${index + 1}`,
      handle: page.$(selector),
    }))
  );
  const winner = await Promise.race(selectorPromises);
  await winner.handle;
  return winner;
}

async function getCookieValue(cookies, cookieName) {
  const cookie = cookies.find((cookie) => cookie.name === cookieName);
  return cookie ? cookie.value : null;
}

class LoginManager {
  constructor(acc_id, email, password, chromeIndex) {
    this.id = acc_id;
    this.objectName = email.substring(0, email.indexOf("@"));
    this.email = email;
    this.password = password;
    this.formAppSessionValue = "";
    this.statusLogin = "";
    this.chromeIndex = chromeIndex;
  }

  async autoLoginGetCookie() {
    const launchArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
    ];
    if (PROXY_URL) {
      launchArgs.push(`--proxy-server=${PROXY_URL}`);
    }

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_EXECUTABLE_PATH,
      userDataDir:
        "./src/undip_login/chrome_session/login_session_" + this.chromeIndex,
      args: launchArgs,
    });
    const page = await browser.newPage();
    if (PROXY_URL && PROXY_USERNAME) {
      await page.authenticate({
        username: PROXY_USERNAME,
        password: PROXY_PASSWORD,
      });
    }
    const page_client = await page.target().createCDPSession();

    let attempt_retry = 3;
    while (true) {
      try {
        // Clear cookies
        await page_client.send("Network.clearBrowserCookies");
        const response = await page.goto(
          "https://form.undip.ac.id/sso/auth?t=MTY5MzgwNTY0MA=="
        );

        if (response.status() === 500) {
          await page_client.send("Network.clearBrowserCookies");
          await browser.close();
          this.statusLogin = "Server Error";
          break;
        }

        // Input Email Account
        await page.waitForSelector('input[name="loginfmt"]');
        await page.type('input[name="loginfmt"]', this.email);

        // Clicking Next Button
        await page.waitForSelector('input[value="Next"]');
        await page.click('input[value="Next"]');

        // Input Password Account
        const result = await waitForMultipleSelectors(page, [
          'input[value="Sign in"]',
          'div[id="usernameError"]',
        ]);
        if (result.winner === "selector1") {
          await page.waitForSelector('input[name="passwd"]');
          await page.type('input[name="passwd"]', this.password);
        } else if (result.winner === "selector2") {
          await page_client.send("Network.clearBrowserCookies");
          await browser.close();
          this.statusLogin = "Incorrect Username";
          break;
        }

        // Clicking Sign In Button
        await page.waitForSelector('input[value="Sign in"]');
        await page.click('input[value="Sign in"]');

        // Check password error occurs
        const result2 = await waitForMultipleSelectors(page, [
          'a[href="https://form.undip.ac.id/makanansehat/pendaftaran"]',
          'div[id="passwordError"]',
          'div[id="idDiv_SAOTCS_Title"]',
        ]);
        if (result2.winner === "selector1") {
          const cookies = await page.cookies("https://form.undip.ac.id");
          this.formAppSessionValue = await getCookieValue(
            cookies,
            "form_app_session"
          );
          await page_client.send("Network.clearBrowserCookies");
          await browser.close();
          this.statusLogin = "Logged In";
          break;
        } else if (result2.winner === "selector2") {
          await page_client.send("Network.clearBrowserCookies");
          await browser.close();
          this.statusLogin = "Incorrect Password";
          break;
        } else if (result2.winner === "selector3") {
          await page_client.send("Network.clearBrowserCookies");
          await browser.close();
          this.statusLogin = "Incorrect Region";
          break;
        }
      } catch (error) {
        if (attempt_retry > 0) {
          attempt_retry -= 1;
        } else {
          await page_client.send("Network.clearBrowserCookies");
          await browser.close();
          this.statusLogin = "System Error";
          break;
        }
      }
    }

    console.log(`[${this.objectName}] ${this.statusLogin}`);
    return this.statusLogin;
  }
}

module.exports = LoginManager;
