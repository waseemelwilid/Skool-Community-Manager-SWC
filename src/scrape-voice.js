import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const EMAIL = process.env.SKOOL_EMAIL;
const PASSWORD = process.env.SKOOL_PASSWORD;
const COMMUNITY_SLUG = 'selfworkacademy';
const BASE_URL = 'https://www.skool.com';

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
await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
console.log('Logged in. URL:', page.url());

// Go to community
await page.goto(`${BASE_URL}/${COMMUNITY_SLUG}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// Get the logged-in user's name/identifier
const myName = await page.evaluate(() => {
  const nameEl = document.querySelector('[class*="profile"] [class*="name"], [class*="user"] [class*="name"], nav [class*="name"]');
  return nameEl?.innerText?.trim() || '';
});
console.log('Logged in as:', myName);

// Collect all post links on the feed
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
  return results.slice(0, 20);
});

console.log(`Found ${postLinks.length} posts to scrape`);

const myPosts = [];
const myComments = [];

for (const postUrl of postLinks) {
  await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const data = await page.evaluate((name) => {
    const result = { post: null, comments: [] };

    // Try to find post author and body
    const allTextBlocks = document.querySelectorAll('p, [class*="body"], [class*="content"]');

    // Find comments/replies
    const commentEls = document.querySelectorAll('[class*="comment"], [class*="reply"]');
    commentEls.forEach(el => {
      const authorEl = el.querySelector('[class*="name"], [class*="author"]');
      const bodyEl = el.querySelector('p, [class*="body"]');
      const author = authorEl?.innerText?.trim();
      const body = bodyEl?.innerText?.trim();

      if (author && body && (name ? author.includes(name) : true)) {
        result.comments.push({ author, body });
      }
    });

    return result;
  }, myName);

  if (data.comments.length > 0) {
    myComments.push(...data.comments.map(c => c.body));
  }
}

// Also check DMs
await page.goto(`${BASE_URL}/${COMMUNITY_SLUG}/inbox`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const dmTexts = await page.evaluate(() => {
  const els = document.querySelectorAll('p, [class*="message"]');
  return Array.from(els).map(e => e.innerText?.trim()).filter(t => t && t.length > 10).slice(0, 30);
});

const voice = {
  myName,
  posts: myPosts,
  comments: myComments.slice(0, 50),
  dms: dmTexts.slice(0, 20),
  scrapedAt: new Date().toISOString(),
};

writeFileSync('my-voice.json', JSON.stringify(voice, null, 2));
console.log(`Saved ${myComments.length} comments and ${dmTexts.length} DM messages to my-voice.json`);

await browser.close();
