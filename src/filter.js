// Skip posts with these patterns
const SKIP_PATTERNS = ['new leaderboard', 'new members start here', 'announcement', 'check out', 'http'];

export function shouldReplyToPost(post) {
  const body = post.body || '';
  const bodyLower = body.toLowerCase();

  // Never reply to Dino's own posts
  // Author field is unreliable (extracts like-count "6") — check body text instead
  const author = (post.author || '').toLowerCase();
  if (author.includes('ahmed') || author.includes('dino')) {
    return { reply: false, reason: 'own post (author field)' };
  }
  // Also check if "Ahmed Dino" appears as the post author in the body (first 120 chars)
  if (body.slice(0, 120).includes('Ahmed Dino')) {
    return { reply: false, reason: 'own post (body check)' };
  }

  // Skip announcements
  if (SKIP_PATTERNS.some(p => bodyLower.includes(p))) {
    return { reply: false, reason: 'announcement/skip pattern' };
  }

  // Skip posts older than 2 days — detect from body text ("9d •", "2w •", "Feb ", "Jan " etc.)
  const ageMatch = body.match(/\b(\d+)([dwm])\s*[•·]/);
  if (ageMatch) {
    const num = parseInt(ageMatch[1]);
    const unit = ageMatch[2];
    if (unit === 'w' || unit === 'm') return { reply: false, reason: 'too old (weeks/months)' };
    if (unit === 'd' && num > 2) return { reply: false, reason: `too old (${num}d)` };
  }
  // Skip if body contains month names (old post shown as date)
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d/.test(body)) {
    return { reply: false, reason: 'too old (date shown)' };
  }

  // Skip very short posts
  if (body.length < 30) return { reply: false, reason: 'too short' };

  // Already replied — continue if latest reply has depth
  if (post.dinoAlreadyCommented) {
    const latest = post.latestReply || '';
    if (!latest || latest.length < 30) return { reply: false, reason: 'dead convo' };
    return { reply: true, reason: 'follow-up' };
  }

  // Reply to anything recent — the bot's job is to engage
  return { reply: true, reason: 'recent post' };
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
