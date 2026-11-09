import { useState } from 'react';
import { ago, hm, learn, pct, post, short, suiscan, usd, usdc, walruscan, type GhostFeed, type GhostTrade, type HistoryResponse, type Round, type Status } from '../api';

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
  const [all, setAll] = useState(false);
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
              {(all ? feed.trades : feed.trades.slice(0, 8)).map((t, i) => (
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
          {feed && feed.trades.length > 8 && (
            <button className="link-btn feed-more" onClick={() => setAll((x) => !x)}>
              {all ? 'Show the latest 8' : `Show all ${feed.trades.length} rounds`}
            </button>
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
          {history && history.trades.length > 1 && <Learned history={history} />}
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

/** What the ghost learned: sizing after wins and losses, the current streak, extremes, and your P&L curve. All from settled trades. */
function Learned({ history }: { history: HistoryResponse }) {
  const l = learn(history.trades);
  const lines: string[] = [];
  if (l.afterLoss != null && l.size != null)
    lines.push(
      l.afterLoss > l.size * 1.1
        ? `After a loss you size up: ${l.afterLoss.toFixed(2)} USDC against your ${l.size.toFixed(2)} average.`
        : l.afterLoss < l.size * 0.9
          ? `After a loss you shrink: ${l.afterLoss.toFixed(2)} USDC against your ${l.size.toFixed(2)} average.`
          : `A loss doesn’t change your size: ${l.afterLoss.toFixed(2)} USDC, about your average.`,
    );
  if (l.afterWin != null && l.size != null && Math.abs(l.afterWin - l.size) > l.size * 0.1)
    lines.push(`After a win you bet ${l.afterWin > l.size ? 'bigger' : 'smaller'}: ${l.afterWin.toFixed(2)} USDC.`);
  if (l.streak) lines.push(`You are on a ${Math.abs(l.streak)}-trade ${l.streak > 0 ? 'winning' : 'losing'} streak.`);
  if (l.worst && l.worst.pnl < 0) lines.push(`Your worst trade: ${l.worst.side === 'up' ? 'Higher' : 'Lower'} at $${l.worst.strike.toLocaleString('en-US')}, ${usdc(l.worst.pnl)} USDC.`);
  if (l.best && l.best.pnl > 0) lines.push(`Your best: ${l.best.side === 'up' ? 'Higher' : 'Lower'} at $${l.best.strike.toLocaleString('en-US')}, ${usdc(l.best.pnl)} USDC.`);
  const min = Math.min(0, ...l.curve);
  const max = Math.max(0, ...l.curve);
  const w = 260;
  const h = 64;
  const x = (i: number) => (l.curve.length < 2 ? 0 : (i / (l.curve.length - 1)) * w);
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const d = l.curve.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = l.curve.at(-1) ?? 0;
  return (
    <section className="card glass learned" aria-labelledby="learned-title">
      <h2 id="learned-title">What it learned about you</h2>
      <ul>
        {lines.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <figure className="curve" aria-label={`Your P&L over ${l.count} settled trades: ${usdc(last)} USDC`}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
          <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="zero" />
          <path d={d} className={last >= 0 ? 'up' : 'down'} />
        </svg>
        <figcaption>
          Your P&amp;L over {l.count} settled trades <b className={`num ${last >= 0 ? 'up' : 'down'}`}>{usdc(last)} USDC</b>
        </figcaption>
      </figure>
    </section>
  );
}
