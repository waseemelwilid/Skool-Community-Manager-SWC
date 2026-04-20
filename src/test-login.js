// Run this locally first to verify login works and inspect selectors
// node src/test-login.js
import { SkoolBot } from './skool.js';

const EMAIL = process.env.SKOOL_EMAIL;
const PASSWORD = process.env.SKOOL_PASSWORD;

const bot = new SkoolBot();
await bot.init();

// Run with headless: false to see the browser
bot.browser.close();

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: false }); // visible browser
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://www.skool.com/login');
console.log('Fill in your credentials manually, then press Enter here...');
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(5000);

console.log('Current URL:', page.url());
console.log('Login test complete. Check the browser window.');

// Take a screenshot for debugging
await page.screenshot({ path: 'login-result.png' });
console.log('Screenshot saved to login-result.png');

await browser.close();
