const QUESTION_WORDS = ['?', 'how', 'why', 'what', 'when', 'anyone', 'help', 'advice', 'thoughts', 'should i', 'do i', 'can i'];
const STRUGGLE_WORDS = ['struggling', 'stuck', "can't", 'failing', 'failed', 'hard', 'difficult', 'lost', 'confused', 'anxiety', 'scared', 'afraid', 'overthinking', 'stressed', 'burnt out', 'burnout', 'feel like', 'feeling', 'honest', 'real talk', 'keep', 'always', 'never'];
const WIN_WORDS = ['finally', 'did it', 'proud', 'achieved', 'managed', 'breakthrough', 'progress', 'growth', 'worked', 'won', 'succeeded'];
const SKIP_WORDS = ['check out', 'link', 'http', 'announcement', 'reminder', 'just sharing', 'fyi'];
const MAX_POST_AGE_HOURS = 48;

// Dead reply = short factual answer with no depth, no question, no emotion
// e.g. "Coventry for my university block." or "Yeah" or "Thanks!"
function isDeadReply(text) {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 40) return true; // too short to build on
  if (t.split(' ').length < 6) return true; // fewer than 6 words
  const hasDepth = STRUGGLE_WORDS.some(w => t.toLowerCase().includes(w))
    || QUESTION_WORDS.some(w => t.toLowerCase().includes(w))
    || WIN_WORDS.some(w => t.toLowerCase().includes(w))
    || t.length > 100;
  return !hasDepth;
}

export function shouldReplyToPost(post) {
  const body = (post.body || '').toLowerCase();
  const author = (post.author || '').toLowerCase();

  // Never reply to Dino's own posts
  if (author.includes('ahmed') || author.includes('dino')) {
    return { reply: false, reason: 'own post' };
  }

  // Skip if post is too old
  if (post.postTime) {
    const postDate = new Date(post.postTime);
    if (!isNaN(postDate)) {
      const hoursAgo = (Date.now() - postDate.getTime()) / (1000 * 60 * 60);
      if (hoursAgo > MAX_POST_AGE_HOURS) {
        return { reply: false, reason: `too old (${Math.round(hoursAgo)}h)` };
      }
    }
  }

  // Skip announcements/link shares
  if (SKIP_WORDS.some(w => body.includes(w))) {
    return { reply: false, reason: 'announcement/link' };
  }

  // Skip very short posts
  if (body.length < 20) return { reply: false, reason: 'too short' };

  // If Dino already commented, only continue if the latest reply is substantive
  if (post.dinoAlreadyCommented) {
    if (!post.latestReply || isDeadReply(post.latestReply)) {
      return { reply: false, reason: 'dead convo after Dino comment' };
    }
    // Latest reply has depth — worth continuing
    return { reply: true, reason: 'substantive follow-up after Dino comment' };
  }

  // Fresh post Dino hasn't touched — prioritise unread dots and new comment flags
  if (post.hasUnreadDot || post.hasNewComment) {
    if (QUESTION_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'unread question' };
    if (STRUGGLE_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'unread struggle' };
    if (WIN_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'unread win' };
    if (body.length > 80) return { reply: true, reason: 'unread post' };
  }

  if (QUESTION_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'question' };
  if (STRUGGLE_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'struggle' };
  if (WIN_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'win' };
  if (body.length > 150) return { reply: true, reason: 'substantive post' };

  return { reply: false, reason: 'not engaging enough' };
}

export function shouldReplyToDM(lastMessage, lastSender) {
  if (!lastMessage || lastMessage.length < 5) return { reply: false, reason: 'empty message' };

  const sender = (lastSender || '').toLowerCase();
  if (sender.includes('ahmed') || sender.includes('dino')) {
    return { reply: false, reason: 'dino sent last' };
  }

  // Dead reply in DM — short factual answer, nowhere to go
  if (isDeadReply(lastMessage)) {
    return { reply: false, reason: 'dead conversation' };
  }

  return { reply: true, reason: 'unread from member' };
}
