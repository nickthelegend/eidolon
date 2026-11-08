# Testing evidence

Run on 2026-11-08 against Sui mainnet. No mainnet transaction was submitted.

| Check | Result |
| --- | --- |
| `pnpm install` | Passed, 5 workspace projects |
| `pnpm build` | Passed, 4 packages |
| `pnpm test` | 3 pure policy tests passed |
| `pnpm test:live` | 4 active BTC markets, delayed execution, pool 9,156.24 USDC at the sample read |
| Visitor `planMint` | Real quote, 4.64 USDC potential payout for a 2 USDC budget, 0.02 USDC order fee; correctly refused for unfunded account |
| Enqueue simulation | Real funded account found from 50 recent onchain enqueue events; SDK plan accepted and gRPC simulation succeeded with 3 simulated events; no transaction submitted |
| Exact-strike mirror probe | At a sampled $1 strike, UP probability 0.5003 was outside the live 0.15–0.5 entry band while DOWN could be quoted |
| `pnpm dev` | Server `GET /status` and `/markets` responded; Vite returned HTTP 200 |

The public Sui fullnode has disabled JSON-RPC. The development test therefore uses the Sui gRPC client and marks its source **dev RPC (not Tatum)**. With a Tatum key, production uses `SuiJsonRpcClient` and `sui_dryRunTransactionBlock` for dry-runs. That path remains unverified in this checkout. The live test can fail at a market rollover or if no recent account remains funded; it reports that failure instead of claiming a simulated success.

Unverified: wallet signature round trip, Tatum event pagination, ghost mint, Walrus recall and write, OpenRouter narration, settlement payout proof, and multi-player persistence. These need the credentials and wallets in [BLOCKED.md](BLOCKED.md).
