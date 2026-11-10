import { useEffect, useState } from 'react';
import { api, avatarFor, short, usdc, type LeaderRow } from '../api';
import { State } from '../ui';

/** Who beat their own ghost: verified rounds only. */
export function Board({ owner }: { owner?: string }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () =>
      api<LeaderRow[]>('/leaderboard')
        .then((r) => {
          setRows(r);
          setErr('');
        })
        .catch((e) => setErr(String(e.message ?? e)));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  const ranked = [...(rows ?? [])].sort((a, b) => b.playerPnl - b.ghostPnl - (a.playerPnl - a.ghostPnl));
  return (
    <main className="order board" id="main">
      <header className="board-head">
        <span className="kicker">Leaderboard</span>
        <h1>Who beat their own ghost</h1>
        <p>Settled rounds with both payouts verified on Sui. Edge = your P&amp;L minus your ghost’s.</p>
      </header>
      <section className="pnl" data-film="leaderboard">
        {!rows ? (
          <State kind={err ? 'error' : 'loading'} title={err ? 'Could not read the leaderboard' : 'Reading verified rounds…'}>{err}</State>
        ) : !ranked.length ? (
          <State kind="empty" title="No verified round yet">A player takes a seat after their first round settles and both payouts are proven on Sui.</State>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Settled rounds</th>
                  <th>You <i>USDC</i></th>
                  <th>Ghost <i>USDC</i></th>
                  <th>Edge <i>USDC</i></th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.player} className={r.player === owner?.toLowerCase() ? 'sel' : ''}>
                    <td className="mono">#{i + 1}</td>
                    <td>
                      <span className="who">
                        <img className="avatar" src={avatarFor(r.player)} alt="" width={24} height={24} />
                        <span className="mono">{short(r.player)}</span>
                      </span>
                    </td>
                    <td className="mono">{r.settled}</td>
                    <td className={`mono ${r.playerPnl >= 0 ? 'up' : 'down'}`}>{usdc(r.playerPnl)}</td>
                    <td className="mono">{usdc(r.ghostPnl)}</td>
                    <td className={`mono ${r.playerPnl - r.ghostPnl >= 0 ? 'up' : 'down'}`}>{usdc(r.playerPnl - r.ghostPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
