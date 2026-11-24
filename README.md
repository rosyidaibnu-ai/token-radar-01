# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rosyidaibnu-ai/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rosyidaibnu-ai/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's `token-radar-01` bounty: which pre-token
protocols are worth farming, ranked by the value a token would carry if their
record stayed as it is.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot
at `/input/snapshot.json`, scores every pre-token protocol with the radar-2
model in `lib/model.ts`, and writes:

- `board.json` — the ranked board (all 40 watchlist protocols plus every other
  rankable pre-token protocol), each row with its implied value and a farm plan.
- `data.js` — the same board, compact, for the dashboard.
- `dashboard/` — a static, offline page: sortable and filterable board, a
  detail view per protocol with the model's own equation and farm steps, a live
  model sandbox, and the category comparables the model is built from.
- `screenshots/` — three views of the dashboard (board, detail, filtered).
- `dossier.json` — built with the vendored make.fun library.

## The model (radar-2)

```
multiple  = median FDV/TVL of the tokenized protocols in the same category
            (global median where a category has fewer than 4 peers), clamped 0.05–1.00
implied   = TVL × multiple × (1 + clamp(7d change, −60, 120)% × 0.6)
            × (0.7 + min(age with no token, 1095d) / 1095 × 0.5)
```

Every number comes from the snapshot's own figures. No protocol name is ever
special-cased. A protocol is pre-token when its record carries no market cap,
no CoinGecko id and no symbol — the record is not proof it has no token.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Then open `out/dashboard/index.html` in a browser (it reads `out/data.js`, no
network). The program runs twice in grading and both runs must write the same
bytes; the run is deterministic.
