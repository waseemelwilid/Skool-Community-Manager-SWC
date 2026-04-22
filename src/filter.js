const SKIP_PATTERNS = ['new leaderboard', 'new members start here'];

export function shouldReplyToPost(post) {
  const body = post.body || '';
  const bodyLower = body.toLowerCase();

  // Never reply to Dino's own posts — use profile URL slug, not name in body
  if (post.isDinoPost) return { reply: false, reason: 'own post' };

  // Skip announcements/links
  if (SKIP_PATTERNS.some(p => bodyLower.includes(p))) {
    return { reply: false, reason: 'skip pattern' };
  }

  // Skip posts older than 3 days — detect from body text ("9d •", "2w •", month names)
  const ageMatch = body.match(/\b(\d+)([dwm])\s*[•·]/);
  if (ageMatch) {
    const num = parseInt(ageMatch[1]);
    const unit = ageMatch[2];
    if (unit === 'w' || unit === 'm') return { reply: false, reason: 'too old' };
    if (unit === 'd' && num > 3) return { reply: false, reason: `too old (${num}d)` };
  }
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d/.test(body)) {
    return { reply: false, reason: 'too old (date)' };
  }

  // Skip very short posts
  if (body.length < 30) return { reply: false, reason: 'too short' };

  // If Dino already commented, only continue if latest reply has depth
  if (post.dinoAlreadyCommented) {
    const latest = post.latestReply || '';
    if (!latest || latest.length < 30) return { reply: false, reason: 'dead convo' };
    return { reply: true, reason: 'substantive follow-up' };
  }

  // Reply to any recent member post
  return { reply: true, reason: 'recent member post' };
}

export function shouldReplyToDM(lastMessage, lastSender) {
  if (!lastMessage || lastMessage.length < 5) return { reply: false, reason: 'empty' };
  const sender = (lastSender || '').toLowerCase();
  if (sender.includes('ahmed') || sender.includes('dino')) {
    return { reply: false, reason: 'dino sent last' };
  }
  if (lastMessage.length < 15) return { reply: false, reason: 'dead reply' };
  return { reply: true, reason: 'member message' };
}
