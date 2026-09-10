# Fish models

Drop `.glb` files in this folder and map them in `models.json`. Any species
without an entry (or whose file fails to load) renders as a procedural low-poly
fish tinted from `server/data/species.json`, so the overlay always works.

## models.json format

Keys are **species ids** from `server/data/species.json`:

```json
{
  "walleye":        { "file": "walleye.glb", "scale": 1.0, "yaw": 0 },
  "largemouth-bass":{ "file": "largemouth.glb", "scale": 1.1, "yaw": 1.5708 }
}
```

- `file` — filename in this folder.
- `scale` — multiplier after the model is auto-normalised to ~2 units long.
- `yaw` — extra Y rotation (radians) so the fish faces **+X** (screen right).

The loader recolours model materials into the project's PS1 flat-shaded look
automatically; textured models keep their base map.

## Where to get CC0 models

- Quaternius — "Animated Fish" / "Ultimate Fishing" packs (CC0)
- Kenney.nl — fish and prop kits (CC0)
- Poly Pizza — filter licence to **CC0** (CC-BY needs an ATTRIBUTION file)

Export or convert to `.glb`. Keep polycounts low — the whole look is low-poly.
