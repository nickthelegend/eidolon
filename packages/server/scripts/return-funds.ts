// Return one app wallet's funds to the hub: withdraw its whole Predict account balance, then send all of its USDC
// and its remaining SUI (the gas coin, minus gas) to the hub address. Keys are read by variable name; nothing is printed.
//
//   Fork (default):  tsx scripts/return-funds.ts --keys-file ../../.env.fork --var EIDOLON_... --to <hub address>
//   Mainnet:         tsx scripts/return-funds.ts --mainnet --keys-file <file> --var EIDOLON_... --to <hub address>
//
// Without --mainnet the keys file must set EIDOLON_SUI_FORK_RPC (LOCAL FORK). With --mainnet it must not, and it must
// set EIDOLON_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_USDC and TATUM_API_KEY. Queued orders that have not filled or settled
// keep their escrow inside Predict until the protocol refunds or settles them; run this again after that.
import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';
import { Transaction } from '@mysten/sui/transactions';
import { chain, USDC } from '../../core/src/chain.ts';
import { forkUrl, keyFromEnvFile } from '../../core/src/fork.ts';
const { values } = parseArgs({ options: { 'keys-file': { type: 'string' }, var: { type: 'string' }, to: { type: 'string' }, mainnet: { type: 'boolean', default: false } } });
if (!values['keys-file'] || !values.var || !values.to || !/^0x[0-9a-fA-F]{64}$/.test(values.to)) throw new Error('Pass --keys-file <file> --var <KEY_VAR> --to <hub address>');
const env = { ...parseEnv(readFileSync(values['keys-file'], 'utf8')) } as NodeJS.ProcessEnv;
const fork = forkUrl('EIDOLON', env);
if (!values.mainnet && !fork) throw new Error('Not in LOCAL FORK mode: pass --mainnet to return funds on mainnet');
if (values.mainnet && (fork || env.EIDOLON_ALLOW_MAINNET !== 'I_ACKNOWLEDGE_REAL_USDC' || !env.TATUM_API_KEY)) throw new Error('--mainnet needs EIDOLON_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_USDC and TATUM_API_KEY, and no fork RPC');
const key = keyFromEnvFile(values['keys-file'], values.var);
const owner = key.toSuiAddress();
const c = chain(env);
const coins = async (type: string) => (await c.client.core.listCoins({ owner, coinType: type })).objects;
const total = async (type: string) => (await coins(type)).reduce((n, o) => n + Number(o.balance), 0);
async function send(tx: Transaction, step: string) {
  tx.setSender(owner);
  const bytes = await tx.build({ client: c.client });
  const sim = await c.client.core.simulateTransaction({ transaction: bytes, include: { effects: true } });
  if (sim.$kind !== 'Transaction') throw new Error(`${step} simulation failed: ${sim.FailedTransaction.status.error?.message}`);
  const sent = await c.client.core.executeTransaction({ transaction: bytes, signatures: [(await key.signTransaction(bytes)).signature], include: { effects: true } });
  const t = sent.$kind === 'Transaction' ? sent.Transaction : sent.FailedTransaction;
  console.log(step, JSON.stringify({ digest: t.digest, success: t.effects.status.success, error: t.effects.status.error?.message ?? null }));
  if (!t.effects.status.success) process.exit(1);
}
const before = { predict: await c.predict.read.balance(owner).catch(() => null), usdc: (await total(USDC)) / 1e6, sui: (await total('0x2::sui::SUI')) / 1e9 };
console.log('network', c.rpc, 'wallet', owner, 'before', JSON.stringify(before));
if (before.predict) await send(c.predict.tx.withdraw(owner, before.predict, { toCoinObject: true }), `withdraw ${before.predict} USDC from Predict`);
const usdc = await coins(USDC);
const tx = new Transaction();
tx.transferObjects([...usdc.map((o) => tx.object(o.objectId)), tx.gas], values.to);
await send(tx, `return ${usdc.reduce((n, o) => n + Number(o.balance), 0) / 1e6} USDC and remaining SUI to ${values.to}`);
console.log('after', JSON.stringify({ predict: await c.predict.read.balance(owner).catch(() => null), usdc: (await total(USDC)) / 1e6, sui: (await total('0x2::sui::SUI')) / 1e9 }));
