import { SkoolBot } from './skool.js';
import { loadState } from './state.js';

const EMAIL = process.env.SKOOL_EMAIL;
const PASSWORD = process.env.SKOOL_PASSWORD;
const MESSAGE = process.env.BULK_MESSAGE;

if (!EMAIL || !PASSWORD) {
  console.error('Missing SKOOL_EMAIL or SKOOL_PASSWORD');
  process.exit(1);
}
if (!MESSAGE) {
  console.error('Missing BULK_MESSAGE env var');
  process.exit(1);
}

async function run() {
  const state = loadState();
  const members = Object.entries(state.memberActivity || {})
    .filter(([, data]) => data.profileUrl)
    .map(([name, data]) => ({ name, profileUrl: data.profileUrl }));

  console.log(`Sending bulk DM to ${members.length} members: "${MESSAGE}"`);

  const bot = new SkoolBot();
  try {
    await bot.init();
    await bot.login(EMAIL, PASSWORD);

    let sent = 0;
    for (const member of members) {
      console.log(`Sending to ${member.name}...`);
      try {
        const ok = await bot.sendNewDM(member.profileUrl, MESSAGE);
        if (ok) { sent++; console.log(`Sent to ${member.name}`); }
        else { console.log(`Failed to send to ${member.name}`); }
      } catch (err) {
        console.log(`Error sending to ${member.name}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 4000 + Math.random() * 3000));
    }

    console.log(`\nDone. Sent to ${sent}/${members.length} members.`);
  } finally {
    await bot.close();
  }
}

run();
