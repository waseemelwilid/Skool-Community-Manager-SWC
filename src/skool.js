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
      { timeout: 60000 }
    );
    console.log('Logged in. Current URL:', this.page.url());
  }

  async getNewPosts(since) {
    console.log('Checking community feed...');
    await this.page.goto(`${BASE_URL}/${COMMUNITY_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for React to render posts — wait for actual post links to appear
    try {
      await this.page.waitForSelector('a[href*="/p/"]', { timeout: 15000 });
    } catch {
      console.log('Post links not found after 15s, proceeding anyway...');
    }
    await this.page.waitForTimeout(3000);

    // Scroll to trigger lazy-loaded posts
    for (let i = 0; i < 5; i++) {
      await this.page.evaluate(() => window.scrollBy(0, 1000));
      await this.page.waitForTimeout(1000);
    }

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
        for (let i = 0; i < 8; i++) {
          el = el.parentElement;
          if (!el) break;
          const t = el.innerText?.trim();
          if (t && t.length > 20) break;
        }

        const fullText = el?.innerText || '';
        const text = fullText.slice(0, 600);

        // Blue dot = unread indicator
        const hasUnreadDot = !!(
          el?.querySelector('[class*="unread"], [class*="dot"], [class*="badge"], [class*="indicator"]') ||
          el?.querySelector('circle, [style*="background: rgb(59"], [style*="background:#"], [style*="background: #"]')
        );

        // "New comment" badge on the card
        const hasNewComment = fullText.toLowerCase().includes('new comment');

        // Check if Ahmed Dino already commented
        const dinoAlreadyCommented = fullText.includes('Ahmed Dino');

        // Latest reply text
        const commentEls = el?.querySelectorAll('[class*="comment"], [class*="reply"]');
        const latestReply = commentEls?.length
          ? commentEls[commentEls.length - 1]?.innerText?.trim()
          : '';

        // Author
        const authorLink = el?.querySelector('a[href*="/u/"], a[href*="/@"]');
        const authorProfile = authorLink
          ? `https://www.skool.com${authorLink.getAttribute('href')}`
          : null;
        const authorName = authorLink?.innerText?.trim() || '';

        results.push({
          id: postId,
          url: `https://www.skool.com${href}`,
          body: text,
          author: authorName,
          authorProfile,
          dinoAlreadyCommented,
          latestReply,
          hasUnreadDot,
          hasNewComment,
        });
      });

      // Sort: unread dots and new comments first
      results.sort((a, b) => {
        const aScore = (a.hasUnreadDot ? 2 : 0) + (a.hasNewComment ? 1 : 0);
        const bScore = (b.hasUnreadDot ? 2 : 0) + (b.hasNewComment ? 1 : 0);
        return bScore - aScore;
      });

      return results.slice(0, 20);
    });

    console.log(`Found ${posts.length} posts. Unread: ${posts.filter(p => p.hasUnreadDot).length}, New comments: ${posts.filter(p => p.hasNewComment).length}`);

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

    // Skool DMs are a chat panel widget — navigate to community first
    await this.page.goto(`${BASE_URL}/${COMMUNITY_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(4000);

    // Click the chat/DM icon in the top nav to open the panel
    const chatIconSelectors = [
      '[aria-label*="chat" i]',
      '[aria-label*="message" i]',
      '[aria-label*="inbox" i]',
      '[data-testid*="chat"]',
      'a[href*="chat"]',
      'button[class*="chat"]',
    ];

    for (const sel of chatIconSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        console.log(`Clicking chat icon: ${sel}`);
        await el.click();
        await this.page.waitForTimeout(2000);
        break;
      }
    }

    // Log all links visible after opening panel for debugging
    const allLinks = await this.page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(Boolean)
    );
    const chatLinks = allLinks.filter(h => h.includes('chat') || h.includes('inbox') || h.includes('message') || h.includes('dm'));
    console.log('Chat-related links found:', JSON.stringify(chatLinks.slice(0, 20)));

    // Find unread threads — look for links near unread indicators (blue dot or "(1)" count)
    const threads = await this.page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Find all list items or containers that have an unread badge
      const allLinks = document.querySelectorAll('a[href]');
      allLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        // Only pick up links that look like individual chat/user threads
        const isChatLink = href.includes('/chat/') || href.includes('/inbox/') || href.includes('/message/') || href.includes('/dm/');
        // Also check: link text contains a number in parentheses like "(1)" = unread
        const linkText = link.innerText || '';
        const hasUnreadCount = /\(\d+\)/.test(linkText);
        // Check for blue dot near this link
        const container = link.closest('li, [class*="thread"], [class*="conversation"], [class*="chat-item"]');
        const hasBlueDot = !!(container?.querySelector('[class*="unread"], [class*="dot"], [class*="badge"]'));

        if (!isChatLink && !hasUnreadCount && !hasBlueDot) return;
        if (seen.has(href)) return;
        seen.add(href);

        const threadId = href.split('/').filter(Boolean).pop();
        // Extract sender name — look for name text near the link
        const nameEl = container?.querySelector('[class*="name"], strong, b, h3, h4') || link;
        const sender = nameEl?.innerText?.trim().replace(/\(\d+\)/, '').trim() || '';

        results.push({
          id: threadId || href,
          url: href.startsWith('http') ? href : `https://www.skool.com${href}`,
          sender,
          hasUnread: hasUnreadCount || hasBlueDot,
        });
      });

      return results.filter(t => t.hasUnread).slice(0, 5);
    });

    console.log(`Found ${threads.length} unread DM threads.`);
    return threads;
  }

  async getLastDMInThread(threadUrl) {
    await this.page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(3000);

    // Wait for messages to load
    try {
      await this.page.waitForSelector('[class*="message"], [class*="chat"], [class*="bubble"]', { timeout: 8000 });
    } catch { /* continue anyway */ }

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

  async sendNewDM(profileUrl, message) {
    console.log(`Sending re-engagement DM via profile: ${profileUrl}`);
    await this.page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(2000);

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

    if (!msgBtn) {
      console.log('Could not find Message button on profile, skipping.');
      return false;
    }

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

    if (!inputBox) {
      console.log('Could not find DM compose box, skipping.');
      return false;
    }

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
