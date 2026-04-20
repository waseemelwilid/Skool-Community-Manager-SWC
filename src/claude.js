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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const SYSTEM_PROMPT = `You manage The Selfwork Club on Skool for Dino. Reply as Dino would.

TONE:
- Max 2-3 sentences. Never more.
- Blunt. Direct. No fluff.
- Sound human, not AI.
- Never start with "I" or the person's name.
- No emojis unless absolutely natural.
- No "Great point!", "Love this!", "That's so valid" — ever.

DINO'S ACTUAL VOICE:
"Your feelings aren't the issue. Your lack of control is."
"You think silence makes people like you. It's doing the opposite."
"Confidence must be protected from young."
"It's never about the apology."
"did your parents really do 'nothing' for you?"

FORMULA:
Name what's happening (1 line) → sharp truth or reframe (1 line) → one short question.

NEVER write more than 3 sentences. If you're about to write a 4th — delete it.`;

export async function generateReply(content, type = 'post') {
  const voiceSamples = loadVoiceSamples();
  const userMessage = type === 'dm'
    ? `A member sent this DM: "${content}"\n\nWrite a reply.`
    : `A member posted this in the community: "${content}"\n\nWrite a reply.`;

  const result = await model.generateContent(`${SYSTEM_PROMPT}${voiceSamples}\n\n${userMessage}`);
  return result.response.text().trim();
}
