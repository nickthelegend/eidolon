# Required from Nick for the first real round

- Walrus Memory mainnet account ID and delegate key: `MEMWAL_MAINNET_ACCOUNT_ID`, `MEMWAL_MAINNET_KEY`.
- Tatum key with Sui mainnet JSON-RPC access: `TATUM_API_KEY`.
- Dedicated ghost Ed25519 `suiprivkey` in `EIDOLON_GHOST_KEY`, with about 20 USDC deposited into its Predict account and about 1 SUI for gas.
- Player Sui wallet with USDC and SUI. Use the UI's funding step to create and fund its Predict account.
- Explicit live-write flag `EIDOLON_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_USDC` when ready to spend real USDC.

The OpenRouter key is optional for the roast line. Without it, the deterministic ghost decision remains visible without narration. The required keys must be placed in local `.env` or process environment; `.env` is gitignored. Do not paste secrets into issues, logs, or commits.

## Protocol design decision

The current Predict entry band observed on mainnet is 0.15–0.5 probability for a new one-sided mint. At a sampled $1 admission strike, an UP quote was 0.5003 and refused while DOWN was accepted. The two exact opposite sides at the same strike are generally complementary, so both are admissible only at exactly 0.5. A reliable ghost on every round may require a nearby opposing strike. The Arena shows the exact-strike mirror preflight. This choice is pending Nick's direction; no alternate strike is silently substituted.

Until the items above are supplied, the app serves real mainnet reads and dry-runs, and the UI states that real trading and the ghost are unavailable. The end-to-end player vs ghost result remains unverified.
