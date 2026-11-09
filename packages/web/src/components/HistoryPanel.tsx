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

  async function load(keepMessage = false) {
    if (!owner) return;
    setBusy(true);
    onBusy?.(true);
    if (!keepMessage) setMessage('');
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
    if (stored) await load(true); // the ghost now rebuilds from what Walrus recalls; keep the result on screen
  }

  const [expanded, setExpanded] = useState(false);
  const wins = history?.trades.filter((t) => t.pnl > 0).length ?? 0;
  const net = history?.trades.reduce((n, t) => n + t.pnl, 0) ?? 0;

  return (
    <div className="history" id="history">
      {!history ? (
        <div className="empty">
          <img className="empty-art float" src="/art/v2/eidolon2-memory-vault.webp" alt="" width={120} height={120} />
          <b>{owner ? `Read ${short(owner)}’s past trades` : 'Connect a wallet or paste an address'}</b>
          <p>Your ghost starts from what you already did: every settled Predict trade with its fill and payout, read from Sui mainnet. About 20 seconds.</p>
          <button className="primary" disabled={!owner || busy} onClick={() => load()}>
            {busy ? (
              <>
                <span className="spin" aria-hidden /> Reading mainnet…
              </>
            ) : (
              'Read my Predict history'
            )}
          </button>
        </div>
      ) : history.trades.length === 0 ? (
        <div className="empty">
          <img className="empty-art" src="/art/v2/eidolon2-empty.webp" alt="" width={120} height={120} />
          <b>No settled trades found</b>
          <p>No complete Predict trade with fill and payout events in the history this RPC can reach.</p>
        </div>
      ) : (
        <div className="history-body">
          <div className="tally">
            <div>
              <b className="num">{history.trades.length}</b>
              <small>settled</small>
            </div>
            <div>
              <b className="num">{wins}</b>
              <small>won</small>
            </div>
            <div>
              <b className={`num ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>{usdc(net)}</b>
              <small>net USDC</small>
            </div>
            <div>
              <b className="num">{pct(history.profile.upBias)}</b>
              <small>bets UP</small>
            </div>
            <div>
              <b className="num">{pct(history.profile.hitRate)}</b>
              <small>hit rate</small>
            </div>
            <button className="primary teach" disabled={rememberDisabled} onClick={remember}>
              <img src="/art/v2/eidolon2-memory-shards.webp" alt="" width={22} height={22} />
              {rememberLabel}
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Call</th>
                <th className="r">Strike <i>USD</i></th>
                <th className="r">Size <i>USDC</i></th>
                <th className="r">P&amp;L <i>USDC</i></th>
                <th className="r hide-sm">On SuiScan</th>
              </tr>
            </thead>
            <tbody>
              {(expanded ? history.trades : history.trades.slice(0, 8)).map((trade) => (
                <tr key={trade.fillDigest}>
                  <td>
                    <span className={`pill pill-${trade.side}`}>{trade.side === 'up' ? '↑ Higher' : '↓ Lower'}</span>
                  </td>
                  <td className="r num">${trade.strike.toLocaleString('en-US')}</td>
                  <td className="r num muted">{trade.size.toFixed(2)}</td>
                  <td className={`r num ${trade.pnl > 0 ? 'up' : trade.pnl < 0 ? 'down' : ''}`}>{usdc(trade.pnl)}</td>
                  <td className="r hide-sm links">
                    <a href={suiscan(trade.enqueueDigest)} target="_blank" rel="noreferrer">order</a>
                    <a href={suiscan(trade.fillDigest)} target="_blank" rel="noreferrer">fill</a>
                    <a href={suiscan(trade.payoutDigest)} target="_blank" rel="noreferrer">payout</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.trades.length > 8 && (
            <button className="more" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>
              {expanded ? 'Show fewer' : `Show all ${history.trades.length} trades`}
            </button>
          )}
          <p className="fine">
            {history.decision ? (
              <>
                Against your {side.toUpperCase()} on this market your ghost bets {history.decision.side.toUpperCase()} with{' '}
                <b className="num">{history.decision.size.toFixed(2)} USDC</b>.{' '}
              </>
            ) : null}
            Source: {history.source}. Average size {history.profile.averageSize.toFixed(2)} USDC.
          </p>
        </div>
      )}
      {message && (
        <p className="msg" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
