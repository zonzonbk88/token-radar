# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zonzonbk88/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zonzonbk88/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for the make.fun `token-radar-01` bounty: it reads the
sealed DefiLlama snapshot, finds the protocols that record no token yet,
ranks them by an implied launch value, and hands in a dashboard where every
row carries a concrete plan for farming that protocol before a token exists.

## The value model

No name is ever special-cased; one function prices every protocol from the
snapshot's own figures:

```
implied value = TVL x peer multiple x momentum x maturity
```

- **Peer multiple** — for the protocol's category, the median market-cap /
  TVL multiple of the protocols in that same category whose token already
  trades in the snapshot. Categories with fewer than three tokenised peers
  fall back to the global median multiple. This is a comparables model: a
  lending market is priced the way lending markets with tokens are priced.
- **Momentum** — the seven-day TVL change, clamped to ±30% so one hot week
  cannot dominate, weighted 1.5 (`1 + 1.5 x change`).
- **Maturity** — up to +25%, scaled by how long the protocol has run with
  no token recorded (full weight at two years, from `listed_at` to the
  snapshot's `as_of` date). A launch prices a track record; a longer
  tokenless record is worth more, and it is also the record a farmer's
  early activity joins.

The board covers the snapshot's whole 40-protocol watchlist and adds every
other pre-token protocol that is not a wrapped, staked, bridged or custodial
derivative of a token that already trades (the house's own exclusions,
applied as a screen) — 198 rows on this snapshot. Protocols whose token
already trades are never on the board; they exist in the model only as the
peer set. Wording follows the data: a protocol *records* no token, which
is what DefiLlama's record shows, not proof that none exists.

## Farm plans

Each row carries five steps generated from the protocol's category, chains
and size: set up a dedicated wallet, perform the category's core action
(provide liquidity, lend and borrow, deposit into the flagship vault, …)
with a starting size scaled to the protocol's TVL, repeat it on a weekly
rhythm for at least eight weeks, take part in governance, and watch for a
points program or snapshot announcement. Every step names what it costs —
gas by chain family, a capital range, minutes per week.

## The dashboard

`dashboard/` is a static page (no framework, no network): a sortable,
filterable board (search, category, chain, watchlist-only, five sort
orders), a detail view per protocol showing the model's three factors and
the full farm plan, and hash routes for each view (`#/`, `#f/<category>`,
`#p/<slug>`). It renders from `data.js`, which `main.ts` writes beside it
from the same board that goes into `board.json`, so the page and the gate
always agree.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

Node 22.18+, standard library only. The run writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` (built with
`vendor/makefun-board.ts`) into the output directory, and refuses to hand
in a board the gate would refuse.

## Layout

- `main.ts` — entry point: snapshot in, hand-in out.
- `lib/model.ts` — the value model, the board builder, the farm plans and
  the board's self-check.
- `dashboard/` — `index.html`, `app.css`, `app.js`.
- `screenshots/` — the board, one protocol's detail view, a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored by the kit.

MIT licensed — see `LICENSE`.
