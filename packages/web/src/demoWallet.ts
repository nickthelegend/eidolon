import { registerWallet, type Wallet, type SuiSignTransactionInput } from '@mysten/wallet-standard';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';

export const DEMO_WALLET_NAME = 'Demo signer (server-held key)';
export type DemoAccount = { label: string; address: string };
const icon = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#e8a547"/><text x="32" y="43" font-size="32" text-anchor="middle" fill="#141414">D</text></svg>')}` as const;

export function registerDemoWallet(accounts: DemoAccount[]) {
  const walletAccounts = accounts.map(({ label, address }) => ({
    label,
    address,
    // The status route intentionally exposes addresses only. This wallet never signs locally.
    publicKey: new Uint8Array(),
    chains: ['sui:mainnet'] as const,
    features: ['sui:signTransaction'] as const,
  }));
  const wallet: Wallet = {
    version: '1.0.0',
    name: DEMO_WALLET_NAME,
    icon,
    chains: ['sui:mainnet'],
    accounts: walletAccounts,
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: walletAccounts }) },
      'standard:events': { version: '1.0.0', on: () => () => {} },
      'sui:signTransaction': {
        version: '2.0.0',
        signTransaction: async ({ account, chain, transaction, signal }: SuiSignTransactionInput) => {
          if (chain !== 'sui:mainnet' || !walletAccounts.some((a) => a.address === account.address))
            throw new Error('Demo signer account or chain mismatch');
          signal?.throwIfAborted();
          const bytes = toBase64(await Transaction.from(await transaction.toJSON()).build());
          const res = await fetch('/api/demo-signer/sign', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ address: account.address, bytes }),
            signal,
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error ?? 'Demo signer refused the transaction');
          return { bytes: result.bytes, signature: result.signature };
        },
      },
    },
  };
  registerWallet(wallet);
}
