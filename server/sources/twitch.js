import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { WebSocket } from 'ws';

const OAUTH = 'https://id.twitch.tv/oauth2';
const HELIX = 'https://api.twitch.tv/helix';
const EVENTSUB_WS = 'wss://eventsub.wss.twitch.tv/ws';
const SCOPES = ['bits:read', 'channel:read:subscriptions'];

const SUB_TYPES = [
  { type: 'channel.cheer', version: '1' },
  { type: 'channel.subscribe', version: '1' },
  { type: 'channel.subscription.gift', version: '1' },
  { type: 'channel.subscription.message', version: '1' },
];

/**
 * Twitch EventSub over WebSocket — bits, new subs, gift subs, resubs.
 * Non-blocking: if there's no saved token it just reports state 'need-auth' and
 * an authUrl(); the hub's /twitch/callback route feeds the code to handleCallback().
 * The refresh token is cached in tokenFile and refreshed silently after that.
 * Needs the channel to be at least Twitch Affiliate.
 *
 * Returns { stop, status, authUrl, handleCallback }.
 */
export function startTwitch(opts) {
  const src = new TwitchSource(opts);
  if (!opts.clientId || !opts.clientSecret || !opts.channel) {
    console.log('[twitch] client id / secret / channel not set — bits & subs disabled');
  } else {
    src.start().catch((e) => src._fail(e.message));
  }
  return {
    stop: () => src.stop(),
    status: () => src.status(),
    authUrl: () => src.authUrl(),
    handleCallback: (code) => src.handleCallback(code),
  };
}

class TwitchSource {
  constructor({ clientId, clientSecret, channel, redirectUri, tokenFile, emit }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.channel = (channel || '').toLowerCase();
    this.redirectUri = redirectUri;
    this.tokenFile = tokenFile;
    this.emit = emit;
    this.tokens = null;
    this.broadcasterId = null;
    this.ws = null;
    this.keepaliveTimer = null;
    this.stopped = false;
    this.state = clientId && clientSecret && channel ? 'idle' : 'off';
    this.detail = '';
  }

  status() {
    return { state: this.state, channel: this.channel, detail: this.detail };
  }

  _fail(msg) {
    this.state = 'error';
    this.detail = msg;
    console.error('[twitch]', msg);
  }

  authUrl() {
    if (!this.clientId) return '';
    return (
      `${OAUTH}/authorize?client_id=${this.clientId}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent(SCOPES.join(' '))}` +
      `&force_verify=true`
    );
  }

  async start() {
    this.tokens = this.loadTokens();
    if (!this.tokens) {
      this.state = 'need-auth';
      console.log('\n[twitch] authorize at the setup page, or open:\n  ' + this.authUrl() + '\n');
      return;
    }
    await this.connectFlow();
  }

  async handleCallback(code) {
    try {
      const body = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      });
      const r = await fetch(`${OAUTH}/token`, { method: 'POST', body });
      if (!r.ok) throw new Error(`token exchange ${r.status}: ${await r.text()}`);
      this.saveTokens(await r.json());
      this.connectFlow().catch((e) => this._fail(e.message));
      return { ok: true };
    } catch (e) {
      this._fail(e.message);
      return { ok: false, error: e.message };
    }
  }

  async connectFlow() {
    this.state = 'connecting';
    await this.ensureFreshToken();
    this.broadcasterId = await this.resolveBroadcasterId();
    console.log(`[twitch] authorized for #${this.channel} (${this.broadcasterId})`);
    this.connect(EVENTSUB_WS);
  }

  stop() {
    this.stopped = true;
    this.state = 'off';
    clearTimeout(this.keepaliveTimer);
    try {
      this.ws?.removeAllListeners();
      this.ws?.close();
    } catch {}
    this.ws = null;
  }

  // --- token handling -----------------------------------------------------
  loadTokens() {
    if (!existsSync(this.tokenFile)) return null;
    try {
      return JSON.parse(readFileSync(this.tokenFile, 'utf8'));
    } catch {
      return null;
    }
  }

  saveTokens(t) {
    this.tokens = { ...t, obtained_at: Date.now() };
    writeFileSync(this.tokenFile, JSON.stringify(this.tokens, null, 2));
  }

  async ensureFreshToken() {
    const age = Date.now() - (this.tokens.obtained_at || 0);
    const ttl = (this.tokens.expires_in || 3600) * 1000;
    if (age < ttl - 5 * 60 * 1000) return;

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh_token,
    });
    const r = await fetch(`${OAUTH}/token`, { method: 'POST', body });
    if (!r.ok) {
      this.state = 'need-auth';
      throw new Error('token refresh failed — re-authorize');
    }
    this.saveTokens(await r.json());
    console.log('[twitch] token refreshed');
  }

  async helix(path, init = {}) {
    await this.ensureFreshToken();
    return fetch(`${HELIX}${path}`, {
      ...init,
      headers: {
        'Client-Id': this.clientId,
        Authorization: `Bearer ${this.tokens.access_token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  }

  async resolveBroadcasterId() {
    const r = await this.helix(`/users?login=${this.channel}`);
    if (!r.ok) throw new Error(`/users ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const id = j.data?.[0]?.id;
    if (!id) throw new Error(`channel "${this.channel}" not found`);
    return id;
  }

  // --- eventsub websocket ------------------------------------------------
  connect(url) {
    if (this.stopped) return;
    this.ws = new WebSocket(url);
    this.ws.on('message', (raw) => this.onMessage(raw));
    this.ws.on('error', (e) => console.error('[twitch] ws error:', e.message));
    this.ws.on('close', () => {
      clearTimeout(this.keepaliveTimer);
      if (!this.reconnecting && !this.stopped) {
        this.state = 'connecting';
        console.warn('[twitch] socket closed — reconnecting in 5s');
        setTimeout(() => this.connect(EVENTSUB_WS), 5000);
      }
    });
  }

  bumpKeepalive(seconds) {
    clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      console.warn('[twitch] keepalive missed — reconnecting');
      this.ws?.terminate();
    }, (seconds + 10) * 1000);
  }

  async onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const type = msg.metadata?.message_type;

    if (type === 'session_welcome') {
      const session = msg.payload.session;
      this.bumpKeepalive(session.keepalive_timeout_seconds || 30);
      if (!this.reconnecting) await this.createSubscriptions(session.id);
      this.reconnecting = false;
      this.state = 'connected';
      this.detail = '';
    } else if (type === 'session_keepalive') {
      this.bumpKeepalive(30);
    } else if (type === 'session_reconnect') {
      this.reconnecting = true;
      const old = this.ws;
      this.connect(msg.payload.session.reconnect_url);
      setTimeout(() => old?.close(), 2000);
    } else if (type === 'revocation') {
      console.warn('[twitch] subscription revoked:', msg.payload.subscription?.type);
    } else if (type === 'notification') {
      this.bumpKeepalive(30);
      this.onNotification(msg.payload.subscription.type, msg.payload.event);
    }
  }

  async createSubscriptions(sessionId) {
    for (const s of SUB_TYPES) {
      const r = await this.helix('/eventsub/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          type: s.type,
          version: s.version,
          condition: { broadcaster_user_id: this.broadcasterId },
          transport: { method: 'websocket', session_id: sessionId },
        }),
      });
      if (r.ok) console.log(`[twitch] subscribed ${s.type}`);
      else console.error(`[twitch] subscribe ${s.type} failed ${r.status}: ${await r.text()}`);
    }
  }

  onNotification(subType, e) {
    switch (subType) {
      case 'channel.cheer':
        this.emit({ source: 'twitch', type: 'cheer', user: e.is_anonymous ? 'Anonymous' : e.user_name, bits: e.bits });
        break;
      case 'channel.subscribe':
        if (e.is_gift) return;
        this.emit({ source: 'twitch', type: 'sub', user: e.user_name, tier: e.tier });
        break;
      case 'channel.subscription.gift':
        this.emit({ source: 'twitch', type: 'giftsub', user: e.is_anonymous ? 'Anonymous' : e.user_name, tier: e.tier, total: e.total });
        break;
      case 'channel.subscription.message':
        this.emit({ source: 'twitch', type: 'resub', user: e.user_name, tier: e.tier, months: e.cumulative_months });
        break;
    }
  }
}
