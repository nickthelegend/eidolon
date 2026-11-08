import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ghostDecision, encodeMemory, decodeMemory, type Context, type Hit, type TradeMemory } from '../src/policy.js';
const context: Context = { cadence: 1, strikeDistance: 2, move60s: 40, move5m: 60, hourUtc: 12 };
function history(hit: boolean, size: number): Hit[] { return Array.from({ length: 4 }, (_, i) => ({ blobId: `blob${i}`, memory: { kind: 'round', player: '0x1', cadence: 1, side: 'up', strike: 100, distance: 2, size, premium: size, context, hit, pnl: hit ? size : -size, fillDigest: 'digest', createdAt: new Date().toISOString() } as TradeMemory })); }
test('opposite ghost grows when recalled player loses', () => {
  const winning = ghostDecision('up', history(true, 2), context, 10);
  const losing = ghostDecision('up', history(false, 2), context, 10);
  assert.equal(winning.side, 'down'); assert.equal(losing.side, 'down'); assert.equal(winning.size, 2); assert.equal(losing.size, 4);
  assert.deepEqual(losing.blobIds, ['blob0','blob1','blob2','blob3']);
});
test('memory round trip and empty memory refusal', () => {
  assert.deepEqual(decodeMemory(encodeMemory(history(true, 2)[0].memory)), history(true, 2)[0].memory);
  assert.throws(() => ghostDecision('up', [], context, 10), /requires recalled/);
  assert.equal(decodeMemory('EIDOLON_V1 {"kind":"round","size":-5}'), null);
});
test('context selection and cap change the decision', () => {
  const good = history(false, 4);
  const bad = history(true, 2).map(h => ({ ...h, memory: { ...h.memory, context: { ...context, hourUtc: 20 } } }));
  const a = ghostDecision('down', [...good, ...bad], context, 3);
  assert.equal(a.side, 'up'); assert.equal(a.profile.matched, 4); assert.equal(a.profile.hitRate, 0); assert.equal(a.size, 3);
});
