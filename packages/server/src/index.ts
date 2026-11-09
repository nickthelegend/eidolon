import 'dotenv/config';
import { createServer, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  chain,
  markets,
  plan,
  memoryFor,
  ghostDecision,
  ghostStrike,
  habitProfile,
  predictHistory,
  type Context,
  type Hit,
  type TradeMemory,
  forkUrl,
  forkWrites,
  forkStatus,
} from '@eidolon/core';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { createDemoSigner } from './demo-signer.js';
import { config as loadEnv } from 'dotenv';
import { cost, decodeMoveAbort, describePredictError } from '@mysten/deepbook-v3/predict';

// Turns a Predict Move abort into the SDK's own plain sentence,
// keeping the module::constant so the chain error stays checkable. Returns null when the error is not a Move abort.
function explainAbort(err: unknown): string | null {
  const pe = err as any;
  // The SDK's own PredictMoveError already carries module and constant name.
  if (pe && typeof pe === 'object' && typeof pe.module === 'string' && 'abortName' in pe && !pe.MoveAbort)
    return `${describePredictError(pe) ?? 'Predict refused this transaction.'} (${pe.module}::${pe.abortName ?? `code ${pe.code}`})`;
  let e: any = err;
  const text = typeof err === 'string' ? err : typeof (err as any)?.message === 'string' ? (err as any).message : '';
  if (!e?.MoveAbort && text) {
    const m = text.match(/Identifier\("([a-z_]+)"\)[\s\S]*?\},\s*(\d+)\)/);
    if (m) e = { MoveAbort: { location: { module: m[1] }, abortCode: m[2] } };
    const m2 = !m && text.match(/abort code: (\d+), in '0x[0-9a-fA-F]+::([a-z_]+)::/);
    if (m2) e = { MoveAbort: { location: { module: m2[2] }, abortCode: m2[1] } };
  }
  const d = decodeMoveAbort(e);
  if (!d) return null;
  return `${describePredictError(d) ?? 'Predict refused this transaction.'} (${d.module}::${d.abortName ?? `code ${d.code}`})`;
}

type Leg = {
  digest: string;
  recordId: string;
  orderId: string;
  cost: number;
  premium: number;
  payout?: number;
  pnl?: number;
  fillDigest?: string;
  payoutDigest?: string;
};
type Round = {
  digest: string;
  player: string;
  marketId: string;
  expiryMs: number;
  cadence: 1 | 5;
  side: 'up' | 'down';
  strike: number;
  size: number;
  recordId: string;
  context: Context;
  status: string;
  playerLeg?: Leg;
  ghost?: {
    side: 'up' | 'down';
    size: number;
    strike?: number;
    exactMirror?: boolean;
    recalledBlobIds: string[];
    profile: ReturnType<typeof habitProfile>;
    line?: string;
    leg?: Leg;
    status: string;
  };
  settlement?: number;
  memoryBlobId?: string;
  createdAt: string;
};
// Fork runs keep their own round registry so fork digests never mix with mainnet rounds.
const dataDir = forkUrl('EIDOLON') ? 'data-fork' : 'data';
const dbPath = `${dataDir}/rounds.json`;
let rounds: Round[] = [];
try {
  rounds = JSON.parse(await readFile(dbPath, 'utf8'));
} catch {
  /* first run */
}
const clients = new Set<ServerResponse>();
const priceSamples: { at: number; forward: number }[] = [];
// Keep 30 minutes of the Predict BTC forward, as the server saw it, for the live chart.
function samplePrice(forward: number) {
  priceSamples.push({ at: Date.now(), forward });
  while (priceSamples.length && priceSamples[0].at < Date.now() - 1_800_000) priceSamples.shift();
}
setInterval(() => { void marketsCached().catch(() => {}); }, 4_000).unref();
const prepared = new Map<
  string,
  {
    player: string;
    marketId: string;
    side: 'up' | 'down';
    strike: number;
    size: number;
    expiryMs: number;
    createdAt: number;
  }
>();
const preparedFunding = new Map<string, { address: string; at: number }>();
// Tatum's free plan allows about 3 requests a second, and every open page polls /status and /markets every 15 s.
// Short shared caches with in-flight de-duplication keep those polls from queueing behind each other.
const memoStore = new Map<string, { at: number; value: Promise<unknown> }>();
function memo<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = run();
  memoStore.set(key, { at: Date.now(), value });
  value.catch(() => memoStore.delete(key));
  return value;
}
// Stale-while-revalidate: answer from the last value (up to maxStaleMs old) and refresh in the background after freshMs.
const swrStore = new Map<string, { at: number; value: Promise<unknown>; refreshing?: Promise<unknown> }>();
function swr<T>(key: string, freshMs: number, maxStaleMs: number, run: () => Promise<T>): Promise<T> {
  const hit = swrStore.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (age > freshMs && !hit?.refreshing) {
    const next = run();
    if (hit) hit.refreshing = next;
    else swrStore.set(key, { at: 0, value: next, refreshing: next });
    next
      .then(() => swrStore.set(key, { at: Date.now(), value: next }))
      .catch(() => { const h = swrStore.get(key); if (h) h.refreshing = undefined; });
  }
  const now = swrStore.get(key)!;
  return (now.at && Date.now() - now.at < maxStaleMs ? now.value : now.refreshing ?? now.value) as Promise<T>;
}
// Stale-while-revalidate for markets: answer with the last list (up to 60 s old) and refresh it in the background after 8 s.
let marketsState: { at: number; value: ReturnType<typeof markets> } | null = null;
let marketsRefresh: ReturnType<typeof markets> | null = null;
function marketsCached(): ReturnType<typeof markets> {
  const age = marketsState ? Date.now() - marketsState.at : Infinity;
  if (age > 8_000 && !marketsRefresh) {
    const next = markets();
    marketsRefresh = next;
    next
      .then((r) => {
        marketsState = { at: Date.now(), value: next };
        const forward = r.markets.find((x) => x.forward)?.forward;
        if (forward != null) samplePrice(forward);
      })
      .catch(() => {})
      .finally(() => { marketsRefresh = null; });
  }
  if (marketsState && age < 60_000) return marketsState.value;
  return marketsRefresh ?? marketsState!.value;
}
const executed = new Map<string, NonNullable<ReturnType<typeof prepared.get>>>();
function broadcast(value: unknown) {
  for (const res of clients) res.write(`data: ${JSON.stringify(value)}\n\n`);
}
async function save() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(rounds, null, 2));
  broadcast({ type: 'rounds', rounds });
}
// LOCAL FORK mode (EIDOLON_SUI_FORK_RPC): writes go only to the local sui-fork and only with
// EIDOLON_ALLOW_FORK_WRITES=LOCAL_FORK_ONLY. The mainnet gate is refused while a fork RPC is set.
const fork = forkUrl('EIDOLON');
const mainnetLive = () => !fork && process.env.EIDOLON_ALLOW_MAINNET === 'I_ACKNOWLEDGE_REAL_USDC';
const writesOn = () => mainnetLive() || forkWrites('EIDOLON');
if (process.env.DEMO_SIGNER === 'I_UNDERSTAND_SERVER_HOLDS_KEYS' && !fork)
  loadEnv({ path: new URL('../../../.env', import.meta.url), quiet: true });
const demoSigner = createDemoSigner(
  [{ label: 'Eidolon player', variable: 'DEMO_PLAYER_KEY' }],
  { get: (bytes) => { const p = prepared.get(bytes); return p && { address: p.player, at: p.createdAt }; } },
  preparedFunding,
  () => writesOn(),
  // On the fork the demo signer may only use the fork-only player key from .env.fork, never the mainnet .env.
  fork ? { DEMO_SIGNER: process.env.DEMO_SIGNER, DEMO_PLAYER_KEY: process.env.EIDOLON_PLAYER_KEY } : process.env,
);
const modeLabel = () =>
  fork ? (forkWrites('EIDOLON') ? 'LOCAL FORK writes enabled' : 'LOCAL FORK dry-run only') : mainnetLive() ? 'live writes enabled' : 'dry-run only';
const missing = (name: string) => (process.env[name] ? null : `Setup required: ${name}`);
function respond(res: ServerResponse, code: number, value: unknown) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : v)));
}
function context(cadence: 1 | 5, strike: number, spot: number): Context {
  const now = Date.now();
  const past = (age: number) => [...priceSamples].reverse().find((p) => p.at <= now - age);
  return {
    cadence,
    strikeDistance: strike - spot,
    move60s: past(60_000) ? spot - past(60_000)!.forward : null,
    move5m: past(300_000) ? spot - past(300_000)!.forward : null,
    hourUtc: new Date().getUTCHours(),
  };
}
async function body(req: AsyncIterable<Uint8Array>) {
  let s = '';
  for await (const chunk of req) {
    s += chunk.toString();
    if (s.length > 10_000) throw new Error('Body too large');
  }
  return JSON.parse(s);
}
async function marketList() {
  const list = (await marketsCached()).markets;
  return list;
}
function safeError(e: unknown) {
  let s = String(e);
  for (const name of [
    'TATUM_API_KEY',
    'MEMWAL_MAINNET_KEY',
    'MEMWAL_MAINNET_ACCOUNT_ID',
    'EIDOLON_GHOST_KEY',
    'OPENROUTER_API_KEY',
  ]) {
    const value = process.env[name];
    if (value) s = s.replaceAll(value, '[redacted]');
  }
  return s.replace(
    /(TATUM_API_KEY|MEMWAL_MAINNET_KEY|MEMWAL_MAINNET_ACCOUNT_ID|EIDOLON_GHOST_KEY|OPENROUTER_API_KEY)=\S+/g,
    '$1=[redacted]',
  );
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }
  try {
    if (await demoSigner(req, res)) return;
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      });
      clients.add(res);
      req.on('close', () => clients.delete(res));
      res.write('data: {"type":"connected"}\n\n');
      return;
    }
    if (url.pathname === '/status') {
      const forkInfo = fork ? await forkStatus(chain().client) : null;
      let rpc = forkInfo ? forkInfo.label : process.env.TATUM_API_KEY ? 'Tatum' : 'dev RPC (not Tatum)';
      const { chainError, ghostBalance } = await swr('status-chain', 20_000, 120_000, async () => {
        let chainError: string | null = null;
        try {
          await chain().predict.read.executionMode();
        } catch (e) {
          chainError = safeError(e);
        }
        let ghostBalance: number | null = null;
        if (process.env.EIDOLON_GHOST_KEY && !chainError) {
          try {
            ghostBalance = await chain().predict.read.balance(
              Ed25519Keypair.fromSecretKey(process.env.EIDOLON_GHOST_KEY).toSuiAddress(),
            );
          } catch {
            /* status remains unknown */
          }
        }
        return { chainError, ghostBalance };
      });
      respond(res, 200, {
        rpc,
        chainError,
        memoryNetwork: 'Walrus mainnet',
        ghostBalance,
        setup: [
          missing('TATUM_API_KEY'),
          missing('MEMWAL_MAINNET_KEY'),
          missing('MEMWAL_MAINNET_ACCOUNT_ID'),
          missing('EIDOLON_GHOST_KEY'),
          missing('OPENROUTER_API_KEY'),
        ].filter(Boolean),
        mainnetWrites: mainnetLive(),
        fork: forkInfo && { ...forkInfo, writes: forkWrites('EIDOLON') },
      });
      return;
    }
    if (url.pathname === '/prices') {
      respond(res, 200, { source: 'DeepBook Predict BTC forward, sampled by this server', samples: priceSamples });
      return;
    }
    if (url.pathname === '/markets') {
      const result = await marketsCached();
      respond(res, 200, result);
      return;
    }
    if (url.pathname === '/rounds' && req.method === 'GET') {
      respond(res, 200, rounds);
      return;
    }
    if (url.pathname === '/leaderboard') {
      respond(
        res,
        200,
        Object.values(
          rounds.reduce<
            Record<
              string,
              {
                player: string;
                rounds: number;
                settled: number;
                playerPnl: number;
                ghostPnl: number;
                wins1m: number;
                played1m: number;
                wins5m: number;
                played5m: number;
              }
            >
          >((acc, r) => {
            const p = (acc[r.player] ??= {
              player: r.player,
              rounds: 0,
              settled: 0,
              playerPnl: 0,
              ghostPnl: 0,
              wins1m: 0,
              played1m: 0,
              wins5m: 0,
              played5m: 0,
            });
            p.rounds++;
            if (r.status === 'settled') {
              p.settled++;
              p.playerPnl += r.playerLeg?.pnl ?? 0;
              p.ghostPnl += r.ghost?.leg?.pnl ?? 0;
              if (r.cadence === 1) {
                p.played1m++;
                if ((r.playerLeg?.pnl ?? 0) > 0) p.wins1m++;
              } else {
                p.played5m++;
                if ((r.playerLeg?.pnl ?? 0) > 0) p.wins5m++;
              }
            }
            return acc;
          }, {}),
        ),
      );
      return;
    }
    const historyPath = url.pathname.match(/^\/history\/(0x[0-9a-f]{64})(\/remember)?$/i);
    if (historyPath) {
      const address = historyPath[1].toLowerCase();
      if (historyPath[2]) {
        if (req.method !== 'POST') throw new Error('Method not allowed');
        if (!process.env.MEMWAL_MAINNET_KEY) throw new Error('Setup required: MEMWAL_MAINNET_KEY');
        if (!process.env.MEMWAL_MAINNET_ACCOUNT_ID) throw new Error('Setup required: MEMWAL_MAINNET_ACCOUNT_ID');
        // Storing public trade history on Walrus moves no funds, so it needs only the Walrus keys, not the USDC gate.
        const trades = await predictHistory(address, { limit: 200 });
        const { blobIds, failed } = await memoryFor(address).rememberMany(trades);
        memoStore.delete(`recall:${address}`); // the next read rebuilds the ghost from what Walrus now holds
        if (failed.length) throw new Error(`Walrus stored ${blobIds.length} of ${trades.length} trade memories; ${failed.length} failed: ${failed[0].error}`);
        respond(res, 200, { blobIds });
        return;
      }
      if (req.method !== 'GET') throw new Error('Method not allowed');
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const trades = await memo(`history:${address}:${limit}`, 120_000, () => predictHistory(address, { limit }));
      let hits: Hit[] = trades.map((trade) => ({ blobId: trade.fillDigest, memory: trade }));
      // With Walrus Memory configured, the ghost is built from what it recalls there; the trade list stays the chain's.
      let source = 'on-chain history, not yet in Walrus memory';
      let blobIds: string[] = [];
      let memoryError: string | null = null;
      if (process.env.MEMWAL_MAINNET_KEY && process.env.MEMWAL_MAINNET_ACCOUNT_ID) {
        try {
          const recalled = await memo(`recall:${address}`, 60_000, () => memoryFor(address).recall(context(1, 0, 0)));
          if (recalled.length) {
            hits = recalled;
            blobIds = recalled.map((h) => h.blobId);
            source = 'Walrus Memory mainnet';
          }
        } catch (error) {
          memoryError = String((error as Error).message ?? error);
        }
      }
      const profile = habitProfile(hits);
      let decision: ReturnType<typeof ghostDecision> | null = null;
      const marketId = url.searchParams.get('marketId');
      const side = url.searchParams.get('side');
      if (hits.length && marketId && (side === 'up' || side === 'down')) {
        const selected = (await marketList()).find((m) => m.id === marketId);
        if (selected?.forward != null) {
          const strike = side === 'up' ? selected.suggestedStrike : selected.suggestedStrikeDown;
          if (strike != null) {
            const liveContext = context(selected.cadence, strike, selected.forward);
            const picked = ghostDecision(side, hits, liveContext, Number(process.env.EIDOLON_GHOST_MAX_USDC ?? 5));
            decision = { ...picked, blobIds };
          }
        }
      }
      respond(res, 200, { trades, profile, decision, source, blobIds, memoryError });
      return;
    }
    if (url.pathname.startsWith('/ghost/')) {
      const address = url.pathname.slice(7);
      if (!/^0x[0-9a-f]{64}$/i.test(address)) throw new Error('Invalid player address');
      const hits = await memoryFor(address).recall(context(1, 0, 0));
      respond(res, 200, { hits, profile: habitProfile(hits, context(1, 0, 0)) });
      return;
    }
    if (url.pathname === '/fund' && req.method === 'POST') {
      const input = await body(req);
      if (!/^0x[0-9a-f]{64}$/i.test(input.owner)) throw new Error('Invalid player address');
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount < 1) throw new Error('Deposit at least 1 USDC');
      const c = chain();
      const transaction = c.predict.tx.deposit(input.owner, amount, { create: input.create === true });
      transaction.setSender(input.owner);
      const bytes = await transaction.build({ client: c.client });
      const encoded = toBase64(bytes);
      const dry = await c.client.core
        .simulateTransaction({ transaction: bytes, include: { effects: true } })
        .then((x) => ({
          status: x.$kind === 'Transaction' ? 'success' : 'failure',
          error: x.$kind === 'FailedTransaction' ? (explainAbort(x.FailedTransaction.status.error) ?? x.FailedTransaction.status.error?.message ?? null) : null,
        }));
      if (dry.status === 'success') preparedFunding.set(encoded, { address: input.owner.toLowerCase(), at: Date.now() });
      respond(res, 200, {
        dryRun: dry,
        transaction: dry.status === 'success' ? encoded : null,
        rpc: c.rpc,
        mode: modeLabel(),
      });
      return;
    }
    if (url.pathname === '/plan' && req.method === 'POST') {
      const input = await body(req);
      const list = await marketList();
      const m = list.find((x) => x.id === input.marketId);
      if (!m) throw new Error('Market is not active');
      if (!/^0x[0-9a-f]{64}$/i.test(input.owner)) throw new Error('Invalid player address');
      if (input.side !== 'up' && input.side !== 'down') throw new Error('Choose UP or DOWN');
      const amount = Number(input.amount);
      const strike =
        input.strike == null
          ? ((input.side === 'down' ? m.suggestedStrikeDown : m.suggestedStrike) ?? undefined)
          : Number(input.strike);
      const { descriptor, quote, c } = await plan(input.owner, m, input.side, amount, strike);
      let mirror: string;
      try {
        const opposite = input.side === 'up' ? 'down' : 'up';
        const view = await c.predict.read.planMint(
          input.owner,
          {
            underlying: 'BTC',
            expiryMs: m.expiryMs,
            marketId: m.id,
            side: opposite,
            strike: descriptor.strike as number | 'reference',
          },
          { amount: Math.max(2, amount), slippageCents: 5 },
        );
        mirror = view.refusal === 'entry-band' ? 'entry-band blocked' : 'entry band admissible';
      } catch (e) {
        mirror =
          String(e).includes('entry-band') || String(e).includes('entry band')
            ? 'entry-band blocked'
            : `unverified: ${safeError(e)}`;
      }
      // Where the ghost would stand: the live pricer picks the opposite-side strike it would bet at.
      let ghostPreview: { side: 'up' | 'down'; strike: number; probability: number; exact: boolean; playerProbability: number } | null = null;
      try {
        const pricer = await c.predict.read.pricer({ underlying: 'BTC', expiryMs: m.expiryMs });
        const playerStrike = typeof descriptor.strike === 'number' ? descriptor.strike : (m.referencePrice ?? pricer.forward);
        const ghostSide = input.side === 'up' ? 'down' : 'up';
        const pick = ghostStrike(pricer, ghostSide, playerStrike, m.admissionTickSize);
        if (pick) ghostPreview = { side: ghostSide, ...pick, playerProbability: pricer.probability(playerStrike, input.side) };
      } catch {
        ghostPreview = null;
      }
      let dryRun: unknown = null;
      let transaction: string | null = null;
      if (quote.accepting) {
        const built = await c.predict.tx.enqueuePlan(input.owner, descriptor, quote);
        built.transaction.setSender(input.owner);
        const bytes = await built.transaction.build({ client: c.client });
        transaction = toBase64(bytes);
        const result = await c.client.core.simulateTransaction({
          transaction: bytes,
          include: { effects: true, events: true },
        });
        dryRun = {
          status:
            result.$kind === 'Transaction'
              ? { status: 'success' }
              : { status: 'failure', error: explainAbort(result.FailedTransaction.status.error) ?? result.FailedTransaction.status.error?.message },
          events: result.$kind === 'Transaction' ? (result.Transaction.events?.length ?? 0) : 0,
          rpc: c.rpc,
        };
        if (result.$kind === 'Transaction')
          prepared.set(transaction, {
            player: input.owner.toLowerCase(),
            marketId: m.id,
            side: input.side,
            strike: strike ?? m.referencePrice ?? 0,
            size: amount,
            expiryMs: m.expiryMs,
            createdAt: Date.now(),
          });
      }
      respond(res, 200, {
        marketId: m.id,
        side: input.side,
        strike: strike ?? m.referencePrice,
        amount,
        accepting: quote.accepting,
        refusal: quote.refusal,
        mirror,
        ghostPreview,
        quote: {
          potentialPayout: quote.potentialPayout,
          orderFee: quote.orderFee,
          totalDebit: quote.totalDebit,
          expectedDebit: quote.expectedDebit,
          timing: { cutoffMs: String(quote.timing.cutoffMs) },
        },
        dryRun,
        transaction,
        mode: modeLabel(),
        rpc: c.rpc,
      });
      return;
    }
    if (url.pathname === '/execute' && req.method === 'POST') {
      if (!writesOn()) throw new Error('Dry-run only: mainnet writes disabled');
      if (!fork && !process.env.TATUM_API_KEY)
        throw new Error('Setup required: TATUM_API_KEY for mainnet writes');
      if (!fork && (!process.env.MEMWAL_MAINNET_KEY || !process.env.MEMWAL_MAINNET_ACCOUNT_ID))
        throw new Error('Setup required: Walrus Memory before live trading');
      if (!process.env.EIDOLON_GHOST_KEY)
        throw new Error('Setup required: EIDOLON_GHOST_KEY before live trading');
      const input = await body(req);
      const p = prepared.get(input.bytes);
      const fundingAt = preparedFunding.get(input.bytes);
      if ((!p || Date.now() - p.createdAt > 30_000) && (!fundingAt || Date.now() - fundingAt.at > 60_000))
        throw new Error('Transaction was not recently prepared by Eidolon');
      prepared.delete(input.bytes);
      preparedFunding.delete(input.bytes);
      const c = chain();
      const tx = await c.client.core.executeTransaction({
        transaction: fromBase64(input.bytes),
        signatures: [input.signature],
        include: { effects: true, events: true },
      });
      const outcome = tx.$kind === 'Transaction' ? tx.Transaction : tx.FailedTransaction;
      if (!outcome.effects?.status.success)
        throw new Error(`Transaction failed: ${outcome.effects?.status.error?.message ?? outcome.status.error?.message ?? 'unknown'}`);
      if (p) executed.set(outcome.digest, p);
      respond(res, 200, { digest: outcome.digest, rpc: c.rpc, kind: p ? 'trade' : 'funding' });
      return;
    }
    if (url.pathname === '/rounds' && req.method === 'POST') {
      if (!writesOn()) throw new Error('Dry-run only: mainnet writes disabled');
      if (!fork && !process.env.TATUM_API_KEY)
        throw new Error('Setup required: TATUM_API_KEY for mainnet writes');
      const input = await body(req);
      const p = executed.get(input.digest);
      if (!p) throw new Error('Digest was not executed from an Eidolon plan');
      if (rounds.some((r) => r.digest === input.digest)) throw new Error('Digest already registered');
      const c = chain();
      const result = await c.client.core.getTransaction({
        digest: input.digest,
        include: { transaction: true, effects: true, events: true },
      });
      if (result.$kind !== 'Transaction' || !result.Transaction.effects.status.success || result.Transaction.transaction?.sender?.toLowerCase() !== p.player)
        throw new Error('Unverified player transaction');
      const receipt = c.predict.decode.enqueue(result.Transaction);
      if (receipt.marketId !== p.marketId || receipt.side !== 'mint')
        throw new Error('Enqueue receipt differs from reviewed plan');
      const cadence = p.expiryMs % 300_000 === 0 ? 5 : 1;
      const round: Round = {
        digest: input.digest,
        player: p.player,
        marketId: receipt.marketId,
        expiryMs: p.expiryMs,
        cadence,
        side: p.side,
        strike: p.strike,
        size: p.size,
        recordId: String(receipt.recordId),
        context: context(cadence, p.strike, priceSamples.at(-1)?.forward ?? p.strike),
        status: 'player enqueued',
        createdAt: new Date().toISOString(),
      };
      executed.delete(input.digest);
      rounds.push(round);
      await save();
      respond(res, 201, round);
      void watch(round);
      return;
    }
    respond(res, 404, { error: 'Not found' });
  } catch (error) {
    respond(res, 400, { error: explainAbort(error) ?? safeError(error) });
  }
});

async function findQueueEvent(
  c: ReturnType<typeof chain>,
  name: string,
  marketId: string,
  recordId: string,
  earliestMs: number,
) {
  const packageId = c.config.packages.predictOrdersV1 ?? c.config.packages.predictOrders;
  if (!packageId) throw new Error('Predict queue event package missing from SDK config');
  let before: string | null = null;
  for (let page = 0; page < 20; page++) {
    const result = await c.events.core.listEvents({
      filter: { eventType: `${packageId}::queue_events::${name}` },
      limit: 50,
      order: 'descending',
      ...(before ? { before } : {}),
    });
    for (const event of result.events) {
      const data = event.json;
      if (
        String(data?.expiry_market_id).toLowerCase() === marketId.toLowerCase() &&
        String(data?.record_id) === recordId
      )
        return event.transactionDigest;
    }
    if (
      !result.hasNextPage ||
      !result.endCursor || result.endCursor === before ||
      (result.events.length > 0 && Number(result.events.at(-1)?.json?.onchain_timestamp_ms ?? Infinity) < earliestMs)
    )
      break;
    before = result.endCursor;
  }
  return null;
}
async function filledLeg(
  c: ReturnType<typeof chain>,
  digest: string,
  marketId: string,
  recordId: string,
  earliestMs: number,
): Promise<Leg | null> {
  const fillDigest = await findQueueEvent(c, 'QueuedOrderFilled', marketId, recordId, earliestMs);
  if (!fillDigest) return null;
  const result = await c.client.core.getTransaction({ digest: fillDigest, include: { events: true } });
  if (result.$kind !== 'Transaction') throw new Error(`Fill transaction failed: ${fillDigest}`);
  const tx = result.Transaction;
  const fill = c.predict.decode
    .queuedFills(tx)
    .find((x) => x.marketId === marketId && String(x.recordId) === recordId);
  if (!fill?.position) return null;
  const mint = c.predict.decode.mints(tx).find((x) => x.orderId === fill.position?.orderId);
  return {
    digest,
    recordId,
    orderId: String(fill.position.orderId),
    cost: fill.amount + fill.fees.order,
    premium: mint?.premium ?? fill.amount,
    fillDigest,
  };
}
let ghostQueue = Promise.resolve();
async function narrate(hits: Hit[], decision: ReturnType<typeof ghostDecision>): Promise<string | undefined> {
  if (!process.env.OPENROUTER_API_KEY) return undefined;
  const facts = hits
    .filter((h): h is Hit & { memory: TradeMemory } => h.memory.kind === 'round')
    .map((h) => ({
      blobId: h.blobId,
      side: h.memory.side,
      hit: h.memory.hit,
      size: h.memory.size,
      minuteMove: h.memory.context.move60s,
    }));
  const allowed = new Set([...JSON.stringify(facts).matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => m[0]));
  allowed.add(String(decision.size));
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.EIDOLON_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free',
      messages: [
        {
          role: 'system',
          content:
            'Write one short teasing sentence to the player based only on the supplied recalled Walrus trade facts. State the ghost side and size. Do not add any number that is absent from the supplied JSON. Do not invent outcomes.',
        },
        {
          role: 'user',
          content: JSON.stringify({ facts, ghostSide: decision.side, ghostSize: decision.size }),
        },
      ],
    }),
  });
  if (!response.ok) return undefined;
  const result = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const line = result.choices?.[0]?.message?.content?.trim();
  if (!line || line.length > 300 || [...line.matchAll(/-?\d+(?:\.\d+)?/g)].some((m) => !allowed.has(m[0])))
    return undefined;
  return line;
}
async function placeGhost(round: Round, hits: Hit[]) {
  const decision = ghostDecision(
    round.side,
    hits,
    round.context,
    Number(process.env.EIDOLON_GHOST_MAX_USDC ?? 5),
  );
  round.ghost = {
    side: decision.side,
    size: decision.size,
    profile: decision.profile,
    recalledBlobIds: decision.blobIds,
    status: 'recalled',
  };
  try {
    round.ghost.line = await narrate(hits, decision);
  } catch {
    /* narration is optional, policy is fixed */
  }
  await save();
  if (!writesOn()) {
    round.ghost.status = 'dry-run only';
    return;
  }
  if (!fork && !process.env.TATUM_API_KEY) {
    round.ghost.status = 'Setup required: TATUM_API_KEY';
    return;
  }
  if (!process.env.EIDOLON_GHOST_KEY) {
    round.ghost.status = 'Setup required: EIDOLON_GHOST_KEY';
    return;
  }
  const keypair = Ed25519Keypair.fromSecretKey(process.env.EIDOLON_GHOST_KEY);
  const owner = keypair.toSuiAddress();
  const maxDaily = Number(process.env.EIDOLON_GHOST_DAILY_USDC ?? 10);
  if (!Number.isFinite(maxDaily) || maxDaily < 1)
    throw new Error('EIDOLON_GHOST_DAILY_USDC must be positive');
  const spent = rounds
    .filter((r) => r.ghost?.leg && r.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((n, r) => n + (r.ghost?.size ?? 0), 0);
  if (spent + decision.size > maxDaily) {
    round.ghost.status = 'daily cap reached';
    return;
  }
  const c = chain();
  if ((await c.predict.read.balance(owner)) < decision.size) {
    round.ghost.status = 'ghost Predict balance too low';
    return;
  }
  const active = (await marketList()).find((m) => m.id === round.marketId);
  if (!active || active.expiryMs - Date.now() < 10_000) {
    round.ghost.status = 'same expiry cutoff passed';
    return;
  }
  const pricer = await c.predict.read.pricer({ underlying: 'BTC', expiryMs: active.expiryMs });
  const pick = ghostStrike(pricer, decision.side, round.strike, active.admissionTickSize);
  if (!pick) {
    round.ghost.status = 'no strike inside the entry band for the opposite side';
    return;
  }
  round.ghost.strike = pick.strike;
  round.ghost.exactMirror = pick.exact;
  const { descriptor, quote } = await plan(owner, active, decision.side, decision.size, pick.strike);
  if (!quote.accepting) {
    round.ghost.status = `plan refused: ${quote.refusal}`;
    return;
  }
  const { transaction } = await c.predict.tx.enqueuePlan(owner, descriptor, quote);
  transaction.setSender(owner);
  const bytes = await transaction.build({ client: c.client });
  const dry = await c.client.core.simulateTransaction({ transaction: bytes, include: { effects: true, events: true } });
  if (dry.$kind !== 'Transaction') {
    round.ghost.status = `dry-run failed: ${explainAbort(dry.FailedTransaction.status.error) ?? dry.FailedTransaction.status.error?.message ?? 'unknown'}`;
    return;
  }
  const signature = await keypair.signTransaction(bytes);
  const sent = await c.client.core.executeTransaction({
    transaction: bytes,
    signatures: [signature.signature],
    include: { events: true, effects: true },
  });
  if (sent.$kind !== 'Transaction' || !sent.Transaction.effects.status.success) {
    round.ghost.status = 'onchain enqueue failed';
    return;
  }
  const receipt = c.predict.decode.enqueue(sent.Transaction);
  round.ghost.status = 'enqueued';
  round.ghost.leg = {
    digest: sent.Transaction.digest,
    recordId: String(receipt.recordId),
    orderId: '',
    cost: 0,
    premium: 0,
  };
  await save();
}
async function paidLeg(
  c: ReturnType<typeof chain>,
  leg: Leg,
  marketId: string,
  earliestMs: number,
): Promise<boolean> {
  const digest = await findQueueEvent(c, 'OpenRecordSettled', marketId, leg.recordId, earliestMs);
  if (!digest) return false;
  const result = await c.client.core.getTransaction({ digest, include: { events: true } });
  if (result.$kind !== 'Transaction') throw new Error(`Payout transaction failed: ${digest}`);
  const tx = result.Transaction;
  const paid = c.predict.decode
    .openRecordPayouts(tx)
    .find((x) => x.marketId === marketId && String(x.recordId) === leg.recordId && !x.skipped);
  if (!paid) return false;
  leg.payout = paid.payout;
  leg.pnl = Math.round((paid.payout - leg.cost) * 1e6) / 1e6;
  leg.payoutDigest = digest;
  return true;
}
async function settle(round: Round, c: ReturnType<typeof chain>) {
  while (Date.now() < round.expiryMs + 30_000)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(30_000, round.expiryMs + 30_000 - Date.now())),
    );
  const coords = { underlying: 'BTC', expiryMs: round.expiryMs, marketId: round.marketId };
  for (let i = 0; i < 40; i++) {
    const settlement = await c.predict.read.settlement(coords);
    if (settlement.settled && settlement.settlementPrice != null && settlement.settlementPriceRaw != null) {
      round.settlement = settlement.settlementPrice;
      const legs = [round.playerLeg, round.ghost?.leg].filter((x): x is Leg => Boolean(x?.orderId));
      const proof = await Promise.all(legs.map((leg) => paidLeg(c, leg, round.marketId, round.expiryMs)));
      if (proof.every(Boolean)) {
        for (const leg of legs) {
          const computed =
            Number(
              cost.settledPayout(BigInt(leg.orderId), settlement.settlementPriceRaw, settlement.tickSizeRaw),
            ) / 1e6;
          if (Math.abs(computed - (leg.payout ?? 0)) > 0.000001)
            throw new Error('Settlement event differs from contract payout math');
        }
        round.status = 'payout verified';
        await save();
        if (!round.memoryBlobId && round.playerLeg) {
          const memory: TradeMemory = {
            kind: 'round',
            player: round.player,
            cadence: round.cadence,
            side: round.side,
            strike: round.strike,
            distance: round.context.strikeDistance,
            size: round.size,
            premium: round.playerLeg.premium,
            context: round.context,
            hit: (round.playerLeg.payout ?? 0) > 0,
            pnl: round.playerLeg.pnl ?? 0,
            fillDigest: round.playerLeg.fillDigest ?? '',
            ghost: round.ghost?.leg
              ? {
                  side: round.ghost.side,
                  size: round.ghost.size,
                  strike: round.ghost.strike,
                  pnl: round.ghost.leg.pnl ?? 0,
                  fillDigest: round.ghost.leg.fillDigest ?? '',
                }
              : undefined,
            createdAt: new Date().toISOString(),
          };
          round.memoryBlobId = await memoryFor(round.player).remember(memory);
          await save();
          const count = rounds.filter((r) => r.player === round.player && r.memoryBlobId).length;
          if (count % 5 === 0) {
            const recent = rounds
              .filter((r) => r.player === round.player && r.playerLeg?.pnl != null)
              .slice(-5);
            const up = recent.filter((r) => r.side === 'up');
            await memoryFor(round.player).remember({
              kind: 'analysis',
              player: round.player,
              line: `Last ${recent.length} trades: UP ${up.length}, wins ${recent.filter((r) => (r.playerLeg?.pnl ?? 0) > 0).length}.`,
              createdAt: new Date().toISOString(),
            });
          }
        }
        round.status = 'settled';
        await save();
        return;
      }
      round.status = 'settlement price recorded; payout event pending';
      await save();
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  round.status = 'settlement evidence pending';
  await save();
  setTimeout(() => void watch(round), 30_000);
}
async function watch(round: Round) {
  try {
    const c = chain();
    const coords = { underlying: 'BTC', expiryMs: round.expiryMs, marketId: round.marketId };
    if (!round.playerLeg) {
      const outcome = await c.predict.read.waitForOutcome(coords, BigInt(round.recordId));
      if (outcome.outcome === 'refunded') {
        round.status = 'player refunded';
        await save();
        return;
      }
      const leg = await filledLeg(
        c,
        round.digest,
        round.marketId,
        round.recordId,
        Date.parse(round.createdAt) - 5000,
      );
      if (!leg) {
        round.status = `fill evidence pending (${outcome.outcome})`;
        await save();
        setTimeout(() => void watch(round), 2000);
        return;
      }
      round.playerLeg = leg;
      round.status = 'player filled';
      await save();
    }
    if (!round.ghost && Date.now() < round.expiryMs - 10_000) {
      if (!process.env.MEMWAL_MAINNET_KEY || !process.env.MEMWAL_MAINNET_ACCOUNT_ID) {
        round.status = 'ghost blocked: memory setup required';
        await save();
      } else {
        const hits = await memoryFor(round.player).recall(round.context);
        if (!hits.some((h) => h.memory.kind === 'round')) {
          round.status = 'first round: no past trade memory';
          await save();
        } else {
          ghostQueue = ghostQueue.catch(() => {}).then(() => placeGhost(round, hits));
          await ghostQueue;
          round.status = 'ghost decision processed';
          await save();
        }
      }
    }
    if (round.ghost?.leg && !round.ghost.leg.orderId) {
      const outcome = await c.predict.read.waitForOutcome(coords, BigInt(round.ghost.leg.recordId));
      const leg = await filledLeg(
        c,
        round.ghost.leg.digest,
        round.marketId,
        round.ghost.leg.recordId,
        Date.parse(round.createdAt),
      );
      if (leg) {
        round.ghost.leg = leg;
        round.ghost.status = 'filled';
        await save();
      } else if (outcome.outcome === 'refunded') {
        round.ghost.leg = undefined;
        round.ghost.status = 'refunded';
        await save();
      } else {
        round.ghost.status = `fill evidence pending (${outcome.outcome})`;
        await save();
        setTimeout(() => void watch(round), 2000);
        return;
      }
    }
    await settle(round, c);
  } catch (e) {
    round.status = `watch error: ${safeError(e)}`;
    await save();
  }
}
for (const round of rounds.filter((r) => r.status !== 'settled' && r.status !== 'player refunded'))
  void watch(round);
server.listen(Number(process.env.EIDOLON_PORT ?? 8787), () =>
  console.log(`Eidolon server listening on ${process.env.EIDOLON_PORT ?? 8787}`),
);
