import { SuiGrpcClient } from '@mysten/sui/grpc';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import { ChannelCredentials } from '@grpc/grpc-js';
import { rateLimit } from './throttle.js';
// One limiter for the whole process: every Tatum client shares Tatum's free-plan budget of 3 requests a second.
const tatumLimit = rateLimit(400);
import { getConfig, PredictClient, snapStrike, type MarketDescriptor } from '@mysten/deepbook-v3/predict';

export const USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
export function chain(env = process.env) {
  const tatum = Boolean(env.TATUM_API_KEY);
  const rpcUrl = tatum
    ? 'https://sui-mainnet-grpc.gateway.tatum.io'
    : (env.EIDOLON_DEV_SUI_RPC ?? 'https://fullnode.mainnet.sui.io:443');
  const client = tatum
    ? new SuiGrpcClient({
        network: 'mainnet',
        transport: new GrpcTransport({
          host: 'sui-mainnet-grpc.gateway.tatum.io:443',
          channelCredentials: ChannelCredentials.createSsl(),
          meta: { 'x-api-key': env.TATUM_API_KEY! },
          interceptors: [tatumLimit],
        }),
      })
    : new SuiGrpcClient({ network: 'mainnet', baseUrl: rpcUrl });
  const sdk = new PredictClient({ network: 'mainnet', client });
  // Tatum's gRPC gateway refuses sui.rpc.v2.LedgerService/ListEvents, so with Tatum, event scans use the public Sui
  // fullnode over gRPC (EIDOLON_EVENTS_RPC overrides it). Every other read and every transaction goes through Tatum.
  const events = tatum
    ? new SuiGrpcClient({ network: 'mainnet', baseUrl: env.EIDOLON_EVENTS_RPC ?? 'https://fullnode.mainnet.sui.io:443' })
    : client;
  return {
    client,
    events,
    eventsSource: tatum ? ('public fullnode (Tatum blocks ListEvents)' as const) : ('same as reads' as const),
    predict: sdk,
    rpc: tatum ? ('Tatum' as const) : ('dev RPC (not Tatum)' as const),
    rpcUrl,
    config: getConfig('mainnet'),
  };
}
export async function markets(env = process.env) {
  const c = chain(env);
  const [items, mode, pool] = await Promise.all([
    c.predict.read.markets(),
    c.predict.read.executionMode(),
    c.predict.read.pool(),
  ]);
  const prices = await Promise.allSettled(
    items.map(async (m) => {
      const p = await c.predict.read.pricer({ underlying: 'BTC', expiryMs: m.expiryMs });
      const up = p.strikeAtProbability(0.35);
      const down = p.strikeAtProbability(0.65);
      return {
        forward: p.forward,
        suggestedStrike: up == null ? null : snapStrike(up, m.admissionTickSize),
        suggestedStrikeDown: down == null ? null : snapStrike(down, m.admissionTickSize),
        sourceMs: p.asOf.pythSpotMs || p.asOf.blockScholesSpotMs,
      };
    }),
  );
  return {
    rpc: c.rpc,
    rpcUrl: c.rpcUrl,
    mode,
    pool,
    markets: items.map((m, i) => ({
      ...m,
      expiryMs: Number(m.expiryMs),
      underlying: 'BTC',
      cadence: Number(m.expiryMs) % 300_000 === 0 ? (5 as const) : (1 as const),
      ...(prices[i].status === 'fulfilled'
        ? prices[i].value
        : { forward: null, suggestedStrike: null, suggestedStrikeDown: null, sourceMs: null }),
    })),
  };
}
export async function plan(
  owner: string,
  market: { id: string; expiryMs: number; admissionTickSize: number; referencePrice: number | null },
  side: 'up' | 'down',
  amount: number,
  strike?: number,
) {
  if (!Number.isFinite(amount) || amount < 1) throw new Error('Minimum size is 1 USDC');
  const c = chain();
  const descriptor: MarketDescriptor = {
    underlying: 'BTC',
    expiryMs: market.expiryMs,
    marketId: market.id,
    side,
    strike: strike == null ? 'reference' : snapStrike(strike, market.admissionTickSize),
  };
  const quote = await c.predict.read.planMint(owner, descriptor, { amount, slippageCents: 5 });
  return { descriptor, quote, c };
}
export type Chain = ReturnType<typeof chain>;
