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

The ghost's memory is meant to live in Walrus Memory, through the `@mysten-incubation/memwal` SDK on the mainnet relayer. Each player gets their own namespace.

The loop works like this:

1. **Round 1 has no ghost.** There's nothing to remember yet, and the app says so.
2. **After a verified payout**, Eidolon writes the round as one memory: side, strike, distance from the forward price, size, premium, market context (cadence, last-minute move, hour of day), hit or miss, profit and loss, and the fill transaction digest. It writes only after the payout event is reconciled on-chain, so every memory points at a real settled trade.
3. **Every fifth round** adds a short summary memory in the form "Last 5 trades: UP n, wins m".
4. **On the next round**, Eidolon recalls the closest memories for the live situation. It builds a semantic query from the market context, then keeps the rounds with the same cadence, the same minute direction, a strike distance within 20 USD and an hour within 3 of now. The ghost is rebuilt from those rounds.

So the ghost reflects how you trade in this kind of market at this hour, not a lifetime average.

Eidolon can also import a wallet's earlier settled Predict trades into Walrus Memory, so an experienced trader starts with a ghost that already knows them.

**Honest status:** Walrus Memory isn't writing on mainnet yet. The code path is finished and fails loudly with "Setup required" without keys, but the mainnet account ID and delegate key are still pending. Today 0 memories are stored, and the event requires at least 10. After the mainnet run, the first blob IDs go in the README.

## How it uses Tatum

Sui's JSON-RPC is deprecated, so Eidolon talks to Sui over gRPC, and with a Tatum key every read and every transaction goes through Tatum's native Sui gRPC gateway: markets, the pool, the on-chain pricer, objects, transactions, dry-runs and sends.

Two limits came up. Tatum's gateway refuses `ListEvents`, which the history importer and settlement watcher need, so those scans go to the public Sui fullnode and are labelled that way. The free plan also answered bursts with HTTP 429, so a throttle now spaces calls 400 ms apart and retries with backoff. Without a key, every response is labelled "dev RPC (not Tatum)".

## How it learned over time

Eidolon's learning is meant to be concrete: each settled round adds a memory, and the next ghost is rebuilt from the memories that match the moment. Over many rounds the ghost's size tracks your actual sizing, its pressure rises when your hit rate drops, and the context filter makes it sharper in the situations you trade most. That loop starts on mainnet once the Walrus keys are in. **PENDING.**

The same policy already runs today on real on-chain history. Eidolon rebuilds any address's settled Predict trades from mainnet events, matching each order, fill and payout and checking the payout against the settled market. On one public trader with 15 settled trades, the ghost read a 27% UP share and a 73% hit rate, then chose DOWN for 4.87 USDC at the nearest admissible strike, at 49% odds. The app labels this ghost "Not on Walrus yet", because no Walrus memory exists for it.

The project learned too. The first recorded take showed an empty ghost panel, so the ghost now comes from on-chain history when memory isn't configured. Rehearsals on a local fork of Sui mainnet showed that a 1 USDC order fails Predict's minimum once fees and whole lots are counted, so the demo uses 2 USDC.

## What's next

The mainnet run: keys in, one funded player round, then a second round where the ghost recalls the first from Walrus and bets against it. Until then, everything above is labelled live, fork-only or pending.

Code: `<repo link, public after Nick's yes>`. Film: `videos/eidolon/eidolon-film-v2.mp4` (link after upload).
