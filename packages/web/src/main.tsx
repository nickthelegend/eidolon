import React from 'react';
import { createRoot } from 'react-dom/client';
import { createDAppKit, DAppKitProvider } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { App } from './App';
import { registerDemoWallet, type DemoAccount } from './demoWallet';
import './style.css';

const dAppKit = createDAppKit({
  networks: ['mainnet'],
  createClient: () => new SuiGrpcClient({ network: 'mainnet', baseUrl: 'https://fullnode.mainnet.sui.io:443' }),
});

const root = createRoot(document.getElementById('root')!);
fetch('/api/demo-signer')
  .then((r) => r.json() as Promise<{ enabled: boolean; accounts: DemoAccount[] }>)
  .then((status) => { if (status.enabled) registerDemoWallet(status.accounts); })
  .catch(() => {})
  .finally(() => root.render(
  <React.StrictMode>
    <DAppKitProvider dAppKit={dAppKit}>
      <App />
    </DAppKitProvider>
  </React.StrictMode>,
  ));
