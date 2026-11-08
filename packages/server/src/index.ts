import 'dotenv/config';
import { createServer, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chain, markets, plan, memoryFor, ghostDecision, habitProfile, type Context, type Hit } from '@eidolon/core';
import { toBase64 } from '@mysten/sui/utils';

type Round = { digest: string; player: string; marketId: string; expiryMs: number; side: 'up' | 'down'; strike: number; size: number; recordId: string; status: string; ghost?: unknown; settlement?: number; createdAt: string };
const dbPath = 'data/rounds.json';
let rounds: Round[] = [];
try { rounds = JSON.parse(await readFile(dbPath, 'utf8')); } catch { /* first run */ }
const clients = new Set<ServerResponse>();
const prepared = new Map<string, { player: string; marketId: string; side: 'up' | 'down'; strike: number; size: number; expiryMs: number; createdAt: number }>();
const executed = new Map<string, NonNullable<ReturnType<typeof prepared.get>>>();
function broadcast(value: unknown) { for (const res of clients) res.write(`data: ${JSON.stringify(value)}\n\n`); }
async function save() { await mkdir('data', { recursive: true }); await writeFile(dbPath, JSON.stringify(rounds, null, 2)); broadcast({ type: 'rounds', rounds }); }
const missing = (name: string) => process.env[name] ? null : `Setup required: ${name}`;
function respond(res: ServerResponse, code: number, value: unknown) { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(value)); }
function context(cadence: 1 | 5, strike: number, spot: number): Context { return { cadence, strikeDistance: strike - spot, move60s: null, move5m: null, hourUtc: new Date().getUTCHours() }; }
async function body(req: AsyncIterable<Uint8Array>) { let s = ''; for await (const chunk of req) { s += chunk.toString(); if (s.length > 10_000) throw new Error('Body too large'); } return JSON.parse(s); }
async function marketList() { return (await markets()).markets; }
function safeError(e: unknown) { const s = String(e); return s.replace(/(TATUM_API_KEY|MEMWAL_MAINNET_KEY|MEMWAL_MAINNET_ACCOUNT_ID|EIDOLON_GHOST_KEY|OPENROUTER_API_KEY)=\S+/g, '$1=[redacted]'); }

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(); return; }
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }); clients.add(res); req.on('close', () => clients.delete(res)); res.write('data: {"type":"connected"}\n\n'); return; }
    if (url.pathname === '/status') {
      let rpc = process.env.TATUM_API_KEY ? 'Tatum' : 'dev RPC (not Tatum)'; let chainError = null;
      try { await chain().predict.read.executionMode(); } catch (e) { chainError = safeError(e); }
      let ghostBalance: string | null = null;
      respond(res, 200, { rpc, chainError, memoryNetwork: 'Walrus mainnet', ghostBalance, setup: [missing('TATUM_API_KEY'), missing('MEMWAL_MAINNET_KEY'), missing('MEMWAL_MAINNET_ACCOUNT_ID'), missing('EIDOLON_GHOST_KEY'), missing('OPENROUTER_API_KEY')].filter(Boolean), mainnetWrites: process.env.EIDOLON_ALLOW_MAINNET === 'I_ACKNOWLEDGE_REAL_USDC' }); return;
    }
    if (url.pathname === '/markets') { respond(res, 200, await markets()); return; }
    if (url.pathname === '/rounds' && req.method === 'GET') { respond(res, 200, rounds); return; }
    if (url.pathname === '/leaderboard') { respond(res, 200, Object.values(rounds.reduce<Record<string, { player: string; rounds: number; settled: number }>>((acc, r) => { const p = acc[r.player] ??= { player: r.player, rounds: 0, settled: 0 }; p.rounds++; if (r.status === 'settled') p.settled++; return acc; }, {}))); return; }
    if (url.pathname.startsWith('/ghost/')) { const address = url.pathname.slice(7); const hits = await memoryFor(address).recall(context(1, 0, 0)); respond(res, 200, { hits, profile: habitProfile(hits, context(1, 0, 0)) }); return; }
    if (url.pathname === '/plan' && req.method === 'POST') {
      const input = await body(req);
      const list = await marketList(); const m = list.find(x => x.id === input.marketId);
      if (!m) throw new Error('Market is not active');
      if (!/^0x[0-9a-f]{64}$/i.test(input.owner)) throw new Error('Invalid player address');
      if (input.side !== 'up' && input.side !== 'down') throw new Error('Choose UP or DOWN');
      const amount = Number(input.amount); const strike = input.strike == null ? undefined : Number(input.strike);
      const { descriptor, quote, c } = await plan(input.owner, m, input.side, amount, strike);
      let dryRun: unknown = null; let transaction: string | null = null;
      if (quote.accepting) {
        const built = await c.predict.tx.enqueuePlan(input.owner, descriptor, quote);
        built.transaction.setSender(input.owner);
        const bytes = await built.transaction.build({ client: c.client });
        transaction = toBase64(bytes);
        const result = await c.client.dryRunTransactionBlock({ transactionBlock: bytes });
        dryRun = { status: result.effects.status, events: result.events?.length ?? 0, rpc: c.rpc };
        if (result.effects.status.status === 'success') prepared.set(transaction, { player: input.owner.toLowerCase(), marketId: m.id, side: input.side, strike: strike ?? m.referencePrice ?? 0, size: amount, expiryMs: m.expiryMs, createdAt: Date.now() });
      }
      respond(res, 200, { marketId: m.id, side: input.side, strike: strike ?? m.referencePrice, amount, accepting: quote.accepting, refusal: quote.refusal, quote: { potentialPayout: quote.potentialPayout, orderFee: quote.orderFee, totalDebit: quote.totalDebit, expectedDebit: quote.expectedDebit, timing: { cutoffMs: String(quote.timing.cutoffMs) } }, dryRun, transaction, mode: process.env.EIDOLON_ALLOW_MAINNET === 'I_ACKNOWLEDGE_REAL_USDC' ? 'live writes enabled' : 'dry-run only', rpc: c.rpc }); return;
    }
    if (url.pathname === '/execute' && req.method === 'POST') {
      if (process.env.EIDOLON_ALLOW_MAINNET !== 'I_ACKNOWLEDGE_REAL_USDC') throw new Error('Dry-run only: mainnet writes disabled');
      const input = await body(req); const p = prepared.get(input.bytes);
      if (!p || Date.now() - p.createdAt > 30_000) throw new Error('Transaction was not recently prepared by Eidolon');
      prepared.delete(input.bytes);
      const c = chain();
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
      const c = chain();
      const tx = await c.client.getTransactionBlock({ digest: input.digest, options: { showInput: true, showEffects: true, showEvents: true } });
      if (tx.effects?.status.status !== 'success' || tx.transaction?.data.sender?.toLowerCase() !== p.player) throw new Error('Unverified player transaction');
      const receipt = c.predict.decode.enqueue(tx);
      if (receipt.marketId !== p.marketId || receipt.side !== 'mint') throw new Error('Enqueue receipt differs from reviewed plan');
      const m = (await marketList()).find(x => x.id === receipt.marketId);
      if (!m) throw new Error('Enqueue market not active');
      const round: Round = { digest: input.digest, player: p.player, marketId: receipt.marketId, expiryMs: m.expiryMs, side: p.side, strike: p.strike, size: p.size, recordId: String(receipt.recordId), status: 'player enqueued', createdAt: new Date().toISOString() };
      executed.delete(input.digest); rounds.push(round); await save(); respond(res, 201, round); void watch(round); return;
    }
    respond(res, 404, { error: 'Not found' });
  } catch (error) { respond(res, 400, { error: safeError(error) }); }
});

async function watch(round: Round) {
  try {
    const c = chain(); const coords = { underlying: 'BTC_USD', expiryMs: round.expiryMs, marketId: round.marketId };
    const outcome = await c.predict.read.waitForOutcome(coords, BigInt(round.recordId));
    if (outcome.outcome !== 'filled') { round.status = `player ${outcome.outcome}`; await save(); return; }
    round.status = 'player filled'; await save();
    if (!process.env.MEMWAL_MAINNET_KEY || !process.env.MEMWAL_MAINNET_ACCOUNT_ID) { round.status = 'ghost blocked: memory setup required'; await save(); return; }
    const hits: Hit[] = await memoryFor(round.player).recall(context(1, round.strike, round.strike));
    if (!hits.some(h => h.memory.kind === 'round')) { round.status = 'ghost blocked: no past trade memory'; await save(); return; }
    const decision = ghostDecision(round.side, hits, context(1, round.strike, round.strike), Number(process.env.EIDOLON_GHOST_MAX_USDC ?? 5));
    round.ghost = { ...decision, recalledBlobIds: decision.blobIds, status: 'decision only; ghost transaction not submitted' };
    round.status = 'ghost decision ready'; await save();
  } catch (e) { round.status = `watch error: ${safeError(e)}`; await save(); }
}
for (const round of rounds.filter(r => r.status === 'player enqueued')) void watch(round);
server.listen(Number(process.env.EIDOLON_PORT ?? 8787), () => console.log(`Eidolon server listening on ${process.env.EIDOLON_PORT ?? 8787}`));
