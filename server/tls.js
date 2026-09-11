import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'certs');
const KEY = join(DIR, 'localhost-key.pem');
const CERT = join(DIR, 'localhost-cert.pem');

/**
 * A self-signed HTTPS cert for `localhost`, used for exactly one thing: the
 * Twitch OAuth callback, which Twitch now requires to be HTTPS even on
 * localhost. Nothing else in the app needs it — the overlay and the WebSocket
 * hub stay on plain HTTP/WS, so OBS's browser source is unaffected.
 *
 * Being self-signed, the browser will show a one-time "not private" warning
 * the first time it's hit (Advanced -> Proceed) — that's expected for local
 * dev without a trusted CA and only happens on the authorize step.
 */
export function ensureLocalhostCert() {
  if (existsSync(KEY) && existsSync(CERT)) {
    return { key: readFileSync(KEY), cert: readFileSync(CERT) };
  }
  mkdirSync(DIR, { recursive: true });
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
      '-keyout', KEY,
      '-out', CERT,
      '-days', '3650',
      '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ], { stdio: 'pipe' });
  } catch (e) {
    throw new Error(
      'Could not generate a local HTTPS certificate (needs `openssl` on PATH): ' +
        (e.stderr?.toString() || e.message),
    );
  }
  console.log('[tls] generated a self-signed localhost certificate (server/certs/, gitignored)');
  return { key: readFileSync(KEY), cert: readFileSync(CERT) };
}
