# Eidolon on a local fork of Sui mainnet

This rehearsal proves Eidolon's mainnet write path against a **LOCAL FORK of Sui mainnet**, with no real funds: `/fund` creates and funds a Predict account, `/plan` enqueues a real queued order, `/execute` sends it, and `/rounds` verifies it. Every digest below exists only on the local fork. None of them is on Suiscan.

## Fork mode

Set `EIDOLON_SUI_FORK_RPC=http://127.0.0.1:9796`. Only a loopback address is accepted, and fork mode refuses to start if `EIDOLON_ALLOW_MAINNET` or `TATUM_API_KEY` is also set.

- Reads, events and writes all go to the fork.
- `/status` reports `rpc: "LOCAL FORK of Sui mainnet @ checkpoint N"` plus a `fork` object, and `mainnetWrites` stays `false`.
- `/execute`, `/rounds` and ghost placement send only with `EIDOLON_ALLOW_FORK_WRITES=LOCAL_FORK_ONLY`. In fork mode they don't require Tatum or Walrus.
- Rounds go to `packages/server/data-fork/`, so fork rounds never mix with mainnet rounds.

Keys live in the gitignored `.env.fork`, created by Yojimbo's `scripts/fork-app-keys.ts`: `EIDOLON_PLAYER_KEY` (used only by the rehearsal script, standing in for the browser wallet) and `EIDOLON_GHOST_KEY`.

## Run

The fork, the hub and the funding live in the Yojimbo repo. One command runs both apps on a fresh fork:

```sh
../yojimbo/scripts/fork-apps-rehearsal.sh        # fresh fork, hub funded, wallets funded, both rehearsals
../yojimbo/scripts/fork-apps-rehearsal.sh stop   # stop the Eidolon (8797) and Nakama (8798) servers
# by hand: server against the fork, then the rehearsal
cd packages/server && DOTENV_CONFIG_PATH=../../.env.fork ../../../yojimbo/packages/core/node_modules/.bin/tsx src/index.ts
cd packages/server && ../../../yojimbo/packages/core/node_modules/.bin/tsx scripts/fork-rehearsal.ts
# return a wallet's funds to the hub (Predict withdraw, then USDC and SUI)
cd packages/server && tsx scripts/return-funds.ts --keys-file ../../.env.fork --var EIDOLON_PLAYER_KEY --to <hub address>
```

## Recorded run: forked at checkpoint 343353046

Player `0x93bec40dbf33c55a51cbda80415b7991703ec55e1b7420abf05fb1909dd199a2`, ghost `0x31f45294f290e713a3f9f6c736cbe9745437a7bfdbbf02c5b2afd76f1b4a9b96` (fork-only keys). The market was BTC `0x154f10ba…3108`, expiring 12:15 UTC, at strike 74436.

| Step | Digest |
|---|---|
| Hub → player: 0.5 SUI and 3 USDC | `3EYkZmFmH4SsmF85BeS9aNGarsGmwQUhtEtHAkkxevyz` |
| Hub → ghost: 0.5 SUI and 3 USDC | `5KVKJ8wday7QiuPfhsBQZzNWKjP4Dym2QB53Yj4UA5Kh` |
| Player: `/fund` (create account and deposit 3 USDC), then `/execute` | `4yoWSWZAhDfaWG8K1EKgMbFoq7MLdMpvg19hu3ib5RKJ` |
| Ghost: `/fund` (create account and deposit 3 USDC), then `/execute` | `C1pA9z9kYUcEBvNCpC4zS8JJhjCL3eQEHzcatSBN3sRi` |
| Player: `/plan` UP for 2 USDC (fee 0.02, potential payout 4.64), then `/execute` | `J2tvgGYJPNoqDUEj8cR1aQAbZASHiA1UzUaKPT7ryTsY` |
| `/rounds` reads the enqueue back: record 0, same market, side mint | (verification only, same digest) |
| Ghost address: `/plan` DOWN for 2 USDC, then `/execute` | `7RobjWm2CKquJ8LRVWXS7w4vA6AF2GNi85MjAKqMgDMc` |
| Player `return-funds`: withdraw 1 USDC, then return it with the remaining SUI | `8dcyMjYPbHGhwmfL72KpfHgBTTb9wtxFnxhomiW1oMKk`, `371gx9SRAuzeANYkNn5YUMH7ifRm4PKMSNC7Txtdnhtx` |
| Ghost `return-funds` | `5Cv57z59orcV5c9u1t8aUdN5uffDkDdTnsweTrALR4PF`, `Ds7cbpoonmuE3bCHZ6mSxUgny5wA3pa4aJHy2kdgA8kS` |

Gas on the fork came to about 0.013 SUI per Predict transaction, including the storage for creating the account.

## What the fork cannot show

- **No fills, no settlement.** The fork has no Predict keeper, and its clock stays at the fork checkpoint. Queued orders stay enqueued, and `/rounds` reports `fill evidence pending (timeout)`. The 2 USDC in each order's escrow stays inside Predict, and `return-funds` can only withdraw the free balance. On mainnet, run it again after the order fills and settles or is refunded.
- **No server-placed ghost.** `placeGhost` runs only after the player's fill and a Walrus recall of earlier rounds, and neither happens on the fork. The ghost row above proves the ghost wallet, its account and an enqueue for its address through `/plan` + `/execute`. It does not prove the automatic placement path.
- **Wall-clock pricing.** The SDK checks quotes and cutoffs against wall-clock time, while the chain checks against the frozen fork clock. Rehearsals therefore have to run within the few minutes before the newest market at the fork checkpoint closes. `fork-apps-rehearsal.sh` runs straight through for this reason.
- **Minimum size.** A 1 USDC order fails: the 0.02 fee leaves a 0.98 premium, which is under the minimum. At about 0.35 odds, 1.05 USDC still fails because whole lots don't reach the 1 USDC minimum premium. 2 USDC works. Use 2 USDC or more on camera.
- **Not exercised:** sending through Tatum. On mainnet, `/execute` sends the same signed bytes through Tatum's gRPC gateway.
