import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Visible label for every read and write that goes to a local sui-fork of Sui mainnet. */
export const FORK_SOURCE = 'LOCAL FORK of Sui mainnet' as const;
/** The only value that lets this app send transactions to the local fork. It never enables mainnet writes. */
export const FORK_WRITE_GATE = 'LOCAL_FORK_ONLY';

/**
 * `<PREFIX>_SUI_FORK_RPC` points the app at a local sui-fork of Sui mainnet (see Yojimbo's scripts/fork-demo.sh).
 * Only a loopback http endpoint is accepted, and never together with the mainnet write gate or Tatum.
 */
export function forkUrl(prefix: string, env = process.env): string | null {
  const raw = env[`${prefix}_SUI_FORK_RPC`];
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error(`${prefix}_SUI_FORK_RPC must be a local http://127.0.0.1:<port> sui-fork endpoint`);
  if (env[`${prefix}_ALLOW_MAINNET`]) throw new Error(`${prefix}_ALLOW_MAINNET must be unset in fork mode`);
  if (env.TATUM_API_KEY) throw new Error('TATUM_API_KEY must be unset in fork mode');
  return url.origin;
}
export const forkWrites = (prefix: string, env = process.env) =>
  forkUrl(prefix, env) != null && env[`${prefix}_ALLOW_FORK_WRITES`] === FORK_WRITE_GATE;

/** sui-fork does not implement GetBalance, which coinWithBalance calls, so balances are summed from coin objects. */
export function forkClient(url: string) {
  const client = new SuiGrpcClient({ network: 'mainnet', baseUrl: url });
  const core = client.core;
  core.getBalance = async (options: { owner: string; coinType?: string }) => {
    const coinType = options.coinType ?? '0x2::sui::SUI';
    let total = 0n;
    let cursor: string | null = null;
    do {
      const page = await core.listCoins({ owner: options.owner, coinType, cursor });
      for (const coin of page.objects) total += BigInt(coin.balance);
      cursor = page.hasNextPage ? page.cursor : null;
    } while (cursor);
    return { balance: { coinType, balance: total.toString(), coinBalance: total.toString(), addressBalance: '0' } };
  };
  return client;
}

/** Fails unless the endpoint answers the sui-fork admin service. */
export async function forkStatus(client: SuiGrpcClient) {
  const { response } = await client.forkingService.getStatus({});
  return {
    label: `${FORK_SOURCE} @ checkpoint ${response.forkedAtCheckpoint}`,
    forkedAtCheckpoint: response.forkedAtCheckpoint.toString(),
    checkpoint: response.checkpointSequenceNumber.toString(),
    clockMs: Number(response.timestampMs),
  };
}

/** Fork rehearsal scripts: read one key by variable name from an env file without echoing anything. */
export function keyFromEnvFile(file: string, name: string) {
  const value = parseEnv(readFileSync(file, 'utf8'))[name];
  if (!value) throw new Error(`Setup required: ${name} in ${file}`);
  return Ed25519Keypair.fromSecretKey(value);
}
