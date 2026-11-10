import { useEffect, useState } from 'react';
import { api, clockText, humanError, pct, usd, type GhostFeed, type Market, type PriceSample, type Status } from './api';
import Chart from './Chart';
import { MeetForm, SAMPLE, nextMarket, useMove } from './Terminal';
import { Btc, Icon, SidePill } from './ui';
import { Logo } from './components/Logo';

const Art = ({ src, className }: { src: string; className?: string }) => (
  <div className={`art ${className ?? ''}`} aria-hidden="true">
    <img src={src} alt="" />
  </div>
);

/** The real terminal, live and read-only, in a device frame. */
function TerminalPreview({ markets, samples, now }: { markets: Market[]; samples: PriceSample[]; now: number }) {
  const m = nextMarket(markets, 5, now) ?? nextMarket(markets, 1, now);
  const fwd = samples.at(-1)?.forward ?? m?.forward ?? null;
  const move = useMove(samples);
  return (
    <div className="device" aria-label="Live preview of the Eidolon market screen" data-film="landing-preview">
      <div className="device-bar">
        <i />
        <i />
        <i />
        <span className="mono">eidolon · bitcoin up or down</span>
      </div>
      <div className="prev">
        <div className="prev-mbar">
          <Btc size={24} />
          <b>Bitcoin Up or Down</b>
          <span className="mono prev-last">{usd(fwd, 2)}</span>
          {move && <span className={`mono ${move.delta >= 0 ? 'up' : 'down'}`}>{move.delta >= 0 ? '▲' : '▼'} {usd(Math.abs(move.delta))}</span>}
          <span className="mono prev-src">{m ? `closes in ${clockText(m.expiryMs - now)}` : 'DeepBook Predict'}</span>
        </div>
        <div className="prev-chart">
          <Chart samples={samples} expiryMs={m?.expiryMs ?? null} lines={m?.suggestedStrike ? [{ value: m.suggestedStrike, who: 'beat', side: 'up' }] : []} compact minutes={6} />
        </div>
        <div className="prev-form">
          <p className="prev-h">Your call</p>
          <div className="updown">
            <a className="ud ud-up" href="#/trade">
              <span>
                <Icon name="up" size={14} />
                Up
              </span>
              <small className="num">above {usd(m?.suggestedStrike)}</small>
            </a>
            <a className="ud ud-down" href="#/trade">
              <span>
                <Icon name="down" size={14} />
                Down
              </span>
              <small className="num">below {usd(m?.suggestedStrikeDown)}</small>
            </a>
          </div>
          <div className="prev-ghost">
            <img src="/art/v2/eidolon2-ghost-smug.webp" alt="" aria-hidden />
            <span>
              Your ghost takes the <b>other side</b>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ markets, samples, now, status, onViewAs }: { markets: Market[]; samples: PriceSample[]; now: number; status: Status | null; onViewAs: (a: string) => string }) {
  const [feed, setFeed] = useState<GhostFeed | null>(null);
  useEffect(() => {
    api<GhostFeed>(`/ghost-feed?player=${SAMPLE}`).then(setFeed).catch(() => {});
  }, []);
  const fwd = samples.at(-1)?.forward ?? null;
  const called = feed?.trades.filter((t) => t.won != null) ?? [];
  const last = feed?.trades[0];
  const recall = last?.steps.find((s) => s.tool === 'read_habits');

  return (
    <>
      <div className="dark hero-wrap">
        <header className="l-nav">
          <Logo />
          <nav aria-label="Primary" className="l-links">
            <a href="#how">How it works</a>
            <a href="#proof">Proof</a>
            <a href="#/leaderboard">Leaderboard</a>
          </nav>
          <a href="#/trade" className="btn btn-primary btn-sm">Open the market</a>
        </header>
        <section className="hero">
          <div className="hero-copy">
            <p className="pill-live">
              <i className="live" />
              Live on Sui mainnet
            </p>
            <h1 data-film="hero-title">
              Trade against your <em>past self.</em>
            </h1>
            <p className="hero-lede">Most traders lose to the same opponent: themselves. Eidolon turns your trading history into a ghost that bets against you, every round.</p>
            <MeetForm onViewAs={onViewAs} big />
          </div>
          <Art src="/art/v2/eidolon2-hero.webp" className="hero-art" />
        </section>
        <div className="hero-device">
          <TerminalPreview markets={markets} samples={samples} now={now} />
        </div>
      </div>

      <main id="main" className="l-main">
        <section className="trust" aria-label="Where the data comes from">
          <img src="/art/v2/eidolon2-memory-vault.webp" alt="" aria-hidden className="trust-seal" />
          <div className="trust-title">
            <b>Real data only</b>
            <span>Every number is read from Sui mainnet or recalled from Walrus.</span>
          </div>
          <dl className="trust-items">
            <div><dt>Markets</dt><dd>DeepBook Predict</dd></div>
            <div><dt>Memory</dt><dd>Walrus mainnet</dd></div>
            <div><dt>Chain reads</dt><dd>{status?.rpc ?? '…'}</dd></div>
            <div><dt>Settlement</dt><dd>Pyth price at expiry</dd></div>
          </dl>
        </section>

        <dl className="numbers" aria-label="Live numbers" data-film="landing-numbers">
          <div>
            <dt>
              <span className="tamt"><Btc size={16} />BTC now · Predict</span>
            </dt>
            <dd className="mono">{fwd ? usd(fwd, 2) : '…'}</dd>
          </div>
          <div>
            <dt>Markets open now</dt>
            <dd>{markets.length || '…'}</dd>
          </div>
          <div>
            <dt>Memories on Walrus <small>(Nov 9 count)</small></dt>
            <dd>113</dd>
          </div>
          <div>
            <dt>Rounds the public ghost played</dt>
            <dd>{feed ? feed.stats.cycles : '…'}</dd>
          </div>
          <div>
            <dt>It would have won</dt>
            <dd>
              {feed ? called.filter((t) => t.won).length : '…'}
              <small>{feed ? ` of ${called.length}` : ''}</small>
            </dd>
          </div>
        </dl>

        <section className="benefits" id="how">
          <article className="ben">
            <Art src="/art/v2/eidolon2-memory-shards.webp" className="ben-art" />
            <div className="ben-copy">
              <p className="kicker">01 · It remembers you</p>
              <h2>Your trades become memories.</h2>
              <p>Eidolon reads your settled BTC bets from Sui and stores each one on Walrus, a decentralized storage network.</p>
              {last && last.blobIds.length > 0 && (
                <ul className="ben-rows">
                  {last.blobIds.slice(0, 3).map((b) => (
                    <li key={b}>
                      <Icon name="memory" size={14} />
                      <span className="mono dim">{b.slice(0, 22)}…</span>
                      <a className="tx" href={`https://walruscan.com/mainnet/blob/${b}`} target="_blank" rel="noreferrer">
                        Walruscan <Icon name="external" size={12} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
          <article className="ben ben-flip">
            <Art src="/art/v2/eidolon2-ghost-smug.webp" className="ben-art" />
            <div className="ben-copy">
              <p className="kicker">02 · It reads your habits</p>
              <h2>It knows what you’ll do next.</h2>
              <p>Which side you favour, how often you hit, how you size after a loss. The ghost reads it from memory before every round.</p>
              {recall && last && (
                <div className="ben-live">
                  <span className="label">Read from a real trader’s memories</span>
                  <p className="ben-quote">
                    “{recall.detail}.” So it goes <SidePill side={last.side} />
                  </p>
                </div>
              )}
            </div>
          </article>
          <article className="ben">
            <Art src="/art/v2/eidolon2-hourglass-5m.webp" className="ben-art" />
            <div className="ben-copy">
              <p className="kicker">03 · It bets against you</p>
              <h2>Every round, even while you’re away.</h2>
              <p>It takes the other side of your habit on 1- and 5-minute Bitcoin markets. Beat it, and you’ve beaten your own habits.</p>
              {last && (
                <div className="ben-cross">
                  <div>
                    <span className="label">Ghost’s latest bet</span>
                    <b className="mono">
                      {last.side === 'up' ? 'Up' : 'Down'} {last.strike ? usd(last.strike) : ''}
                    </b>
                  </div>
                  <div>
                    <span className="label">Odds</span>
                    <b className="mono">{last.probability != null ? pct(last.probability) : '—'}</b>
                  </div>
                  <div>
                    <span className="label">Status</span>
                    <b className="mono">{last.status}</b>
                  </div>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="l-sec" id="proof">
          <header className="l-head">
            <p className="kicker">Live proof</p>
            <h2>One public trader, one ghost, every step on screen.</h2>
          </header>
          <div className="runlist">
            <p className="runlist-h">The public ghost’s latest round, step by step</p>
            {last ? (
              <ol>
                {last.steps.map((s, i) => (
                  <li key={i} className={s.ok ? '' : 'is-bad'}>
                    <code>{s.tool}</code>
                    <p>{humanError(s.detail)}</p>
                    <span className="mono dim">{new Date(s.at).toISOString().slice(11, 19)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="dim runlist-empty">{feed ? 'No rounds yet.' : 'Reading the ghost’s rounds…'}</p>
            )}
            {last && (
              <a className="btn btn-ghost btn-sm" href={`/?as=${SAMPLE}#/round/${encodeURIComponent(last.id)}`}>
                Open this round <Icon name="arrow" size={14} />
              </a>
            )}
          </div>
        </section>
      </main>

      <section className="dark cta">
        <Art src="/art/v2/eidolon2-duel.webp" className="cta-art" />
        <div>
          <h2>Meet the trader who knows you best.</h2>
          <a href={`/?as=${SAMPLE}#/trade`} className="btn btn-primary btn-lg" data-film="cta">
            Meet a real ghost <Icon name="arrow" size={17} />
          </a>
        </div>
      </section>

      <footer className="l-foot">
        <div className="l-foot-in">
          <div className="l-foot-brand">
            <Logo />
            <p>Trade Bitcoin Up or Down on DeepBook Predict against a ghost built from your own Walrus memories.</p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="#/trade">Market</a>
            <a href="#/leaderboard">Leaderboard</a>
            <a href="#how">How it works</a>
          </div>
          <div>
            <h4>Built on</h4>
            <a href="https://suiscan.xyz/mainnet" target="_blank" rel="noreferrer">Sui mainnet <Icon name="external" size={11} /></a>
            <a href="https://walruscan.com/mainnet" target="_blank" rel="noreferrer">Walrus mainnet <Icon name="external" size={11} /></a>
            <span>Tatum Sui gateway · DeepBook Predict</span>
          </div>
          <div>
            <h4>Status</h4>
            <span>{status ? (status.mainnetWrites ? 'Live orders on' : 'Dry-run: reads and simulations only') : '…'}</span>
            <span>Art generated with ChatGPT.</span>
          </div>
        </div>
        <p className="l-legal">MIT · © 2026 Nivesh Gajengi · Not financial advice. Prediction markets can lose your whole stake.</p>
      </footer>
    </>
  );
}
