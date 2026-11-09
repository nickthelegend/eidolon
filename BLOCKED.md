# Required from Nick for the first real round

- Hub funding: 40 USDC and 2.5 SUI to the hub `0xf5887bcfaa178fbcc29f560afce15734e13989955100f9a6b6154c34a79c1f11`. The hub funds the player (demo signer) `0x088c7e04318da7d802a208cc75bbaee9ea09cf7ca37a06168c2611dcfe067544` and the ghost `0x5b68d1190169b40761cf6c33171e2c50f60849d173d72c86785c1d7eaba02d09`. Both wallets exist and are unfunded.
- Tatum key with Sui mainnet gRPC gateway access to `SimulateTransaction` and `ListEvents`: `TATUM_API_KEY` (the current smoke check received HTTP 429 and “method not allowed,” respectively).
- Ghost wallet (key in `EIDOLON_GHOST_KEY`): about 20 USDC deposited into its Predict account and about 1 SUI for gas, from the hub.
- Player Sui wallet with USDC and SUI. Use the UI's funding step to create and fund its Predict account.
- Explicit live-write flag `EIDOLON_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_USDC` when ready to spend real USDC.
- Tatum account ID for the submission form (Nick fills).
- Public repo (Nick's yes), and publishing the blog and the social post (Nick).

Walrus Memory is no longer a blocker: 31 memories are on mainnet (README Proof).

The OpenRouter key is optional for the roast line. Without it, the deterministic ghost decision remains visible without narration. The required keys must be placed in local `.env` or process environment; `.env` is gitignored. Do not paste secrets into issues, logs, or commits.

## Protocol design decision

The current Predict entry band observed on mainnet is 0.15–0.5 probability for a new one-sided mint. At a sampled $1 admission strike, an UP quote was 0.5003 and refused while DOWN was accepted. The two exact opposite sides at the same strike are generally complementary, so both are admissible only at exactly 0.5. A reliable ghost on every round may require a nearby opposing strike. The Arena shows the exact-strike mirror preflight. This choice is pending Nick's direction; no alternate strike is silently substituted.

Until the items above are supplied, the app serves real mainnet reads and dry-runs, and the UI states that real trading is unavailable. Walrus writes and recall already run on mainnet. The end-to-end player vs ghost result remains unverified.
