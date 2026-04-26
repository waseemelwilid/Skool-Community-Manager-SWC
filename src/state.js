import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(__dirname, '../state.json');

export function loadState() {
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  if (!state.memberActivity) state.memberActivity = {};
  return state;
}

export function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function hasReplied(state, id) {
  return state.repliedPosts.includes(id) || state.repliedDMs.includes(id);
}

export function markReplied(state, id, type = 'post') {
  const key = type === 'dm' ? 'repliedDMs' : 'repliedPosts';
  if (!state[key].includes(id)) {
    state[key].push(id);
  }
  if (state[key].length > 500) {
    state[key] = state[key].slice(-500);
  }
}

const DINO_NAMES = ['ahmed', 'dino'];

export function updateMemberSeen(state, memberName, profileUrl = null) {
  if (!memberName) return;
  if (DINO_NAMES.some(n => memberName.toLowerCase().includes(n))) return;
  if (!state.memberActivity[memberName]) {
    state.memberActivity[memberName] = { lastSeen: null, reengagementSent: null, profileUrl: null };
  }
  state.memberActivity[memberName].lastSeen = new Date().toISOString();
  if (profileUrl) state.memberActivity[memberName].profileUrl = profileUrl;
}

export function getInactiveMembers(state, inactiveDays = 7, cooldownDays = 30) {
  const now = Date.now();
  const inactiveMs = inactiveDays * 24 * 60 * 60 * 1000;
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  return Object.entries(state.memberActivity)
    .filter(([, data]) => {
      if (!data.lastSeen || !data.profileUrl) return false;
      if (now - new Date(data.lastSeen).getTime() < inactiveMs) return false;
      if (data.reengagementSent) {
        if (now - new Date(data.reengagementSent).getTime() < cooldownMs) return false;
      }
      return true;
    })
    .map(([name, data]) => ({ name, profileUrl: data.profileUrl }));
}

export function markReengagementSent(state, memberName) {
  if (!state.memberActivity[memberName]) state.memberActivity[memberName] = {};
  state.memberActivity[memberName].reengagementSent = new Date().toISOString();
}

// Track the last DM preview we replied to per sender.
// If the preview hasn't changed since we last replied, skip — we already answered this message.
export function dmAlreadyReplied(state, sender, lastMessage) {
  if (!state.dmLastReplied) return false;
  const record = state.dmLastReplied[sender];
  if (!record) return false;

  // Old format was a plain string — we can't know what our reply text was,
  // so skip conservatively. Next real member message will overwrite with new format.
  if (typeof record === 'string') return true;

  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 50);
  // Skip if preview matches member's message we already replied to
  if (norm(record.memberMsg) === norm(lastMessage)) return true;
  // Skip if preview matches our own reply (bot's message now showing as list preview)
  if (record.ourReply && norm(record.ourReply) === norm(lastMessage)) return true;
  return false;
}

export function markDMReplied(state, sender, memberMsg, ourReply) {
  if (!state.dmLastReplied) state.dmLastReplied = {};
  state.dmLastReplied[sender] = {
    memberMsg,
    ourReply: (ourReply || '').slice(0, 80),
  };
}
