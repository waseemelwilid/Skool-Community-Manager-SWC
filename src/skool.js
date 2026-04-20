import { chromium } from 'playwright';

const COMMUNITY_SLUG = 'selfworkacademy';
const BASE_URL = 'https://www.skool.com';

export class SkoolBot {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    this.page = await context.newPage();
    this.page.setDefaultTimeout(60000);
  }

  async login(email, password) {
    console.log('Logging in to Skool...');
    await this.page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(2000);

    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button[type="submit"]');

    // Wait for redirect away from login page
    await this.page.waitForFunction(
      () => !window.location.href.includes('/login'),
      { timeout: 30000 }
    );
    console.log('Logged in. Current URL:', this.page.url());
  }

  async getNewPosts(since) {
    console.log('Checking community feed...');
    await this.page.goto(`${BASE_URL}/${COMMUNITY_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(3000);

    const currentUrl = this.page.url();
    console.log('Feed URL:', currentUrl);

    const posts = await this.page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/p/"]');
      const seen = new Set();

      links.forEach(link => {
        const href = link.getAttribute('href');
        const match = href.match(/\/p\/([^/?#]+)/);
        if (!match) return;

        const postId = match[1];
        if (seen.has(postId)) return;
        seen.add(postId);

        // Walk up to find post container
        let el = link;
        let text = '';
        let author = '';
        for (let i = 0; i < 6; i++) {
          el = el.parentElement;
          if (!el) break;
          const t = el.innerText?.trim();
          if (t && t.length > 20) { text = t.slice(0, 500); break; }
        }

        // Check if Ahmed Dino already commented
        const fullText = el?.innerText || '';
        const dinoAlreadyCommented = fullText.includes('Ahmed Dino');

        // Get the latest reply text (last comment in the thread preview)
        const commentEls = el?.querySelectorAll('[class*="comment"], [class*="reply"]');
        const latestReply = commentEls?.length
          ? commentEls[commentEls.length - 1]?.innerText?.trim()
          : '';

        results.push({
          id: postId,
          url: `https://www.skool.com${href}`,
          body: text,
          author,
          dinoAlreadyCommented,
          latestReply,
        });
      });

      return results.slice(0, 15);
    });

    console.log(`Found ${posts.length} posts on feed.`);
    return posts;
  }

  async replyToPost(postUrl, reply) {
    console.log(`Replying to post: ${postUrl}`);
    await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(3000);

    // Try to find comment input
    const commentSelectors = [
      '[placeholder*="comment" i]',
      '[placeholder*="write" i]',
      '[placeholder*="reply" i]',
      '[contenteditable="true"]',
      'textarea',
    ];

    let commentBox = null;
    for (const sel of commentSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        commentBox = el;
        break;
      }
    }

    if (!commentBox) {
      console.log('Could not find comment box, skipping post.');
      return;
    }

    await commentBox.click();
    await commentBox.fill(reply);
    await this.page.waitForTimeout(1000);

    // Try to submit
    const submitSelectors = [
      'button:has-text("Post")',
      'button:has-text("Reply")',
      'button:has-text("Comment")',
      'button[type="submit"]',
    ];

    for (const sel of submitSelectors) {
      const btn = this.page.locator(sel).first();
      if (await btn.count() > 0) {
        await btn.click();
        break;
      }
    }

    await this.page.waitForTimeout(2000);
    console.log('Reply posted.');
  }

  async getUnreadDMs() {
    console.log('Checking DMs...');

    // Try different inbox URLs
    const inboxUrls = [
      `${BASE_URL}/${COMMUNITY_SLUG}/inbox`,
      `${BASE_URL}/inbox`,
      `${BASE_URL}/${COMMUNITY_SLUG}/messages`,
    ];

    for (const url of inboxUrls) {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.waitForTimeout(2000);
      const currentUrl = this.page.url();
      console.log('Inbox URL tried:', currentUrl);
      if (!currentUrl.includes('404') && !currentUrl.includes('not-found')) break;
    }

    const threads = await this.page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="inbox"], a[href*="message"], a[href*="dm"]');

      links.forEach(link => {
        const href = link.getAttribute('href');
        const threadId = href?.split('/').filter(Boolean).pop();
        const text = link.innerText?.trim();
        if (threadId && text) {
          results.push({
            id: threadId,
            url: `https://www.skool.com${href}`,
            preview: text.slice(0, 200),
            sender: '',
          });
        }
      });

      return results.slice(0, 5); // max 5 DMs per run
    });

    console.log(`Found ${threads.length} DM threads.`);
    return threads;
  }

  async getLastDMInThread(threadUrl) {
    await this.page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(2000);

    return await this.page.evaluate(() => {
      const els = document.querySelectorAll('p, [class*="message"], [class*="body"]');
      const texts = Array.from(els).map(e => e.innerText?.trim()).filter(t => t && t.length > 5);
      return texts[texts.length - 1] || '';
    });
  }

  async replyToDM(threadUrl, reply) {
    console.log(`Replying to DM: ${threadUrl}`);
    await this.page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(2000);

    const inputSelectors = [
      '[placeholder*="message" i]',
      '[placeholder*="reply" i]',
      '[contenteditable="true"]',
      'textarea',
    ];

    let inputBox = null;
    for (const sel of inputSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        inputBox = el;
        break;
      }
    }

    if (!inputBox) {
      console.log('Could not find DM input, skipping.');
      return;
    }

    await inputBox.click();
    await inputBox.fill(reply);
    await this.page.waitForTimeout(500);
    await inputBox.press('Enter');
    await this.page.waitForTimeout(2000);
    console.log('DM reply sent.');
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}
