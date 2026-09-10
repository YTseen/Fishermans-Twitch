# Bass Pro Alerts

Twitch bits, subscriptions, and Streamlabs tips rendered as a PS1-style **Bass
Pro fishing catch** — a splash, a low-poly fish rising out of the water, and a
weigh-in card. The bigger the support, the bigger the fish pool it rolls from.

It's an **alert overlay**, not a game. Nobody plays it; it fires when someone
supports the stream.

```
support event ──► normalize to $ ──► tier ──► weighted fish roll ──► overlay
   (Twitch / Streamlabs / sim)                 size · weight · rarity
```

- **Amount unlocks a pool, the roll picks the fish.** A $5 tip and a $50 tip
  feel different, but two $5 tips don't feel identical. Occasional lucky "bleed"
  into the next tier up, occasional junk catches (boot, tire, treasure chest).
- **Rarity** is where the rolled size falls in the species' range, floored by
  tier: `COMMON / UNCOMMON / RARE / EPIC / LEGENDARY / MYTHIC`. The card is
  themed by it and legendary+ pulses.
- The **supporter's name** is the star — it lands with a slot-machine reveal and
  a jackpot sting; the fish is the "prize" below.
- **~75 species** across 5 tiers, all procedural low-poly (body lofted from a
  per-family profile, vertex-painted). Drop real `.glb` files in
  `overlay/public/models/` to override any of them (see that folder's README).

## Run it

```bash
npm install     # installs server + overlay deps
npm run dev      # event hub (:7333) + overlay (:5173) in one terminal
```

(or `npm start` and `npm run overlay` in two terminals.)

### Add to OBS

1. **Sources → + → Browser**.
2. URL: `http://localhost:5173`  ·  Width **1920**, Height **1080**.
3. Uncheck *"Shutdown source when not visible"* so it stays connected between
   scenes.
4. The card is a ~400px strip on the right; nothing else is drawn (transparent
   background), so leave the source full-canvas and just switch scenes normally.

URL options: `?side=left` docks it left · `?mute=1` silences it ·
`?port=7333` if you changed the hub port.

### Review every fish — the gallery

Open `http://localhost:5173/?gallery` in a normal browser tab. It steps through
the whole catalogue (fish by tier, then the 8 junk items) — ◀ / ▶ or arrow
keys to step, space to pause. Needs the hub running (`npm run dev`).

### Test without Twitch or Streamlabs

With `npm start` running:

```bash
npm run sim -- --bits 250
npm run sim -- --donation 40
npm run sim -- --sub 3               # tier 1 / 2 / 3
npm run sim -- --resub 12 --tier 2
npm run sim -- --giftsub 5 --tier 1
#   optional: --user SomeName --currency EUR
```

Each fake event runs through the **real** normalize → roll → broadcast path.
You can also press `1`–`5` in the overlay browser tab for a canned catch per tier.

## Connecting Twitch + Streamlabs

Open **`http://localhost:7333/`** with the hub running — it's a setup page. Paste
your keys, hit save, done. They're stored in `server/credentials.json`
(git-ignored) and the sources reconnect immediately. Each card shows a live
status pill. (`.env` still works and overrides the file if you prefer.)

### Twitch (bits, subs, gift subs) — needs Twitch Affiliate

1. Create an app at <https://dev.twitch.tv/console/apps> — category
   **Broadcasting Suite**, OAuth Redirect URL `http://localhost:7333/twitch/callback`.
2. Paste the **Client ID**, **Client Secret**, and your **channel name** into the
   setup page, save.
3. Click **Authorize with Twitch** → approve. The refresh token is cached in
   `server/.tokens.json` and refreshed automatically after that.

Subscribes to `channel.cheer`, `channel.subscribe`, `channel.subscription.gift`,
`channel.subscription.message` over EventSub websockets (no public URL needed).

### Streamlabs (cash tips)

Streamlabs dashboard → Account Settings → API Settings → API Tokens → copy
**"Your Socket API Token"** into the setup page, save. Only `donation` events are
consumed — Streamlabs also relays Twitch bits/subs and those come straight from
Twitch, so consuming them here too would double-fire.

## Tuning — `server/config.json`

| Key | Meaning |
|---|---|
| `subValues` | in-game dollar value per Twitch sub tier (`1000/2000/3000`). Default `5 / 10 / 25` |
| `bitsPerDollar` | `100` — 100 bits = $1.00 |
| `bleedChance` / `junkChance` | odds of a tier-up pull / a junk catch |
| `defaultSceneMs` | fallback popup length; per-tier overrides live in `tiers.json` |

Tier bands and species pools: `server/data/tiers.json`. Species stats (length
range, max weight, shape, colour): `server/data/species.json`. Everything is
keyed by species id — one table, referenced by the pools, the engine, and the
model manifest.

## Layout

```
server/
  index.js            pipeline wiring + boot
  bus.js              the one event seam
  ws.js               local overlay hub (127.0.0.1:7333) + sim intake
  sim.js              fake events through the real pipeline
  engine/
    normalize.js      raw event -> { kind, value, supporter, detail }
    fish.js           value -> catch (species, size, weight, rarity)
    rng.js            seeded RNG
  sources/
    twitch.js         EventSub websocket + OAuth
    streamlabs.js     tips socket
  data/tiers.json, data/species.json, config.json
overlay/
  src/main.js         WS client + one-at-a-time alert queue
  src/scene.js        three.js + PS1 render stack (low-res RT, vertex snap, posterize)
  src/catch.js        splash -> rise -> hover -> sink timeline
  src/fish.js         procedural fish/junk builders + .glb loader
  src/ui.js           the weigh-in card
  src/audio.js        synthesised splash / reel / fanfare
  public/models/      .glb files + models.json (see its README)
```
