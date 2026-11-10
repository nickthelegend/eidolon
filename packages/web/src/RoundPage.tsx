import { hm, humanError, pct, short, usd, usdc, type GhostFeed, type GhostTrade, type Round } from './api';
import { statusTone } from './Terminal';
import { Blob, Icon, SidePill, State, Tx, sideWord } from './ui';

const TOOL_WORDS: Record<string, string> = {
  recall_memories: 'Recalled your trades from Walrus',
  read_habits: 'Read your habits',
  predict_player: 'Guessed your next call',
  pick_strike: 'Picked the opposite strike',
  size_bet: 'Sized its bet',
  quote: 'Got Predict’s price',
  dry_run: 'Simulated the order',
  explain: 'Claude Haiku explained the decision',
  recap: 'Claude Haiku recapped the round',
  place_order: 'Placed the order from its own wallet',
  settle: 'Settled at the Pyth price',
};

/** One order in detail: a ghost round (every tool step) or one of your rounds (both legs). */
export default function RoundPage({ id, feed, rounds, now }: { id: string; feed: GhostFeed | null; rounds: Round[]; now: number }) {
  const t = feed?.trades.find((x) => x.id === id);
  const r = rounds.find((x) => x.digest === id);
  return (
    <main className="order" id="main">
      <a className="back" href="#/trade/ghost">
        <Icon name="back" size={16} />
        Back to the market
      </a>
      {t ? <GhostRound t={t} live={feed?.mode === 'live'} now={now} /> : r ? <PlayerRound r={r} /> : !feed ? <State kind="loading" title="Reading the ghost’s rounds…" /> : <State kind="empty" title="This round isn’t in the ghost’s recent feed">It may be older than the feed keeps, or belong to another address. Open the market and pick a round from the tables.</State>}
    </main>
  );
}

function GhostRound({ t, live, now }: { t: GhostTrade; live: boolean; now: number }) {
  const closed = t.expiryMs <= now;
  const stopped = t.won == null && t.steps.length > 0 && !t.steps.at(-1)!.ok;
  return (
    <>
      <div className="order-hero">
        <section className="pnl osum">
          <header>
            <img className="osum-art" src="/art/v2/eidolon2-ghost-smug.webp" alt="" aria-hidden />
            <div>
              <span className="label">Ghost round · {t.cadence}-minute BTC market</span>
              <h1>
                Ghost bet <SidePill side={t.side} />
              </h1>
            </div>
            <span className={`st ${statusTone(t)}`}>
              <i />
              {t.status}
            </span>
          </header>
          <dl className="osum-grid">
            <div><dt>Strike</dt><dd className="num">{t.strike ? `${t.side === 'up' ? 'above' : 'below'} ${usd(t.strike)}` : '—'}</dd></div>
            <div><dt>Stake</dt><dd className="num">{t.size ? `${t.size.toFixed(2)} USDC` : '—'}</dd></div>
            <div><dt>Odds</dt><dd className="num">{t.probability != null ? pct(t.probability) : '—'}</dd></div>
            <div><dt>Your likely call</dt><dd>{sideWord(t.playerSide)}</dd></div>
            <div><dt>Started</dt><dd className="num">{hm(t.createdAt)}</dd></div>
            <div><dt>Market closes</dt><dd className="num">{hm(t.expiryMs)}</dd></div>
            <div><dt>Mode</dt><dd>{t.live ? 'Order placed' : 'Dry-run, not placed'}</dd></div>
            <div><dt>Market</dt><dd className="num"><a href={`https://suiscan.xyz/mainnet/object/${t.marketId}`} target="_blank" rel="noreferrer">{short(t.marketId)}</a></dd></div>
          </dl>
        </section>
        <section className="verdict dark" data-film="verdict">
          <span className="label">{stopped ? 'Stopped before placing' : t.won == null ? (closed ? 'Waiting for settlement' : 'Round open') : 'Result'}</span>
          <p className="verdict-big">{stopped ? 'Not placed' : t.won == null ? (closed ? 'Settling…' : 'In play') : t.won ? (t.live ? 'The ghost won' : 'Would have won') : t.live ? 'The ghost lost' : 'Would have lost'}</p>
          <div className="cross">
            <div>
              <span>Ghost strike</span>
              <b className="num">{t.strike ? usd(t.strike) : '—'}</b>
            </div>
            <i>vs</i>
            <div>
              <span>Pyth close</span>
              <b className="num gold">{t.settlement != null ? usd(t.settlement, 2) : '—'}</b>
            </div>
          </div>
          <p className="verdict-note">
            It read {t.profile.recalled} memories: you bet Up {pct(t.profile.upBias)} of the time and hit {pct(t.profile.hitRate)}. {live ? '' : 'This server is dry-run, so the ghost priced and simulated the order but sent nothing.'}
          </p>
        </section>
      </div>

      <section className="order-sec">
        <h2>What the ghost did, step by step</h2>
        <ol className="steps" data-film="steps">
          {t.steps.map((s, i) => (
            <li key={i} className={s.ok ? '' : 'bad'}>
              <span className="step-dot" aria-hidden>{s.ok ? <Icon name="check" size={12} /> : '!'}</span>
              <div>
                <p>
                  <code>{s.tool}</code> <b>{TOOL_WORDS[s.tool] ?? ''}</b>
                </p>
                <span>{humanError(s.detail)}</span>
              </div>
              <time className="mono dim">{hm(s.at)}</time>
            </li>
          ))}
        </ol>
      </section>

      <section className="order-sec">
        <h2>Memories it recalled <small className="dim">{t.blobIds.length} on Walrus</small></h2>
        {t.blobIds.length ? (
          <ul className="blobs" data-film="recalled-blobs">
            {t.blobIds.map((b) => (
              <li key={b}>
                <Icon name="memory" size={14} />
                <code>{b}</code>
                <Blob id={b} label="Walruscan" />
              </li>
            ))}
          </ul>
        ) : (
          <State kind="empty" title="No Walrus memories for this round">It was built from chain history only.</State>
        )}
      </section>

      <section className="order-sec">
        <h2>On Sui</h2>
        <dl className="facts">
          <div><dt>Ghost order</dt><dd data-film="haunt-order-tx">{t.leg?.digest ? <Tx digest={t.leg.digest} /> : t.live ? 'not placed' : 'dry-run, nothing sent'}</dd></div>
          <div><dt>Payout</dt><dd>{t.leg?.payoutDigest ? <Tx digest={t.leg.payoutDigest} /> : '—'}</dd></div>
          <div><dt>P&amp;L</dt><dd className="num">{t.leg?.pnl != null ? `${usdc(t.leg.pnl)} USDC` : '—'}</dd></div>
        </dl>
      </section>
    </>
  );
}

function PlayerRound({ r }: { r: Round }) {
  const you = r.playerLeg?.pnl;
  const gh = r.ghost?.leg?.pnl;
  return (
    <>
      <div className="order-hero">
        <section className="pnl osum">
          <header>
            <img className="osum-art" src="/art/v2/eidolon2-duel-you.webp" alt="" aria-hidden />
            <div>
              <span className="label">Your round · {r.cadence}-minute BTC market</span>
              <h1>
                You called <SidePill side={r.side} />
              </h1>
            </div>
            <span className={`st ${r.status === 'settled' ? 'st-won' : 'st-wait'}`}>
              <i />
              {r.status}
            </span>
          </header>
          <dl className="osum-grid">
            <div><dt>Your strike</dt><dd className="num">{`${r.side === 'up' ? 'above' : 'below'} ${usd(r.strike)}`}</dd></div>
            <div><dt>Stake</dt><dd className="num">{r.size.toFixed(2)} USDC</dd></div>
            <div><dt>Ghost</dt><dd>{r.ghost ? <><SidePill side={r.ghost.side} /> {r.ghost.strike ? usd(r.ghost.strike) : ''}</> : '—'}</dd></div>
            <div><dt>Ghost stake</dt><dd className="num">{r.ghost ? `${r.ghost.size.toFixed(2)} USDC` : '—'}</dd></div>
            <div><dt>Market closes</dt><dd className="num">{hm(r.expiryMs)}</dd></div>
            <div><dt>Order</dt><dd><Tx digest={r.digest} /></dd></div>
          </dl>
        </section>
        <section className="verdict dark">
          <span className="label">{r.status === 'settled' ? `Pyth close ${usd(r.settlement, 2)}` : 'Waiting for settlement'}</span>
          <p className="verdict-big">{r.status !== 'settled' ? 'In play' : (you ?? 0) > (gh ?? -Infinity) ? 'You beat your ghost' : 'Your ghost beat you'}</p>
          <div className="cross">
            <div>
              <span>You</span>
              <b className="num">{usdc(you)}</b>
            </div>
            <i>vs</i>
            <div>
              <span>Ghost</span>
              <b className="num gold">{usdc(gh)}</b>
            </div>
          </div>
          {r.ghost?.line && <p className="verdict-note">“{r.ghost.line}”</p>}
        </section>
      </div>
      <section className="order-sec">
        <h2>Proof</h2>
        <dl className="facts">
          <div><dt>Your order</dt><dd data-film="player-order-tx"><Tx digest={r.digest} /></dd></div>
          <div><dt>Ghost’s answer</dt><dd data-film="ghost-answer-tx">{r.ghost?.leg ? <Tx digest={r.ghost.leg.digest} /> : r.ghost?.status ?? '—'}</dd></div>
          <div><dt>Your payout</dt><dd>{r.playerLeg?.payoutDigest ? <Tx digest={r.playerLeg.payoutDigest} /> : '—'}</dd></div>
          <div><dt>Ghost payout</dt><dd>{r.ghost?.leg?.payoutDigest ? <Tx digest={r.ghost.leg.payoutDigest} /> : '—'}</dd></div>
          <div><dt>Memory on Walrus</dt><dd>{r.memoryBlobId ? <Blob id={r.memoryBlobId} /> : 'written after a verified payout'}</dd></div>
          <div><dt>Memories the ghost recalled</dt><dd>{r.ghost?.recalledBlobIds.length ?? 0}{r.ghost?.seat ? ` · from public trader ${short(r.ghost.seat)} (LOCAL FORK stand-in)` : ''}</dd></div>
          <div><dt>Round status</dt><dd>{r.status}</dd></div>
        </dl>
        {r.ghost && r.ghost.recalledBlobIds.length > 0 && (
          <ul className="blobs">
            {r.ghost.recalledBlobIds.map((b) => (
              <li key={b}>
                <Icon name="memory" size={14} />
                <code>{b}</code>
                <Blob id={b} label="Walruscan" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
