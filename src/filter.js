// Known Dino-authored post URL slugs to always skip
const SKIP_SLUGS = ['new-leaderboard-challenge', 'new-members-start-here', 'about', 'classroom', 'calendar'];

export function shouldReplyToPost(post) {
  const url = post.url || '';

  // Skip nav/system pages
  if (SKIP_SLUGS.some(s => url.includes(s))) {
    return { reply: false, reason: 'nav/system post' };
  }

  return { reply: true, reason: 'member post' };
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
