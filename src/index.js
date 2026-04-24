import { SkoolBot } from './skool.js';
import { generateReply, generateReengagementDM } from './claude.js';
import { loadState, saveState, hasReplied, markReplied, updateMemberSeen, getInactiveMembers, markReengagementSent, dmAlreadyReplied, markDMReplied } from './state.js';
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

    for (const post of posts.slice(0, 20)) { // max 20 per run
      if (hasReplied(state, post.id)) {
        console.log(`Already replied to post ${post.id}, skipping.`);
        continue;
      }

      const { reply, reason } = shouldReplyToPost(post);
      console.log(`Post ${post.id} | age:${(post.body||'').match(/\b\d+[dwm]\s*[•·]/)?.[0]||'?'} | ${reply ? 'CHECK' : 'SKIP'} — ${reason}`);
      if (!reply) continue;

      const dinoCommented = await bot.hasDinoCommented(post.url);
      if (dinoCommented) {
        console.log(`Post ${post.id} — Dino already commented, skipping.`);
        continue;
      }

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
        const firstName = (post.author || '').split(' ')[0];
        await bot.replyToPost(post.url, response, firstName);
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
    const threads = await bot.getDMThreads();
    let dmReplies = 0;

    for (const thread of threads.slice(0, 5)) {
      // Skip if we already replied to this exact message in a previous run
      if (dmAlreadyReplied(state, thread.sender, thread.lastMessage)) {
        console.log(`Skipping DM from ${thread.sender}: already replied to this message`);
        continue;
      }

      // Filter using preview text extracted directly from DM list — no need to open thread just to read
      const { reply, reason } = shouldReplyToDM(thread.lastMessage, thread.dinoSentLast);

      if (!reply) {
        console.log(`Skipping DM from ${thread.sender}: ${reason}`);
        continue;
      }

      console.log(`\nReplying to DM from ${thread.sender}:\n"${(thread.lastMessage || '').slice(0, 100)}"`);
      let response;
      try {
        response = await generateReply(thread.lastMessage, 'dm');
        response = response.replace(/^["'""''`]+|["'""''`]+$/g, '').trim();
        console.log(`Reply: ${response}`);
      } catch (err) {
        console.log(`Claude API error for DM: ${err.message}`);
        continue;
      }

      await bot.openDMThread(thread.index);
      const sent = await bot.replyToOpenChat(response);
      if (sent) {
        markDMReplied(state, thread.sender, thread.lastMessage);
        dmReplies++;
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
      }
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
