import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';

import { bus } from './bus.js';
import { startWs } from './ws.js';
import { normalize } from './engine/normalize.js';
import { rollCatch } from './engine/fish.js';
import { startTwitch } from './sources/twitch.js';
import { startStreamlabs } from './sources/streamlabs.js';
import { loadCreds, saveCreds, credsStatus } from './credentials.js';
import { ensureLocalhostCert } from './tls.js';
import { startTwitchCallbackServer } from './oauth-callback.js';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
const PORT = config.wsPort;
// Twitch requires HTTPS for the OAuth redirect, even on localhost, so that one
// route runs on its own tiny HTTPS server with a self-signed cert. Everything
// else (the overlay + the WebSocket hub OBS/the browser talk to) stays on
// plain HTTP — unaffected, so nothing about the live overlay changes.
const CALLBACK_PORT = config.twitch?.redirectPort ?? 7334;
const REDIRECT_URI = `https://localhost:${CALLBACK_PORT}/twitch/callback`;
const TOKEN_FILE = join(here, '.tokens.json');

// --- the pipeline: support -> normalize -> fish roll -> broadcast ------------
bus.on('support', (ev) => {
  const norm = normalize(ev, config);
  if (!norm) return console.warn('[skip] unrecognised event', ev.type);
  const c = rollCatch(norm, config);
  const flags = [c.junk ? 'JUNK' : null, c.luckyBleed ? 'BLEED' : null].filter(Boolean).join(' ');
  console.log(
    `[catch] ${c.supporter} (${c.detail}) -> ${c.species} ${c.lengthIn}" ${c.weightLb}lb [${c.rarity}] T${c.tier}${flags ? ' ' + flags : ''}`,
  );
  bus.emit('catch', c);
});

// --- source lifecycle (restartable when credentials change) -----------------
const emit = (event) => bus.emit('support', event);
let twitch = { stop() {}, status: () => ({ state: 'off' }), authUrl: () => '', handleCallback: () => ({}) };
let streamlabs = { stop() {}, status: () => ({ state: 'off' }) };

function applySources() {
  const c = loadCreds();
  streamlabs.stop();
  streamlabs = startStreamlabs({ token: c.streamlabsToken, emit });
  twitch.stop();
  twitch = startTwitch({
    clientId: c.twitchClientId,
    clientSecret: c.twitchClientSecret,
    channel: c.twitchChannel,
    redirectUri: REDIRECT_URI,
    tokenFile: TOKEN_FILE,
    emit,
  });
}

// --- boot ------------------------------------------------------------------
startWs(PORT, config, {
  redirectUri: REDIRECT_URI,
  credsStatus,
  sourceStatus: () => ({
    twitch: { ...twitch.status(), authUrl: twitch.authUrl() },
    streamlabs: streamlabs.status(),
  }),
  saveCredentials: (patch) => {
    saveCreds(patch);
    applySources();
  },
});

try {
  startTwitchCallbackServer(CALLBACK_PORT, ensureLocalhostCert(), (code) => twitch.handleCallback(code));
} catch (e) {
  console.error('[twitch] callback server disabled:', e.message);
  console.error('        Twitch authorization will not work until this is fixed.');
}

applySources();

console.log(`[bass-pro-alerts] running. Setup: http://localhost:${PORT}/  ·  test: npm run sim -- --bits 250`);
