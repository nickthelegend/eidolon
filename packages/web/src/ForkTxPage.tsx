import { useEffect, useState } from 'react';
import { api, short } from './api';
import { Icon, State } from './ui';

type ForkTx = {
  rpc: string;
  tx: {
    digest: string;
    timestampMs?: string;
    checkpoint?: string;
    transaction?: { data?: { sender?: string } };
    effects?: { status?: { status: string; error?: string }; gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } };
    events?: { type: string; parsedJson?: Record<string, unknown> }[];
    balanceChanges?: { owner: { AddressOwner?: string } | string; coinType: string; amount: string }[];
    objectChanges?: { type: string; objectType?: string; objectId?: string }[];
  };
};

const typeName = (t: string) => t.split('::').slice(-2).join('::').replace(/<.*$/, '');
const coin = (t: string) => (t.endsWith('::usdc::USDC') ? 'USDC' : t.endsWith('::sui::SUI') ? 'SUI' : typeName(t));
const amount = (raw: string, t: string) => (Number(raw) / (coin(t) === 'USDC' ? 1e6 : 1e9)).toLocaleString('en-US', { maximumFractionDigits: 6 });

/** A LOCAL FORK transaction, read from the fork's own RPC. SuiScan cannot show it, so the app does. */
export default function ForkTxPage({ digest }: { digest: string }) {
  const [data, setData] = useState<ForkTx | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setData(null);
    api<ForkTx>(`/fork/tx/${digest}`).then(setData).catch((e) => setErr(String(e.message ?? e)));
  }, [digest]);
  const t = data?.tx;
  const ok = t?.effects?.status?.status === 'success';
  const gas = t?.effects?.gasUsed ? (Number(t.effects.gasUsed.computationCost) + Number(t.effects.gasUsed.storageCost) - Number(t.effects.gasUsed.storageRebate)) / 1e9 : null;
  return (
    <main className="order" id="main" data-film="fork-tx">
      <button className="back" onClick={() => history.back()}>
        <Icon name="back" size={16} />
        Back
      </button>
      <section className="fork-head dark">
        <span className="fork-badge">LOCAL FORK of Sui mainnet · no real funds</span>
        <h1>Transaction on the fork</h1>
        <code className="fork-digest">{digest}</code>
        <p>Read from the fork’s own RPC ({data?.rpc ?? '…'}). Fork transactions never reach mainnet, so SuiScan can’t show them.</p>
      </section>
      {!t ? (
        <State kind={err ? 'error' : 'loading'} title={err ? 'Could not read this transaction from the fork' : 'Reading the fork…'}>{err}</State>
      ) : (
        <>
          <dl className="facts">
            <div><dt>Status</dt><dd className={ok ? 'up' : 'down'}>{ok ? 'Success' : `Failed${t.effects?.status?.error ? `: ${t.effects.status.error}` : ''}`}</dd></div>
            <div><dt>Sender</dt><dd className="mono">{t.transaction?.data?.sender ? short(t.transaction.data.sender) : '—'}</dd></div>
            <div><dt>Gas</dt><dd className="mono">{gas != null ? `${gas.toFixed(6)} SUI` : '—'}</dd></div>
            <div><dt>Fork checkpoint</dt><dd className="mono">{t.checkpoint ?? '—'}</dd></div>
            <div><dt>Events</dt><dd className="mono">{t.events?.length ?? 0}</dd></div>
            <div><dt>Objects changed</dt><dd className="mono">{t.objectChanges?.length ?? 0}</dd></div>
          </dl>
          <section className="order-sec">
            <h2>Events</h2>
            <ol className="steps" data-film="fork-events">
              {(t.events ?? []).map((e, i) => (
                <li key={i}>
                  <span className="step-dot" aria-hidden>
                    <Icon name="check" size={12} />
                  </span>
                  <div>
                    <p>
                      <code>{typeName(e.type)}</code>
                    </p>
                    <span className="mono">{Object.entries(e.parsedJson ?? {}).slice(0, 6).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ').slice(0, 260)}</span>
                  </div>
                </li>
              ))}
              {!t.events?.length && <li className="dim">No events</li>}
            </ol>
          </section>
          {t.balanceChanges && t.balanceChanges.length > 0 && (
            <section className="order-sec">
              <h2>Balance changes</h2>
              <dl className="facts">
                {t.balanceChanges.map((b, i) => (
                  <div key={i}>
                    <dt>{typeof b.owner === 'string' ? b.owner : b.owner.AddressOwner ? short(b.owner.AddressOwner) : 'object'}</dt>
                    <dd className={`mono ${Number(b.amount) < 0 ? 'down' : 'up'}`}>
                      {Number(b.amount) > 0 ? '+' : ''}
                      {amount(b.amount, b.coinType)} {coin(b.coinType)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </>
      )}
    </main>
  );
}
