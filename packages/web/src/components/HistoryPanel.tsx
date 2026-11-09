import { useEffect, useState } from 'react';
import { api, pct, post, short, suiscan, usdc, type HistoryResponse, type Side } from '../api';

export function HistoryPanel({ owner, marketId, side, readOnly, live, setup }: {
  owner: string | undefined;
  marketId: string;
  side: Side;
  readOnly: boolean;
  live: boolean;
  setup: string[];
}) {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadedOwner, setLoadedOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const missingMemory = setup.find((s) => s.includes('MEMWAL_'));
  const rememberDisabled = !owner || readOnly || !live || Boolean(missingMemory) || !history?.trades.length || busy;
  const rememberLabel = missingMemory ?? (readOnly ? 'Read-only view' : !live ? 'Dry-run only' : 'Teach my ghost (write to Walrus)');

  async function load() {
    if (!owner) return;
    setBusy(true);
    setMessage('');
    try {
      const query = new URLSearchParams({ marketId, side, limit: '20' });
      setHistory(await api<HistoryResponse>(`/history/${owner}?${query}`));
      setLoadedOwner(owner);
    } catch (error) {
      setMessage(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (loadedOwner && loadedOwner !== owner) {
      setHistory(null);
      setLoadedOwner('');
    }
  }, [owner, loadedOwner]);
  useEffect(() => {
    if (!owner || !history || loadedOwner !== owner) return;
    const query = new URLSearchParams({ marketId, side, limit: '20' });
    api<HistoryResponse>(`/history/${owner}?${query}`).then(setHistory).catch(() => {});
  }, [marketId, side]);

  async function remember() {
    if (!owner || rememberDisabled) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await post<{ blobIds: string[] }>(`/history/${owner}/remember`, {});
      setMessage(`Wrote ${result.blobIds.length} trade memories to Walrus: ${result.blobIds.map(short).join(', ')}`);
    } catch (error) {
      setMessage(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel history" aria-labelledby="history-title">
      <header className="panel-head">
        <h2 id="history-title">Your trading history</h2>
        <p className="muted small">settled DeepBook Predict trades, read from Sui mainnet</p>
      </header>
      {!history ? (
        <div className="empty">
          <img className="empty-art" src="/art/eidolon-hourglass.webp" alt="" width={96} height={96} />
          <b>{owner ? `Read ${short(owner)}’s past trades` : 'Connect or preview an address'}</b>
          <p>
            Your ghost can start from what you already did: every settled Predict trade with its fill and payout,
            straight from the chain.
          </p>
          <button className="primary" disabled={!owner || busy} onClick={load}>
            {busy ? 'Reading mainnet…' : 'Read my Predict history'}
          </button>
        </div>
      ) : history.trades.length === 0 ? (
        <div className="empty">
          <b>No settled trades found</b>
          <p>No complete Predict trade with fill and payout events in the chain history this RPC can reach.</p>
        </div>
      ) : (
        <>
          <p className="muted small">
            {history.trades.length} settled trades, each with a verified fill and payout event.
          </p>
          <HBar label="Bets UP" value={history.profile.upBias} />
          <HBar label="Hit rate" value={history.profile.hitRate} />
          <p className="muted small num">Average size {history.profile.averageSize.toFixed(2)} USDC</p>
          <ul className="trades">
            {history.trades.map((trade) => (
              <li key={trade.fillDigest}>
                <span className={`side-pill side-${trade.side}`}>{trade.side === 'up' ? 'UP' : 'DOWN'}</span>
                <span className="num">${trade.strike.toLocaleString('en-US')}</span>
                <span className="num muted">{trade.size.toFixed(2)} USDC</span>
                <b className={`num ${trade.pnl > 0 ? 'up' : trade.pnl < 0 ? 'down' : ''}`}>{usdc(trade.pnl)}</b>
                <span className="trade-links">
                  <a href={suiscan(trade.enqueueDigest)} target="_blank" rel="noreferrer">order</a>
                  <a href={suiscan(trade.fillDigest)} target="_blank" rel="noreferrer">fill</a>
                  <a href={suiscan(trade.payoutDigest)} target="_blank" rel="noreferrer">payout</a>
                </span>
              </li>
            ))}
          </ul>
          <div className="next-move">
            <p className="eyebrow spectral">What your ghost would do next</p>
            {history.decision ? (
              <p className="next-line">
                Against your <b>{side.toUpperCase()}</b> on the selected market, it bets{' '}
                <span className={`side-pill side-${history.decision.side}`}>{history.decision.side.toUpperCase()}</span>{' '}
                with <b className="num">{history.decision.size.toFixed(2)} USDC</b>.
              </p>
            ) : (
              <p className="muted small">Select an active market to see the decision.</p>
            )}
            <p className="muted small">{history.source}</p>
          </div>
          <button className="primary" disabled={rememberDisabled} onClick={remember}>
            {rememberLabel}
          </button>
        </>
      )}
      {message && (
        <p className="muted small" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function HBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <span className="bar-track" aria-hidden>
        <span className="bar-fill" style={{ width: pct(value) }} />
      </span>
      <b className="num">{pct(value)}</b>
    </div>
  );
}
