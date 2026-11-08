import { SuiJsonRpcClient, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import { getConfig, predict, snapStrike, type MarketDescriptor } from '@mysten/deepbook-v3/predict';

export const USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
export function chain(env = process.env) {
  const tatum = Boolean(env.TATUM_API_KEY);
  const rpcUrl = tatum ? 'https://sui-mainnet.gateway.tatum.io' : env.EIDOLON_DEV_SUI_RPC;
  if (!rpcUrl) throw new Error('Setup required: TATUM_API_KEY or EIDOLON_DEV_SUI_RPC');
  const client = new SuiJsonRpcClient({ network: 'mainnet', transport: new JsonRpcHTTPTransport({ url: rpcUrl, rpc: { headers: tatum ? { 'x-api-key': env.TATUM_API_KEY! } : {} } }) });
  const sdk = client.$extend(predict({ network: 'mainnet' }));
  return { client, sdk, predict: sdk.predict, rpc: tatum ? 'Tatum' as const : 'dev RPC (not Tatum)' as const, rpcUrl, config: getConfig('mainnet') };
}
export async function markets(env = process.env) {
  const c = chain(env);
  const [items, mode, pool] = await Promise.all([c.predict.read.markets(), c.predict.read.executionMode(), c.predict.read.pool()]);
  return { rpc: c.rpc, rpcUrl: c.rpcUrl, mode, pool, markets: items.map(m => ({ ...m, expiryMs: Number(m.expiryMs), underlying: 'BTC_USD' })) };
}
export async function plan(owner: string, market: { id: string; expiryMs: number; admissionTickSize: number; referencePrice: number | null }, side: 'up' | 'down', amount: number, strike?: number) {
  if (!Number.isFinite(amount) || amount < 1) throw new Error('Minimum size is 1 USDC');
  const c = chain();
  const descriptor: MarketDescriptor = { underlying: 'BTC_USD', expiryMs: market.expiryMs, marketId: market.id, side, strike: strike == null ? 'reference' : snapStrike(strike, market.admissionTickSize) };
  const quote = await c.predict.read.planMint(owner, descriptor, { amount, slippageCents: 5 });
  return { descriptor, quote, c };
}
export type Chain = ReturnType<typeof chain>;
