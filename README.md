# Eidolon

Trade a live DeepBook Predict BTC market against a ghost built from your own Walrus Memory trade history. The first round has no ghost: there is no prior trade memory to recall. After a verified payout, Eidolon writes the round to Walrus; later rounds recall those blobs and compute an opposite bet and size from the recalled history. The LLM can narrate a decision but cannot change it.

## Run

Node 22 or later and pnpm 10 are required.

```sh
pnpm install
pnpm build
pnpm test
pnpm test:live
pnpm dev
```

Open http://localhost:5173. The server runs at http://localhost:8787. Without `.env`, it reads Sui mainnet through the public gRPC fullnode and labels every response **dev RPC (not Tatum)**. The production path uses the Tatum JSON-RPC endpoint when `TATUM_API_KEY` is set. Sui disabled JSON-RPC on its public fullnode, so `https://fullnode.mainnet.sui.io` cannot be used as a JSON-RPC development endpoint. `EIDOLON_DEV_SUI_RPC` accepts a Sui mainnet gRPC URL and defaults to `https://fullnode.mainnet.sui.io:443`.

Set `EIDOLON_PORT` and `EIDOLON_WEB_PORT` to move the server and Vite ports together; Vite proxies `/api` to `EIDOLON_PORT`.

## View as

Open `?as=0x...` with a full 64-digit Sui address, or enter an address in the Arena while disconnected. The banner identifies the address and marks the view read-only. Quotes, ghost previews, enqueue simulations, and funding simulations use that address as the owner. Signing controls are hidden. If a wallet connects, its address takes precedence over the URL.

## History import

The **Your trading history** panel reads settled Predict trades for the connected or viewed address. `GET /history/:address` returns `{ trades, profile, decision }`; pass `marketId` and `side` query parameters for a deterministic decision based on the selected live market. The profile uses the same `habitProfile` function as the live ghost, and the preview uses the same `ghostDecision` policy. This preview is labelled **from on-chain history, not yet in Walrus memory**.

The importer matches `OrderEnqueued`, `QueuedOrderFilled`, `OrderMinted`, and `OpenRecordSettled` to the owner's Predict account wrapper. It verifies payout math against the settled market, computes P&L from the fill debit and payout, and leaves minute moves unknown. Strike distance uses the forward snapshot at enqueue. Raw chain responses are cached briefly under ignored `data/history/`. It reads up to 200 enqueues per call; incomplete or refunded records do not become trades. Public gRPC history can end at its oldest available checkpoint.

`POST /history/:address/remember` imports settled trades into Walrus Memory through the existing `TradeMemory` encoder and `memoryFor(...).remember`, pacing writes. It requires both `MEMWAL_MAINNET_KEY` and `MEMWAL_MAINNET_ACCOUNT_ID` and the explicit `EIDOLON_ALLOW_MAINNET` write gate. The route returns Walrus blob IDs. Public demonstration addresses and their chain evidence are in [docs/DEMO-ADDRESSES.md](docs/DEMO-ADDRESSES.md).

The Arena shows real active markets, the onchain forward, reference strike, and countdown. It suggests a strike inside the entry band using the Predict onchain pricer. Connect a Sui Wallet Standard wallet, dry-run a deposit to create and fund a Predict account, then dry-run a bet. The flat queued-order fee and expected payout come from `read.planMint`. A player bet is prepared by the server and signed by the wallet. The server executes only the exact prepared bytes and verifies the enqueue event before registering the round.

**Dry-run only by default.** To allow real USDC transactions, set `EIDOLON_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_USDC` along with Tatum, Walrus Memory, and ghost wallet credentials. Keep the ghost key on the server. A live player round requires a funded Predict account and SUI for gas. The ghost wallet needs its own funded Predict account; the policy enforces `EIDOLON_GHOST_MAX_USDC` and `EIDOLON_GHOST_DAILY_USDC` in the server ledger. Use a single persistent server instance for that daily cap.

The exact opposite side at the same strike can fail Predict's 0.15–0.5 entry band. The bet slip displays a separate mirror preflight, and the watcher reports a ghost refusal as such. Eidolon never silently moves the ghost to another strike. See [BLOCKED.md](BLOCKED.md) for the protocol decision needed to make a guaranteed two-sided round.

`GET /status`, `/markets`, `/rounds`, `/leaderboard`, `/ghost/:address`, and `/events` provide the UI data. `POST /fund` and `/plan` return a reviewed transaction and dry-run. `POST /execute` accepts a wallet signature only for a recently prepared transaction. `POST /rounds` registers a successful player enqueue receipt. Settlement uses the SDK's outcome and settlement reads, plus Tatum queue events and transaction blocks to verify fills and payouts before computing P&L or writing memory. `data/rounds.json` is the local durable registry. The public leaderboard covers registered rounds on this server; it is not a chain-wide index of all DeepBook users.

The CLI provides `pnpm --filter @eidolon/cli exec eidolon status`, `markets`, and `ghost <address>` after build. The ghost command reads Walrus recall; it does not use a local memory cache.

## Current live status

Mainnet gRPC reads and a real enqueue simulation pass with the public development endpoint. Tatum, Walrus, wallet signing, a real mint, ghost execution, and payout event reconciliation have not been exercised here because their credentials and funded wallets were not supplied. See [TESTING.md](TESTING.md) and [BLOCKED.md](BLOCKED.md).

Protocol and SDK references: [DeepBook Predict](https://www.docs.sui.io/onchain-finance/deepbook/deepbook-predict), [Positions SDK](https://www.docs.sui.io/onchain-finance/deepbook/deepbook-predict-sdk/positions), [Sui RPC migration](https://docs.sui.io/references/sui-api), and [dApp Kit React](https://sdk.mystenlabs.com/dapp-kit/getting-started/react).

## Art

Art generated with ChatGPT (image generation), directed in [docs/ART.md](docs/ART.md); source PNGs stay out of git and the web app ships WebP copies in `packages/web/public/art/`.
