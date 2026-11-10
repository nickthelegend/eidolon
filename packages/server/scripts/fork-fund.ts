// LOCAL FORK only: create and fund the Predict accounts of the fork-only player and ghost wallets through Eidolon's own
// /fund + /execute routes (keys read by variable name from .env.fork; nothing secret is printed). Used before a filmed
// fork take so the player's call and the ghost's own orders can be placed from the app.
import { resolve } from 'node:path';
import { fromBase64 } from '@mysten/sui/utils';
import { keyFromEnvFile } from '../../core/src/fork.ts';
const file = resolve(import.meta.dirname, '../../..', '.env.fork');
const api = `http://127.0.0.1:${process.env.EIDOLON_PORT ?? 8797}`;
const call = async (path: string, body?: unknown) => {
  const r = await fetch(api + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json: any = await r.json();
  if (!r.ok) throw new Error(`${path}: ${json.error ?? r.status}`);
  return json;
};
const status = await call('/status');
if (!status.fork?.writes) throw new Error('Server is not in LOCAL FORK write mode');
const amounts: Record<string, number> = { EIDOLON_PLAYER_KEY: Number(process.argv[2] ?? 6), EIDOLON_GHOST_KEY: Number(process.argv[3] ?? process.argv[2] ?? 6) };
for (const name of ['EIDOLON_PLAYER_KEY', 'EIDOLON_GHOST_KEY']) {
  const usdc = amounts[name];
  const key = keyFromEnvFile(file, name);
  const owner = key.toSuiAddress();
  const fund = await call('/fund', { owner, amount: usdc, create: true });
  if (!fund.transaction) throw new Error(`${name} /fund dry run: ${JSON.stringify(fund.dryRun)}`);
  const sig = (await key.signTransaction(fromBase64(fund.transaction))).signature;
  const sent = await call('/execute', { bytes: fund.transaction, signature: sig });
  console.log(JSON.stringify({ wallet: name === 'EIDOLON_PLAYER_KEY' ? 'player' : 'ghost', owner, deposit: usdc, forkDigest: sent.digest }));
}
