# Eidolon

**Bet whether Bitcoin goes up or down in the next minute, against a ghost of yourself.** The ghost studies how you trade (which side you pick, how much you bet, how often you win) and always takes the other side. If you beat it, you've beaten your own habits.

Total Recall hackathon (Tatum × Walrus Memory), track 01 Markets & Sports Prediction. The market is DeepBook Predict on Sui mainnet. Chain data comes through Tatum's Sui gRPC gateway, and the ghost's memory lives in Walrus Memory. **Walrus Memory is live on mainnet: 31 memories are stored** (see [Proof](#proof)). A funded player round on mainnet is still PENDING (see [Status](#status-what-is-live-today-vs-pending-keys)).

Trade a live DeepBook Predict BTC market against a ghost built from your own Walrus Memory trade history. The first round has no ghost: there is no prior trade memory to recall. After a verified payout, Eidolon writes the round to Walrus; later rounds recall those blobs and compute an opposite bet and size from the recalled history. The LLM can narrate a decision but cannot change it.

## Try it

1. `pnpm install && pnpm build && pnpm dev`, then open http://localhost:5173. No keys are needed for this read-only path.
2. Open `http://localhost:5173/?as=0x7c9250467b7d7cc0aa2a9e76d06e9e8af313afa22285f1a3c314d749617b486e`, a public mainnet Predict trader whose owner is unknown (more in [docs/DEMO-ADDRESSES.md](docs/DEMO-ADDRESSES.md)). The page is read-only: signing controls are hidden.
3. **Your trading history** loads that address's settled Predict trades from mainnet. Each has its order, fill and payout digest.
4. **Your ghost** shows the ghost built from that history: the share of UP bets and hit rate it read, the opposite side, its size and its counter-strike. Without Walrus Memory keys (the path in step 1) it is labelled **Not on Walrus yet**. That label means memory is not configured on this server. It does not mean the address has no memories.
5. Pick a live BTC market and a strike, then dry-run a bet. The quote, the 0.02 USDC fee and the expected payout come from Predict's on-chain pricer, and the simulation runs on mainnet without sending anything.
6. To trade for real, set the keys in [BLOCKED.md](BLOCKED.md) and the steps in `MAINNET-RUNBOOK.md`. Without them the app says **Setup required** and never pretends.

## Proof

Only real evidence is listed. Eidolon deploys no contract of its own; it trades DeepBook Predict's mainnet packages.

**Sui mainnet (reads and dry-runs, nothing signed or sent)**, from [TESTING.md](TESTING.md), Nov 9 2026:

| What | Result | Path |
| --- | --- | --- |
| Active BTC markets and pool | 4 markets; pool 9,166.97 USDC at the sample read | public fullnode (dev RPC) |
| Quote for a 2 USDC budget | 4.57 USDC payout, 0.02 USDC fee | public fullnode (dev RPC) |
| Enqueue dry-run for funded address `0x4ed0d81b…e528` | Simulation succeeded, 3 events | public fullnode (dev RPC) |
| History rebuild of `0x7c925046…486e` | 4 settled trades, each with enqueue, fill and payout digests, payouts checked against the settled market | public fullnode |
| Example public fills read by Eidolon (other people's trades) | `GVwMyPLY8kFGz6oUmmTVmuA3b3VCgrXcpGLbNGPxmYVC`, `BqKVz6C7y8WNWAcRnRyUMAPfvtuYvvHb84vssqqAiduG`, `2v8k4Tnxvk36zCKysoyAdfn36EhZdDAPo4RexLKSdDtB` | public fullnode |
| Tatum gateway `/status`, market list, `getTransaction` | Passed: `rpc: "Tatum"`, 4 markets, 3 events on a known fill | Tatum gRPC |
| Tatum `SimulateTransaction` | HTTP 429 in bursts on the free plan; a 400 ms throttle with retry was added in `0ff816e`. A Tatum dry-run has not been re-recorded since | Tatum gRPC |
| Tatum `ListEvents` | Refused by the gateway ("method not allowed"), so event scans use the public fullnode | public fullnode |
| `POST /history/:address/remember` without keys | Refused: `Setup required: MEMWAL_MAINNET_KEY` | n/a |
| Walrus Memory blobs on mainnet | **31**, in namespace `eidolon-v1:0x96ed1d73…2ccd2`. Details in the Walrus table below | Walrus mainnet relayer |

**Walrus Memory on mainnet**, Nov 9 2026. All 31 blob IDs are in [docs/walrus-mainnet-2026-11-09.json](docs/walrus-mainnet-2026-11-09.json). Walrus blob IDs have no Suiscan link, so they are listed as IDs.

| What | Result |
| --- | --- |
| Account ID (public, on chain) | `0xd2ca3cbe1bd663a5fe7df7c14590451bbc712255cfee59966b0b8413cdaa335a`, owner `0x0cff6ac3b0396c3b449de58472dcf9cfd55f0bb2aefaca92c43315de128c7e93` |
| How the account was found | On chain, not from a dashboard. The relayer's `GET /config` gives package `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5`. Its `account::DelegateKeyAdded` events list Eidolon's delegate key (label "2") under that account |
| Delegate key | Eidolon signs with its own delegate key. `POST /api/stats` on the mainnet relayer returned the owner above |
| Memories stored | 31 (31 unique blobs) |
| Namespace | `eidolon-v1:0x96ed1d73783b195ea2b9bcf9447c9a871b326ea41271f9dd3113b4dee62eccd2`, a public mainnet Predict trader whose owner is unknown, found as one of the most active traders in recent `OrderEnqueued` events |
| Writes | 1 test write at 15:3x UTC, then 30 settled trades through `POST /history/:address/remember` from 15:38:21 to 15:40:38 UTC |
| First blob (the test write) | `PJQ_DMK9MAlBM82wpPLkVTehX5nM8ne63HARgsKnw9o` |
| Last blob (last ID the import returned) | `uCjfjS6H3W8sm9oU3LWOCyDw06Oga6ltatrdt9r8UQ4` |
| Recall | `GET /ghost/0x96ed1d73…2ccd2` returned 31 hits (31 unique blobs). Profile: 32% UP bets, 81% hit rate, average size 4.84 USDC |
| Chain reads | Through Tatum (`/status` returned `rpc: "Tatum"`) |

Mainnet blobs took over 60 s to certify, so each write now waits up to 300 s (`afb613b`). History goes in through `rememberBulkAndWait` in chunks of 20 (`0a2316f`). History import moves no funds, so it no longer needs the USDC gate (`4bfe136`).

**LOCAL FORK of Sui mainnet only (checkpoint 343353046, fork-only keys, no real funds).** These digests exist only on a local fork and are **not on Suiscan or mainnet**. Full table in [docs/FORK.md](docs/FORK.md).

| Step on the fork | Fork-only digest |
| --- | --- |
| Player `/fund`: create a Predict account and deposit 3 USDC | `4yoWSWZAhDfaWG8K1EKgMbFoq7MLdMpvg19hu3ib5RKJ` |
| Player `/plan` UP for 2 USDC (potential payout 4.64), then `/execute`; `/rounds` read it back | `J2tvgGYJPNoqDUEj8cR1aQAbZASHiA1UzUaKPT7ryTsY` |
| Ghost wallet `/plan` DOWN for 2 USDC, then `/execute` | `7RobjWm2CKquJ8LRVWXS7w4vA6AF2GNi85MjAKqMgDMc` |

The fork has no Predict keeper and a frozen clock, so it shows no fill, no settlement, no automatic ghost placement and no Walrus write.

## Status: what is live today vs pending keys

| Piece | Today |
| --- | --- |
| Live Predict markets, quotes, entry-band checks, mainnet dry-runs | **Live** (read-only) |
| Settled-trade history for any address, with payout math checked | **Live** (read-only) |
| History-built ghost (side, size, counter-strike), shown when Walrus Memory is not configured and labelled "Not on Walrus yet" | **Live** (read-only) |
| Reads through Tatum's Sui gRPC gateway | **Live** when `TATUM_API_KEY` is set. Event scans use the public fullnode because Tatum blocks `ListEvents` |
| Wallet signing, `/execute`, round registration | Proven on a **local fork only**. No signed round on mainnet yet |
| Walrus Memory writes and recall on mainnet | **Live**: 31 memories (the event requires at least 10), recalled through `GET /ghost/:address`. See [Proof](#proof) |
| Ghost panel in the web app with Walrus configured | Shows the ghost of the player's latest registered round on this server, or **No memories of you yet** before the first one. It does not list memories imported from history yet; those are read through `GET /ghost/:address` |
| Ghost placed automatically against a player round | **PENDING**: needs hub funding for the ghost wallet `0x5b68d119…2d09` and a player fill on mainnet |
| Funded player round on mainnet | **PENDING**: the demo signer `0x088c7e04…7544` is unfunded until hub funding |
| Fill, settlement and payout reconciliation of an Eidolon round | **PENDING**: needs the first funded mainnet round |

The Walrus blob IDs are in [Proof](#proof). After the funded mainnet run (one player round, then a second round with the ghost), this section will list its Suiscan links. Until then, nothing here claims an Eidolon trade.

Mainnet gRPC reads and a real enqueue simulation pass with the public development endpoint. The Tatum gRPC smoke check is recorded in [TESTING.md](TESTING.md). Walrus writes and recall ran on mainnet (see [Proof](#proof)). Wallet signing on mainnet, a real mint, ghost execution, and payout event reconciliation have not been exercised on mainnet.

## Film

`videos/eidolon/eidolon-film-v2.mp4` (not public yet; the link goes here once it's uploaded). It shows real mainnet reads and dry-runs of a public address, with nothing signed, and says so on screen.

## Run

Node 22 or later and pnpm 10 are required.

```sh
pnpm install
pnpm build
pnpm test
pnpm test:live
pnpm dev
```

Open http://localhost:5173. The server runs at http://localhost:8787. Without `.env`, it reads Sui mainnet through the public gRPC fullnode and labels every response **dev RPC (not Tatum)**. With `TATUM_API_KEY`, it uses Tatum's native Sui gRPC gateway (`sui-mainnet-grpc.gateway.tatum.io:443`). Sui JSON-RPC is deprecated, and Tatum's former JSON-RPC endpoint returns 404. `EIDOLON_DEV_SUI_RPC` accepts a Sui mainnet gRPC-web URL and defaults to `https://fullnode.mainnet.sui.io:443`.

Set `EIDOLON_PORT` and `EIDOLON_WEB_PORT` to move the server and Vite ports together; Vite proxies `/api` to `EIDOLON_PORT`.

## Demo signer (recording only)

For the recorded headless mainnet demo, set `DEMO_SIGNER=I_UNDERSTAND_SERVER_HOLDS_KEYS` and put the Sui `suiprivkey…` string in `DEMO_PLAYER_KEY` in this repo's gitignored `.env`. The wallet picker then offers **Demo signer (server-held key)**. A persistent badge identifies the connected wallet as a server-held demo key using real mainnet funds.

This is a custodial demo wallet: the server holds its key, and the account is funded with a small amount from the hub. It is off by default. The server signs only its own prepared transaction bytes for that account within 60 seconds; `/execute` still requires the existing mainnet write gate and other live prerequisites. Never use the demo key as a personal wallet or expose this server to untrusted clients during recording.

The mainnet wallets exist: player (demo signer) `0x088c7e04318da7d802a208cc75bbaee9ea09cf7ca37a06168c2611dcfe067544` and ghost `0x5b68d1190169b40761cf6c33171e2c50f60849d173d72c86785c1d7eaba02d09`. Both are unfunded until the hub is funded (see [BLOCKED.md](BLOCKED.md)).

## View as

Open `?as=0x...` with a full 64-digit Sui address, or enter an address in the Arena while disconnected. The banner identifies the address and marks the view read-only. Quotes, ghost previews, enqueue simulations, and funding simulations use that address as the owner. Signing controls are hidden. If a wallet connects, its address takes precedence over the URL.

## History import

The **Your trading history** panel reads settled Predict trades for the connected or viewed address. `GET /history/:address` returns `{ trades, profile, decision }`; pass `marketId` and `side` query parameters for a deterministic decision based on the selected live market. The profile uses the same `habitProfile` function as the live ghost, and the preview uses the same `ghostDecision` policy. This preview is labelled **from on-chain history, not yet in Walrus memory**. When Walrus Memory is not configured, the **Your ghost** panel shows this history-built ghost too: its line states the trade count, UP share and hit rate it read, its side and size come from `ghostDecision`, and its strike is the counter-strike from the last quote. It is labelled **Not on Walrus yet** and never claims a memory. When Walrus Memory is configured, the panel shows the ghost of the player's latest registered round instead, or **No memories of you yet** before the first one. It does not list memories imported from history yet; `GET /ghost/:address` reads those back.

The importer matches `OrderEnqueued`, `QueuedOrderFilled`, `OrderMinted`, and `OpenRecordSettled` to the owner's Predict account wrapper. It verifies payout math against the settled market, computes P&L from the fill debit and payout, and leaves minute moves unknown. Strike distance uses the forward snapshot at enqueue. Raw chain responses are cached briefly under ignored `data/history/`. It reads up to 200 enqueues per call; incomplete or refunded records do not become trades. Public gRPC history can end at its oldest available checkpoint.

`POST /history/:address/remember` imports settled trades into Walrus Memory through the existing `TradeMemory` encoder and `rememberBulkAndWait`, in chunks of 20, the relayer's limit. Each write waits up to 300 s, because mainnet blobs took over 60 s to certify. It requires both `MEMWAL_MAINNET_KEY` and `MEMWAL_MAINNET_ACCOUNT_ID`. It moves no funds, so it does not need the `EIDOLON_ALLOW_MAINNET` USDC gate. The route returns Walrus blob IDs. In the web app, the history panel's button calls it: **Teach my ghost (write to Walrus)**, or **Remember this trader on Walrus** on read-only views. On Nov 9 it stored 30 settled trades of `0x96ed1d73…2ccd2` (see [Proof](#proof)). Public demonstration addresses and their chain evidence are in [docs/DEMO-ADDRESSES.md](docs/DEMO-ADDRESSES.md).

The Arena shows real active markets, the onchain forward, reference strike, and countdown. It suggests a strike inside the entry band using the Predict onchain pricer. Connect a Sui Wallet Standard wallet, dry-run a deposit to create and fund a Predict account, then dry-run a bet. The flat queued-order fee and expected payout come from `read.planMint`. A player bet is prepared by the server and signed by the wallet. The server executes only the exact prepared bytes and verifies the enqueue event before registering the round.

**Dry-run only by default.** To allow real USDC transactions, set `EIDOLON_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_USDC` along with Tatum, Walrus Memory, and ghost wallet credentials. Keep the ghost key on the server. A live player round requires a funded Predict account and SUI for gas. The ghost wallet needs its own funded Predict account; the policy enforces `EIDOLON_GHOST_MAX_USDC` and `EIDOLON_GHOST_DAILY_USDC` in the server ledger. Use a single persistent server instance for that daily cap.

The exact opposite side at the same strike can fail Predict's 0.15–0.5 entry band. The bet slip displays a separate mirror preflight, and the watcher reports a ghost refusal as such. Eidolon never silently moves the ghost to another strike. See [BLOCKED.md](BLOCKED.md) for the protocol decision needed to make a guaranteed two-sided round.

`GET /status`, `/markets`, `/rounds`, `/leaderboard`, `/ghost/:address`, and `/events` provide the UI data. `POST /fund` and `/plan` return a reviewed transaction and dry-run. `POST /execute` accepts a wallet signature only for a recently prepared transaction. `POST /rounds` registers a successful player enqueue receipt. Settlement uses the SDK's outcome and settlement reads, plus Tatum queue events and transaction blocks to verify fills and payouts before computing P&L or writing memory. `data/rounds.json` is the local durable registry. The public leaderboard covers registered rounds on this server; it is not a chain-wide index of all DeepBook users.

The CLI provides `pnpm --filter @eidolon/cli exec eidolon status`, `markets`, and `ghost <address>` after build. The ghost command reads Walrus recall; it does not use a local memory cache.

Protocol and SDK references: [DeepBook Predict](https://www.docs.sui.io/onchain-finance/deepbook/deepbook-predict), [Positions SDK](https://www.docs.sui.io/onchain-finance/deepbook/deepbook-predict-sdk/positions), [Sui RPC migration](https://docs.sui.io/references/sui-api), and [dApp Kit React](https://sdk.mystenlabs.com/dapp-kit/getting-started/react).

## AI and art disclosure

- **Code and docs:** written with AI coding agents. Claude (Anthropic) wrote and reviewed code, UI and docs; Codex (OpenAI) wrote code. Nick (Nivesh Gajengi) directed the build.
- **Art:** generated with ChatGPT (image generation), directed in [docs/ART.md](docs/ART.md); source PNGs stay out of git and the web app ships WebP copies in `packages/web/public/art/`. No real brands, people or other artists' work.
- **Film voice:** synthetic narration made with Chatterbox text-to-speech. The screen footage is the app's real output; badges, captions and zooms were added on top, and no program output was edited.
- **In the product:** an optional OpenRouter model (default `nvidia/nemotron-3-ultra-550b-a55b:free`) writes one taunt line from the ghost's recalled facts. It cannot change the ghost's side, size or strike; the deterministic policy decides those.

## License

MIT. Copyright (c) 2026 Nivesh Gajengi.
