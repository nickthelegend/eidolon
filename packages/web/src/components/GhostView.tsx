import { useState } from 'react';
import { ago, hm, pct, post, short, suiscan, usd, usdc, walruscan, type GhostFeed, type GhostTrade, type HistoryResponse, type Round, type Status } from '../api';

/** The ghost on its own: who it thinks you are, and every trade it makes by itself, step by step. */
export function GhostView({
  owner,
  now,
  history,
  historyBusy,
  feed,
  setFeed,
  rounds,
  status,
  onMemories,
}: {
  owner: string;
  now: number;
  history: HistoryResponse | null;
  historyBusy: boolean;
  feed: GhostFeed | null;
  setFeed: (f: GhostFeed) => void;
  rounds: Round[];
  status: Status | null;
  onMemories: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const p = history?.profile;
  const dominantUp = (p?.upBias ?? 0.5) >= 0.5;
  const lean = p ? (dominantUp ? p.upBias : 1 - p.upBias) : 0;
  const settledMine = rounds.filter((r) => r.status === 'settled');
  const youPnl = settledMine.reduce((n, r) => n + (r.playerLeg?.pnl ?? 0), 0);
  const ghostRoundPnl = settledMine.reduce((n, r) => n + (r.ghost?.leg?.pnl ?? 0), 0);
  const called = feed?.trades.filter((t) => t.won != null) ?? [];
  const calledWins = called.filter((t) => t.won).length;
  const last = feed?.trades[0];
  const mood = historyBusy ? 'thinking' : p && history?.trades.length ? 'smug' : 'idle';

  async function toggle() {
    setBusy(true);
    setMsg('');
    try {
      setFeed(await post<GhostFeed>('/haunt', { player: owner, on: !feed?.haunting, cadence: 5 }));
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ghostview">
      <div className="gv-hero">
        <img key={mood} className="gv-mask" src={`/art/v2/eidolon2-ghost-${mood}.webp`} alt="" width={420} height={420} aria-hidden />
        <blockquote className="gv-quote">
          {historyBusy && !history
            ? 'Reading your trades…'
            : p && history?.trades.length
              ? `“You bet ${dominantUp ? 'Higher' : 'Lower'} ${pct(lean)} of the time and hit ${pct(p.hitRate)}. I bet the other way. Every round.”`
              : '“I haven’t met you yet. Give me your trades.”'}
        </blockquote>
        <div className="gv-auto">
          <span className={`auto-chip ${feed?.haunting ? 'on' : ''}`}>
            <i className={`dot ${feed?.haunting ? 'dot-live' : ''}`} aria-hidden />
            {feed?.haunting ? 'Autonomous' : 'Asleep'}
            <small>{feed?.haunting ? ` · trades every 5-minute round${last ? ` · last move ${ago(last.createdAt, now)}` : ''}` : ' · only answers your own bets'}</small>
          </span>
          <button className={feed?.haunting ? 'ghost-btn' : 'callit'} disabled={busy || !history?.trades.length} onClick={toggle}>
            {busy ? 'One moment…' : feed?.haunting ? 'Stop it trading on its own' : 'Let it trade on its own'}
          </button>
        </div>
        <p className="fine">
          {feed?.ghost ? (
            <>
              Its own wallet <a href={`https://suiscan.xyz/mainnet/account/${feed.ghost}`} target="_blank" rel="noreferrer" className="num">{short(feed.ghost)}</a> ·{' '}
            </>
          ) : null}
          {feed?.mode === 'live' ? 'live orders on Sui mainnet, capped per day' : 'this server is dry-run only: it prices, simulates and settles every call, but sends nothing'}
        </p>
        {msg && <p className="notice notice-error">{msg}</p>}
      </div>

      <div className="gv-side">
        <section className="card glass feed" aria-labelledby="feed-title">
          <header>
            <h2 id="feed-title">Ghost trade feed</h2>
            <span className="muted small num">{feed ? `${feed.stats.cycles} rounds` : ''}</span>
          </header>
          {!feed || feed.trades.length === 0 ? (
            <div className="empty">
              <img className="empty-art float" src="/art/v2/eidolon2-hourglass-5m.webp" alt="" width={96} height={96} />
              <b>{feed?.haunting ? 'Waiting for the next 5-minute market' : 'No trades of its own yet'}</b>
              <p>{feed?.haunting ? 'It picks the next market with at least 45 seconds left and trades it.' : 'Let it trade on its own and every round lands here, each step visible.'}</p>
            </div>
          ) : (
            <ol className="feed-rows">
              {feed.trades.map((t, i) => (
                <li key={t.id} className={`${i === 0 ? 'newest' : ''} ${open === t.id ? 'open' : ''}`}>
                  <button className="feed-row" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
                    <span className="num muted">{hm(t.createdAt)}</span>
                    <span className={`pill pill-${t.side}`}>Ghost bet {t.side === 'up' ? 'Higher' : 'Lower'}</span>
                    <span className="num">{t.strike ? usd(t.strike) : '—'}</span>
                    <span className="num">{t.size ? `${t.size.toFixed(2)} USDC` : '—'}</span>
                    <span className={`fr-status ${statusTone(t)}`}>{t.leg ? `tx ${short(t.leg.digest)}` : t.status}</span>
                  </button>
                  {open === t.id && <Steps t={t} />}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="gv-panels">
          <section className="card glass" aria-labelledby="read-title">
            <h2 id="read-title">Read from your memory</h2>
            {p && history?.trades.length ? (
              <>
                <Bar label="Bets Higher" value={p.upBias} text={pct(p.upBias)} />
                <Bar label="Hit rate" value={p.hitRate} text={pct(p.hitRate)} />
                <Bar label="Avg stake" value={Math.min(1, p.averageSize / 10)} text={`${p.averageSize.toFixed(2)} USDC`} />
                <p className="fine">
                  {history.source}.{' '}
                  <button className="link-btn" onClick={onMemories}>
                    See every memory →
                  </button>
                </p>
              </>
            ) : (
              <p className="fine">{historyBusy ? 'Reading…' : status?.setup.some((s) => s.includes('MEMWAL')) ? 'Setup required: Walrus Memory' : 'No settled trades to read yet.'}</p>
            )}
          </section>
          <section className="card glass" aria-labelledby="pnl-title">
            <h2 id="pnl-title">You vs your ghost</h2>
            {settledMine.length ? (
              <div className="vs-pnl">
                <span>
                  <small>You</small>
                  <b className={`num ${youPnl >= 0 ? 'up' : 'down'}`}>{usdc(youPnl)}</b>
                </span>
                <span>
                  <small>Ghost</small>
                  <b className="num spectral">{usdc(ghostRoundPnl)}</b>
                </span>
              </div>
            ) : (
              <p className="fine">No settled round between you yet.</p>
            )}
            <div className="vs-pnl">
              <span>
                <small>Its own calls settled</small>
                <b className="num">{called.length}</b>
              </span>
              <span>
                <small>{feed?.mode === 'live' ? 'Won' : 'Would have won'}</small>
                <b className="num spectral">{called.length ? `${calledWins} of ${called.length}` : '—'}</b>
              </span>
              {feed?.stats.placed ? (
                <span>
                  <small>Live P&amp;L</small>
                  <b className={`num ${feed.stats.pnl >= 0 ? 'up' : 'down'}`}>{usdc(feed.stats.pnl)}</b>
                </span>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

const statusTone = (t: GhostTrade) => (t.won === true ? 'up' : t.won === false ? 'down' : t.leg ? 'spectral' : 'muted');

function Steps({ t }: { t: GhostTrade }) {
  return (
    <ol className="steps">
      {t.steps.map((s, i) => (
        <li key={i} className={s.ok ? '' : 'bad'}>
          <code>{s.tool}</code>
          <span>{s.detail}</span>
        </li>
      ))}
      {t.blobIds.length > 0 && (
        <li>
          <code>memories</code>
          <span className="chips">
            {t.blobIds.slice(0, 4).map((id) => (
              <a key={id} className="chip" href={walruscan(id)} target="_blank" rel="noreferrer">
                {short(id)}
              </a>
            ))}
            {t.blobIds.length > 4 && <span className="chip chip-more">+{t.blobIds.length - 4}</span>}
          </span>
        </li>
      )}
      {t.leg?.digest && (
        <li>
          <code>proof</code>
          <span>
            <a href={suiscan(t.leg.digest)} target="_blank" rel="noreferrer">order on SuiScan</a>
            {t.leg.payoutDigest && (
              <>
                {' · '}
                <a href={suiscan(t.leg.payoutDigest)} target="_blank" rel="noreferrer">payout</a>
              </>
            )}
          </span>
        </li>
      )}
    </ol>
  );
}

function Bar({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <span className="bar-track" aria-hidden>
        <span className="bar-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <b className="num">{text}</b>
    </div>
  );
}
