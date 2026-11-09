import { useEffect, useState } from 'react';
import { api, short, suiscan, usd, usdc, walruscan, type LeaderRow, type Round } from '../api';

/** Your registered rounds, newest first, each with its on-chain evidence. */
export function Rounds({ rounds }: { rounds: Round[] }) {
  return (
    <section className="panel" aria-labelledby="rounds-title">
      <header className="panel-head with-icon">
        <img className="head-icon float" src="/art/eidolon-bell.webp" alt="" width={40} height={40} />
        <h2 id="rounds-title">Your rounds</h2>
        <p className="muted small">Your order, the ghost’s order and the payout, on Sui</p>
      </header>
      {rounds.length === 0 ? (
        <div className="empty">
          <img className="empty-art float" src="/art/eidolon-empty-arena.webp" alt="" width={96} height={96} />
          <b>No rounds yet</b>
          <p>Every round you queue shows here with its SuiScan order, the ghost’s order and the payout proof.</p>
        </div>
      ) : (
        <ul className="rounds">
          {[...rounds].reverse().map((r) => (
            <li key={r.digest} className="round">
              <div className="round-top">
                <span className={`side-pill side-${r.side}`}>{r.side === 'up' ? 'UP' : 'DOWN'}</span>
                <span className="num">{usd(r.strike)}</span>
                <span className="num muted">{r.size.toFixed(2)} USDC · {r.cadence}m</span>
                <span className="round-status">{r.status}</span>
              </div>
              <div className="round-legs">
                <span>
                  You <b className={`num ${pnlClass(r.playerLeg?.pnl)}`}>{usdc(r.playerLeg?.pnl)}</b>
                </span>
                <span>
                  Ghost <b className={`num ${pnlClass(r.ghost?.leg?.pnl)}`}>{usdc(r.ghost?.leg?.pnl)}</b>
                </span>
                {r.settlement != null && <span className="num muted">settled {usd(r.settlement, 2)}</span>}
              </div>
              <div className="round-links">
                <a href={suiscan(r.digest)} target="_blank" rel="noreferrer">
                  order {short(r.digest)}
                </a>
                {r.ghost?.leg && (
                  <a href={suiscan(r.ghost.leg.digest)} target="_blank" rel="noreferrer">
                    ghost {short(r.ghost.leg.digest)}
                  </a>
                )}
                {r.playerLeg?.payoutDigest && (
                  <a href={suiscan(r.playerLeg.payoutDigest)} target="_blank" rel="noreferrer">
                    payout
                  </a>
                )}
                {r.memoryBlobId && (
                  <a href={walruscan(r.memoryBlobId)} target="_blank" rel="noreferrer">
                    memory {short(r.memoryBlobId)}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Every player against their own ghost, from verified rounds only. */
export function Leaderboard() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    const load = () => api<LeaderRow[]>('/leaderboard').then(setRows).catch(() => setRows([]));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="panel" aria-labelledby="board-title">
      <header className="panel-head with-icon">
        <img className="head-icon float" src="/art/eidolon-trophy.webp" alt="" width={40} height={40} />
        <h2 id="board-title">You vs your ghost</h2>
        <p className="muted small">Settled rounds with payout events verified on chain</p>
      </header>
      {!rows || rows.length === 0 ? (
        <div className="empty">
          <img className="empty-art float" src="/art/eidolon-coins.webp" alt="" width={96} height={96} />
          <b>No verified players yet</b>
          <p>A player appears after their first round settles and both payouts are proven on Sui.</p>
        </div>
      ) : (
        <ul className="board">
          {rows.map((r) => {
            const total = Math.abs(r.playerPnl) + Math.abs(r.ghostPnl) || 1;
            return (
              <li key={r.player}>
                <span className="num">{short(r.player)}</span>
                <span className="board-bar" aria-hidden>
                  <span className="board-you" style={{ width: `${(Math.abs(r.playerPnl) / total) * 100}%` }} />
                  <span className="board-ghost" style={{ width: `${(Math.abs(r.ghostPnl) / total) * 100}%` }} />
                </span>
                <span className={`num ${pnlClass(r.playerPnl)}`}>{usdc(r.playerPnl)}</span>
                <span className={`num ${pnlClass(r.ghostPnl)}`}>{usdc(r.ghostPnl)}</span>
                <span className="num muted">{r.settled} settled</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const pnlClass = (n: number | undefined) => (n == null ? 'muted' : n > 0 ? 'up' : n < 0 ? 'down' : '');
