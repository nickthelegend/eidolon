// LOCAL FORK rehearsal through Eidolon's own server endpoints (server must run with .env.fork, see docs/FORK.md).
// The player and ghost keys are fork-only and read by variable name from .env.fork; nothing secret is printed.
// Steps: /fund (create + deposit) for player and ghost, signed and sent via /execute; /plan a real queued order for the
// player, sign, /execute, then /rounds verifies the enqueue receipt; the same /plan + /execute path for the ghost address.
import { resolve } from 'node:path';
import { fromBase64 } from '@mysten/sui/utils';
import { keyFromEnvFile, forkClient } from '../../core/src/fork.ts';
import { PredictClient } from '@mysten/deepbook-v3/predict';
const file = resolve(import.meta.dirname, '../../..', '.env.fork');
const api = `http://127.0.0.1:${process.env.EIDOLON_PORT ?? 8797}`;
const player = keyFromEnvFile(file, 'EIDOLON_PLAYER_KEY');
const ghost = keyFromEnvFile(file, 'EIDOLON_GHOST_KEY');
const call = async (path: string, body?: unknown) => {
  const r = await fetch(api + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json: any = await r.json();
  if (!r.ok) throw new Error(`${path}: ${json.error ?? r.status}`);
  return json;
};
const sign = async (key: typeof player, bytes: string) => (await key.signTransaction(fromBase64(bytes))).signature;
const log = (step: string, value: unknown) => console.log(step, JSON.stringify(value));
const status = await call('/status');
log('status', { rpc: status.rpc, fork: status.fork, mainnetWrites: status.mainnetWrites });
if (!status.fork?.writes) throw new Error('Server is not in LOCAL FORK write mode');
const predict = new PredictClient({ network: 'mainnet', client: forkClient(process.env.EIDOLON_SUI_FORK_RPC ?? 'http://127.0.0.1:9796') });
for (const [name, key, amount] of [['player', player, 3], ['ghost', ghost, 3]] as const) {
  const owner = key.toSuiAddress();
  const fund = await call('/fund', { owner, amount, create: true });
  if (!fund.transaction) throw new Error(`${name} /fund dry run: ${JSON.stringify(fund.dryRun)}`);
  const sent = await call('/execute', { bytes: fund.transaction, signature: await sign(key, fund.transaction) });
  log(`${name} create+deposit ${amount} USDC`, { owner, digest: sent.digest, kind: sent.kind, predictBalance: await predict.read.balance(owner) });
}
const { markets } = await call('/markets');
const market = [...markets].filter((m: any) => m.suggestedStrike != null).sort((a: any, b: any) => b.expiryMs - a.expiryMs)[0];
if (!market) throw new Error('No active market with a suggested strike at this fork checkpoint');
log('market', { id: market.id, expiry: new Date(market.expiryMs).toISOString(), secondsLeftWallClock: Math.round((market.expiryMs - Date.now()) / 1000), forward: market.forward, strike: market.suggestedStrike });
const plan = await call('/plan', { owner: player.toSuiAddress(), marketId: market.id, side: 'up', amount: 2, strike: market.suggestedStrike });
log('player /plan', { accepting: plan.accepting, refusal: plan.refusal, quote: plan.quote, dryRun: plan.dryRun, mode: plan.mode });
if (!plan.transaction) throw new Error('Plan returned no transaction');
const trade = await call('/execute', { bytes: plan.transaction, signature: await sign(player, plan.transaction) });
log('player enqueue', trade);
const round = await call('/rounds', { digest: trade.digest });
log('/rounds verified enqueue', { digest: round.digest, recordId: round.recordId, marketId: round.marketId, side: round.side, status: round.status });
const ghostPlan = await call('/plan', { owner: ghost.toSuiAddress(), marketId: market.id, side: 'down', amount: 2, strike: market.suggestedStrikeDown ?? undefined });
log('ghost /plan', { accepting: ghostPlan.accepting, refusal: ghostPlan.refusal, quote: ghostPlan.quote, dryRun: ghostPlan.dryRun });
if (ghostPlan.transaction) log('ghost-address enqueue', await call('/execute', { bytes: ghostPlan.transaction, signature: await sign(ghost, ghostPlan.transaction) }));
for (const [name, key] of [['player', player], ['ghost', ghost]] as const) log(`${name} Predict balance after`, await predict.read.balance(key.toSuiAddress()));
log('rounds', (await call('/rounds')).map((r: any) => ({ digest: r.digest, status: r.status })));
