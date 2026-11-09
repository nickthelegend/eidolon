import { useEffect, useState } from 'react';
import { api, avatarFor, short, usdc, type LeaderRow } from '../api';

/** Who beat their own ghost: verified rounds only, podium first. */
export function Board({ owner }: { owner?: string }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    const load = () => api<LeaderRow[]>('/leaderboard').then(setRows).catch(() => setRows([]));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  const ranked = [...(rows ?? [])].sort((a, b) => b.playerPnl - b.ghostPnl - (a.playerPnl - a.ghostPnl));
  const podium = [ranked[1], ranked[0], ranked[2]];
  return (
    <section className="board">
      <img className="duelist duelist-you dim" src="/art/v2/eidolon2-duel-you.webp" alt="" aria-hidden />
      <img className="duelist duelist-ghost dim" src="/art/v2/eidolon2-duel-ghost.webp" alt="" aria-hidden />
      <header className="page-head center">
        <h1>Who beat their ghost</h1>
        <p>Settled rounds with both payouts verified on Sui. Edge = your P&amp;L minus your ghost’s.</p>
      </header>
      <ol className="plinths">
        {podium.map((r, i) => {
          const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
          return (
            <li key={rank} className={`plinth plinth-${rank} ${r ? '' : 'vacant'}`}>
              <span className="spot" aria-hidden />
              <img className="medal" src={`/art/v2/eidolon2-rank-${rank}.webp`} alt={`Rank ${rank}`} width={96} height={96} />
              <div className="plinth-card">
                {r ? (
                  <>
                    <span className="who">
                      <img className="avatar" src={avatarFor(r.player)} alt="" width={24} height={24} />
                      <b className="num">{short(r.player)}</b>
                    </span>
                    <small className="num">
                      {r.settled} settled · {usdc(r.playerPnl - r.ghostPnl)} USDC edge
                    </small>
                  </>
                ) : (
                  <small>Open seat</small>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {rows && rows.length === 0 && (
        <p className="board-empty">
          No one has a verified round yet. A player takes a seat after their first round settles and both payouts are proven on Sui.
        </p>
      )}
      {ranked.length > 0 && (
        <div className="card glass">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th className="r">Rounds</th>
                <th className="r">You <i>USDC</i></th>
                <th className="r">Ghost <i>USDC</i></th>
                <th className="r">Edge <i>USDC</i></th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.player} className={r.player === owner?.toLowerCase() ? 'me' : ''}>
                  <td className="num">#{i + 1}</td>
                  <td>
                    <span className="who">
                      <img className="avatar" src={avatarFor(r.player)} alt="" width={24} height={24} />
                      <span className="num">{short(r.player)}</span>
                    </span>
                  </td>
                  <td className="r num">{r.settled}</td>
                  <td className={`r num ${r.playerPnl >= 0 ? 'up' : 'down'}`}>{usdc(r.playerPnl)}</td>
                  <td className="r num spectral">{usdc(r.ghostPnl)}</td>
                  <td className={`r num ${r.playerPnl - r.ghostPnl >= 0 ? 'up' : 'down'}`}>{usdc(r.playerPnl - r.ghostPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
