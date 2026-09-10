import { io } from 'socket.io-client';

/**
 * Streamlabs Socket API — cash tips only. We deliberately ignore every other
 * event type: Streamlabs also relays Twitch bits/subs, and those come straight
 * from Twitch in sources/twitch.js. Consuming them here too would double-fire.
 *
 * Returns { stop, status } — status() -> { state: 'off'|'connecting'|'connected'|'error', detail }
 */
export function startStreamlabs({ token, emit }) {
  const s = { state: 'off', detail: '' };
  if (!token) {
    console.log('[streamlabs] no token set — tips disabled');
    return { stop() {}, status: () => s };
  }

  s.state = 'connecting';
  const socket = io(`https://sockets.streamlabs.com?token=${token}`, {
    transports: ['websocket'],
    reconnection: true,
  });

  socket.on('connect', () => {
    s.state = 'connected';
    s.detail = '';
    console.log('[streamlabs] connected');
  });
  socket.on('disconnect', (r) => {
    s.state = 'connecting';
    s.detail = String(r);
    console.log('[streamlabs] disconnected:', r);
  });
  socket.on('connect_error', (e) => {
    s.state = 'error';
    s.detail = e.message;
    console.error('[streamlabs] connect_error:', e.message);
  });

  socket.on('event', (payload) => {
    if (!payload || payload.type !== 'donation') return;
    for (const m of payload.message || []) {
      emit({
        source: 'streamlabs',
        type: 'donation',
        user: m.from || m.name || 'someone',
        amount: m.amount,
        currency: (m.currency || 'USD').toUpperCase(),
        note: m.message || '',
      });
    }
  });

  return {
    stop() {
      s.state = 'off';
      socket.removeAllListeners();
      socket.disconnect();
    },
    status: () => s,
  };
}
