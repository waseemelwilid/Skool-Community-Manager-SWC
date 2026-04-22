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

      // Sort: freshest posts first (minutes < hours < days), then by hasNewComment as tiebreak
      const ageScore = text => {
        const m = text.match(/\b(\d+)([mhd])\s*[•·]/);
        if (!m) return 9999;
        const n = parseInt(m[1]);
        if (m[2] === 'm') return n;
        if (m[2] === 'h') return n * 60;
        return n * 1440;
      };
      results.sort((a, b) => ageScore(a.body) - ageScore(b.body));
      return results.slice(0, 20);
    }, COMMUNITY_SLUG);

    console.log(`Found ${posts.length} posts on feed.`);
    return posts;
  }

  async hasDinoCommented(postUrl) {
    await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(3000);

    return await this.page.evaluate(() => {
      const authorLinks = document.querySelectorAll('a[href^="/@"]');
      return Array.from(authorLinks).some(link => {
        const href = (link.getAttribute('href') || '').split('?')[0];
        return href === '/@dino';
      });
    });
  }

  async replyToPost(postUrl, reply, authorFirstName = '') {
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

    // @mention the author — type full name, then check for dropdown after
    if (authorFirstName) {
      await commentBox.type('@' + authorFirstName, { delay: 80 });
      await this.page.waitForTimeout(1800);

      const suggestionSelectors = [
        '[class*="mention"] li:first-child',
        '[class*="suggestion"]:first-child',
        '[class*="autocomplete"] [class*="item"]:first-child',
        '[class*="dropdown"] li:first-child',
        '[role="listbox"] [role="option"]:first-child',
        '[role="option"]:first-child',
      ];

      let picked = false;
      for (const sel of suggestionSelectors) {
        const el = this.page.locator(sel).first();
        if (await el.count() > 0) {
          await el.click();
          picked = true;
          console.log(`@mention selected via: ${sel}`);
          break;
        }
      }

      if (!picked) {
        // No dropdown — clear the @mention and write reply without it
        await commentBox.press('Escape');
        for (let i = 0; i < authorFirstName.length + 1; i++) await commentBox.press('Backspace');
        console.log('@mention failed, writing reply without mention');
      } else {
        await this.page.waitForTimeout(300);
        await commentBox.type(' ', { delay: 30 });
      }
    }

    // Type the reply text
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

  async getDMThreads() {
    console.log('Checking DMs...');
    await this.page.goto(`${BASE_URL}/${COMMUNITY_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(4000);

    // Click the chat icon in the top nav to open the DM panel
    const chatIconSelectors = [
      '[aria-label*="chat" i]',
      '[aria-label*="message" i]',
      '[aria-label*="direct" i]',
      'a[href*="chat"]',
      'button[class*="chat" i]',
      'svg[class*="chat" i]',
    ];
    let chatOpened = false;
    for (const sel of chatIconSelectors) {
      const el = this.page.locator(sel).first();
      if (await el.count() > 0) {
        await el.click();
        chatOpened = true;
        console.log(`Chat icon clicked via: ${sel}`);
        break;
      }
    }
    if (!chatOpened) {
      // Fallback: find the chat bubble icon by its position in the nav bar
      chatOpened = await this.page.evaluate(() => {
        const navIcons = document.querySelectorAll('nav a, header a, [class*="nav"] a, [class*="Nav"] a');
        for (const el of navIcons) {
          if (el.href?.includes('chat') || el.getAttribute('aria-label')?.toLowerCase().includes('chat')) {
            el.click(); return true;
          }
        }
        return false;
      });
      console.log(`Chat opened via fallback: ${chatOpened}`);
    }
    await this.page.waitForTimeout(3000);

    const threads = await this.page.evaluate(() => {
      // Find conversation list items — Skool chat is a React SPA, no anchor tags
      // Strategy: find repeated sibling elements that contain an avatar image + text
      const findItems = () => {
        // Try known role/class patterns first
        const byRole = document.querySelectorAll('[role="listitem"]');
        if (byRole.length > 1) return Array.from(byRole);

        const patterns = ['DirectMessage', 'Conversation', 'ChatRow', 'ThreadRow', 'InboxItem', 'MessageItem'];
        for (const p of patterns) {
          const found = document.querySelectorAll(`[class*="${p}"]`);
          if (found.length > 0) return Array.from(found);
        }

        // Fallback: divs that contain an avatar img and have short height (typical chat row)
        return Array.from(document.querySelectorAll('div')).filter(el => {
          const rect = el.getBoundingClientRect();
          const hasAvatar = !!(el.querySelector('img[class*="avatar" i], img[class*="Avatar"], [class*="avatar" i] img'));
          const text = el.innerText?.trim() || '';
          return hasAvatar && text.length > 2 && rect.height > 20 && rect.height < 110 && rect.width > 150;
        });
      };

      const items = findItems().slice(0, 15);
      console.log('DM items found:', items.length);

      const JUNK = ['write something', 'the selfwork club', 'last comment', 'new comment'];

      return items.map((el, index) => {
        const text = el.innerText?.trim() || '';
        const lines = text.split('\n').filter(l => l.trim());
        const sender = (lines[0] || '').trim();
        const hasUnread = !!(
          el.querySelector('[class*="nread"], [class*="badge" i], [class*="dot"]:not([class*="dotted"])')
        ) || /\(\d+\)/.test(text);
        return { index, sender, hasUnread, preview: text.slice(0, 80) };
      }).filter(t => {
        if (!t.sender) return false;
        if (/^\d+$/.test(t.sender)) return false; // pure number = badge count
        if (JUNK.some(j => t.sender.toLowerCase().includes(j))) return false;
        return true;
      });
    });

    console.log(`DM threads found: ${threads.length}`, threads.map(t => `${t.sender}(unread:${t.hasUnread})`).join(', '));
    return threads;
  }

  async openDMThread(index) {
    // Click the conversation at given index (chat panel already open)
    const clicked = await this.page.evaluate((idx) => {
      const findItems = () => {
        const byRole = document.querySelectorAll('[role="listitem"]');
        if (byRole.length > 1) return Array.from(byRole);
        const patterns = ['DirectMessage', 'Conversation', 'ChatRow', 'ThreadRow', 'InboxItem', 'MessageItem'];
        for (const p of patterns) {
          const found = document.querySelectorAll(`[class*="${p}"]`);
          if (found.length > 0) return Array.from(found);
        }
        return Array.from(document.querySelectorAll('div')).filter(el => {
          const rect = el.getBoundingClientRect();
          const hasAvatar = !!(el.querySelector('img[class*="avatar" i], img[class*="Avatar"], [class*="avatar" i] img'));
          const text = el.innerText?.trim() || '';
          return hasAvatar && text.length > 2 && rect.height > 20 && rect.height < 110 && rect.width > 150;
        });
      };
      const items = findItems();
      if (items[idx]) { items[idx].click(); return true; }
      return false;
    }, index);

    await this.page.waitForTimeout(2500);
    return clicked;
  }

  async getLastMessageInOpenChat() {
    return await this.page.evaluate(() => {
      // Find message bubbles — try specific selectors first
      const selectors = [
        '[class*="MessageBody"]', '[class*="message-body"]',
        '[class*="MessageText"]', '[class*="message-text"]',
        '[class*="BubbleText"]', '[class*="bubble-text"]',
        '[class*="ChatText"]', '[class*="chat-text"]',
      ];

      let bubbles = [];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel))
          .filter(e => (e.innerText?.trim().length || 0) > 2);
        if (els.length) { bubbles = els; break; }
      }

      if (!bubbles.length) return { text: '', dinoSentLast: false };

      const last = bubbles[bubbles.length - 1];
      const text = last.innerText?.trim() || '';

      // Detect if Dino sent the last message:
      // Skool styles outgoing messages differently — check ancestors for "sent", "outgoing", "right", "self" classes
      let el = last;
      let dinoSentLast = false;
      for (let i = 0; i < 6; i++) {
        el = el.parentElement;
        if (!el) break;
        const cls = (el.className || '').toLowerCase();
        if (/\b(sent|outgoing|self|right|me)\b/.test(cls)) { dinoSentLast = true; break; }
      }

      return { text, dinoSentLast };
    });
  }

  async replyToOpenChat(reply) {
    // Skool uses TipTap/ProseMirror — fill() doesn't work, must force-click then type
    const editor = this.page.locator('[contenteditable="true"][class*="ProseMirror"], [contenteditable="true"][class*="skool-editor"], [contenteditable="true"]').first();

    if (await editor.count() === 0) { console.log('No DM input found, skipping.'); return false; }

    await editor.click({ force: true });
    await this.page.waitForTimeout(500);
    await editor.type(reply, { delay: 30 });
    await this.page.waitForTimeout(500);
    await editor.press('Enter');
    await this.page.waitForTimeout(2000);
    console.log('DM reply sent.');
    return true;
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
