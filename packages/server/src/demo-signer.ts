import type { IncomingMessage, ServerResponse } from 'node:http';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

type Prepared = { address: string; at: number };
type Account = { label: string; address: string; keypair: Ed25519Keypair };

// The key variables are read only after the exact opt-in flag is present.
export function createDemoSigner(
  keyNames: readonly { label: string; variable: string }[],
  preparedOrder: { get(bytes: string): Prepared | undefined },
  preparedFunding: { get(bytes: string): Prepared | undefined },
  canSign: (bytes: string) => boolean,
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now,
) {
  const enabled = env.DEMO_SIGNER === 'I_UNDERSTAND_SERVER_HOLDS_KEYS';
  const accounts: Account[] = enabled
    ? keyNames.flatMap(({ label, variable }) => {
        const secret = env[variable];
        if (!secret) return [];
        const keypair = Ed25519Keypair.fromSecretKey(secret);
        return [{ label, address: keypair.toSuiAddress().toLowerCase(), keypair }];
      })
    : [];
  if (enabled && accounts.length !== keyNames.length) throw Error('Demo signer keys are missing');
  const json = (res: ServerResponse, code: number, value: object) => {
    res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ demo: true, ...value }));
  };
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.url === '/demo-signer') {
      if (req.method !== 'GET') { json(res, 405, { error: 'GET required' }); return true; }
      json(res, 200, { enabled, accounts: accounts.map(({ label, address }) => ({ label, address })) });
      return true;
    }
    if (req.url !== '/demo-signer/sign') return false;
    if (req.method !== 'POST') { json(res, 405, { error: 'POST required' }); return true; }
    try {
      if (!enabled) throw Error('Demo signer disabled');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString();
        if (raw.length > 20_000) throw Error('Body too large');
      }
      const input = JSON.parse(raw) as { address?: unknown; bytes?: unknown };
      if (typeof input.address !== 'string' || typeof input.bytes !== 'string') throw Error('Invalid signing request');
      const address = input.address.toLowerCase();
      const account = accounts.find((a) => a.address === address);
      if (!account || !/^0x[0-9a-f]{64}$/i.test(input.address)) throw Error('Demo address unavailable');
      const record = preparedOrder.get(input.bytes) ?? preparedFunding.get(input.bytes);
      if (!record || record.address !== account.address || now() - record.at > 60_000 || now() < record.at || !canSign(input.bytes))
        throw Error('Transaction was not recently prepared for this demo address');
      const signed = await account.keypair.signTransaction(fromBase64(input.bytes));
      json(res, 200, { bytes: input.bytes, signature: signed.signature });
    } catch {
      json(res, 400, { error: 'Demo signing refused' });
    }
    return true;
  };
}
