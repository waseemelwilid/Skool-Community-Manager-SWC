import { SkoolBot } from './skool.js';
import { generateReply } from './claude.js';
import { loadState, saveState, hasReplied, markReplied } from './state.js';

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

    for (const post of posts) {
      if (hasReplied(state, post.id)) {
        console.log(`Already replied to post ${post.id}, skipping.`);
        continue;
      }
      if (!post.body || post.body.length < 10) continue;

      console.log(`\nGenerating reply for post by ${post.author}:\n"${post.body.slice(0, 100)}..."`);
      const reply = await generateReply(post.body, 'post');
      console.log(`Reply: ${reply}`);

      await bot.replyToPost(post.url, reply);
      markReplied(state, post.id, 'post');
      postReplies++;

      // Pause between replies to avoid looking like a bot
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
    }

    // --- DMs ---
    const threads = await bot.getUnreadDMs(state.lastChecked);
    let dmReplies = 0;

    for (const thread of threads) {
      if (!thread.url) continue;
      if (hasReplied(state, thread.id)) {
        console.log(`Already replied to DM ${thread.id}, skipping.`);
        continue;
      }

      const lastMessage = await bot.getLastDMInThread(thread.url);
      if (!lastMessage || lastMessage.length < 5) continue;

      console.log(`\nGenerating DM reply for ${thread.sender}:\n"${lastMessage.slice(0, 100)}..."`);
      const reply = await generateReply(lastMessage, 'dm');
      console.log(`Reply: ${reply}`);

      await bot.replyToDM(thread.url, reply);
      markReplied(state, thread.id, 'dm');
      dmReplies++;

      await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
    }

    // Update last checked timestamp
    state.lastChecked = new Date().toISOString();
    saveState(state);

    console.log(`\nDone. Replied to ${postReplies} posts and ${dmReplies} DMs.`);

  } catch (err) {
    console.error('Error during run:', err);
    process.exit(1);
  } finally {
    await bot.close();
  }
}

run();
