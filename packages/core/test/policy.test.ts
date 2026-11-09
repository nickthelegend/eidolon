import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  ghostDecision,
  ghostStrike,
  encodeMemory,
  decodeMemory,
  type Context,
  type Hit,
  type TradeMemory,
  type StrikePricer,
} from '../src/policy.js';
const context: Context = { cadence: 1, strikeDistance: 2, move60s: 40, move5m: 60, hourUtc: 12 };
function history(hit: boolean, size: number): Hit[] {
  return Array.from({ length: 4 }, (_, i) => ({
    blobId: `blob${i}`,
    memory: {
      kind: 'round',
      player: '0x1',
      cadence: 1,
      side: 'up',
      strike: 100,
      distance: 2,
      size,
      premium: size,
      context,
      hit,
      pnl: hit ? size : -size,
      fillDigest: 'digest',
      createdAt: new Date().toISOString(),
    } as TradeMemory,
  }));
}
test('opposite ghost grows when recalled player loses', () => {
  const winning = ghostDecision('up', history(true, 2), context, 10);
  const losing = ghostDecision('up', history(false, 2), context, 10);
  assert.equal(winning.side, 'down');
  assert.equal(losing.side, 'down');
  assert.equal(winning.size, 2);
  assert.equal(losing.size, 4);
  assert.deepEqual(losing.blobIds, ['blob0', 'blob1', 'blob2', 'blob3']);
});
test('memory round trip and empty memory refusal', () => {
  const memory = history(true, 2)[0].memory;
  assert.deepEqual(decodeMemory(encodeMemory(memory)), memory);
  assert.throws(() => ghostDecision('up', [], context, 10), /requires recalled/);
  assert.equal(decodeMemory('EIDOLON_V1 {"kind":"round","size":-5}'), null);
});
test('context selection and cap change the decision', () => {
  const good = history(false, 4);
  const bad = history(true, 2).map((h) => ({
    ...h,
    memory: { ...h.memory, context: { ...context, hourUtc: 20 } },
  }));
  const a = ghostDecision('down', [...good, ...bad], context, 3);
  assert.equal(a.side, 'up');
  assert.equal(a.profile.matched, 4);
  assert.equal(a.profile.hitRate, 0);
  assert.equal(a.size, 3);
});

/** A logistic stand-in for the on-chain pricer (P(up) falls as the strike rises), forward 100,000. */
const pricer: StrikePricer = {
  probability: (k, side) => {
    const up = 1 / (1 + Math.exp((k - 100_000) / 40));
    return side === 'up' ? up : 1 - up;
  },
  strikeAtProbability: (p) => 100_000 + 40 * Math.log((1 - p) / p),
};
test('ghost mirrors the exact strike only when the band admits it', () => {
  const atForward = ghostStrike(pricer, 'down', 100_000, 1);
  assert.equal(atForward?.exact, true);
  assert.equal(atForward?.strike, 100_000);
});
test('ghost moves to the nearest admissible strike when the mirror is out of band', () => {
  // Player bets UP above 100,030 (P(up) about 0.32), so DOWN at 100,030 is about 0.68: refused.
  const g = ghostStrike(pricer, 'down', 100_030, 1)!;
  assert.equal(g.exact, false);
  assert.ok(g.strike < 100_030 && g.strike <= 100_000, `strike ${g.strike}`);
  assert.ok(g.probability <= 0.5 && g.probability >= 0.15, `p ${g.probability}`);
  const u = ghostStrike(pricer, 'up', 99_960, 1)!;
  assert.equal(u.exact, false);
  assert.ok(u.strike > 99_960 && u.strike >= 100_000);
  assert.ok(u.probability <= 0.5);
});
test('no admissible strike means no ghost bet', () => {
  assert.equal(ghostStrike({ probability: () => 0.9, strikeAtProbability: () => null }, 'down', 1, 1), null);
});
