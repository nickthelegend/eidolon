// Mainnet live run, started by the person who owns the funds (never by an agent). Same endpoints as fork-rehearsal.ts,
// against a server started with EIDOLON_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_USDC on .env. Keys are read by variable name
// from .env and never printed.
// Steps: fund the player's and the ghost's Predict accounts; player round 1 (no ghost yet: no memory of the player);
// wait for its payout and its Walrus memory; player round 2, which the server answers with the ghost's opposite order.
// Usage: tsx scripts/live-run.ts [--player-usdc 5] [--ghost-usdc 4.5]
//        tsx scripts/live-run.ts --fork   rehearsal on the LOCAL FORK (.env.fork keys, port 8797). The fork has no
//        Predict keeper, so orders never fill there: the fork run proves funding and enqueue, then stops at round 1.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fromBase64 } from '@mysten/sui/utils';
import { keyFromEnvFile } from '../../core/src/fork.ts';

const { values } = parseArgs({ options: { 'player-usdc': { type: 'string', default: '5' }, 'ghost-usdc': { type: 'string', default: '4.5' }, fork: { type: 'boolean', default: false } } });
const fork = values.fork;
const file = resolve(import.meta.dirname, '../../..', fork ? '.env.fork' : '.env');
const api = `http://127.0.0.1:${process.env.EIDOLON_PORT ?? (fork ? 8797 : 8787)}`;
const player = keyFromEnvFile(file, fork ? 'EIDOLON_PLAYER_KEY' : 'DEMO_PLAYER_KEY');
const ghost = keyFromEnvFile(file, 'EIDOLON_GHOST_KEY');
const scan = (d: string) => (fork ? `fork tx ${d}` : `https://suiscan.xyz/mainnet/tx/${d}`);
const call = async (path: string, body?: unknown) => {
  const r = await fetch(api + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json: any = await r.json();
  if (!r.ok) throw new Error(`${path}: ${json.error ?? r.status}`);
  return json;
};
const sign = async (key: typeof player, bytes: string) => (await key.signTransaction(fromBase64(bytes))).signature;
const say = (step: string, value: unknown = '') => console.log(`[${new Date().toISOString().slice(11, 19)}] ${step}`, typeof value === 'string' ? value : JSON.stringify(value));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const status = await call('/status');
if (fork ? !status.fork?.writes : status.fork) throw new Error(fork ? 'Server is not in LOCAL FORK write mode' : 'This server is on a LOCAL FORK; run with --fork, or start it on mainnet.');
if (!fork && !status.mainnetWrites) throw new Error('Live writes are off. Start the server with EIDOLON_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_USDC.');
say('server', { rpc: status.rpc, memory: status.memoryNetwork });

for (const [name, key, amount] of [['player', player, Number(values['player-usdc'])], ['ghost', ghost, Number(values['ghost-usdc'])]] as const) {
  // Create the account on the first run; if it already exists, the create dry-run fails and a plain deposit is used.
  const deposit = (create: boolean) => call('/fund', { owner: key.toSuiAddress(), amount, create });
  let fund = await deposit(true).catch((e) => (/AlreadyExists/.test(String(e)) ? deposit(false) : Promise.reject(e)));
  if (!fund.transaction) fund = await deposit(false);
  if (!fund.transaction) throw new Error(`${name} deposit dry-run failed: ${JSON.stringify(fund.dryRun)}`);
  const sent = await call('/execute', { bytes: fund.transaction, signature: await sign(key, fund.transaction) });
  say(`${name} Predict account created and funded with ${amount} USDC`, scan(sent.digest));
}

async function round(n: number, side: 'up' | 'down') {
  const { markets } = await call('/markets');
  const m = [...markets].filter((x: any) => x.cadence === 5 && x.expiryMs - Date.now() > 90_000 && x.suggestedStrike != null).sort((a: any, b: any) => a.expiryMs - b.expiryMs)[0];
  if (!m) throw new Error('No 5-minute market with 90 s left; run again in a minute');
  const strike = side === 'up' ? m.suggestedStrike : m.suggestedStrikeDown;
  const plan = await call('/plan', { owner: player.toSuiAddress(), marketId: m.id, side, amount: 2, strike });
  if (!plan.transaction) throw new Error(`Round ${n} refused: ${plan.refusal ?? JSON.stringify(plan.dryRun)}`);
  const sent = await call('/execute', { bytes: plan.transaction, signature: await sign(player, plan.transaction) });
  const r = await call('/rounds', { digest: sent.digest });
  say(`round ${n}: player ${side.toUpperCase()} at $${strike} for 2 USDC, market closes ${new Date(m.expiryMs).toISOString().slice(11, 19)} UTC`, scan(sent.digest));
  return r.digest as string;
}

const first = await round(1, 'up');
if (fork) {
  say('LOCAL FORK: funding and round 1 enqueue proven. The fork has no Predict keeper, so the rehearsal stops here.');
  process.exit(0);
}
say('round 1 has no ghost: there is no memory of this player yet. Waiting for the payout and the Walrus memory (about 6–12 minutes)…');
for (let i = 0; ; i++) {
  const r = (await call('/rounds')).find((x: any) => x.digest === first);
  if (r?.memoryBlobId) {
    say('round 1 settled and remembered on Walrus', { settlement: r.settlement, pnl: r.playerLeg?.pnl, payout: r.playerLeg?.payoutDigest && scan(r.playerLeg.payoutDigest), memory: `https://walruscan.com/mainnet/blob/${r.memoryBlobId}` });
    break;
  }
  if (i % 6 === 0) say(`round 1: ${r?.status ?? 'unknown'}`);
  if (i > 120) throw new Error('Round 1 did not settle within 20 minutes; check /rounds');
  await wait(10_000);
}
const second = await round(2, 'up');
say('round 2: the ghost recalls round 1 from Walrus and places the opposite order from its own wallet…');
for (let i = 0; i < 60; i++) {
  const r = (await call('/rounds')).find((x: any) => x.digest === second);
  if (r?.ghost?.leg?.digest) {
    say('ghost answered', { side: r.ghost.side, strike: r.ghost.strike, size: r.ghost.size, recalled: r.ghost.recalledBlobIds, order: scan(r.ghost.leg.digest) });
    break;
  }
  if (r?.ghost?.status && !['recalled', 'enqueued'].includes(r.ghost.status)) {
    say('ghost did not place an order', r.ghost.status);
    break;
  }
  await wait(5_000);
}
say('Done. Rounds keep settling on the server; their payouts and memories appear in the app.');
