import { chain, markets, predictHistory } from '../src/index.js';
import { strict as assert } from 'node:assert';

const c = chain();
const live = await markets();
assert.equal(live.mode, 'delayed');
assert.ok(live.markets.length > 0, 'mainnet has active Predict markets');
assert.ok(live.pool.idleUsdc > 0, 'pool has real onchain liquidity');
console.log(
  `LIVE READ ${live.rpc}: ${live.markets.length} active markets; pool ${live.pool.idleUsdc.toFixed(2)} USDC; mode ${live.mode}`,
);
const market =
  live.markets.find((m) => m.cadence === 5 && m.suggestedStrike && m.expiryMs > Date.now() + 30_000) ??
  live.markets.find((m) => m.suggestedStrike && m.expiryMs > Date.now() + 20_000);
assert.ok(market, 'a seeded market with enough time to quote exists');
const owner = '0x0000000000000000000000000000000000000000000000000000000000000001';
const descriptor = {
  underlying: 'BTC',
  expiryMs: market.expiryMs,
  marketId: market.id,
  side: 'up' as const,
  strike: market.suggestedStrike!,
};
const quote = await c.predict.read.planMint(owner, descriptor, { amount: 2, slippageCents: 5 });
assert.ok(quote.potentialPayout > 0);
console.log(
  `LIVE QUOTE ${market.id}: payout ${quote.potentialPayout.toFixed(2)} USDC, fee ${quote.orderFee.toFixed(2)}, accepting ${quote.accepting}, refusal ${quote.refusal ?? 'none'}`,
);
assert.equal(quote.refusal, 'fee', 'unfunded visitor cannot enqueue');
const pkg = c.config.packages.predictOrdersV1 ?? c.config.packages.predictOrders;
assert.ok(pkg, 'queue event package configured');
const events = await c.client.core.listEvents({
  filter: { eventType: `${pkg}::queue_events::OrderEnqueued` },
  limit: 50,
  order: 'descending',
});
let dryRun = false;
for (const candidate of [...new Set(events.events.map((event) => event.sender))]) {
  if ((await c.predict.read.balance(candidate).catch(() => 0)) < 2.1) continue;
  try {
    const fundedQuote = await c.predict.read.planMint(candidate, descriptor, { amount: 2, slippageCents: 5 });
    if (!fundedQuote.accepting) continue;
    const { transaction } = await c.predict.tx.enqueuePlan(candidate, descriptor, fundedQuote);
    transaction.setSender(candidate);
    const bytes = await transaction.build({ client: c.client });
    const result = await c.client.core.simulateTransaction({
      transaction: bytes,
      include: { effects: true, events: true },
    });
    if (result.$kind !== 'Transaction') continue;
    console.log(
      `LIVE ENQUEUE DRY-RUN success via ${c.rpc}: funded account ${candidate}, ${result.Transaction.events?.length ?? 0} simulated events, no transaction submitted`,
    );
    dryRun = true;
    break;
  } catch {
    /* Try another actual funded account; market state moves each second. */
  }
}
assert.ok(dryRun, 'no recent funded account produced a successful real enqueue dry-run');

const demo = '0x7c9250467b7d7cc0aa2a9e76d06e9e8af313afa22285f1a3c314d749617b486e';
const history = await predictHistory(demo, { limit: 5 });
assert.ok(history.length >= 1, 'demo address has at least one settled Predict trade');
assert.ok(history.every((t) => [t.enqueueDigest, t.fillDigest, t.payoutDigest].every((digest) => /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(digest))), 'history has valid Sui digests');
console.log(`LIVE HISTORY ${history.length} settled trades for ${demo}`);
