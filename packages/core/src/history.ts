import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { AccountWrapper } from '@mysten/deepbook-v3/account';
import { cost } from '@mysten/deepbook-v3/predict';
import { toBase64 } from '@mysten/sui/utils';
import { chain } from './chain.js';
import type { TradeMemory } from './policy.js';

export type RawHistoryEvent = {
  eventType: string;
  sender: string;
  transactionDigest: string;
  json: Record<string, unknown> | null;
  bcs: string;
};
export type HistoryEvidence = {
  owner: string;
  accountId: string;
  expiryMs: number;
  tickSizeRaw: string;
  settlementPrice: number;
  settlementPriceRaw: string;
  enqueue: { digest: string; event: Record<string, any> };
  fill: { digest: string; event: Record<string, any>; transactionEvents: { eventType: string; json: Record<string, any> | null }[] };
  payout: { digest: string; event: Record<string, any> };
};
export type HistoricalTrade = TradeMemory & {
  marketId: string;
  expiryMs: number;
  recordId: string;
  orderId: string;
  payout: number;
  settlementPrice: number;
  enqueueDigest: string;
  payoutDigest: string;
  forwardAtEnqueue: number | null;
};
const addressPattern = /^0x[0-9a-f]{64}$/i;
const digestPattern = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const raw = (value: unknown) => BigInt(String(value));
const usdc = (value: unknown) => Number(raw(value)) / 1e6;
const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
const key = (j: Record<string, any>) => `${String(j.expiry_market_id).toLowerCase()}:${j.record_id}`;

/** Pure reconstruction from unedited Sui event JSON and market reads. Incomplete/refunded records stay out. */
export function reconstructTrade(e: HistoryEvidence): HistoricalTrade | null {
  const { enqueue, fill, payout } = e;
  const q = enqueue.event, f = fill.event, p = payout.event;
  if (!addressPattern.test(e.owner) || !same(q.account_id, e.accountId) || !same(f.account_id, e.accountId) || !same(p.account_id, e.accountId)) return null;
  if (key(q) !== key(f) || key(q) !== key(p) || ![enqueue.digest, fill.digest, payout.digest].every((d) => digestPattern.test(d))) return null;
  if (![0, 1, 2].includes(Number(q.kind))) return null; // mint kinds only
  if (!f.position?.order_id || raw(f.position.order_id) === 0n || !same(f.position.order_id, p.order_id)) return null;
  const minted = fill.transactionEvents.find((v) => v.eventType.endsWith('::order_events::OrderMinted') && same(v.json?.account_id, e.accountId) && same(v.json?.order_id, f.position.order_id))?.json;
  if (!minted || !same(minted.owner, e.owner)) return null;
  const tick = Number(raw(e.tickSizeRaw)) / 1e9;
  const up = raw(minted.lower_tick) > 0n;
  const strikeTick = raw(up ? minted.lower_tick : minted.higher_tick);
  const strike = Number(strikeTick) * tick;
  const forward = q.vol?.bs_forward == null ? null : Number(raw(q.vol.bs_forward)) / 1e9;
  const size = Math.round((usdc(f.amount) + usdc(f.order_fee)) * 1e6) / 1e6;
  const premium = usdc(minted.premium);
  const paid = usdc(p.payout);
  const expectedPayout = Number(cost.settledPayout(raw(f.position.order_id), raw(e.settlementPriceRaw), raw(e.tickSizeRaw))) / 1e6;
  if (Math.abs(expectedPayout - paid) > 0.000001) return null;
  const at = Number(raw(f.onchain_timestamp_ms));
  if (forward == null || ![strike, forward, size, premium, paid, at, e.settlementPrice].every(Number.isFinite) || size <= 0 || at <= 0) return null;
  const cadence = e.expiryMs % 300_000 === 0 ? 5 : 1;
  const distance = strike - forward;
  const context = { cadence: cadence as 1 | 5, strikeDistance: distance, move60s: null, move5m: null, hourUtc: new Date(at).getUTCHours() };
  const pnl = Math.round((paid - size) * 1e6) / 1e6;
  return {
    kind: 'round', player: e.owner.toLowerCase(), cadence, side: up ? 'up' : 'down',
    strike, distance, size, premium, context, hit: paid > 0, pnl,
    fillDigest: fill.digest, createdAt: new Date(at).toISOString(),
    marketId: String(q.expiry_market_id).toLowerCase(), expiryMs: e.expiryMs,
    recordId: String(q.record_id), orderId: String(f.position.order_id), payout: paid,
    settlementPrice: e.settlementPrice, enqueueDigest: enqueue.digest, payoutDigest: payout.digest,
    forwardAtEnqueue: forward,
  };
}

const serialized = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v);
async function cached<T>(path: string, load: () => Promise<T>): Promise<T> {
  try {
    const saved = JSON.parse(await readFile(path, 'utf8')) as { at: number; value: T };
    if (Date.now() - saved.at < 60_000) return saved.value;
  } catch { /* cache miss */ }
  const value = await load();
  await mkdir('data/history', { recursive: true });
  await writeFile(path, serialized({ at: Date.now(), value }));
  return value;
}
function eventName(event: RawHistoryEvent) { return event.eventType.split('::').at(-1); }
function normalizeEvent(e: { eventType: string; sender: string; transactionDigest: string; json: Record<string, unknown> | null; bcs: Uint8Array }): RawHistoryEvent {
  return { eventType: e.eventType, sender: e.sender, transactionDigest: e.transactionDigest, json: e.json, bcs: toBase64(e.bcs) };
}

export async function predictHistory(address: string, { limit = 50 }: { limit?: number } = {}): Promise<HistoricalTrade[]> {
  if (!addressPattern.test(address)) throw new Error('Invalid player address');
  if (!Number.isInteger(limit) || limit < 1) throw new Error('History limit must be positive');
  limit = Math.min(limit, 200);
  const owner = address.toLowerCase(), c = chain();
  const wrapper = await c.client.core.getObject({ objectId: c.predict.wrapperIdFor(owner), include: { content: true } }).catch((error) => {
    if (String(error).includes('not found')) return null;
    throw error;
  });
  if (!wrapper?.object || wrapper.object instanceof Error || !wrapper.object.content) return [];
  const accountId = AccountWrapper.parse(wrapper.object.content).account.account_id.toLowerCase();
  const pkg = c.config.packages.predictOrdersV1 ?? c.config.packages.predictOrders;
  if (!pkg) throw new Error('Predict queue event package missing from SDK config');
  const eventType = (name: string) => `${pkg}::queue_events::${name}`;
  const pages = async (name: string, filter: { sender: string } | { eventType: string }, accept: (event: RawHistoryEvent) => boolean, stop: (events: RawHistoryEvent[], page: RawHistoryEvent[]) => boolean) => {
    let before: string | null = null;
    const matched: RawHistoryEvent[] = [];
    for (let page = 0; page < 200; page++) {
      const suffix = `${owner}-${name}-${page}.json`;
      const result = await cached(`data/history/${suffix}`, async () => {
        const x = await c.events.core.listEvents({ filter, limit: 50, order: 'descending', ...(before ? { before } : {}) });
        return { events: x.events.map(normalizeEvent), hasNextPage: x.hasNextPage, endCursor: x.endCursor };
      }).catch((error) => {
        if (String(error).includes('OUT_OF_RANGE') || String(error).includes('below earliest available')) return null;
        throw error;
      });
      if (!result) break;
      matched.push(...result.events.filter(accept));
      if (stop(matched, result.events) || !result.hasNextPage || !result.endCursor || result.endCursor === before) break;
      before = result.endCursor;
    }
    return matched;
  };
  const enqueues = await pages('enqueues', { eventType: eventType('OrderEnqueued') }, (e) => e.eventType === eventType('OrderEnqueued') && same(e.json?.account_id, accountId) && [0, 1, 2].includes(Number(e.json?.kind)), (x) => x.length >= limit);
  if (!enqueues.length) return [];
  const selected = enqueues.slice(0, limit);
  const wanted = new Set(selected.map((e) => key(e.json!)));
  const oldest = Math.min(...selected.map((e) => Number(e.json?.onchain_timestamp_ms)));
  const scan = (name: string) => pages(name, { eventType: eventType(name) }, (e) => same(e.json?.account_id, accountId) && wanted.has(key(e.json!)), (x, page) => x.length >= wanted.size || (page.length > 0 && Number(page.at(-1)?.json?.onchain_timestamp_ms) < oldest));
  const [fills, payouts] = await Promise.all([scan('QueuedOrderFilled'), scan('OpenRecordSettled')]);
  const byKey = (items: RawHistoryEvent[]) => new Map(items.map((e) => [key(e.json!), e]));
  const fillMap = byKey(fills), payoutMap = byKey(payouts);
  const marketReads = new Map<string, Promise<{ expiryMs: number; tickSizeRaw: string; settlementPrice: number; settlementPriceRaw: string }>>();
  const txReads = new Map<string, Promise<{ eventType: string; json: Record<string, any> | null }[]>>();
  const trades: HistoricalTrade[] = [];
  for (const queued of selected) {
    const filled = fillMap.get(key(queued.json!)), paid = payoutMap.get(key(queued.json!));
    if (!filled || !paid) continue;
    const marketId = String(queued.json!.expiry_market_id);
    if (!marketReads.has(marketId)) marketReads.set(marketId, cached(`data/history/${owner}-market-${marketId}.json`, async () => {
      const object = await c.client.core.getObject({ objectId: marketId, include: { content: true } });
      if (!object.object || object.object instanceof Error || !object.object.content || !object.object.type?.endsWith('::expiry_market::ExpiryMarket')) throw new Error('Market object unavailable');
      const bytes = object.object.content;
      // ExpiryMarket BCS: UID (32 bytes), underlying u32 (4), expiry u64 (8).
      const expiryMs = Number(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(36, true));
      const settlement = await c.predict.read.settlement({ underlying: 'BTC', expiryMs, marketId });
      if (!settlement.settled || settlement.settlementPrice == null) throw new Error('Settlement unavailable');
      return { expiryMs, tickSizeRaw: String(settlement.tickSizeRaw), settlementPrice: settlement.settlementPrice, settlementPriceRaw: String(settlement.settlementPriceRaw) };
    }));
    if (!txReads.has(filled.transactionDigest)) txReads.set(filled.transactionDigest, cached(`data/history/${owner}-filltx-${filled.transactionDigest}.json`, async () => {
      const result = await c.client.core.getTransaction({ digest: filled.transactionDigest, include: { events: true } });
      if (result.$kind !== 'Transaction') throw new Error('Fill transaction unavailable');
      const decoded = c.predict.decode.queuedFills(result.Transaction);
      if (!decoded.some((x) => same(x.accountId, accountId) && String(x.recordId) === String(filled.json?.record_id))) throw new Error('Fill event failed SDK decode');
      return (result.Transaction.events ?? []).map((e) => ({ eventType: e.eventType, json: e.json }));
    }));
    const [market, transactionEvents] = await Promise.all([marketReads.get(marketId)!, txReads.get(filled.transactionDigest)!]);
    const evidence: HistoryEvidence = { owner, accountId, ...market,
      enqueue: { digest: queued.transactionDigest, event: queued.json! },
      fill: { digest: filled.transactionDigest, event: filled.json!, transactionEvents },
      payout: { digest: paid.transactionDigest, event: paid.json! } };
    const trade = reconstructTrade(evidence);
    if (trade) trades.push(trade);
  }
  return trades;
}
