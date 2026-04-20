import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(__dirname, '../state.json');

export function loadState() {
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
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
  // Keep only last 500 to avoid state file bloating
  if (state[key].length > 500) {
    state[key] = state[key].slice(-500);
  }
}
