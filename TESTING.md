# Testing evidence

Run on 2026-11-09 against Sui mainnet with the public development gRPC endpoint. No mainnet transaction was submitted.

| Check | Measured result |
| --- | --- |
| `pnpm build` | Passed: core, server, web, CLI |
| `pnpm test` | Passed: 10 tests, including three real mainnet reconstruction fixtures |
| `pnpm test:live` | Passed: 4 active BTC markets, delayed execution, pool 9,166.97 USDC at the sample read |
| Live visitor quote | 4.57 USDC payout quoted for a 2 USDC budget; 0.02 USDC order fee; unfunded visitor refused for fee |
| Live enqueue simulation | Funded address `0x4ed0d81b8d98763f781416ccfc5598cab8f50652dac5f155d4ecfa85a9dfe528`; accepted 2 USDC quote; simulation succeeded with 3 events |
| Live history test | 4 settled trades for `0x7c9250467b7d7cc0aa2a9e76d06e9e8af313afa22285f1a3c314d749617b486e`, each with enqueue, fill, and payout digests |
| `GET /history/:address?limit=5` on port 8791 | 4 settled trades and a profile for that address |
| `GET /history/:address?marketId=...&side=up` through Vite proxy on port 5181 | 1 settled trade and a deterministic DOWN ghost decision for the second demo address |
| `POST /plan` through Vite proxy using the second viewed address | Accepted quote and successful mainnet simulation via **dev RPC (not Tatum)** |
| `POST /history/:address/remember` without memory keys | Refused with `Setup required: MEMWAL_MAINNET_KEY` |
| Vite `/?as=<demo address>` | HTTP 200 on port 5181; the URL, owner selection, read-only banner, and hidden signing controls are implemented in the app. Browser inspection was unavailable in this environment. |

The public development endpoint marks chain reads **dev RPC (not Tatum)**. Its event history has a finite checkpoint window, so older trades can require an archival RPC. Sui JSON-RPC is deprecated; the app now uses Tatum's native gRPC gateway when `TATUM_API_KEY` is set. Wallet signing and real Predict orders remain unverified because the signing wallets are not funded yet. Walrus writes were verified later the same day (see below). The existing live test can fail during a market rollover or if no recent account stays funded; it reports the failure instead of claiming a simulated success.

## Tatum gRPC smoke check (Nov 9 2026)

Started the built server from the repo root with its `.env`, on port 8792, with `EIDOLON_ALLOW_MAINNET` overridden to empty. Stopped it by PID after the checks. No transaction was submitted.

| Check | Result |
| --- | --- |
| `GET /status` | HTTP 200, `rpc: "Tatum"`, `chainError: null` |
| Direct SDK market list and execution mode | Passed: 4 active markets and execution mode read |
| `core.getTransaction` for a known mainnet fill | Passed: `Transaction`, 3 events, parsed sender present |
| `GET /markets`, direct pool read, pricer, and quote | Failed: Tatum returned HTTP 429 from `TransactionExecutionService/SimulateTransaction` |
| `core.listEvents` for `OrderEnqueued` | Failed: `gRPC method not allowed: sui.rpc.v2.LedgerService/ListEvents` |

The gateway responses block a Tatum quote or dry-run and the event-backed settlement watcher. The application reports these failures; it does not substitute JSON-RPC or report a successful quote. Tatum gateway access to `SimulateTransaction` and `ListEvents` must be resolved before this path can be considered live ready.

## Round-2 judging pass (Nov 9 2026)
- `pnpm test`: 10/10 passed; `pnpm -r build` passed.
- Checked by hand (headless Chrome, 1440 and 375 px, no overflow), previewing public address `0xa9eb…c79c`: 15 settled trades loaded from mainnet, and the ghost panel showed the history-built ghost (27% UP, 73% hit rate, DOWN 4.87 USDC at the nearest admissible strike, 49% odds). A far strike showed the refusal inside the arena. The deposit dry-run read "holds 0.00 USDC in its wallet; this deposit needs 10.00 USDC".

## Walrus Memory mainnet run (Nov 9 2026)

All 31 blob IDs are in [docs/walrus-mainnet-2026-11-09.json](docs/walrus-mainnet-2026-11-09.json).

| Check | Result |
| --- | --- |
| Account lookup | Found on chain: the relayer's `GET /config` package `0xe7c16fbe…d7f5` has `account::DelegateKeyAdded` events listing Eidolon's delegate key (label "2") under account `0xd2ca3cbe…335a` |
| Delegate key auth | `POST /api/stats` on the mainnet relayer returned owner `0x0cff6ac3…7e93` |
| Test write | 1 memory, blob `PJQ_DMK9MAlBM82wpPLkVTehX5nM8ne63HARgsKnw9o`, at 15:3x UTC |
| `POST /history/:address/remember` for `0x96ed1d73…2ccd2` | 30 settled trades stored, 15:38:21 to 15:40:38 UTC |
| `GET /ghost/0x96ed1d73…2ccd2` | 31 hits (31 unique blobs). Profile: 32% UP bets, 81% hit rate, average size 4.84 USDC |
| `GET /status` | `rpc: "Tatum"` |

Mainnet blobs took over 60 s to certify, so writes now wait up to 300 s (`afb613b`), and history goes in through `rememberBulkAndWait` in chunks of 20 (`0a2316f`).
