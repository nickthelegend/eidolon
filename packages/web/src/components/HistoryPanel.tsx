import { useEffect, useState } from 'react';
import { api, pct, post, short, suiscan, usdc, type HistoryResponse, type Side } from '../api';

export function HistoryPanel({ owner, marketId, side, readOnly, live, setup, onHistory, onBusy }: {
  owner: string | undefined;
  marketId: string;
  side: Side;
  readOnly: boolean;
  live: boolean;
  setup: string[];
  onHistory?: (history: HistoryResponse | null) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  useEffect(() => onHistory?.(history), [history]);
  const [loadedOwner, setLoadedOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const missingMemory = setup.find((s) => s.includes('MEMWAL_'));
  // Writing settled trades to Walrus moves no funds, so it works in dry-run and read-only views too.
  const rememberDisabled = !owner || Boolean(missingMemory) || !history?.trades.length || busy;
  const rememberLabel = missingMemory ?? (readOnly ? 'Remember this trader on Walrus' : 'Teach my ghost (write to Walrus)');

  async function load() {
    if (!owner) return;
    setBusy(true);
    onBusy?.(true);
    setMessage('');
    try {
      const query = new URLSearchParams({ marketId, side, limit: '20' });
      setHistory(await api<HistoryResponse>(`/history/${owner}?${query}`));
      setLoadedOwner(owner);
    } catch (error) {
      setMessage(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
      onBusy?.(false);
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
    // loadedOwner too: a read that started before the markets loaded has no market, so no ghost decision.
  }, [marketId, side, loadedOwner]);

  async function remember() {
    if (!owner || rememberDisabled) return;
    setBusy(true);
    setMessage('');
    let stored = false;
    try {
      const result = await post<{ blobIds: string[] }>(`/history/${owner}/remember`, {});
      setMessage(`Wrote ${result.blobIds.length} trade memories to Walrus: ${result.blobIds.slice(0, 4).map(short).join(', ')}${result.blobIds.length > 4 ? ` and ${result.blobIds.length - 4} more` : ''}`);
      stored = true;
    } catch (error) {
      setMessage(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
    if (stored) await load(); // the ghost now rebuilds from what Walrus recalls
  }

  const [expanded, setExpanded] = useState(false);
  const wins = history?.trades.filter((t) => t.pnl > 0).length ?? 0;
  const net = history?.trades.reduce((n, t) => n + t.pnl, 0) ?? 0;

  return (
    <section className="panel history" aria-labelledby="history-title">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Where the ghost comes from</p>
          <h2 id="history-title">Your trading history</h2>
        </div>
        <p className="muted small">Settled DeepBook Predict trades, read from Sui mainnet</p>
      </header>
      {!history ? (
        <div className="empty empty-wide">
          <img className="empty-art float" src="/art/eidolon-history-scroll.webp" alt="" width={88} height={88} />
          <div>
            <b>{owner ? `Read ${short(owner)}’s past trades` : 'Connect or preview an address'}</b>
            <p>
              Your ghost can start from what you already did: every settled Predict trade with its fill and payout,
              straight from the chain. Takes about 20 seconds.
            </p>
            <button className="primary" disabled={!owner || busy} onClick={load}>
              {busy ? (
                <>
                  <span className="spin" aria-hidden /> Reading mainnet…
                </>
              ) : (
                'Read my Predict history'
              )}
            </button>
          </div>
        </div>
      ) : history.trades.length === 0 ? (
        <div className="empty empty-wide">
          <img className="empty-art float" src="/art/eidolon-empty-history.webp" alt="" width={88} height={88} />
          <div>
            <b>No settled trades found</b>
            <p>No complete Predict trade with fill and payout events in the chain history this RPC can reach.</p>
          </div>
        </div>
      ) : (
        <div className="history-body">
          <div className="history-table">
            <div className="trades-head" aria-hidden>
              <span>Side</span>
              <span>Strike (USD)</span>
              <span>Size (USDC)</span>
              <span>P&amp;L (USDC)</span>
              <span>On SuiScan</span>
            </div>
            <ul className={`trades ${expanded ? 'open' : ''}`}>
              {history.trades.map((trade) => (
                <li key={trade.fillDigest}>
                  <span className={`side-pill side-${trade.side}`}>{trade.side === 'up' ? 'UP' : 'DOWN'}</span>
                  <span className="num t-strike">${trade.strike.toLocaleString('en-US')}</span>
                  <span className="num muted t-size">
                    {trade.size.toFixed(2)}
                    <i> USDC</i>
                  </span>
                  <b className={`num t-pnl ${trade.pnl > 0 ? 'up' : trade.pnl < 0 ? 'down' : ''}`}>{usdc(trade.pnl)}</b>
                  <span className="trade-links">
                    <a href={suiscan(trade.enqueueDigest)} target="_blank" rel="noreferrer">order</a>
                    <a href={suiscan(trade.fillDigest)} target="_blank" rel="noreferrer">fill</a>
                    <a href={suiscan(trade.payoutDigest)} target="_blank" rel="noreferrer">payout</a>
                  </span>
                </li>
              ))}
            </ul>
            {history.trades.length > 8 && (
              <button className="more" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>
                {expanded ? 'Show fewer' : `Show all ${history.trades.length} trades`}
              </button>
            )}
          </div>

          <div className="history-side">
            <div className="tally">
              <div>
                <small>Settled</small>
                <b className="num">{history.trades.length}</b>
              </div>
              <div>
                <small>Won</small>
                <b className="num">{wins}</b>
              </div>
              <div>
                <small>Net (USDC)</small>
                <b className={`num ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>{usdc(net)}</b>
              </div>
            </div>
            <p className="fine">Each with a verified fill and payout event.</p>
            <HBar label="Bets UP" value={history.profile.upBias} />
            <HBar label="Hit rate" value={history.profile.hitRate} />
            <p className="fine num">Average size {history.profile.averageSize.toFixed(2)} USDC</p>
            <div className="next-move">
              <p className="eyebrow spectral">What your ghost would do next</p>
              {history.decision ? (
                <p className="next-line">
                  Against your <b>{side.toUpperCase()}</b> on the selected market, it bets{' '}
                  <span className={`side-pill side-${history.decision.side}`}>{history.decision.side.toUpperCase()}</span>{' '}
                  with <b className="num">{history.decision.size.toFixed(2)} USDC</b>.
                </p>
              ) : (
                <p className="fine">Select an active market to see the decision.</p>
              )}
              <p className="fine">{history.source}</p>
            </div>
            <button className="primary" disabled={rememberDisabled} onClick={remember}>
              {rememberLabel}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="msg" role="status">
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
