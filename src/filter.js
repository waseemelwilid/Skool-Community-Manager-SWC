const SKIP_PATTERNS = ['new leaderboard', 'new members start here', 'new-leaderboard', 'new-members-start'];

export function shouldReplyToPost(post) {
  const body = post.body || '';
  const bodyLower = body.toLowerCase();

  // Never reply to Dino's own posts — use profile URL slug, not name in body
  if (post.isDinoPost) return { reply: false, reason: 'own post' };

  // Skip announcements/links
  if (SKIP_PATTERNS.some(p => bodyLower.includes(p))) {
    return { reply: false, reason: 'skip pattern' };
  }

  // Skool time format: 29m=minutes, 2h=hours, 1d=days, 2w=weeks
  // Skip if older than 48 hours
  const ageMatch = body.match(/\b(\d+)([mhd])\s*[•·]/);
  if (ageMatch) {
    const num = parseInt(ageMatch[1]);
    const unit = ageMatch[2];
    if (unit === 'm') {} // minutes — always reply
    else if (unit === 'h') {} // hours — always reply
    else if (unit === 'd' && num > 2) return { reply: false, reason: `too old (${num}d)` };
  }
  // Skip weeks/months shown as "2w •" or a calendar date
  if (/\b\d+w\s*[•·]/.test(body)) return { reply: false, reason: 'too old (weeks)' };
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d/.test(body)) {
    return { reply: false, reason: 'too old (date)' };
  }

  // Skip very short posts
  if (body.length < 30) return { reply: false, reason: 'too short' };

  // Skip if Dino already commented
  if (post.dinoAlreadyCommented) return { reply: false, reason: 'dino already commented' };

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
