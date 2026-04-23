// Known Dino-authored post URL slugs to always skip
const SKIP_SLUGS = ['new-leaderboard-challenge', 'new-members-start-here', 'about', 'classroom', 'calendar'];

export function shouldReplyToPost(post) {
  const body = post.body || '';
  const url = post.url || '';

  // Skip known Dino post URLs by slug
  if (SKIP_SLUGS.some(s => url.includes(s))) {
    return { reply: false, reason: 'known dino post' };
  }

  // Skip if older than 48h — Skool format: 29m=minutes, 2h=hours, 1d=days, 2w=weeks
  const ageMatch = body.match(/\b(\d+)([mhd])\s*[•·]/);
  if (ageMatch) {
    const num = parseInt(ageMatch[1]);
    const unit = ageMatch[2];
    if (unit === 'd' && num > 2) return { reply: false, reason: `too old (${num}d)` };
  }
  if (/\b\d+w\s*[•·]/.test(body)) return { reply: false, reason: 'too old (weeks)' };
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d/.test(body)) {
    return { reply: false, reason: 'too old (date)' };
  }

  // Skip very short posts
  if (body.length < 30) return { reply: false, reason: 'too short' };

  return { reply: true, reason: 'recent member post' };
}

export function shouldReplyToDM(lastMessage, dinoSentLast) {
  if (!lastMessage || lastMessage.length < 5) return { reply: false, reason: 'empty' };
  if (dinoSentLast) return { reply: false, reason: 'dino sent last' };
  if (lastMessage.length < 15) return { reply: false, reason: 'dead reply' };
  // Skip pure acknowledgments — nothing to add
  if (/^(nice|great|thanks?|thank you|got it|will do|sounds good|perfect|ok|okay|cool|sure|cheers|appreciate it|no worries|makes sense|noted|understood|alright|lol|haha|👍|🙏|😂)[.!,\s]*$/i.test(lastMessage.trim())) {
    return { reply: false, reason: 'dead acknowledgment' };
  }
  return { reply: true, reason: 'member message' };
}
