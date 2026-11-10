# Eidolon: Total Recall submission form

Event: Total Recall, Tatum × Walrus Memory (https://recall-tatum-walrus.vercel.app). Deadline Nov 10 2026, 17:00 UTC (22:30 IST).

Fields marked **Nick fills** need an account value or a decision only Nick has. Fields marked **PENDING** describe work that isn't done yet. No Sui mainnet transaction with real funds has been made: the trading demos run on a **LOCAL FORK of Sui mainnet**, alongside real mainnet reads and real Walrus mainnet memories.

## Project name

Eidolon

## Track

01 Markets & Sports Prediction

## One-liner

Bet whether Bitcoin goes up or down in the next few minutes against a ghost of yourself: it is built from your Walrus memories, learns how you trade, and always takes the other side.

## Description

Most short-term traders lose to the same opponent: their own habits. They pick the same side, bet the same size and chase the same strikes, round after round. Eidolon makes that opponent visible.

Eidolon is a duel on DeepBook Predict, the BTC up/down prediction market on Sui mainnet. You pick a 1-minute or 5-minute market, a strike and a side. Your ghost, built from your own trade history, takes the opposite side. Its size comes from your record: it matches your average size and bets bigger when your hit rate is below 50%. It places its bet at the nearest strike that Predict's 15–50% entry band admits, and it never moves silently to another strike: when the mirror bet can't be placed, the arena says so.

The ghost's memory lives in Walrus Memory. After each verified payout, Eidolon writes the round (side, strike, size, premium, market context, hit or miss, P&L, fill digest) to a per-player Walrus Memory namespace. On the next round it recalls the closest past rounds for the same situation (cadence, minute move, strike distance, hour) and rebuilds the ghost from them. Round 1 has no ghost, because there is nothing to recall yet.

In haunt mode the ghost trades every 5-minute round on its own. The app shows "Next round in…", its running record and a notification when it analyses, places, answers or settles. A Claude Haiku analyst (`claude-haiku-5-5`) explains each round in plain words, recaps it after settlement and writes the duel reply. The deterministic rules still pick the side and size before Claude runs, and each text is generated once and cached.

**Status today:**
- **Live at https://eidolon.201-18-198-162.sslip.io (dry-run):** live markets, quotes and dry-runs through Tatum (`/status` → `rpc: "Tatum"`, `mainnetWrites: false`), Walrus mainnet recall, and haunt mode in dry-run, whose rounds settle as "would have won/lost (not placed)".
- **Walrus Memory on mainnet: 113 memories** across 4 public-trader namespaces.
- **On a LOCAL FORK of Sui mainnet only** (no real funds): a signed player order, the ghost's automatic answer from its own wallet, and a haunt round with all its steps.
- **PENDING:** any Eidolon round on mainnet with real funds. None has been sent.

## How it uses Walrus Memory

- SDK: `@mysten-incubation/memwal`, mainnet relayer `https://relayer.memory.walrus.xyz`, one namespace per player (`eidolon-v1:<address>`).
- **Write:** `rememberAndWait` stores one `TradeMemory` per settled round, but only after the payout event is reconciled. Every fifth round adds a short `analysis` memory ("Last 5 trades: UP n, wins m"). `POST /history/:address/remember` can also import a wallet's earlier settled Predict trades as memories, through `rememberBulkAndWait` in chunks of 20. It moves no funds, so it needs only the Walrus keys, not the USDC gate. Mainnet blobs took over 60 s to certify, so each write waits up to 300 s.
- **Recall:** `recall` (semantic, top 40) with a query built from the live market context. `habitProfile` keeps the recalled rounds that match the cadence, minute direction, strike distance within 20 USD and hour within 3, then `ghostDecision` sets the opposite side and the size.
- **What changes because of memory:** the ghost's existence, side and size, and what the Claude Haiku analyst says about the round. With no memories there is no ghost. On mainnet, `/execute` refuses live trading until Walrus Memory is configured.
- **Status: LIVE, 113 memories on Walrus mainnet across 4 public-trader namespaces** (31, 21, 54 and 7; 31 in the main one below) (the event requires at least 10). Namespace `eidolon-v1:0x96ed1d73783b195ea2b9bcf9447c9a871b326ea41271f9dd3113b4dee62eccd2`, a public mainnet Predict trader whose owner is unknown. 1 test write, then 30 settled trades from 15:38:21 to 15:40:38 UTC on Nov 9. `GET /ghost/<address>` recalled all 31 (31 unique blobs): 32% UP bets, 81% hit rate, average size 4.84 USDC. Blob IDs are in the README Proof table and `docs/walrus-mainnet-2026-11-09.json`.
- **Web UI today:** with Walrus configured, the ghost's profile and decision come from the address's memories recalled from Walrus. For the namespace above the panel says "I recalled 31 of your trades from Walrus Memory: 32% UP, 81% hit rate…" and links the recalled blobs on Walruscan. "Not on Walrus yet" shows only when the address has no memories, or when recall fails (with the error). The remember button also works on read-only public-trader views.
- **Public read:** a stored blob is readable from the public mainnet aggregator. `https://aggregator.walrus-mainnet.walrus.space/v1/blobs/PJQ_DMK9MAlBM82wpPLkVTehX5nM8ne63HARgsKnw9o` returned HTTP 200, 1101 bytes.

## How it uses Tatum

- With `TATUM_API_KEY`, every chain read and every transaction goes through Tatum's native Sui gRPC gateway (`sui-mainnet-grpc.gateway.tatum.io:443`): markets, pool, pricer, objects, transactions, dry-runs and sends. Sui JSON-RPC is deprecated, and Tatum's former JSON-RPC endpoint returns 404.
- Tatum's gateway refuses `LedgerService/ListEvents`, so event scans (history, the order and settlement watchers) use the public Sui fullnode over gRPC. The API labels them as such.
- The free plan's rate limit (3 requests a second) returned HTTP 429 in bursts, so a process-wide throttle spaces calls 400 ms apart and retries a 429 with backoff.
- Measured (TESTING.md, Nov 9): through Tatum, `/status` (`rpc: "Tatum"`), the market list and `getTransaction` on a known fill passed. `SimulateTransaction` hit 429 before the throttle was added. A Tatum dry-run hasn't been re-recorded in TESTING.md since then: **PENDING**.
- Hosted (Nov 10, 14:20 UTC): `/status` on https://eidolon.201-18-198-162.sslip.io answers `rpc: "Tatum"`, `chainError: null`, `mainnetWrites: false`.
- Without a key, the app reads through the public fullnode and labels every response **dev RPC (not Tatum)**.

## Tech stack

- TypeScript, Node 22, pnpm workspace: `packages/core` (Predict client, history importer, memory encoding, ghost policy), `packages/server` (HTTP API and settlement watcher), `packages/web` (React and Vite arena), `packages/cli`.
- Sui: `@mysten/sui` gRPC client, `@mysten/deepbook-v3` (DeepBook Predict), `@mysten/dapp-kit-react` and Wallet Standard for signing.
- Walrus Memory: `@mysten-incubation/memwal`.
- Tatum Sui gRPC gateway via `@grpc/grpc-js` and `@protobuf-ts/grpc-transport`.
- Analyst: Claude Haiku (`claude-haiku-5-5`, Anthropic) explains, recaps and writes the duel reply (`packages/server/src/analyst.ts`); a missing `ANTHROPIC_API_KEY` shows "Setup required".
- Optional taunt line: OpenRouter, default `nvidia/nemotron-3-ultra-550b-a55b:free` (not configured on the hosted server).
- Deploy: Docker image behind nginx and Traefik on a VPS, dry-run flags forced off.
- Tests: 12 passing in `pnpm test` (core 10, including three real mainnet reconstruction fixtures; server 2; run Nov 10), plus a live test (`pnpm test:live`) against mainnet with no mocked chain client.

## Repo link

https://github.com/nickthelegend/eidolon (secret scan passed Nov 10; Nick approved making it public. **Still private as of Nov 10, 14:20 UTC**: flip to public before submitting).

## Demo video

`videos/eidolon/round4/eidolon-round4.mp4` (3:18). Link: **Nick fills** (Drive). It shows real mainnet reads through Tatum, a public trader's real Walrus memories, and the duel, the ghost's answer and a haunt round on a LOCAL FORK of Sui mainnet, badged on every scene. Nothing is signed on mainnet.

## Blog post

https://github.com/nickthelegend/eidolon/blob/main/docs/BLOG.md

## Social post (bonus)

Drafts are in [POST.md](POST.md). **Nick fills** the X or LinkedIn link after posting.

## Tatum account ID

`6af1b0a07614eea902da0ee6` (Nick's Tatum account, given Nov 10).

## MEMWAL_AGENT_ID

`0xd2ca3cbe1bd663a5fe7df7c14590451bbc712255cfee59966b0b8413cdaa335a`

This is the Walrus Memory account ID. The code reads it as `MEMWAL_MAINNET_ACCOUNT_ID`. It is public and on chain: the relayer's `GET /config` gives package `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5`, and its `account::DelegateKeyAdded` events list Eidolon's delegate key (label "2") under this account. The owner is `0x0cff6ac3b0396c3b449de58472dcf9cfd55f0bb2aefaca92c43315de128c7e93`. One account serves Eidolon, Yojimbo and Nakama, and each app signs with its own delegate key.

## Team

Solo: Nivesh Gajengi (Nick), GitHub `nickthelegend`.

## AI and tool disclosure

- **Claude** (Anthropic): code, UI, docs, review and these submission texts.
- **Codex** (OpenAI): code.
- **ChatGPT image generation**: all product art (prompts in [docs/ART.md](docs/ART.md)).
- **Chatterbox**: synthetic voice-over for the film.
- **In the product**: Claude Haiku (`claude-haiku-5-5`) explains each ghost round, recaps it and writes the duel reply; an optional OpenRouter LLM writes a taunt line from recalled facts. Neither can change any bet: the deterministic policy decides side, size and strike first.

## Status at submission time

| Requirement | State |
| --- | --- |
| Walrus Memory integrated | Live on mainnet with Eidolon's own delegate key; refuses with "Setup required" without keys |
| Writing on mainnet, at least 10 memories | **Done**: 113 memories on Walrus mainnet across 4 public-trader namespaces (31 in the main one), recalled through `GET /history/:address` and `GET /ghost/:address` |
| Tatum RPC for on-chain data | Live for reads and transactions with `TATUM_API_KEY`; events go through the public fullnode (Tatum blocks `ListEvents`) |
| Published blog post | https://github.com/nickthelegend/eidolon/blob/main/docs/BLOG.md |
| Working demo | **Live (dry-run)** at https://eidolon.201-18-198-162.sslip.io: mainnet reads through Tatum, Walrus recall, haunt mode in dry-run, Claude Haiku analyst. Signed rounds and automatic ghost placement ran on a **LOCAL FORK only**; a mainnet round with real funds is **PENDING** |
| Public repo | **PENDING**: private as of Nov 10, 14:20 UTC; Nick flips it to public |
