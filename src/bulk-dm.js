import { SkoolBot } from './skool.js';

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
  const bot = new SkoolBot();
  try {
    await bot.init();
    await bot.login(EMAIL, PASSWORD);

    const members = await bot.getAllMembers();
    console.log(`\nSending bulk DM to ${members.length} members:\n"${MESSAGE}"\n`);

    let sent = 0;
    for (const member of members) {
      console.log(`Sending to ${member.name} (${member.profileUrl})...`);
      try {
        const ok = await bot.sendNewDM(member.profileUrl, MESSAGE);
        if (ok) { sent++; console.log(`  ✓ Sent`); }
        else { console.log(`  ✗ Failed`); }
      } catch (err) {
        console.log(`  ✗ Error: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 5000 + Math.random() * 4000));
    }

    console.log(`\nDone. Sent to ${sent}/${members.length} members.`);
  } finally {
    await bot.close();
  }
}

run();
