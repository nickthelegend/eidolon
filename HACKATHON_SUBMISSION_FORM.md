# Eidolon: Total Recall submission form

Event: Total Recall, Tatum × Walrus Memory (https://recall-tatum-walrus.vercel.app). Deadline Nov 10 2026, 17:00 UTC (22:30 IST).

Fields marked **Nick fills** need an account value or a decision only Nick has. Fields marked **PENDING** describe work that isn't done yet. Update them after the mainnet run, and don't submit them as done before that.

## Project name

Eidolon

## Track

01 Markets & Sports Prediction

## One-liner

Bet whether Bitcoin goes up or down in the next minute against a ghost of yourself: it learns how you trade and always takes the other side.

## Description

Most short-term traders lose to the same opponent: their own habits. They pick the same side, bet the same size and chase the same strikes, round after round. Eidolon makes that opponent visible.

Eidolon is a duel on DeepBook Predict, the BTC up/down prediction market on Sui mainnet. You pick a 1-minute or 5-minute market, a strike and a side. Your ghost, built from your own trade history, takes the opposite side. Its size comes from your record: it matches your average size and bets bigger when your hit rate is below 50%. It places its bet at the nearest strike that Predict's 15–50% entry band admits, and it never moves silently to another strike: when the mirror bet can't be placed, the arena says so.

The ghost's memory is meant to live in Walrus Memory. After each verified payout, Eidolon writes the round (side, strike, size, premium, market context, hit or miss, P&L, fill digest) to a per-player Walrus Memory namespace. On the next round it recalls the closest past rounds for the same situation (cadence, minute move, strike distance, hour) and rebuilds the ghost from them. Round 1 has no ghost, because there is nothing to recall yet. An optional LLM writes one taunt line from the recalled facts. The deterministic policy decides the bet, and the LLM can't change it.

What works today, with no keys: live markets, quotes and mainnet dry-runs; a settled-trade history for any Sui address, rebuilt from mainnet events with payout math checked against the settled market; and a history-built ghost, labelled "Not on Walrus yet". The wallet-signed write path (`/fund`, `/plan`, `/execute`, `/rounds`) was rehearsed on a local fork of Sui mainnet. **PENDING:** Walrus Memory writes on mainnet and the first real signed round (see Status below).

## How it uses Walrus Memory

- SDK: `@mysten-incubation/memwal`, mainnet relayer `https://relayer.memory.walrus.xyz`, one namespace per player (`eidolon-v1:<address>`).
- **Write:** `rememberAndWait` stores one `TradeMemory` per settled round, but only after the payout event is reconciled. Every fifth round adds a short `analysis` memory ("Last 5 trades: UP n, wins m"). `POST /history/:address/remember` can also import a wallet's earlier settled Predict trades as memories.
- **Recall:** `recall` (semantic, top 40) with a query built from the live market context. `habitProfile` keeps the recalled rounds that match the cadence, minute direction, strike distance within 20 USD and hour within 3, then `ghostDecision` sets the opposite side and the size.
- **What changes because of memory:** the ghost's existence, side, size and taunt. With no memories there is no ghost. On mainnet, `/execute` refuses live trading until Walrus Memory is configured.
- **Status: PENDING.** 0 memories are on mainnet today, and the event requires at least 10. Unblocked by `MEMWAL_MAINNET_ACCOUNT_ID` and `MEMWAL_MAINNET_KEY`. After the mainnet run, the blob IDs go in the README Proof table.

## How it uses Tatum

- With `TATUM_API_KEY`, every chain read and every transaction goes through Tatum's native Sui gRPC gateway (`sui-mainnet-grpc.gateway.tatum.io:443`): markets, pool, pricer, objects, transactions, dry-runs and sends. Sui JSON-RPC is deprecated, and Tatum's former JSON-RPC endpoint returns 404.
- Tatum's gateway refuses `LedgerService/ListEvents`, so event scans (history, the order and settlement watchers) use the public Sui fullnode over gRPC. The API labels them as such.
- The free plan's rate limit (3 requests a second) returned HTTP 429 in bursts, so a process-wide throttle spaces calls 400 ms apart and retries a 429 with backoff.
- Measured (TESTING.md, Nov 9): through Tatum, `/status` (`rpc: "Tatum"`), the market list and `getTransaction` on a known fill passed. `SimulateTransaction` hit 429 before the throttle was added. A Tatum dry-run hasn't been re-recorded since then: **PENDING**.
- Without a key, the app reads through the public fullnode and labels every response **dev RPC (not Tatum)**.

## Tech stack

- TypeScript, Node 22, pnpm workspace: `packages/core` (Predict client, history importer, memory encoding, ghost policy), `packages/server` (HTTP API and settlement watcher), `packages/web` (React and Vite arena), `packages/cli`.
- Sui: `@mysten/sui` gRPC client, `@mysten/deepbook-v3` (DeepBook Predict), `@mysten/dapp-kit-react` and Wallet Standard for signing.
- Walrus Memory: `@mysten-incubation/memwal`.
- Tatum Sui gRPC gateway via `@grpc/grpc-js` and `@protobuf-ts/grpc-transport`.
- Optional taunt line: OpenRouter, default `nvidia/nemotron-3-ultra-550b-a55b:free`.
- Tests: 10 tests in `pnpm test`, including three real mainnet reconstruction fixtures, plus a live test (`pnpm test:live`) against mainnet with no mocked chain client.

## Repo link

`https://github.com/nickthelegend/eidolon`: placeholder. **PENDING**: the repo isn't public yet. Nick must say yes before it's made public, and the event requires a public repo.

## Demo video

`videos/eidolon/eidolon-film-v2.mp4`: not public yet. **Nick fills** the public link after upload. The film shows real mainnet reads and dry-runs of a public address, with nothing signed, and says so on screen. A version showing a live signed round and Walrus memories is **PENDING** on the mainnet run.

## Blog post

[docs/BLOG.md](docs/BLOG.md). **Nick fills** the URL of the published copy (the event requires a published post).

## Social post (bonus)

Drafts are in [POST.md](POST.md). **Nick fills** the X or LinkedIn link after posting.

## Tatum account ID

`<TATUM_ACCOUNT_ID>`: **Nick fills.**

## MEMWAL_AGENT_ID

`<MEMWAL_AGENT_ID>`: **Nick fills** once the Walrus Memory mainnet account exists. Check the form's wording for which Walrus Memory ID it means; the app itself reads `MEMWAL_MAINNET_ACCOUNT_ID`.

## Team

Solo: Nivesh Gajengi (Nick), GitHub `nickthelegend`.

## AI and tool disclosure

- **Claude** (Anthropic): code, UI, docs, review and these submission texts.
- **Codex** (OpenAI): code.
- **ChatGPT image generation**: all product art (prompts in [docs/ART.md](docs/ART.md)).
- **Chatterbox**: synthetic voice-over for the film.
- **In the product**: an optional OpenRouter LLM writes the ghost's taunt line from recalled facts only. It can't change any bet.

## Status at submission time

| Requirement | State |
| --- | --- |
| Walrus Memory integrated | Code complete; refuses with "Setup required" without keys |
| Writing on mainnet, at least 10 memories | **PENDING**: 0 today. Needs `MEMWAL_MAINNET_ACCOUNT_ID` and `MEMWAL_MAINNET_KEY`, then the import and live rounds |
| Tatum RPC for on-chain data | Live for reads and transactions with `TATUM_API_KEY`; events go through the public fullnode (Tatum blocks `ListEvents`) |
| Published blog post | Draft in docs/BLOG.md; publishing is **PENDING** |
| Working demo | Read-only mainnet demo works; a signed mainnet round is **PENDING** (rehearsed on a local fork only) |
| Public repo | **PENDING**: Nick's yes |
