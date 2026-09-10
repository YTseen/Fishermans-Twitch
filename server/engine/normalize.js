// Raw source event -> a single comparable payload the fish engine understands.
//
// Every source (Twitch, Streamlabs, sim) produces events in this shape:
//   { source, type: 'cheer'|'sub'|'resub'|'giftsub'|'donation', user, ... }
// and normalize() collapses them to { kind, value, supporter, detail, currency? }.

const MONEY = { USD: '$', EUR: '€', GBP: '£', ZAR: 'R', CAD: '$', AUD: '$' };

function money(amount, currency = 'USD') {
  const sym = MONEY[currency] || '';
  const n = Number(amount) || 0;
  return `${sym}${n.toFixed(2)}${sym ? '' : ' ' + currency}`;
}

export function normalize(ev, config) {
  const user = (ev.user || 'someone').trim() || 'someone';

  switch (ev.type) {
    case 'cheer': {
      const bits = Math.max(0, Math.round(Number(ev.bits) || 0));
      return {
        kind: 'bits',
        value: bits / (config.bitsPerDollar || 100),
        supporter: user,
        detail: `${bits} bits`,
        raw: ev,
      };
    }

    case 'sub':
    case 'resub': {
      const tier = String(ev.tier || '1000');
      const value = config.subValues[tier] ?? config.subValues['1000'];
      const months = Number(ev.months) || 0;
      return {
        kind: 'sub',
        value,
        supporter: user,
        detail:
          ev.type === 'resub' && months > 1
            ? `${months}-month resub`
            : tier === '1000'
              ? 'a sub'
              : `a tier ${Number(tier) / 1000} sub`,
        raw: ev,
      };
    }

    case 'giftsub': {
      const tier = String(ev.tier || '1000');
      const per = config.subValues[tier] ?? config.subValues['1000'];
      const count = Math.max(1, Math.round(Number(ev.total) || 1));
      return {
        kind: 'giftsub',
        value: per * count,
        supporter: user,
        detail: `${count} gift sub${count > 1 ? 's' : ''}`,
        raw: ev,
      };
    }

    case 'donation': {
      const currency = (ev.currency || 'USD').toUpperCase();
      return {
        kind: 'donation',
        value: Math.max(0, Number(ev.amount) || 0),
        supporter: user,
        currency,
        detail: money(ev.amount, currency),
        raw: ev,
      };
    }

    default:
      return null;
  }
}
