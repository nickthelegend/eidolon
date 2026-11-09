import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { reconstructTrade, type HistoryEvidence } from '../src/history.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/mainnet-history.json', import.meta.url), 'utf8')) as HistoryEvidence;
const upFixture = JSON.parse(readFileSync(new URL('./fixtures/mainnet-history-up.json', import.meta.url), 'utf8')) as HistoryEvidence;
const winFixture = JSON.parse(readFileSync(new URL('./fixtures/mainnet-history-win.json', import.meta.url), 'utf8')) as HistoryEvidence;
test('reconstructs a settled mint from real mainnet event JSON and digests', () => {
  const trade = reconstructTrade(fixture);
  assert.ok(trade);
  assert.equal(trade.side, 'down');
  assert.equal(trade.cadence, 5);
  assert.equal(trade.strike, 75260);
  assert.equal(trade.size, 4.99511);
  assert.equal(trade.premium, 4.247374);
  assert.equal(trade.payout, 0);
  assert.equal(trade.pnl, -4.99511);
  assert.equal(trade.settlementPrice, 75360.06476377);
  assert.equal(trade.fillDigest, fixture.fill.digest);
  assert.equal(trade.payoutDigest, fixture.payout.digest);
  assert.equal(trade.enqueueDigest, fixture.enqueue.digest);
  assert.equal(trade.context.move60s, null);
  assert.equal(trade.context.move5m, null);
  assert.equal(trade.context.hourUtc, 2);
  assert.ok(trade.context.strikeDistance < 0);
});
test('does not count a payout for a different record as this trade', () => {
  assert.equal(reconstructTrade({ ...fixture, payout: { ...fixture.payout, event: { ...fixture.payout.event, record_id: '99' } } }), null);
});
test('reads UP direction from the minted strike range, not the queue order kind', () => {
  const trade = reconstructTrade(upFixture);
  assert.ok(trade);
  assert.equal(trade.side, 'up');
  assert.equal(trade.strike, 74807.42);
  assert.equal(trade.fillDigest, upFixture.fill.digest);
});
test('uses the real payout to calculate a winning trade P&L', () => {
  const trade = reconstructTrade(winFixture);
  assert.ok(trade);
  assert.equal(trade.hit, true);
  assert.equal(trade.payout, 3.42);
  assert.equal(trade.size, 1.95605);
  assert.equal(trade.pnl, 1.46395);
});
