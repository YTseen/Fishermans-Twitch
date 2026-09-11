import { createServer } from 'node:https';

const PAGE = (ok, detail) => `<body style="font-family:sans-serif;background:#0b1319;color:#e6eef0;padding:40px">
  <h2>${ok ? 'Twitch connected.' : 'Authorization failed'}</h2>
  <p>${ok ? 'You can close this tab and return to setup.' : ''}</p>
  ${ok ? '' : `<pre>${detail || ''}</pre>`}
</body>`;

/**
 * HTTPS-only server that exists for one route: the Twitch OAuth redirect.
 * Everything else the app does (overlay, WebSocket hub, setup page) stays on
 * plain HTTP so OBS's browser source and the live event feed are untouched.
 */
export function startTwitchCallbackServer(port, { key, cert }, handleCode) {
  const srv = createServer({ key, cert }, async (req, res) => {
    const url = new URL(req.url, `https://localhost:${port}`);
    if (url.pathname !== '/twitch/callback') {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get('code');
    const errDesc = url.searchParams.get('error_description');
    const done = code ? await handleCode(code) : { ok: false, error: errDesc || 'no code in redirect' };
    res.writeHead(done.ok ? 200 : 400, { 'content-type': 'text/html' });
    res.end(PAGE(done.ok, done.error));
  });

  srv.listen(port, '127.0.0.1', () =>
    console.log(`[twitch] OAuth callback on https://localhost:${port}/twitch/callback (self-signed — one-time browser warning is expected)`),
  );
  srv.on('error', (e) => console.error('[twitch-callback] error', e.message));
  return srv;
}
