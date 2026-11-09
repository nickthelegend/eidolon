import { useEffect, useState } from 'react';
import { api, avatarFor, short, suiscan, usd, usdc, walruscan, type LeaderRow, type Round } from '../api';

/** Your registered rounds, newest first, each with its on-chain evidence. */
export function Rounds({ rounds }: { rounds: Round[] }) {
  if (rounds.length === 0)
    return (
      <div className="empty">
        <img className="empty-art float" src="/art/v2/eidolon2-coin-ghost.webp" alt="" width={120} height={120} />
        <b>No rounds yet</b>
        <p>Every round you queue lands here with your order, the ghost’s order and the payout, each on SuiScan.</p>
      </div>
    );
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Call</th>
          <th className="r">Strike <i>USD</i></th>
          <th className="r">You <i>USDC</i></th>
          <th className="r">Ghost <i>USDC</i></th>
          <th className="r hide-sm">Proof</th>
        </tr>
      </thead>
      <tbody>
        {[...rounds].reverse().map((r) => (
          <tr key={r.digest}>
            <td>
              <span className={`pill pill-${r.side}`}>{r.side === 'up' ? '↑ Higher' : '↓ Lower'}</span>{' '}
              <span className="muted small num">
                {r.size.toFixed(2)} · {r.cadence}m · {r.status}
              </span>
            </td>
            <td className="r num">{usd(r.strike)}</td>
            <td className={`r num ${pnl(r.playerLeg?.pnl)}`}>{usdc(r.playerLeg?.pnl)}</td>
            <td className={`r num ${pnl(r.ghost?.leg?.pnl)}`}>{usdc(r.ghost?.leg?.pnl)}</td>
            <td className="r hide-sm links">
              <a href={suiscan(r.digest)} target="_blank" rel="noreferrer">order</a>
              {r.ghost?.leg && (
                <a href={suiscan(r.ghost.leg.digest)} target="_blank" rel="noreferrer">ghost</a>
              )}
              {r.playerLeg?.payoutDigest && (
                <a href={suiscan(r.playerLeg.payoutDigest)} target="_blank" rel="noreferrer">payout</a>
              )}
              {r.memoryBlobId && (
                <a href={walruscan(r.memoryBlobId)} target="_blank" rel="noreferrer">memory</a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  if (!rows) return <div className="ghost-skel" aria-hidden><span /><span /></div>;
  if (rows.length === 0)
    return (
      <div className="empty">
        <img className="empty-art float" src="/art/v2/eidolon2-rank-1.webp" alt="" width={120} height={120} />
        <b>No one has beaten their ghost yet</b>
        <p>A player shows up after their first round settles and both payouts are proven on Sui.</p>
      </div>
    );
  const ranked = [...rows].sort((a, b) => b.playerPnl - b.ghostPnl - (a.playerPnl - a.ghostPnl));
  return (
    <>
      <ol className="podium">
        {ranked.slice(0, 3).map((r, i) => (
          <li key={r.player} className={`podium-${i + 1}`}>
            <img className="medal" src={`/art/v2/eidolon2-rank-${i + 1}.webp`} alt="" width={56} height={56} />
            <img className="avatar avatar-lg" src={avatarFor(r.player)} alt="" width={56} height={56} />
            <b className="num">{short(r.player)}</b>
            <span className={`edge num ${pnl(r.playerPnl - r.ghostPnl)}`}>{usdc(r.playerPnl - r.ghostPnl)}</span>
            <small>USDC ahead of their ghost · {r.settled} settled</small>
          </li>
        ))}
      </ol>
      {ranked.length > 3 && (
        <table className="table">
          <thead>
            <tr>
              <th>Trader</th>
              <th className="r">You <i>USDC</i></th>
              <th className="r">Ghost <i>USDC</i></th>
              <th className="r">Settled</th>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(3).map((r) => (
              <tr key={r.player}>
                <td>
                  <span className="who">
                    <img className="avatar" src={avatarFor(r.player)} alt="" width={24} height={24} />
                    <span className="num">{short(r.player)}</span>
                  </span>
                </td>
                <td className={`r num ${pnl(r.playerPnl)}`}>{usdc(r.playerPnl)}</td>
                <td className={`r num ${pnl(r.ghostPnl)}`}>{usdc(r.ghostPnl)}</td>
                <td className="r num muted">{r.settled}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const pnl = (n: number | undefined) => (n == null ? 'muted' : n > 0 ? 'up' : n < 0 ? 'down' : '');
