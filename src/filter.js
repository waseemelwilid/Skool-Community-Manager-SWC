const QUESTION_WORDS = ['?', 'how', 'why', 'what', 'when', 'anyone', 'help', 'advice', 'thoughts', 'should i', 'do i', 'can i'];
const STRUGGLE_WORDS = ['struggling', 'stuck', 'can\'t', 'can not', 'failing', 'failed', 'hard', 'difficult', 'lost', 'confused', 'anxiety', 'scared', 'afraid', 'overthinking', 'stressed', 'burnt out', 'burnout', 'feel like', 'feeling', 'honest', 'real talk', 'keep', 'always', 'never'];
const WIN_WORDS = ['finally', 'did it', 'proud', 'achieved', 'managed', 'breakthrough', 'progress', 'growth', 'worked', 'won', 'succeeded'];
const SKIP_WORDS = ['check out', 'link', 'http', 'announcement', 'reminder', 'just sharing', 'fyi'];
const MAX_POST_AGE_HOURS = 48;

export function shouldReplyToPost(post, dinoName = 'Ahmed Dino') {
  const body = (post.body || '').toLowerCase();
  const author = (post.author || '').toLowerCase();

  // Never reply to Dino's own posts
  if (author.includes('ahmed') || author.includes('dino')) return { reply: false, reason: 'own post' };

  // Skip if post is too old
  if (post.postTime) {
    const postDate = new Date(post.postTime);
    if (!isNaN(postDate)) {
      const hoursAgo = (Date.now() - postDate.getTime()) / (1000 * 60 * 60);
      if (hoursAgo > MAX_POST_AGE_HOURS) return { reply: false, reason: `too old (${Math.round(hoursAgo)}h)` };
    }
  }

  // Skip announcements/link shares
  if (SKIP_WORDS.some(w => body.includes(w))) return { reply: false, reason: 'announcement/link' };

  // Skip very short posts (likely just an image or emoji)
  if (body.length < 20) return { reply: false, reason: 'too short' };

  // Reply to questions
  if (QUESTION_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'question' };

  // Reply to struggles
  if (STRUGGLE_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'struggle' };

  // Reply to wins
  if (WIN_WORDS.some(w => body.includes(w))) return { reply: true, reason: 'win' };

  // Reply to longer thoughtful posts (likely a real share)
  if (body.length > 150) return { reply: true, reason: 'substantive post' };

  return { reply: false, reason: 'not engaging enough' };
}

export function shouldReplyToDM(lastMessage, lastSender, dinoName = 'Ahmed Dino') {
  if (!lastMessage || lastMessage.length < 5) return { reply: false, reason: 'empty message' };

  // Don't reply if Dino sent the last message
  const sender = (lastSender || '').toLowerCase();
  if (sender.includes('ahmed') || sender.includes('dino')) return { reply: false, reason: 'dino sent last' };

  // Don't reply to very old threads (handled by state)
  return { reply: true, reason: 'unread from member' };
}
