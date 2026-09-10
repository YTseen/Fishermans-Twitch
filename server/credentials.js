import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'credentials.json');

const KEYS = ['twitchClientId', 'twitchClientSecret', 'twitchChannel', 'streamlabsToken'];
const ENV = {
  twitchClientId: 'TWITCH_CLIENT_ID',
  twitchClientSecret: 'TWITCH_CLIENT_SECRET',
  twitchChannel: 'TWITCH_CHANNEL',
  streamlabsToken: 'STREAMLABS_SOCKET_TOKEN',
};

function readFile() {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Env vars win over the stored file (so `.env` still works for power users). */
export function loadCreds() {
  const file = readFile();
  const out = {};
  for (const k of KEYS) out[k] = (process.env[ENV[k]] || file[k] || '').trim();
  return out;
}

/** Merge a partial patch into the file; blank/undefined values leave the key alone. */
export function saveCreds(patch) {
  const file = readFile();
  for (const k of KEYS) {
    if (typeof patch[k] === 'string' && patch[k].trim() !== '') file[k] = patch[k].trim();
    if (patch[k] === null) delete file[k]; // explicit clear
  }
  writeFileSync(FILE, JSON.stringify(file, null, 2));
  return loadCreds();
}

/** Safe view for the browser — never sends secrets back, just whether they're set. */
export function credsStatus() {
  const c = loadCreds();
  return {
    twitchClientId: !!c.twitchClientId,
    twitchClientSecret: !!c.twitchClientSecret,
    twitchChannel: c.twitchChannel || '',
    streamlabsToken: !!c.streamlabsToken,
  };
}
