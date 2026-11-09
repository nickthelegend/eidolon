# Eidolon: trading against a ghost of yourself

*Nivesh Gajengi (Nick), built for Total Recall: Tatum × Walrus Memory, track 01 Markets & Sports Prediction.*

Short-term traders mostly lose to their own habits: the same side, the same size after a loss, the same far-away strike. Eidolon turns that habit into an opponent you can see.

## What it does

Eidolon is a duel on DeepBook Predict, the Bitcoin up/down prediction market on Sui mainnet. Each market asks one question: will BTC be above this strike when the 1-minute or 5-minute window closes? You pick a market, a strike and a side.

Your ghost takes the other side. It isn't a random bot. It's built from your own record:

- **Side:** always the opposite of yours.
- **Size:** your average bet, scaled up when your hit rate is below 50%, and capped by a server-side limit per bet and per day.
- **Strike:** the nearest strike that Predict's entry band (15–50% win probability for a new bet) will admit. The exact mirror of your bet at the same strike is usually outside that band, so the ghost uses a counter-strike, and the arena shows which one. It never switches strikes quietly.

An optional language model writes one taunt line from the recalled facts. It can't change the bet: a deterministic, tested policy decides side, size and strike.

## How it uses Walrus Memory

The ghost's memory lives in Walrus Memory, through the `@mysten-incubation/memwal` SDK on the mainnet relayer. Each player gets their own namespace.

The loop works like this:

1. **Round 1 has no ghost.** There's nothing to remember yet, and the app says so.
2. **After a verified payout**, Eidolon writes the round as one memory: side, strike, distance from the forward price, size, premium, market context (cadence, last-minute move, hour of day), hit or miss, profit and loss, and the fill transaction digest. It writes only after the payout event is reconciled on-chain, so every memory points at a real settled trade.
3. **Every fifth round** adds a short summary memory in the form "Last 5 trades: UP n, wins m".
4. **On the next round**, Eidolon recalls the closest memories for the live situation. It builds a semantic query from the market context, then keeps the rounds with the same cadence, the same minute direction, a strike distance within 20 USD and an hour within 3 of now. The ghost is rebuilt from those rounds.

So the ghost reflects how you trade in this kind of market at this hour, not a lifetime average.

Eidolon can also import a wallet's earlier settled Predict trades into Walrus Memory, so an experienced trader starts with a ghost that already knows them. Storing that history moves no funds, so it needs only the Walrus keys.

**Honest status:** Walrus Memory is live on mainnet. Eidolon has stored 31 memories there: one test write, then 30 settled trades of a public Predict trader whose owner is unknown. The event requires at least 10. All the blob IDs are in the README. Eidolon signs with its own delegate key on one shared Walrus Memory account. Without keys, the code still fails loudly with "Setup required". What is not done yet: a funded player round on mainnet, and the ghost placing its bet automatically. Both wait on funding the wallets.

## How it uses Tatum

Sui's JSON-RPC is deprecated, so Eidolon talks to Sui over gRPC, and with a Tatum key every read and every transaction goes through Tatum's native Sui gRPC gateway: markets, the pool, the on-chain pricer, objects, transactions, dry-runs and sends.

Two limits came up. Tatum's gateway refuses `ListEvents`, which the history importer and settlement watcher need, so those scans go to the public Sui fullnode and are labelled that way. The free plan also answered bursts with HTTP 429, so a throttle now spaces calls 400 ms apart and retries with backoff. Without a key, every response is labelled "dev RPC (not Tatum)".

## How it learned over time

Eidolon's learning is concrete: each settled round adds a memory, and the next ghost is rebuilt from the memories that match the moment. Over many rounds the ghost's size tracks your actual sizing, its pressure rises when your hit rate drops, and the context filter makes it sharper in the situations you trade most.

On Nov 9 that loop ran on Walrus mainnet for the first time. Eidolon picked one of the most active traders in recent Predict orders and stored 30 of their real settled trades as memories, from 15:38:21 to 15:40:38 UTC. Then it recalled them. Recall returned 31 memories: the 30 trades plus one earlier test write. The ghost built from them read a 32% UP share, an 81% hit rate and an average bet of 4.84 USDC. Every one of those numbers came back from Walrus, not from a local cache. The ghost panel now says so in plain words: "I recalled 31 of your trades from Walrus Memory", with links to the recalled blobs. Anyone can also read a stored blob from the public Walrus mainnet aggregator. The round-by-round loop, where each new Eidolon round becomes a memory, is still **PENDING** on the first funded round.

The same policy already runs today on real on-chain history. Eidolon rebuilds any address's settled Predict trades from mainnet events, matching each order, fill and payout and checking the payout against the settled market. On one public trader with 15 settled trades, the ghost read a 27% UP share and a 73% hit rate, then chose DOWN for 4.87 USDC at the nearest admissible strike, at 49% odds. When an address has no Walrus memories, the app shows this ghost and labels it "Not on Walrus yet".

The project learned too. The first recorded take showed an empty ghost panel, so the ghost now comes from on-chain history when memory isn't configured. Rehearsals on a local fork of Sui mainnet showed that a 1 USDC order fails Predict's minimum once fees and whole lots are counted, so the demo uses 2 USDC. The first Walrus writes on mainnet showed that blobs take over 60 seconds to certify, so writes now wait up to 5 minutes, and history goes in as bulk jobs of 20.

## What's next

The funded mainnet run: fund the wallets, play one player round, then a second round where the ghost recalls the first from Walrus and bets against it. Until then, everything above is labelled live, fork-only or pending.

Code: `<repo link, public after Nick's yes>`. Film: `videos/eidolon/eidolon-film-v2.mp4` (link after upload).
