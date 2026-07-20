# larvae specimens — setup

drop-in for a next.js app router project (your usual stack: vercel + upstash).

## files

```
lib/larvae.ts                      shared: redis, larv.ai fetchers, haiku helper
app/api/larvae/build/route.ts      one-shot batch build (secret-protected)
app/api/larvae/route.ts            GET all profiles
app/api/larvae/ask/route.ts        POST ask-the-hive
components/LarvaAvatar.tsx         procedural SVG larva (zero cost, deterministic)
app/larvae/page.tsx                specimen grid + ask box
```

## install

```
npm install @upstash/redis
```

(tailwind assumed, same as your other projects)

## env vars (vercel dashboard → settings → environment variables)

```
ANTHROPIC_API_KEY=sk-ant-...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
LARVAE_BUILD_SECRET=pick-any-long-random-string
```

## run order

1. deploy
2. visit in browser (no CLI needed):
   `https://yourapp.vercel.app/api/larvae/build?secret=YOUR_SECRET`
   — wait for the JSON response. if `done` is false, visit the **same URL again** until `done: true`.
3. visit `/larvae`

### regenerate names + mascots (full rebuild)

**Required after naming or avatar code changes** — production Redis still holds old profiles until you reset-rebuild. Profiles store invented nicknames and full larvatar traits (`body`, `pattern`, `eyes`, `antenna`, `accessory`, `mouth`, `pose`, …).

```
https://yourapp.vercel.app/api/larvae/build?secret=YOUR_SECRET&reset=true
```

Keep reloading that URL (without needing `&reset=true` again) until the response says `"done": true`. Then spot-check `/api/larvae`:

- `unique names === larva count` (zero repeats)
- zero names starting with `The `
- no role-title pile-ups (`Architect` / `Pragmatist` / `Maximalist` / …)
- every `avatar` includes `body`, `mouth`, `pose`, `accessory`, etc. (not just `hue`/`tone`)

re-run the build URL whenever there are new forum posts / labs ideas. it overwrites cleanly.

## cost + limits notes

- profiles: one haiku call per larva, one time per build. re-runs regenerate all —
  fine at current scale, add a "skip if fresh" check later if larva count grows a lot.
- ask: 5 haiku calls + 1 consensus call per question. global cap of 150 asks/day
  is hard-coded in ask/route.ts (DAILY_CAP) so a shared link can't drain your key.
- redis: one small JSON per larva + one index key. negligible.
- vercel hobby caps functions at 60s. if the build route times out (lots of posts),
  tell cursor: "split the build route into pages — accept a ?cursor= param and
  process 10 posts per call." don't pre-build that unless it actually times out.

## unknowns to verify on first run

the larvaResponses field names inside forum/labs detail responses aren't documented —
the fetcher tries wallet/address/wallet_address and response/content/body/text/message.
if the build reports 0 built, open
`https://larv.ai/api/forum` then `https://larv.ai/api/forum/<some-id>` in your browser,
look at the actual field names in larvaResponses, and tell cursor to update
`extractResponses()` in lib/larvae.ts to match.
