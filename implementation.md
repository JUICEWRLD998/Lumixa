# Lumixa — Implementation Plan

> **The world's first un-fakeable, autonomous sports-trading agent.**
> Every signal is anchored against Merkle-proven TxLINE odds and graded against the demargined closing line — producing a public, cryptographically verifiable proof-of-skill.

**Hackathon:** TxLINE / TxODDS — World Cup 2026 Autonomous Agents track
**Stack:** TypeScript / Node + React, `@solana/web3.js` + Anchor (devnet)
**Prize target:** 1st place (10,000 USDT)

---

## 1. Context — Why this wins

Most teams will build the three starter ideas (sharp-movement detector, agent-vs-agent arena, in-play market maker). They all use the *consensus* number and treat "anchored on Solana" as a **checkbox hash**.

Two TxLINE assets nobody will exploit together:

1. **Per-bookmaker granularity** — each `OddsPayload` carries `Bookmaker`/`BookmakerId` + demargined `Pct`. This lets us reconstruct the **information topology** of the market: which book leads, how steam propagates, where price discovery *originates*. Real quant alpha, not "odds went up = bet."
2. **Per-tick Merkle proofs** (`validateStat` `.view()` against a daily-root PDA) — lets us make **verifiability the product**, not a feature.

**The reframe judges have never seen:** *The world is about to be flooded with autonomous trading agents all claiming alpha. The hard problem isn't generating signals — it's **proving** which agent is actually sharp. TxLINE is the only feed where both the data and the decision are cryptographically provable. We build the trust layer for predictive agents, with the World Cup as the proving ground.*

### Rubric mapping
| Criterion | How we win |
|---|---|
| Core Functionality & Data Ingestion | SSE odds+scores streams, snapshots, historical replay engine |
| Autonomous Operation | Fully automated Sense → Act → Prove loop, zero human input |
| Logic & Code Architecture | Demargining, lead-lag/steam math, CLV + Brier — deterministic, documented, unit-tested |
| Innovation & Novelty | Market-topology price-discovery **+** cryptographic proof-of-skill |
| Production Readiness | A real trust primitive (copy-trading, prop-firm eval, regulator audit); modular; devnet-live |

---

## 2. Architecture

Three layers, each mapped to a unique TxLINE asset.

```
                ┌─────────────────────────────────────────────────────────┐
                │                    TxLINE API                            │
                │  SSE odds/scores · snapshots · historical · Merkle proofs│
                └─────────────────────────────────────────────────────────┘
                         │ (live)                    │ (recorded)
                         ▼                           ▼
   ┌──────────┐   ┌─────────────┐            ┌──────────────┐
   │  ingest  │──▶│ event bus    │◀───────────│ replay engine│  (demo backbone)
   └──────────┘   └─────────────┘            └──────────────┘
                         │
        ┌────────────────┼────────────────────────────┐
        ▼ SENSE          ▼ ACT                         ▼ PROVE
   ┌──────────┐    ┌──────────┐                  ┌──────────────┐
   │  engine  │───▶│  trader  │─────────────────▶│   prover     │
   │ steam/   │    │ position │   decisions      │ Merkle verify│
   │ lead-lag │    │ manager  │                  │ + anchor     │
   └──────────┘    └──────────┘                  └──────────────┘
                                                        │
                                                        ▼
                                          ┌──────────────────────────┐
                                          │ Lumixa ledger      │
                                          │ (CLV + Brier, tx sigs)    │
                                          └──────────────────────────┘
                                                        │
                              ┌─────────────────────────┴───────────────┐
                              ▼                                          ▼
                       ┌────────────┐                           ┌──────────────┐
                       │ API server │                           │ React dash   │
                       │ (judges)   │                           │ (demo viz)   │
                       └────────────┘                           └──────────────┘
```

### Monorepo layout
```
lumixa/
├── packages/
│   ├── ingest/        # TxLINE client: auth, SSE, snapshots, Merkle-proof fetch
│   ├── replay/        # deterministic replay over recorded data (virtual clock)
│   ├── engine/        # SENSE: demargin, steam detector, lead-lag/price-discovery
│   ├── trader/        # ACT: autonomous position manager (paper/devnet book)
│   ├── prover/        # PROVE: validateStat .view(), devnet anchoring, CLV/Brier
│   ├── core/          # shared types, normalized event model, config
│   └── chain/         # Solana: web3.js wrappers, Memo anchoring, Anchor IDL
├── apps/
│   ├── server/        # Fastify API exposing ledger + live state + verify endpoint
│   └── web/           # React dashboard (market-topology viz, CLV curve, Verify btn)
├── data/              # recorded WC match streams for replay
├── scripts/           # record-live.ts, backtest.ts, demo-run.ts
└── docs/              # technical doc + endpoint list + feedback
```

### Storage (deliberately lightweight)
| Data | Store | Rationale |
|---|---|---|
| Recorded match streams (replay corpus) | JSONL files in `data/` | Append-only, sequential replay |
| Live per-book time series (in-match) | In-memory | Ephemeral; rebuilt on replay |
| Lumixa ledger (decisions, CLV/Brier, tx sigs, proof status) | **SQLite** (`better-sqlite3`) | Persists across restarts, queried by API/dashboard, portable for judges |

No server DB to provision — SQLite is an embedded file; the real source of truth is Solana (anchored Merkle roots). A `LedgerRepository` interface keeps a future SQLite→Postgres swap trivial.

---

## 3. TxLINE integration reference

### Auth
- `POST /auth/guest/start` → guest JWT (Bearer, 30-day). Header `Authorization: Bearer <jwt>`.
- On-chain `subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS, SELECTED_LEAGUES)` (Token-2022) → then `POST /api/token/activate` with `walletSignature` = `nacl.sign.detached(`${txSig}:${leagues}:${jwt}`)` → long-lived API token. Header `X-Api-Token: <token>`.
- **World Cup free tier:** Service Level 1 (60s delay) or SL12 (real-time). Fees waived through Jul 19.

### Endpoints we use
| Purpose | Endpoint |
|---|---|
| Odds snapshot (live or historical via `asOf` ms) | `GET /api/odds/snapshot/{fixtureId}` |
| Real-time odds stream | `GET` SSE odds stream |
| Historical odds (5-min interval array) | `GET` odds interval — **replay corpus** |
| Odds Merkle proof | `GET` Merkle proof for a specific odds update |
| Scores stream / sequence | `GET` SSE scores + full sequence for a fixture |
| Score Merkle proof / validation | `GET /api/scores/stat-validation` (`fixtureId`,`seq`,`statKey`) |
| Fixtures snapshot | `GET` latest fixtures snapshot (epoch day) |

### `OddsPayload` schema (from `/api/odds/snapshot/{fixtureId}`)
```jsonc
{
  "FixtureId": 123456789,
  "MessageId": "msg-abc-001",      // unique tick id — we anchor this
  "Ts": 1718000000000,             // ms timestamp
  "Bookmaker": "ExampleBook",
  "BookmakerId": 42,
  "SuperOddsType": "1X2",          // market type
  "GameState": "FirstHalf",
  "InRunning": true,               // in-play vs pre-match
  "MarketParameters": "0",
  "MarketPeriod": "FullTime",
  "PriceNames": ["Home","Draw","Away"],
  "Prices": [190, 340, 410],       // decimal odds ×100 → 1.90 etc.
  "Pct": ["52.632","29.412","24.390"] // DEMARGINED implied prob % (3dp)
}
```

### On-chain verification flow (`validateStat`)
1. Fetch proof from `/api/scores/stat-validation` → `{ summary, subTreeProof, mainTreeProof, statToProve, eventStatRoot, statProof }` (each node `{hash, isRightSibling}`).
2. Derive PDA: seeds `["daily_scores_roots", epochDay (u16 LE)]`, `epochDay = floor(ts / 86_400_000)`, program `Txoracle`.
3. Call `program.methods.validateStat(ts, summary, fixtureProof, mainTreeProof, predicate, stat1, null, null).accounts({ dailyScoresMerkleRoots: pda }).preInstructions([ComputeBudget(1_400_000)]).view()` → boolean.
- Devnet base: `https://txline-dev.txodds.com/api/`. Program addresses + IDL on the Programs docs pages.

---

## 4. The strategy (defensible logic)

### a) Demargining / fair price
Feed already provides `Pct` (demargined). **StablePrice** is the consensus fair line (includes sharp books). Per-book `Pct` gives us the dispersion to detect who's ahead.

### b) Steam-origination via lead-lag (the novel core)
- Maintain per-`(fixtureId, market, outcome, BookmakerId)` time series of demargined `Pct`.
- A **steam move** = book *b*'s `Pct` shifts > `θ` within window `w`.
- **Lead-lag attribution:** cross-correlate each book's series against the consensus; the book whose moves the consensus *follows* (max lagged correlation) is the **price-discovery leader** (the "sharp source").
- **Signal fires** when a steam move originates at a sharp-leader book AND the consensus has not yet fully repriced → we predict consensus will drift toward the leader before close.

### c) Entry (Act)
Enter (paper/devnet) at the current consensus price on the side the leader is moving toward. Thesis: we are getting a **better-than-closing** price. Risk limits: max stake, max concurrent positions, per-market exposure cap — all deterministic + configurable.

### d) Grading (Prove)
- **CLV (Closing Line Value):** `entry_edge = entry_implied_prob_fair − closing_implied_prob_fair`. CLV is the academically established *sole* measure of genuine betting skill → mathematically defensible.
- **Brier score:** calibration of our entry probabilities vs realized outcomes (from Merkle-proven final scores).
- Each decision record = `{ MessageId, side, price, ourTs, leaderBook, proofRef }` → hash anchored on devnet (Memo); closing line + result verified via `validateStat .view()`.

### e) Lumixa ledger
Append-only public ledger; each row carries CLV, Brier, devnet tx sig, and proof-verified status. Cumulative score = the agent's **un-fakeable reputation**.

---

## 5. Implementation phases

> Timeline: today **Jun 28** → deadline **Jul 19**. ~3 weeks. Record live data early (free tier ends Jul 19).

### Phase 0 — Foundations & data capture (Days 1–2)
- [x] Monorepo scaffold (pnpm workspaces, tsconfig, eslint, vitest) — typecheck + 34 tests green.
- [x] `ingest`: guest-JWT auth + token activation (devnet wallet, ed25519 activation signing real). On-chain `subscribe` is a **marked Phase-3 stub** (needs the undocumented Token-2022 program id/IDL; it throws rather than fabricate a tx sig).
- [x] `scripts/record-live.ts`: subscribe to SSE odds+scores, append raw to `data/<fixtureId>-<UTCdate>.jsonl` (the **replay corpus**); guest-auth, backoff reconnect, `--minutes` auto-stop + SIGINT flush.
- [x] `scripts/replay-check.ts`: re-decode + re-normalize the corpus, demargin sanity (`Pct`≈100); the "can re-read them" gate.
- [x] `core`: normalized event types (`OddsTick`, `ScoreEvent`, `Decision`) + `RecordEnvelope` corpus format.
- **Exit:** tooling ready & verified end-to-end on a synthetic corpus. **Action remaining (human, time-boxed):** run `pnpm record --fixture <id>` against ≥3 live WC fixtures during the free window (ends Jul 19), then `pnpm replay:check`.

### Phase 1 — Ingest + replay (Days 3–6)
- [ ] Snapshot + historical-interval fetchers; SSE subscriber with reconnect/backfill.
- [ ] `replay`: deterministic virtual-clock engine emitting recorded events at configurable speed (the demo backbone — matches end before judging).
- [ ] In-memory per-book time-series store.
- [ ] Tests: replay determinism, schema parsing, demargin sanity (`Pct` sums ≈ 100).
- **Exit:** identical live & replay event interface.

### Phase 2 — Sense + Act (Days 7–11)
- [ ] `engine`: demargin/normalize, steam detector (`θ`,`w`), lead-lag attribution → price-discovery leader, `Signal` with provenance.
- [ ] `trader`: autonomous position manager, entry/exit/stake + risk limits.
- [ ] `scripts/backtest.ts`: run strategy over recorded matches → CLV/Brier report.
- [ ] Tests: steam detection on fixtures, lead-lag on synthetic series, CLV/Brier math.
- **Exit:** backtest produces positive, explainable CLV on recorded data.

### Phase 3 — Prove + API (Days 12–15)
- [ ] `chain`: web3.js + Anchor IDL; PDA derivation; `validateStat .view()` wrapper; Memo anchoring of decision hashes.
- [ ] `prover`: fetch Merkle proofs for acted-on ticks; verify closing line + result on devnet; compute CLV/Brier; build Lumixa ledger.
- [ ] Narration (best-effort): OpenRouter→Gemini client turns each settled decision into a one-line rationale stored alongside the ledger row (§10).
- [ ] `apps/server`: Fastify — `/ledger`, `/state`, `/verify/:decisionId` (runs the live `.view()`), `/replay/start`. Deploy (Railway/Render/Fly) → **judge-testable endpoint**.
- [ ] Tests: end-to-end verify against a known anchored fixture.
- **Exit:** a decision is anchored on devnet and independently re-verified via API.

### Phase 4 — Dashboard, demo & docs (Days 16–19)
- [ ] `apps/web`: market-topology viz (per-book prob lines + leader highlight + steam alerts), live positions, CLV curve, **"Verify on Solana"** button → runs `.view()` + links Explorer. Build to the **§11 design system** (dark-first, clean, R3F hero) using the installed design skills.
- [ ] Record 5-min demo video (storyboard below).
- [ ] `docs/`: technical doc, endpoint list, API feedback section.
- [ ] README, public repo, deployed link.
- **Exit:** all submission requirements met.

---

## 6. Demo storyboard (≤5 min — judging is video-heavy)
1. **Hook (0:30)** — "Every AI agent claims it's profitable. None can prove it. Watch one that can."
2. **Setup (0:30)** — replay a real WC match; show live market-topology viz.
3. **Sense (1:00)** — steam originates at a sharp-leader book; consensus lags; alert fires.
4. **Act (0:45)** — agent autonomously enters; decision hash → devnet tx hash on screen.
5. **Prove (1:30)** — fast-forward to close; CLV computed vs Merkle-proven closing line; click **Verify on Solana** → `.view()` returns true → Explorer link. *"Don't trust us — verify it yourself."*
6. **Scale (0:45)** — Lumixa dashboard across multiple matches; pitch the trust-layer/B2B vision.

---

## 7. Submission checklist
- [ ] Demo video (Loom/YouTube, ≤5 min) — **required to pass screening**
- [ ] Public GitHub repo
- [ ] Deployed link **or** functional API/devnet endpoint (we ship both)
- [ ] Technical doc: core idea, highlights, **list of TxLINE endpoints used**
- [ ] API feedback (what we liked / friction)
- [ ] TxLINE integrated as a **live input** (live + recorded replay)

---

## 8. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Activation friction (wallet + on-chain subscribe even for free tier) | Do auth in Phase 0; cache token; devnet wallet pre-funded |
| Matches end before judging | **Replay engine** is the primary demo path; record real data now |
| Per-bookmaker data sparse | Degrade gracefully to StablePrice consensus + dispersion |
| Odds on-chain verify may differ from `validateStat` (scores-focused) | Verify odds Merkle proof client-side against published root; use `validateStat` for score/result settlement — document honestly |
| `validateStat` compute cost (1.4M CU) | Set `ComputeBudget` in `preInstructions` |
| Scope creep | Custom Anchor program for anchoring is a **stretch**; default to Memo program |

---

## 9. Quick start (build setup)

```bash
# 1. scaffold
corepack enable && pnpm init
pnpm add -w -D typescript tsx vitest eslint @types/node
pnpm dlx tsc --init

# 2. runtime deps
pnpm add @solana/web3.js @coral-xyz/anchor tweetnacl bs58 \
         fastify eventsource undici zod pino dotenv better-sqlite3 \
         openai   # narration client, pointed at OpenRouter base URL
# web app
pnpm add react react-dom recharts && pnpm add -D vite @vitejs/plugin-react

# 3. record live data (run during the free window, before Jul 19)
pnpm tsx scripts/record-live.ts --fixture <id> --out data/

# 4. replay + backtest offline
pnpm tsx scripts/backtest.ts --match data/<file>.jsonl

# 5. run the full agent + API + dashboard
pnpm --filter server dev      # Fastify API on :8080
pnpm --filter web dev         # React dashboard on :5173
```

### Key dependencies
| Package | Why |
|---|---|
| `@solana/web3.js`, `@coral-xyz/anchor` | devnet calls, `validateStat .view()`, PDA derivation, Memo anchoring |
| `tweetnacl`, `bs58` | `nacl.sign.detached` for token activation signature |
| `eventsource` / `undici` | SSE odds+scores streams; HTTP fetch |
| `fastify`, `zod` | API server + runtime schema validation of `OddsPayload` |
| `recharts` (or d3) | market-topology viz, CLV curve |
| `vitest` | deterministic unit tests (math + replay) |

### Environment (`.env`)
```ini
TXLINE_BASE=https://txline.txodds.com
TXLINE_DEV_BASE=https://txline-dev.txodds.com
SOLANA_CLUSTER=devnet
SOLANA_RPC=https://api.devnet.solana.com
WALLET_SECRET=<base58 devnet keypair>
SERVICE_LEVEL_ID=1            # WC free tier (1 = 60s delay, 12 = real-time)
DURATION_WEEKS=4
SELECTED_LEAGUES=worldcup
TXLINE_JWT=                   # filled at runtime by ingest auth
TXLINE_API_TOKEN=            # filled after activation
# Narration (OpenRouter → Gemini)
OPENROUTER_API_KEY=
OPENROUTER_BASE=https://openrouter.ai/api/v1
NARRATION_MODEL=google/gemini-2.5-flash
```

`prover`/`server` instantiate the narration client as `new OpenAI({ apiKey: OPENROUTER_API_KEY, baseURL: OPENROUTER_BASE })` and call `chat.completions.create({ model: NARRATION_MODEL, ... })`. Narration is best-effort: if it fails, the ledger/decision still stands (the rationale is cosmetic).

### Tunable strategy config (`config/strategy.json`)
| Param | Meaning | Default |
|---|---|---|
| `steamThreshold` (`θ`) | min demargined-`Pct` shift to flag steam | `1.5` (pp) |
| `steamWindow` (`w`) | window for the shift | `120s` |
| `leadLagWindow` | cross-correlation lookback | `300s` |
| `minLeaderCorr` | min lagged corr to name a leader book | `0.6` |
| `maxStake` / `maxConcurrent` | risk limits | `100` / `5` |
| `maxMarketExposure` | per-market cap | `250` |
| `replaySpeed` | virtual-clock multiplier for demo | `30x` |

---

## 10. Deployment topology & AI usage

### Deployment (three tiers, deployed independently)
| Tier | Target | Notes |
|---|---|---|
| Backend — `apps/server` (Fastify API + **agent loop** + SQLite + Solana devnet) | **Railway / Render / Fly.io** | Stateful, long-running process — holds SSE streams, in-memory time series, SQLite. **Not serverless.** |
| Frontend — `apps/web` (React + Three.js dashboard) | **Vercel / Netlify / Cloudflare Pages** | Static build; talks to backend over HTTPS/SSE |
| Chain — Solana **devnet** | already live | We anchor decision hashes + run `validateStat`; optional custom Anchor program is the only thing we'd `anchor deploy` |

Judges receive the deployed dashboard URL **and** the backend API/devnet endpoint — both submission-access options covered.

### AI / LLM usage — deterministic core, optional narration layer
- **The decision engine is deterministic code, not an LLM.** Demargining, steam-origination lead-lag, CLV/Brier — reproducible and defensible, exactly what the rubric rewards. "Autonomous agent" = runs without human intervention, **not** LLM-driven. An LLM in the trade path would undermine determinism and is deliberately excluded.
- **Optional LLM narration layer (outside the Sense→Act→Prove path):** turn structured decision records into human-readable rationales for the dashboard/demo, and generate match-narrative summaries. Reads from the SQLite ledger, writes explanation text back — never influences a trade.
- **Provider: OpenRouter → Gemini.** Use OpenRouter's OpenAI-compatible API (`https://openrouter.ai/api/v1`) with a Gemini model (e.g. `google/gemini-2.5-flash` — cheap and fast for bulk narration; configurable via env). Chosen for cost + existing API key. Called via the `openai` SDK pointed at the OpenRouter base URL. No LLM call is ever on the critical decision path, so the narration provider is fully swappable.

---

## 11. Frontend design system & UI direction

The demo is judged on video, so the dashboard must look **clean, confident, and presentable** — not a dense terminal. Direction: **dark-first, minimal, "Vault/Robinhood"-style** (whitespace + clear typography over data density), with the **3D market-topology visualization as the hero**.

### Design tokens (research-grounded)
| Token | Choice | Rationale |
|---|---|---|
| Background | Dark **gray**, not pure black (`#0E1116`-ish) | Reduces eye strain / halation; pure black is too harsh |
| Text | **Off-white**, not pure white (`#E8EAED`) | Comfort on dark; medium/semibold weights (thin fonts fade) |
| Accents | 3–4 **muted** accents for structure | More than that overwhelms |
| Semantic | **green = +CLV, red = −CLV, amber = steam/alert** | Color conveys meaning instantly |
| Numerics | **Monospace** (e.g. JetBrains Mono) for prices/CLV/odds | Scannable, aligned columns |
| Layout | Generous whitespace, **card/panel grouping**, lead with **big KPI numbers + context** ("vs close", "Brier 0.18") | Confidence + scannability |
| Charts | **Line/area** for probability over time; topology graph for price discovery | Match chart to message |
| A11y | WCAG **4.5:1** contrast, colorblind-safe palette | Non-negotiable polish |

### Tooling & installed-skill mapping
| Layer | Tool / installed skill |
|---|---|
| App shell | React + **Vite** + **Tailwind** |
| Design principles | `meta-skills:modern-web-design` (hierarchy, micro-interactions, a11y) |
| **Hero: market-topology 3D viz** | `react-three-fiber` + `threejs-webgl` — per-book probability nodes, the price-discovery **leader** node lighting up, steam propagating across books |
| 2D charts | `recharts` (or visx) for the CLV curve + probability lines |
| Motion / transitions | `core-3d-animation:gsap-scrolltrigger` + `core-3d-animation:motion-framer` for scrubbing, reveals, micro-interactions |
| Prebuilt animated UI | `animation-components:animated-component-libraries` (Magic UI / React Bits) for KPI cards, number tickers, badges — accelerates a polished look |
| Optional accents | `extended-3d-scroll:lightweight-3d-effects`, `lottie-animations` for loaders/empty states |

### Build approach (Phase 4)
1. External UI research (done — references below) → distil into a small **`design-tokens.ts`** + Tailwind theme.
2. Build the shell: top KPI row (cumulative CLV, Brier, verified-on-chain count), left positions/ledger panel, center hero topology viz, right "Verify on Solana" panel.
3. Wire live/replay data; add motion last (reveals on signal fire, leader-node pulse on steam, tx-hash confirm animation).
4. Keep it **legible over flashy** — animation serves comprehension (showing steam propagate, consensus converge), never decoration for its own sake.

**Design references:** [Dark-mode dashboard principles (Qodequay)](https://www.qodequay.com/dark-mode-dashboards) · [Dashboard best practices (Justinmind)](https://www.justinmind.com/ui-design/dashboard-design-best-practices-ux) · [2026 dashboard inspiration (Muzli)](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/) · [Fintech dashboard templates (AdminLTE)](https://adminlte.io/blog/fintech-banking-dashboard-templates/) · [Stock-market dashboards (TailAdmin)](https://tailadmin.com/blog/stock-market-dashboard-templates)

---

## 12. Definition of done
A judge can: open our deployed dashboard, watch the agent autonomously trade a replayed World Cup match, click **Verify on Solana** on any decision, and independently confirm — against a Merkle root anchored on Solana — both the odds tick the agent acted on and the closing line it was graded against. The cumulative CLV/Brier reputation is therefore **impossible to fake**.
