import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const EMAIL = process.env.SKOOL_EMAIL;
const PASSWORD = process.env.SKOOL_PASSWORD;
const COMMUNITY_SLUG = 'selfworkacademy';
const BASE_URL = 'https://www.skool.com';
const MY_NAME = 'Ahmed Dino';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();
page.setDefaultTimeout(60000);

// Login
console.log('Logging in...');
await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 60000 });
console.log('Logged in. URL:', page.url());

// Go to community feed
await page.goto(`${BASE_URL}/${COMMUNITY_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

// Scroll down to trigger lazy-loaded posts
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => window.scrollBy(0, 1200));
  await page.waitForTimeout(2000);
}

console.log('Page URL after load:', page.url());
console.log('Page title:', await page.title());

// Collect all post links
const postLinks = await page.evaluate(() => {
  const links = document.querySelectorAll('a[href*="/p/"]');
  const seen = new Set();
  const results = [];
  links.forEach(l => {
    const href = l.getAttribute('href');
    if (href && !seen.has(href)) {
      seen.add(href);
      results.push(`https://www.skool.com${href}`);
    }
  });
  console.log('All links on page:', document.querySelectorAll('a').length);
  return results;
});

console.log('All post links found:', postLinks);

console.log(`Found ${postLinks.length} posts to check for Dino's comments`);

const dinoComments = [];

for (const postUrl of postLinks) {
  try {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Scroll to load all comments
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(800);
    }

    const comments = await page.evaluate((name) => {
      const results = [];
      // Look for any element containing the name
      const allEls = document.querySelectorAll('*');
      allEls.forEach(el => {
        if (el.children.length > 0) return; // skip parent elements
        const text = el.innerText?.trim();
        if (text && text.includes(name)) {
          // Found the name — get the comment body nearby
          const container = el.closest('[class*="comment"], [class*="reply"], [class*="post"]');
          if (container) {
            const body = container.querySelector('p, [class*="body"], [class*="text"]');
            const bodyText = body?.innerText?.trim();
            if (bodyText && bodyText.length > 10 && !bodyText.includes(name)) {
              results.push(bodyText);
            }
          }
        }
      });
      return results;
    }, MY_NAME);

    if (comments.length > 0) {
      console.log(`Found ${comments.length} Dino comment(s) on: ${postUrl}`);
      dinoComments.push(...comments);
    }
  } catch (err) {
    console.log(`Skipped ${postUrl}: ${err.message}`);
  }
}

console.log(`\nTotal Dino comments found: ${dinoComments.length}`);

writeFileSync('my-voice.json', JSON.stringify({
  name: MY_NAME,
  comments: dinoComments,
  count: dinoComments.length,
  scrapedAt: new Date().toISOString(),
}, null, 2));

console.log('Saved to my-voice.json');
await browser.close();
