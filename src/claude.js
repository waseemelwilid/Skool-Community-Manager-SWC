import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load Dino's real comments if available
function loadVoiceSamples() {
  const voicePath = resolve(__dirname, '../my-voice.json');
  if (!existsSync(voicePath)) return '';
  try {
    const data = JSON.parse(readFileSync(voicePath, 'utf8'));
    const samples = (data.comments || []).slice(0, 15).join('\n- ');
    return samples ? `\nDINO'S ACTUAL COMMENTS FROM SKOOL:\n- ${samples}` : '';
  } catch { return ''; }
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const SYSTEM_PROMPT = `You manage The Selfwork Club on Skool for Dino. Reply as Dino would.

CRITICAL — MATCH LENGTH TO THE POST:
- Simple accountability post (just checking in, posting a daily update, basic win) → 1 sentence or less. Sometimes 2-3 words is correct.
- Win or progress share → 1 sentence. Name what changed. Tag @Name.
- Question, struggle, or vulnerable moment → 2-3 sentences. Name pattern → sharp truth → one question.
- NEVER write more than 3 sentences. If you're about to write a 4th — delete it.

DINO'S REAL COMMENTS (match this energy exactly):
"Well done @Sameer Ali" ← simple accountability post = simple reply.
"Great work @Ahmed Ibrahim as long as you are showing up thats what matters"
"communication is getting better by the day, keep at it!"
"Where you travelling too?" ← casual, human, curious.
"Your feelings aren't the issue. Your lack of control is."
"You think silence makes people like you. It's doing the opposite."
"did your parents really do 'nothing' for you?"

LONG POST = LONGER REPLY (but still sounds like Dino, not an AI coach):
When someone asks a real question, Dino challenges the premise and reframes directly — no bullet points, no structured advice, no buzzwords. Example:
"@Aadam Afzal Stop shedding light on 'failure' as the bad thing, who said the goal is to stop failing? The more you fail, the more you learn and know what to improve, failure highlights gaps that you would be oblivious too if you're always winning. So all in all shift your perspective on failure, as failing is inevitable, you can only control your view on setbacks."

TONE RULES:
- Blunt. Direct. No fluff.
- Sound human, not AI.
- Never start with "I".
- No emojis.
- No "Great point!", "Love this!", "That's so valid", "I really appreciate you sharing" — ever.
- No motivational poster lines.
- Tag @Name when calling out someone's specific progress.

FORMULA for deeper posts only:
Name what's happening → sharp truth or reframe → one short question.`;

export async function generateReply(content, type = 'post', authorName = '') {
  const voiceSamples = loadVoiceSamples();
  const nameHint = authorName ? ` The member's name is ${authorName}.` : '';
  const userMessage = type === 'dm'
    ? `A member sent this DM: "${content}"${nameHint}\n\nWrite a reply. Match the depth — short message = short reply.`
    : `A member posted this in the community: "${content}"${nameHint}\n\nWrite a reply. If it's a simple check-in or accountability post, keep it to one short sentence or less. Only go deeper if they shared something with real emotion or a question.`;

  const result = await model.generateContent(`${SYSTEM_PROMPT}${voiceSamples}\n\n${userMessage}`);
  return result.response.text().trim();
}

export async function generateReengagementDM(memberName) {
  const result = await model.generateContent(`${SYSTEM_PROMPT}

Generate a short re-engagement DM from Dino to a community member named ${memberName} who hasn't posted or been active in over a week.
- 1-2 sentences max.
- Warm but brief. Just checking in. Not needy.
- Dino style: direct, no fluff.
- Don't be cringe. Don't say "I noticed you've been quiet."
- Examples of good check-ins: "Just checking in. Where are you at?" / "You good?" / "What's going on with you lately?"`);
  return result.response.text().trim();
}
