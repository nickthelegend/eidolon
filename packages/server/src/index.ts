import 'dotenv/config';
import { createServer, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chain, markets, plan, memoryFor, ghostDecision, habitProfile, type Context, type Hit, type TradeMemory } from '@eidolon/core';
import { toBase64 } from '@mysten/sui/utils';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { cost } from '@mysten/deepbook-v3/predict';

type Leg = { digest: string; recordId: string; orderId: string; cost: number; premium: number; payout?: number; pnl?: number; fillDigest?: string; payoutDigest?: string };
type Round = { digest: string; player: string; marketId: string; expiryMs: number; cadence: 1 | 5; side: 'up' | 'down'; strike: number; size: number; recordId: string; context: Context; status: string; playerLeg?: Leg; ghost?: { side: 'up' | 'down'; size: number; recalledBlobIds: string[]; profile: ReturnType<typeof habitProfile>; line?: string; leg?: Leg; status: string }; settlement?: number; memoryBlobId?: string; createdAt: string };
const dbPath = 'data/rounds.json';
let rounds: Round[] = [];
try { rounds = JSON.parse(await readFile(dbPath, 'utf8')); } catch { /* first run */ }
const clients = new Set<ServerResponse>();
const priceSamples: { at: number; forward: number }[] = [];
const prepared = new Map<string, { player: string; marketId: string; side: 'up' | 'down'; strike: number; size: number; expiryMs: number; createdAt: number }>();
const executed = new Map<string, NonNullable<ReturnType<typeof prepared.get>>>();
function broadcast(value: unknown) { for (const res of clients) res.write(`data: ${JSON.stringify(value)}\n\n`); }
async function save() { await mkdir('data', { recursive: true }); await writeFile(dbPath, JSON.stringify(rounds, null, 2)); broadcast({ type: 'rounds', rounds }); }
const missing = (name: string) => process.env[name] ? null : `Setup required: ${name}`;
function respond(res: ServerResponse, code: number, value: unknown) { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v)); }
function context(cadence: 1 | 5, strike: number, spot: number): Context {
  const now = Date.now(); const past = (age: number) => [...priceSamples].reverse().find(p => p.at <= now - age);
  return { cadence, strikeDistance: strike - spot, move60s: past(60_000) ? spot - past(60_000)!.forward : null, move5m: past(300_000) ? spot - past(300_000)!.forward : null, hourUtc: new Date().getUTCHours() };
}
async function body(req: AsyncIterable<Uint8Array>) { let s = ''; for await (const chunk of req) { s += chunk.toString(); if (s.length > 10_000) throw new Error('Body too large'); } return JSON.parse(s); }
async function marketList() { const list = (await markets()).markets; const forward = list.find(x => x.forward)?.forward; if (forward != null) { priceSamples.push({ at: Date.now(), forward }); while (priceSamples.length && priceSamples[0].at < Date.now() - 360_000) priceSamples.shift(); } return list; }
function safeError(e: unknown) { const s = String(e); return s.replace(/(TATUM_API_KEY|MEMWAL_MAINNET_KEY|MEMWAL_MAINNET_ACCOUNT_ID|EIDOLON_GHOST_KEY|OPENROUTER_API_KEY)=\S+/g, '$1=[redacted]'); }

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(); return; }
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }); clients.add(res); req.on('close', () => clients.delete(res)); res.write('data: {"type":"connected"}\n\n'); return; }
    if (url.pathname === '/status') {
      let rpc = process.env.TATUM_API_KEY ? 'Tatum' : 'dev RPC (not Tatum)'; let chainError = null;
      try { await chain().predict.read.executionMode(); } catch (e) { chainError = safeError(e); }
      let ghostBalance: number | null = null;
      if (process.env.EIDOLON_GHOST_KEY && !chainError) { try { ghostBalance = await chain().predict.read.balance(Ed25519Keypair.fromSecretKey(process.env.EIDOLON_GHOST_KEY).toSuiAddress()); } catch { /* status remains unknown */ } }
      respond(res, 200, { rpc, chainError, memoryNetwork: 'Walrus mainnet', ghostBalance, setup: [missing('TATUM_API_KEY'), missing('MEMWAL_MAINNET_KEY'), missing('MEMWAL_MAINNET_ACCOUNT_ID'), missing('EIDOLON_GHOST_KEY'), missing('OPENROUTER_API_KEY')].filter(Boolean), mainnetWrites: process.env.EIDOLON_ALLOW_MAINNET === 'I_ACKNOWLEDGE_REAL_USDC' }); return;
    }
    if (url.pathname === '/markets') { const result = await markets(); const forward = result.markets.find(x => x.forward)?.forward; if (forward != null) { priceSamples.push({ at: Date.now(), forward }); while (priceSamples.length && priceSamples[0].at < Date.now() - 360_000) priceSamples.shift(); } respond(res, 200, result); return; }
    if (url.pathname === '/rounds' && req.method === 'GET') { respond(res, 200, rounds); return; }
    if (url.pathname === '/leaderboard') { respond(res, 200, Object.values(rounds.reduce<Record<string, { player: string; rounds: number; settled: number; playerPnl: number; ghostPnl: number; wins1m: number; played1m: number; wins5m: number; played5m: number }>>((acc, r) => { const p = acc[r.player] ??= { player: r.player, rounds: 0, settled: 0, playerPnl: 0, ghostPnl: 0, wins1m: 0, played1m: 0, wins5m: 0, played5m: 0 }; p.rounds++; if (r.status === 'settled') { p.settled++; p.playerPnl += r.playerLeg?.pnl ?? 0; p.ghostPnl += r.ghost?.leg?.pnl ?? 0; if (r.cadence === 1) { p.played1m++; if ((r.playerLeg?.pnl ?? 0) > 0) p.wins1m++; } else { p.played5m++; if ((r.playerLeg?.pnl ?? 0) > 0) p.wins5m++; } } return acc; }, {}))); return; }
    if (url.pathname.startsWith('/ghost/')) { const address = url.pathname.slice(7); const hits = await memoryFor(address).recall(context(1, 0, 0)); respond(res, 200, { hits, profile: habitProfile(hits, context(1, 0, 0)) }); return; }
    if (url.pathname === '/plan' && req.method === 'POST') {
      const input = await body(req);
      const list = await marketList(); const m = list.find(x => x.id === input.marketId);
      if (!m) throw new Error('Market is not active');
      if (!/^0x[0-9a-f]{64}$/i.test(input.owner)) throw new Error('Invalid player address');
      if (input.side !== 'up' && input.side !== 'down') throw new Error('Choose UP or DOWN');
      const amount = Number(input.amount); const strike = input.strike == null ? m.suggestedStrike ?? undefined : Number(input.strike);
      const { descriptor, quote, c } = await plan(input.owner, m, input.side, amount, strike);
      let dryRun: unknown = null; let transaction: string | null = null;
      if (quote.accepting) {
        const built = await c.predict.tx.enqueuePlan(input.owner, descriptor, quote);
        built.transaction.setSender(input.owner);
        const bytes = await built.transaction.build({ client: c.client });
        transaction = toBase64(bytes);
        if (c.client instanceof SuiJsonRpcClient) {
          const result = await c.client.dryRunTransactionBlock({ transactionBlock: bytes });
          dryRun = { status: result.effects.status, events: result.events?.length ?? 0, rpc: c.rpc };
          if (result.effects.status.status === 'success') prepared.set(transaction, { player: input.owner.toLowerCase(), marketId: m.id, side: input.side, strike: strike ?? m.referencePrice ?? 0, size: amount, expiryMs: m.expiryMs, createdAt: Date.now() });
        } else {
          const result = await c.client.core.simulateTransaction({ transaction: bytes, include: { effects: true, events: true } });
          dryRun = { status: result.$kind === 'Transaction' ? { status: 'success' } : { status: 'failure', error: result.FailedTransaction.status.error?.message }, events: result.$kind === 'Transaction' ? result.Transaction.events?.length ?? 0 : 0, rpc: c.rpc };
        }
      }
      respond(res, 200, { marketId: m.id, side: input.side, strike: strike ?? m.referencePrice, amount, accepting: quote.accepting, refusal: quote.refusal, quote: { potentialPayout: quote.potentialPayout, orderFee: quote.orderFee, totalDebit: quote.totalDebit, expectedDebit: quote.expectedDebit, timing: { cutoffMs: String(quote.timing.cutoffMs) } }, dryRun, transaction, mode: process.env.EIDOLON_ALLOW_MAINNET === 'I_ACKNOWLEDGE_REAL_USDC' ? 'live writes enabled' : 'dry-run only', rpc: c.rpc }); return;
    }
    if (url.pathname === '/execute' && req.method === 'POST') {
      if (process.env.EIDOLON_ALLOW_MAINNET !== 'I_ACKNOWLEDGE_REAL_USDC') throw new Error('Dry-run only: mainnet writes disabled');
      if (!process.env.MEMWAL_MAINNET_KEY || !process.env.MEMWAL_MAINNET_ACCOUNT_ID) throw new Error('Setup required: Walrus Memory before live trading');
      if (!process.env.EIDOLON_GHOST_KEY) throw new Error('Setup required: EIDOLON_GHOST_KEY before live trading');
      const input = await body(req); const p = prepared.get(input.bytes);
      if (!p || Date.now() - p.createdAt > 30_000) throw new Error('Transaction was not recently prepared by Eidolon');
      prepared.delete(input.bytes);
      const c = chain(); if (!(c.client instanceof SuiJsonRpcClient)) throw new Error('Tatum JSON-RPC required for mainnet writes');
      const tx = await c.client.executeTransactionBlock({ transactionBlock: input.bytes, signature: input.signature, options: { showInput: true, showEffects: true, showEvents: true } });
      if (tx.effects?.status.status !== 'success') throw new Error(`Transaction failed: ${tx.effects?.status.error ?? 'unknown'}`);
      executed.set(tx.digest, p); respond(res, 200, { digest: tx.digest, rpc: c.rpc }); return;
    }
    if (url.pathname === '/rounds' && req.method === 'POST') {
      if (process.env.EIDOLON_ALLOW_MAINNET !== 'I_ACKNOWLEDGE_REAL_USDC') throw new Error('Dry-run only: mainnet writes disabled');
      const input = await body(req);
      const p = executed.get(input.digest);
      if (!p) throw new Error('Digest was not executed from an Eidolon plan');
      if (rounds.some(r => r.digest === input.digest)) throw new Error('Digest already registered');
      const c = chain(); if (!(c.client instanceof SuiJsonRpcClient)) throw new Error('Tatum JSON-RPC required for mainnet writes');
      const tx = await c.client.getTransactionBlock({ digest: input.digest, options: { showInput: true, showEffects: true, showEvents: true } });
      if (tx.effects?.status.status !== 'success' || tx.transaction?.data.sender?.toLowerCase() !== p.player) throw new Error('Unverified player transaction');
      const receipt = c.predict.decode.enqueue(tx);
      if (receipt.marketId !== p.marketId || receipt.side !== 'mint') throw new Error('Enqueue receipt differs from reviewed plan');
      const m = (await marketList()).find(x => x.id === receipt.marketId);
      if (!m) throw new Error('Enqueue market not active');
      const round: Round = { digest: input.digest, player: p.player, marketId: receipt.marketId, expiryMs: m.expiryMs, cadence: m.cadence, side: p.side, strike: p.strike, size: p.size, recordId: String(receipt.recordId), context: context(m.cadence, p.strike, m.forward ?? p.strike), status: 'player enqueued', createdAt: new Date().toISOString() };
      executed.delete(input.digest); rounds.push(round); await save(); respond(res, 201, round); void watch(round); return;
    }
    respond(res, 404, { error: 'Not found' });
  } catch (error) { respond(res, 400, { error: safeError(error) }); }
});

async function findQueueEvent(client: SuiJsonRpcClient, c: ReturnType<typeof chain>, name: string, marketId: string, recordId: string, earliestMs: number) {
  const packageId = c.config.packages.predictOrdersV1 ?? c.config.packages.predictOrders;
  if (!packageId) throw new Error('Predict queue event package missing from SDK config');
  let cursor: { txDigest: string; eventSeq: string } | null = null;
  for (let page = 0; page < 20; page++) {
    const result = await client.queryEvents({ query: { MoveEventType: `${packageId}::queue_events::${name}` }, cursor, limit: 50, order: 'descending' });
    for (const event of result.data) {
      const data = event.parsedJson as Record<string, unknown>;
      if (String(data.expiry_market_id).toLowerCase() === marketId.toLowerCase() && String(data.record_id) === recordId) return event.id.txDigest;
    }
    if (!result.hasNextPage || !result.data.length || Number(result.data.at(-1)?.timestampMs ?? 0) < earliestMs) break;
    cursor = result.nextCursor ?? null;
  }
  return null;
}
async function filledLeg(c: ReturnType<typeof chain>, digest: string, marketId: string, recordId: string, earliestMs: number): Promise<Leg | null> {
  if (!(c.client instanceof SuiJsonRpcClient)) return null;
  const fillDigest = await findQueueEvent(c.client, c, 'QueuedOrderFilled', marketId, recordId, earliestMs);
  if (!fillDigest) return null;
  const tx = await c.client.getTransactionBlock({ digest: fillDigest, options: { showEvents: true } });
  const fill = c.predict.decode.queuedFills(tx).find(x => x.marketId === marketId && String(x.recordId) === recordId);
  if (!fill?.position) return null;
  const mint = c.predict.decode.mints(tx).find(x => x.orderId === fill.position?.orderId);
  return { digest, recordId, orderId: String(fill.position.orderId), cost: fill.amount + fill.fees.order, premium: mint?.premium ?? fill.amount, fillDigest };
}
let ghostQueue = Promise.resolve();
async function narrate(hits: Hit[], decision: ReturnType<typeof ghostDecision>): Promise<string | undefined> {
  if (!process.env.OPENROUTER_API_KEY) return undefined;
  const facts = hits.filter((h): h is Hit & { memory: TradeMemory } => h.memory.kind === 'round').map(h => ({ blobId: h.blobId, side: h.memory.side, hit: h.memory.hit, size: h.memory.size, minuteMove: h.memory.context.move60s }));
  const allowed = new Set([...JSON.stringify(facts).matchAll(/-?\d+(?:\.\d+)?/g)].map(m => m[0])); allowed.add(String(decision.size));
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.EIDOLON_MODEL ?? 'openai/gpt-4.1-mini', messages: [{ role: 'system', content: 'Write one short teasing sentence to the player based only on the supplied recalled Walrus trade facts. State the ghost side and size. Do not add any number that is absent from the supplied JSON. Do not invent outcomes.' }, { role: 'user', content: JSON.stringify({ facts, ghostSide: decision.side, ghostSize: decision.size }) }] }) });
  if (!response.ok) return undefined;
  const result = await response.json() as { choices?: { message?: { content?: string } }[] };
  const line = result.choices?.[0]?.message?.content?.trim();
  if (!line || line.length > 300 || [...line.matchAll(/-?\d+(?:\.\d+)?/g)].some(m => !allowed.has(m[0]))) return undefined;
  return line;
}
async function placeGhost(round: Round, hits: Hit[]) {
  const decision = ghostDecision(round.side, hits, round.context, Number(process.env.EIDOLON_GHOST_MAX_USDC ?? 5));
  round.ghost = { side: decision.side, size: decision.size, profile: decision.profile, recalledBlobIds: decision.blobIds, status: 'recalled' };
  try { round.ghost.line = await narrate(hits, decision); } catch { /* narration is optional, policy is fixed */ }
  await save();
  if (process.env.EIDOLON_ALLOW_MAINNET !== 'I_ACKNOWLEDGE_REAL_USDC') { round.ghost.status = 'dry-run only'; return; }
  if (!process.env.TATUM_API_KEY) { round.ghost.status = 'Setup required: TATUM_API_KEY'; return; }
  if (!process.env.EIDOLON_GHOST_KEY) { round.ghost.status = 'Setup required: EIDOLON_GHOST_KEY'; return; }
  const keypair = Ed25519Keypair.fromSecretKey(process.env.EIDOLON_GHOST_KEY);
  const owner = keypair.toSuiAddress();
  const maxDaily = Number(process.env.EIDOLON_GHOST_DAILY_USDC ?? 10);
  if (!Number.isFinite(maxDaily) || maxDaily < 1) throw new Error('EIDOLON_GHOST_DAILY_USDC must be positive');
  const spent = rounds.filter(r => r.ghost?.leg && r.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((n, r) => n + (r.ghost?.size ?? 0), 0);
  if (spent + decision.size > maxDaily) { round.ghost.status = 'daily cap reached'; return; }
  const c = chain(); if (!(c.client instanceof SuiJsonRpcClient)) throw new Error('Tatum required for ghost writes');
  if (await c.predict.read.balance(owner) < decision.size) { round.ghost.status = 'ghost Predict balance too low'; return; }
  const active = (await marketList()).find(m => m.id === round.marketId);
  if (!active || active.expiryMs - Date.now() < 10_000) { round.ghost.status = 'same expiry cutoff passed'; return; }
  const { descriptor, quote } = await plan(owner, active, decision.side, decision.size, round.strike);
  if (!quote.accepting) { round.ghost.status = `plan refused: ${quote.refusal}`; return; }
  const { transaction } = await c.predict.tx.enqueuePlan(owner, descriptor, quote);
  transaction.setSender(owner);
  const bytes = await transaction.build({ client: c.client });
  const dry = await c.client.dryRunTransactionBlock({ transactionBlock: bytes });
  if (dry.effects.status.status !== 'success') { round.ghost.status = `dry-run failed: ${dry.effects.status.error ?? 'unknown'}`; return; }
  const sent = await c.client.signAndExecuteTransaction({ transaction: bytes, signer: keypair, options: { showEvents: true, showEffects: true } });
  if (sent.effects?.status.status !== 'success') { round.ghost.status = 'onchain enqueue failed'; return; }
  const receipt = c.predict.decode.enqueue(sent);
  round.ghost.status = 'enqueued';
  round.ghost.leg = { digest: sent.digest, recordId: String(receipt.recordId), orderId: '', cost: 0, premium: 0 };
  await save();
}
async function paidLeg(c: ReturnType<typeof chain>, leg: Leg, marketId: string, earliestMs: number): Promise<boolean> {
  if (!(c.client instanceof SuiJsonRpcClient)) return false;
  const digest = await findQueueEvent(c.client, c, 'OpenRecordSettled', marketId, leg.recordId, earliestMs);
  if (!digest) return false;
  const tx = await c.client.getTransactionBlock({ digest, options: { showEvents: true } });
  const paid = c.predict.decode.openRecordPayouts(tx).find(x => x.marketId === marketId && String(x.recordId) === leg.recordId && !x.skipped);
  if (!paid) return false;
  leg.payout = paid.payout; leg.pnl = Math.round((paid.payout - leg.cost) * 1e6) / 1e6; leg.payoutDigest = digest;
  return true;
}
async function settle(round: Round, c: ReturnType<typeof chain>) {
  while (Date.now() < round.expiryMs + 30_000) await new Promise(resolve => setTimeout(resolve, Math.min(30_000, round.expiryMs + 30_000 - Date.now())));
  const coords = { underlying: 'BTC', expiryMs: round.expiryMs, marketId: round.marketId };
  for (let i = 0; i < 40; i++) {
    const settlement = await c.predict.read.settlement(coords);
    if (settlement.settled && settlement.settlementPrice != null && settlement.settlementPriceRaw != null) {
      round.settlement = settlement.settlementPrice;
      const legs = [round.playerLeg, round.ghost?.leg].filter((x): x is Leg => Boolean(x?.orderId));
      const proof = await Promise.all(legs.map(leg => paidLeg(c, leg, round.marketId, round.expiryMs)));
      if (proof.every(Boolean)) {
        for (const leg of legs) { const computed = Number(cost.settledPayout(BigInt(leg.orderId), settlement.settlementPriceRaw, settlement.tickSizeRaw)) / 1e6; if (Math.abs(computed - (leg.payout ?? 0)) > 0.000001) throw new Error('Settlement event differs from contract payout math'); }
        round.status = 'payout verified'; await save();
        if (!round.memoryBlobId && round.playerLeg) {
          const memory: TradeMemory = { kind: 'round', player: round.player, cadence: round.cadence, side: round.side, strike: round.strike, distance: round.context.strikeDistance, size: round.size, premium: round.playerLeg.premium, context: round.context, hit: (round.playerLeg.payout ?? 0) > 0, pnl: round.playerLeg.pnl ?? 0, fillDigest: round.playerLeg.fillDigest ?? '', ghost: round.ghost?.leg ? { side: round.ghost.side, size: round.ghost.size, pnl: round.ghost.leg.pnl ?? 0, fillDigest: round.ghost.leg.fillDigest ?? '' } : undefined, createdAt: new Date().toISOString() };
          round.memoryBlobId = await memoryFor(round.player).remember(memory); await save();
          const count = rounds.filter(r => r.player === round.player && r.memoryBlobId).length;
          if (count % 5 === 0) { const recent = rounds.filter(r => r.player === round.player && r.playerLeg?.pnl != null).slice(-5); const up = recent.filter(r => r.side === 'up'); await memoryFor(round.player).remember({ kind: 'analysis', player: round.player, line: `Last ${recent.length} trades: UP ${up.length}, wins ${recent.filter(r => (r.playerLeg?.pnl ?? 0) > 0).length}.`, createdAt: new Date().toISOString() }); }
        }
        round.status = 'settled'; await save(); return;
      }
      round.status = 'settlement price recorded; payout event pending'; await save();
    }
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
}
async function watch(round: Round) {
  try {
    const c = chain(); const coords = { underlying: 'BTC', expiryMs: round.expiryMs, marketId: round.marketId };
    if (!round.playerLeg) {
      const outcome = await c.predict.read.waitForOutcome(coords, BigInt(round.recordId));
      if (outcome.outcome === 'refunded') { round.status = 'player refunded'; await save(); return; }
      const leg = await filledLeg(c, round.digest, round.marketId, round.recordId, Date.parse(round.createdAt) - 5000);
      if (!leg) { round.status = `fill evidence pending (${outcome.outcome})`; await save(); return; }
      round.playerLeg = leg; round.status = 'player filled'; await save();
    }
    if (!round.ghost && Date.now() < round.expiryMs - 10_000) {
      if (!process.env.MEMWAL_MAINNET_KEY || !process.env.MEMWAL_MAINNET_ACCOUNT_ID) { round.status = 'ghost blocked: memory setup required'; await save(); }
      else {
        const hits = await memoryFor(round.player).recall(round.context);
        if (!hits.some(h => h.memory.kind === 'round')) { round.status = 'first round: no past trade memory'; await save(); }
        else { ghostQueue = ghostQueue.catch(() => {}).then(() => placeGhost(round, hits)); await ghostQueue; round.status = 'ghost decision processed'; await save(); }
      }
    }
    if (round.ghost?.leg && !round.ghost.leg.orderId) {
      const outcome = await c.predict.read.waitForOutcome(coords, BigInt(round.ghost.leg.recordId));
      const leg = await filledLeg(c, round.ghost.leg.digest, round.marketId, round.ghost.leg.recordId, Date.parse(round.createdAt));
      if (leg) { round.ghost.leg = leg; round.ghost.status = 'filled'; await save(); }
      else { round.ghost.status = `fill evidence pending (${outcome.outcome})`; await save(); }
    }
    await settle(round, c);
  } catch (e) { round.status = `watch error: ${safeError(e)}`; await save(); }
}
for (const round of rounds.filter(r => r.status !== 'settled' && r.status !== 'player refunded')) void watch(round);
server.listen(Number(process.env.EIDOLON_PORT ?? 8787), () => console.log(`Eidolon server listening on ${process.env.EIDOLON_PORT ?? 8787}`));
