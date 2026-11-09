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
    <section className="panel" aria-labelledby="history-title">
      <header className="panel-head"><h2 id="history-title">Your trading history</h2></header>
      <p className="muted small">Read settled DeepBook Predict trades from Sui mainnet for {owner ? short(owner) : 'the connected or viewed address'}.</p>
      <button disabled={!owner || busy} onClick={load}>{busy ? 'Reading mainnet…' : 'Read my Predict history'}</button>
      {message && <p className="muted small" role="status">{message}</p>}
      {history && (
        <>
          {history.trades.length === 0 ? <p className="empty">No complete settled Predict trades found in the available chain history.</p> : (
            <>
              <p className="muted small">{history.trades.length} settled trades with verified fill and payout events.</p>
              <div>
                <p>UP bias <span className="num">{pct(history.profile.upBias)}</span></p>
                <progress value={history.profile.upBias} max={1} aria-label="UP bias" />
                <p>Hit rate <span className="num">{pct(history.profile.hitRate)}</span></p>
                <progress value={history.profile.hitRate} max={1} aria-label="Hit rate" />
                <p>Average size <span className="num">{history.profile.averageSize.toFixed(2)} USDC</span></p>
              </div>
              <div>
                {history.trades.map((trade) => (
                  <div className="quote" key={trade.fillDigest}>
                    <span className="chip">{trade.side.toUpperCase()}</span>{' '}
                    <span className="num">${trade.strike.toLocaleString('en-US')}</span>{' · '}
                    <span className="num">{trade.size.toFixed(2)} USDC</span>{' · '}
                    <span>{trade.hit ? 'Hit' : 'Miss'}</span>{' · '}
                    <span className="num">{usdc(trade.pnl)} USDC</span>
                    <p className="muted small">
                      <a href={suiscan(trade.enqueueDigest)} target="_blank" rel="noreferrer">Enqueue</a>{' · '}
                      <a href={suiscan(trade.fillDigest)} target="_blank" rel="noreferrer">Fill</a>{' · '}
                      <a href={suiscan(trade.payoutDigest)} target="_blank" rel="noreferrer">Payout</a>
                    </p>
                  </div>
                ))}
              </div>
              <h3>What your ghost would do next</h3>
              {history.decision ? (
                <p className="quote">Bet <b>{history.decision.side.toUpperCase()}</b> with <b className="num">{history.decision.size.toFixed(2)} USDC</b> for the selected market and side.</p>
              ) : <p className="empty">Select an active market to see the decision.</p>}
              <p className="muted small">{history.source}</p>
            </>
          )}
          <button disabled={rememberDisabled} onClick={remember}>
            {rememberLabel}
          </button>
        </>
      )}
    </section>
  );
}
