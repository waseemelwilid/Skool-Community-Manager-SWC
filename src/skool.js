import { chromium } from 'playwright';

const COMMUNITY_SLUG = 'selfworkacademy';
const BASE_URL = 'https://www.skool.com';

// Skool nav pages — these are NOT posts
const NAV_SLUGS = ['classroom', 'calendar', 'about', 'chat', '/-/', 'daily-accountability-submission'];

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

    await this.page.waitForFunction(
      () => !window.location.href.includes('/login'),
      { timeout: 60000 }
    );
    console.log('Logged in. Current URL:', this.page.url());
  }

  async getNewPosts(since) {
    console.log('Checking community feed...');
    await this.page.goto(`${BASE_URL}/${COMMUNITY_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(8000);

    // Scroll to load more posts
    for (let i = 0; i < 6; i++) {
      await this.page.evaluate(() => window.scrollBy(0, 1000));
      await this.page.waitForTimeout(1200);
    }

    console.log('Feed URL:', this.page.url());

    const posts = await this.page.evaluate((slug) => {
      const NAV = ['classroom', 'calendar', 'about', 'chat', '/-/', 'daily-accountability-submission'];
      const results = [];
      const seen = new Set();

      // Skool posts: a[href^="/selfworkacademy/"] excluding nav pages and profile links
      const links = document.querySelectorAll(`a[href^="/${slug}/"]`);

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        // Skip nav pages
        if (NAV.some(n => href.includes(n))) return;
        // Skip profile links (/@username)
        if (href.includes('/@')) return;
        // Skip query-only links with no slug change
        const slug_part = href.split('/').filter(Boolean).slice(1).join('/').split('?')[0];
        if (!slug_part || slug_part.length < 3) return;

        // Post ID: use ?p= param if present, else use slug
        const pMatch = href.match(/[?&]p=([^&]+)/);
        const postId = pMatch ? pMatch[1] : slug_part;

        if (seen.has(postId)) return;
        seen.add(postId);

        // Walk up to find post container
        let el = link;
        for (let i = 0; i < 8; i++) {
          el = el.parentElement;
          if (!el) break;
          if (el.innerText?.trim().length > 30) break;
        }

        const fullText = el?.innerText || '';
        const text = fullText.slice(0, 600);
        if (text.length < 20) return;

        const hasNewComment = fullText.toLowerCase().includes('new comment');
        const dinoAlreadyCommented = fullText.includes('Ahmed Dino');

        const commentEls = el?.querySelectorAll('[class*="comment"], [class*="reply"]');
        const latestReply = commentEls?.length
          ? commentEls[commentEls.length - 1]?.innerText?.trim()
          : '';

        // Author: find the /@username link — the href contains the slug, text may be a count
        // The real author name is in a nearby text element, not the link text itself
        const authorLinks = el?.querySelectorAll('a[href^="/@"]');
        const authorLink = authorLinks?.[0];
        const authorHref = authorLink?.getAttribute('href') || '';
        const authorProfile = authorHref ? `https://www.skool.com${authorHref}` : null;
        // Extract username from href slug e.g. /@ahmed-ibrahim-5780 → "ahmed ibrahim"
        const hrefSlug = authorHref.split('?')[0].replace('/@', '').replace(/-\d+$/, '').replace(/-/g, ' ');
        const authorName = hrefSlug || authorLink?.innerText?.trim() || '';
        // Dino's exact profile slug is /@dino — only skip if it's his specific account
        const isDinoPost = /^\/@dino[?&]/.test(authorHref) || authorHref === '/@dino';

        // Clean URL — use the href without duplicate query params
        const cleanUrl = href.startsWith('http') ? href : `https://www.skool.com${href.split('?')[0]}`;

        results.push({
          id: postId,
          url: cleanUrl,
          body: text,
          author: authorName,
          authorProfile,
          isDinoPost,
          dinoAlreadyCommented,
          latestReply,
          hasNewComment,
        });
      });

      // New comments first
      results.sort((a, b) => (b.hasNewComment ? 1 : 0) - (a.hasNewComment ? 1 : 0));
      return results.slice(0, 20);
    }, COMMUNITY_SLUG);

    console.log(`Found ${posts.length} posts on feed.`);
    return posts;
  }

  async replyToPost(postUrl, reply) {
    console.log(`Replying to post: ${postUrl}`);
    await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(3000);

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
      if (await el.count() > 0) { commentBox = el; break; }
    }

    if (!commentBox) {
      console.log('Could not find comment box, skipping post.');
      return;
    }

    await commentBox.click();
    await this.page.waitForTimeout(500);
    // Use type() instead of fill() for contenteditable elements
    await commentBox.type(reply, { delay: 30 });
    await this.page.waitForTimeout(1000);

    // Try clicking submit button first
    let submitted = false;
    const submitSelectors = [
      'button:has-text("Post")',
      'button:has-text("Reply")',
      'button:has-text("Comment")',
      'button:has-text("Send")',
      'button[type="submit"]',
    ];

    for (const sel of submitSelectors) {
      const btn = this.page.locator(sel).first();
      if (await btn.count() > 0) {
        await btn.click();
        submitted = true;
        console.log(`Submitted via: ${sel}`);
        break;
      }
    }

    // Fallback: Ctrl+Enter or Enter
    if (!submitted) {
      await commentBox.press('Control+Enter');
      console.log('Submitted via Ctrl+Enter');
    }

    await this.page.waitForTimeout(3000);
    console.log('Reply posted.');
  }

  async getUnreadDMs() {
    console.log('Checking DMs...');

    // Skool chat is at /selfworkacademy/chat
    await this.page.goto(`${BASE_URL}/${COMMUNITY_SLUG}/chat`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(5000);
    console.log('Chat page URL:', this.page.url());

    // Skool chat is a React SPA with no <a> tags — find clickable conversation rows
    const threadCount = await this.page.evaluate(() => {
      // Look for conversation list items (divs/li with click handlers)
      const candidates = document.querySelectorAll('[class*="conversation"], [class*="thread"], [class*="chat-item"], [class*="message-item"], [class*="inbox-item"]');
      console.log('Chat candidates found:', candidates.length);
      return candidates.length;
    });
    console.log(`Chat conversation candidates: ${threadCount}`);

    // Get all clickable items in the chat panel that look like conversations
    const conversations = await this.page.evaluate(() => {
      const results = [];
      // Find all elements that could be conversation rows
      const selectors = [
        '[class*="conversation"]',
        '[class*="thread"]',
        '[class*="chat-item"]',
        '[class*="message-preview"]',
        '[class*="inbox"]',
      ];
      const seen = new Set();
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el, i) => {
          const text = el.innerText?.trim();
          if (!text || seen.has(text)) return;
          seen.add(text);
          const hasUnread = !!(el.querySelector('[class*="unread"], [class*="badge"], [class*="dot"]'))
            || /\(\d+\)/.test(text);
          results.push({ index: results.length, text: text.slice(0, 100), hasUnread });
        });
      }
      return results;
    });

    console.log('Chat conversations found:', JSON.stringify(conversations));
    // Return empty for now — DMs need click-based interaction built separately
    return [];
  }

  async getLastDMInThread(threadUrl) {
    await this.page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(3000);

    try {
      await this.page.waitForSelector('[class*="message"], [class*="chat"], [class*="bubble"]', { timeout: 8000 });
    } catch { /* continue */ }

    return await this.page.evaluate(() => {
      const selectors = ['[class*="message-body"]', '[class*="message"]', '[class*="bubble"]', '[class*="chat-text"]', 'p'];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        const texts = Array.from(els).map(e => e.innerText?.trim()).filter(t => t && t.length > 3);
        if (texts.length) return texts[texts.length - 1];
      }
      return '';
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
      if (await el.count() > 0) { inputBox = el; break; }
    }

    if (!inputBox) { console.log('Could not find DM input, skipping.'); return; }

    await inputBox.click();
    await inputBox.fill(reply);
    await this.page.waitForTimeout(500);
    await inputBox.press('Enter');
    await this.page.waitForTimeout(2000);
    console.log('DM reply sent.');
  }

  async sendNewDM(profileUrl, message) {
    console.log(`Sending re-engagement DM via profile: ${profileUrl}`);
    await this.page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(3000);

    const msgSelectors = [
      'button:has-text("Message")',
      'button:has-text("DM")',
      'a:has-text("Message")',
      '[aria-label*="message" i]',
    ];

    let msgBtn = null;
    for (const sel of msgSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) { msgBtn = el; break; }
    }

    if (!msgBtn) { console.log('No Message button found on profile, skipping.'); return false; }

    await msgBtn.click();
    await this.page.waitForTimeout(2000);

    const inputSelectors = [
      '[placeholder*="message" i]',
      '[contenteditable="true"]',
      'textarea',
    ];

    let inputBox = null;
    for (const sel of inputSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) { inputBox = el; break; }
    }

    if (!inputBox) { console.log('No DM compose box found, skipping.'); return false; }

    await inputBox.click();
    await inputBox.fill(message);
    await this.page.waitForTimeout(500);
    await inputBox.press('Enter');
    await this.page.waitForTimeout(2000);
    console.log('Re-engagement DM sent.');
    return true;
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}
