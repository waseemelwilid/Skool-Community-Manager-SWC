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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    this.page = await context.newPage();
  }

  async login(email, password) {
    console.log('Logging in to Skool...');
    await this.page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    await this.page.fill('input[type="email"], input[name="email"]', email);
    await this.page.fill('input[type="password"], input[name="password"]', password);
    await this.page.click('button[type="submit"]');

    await this.page.waitForURL(url => !url.includes('/login'), { timeout: 15000 });
    console.log('Logged in successfully.');
  }

  async getNewPosts(since) {
    console.log('Checking community feed...');
    await this.page.goto(`${BASE_URL}/${COMMUNITY_SLUG}`, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(2000);

    const posts = await this.page.evaluate((sinceDate) => {
      const results = [];
      // Skool post cards — selectors may need adjusting after first run
      const postEls = document.querySelectorAll('[data-testid="post-card"], .post-card, article[class*="post"]');

      postEls.forEach(el => {
        const idEl = el.querySelector('a[href*="/p/"]');
        if (!idEl) return;

        const href = idEl.getAttribute('href');
        const postId = href.split('/p/')[1]?.split('/')[0];
        if (!postId) return;

        const timeEl = el.querySelector('time, [data-testid="post-time"], span[class*="time"]');
        const postTime = timeEl?.getAttribute('datetime') || timeEl?.textContent;

        const bodyEl = el.querySelector('[data-testid="post-body"], p, [class*="body"], [class*="content"]');
        const body = bodyEl?.textContent?.trim();

        const authorEl = el.querySelector('[data-testid="post-author"], [class*="author"], [class*="name"]');
        const author = authorEl?.textContent?.trim();

        if (body && postId) {
          results.push({ id: postId, url: `https://www.skool.com${href}`, body, author, postTime });
        }
      });

      return results;
    }, since);

    console.log(`Found ${posts.length} posts on feed.`);
    return posts;
  }

  async replyToPost(postUrl, reply) {
    console.log(`Replying to post: ${postUrl}`);
    await this.page.goto(postUrl, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(2000);

    // Find and click the comment/reply box
    const commentBox = await this.page.locator(
      '[data-testid="comment-input"], [placeholder*="comment"], [placeholder*="reply"], [class*="comment"] textarea, [class*="comment"] [contenteditable]'
    ).first();

    await commentBox.click();
    await commentBox.fill(reply);
    await this.page.waitForTimeout(500);

    // Submit
    const submitBtn = await this.page.locator(
      '[data-testid="submit-comment"], button:has-text("Post"), button:has-text("Reply"), button:has-text("Comment")'
    ).first();
    await submitBtn.click();
    await this.page.waitForTimeout(2000);

    console.log('Reply posted.');
  }

  async getUnreadDMs(since) {
    console.log('Checking DMs...');
    await this.page.goto(`${BASE_URL}/${COMMUNITY_SLUG}/inbox`, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(2000);

    // Try alternative inbox URL if above 404s
    if (this.page.url().includes('404') || this.page.url().includes('not-found')) {
      await this.page.goto(`${BASE_URL}/inbox`, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(2000);
    }

    const threads = await this.page.evaluate(() => {
      const results = [];
      const threadEls = document.querySelectorAll(
        '[data-testid="dm-thread"], [class*="thread"], [class*="message-row"], [class*="conversation"]'
      );

      threadEls.forEach(el => {
        const linkEl = el.querySelector('a[href*="inbox"], a[href*="message"]');
        const href = linkEl?.getAttribute('href');
        const threadId = href?.split('/').pop();
        const unreadBadge = el.querySelector('[class*="unread"], [class*="badge"], [data-unread]');
        const preview = el.querySelector('[class*="preview"], [class*="last-message"], p')?.textContent?.trim();
        const sender = el.querySelector('[class*="sender"], [class*="name"]')?.textContent?.trim();

        if (threadId && (unreadBadge || preview)) {
          results.push({ id: threadId, url: href ? `https://www.skool.com${href}` : null, preview, sender });
        }
      });

      return results;
    });

    console.log(`Found ${threads.length} DM threads to check.`);
    return threads;
  }

  async getLastDMInThread(threadUrl) {
    await this.page.goto(threadUrl, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(2000);

    return await this.page.evaluate(() => {
      const messages = document.querySelectorAll('[class*="message"], [data-testid="message"]');
      const last = messages[messages.length - 1];
      return last?.querySelector('p, [class*="body"], [class*="content"]')?.textContent?.trim();
    });
  }

  async replyToDM(threadUrl, reply) {
    console.log(`Replying to DM: ${threadUrl}`);
    await this.page.goto(threadUrl, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(2000);

    const inputBox = await this.page.locator(
      '[data-testid="message-input"], [placeholder*="message"], [placeholder*="reply"], textarea[class*="input"], [contenteditable="true"]'
    ).first();

    await inputBox.click();
    await inputBox.fill(reply);
    await this.page.waitForTimeout(500);

    // Send via Enter or button
    await inputBox.press('Enter');
    await this.page.waitForTimeout(2000);
    console.log('DM reply sent.');
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}
