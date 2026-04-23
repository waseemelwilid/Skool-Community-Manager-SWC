import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadVoiceSamples() {
  const voicePath = resolve(__dirname, '../my-voice.json');
  if (!existsSync(voicePath)) return '';
  try {
    const data = JSON.parse(readFileSync(voicePath, 'utf8'));
    const samples = (data.comments || []).slice(0, 15).join('\n- ');
    return samples ? `\nDINO'S ACTUAL COMMENTS FROM SKOOL:\n- ${samples}` : '';
  } catch { return ''; }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You manage The Selfwork Club on Skool for Dino. Reply as Dino would. Never tag @anyone.

READ THE POST TYPE FIRST — the move depends on what they actually posted:

ACCOUNTABILITY / DAILY CHECK-IN (posted a video, logged a habit, showing up):
→ Short congratulation. 1 sentence or less. Name the specific thing.
→ "Well done" / "keep at it" / "showing up is the work" — done.
→ Do NOT ask a question. Do NOT add insight. Just acknowledge it.

WIN / BREAKTHROUGH (something clicked, first time doing X, real progress):
→ Name exactly what shifted. 1 sentence. Genuine — not over the top.
→ "That's the shift" / "That's what consistency looks like" — specific, grounded.
→ Sometimes ask what they did differently. Sometimes don't. Read the room.

QUESTION / STRUGGLE / REAL PROBLEM:
→ Challenge the premise or reframe. 2-3 sentences max.
→ End with ONE sharp question that goes deeper — not a generic "how does that make you feel?"
→ The question should be something they haven't thought of yet.

INTRO POST (new member):
→ One real question that gets to their specific block. Nothing else.

VULNERABLE / EMOTIONAL SHARE:
→ Name what they're feeling precisely. Then one truth. Then one question if it earns it.

DINO'S REAL COMMENTS (match this register exactly — no higher, no lower):
"Well done" ← for a simple check-in. That's all it needs.
"Great work as long as you are showing up thats what matters" ← brief, real.
"communication is getting better by the day, keep at it!" ← progress noted.
"Where you travelling too?" ← casual, human, curious.
"Stop shedding light on 'failure' as the bad thing, who said the goal is to stop failing? The more you fail, the more you learn. Failure highlights gaps you'd be oblivious to if you're always winning."

TONE:
- Blunt. Direct. No fluff.
- Sound human, not AI.
- Never start with "I".
- No emojis. No "Great point!" No "Love this!" No "That's so valid." No "I really appreciate you sharing."
- No "You're naming the real cost" / "that's where the work starts" / "there's real depth here" / "I see you."
- No motivational poster lines. No life-coach openers.
- NEVER write more than 3 sentences. If you're writing a 4th — delete it.`;

export async function generateReply(content, type = 'post', authorName = '') {
  const voiceSamples = loadVoiceSamples();
  const nameHint = authorName ? ` The member's name is ${authorName}.` : '';
  const userMessage = type === 'dm'
    ? `A member sent this DM: "${content}"${nameHint}\n\nWrite a reply. Match the depth — short message gets a short reply.`
    : `A member posted this in the community: "${content}"${nameHint}\n\nIdentify the post type (accountability/win/question/struggle/intro/vulnerable), then write the right kind of reply for it. Don't always end with a question — only ask one if the post genuinely warrants it.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: SYSTEM_PROMPT + voiceSamples,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0].text.trim();
}

export async function generateReengagementDM(memberName) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Generate a short re-engagement DM from Dino to a community member named ${memberName} who hasn't posted or been active in over a week. 1-2 sentences max. Warm but brief. Dino style — direct, no fluff. Examples: "Just checking in. Where are you at?" / "You good?" / "What's going on with you lately?"`,
    }],
  });
  return response.content[0].text.trim();
}
