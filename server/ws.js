import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { bus } from './bus.js';
import { TIERS, SPECIES } from './engine/fish.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Local hub. WebSocket for { type: 'catch' } pushes to the overlay; `npm run sim`
 * sends { type: 'sim', event }. HTTP serves:
 *   GET  /                  -> credential setup page
 *   GET  /catalogue.json    -> full species list for the review gallery
 *   GET  /api/status        -> source connection state (no secrets)
 *   POST /api/credentials   -> save keys, reload sources
 *   GET  /twitch/callback   -> OAuth redirect target
 *
 * `hub` = { redirectUri, credsStatus(), sourceStatus(), saveCredentials(patch), twitchCallback(code) }
 */
export function startWs(port, config, hub) {
  const catalogue = buildCatalogue(config);
  const setupHtml = readFileSync(join(here, 'setup.html'), 'utf8');

  const http = createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    const send = (code, type, body) => {
      res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*' });
      res.end(body);
    };

    if (req.method === 'GET' && (path === '/' || path === '/setup')) return send(200, 'text/html', setupHtml);
    if (path === '/catalogue.json') return send(200, 'application/json', JSON.stringify(catalogue));

    if (path === '/api/status') {
      const s = hub?.sourceStatus?.() || {};
      return send(200, 'application/json', JSON.stringify({
        redirectUri: hub?.redirectUri || '',
        creds: hub?.credsStatus?.() || {},
        twitch: s.twitch || { state: 'off' },
        streamlabs: s.streamlabs || { state: 'off' },
      }));
    }

    if (path === '/api/credentials' && req.method === 'POST') {
      const raw = await readBody(req);
      let patch = {};
      try { patch = JSON.parse(raw); } catch {}
      hub?.saveCredentials?.(patch);
      return send(200, 'application/json', JSON.stringify({ ok: true }));
    }

    if (path === '/twitch/callback') {
      const code = new URL(req.url, hub?.redirectUri || 'http://localhost').searchParams.get('code');
      const done = code ? await hub?.twitchCallback?.(code) : { ok: false, error: 'no code' };
      return send(done?.ok ? 200 : 400, 'text/html',
        done?.ok
          ? '<body style="font-family:sans-serif;background:#0b1319;color:#e6eef0;padding:40px"><h2>Twitch connected.</h2><p>You can close this tab and return to setup.</p></body>'
          : `<body style="font-family:sans-serif;background:#0b1319;color:#e6eef0;padding:40px"><h2>Authorization failed</h2><pre>${done?.error || ''}</pre></body>`);
    }

    send(404, 'text/plain', 'not found');
  });

  const wss = new WebSocketServer({ server: http });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg?.type === 'sim' && msg.event) bus.emit('support', { source: 'sim', ...msg.event });
    });
  });

  bus.on('catch', (payload) => {
    const s = JSON.stringify({ type: 'catch', catch: payload });
    for (const c of wss.clients) if (c.readyState === 1) c.send(s);
  });

  http.listen(port, '127.0.0.1', () =>
    console.log(`[hub] http://127.0.0.1:${port}  (setup page + overlay socket)`),
  );
  http.on('error', (e) => console.error('[hub] error', e.message));
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
    req.on('error', () => resolve(''));
  });
}

function buildCatalogue(config) {
  const tierOf = {};
  TIERS.forEach((t) => t.pool.forEach((p) => (tierOf[p.id] = t.n)));
  const species = Object.entries(SPECIES)
    .filter(([id]) => id !== '_fallback')
    .map(([id, sp]) => ({
      id, name: sp.name, shape: sp.shape, tint: sp.tint, emissive: sp.emissive || 0,
      junk: !!sp.junk, tier: tierOf[id] || null, lengthRange: sp.lengthRange, maxWeight: sp.maxWeight,
    }));
  const fish = species.filter((s) => !s.junk).sort((a, b) => (a.tier || 9) - (b.tier || 9) || a.lengthRange[1] - b.lengthRange[1]);
  const junk = species.filter((s) => s.junk);
  return { count: fish.length + junk.length, species: fish, junk };
}
