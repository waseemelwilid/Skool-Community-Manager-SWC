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
    // Forward browser console.log to Node output so page.evaluate() logs are visible
    this.page.on('console', msg => {
      if (msg.type() === 'log') console.log('[PAGE]', msg.text());
    });
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
      chatOpened = await this.page.evaluate(() => {
        const all = document.querySelectorAll('button, a');
        for (const el of all) {
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          const cls = (el.className || '').toLowerCase();
          const href = el.getAttribute('href') || '';
          if (label.includes('chat') || label.includes('message') || cls.includes('chat') || href.includes('chat')) {
            el.click(); return true;
          }
        }
        return false;
      });
      console.log(`Chat opened via evaluate fallback: ${chatOpened}`);
    }
    await this.page.waitForTimeout(3000);

    // Debug: dump what's visible on page after opening chat
    const debugInfo = await this.page.evaluate(() => {
      const hasSep = (t) => t.includes('\u00b7') || t.includes('\u2022') || t.includes(' \u00b7 ') || t.includes(' \u2022 ');
      const allDivs = Array.from(document.querySelectorAll('div'));
      const withSep = allDivs.filter(el => {
        const text = el.innerText?.trim() || '';
        return hasSep(text) && el.querySelector('img') && text.length < 300;
      });
      const panelTexts = allDivs
        .filter(el => ['Mark all as read', 'Chats', 'Messages', 'Direct'].some(t => el.innerText?.includes(t)) && el.innerText?.length < 500)
        .map(el => el.innerText?.trim().slice(0, 120));
      return {
        sepDivsCount: withSep.length,
        sepDivPreviews: withSep.slice(0, 5).map(el => ({ text: el.innerText?.trim().slice(0, 80), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) })),
        panelTexts: panelTexts.slice(0, 5),
      };
    });
    console.log('DM debug — sep divs:', debugInfo.sepDivsCount, '| panels:', JSON.stringify(debugInfo.panelTexts));
    console.log('DM debug — sep previews:', JSON.stringify(debugInfo.sepDivPreviews));

    const threads = await this.page.evaluate(() => {
      const hasSep = (t) => t.includes('\u00b7') || t.includes('\u2022');

      // Find chat panel by multiple text signatures
      const panelSignatures = [
        el => el.innerText?.includes('Mark all as read'),
        el => el.innerText?.includes('Chats') && el.innerText?.includes('Search'),
        el => el.innerText?.includes('Messages') && el.innerText?.includes('Search'),
        el => el.innerText?.includes('Direct Messages'),
      ];
      let chatPanel = null;
      for (const sig of panelSignatures) {
        chatPanel = Array.from(document.querySelectorAll('div')).find(el => {
          try { return sig(el) && el.innerText?.length < 3000; } catch { return false; }
        });
        if (chatPanel) { console.log('Panel found, text preview:', chatPanel.innerText?.slice(0, 80)); break; }
      }

      let items = [];
      if (chatPanel) {
        items = Array.from(chatPanel.querySelectorAll('div')).filter(el => {
          const rect = el.getBoundingClientRect();
          const text = el.innerText?.trim() || '';
          const hasImg = !!el.querySelector('img');
          return hasImg && rect.height > 30 && rect.height < 120 && rect.width > 100 && hasSep(text);
        });
        console.log('Items from panel:', items.length);
      }

      // Full-page fallback: avatar + separator + short text
      if (!items.length) {
        items = Array.from(document.querySelectorAll('div')).filter(el => {
          const rect = el.getBoundingClientRect();
          const text = el.innerText?.trim() || '';
          const hasImg = !!el.querySelector('img');
          return hasImg && rect.height > 30 && rect.height < 120 &&
                 rect.width > 100 && hasSep(text) && text.length < 300;
        });
        console.log('Items from page fallback:', items.length);
      }

      // Deduplicate: remove parent elements that contain another matching element (keep innermost)
      items = items.filter(el => !items.some(other => other !== el && el.contains(other)));
      items = items.slice(0, 10);
      console.log('Items after dedup:', items.length);
      return items.map((el, index) => {
        const text = el.innerText?.trim() || '';
        const lines = text.split('\n').filter(l => l.trim());
        // Line 0: "Name (3) · 2h" — strip badge and time to get sender
        const firstLine = lines[0] || '';
        const sender = firstLine
          .replace(/\s*\(\d+\)\s*/g, '')
          .replace(/[\u00b7\u2022].*/, '')
          .trim();
        // Lines 1+: message preview. "You: ..." means Dino sent last.
        // Skool prefixes preview lines with "• 16h " — strip that before extracting message.
        const rawPreview = lines.slice(1).join(' ').trim();
        const dinoSentLast = /^you[:\s]/i.test(rawPreview);
        const lastMessage = rawPreview
          .replace(/^you[:\s]+/i, '')
          .replace(/^[·•·•]\s*\d+[smhd]\s*/i, '')
          .trim();
        console.log(`DM ${index}: sender="${sender}" dinoSentLast=${dinoSentLast} msg="${lastMessage.slice(0, 60)}"`);
        return { index, sender, lastMessage, dinoSentLast, preview: text.slice(0, 100) };
      }).filter(t => t.sender && t.sender.length > 1 && !/^\d+$/.test(t.sender));
    });

    console.log(`DM threads found: ${threads.length}`, threads.map(t => t.sender).join(', '));
    return threads;
  }

  async openDMThread(index) {
    const clicked = await this.page.evaluate((idx) => {
      const hasSep = (t) => t.includes('\u00b7') || t.includes('\u2022');
      const panelSignatures = [
        el => el.innerText?.includes('Mark all as read'),
        el => el.innerText?.includes('Chats') && el.innerText?.includes('Search'),
        el => el.innerText?.includes('Messages') && el.innerText?.includes('Search'),
      ];
      let chatPanel = null;
      for (const sig of panelSignatures) {
        chatPanel = Array.from(document.querySelectorAll('div')).find(el => {
          try { return sig(el) && el.innerText?.length < 3000; } catch { return false; }
        });
        if (chatPanel) break;
      }
      let items = [];
      if (chatPanel) {
        items = Array.from(chatPanel.querySelectorAll('div')).filter(el => {
          const rect = el.getBoundingClientRect();
          const text = el.innerText?.trim() || '';
          return !!el.querySelector('img') && rect.height > 30 && rect.height < 120 &&
                 rect.width > 100 && hasSep(text);
        });
      }
      if (!items.length) {
        items = Array.from(document.querySelectorAll('div')).filter(el => {
          const rect = el.getBoundingClientRect();
          const text = el.innerText?.trim() || '';
          return !!el.querySelector('img') && rect.height > 30 && rect.height < 120 &&
                 rect.width > 100 && hasSep(text) && text.length < 300;
        });
      }
      // Keep only innermost matching elements (no parent-child duplicates)
      items = items.filter(el => !items.some(other => other !== el && el.contains(other)));
      if (items[idx]) { items[idx].click(); return true; }
      return false;
    }, index);

    await this.page.waitForTimeout(2500);
    return clicked;
  }

  async getLastMessageInOpenChat() {
    await this.page.waitForTimeout(1500);
    return await this.page.evaluate(() => {
      // Strategy: find the DM reply input first, then find the message thread above it.
      // This avoids accidentally reading the DM list panel instead of the open thread.
      const inputEl = Array.from(document.querySelectorAll('[contenteditable="true"], textarea'))
        .find(el => {
          const rect = el.getBoundingClientRect();
          // DM input is near the bottom of its panel — bottom 40% of viewport
          return rect.top > window.innerHeight * 0.4 && rect.width > 100;
        });

      let bubbles = [];

      if (inputEl) {
        // Walk up from the input to find the thread container (has multiple text children)
        let container = inputEl.parentElement;
        for (let i = 0; i < 8; i++) {
          if (!container) break;
          const textEls = Array.from(container.querySelectorAll('p, span'))
            .filter(el => (el.innerText?.trim().length || 0) > 5 && el.querySelectorAll('p,span').length < 3);
          if (textEls.length >= 2) { bubbles = textEls; console.log('Bubbles via inputEl container, depth:', i, 'count:', bubbles.length); break; }
          container = container.parentElement;
        }
      }

      // Fallback: class-name-based
      if (!bubbles.length) {
        const classSelectors = [
          '[class*="MessageBody"]', '[class*="message-body"]',
          '[class*="MessageText"]', '[class*="message-text"]',
          '[class*="BubbleText"]', '[class*="bubble-text"]',
          '[class*="ChatText"]', '[class*="chat-text"]',
        ];
        for (const sel of classSelectors) {
          const els = Array.from(document.querySelectorAll(sel))
            .filter(e => (e.innerText?.trim().length || 0) > 2);
          if (els.length) { bubbles = els; console.log('Bubbles via class:', sel, els.length); break; }
        }
      }

      if (!bubbles.length) { console.log('No message bubbles found'); return { text: '', dinoSentLast: false }; }

      const last = bubbles[bubbles.length - 1];
      const text = last.innerText?.trim() || '';

      // Detect outgoing: class-based, computed style, or position (right-aligned bubble)
      let el = last;
      let dinoSentLast = false;
      for (let i = 0; i < 8; i++) {
        el = el.parentElement;
        if (!el) break;
        const cls = (el.className || '').toLowerCase();
        if (/\b(sent|outgoing|self|right|me|owner|local)\b/.test(cls)) { dinoSentLast = true; break; }
        const style = window.getComputedStyle(el);
        if (style.alignSelf === 'flex-end' || style.marginLeft === 'auto') { dinoSentLast = true; break; }
        const rect = el.getBoundingClientRect();
        const parentRect = el.parentElement?.getBoundingClientRect();
        if (parentRect && parentRect.width > 200 && rect.left > parentRect.left + parentRect.width * 0.4) {
          dinoSentLast = true; break;
        }
      }

      console.log('Last msg text:', text.slice(0, 60), '| dinoSentLast:', dinoSentLast);
      return { text, dinoSentLast };
    });
  }

  async replyToOpenChat(reply) {
    // Wait briefly for thread to settle, then find the DM input.
    // Must use .last() — the feed compose box may also be contenteditable and appears first in DOM.
    // The DM reply input is lower in the DOM (rendered inside the chat panel).
    await this.page.waitForTimeout(500);

    // Wait up to 5s for a contenteditable to appear in the bottom half of the viewport
    let editor = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const handle = await this.page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('[contenteditable="true"], textarea'))
          .reverse() // last in DOM = DM input
          .find(el => {
            const rect = el.getBoundingClientRect();
            return rect.top > window.innerHeight * 0.3 && rect.width > 50;
          }) || null;
      });
      if (handle && await handle.evaluate(el => !!el)) {
        editor = this.page.locator('[contenteditable="true"], textarea').last();
        break;
      }
      await this.page.waitForTimeout(1000);
    }

    if (!editor || await editor.count() === 0) {
      console.log('No DM input found, skipping.');
      return false;
    }

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
