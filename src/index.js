import { SkoolBot } from './skool.js';
import { generateReply, generateReengagementDM } from './claude.js';
import { loadState, saveState, hasReplied, markReplied, updateMemberSeen, getInactiveMembers, markReengagementSent } from './state.js';
import { shouldReplyToPost, shouldReplyToDM } from './filter.js';

const EMAIL = process.env.SKOOL_EMAIL;
const PASSWORD = process.env.SKOOL_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Missing SKOOL_EMAIL or SKOOL_PASSWORD environment variables.');
  process.exit(1);
}

async function run() {
  const state = loadState();
  const bot = new SkoolBot();

  try {
    await bot.init();
    await bot.login(EMAIL, PASSWORD);

    // --- COMMUNITY POSTS ---
    const posts = await bot.getNewPosts(state.lastChecked);
    let postReplies = 0;

    for (const post of posts.slice(0, 3)) { // max 3 per run
      if (hasReplied(state, post.id)) {
        console.log(`Already replied to post ${post.id}, skipping.`);
        continue;
      }

      const { reply, reason } = shouldReplyToPost(post);
      console.log(`Post ${post.id} | dino:${post.isDinoPost} | age:${(post.body||'').match(/\b\d+[dwm]\s*[•·]/)?.[0]||'?'} | ${reply ? 'REPLY' : 'SKIP'} — ${reason}`);
      if (!reply) continue;

      console.log(`\nReplying to post (${reason}) by ${post.author}:\n"${post.body.slice(0, 100)}"`);
      let response;
      try {
        response = await generateReply(post.body, 'post', post.author);
        console.log(`Generated reply: ${response}`);
      } catch (err) {
        console.log(`Claude API error: ${err.message}`);
        continue;
      }
      try {
        await bot.replyToPost(post.url, response);
        markReplied(state, post.id, 'post');
        postReplies++;
      } catch (err) {
        console.log(`Failed to post reply: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 8000 + Math.random() * 4000));
    }

    // Track member activity from all posts (seen = active)
    for (const post of posts) {
      if (post.author) updateMemberSeen(state, post.author, post.authorProfile);
    }

    // --- DMs ---
    const threads = await bot.getUnreadDMs();
    let dmReplies = 0;

    for (const thread of threads) {
      if (!thread.url) continue;
      if (hasReplied(state, thread.id)) {
        console.log(`Already replied to DM ${thread.id}, skipping.`);
        continue;
      }

      const lastMessage = await bot.getLastDMInThread(thread.url);
      const { reply, reason } = shouldReplyToDM(lastMessage, thread.sender);

      if (!reply) {
        console.log(`Skipping DM ${thread.id}: ${reason}`);
        continue;
      }

      console.log(`\nReplying to DM (${reason}) from ${thread.sender}:\n"${lastMessage.slice(0, 100)}..."`);
      const response = await generateReply(lastMessage, 'dm');
      console.log(`Reply: ${response}`);

      await bot.replyToDM(thread.url, response);
      markReplied(state, thread.id, 'dm');
      dmReplies++;

      await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
    }

    // --- RE-ENGAGEMENT DMs ---
    const inactiveMembers = getInactiveMembers(state);
    let reengagementCount = 0;

    for (const member of inactiveMembers.slice(0, 3)) { // max 3 per run
      console.log(`\nSending re-engagement DM to ${member.name} (inactive 7+ days)`);
      try {
        const msg = await generateReengagementDM(member.name);
        console.log(`Re-engagement message: ${msg}`);
        const sent = await bot.sendNewDM(member.profileUrl, msg);
        if (sent) {
          markReengagementSent(state, member.name);
          reengagementCount++;
          await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000));
        }
      } catch (err) {
        console.log(`Re-engagement DM failed for ${member.name}: ${err.message}`);
      }
    }

    state.lastChecked = new Date().toISOString();
    saveState(state);

    console.log(`\nDone. Replied to ${postReplies} posts, ${dmReplies} DMs, sent ${reengagementCount} re-engagement DMs.`);

  } catch (err) {
    console.error('Error during run:', err);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

run();
