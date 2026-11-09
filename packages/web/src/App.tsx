import { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { DEMO_WALLET_NAME } from './demoWallet';
import {
  api,
  avatarFor,
  clockText,
  humanError,
  pct,
  post,
  short,
  usd,
  usdc,
  type FundingPlan,
  type HistoryResponse,
  type Market,
  type Plan,
  type PriceSample,
  type Round,
  type Side,
  type Status,
} from './api';
import { Countdown } from './components/Countdown';
import { GhostPanel } from './components/GhostPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { LiveChart } from './components/LiveChart';
import { Quote } from './components/Quote';
import { Leaderboard, Rounds } from './components/Rounds';

const ADDRESS = /^0x[0-9a-f]{64}$/i;
type Tab = 'history' | 'rounds' | 'board' | 'how';

export function App() {
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const demoConnected = Boolean(account && wallet?.name === DEMO_WALLET_NAME);
  const dAppKit = useDAppKit();
  const [status, setStatus] = useState<Status | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketsLoaded, setMarketsLoaded] = useState(false);
  const [samples, setSamples] = useState<PriceSample[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [marketId, setMarketId] = useState('');
  const [side, setSide] = useState<Side>('up');
  const [amount, setAmount] = useState('2');
  const [strike, setStrike] = useState('');
  const [preview, setPreview] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [errorAt, setErrorAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<Tab>('history');
  const [viewInput, setViewInput] = useState(new URLSearchParams(window.location.search).get('as') ?? '');
  const [viewAddress, setViewAddress] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('as') ?? '';
    return ADDRESS.test(value) ? value.toLowerCase() : '';
  });
  const owner = account?.address ?? (viewAddress || undefined);
  const readOnly = !account && Boolean(viewAddress);

  function applyViewAddress() {
    const value = viewInput.trim();
    if (value && !ADDRESS.test(value)) {
      setError('Paste a 0x address with 64 hexadecimal characters');
      setErrorAt('viewas');
      return;
    }
    setError('');
    setErrorAt(null);
    setViewAddress(value.toLowerCase());
    setPreview(null);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('as', value.toLowerCase());
    else url.searchParams.delete('as');
    window.history.replaceState(null, '', url);
  }

  function clearViewAddress() {
    setViewInput('');
    setViewAddress('');
    setPreview(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('as');
    window.history.replaceState(null, '', url);
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const loadMarkets = () =>
      api<{ markets: Market[] }>('/markets')
        .then((x) => {
          setMarkets(x.markets);
          setMarketsLoaded(true);
          setMarketId((id) => {
            const keep = x.markets.find((m) => m.id === id && m.expiryMs > Date.now());
            if (keep) return id;
            // When the selected market closes, roll to the next one of the same cadence (5 min by default).
            const cadence = x.markets.find((m) => m.id === id)?.cadence ?? 5;
            const next = x.markets.filter((m) => m.expiryMs > Date.now() + 5_000).sort((a, b) => a.expiryMs - b.expiryMs);
            return (next.find((m) => m.cadence === cadence) ?? next[0] ?? x.markets[0])?.id ?? '';
          });
        })
        .catch((e) => setError(String(e.message ?? e)));
    const loadPrices = () => api<{ samples: PriceSample[] }>('/prices').then((x) => setSamples(x.samples)).catch(() => {});
    const loadSlow = () => {
      api<Status>('/status').then(setStatus).catch((e) => setError(String(e.message ?? e)));
      api<Round[]>('/rounds').then(setRounds).catch(() => {});
    };
    loadMarkets();
    loadPrices();
    loadSlow();
    const a = setInterval(loadMarkets, 8_000);
    const b = setInterval(loadPrices, 4_000);
    const c = setInterval(loadSlow, 15_000);
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      const x = JSON.parse(ev.data);
      if (x.type === 'rounds') setRounds(x.rounds);
    };
    return () => {
      clearInterval(a);
      clearInterval(b);
      clearInterval(c);
      es.close();
    };
  }, []);

  const market = markets.find((m) => m.id === marketId);
  // A closed market rolls to the next one of the same cadence right away; the quote for it is dropped.
  useEffect(() => {
    if (!market || market.expiryMs > now) return;
    const next = markets.filter((m) => m.cadence === market.cadence && m.expiryMs > now + 5_000).sort((a, b) => a.expiryMs - b.expiryMs)[0];
    if (next) {
      setMarketId(next.id);
      setPreview(null);
    }
  }, [now, market, markets]);
  const forward = samples.at(-1)?.forward ?? markets.find((m) => m.forward != null)?.forward ?? null;
  const mine = useMemo(() => rounds.filter((r) => r.player === owner?.toLowerCase()), [rounds, owner]);
  const settled = mine.filter((r) => r.status === 'settled');
  const youPnl = settled.reduce((n, r) => n + (r.playerLeg?.pnl ?? 0), 0);
  const ghostPnl = settled.reduce((n, r) => n + (r.ghost?.leg?.pnl ?? 0), 0);
  const memories = history?.blobIds?.length ?? mine.filter((r) => r.memoryBlobId).length;
  const suggested = side === 'up' ? market?.suggestedStrike : market?.suggestedStrikeDown;
  const forkMode = Boolean(status?.fork);
  const live = Boolean(status?.mainnetWrites || (forkMode && status?.fork?.writes));
  // One market per cadence: the selected one, else the next to close that still has a few seconds left.
  const visibleMarkets = ([1, 5] as const)
    .map(
      (c) =>
        markets.find((m) => m.cadence === c && m.id === marketId) ??
        markets.filter((m) => m.cadence === c && m.expiryMs > now + 5_000).sort((x, y) => x.expiryMs - y.expiryMs)[0],
    )
    .filter((m): m is Market => Boolean(m));
  const reset = () => setPreview(null);

  // The headline's move: the forward now against the sample nearest five minutes ago (or the oldest one we have).
  const move = useMemo(() => {
    if (samples.length < 2) return null;
    const last = samples.at(-1)!;
    const ref = [...samples].reverse().find((s) => s.at <= last.at - 300_000) ?? samples[0];
    const minutes = Math.round((last.at - ref.at) / 60_000);
    return minutes >= 1 ? { delta: last.forward - ref.forward, minutes } : null;
  }, [samples]);
  const decision = history?.decision ?? null;

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError('');
    setErrorAt(null);
    try {
      return await fn();
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setErrorAt(label);
    } finally {
      setBusy(null);
    }
  }

  const planBet = () =>
    run('plan', async () => {
      if (!owner || !market) return;
      setPreview(null);
      setPreview(
        await post<Plan>('/plan', {
          owner,
          marketId,
          side,
          amount: Number(amount),
          strike: strike ? Number(strike) : undefined,
        }),
      );
    });

  async function signAndSend(transaction: string) {
    const signed = await dAppKit.signTransaction({ transaction });
    return post<{ digest: string }>('/execute', { bytes: signed.bytes, signature: signed.signature });
  }

  const trade = () =>
    run('trade', async () => {
      if (!preview?.transaction || !live) return;
      const done = await signAndSend(preview.transaction);
      await post('/rounds', { digest: done.digest });
      setPreview(null);
    });

  const left = market ? Math.max(0, market.expiryMs - now) : 0;
  const ticker = [
    `BTC ${usd(forward)}`,
    market ? `NEXT CLOSE ${clockText(left)}` : 'WAITING FOR A MARKET',
    history ? `GHOST READ ${history.trades.length} TRADES` : 'GHOST ASLEEP',
    `WALRUS ${memories} MEMORIES`,
    `READS ${status?.rpc ?? '…'}`,
  ];

  return (
    <div className="shell">
      {demoConnected && (
        <div className="demo-signer-badge">
          Demo signer · server-held demo key · {String(status?.rpc ?? '').includes('LOCAL FORK') ? 'LOCAL FORK of Sui mainnet · no real funds' : 'real mainnet funds'}
        </div>
      )}
      <div className="ticker" aria-hidden>
        <div className="ticker-run">
          {[0, 1, 2, 3].flatMap((k) =>
            ticker.map((t, i) => (
              <span key={`${k}-${i}`}>
                {t}
                {i === 0 && move && <em className={move.delta >= 0 ? 'up' : 'down'}>{move.delta >= 0 ? ' ↑' : ' ↓'}</em>}
              </span>
            )),
          )}
        </div>
      </div>

      <header className="nav">
        <a className="brand" href="/" aria-label="Eidolon home">
          <img src="/art/v2/eidolon2-mark.webp" alt="" width={30} height={30} />
          <span>EIDOLON</span>
        </a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#trade" className="on">Trade</a>
          <a href="#ghost">Ghost</a>
          <a href="#tabs" onClick={() => setTab('history')}>History</a>
          <a href="#tabs" onClick={() => setTab('board')}>Board</a>
        </nav>
        {!account && (
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              applyViewAddress();
            }}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              aria-label="Preview any Sui address, read-only"
              className="num"
              value={viewInput}
              onChange={(e) => setViewInput(e.target.value)}
              placeholder="Paste a Sui address to meet its ghost"
              spellCheck={false}
              autoComplete="off"
            />
            <kbd>↵</kbd>
          </form>
        )}
        <span className={`mode ${live ? 'mode-live' : ''}`} title="Whether this server sends real orders">
          <i aria-hidden />
          {live ? (forkMode ? 'Fork writes' : 'Real USDC') : 'Dry-run'}
        </span>
        <ConnectButton />
      </header>

      {(status?.setup.length || status?.chainError || readOnly || (error && errorAt !== 'plan')) && (
        <div className="notices">
          {readOnly && (
            <div className="notice notice-view" role="status">
              <img className="avatar" src={avatarFor(owner!)} alt="" width={22} height={22} />
              <span>
                Viewing <b className="num">{short(owner!)}</b> · read-only, not your wallet
              </span>
              <button className="link-btn" onClick={clearViewAddress}>
                Stop viewing
              </button>
            </div>
          )}
          {status && status.setup.length > 0 && (
            <div className="notice notice-setup" role="status">
              <b>Setup required</b>
              {status.setup.map((s) => (
                <code key={s}>{s.replace('Setup required: ', '')}</code>
              ))}
              <span className="muted">Reads and dry-runs work; real orders and Walrus writes stay off.</span>
            </div>
          )}
          {status?.chainError && <div className="notice notice-error">Chain: {status.chainError}</div>}
          {error && errorAt !== 'plan' && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}

      <main className="layout" id="trade">
        <div className="main-col">
          <section className="intro" aria-labelledby="headline">
            <img className="intro-art" src="/art/v2/eidolon2-hero.webp" alt="" width={1536} height={1024} aria-hidden />
            <h1 id="headline">
              {move ? (
                <>
                  BTC is <span className={move.delta >= 0 ? 'up' : 'down'}>{move.delta >= 0 ? 'up' : 'down'} {usd(Math.abs(move.delta))}</span> in{' '}
                  {move.minutes === 1 ? 'a minute' : `${move.minutes} minutes`}.{' '}
                </>
              ) : (
                <>BTC is {forward != null ? <span className="ember">{usd(forward)}</span> : '…'}. </>
              )}
              {decision ? (
                <>
                  Your ghost bets <span className="spectral">{decision.side === 'up' ? 'it rises' : 'it falls'}</span>.
                </>
              ) : (
                <>
                  Can you beat <span className="spectral">your ghost?</span>
                </>
              )}
            </h1>
            <p className="lede">
              Call where BTC ends in 1 or 5 minutes on DeepBook Predict. Your ghost is built from your own past trades,
              kept on Walrus, and it always takes the other side.
            </p>
            <dl className="stats">
              <div>
                <dd className="num">{history ? history.trades.length : '—'}</dd>
                <dt>Your trades it read</dt>
              </div>
              <div>
                <dd className="num">{memories}</dd>
                <dt>Memories on Walrus</dt>
              </div>
              {settled.length ? (
                <div>
                  <dd className="num">
                    <span className={youPnl >= 0 ? 'up' : 'down'}>{usdc(youPnl)}</span>
                    <span className="muted"> / </span>
                    <span className="spectral">{usdc(ghostPnl)}</span>
                  </dd>
                  <dt>You / ghost, USDC</dt>
                </div>
              ) : (
                <div>
                  <dd className="num">{history ? pct(history.profile.hitRate) : '—'}</dd>
                  <dt>{history ? 'Your hit rate' : 'Hit rate, after history'}</dt>
                </div>
              )}
            </dl>
          </section>

          <section className="card chart-card" aria-labelledby="chart-title" aria-busy={busy === 'plan'}>
            <header className="chart-head">
              <div className="closes">
                {market ? <Countdown expiryMs={market.expiryMs} cadence={market.cadence} now={now} /> : <span className="ring-skel" />}
                <span>
                  <small id="chart-title">{market ? `BTC · ${market.cadence}-minute market closes in` : 'Waiting for a live market'}</small>
                  <b className="num">{market ? clockText(left) : '—'}</b>
                </span>
              </div>
              <div className="price">
                <small>BTC · Predict forward</small>
                <Flash value={forward} />
              </div>
            </header>
            <LiveChart
              samples={samples}
              now={now}
              expiryMs={market?.expiryMs ?? null}
              side={side}
              strike={preview?.strike ?? null}
              suggested={suggested ?? null}
              ghost={preview?.ghostPreview ?? null}
            />
            {busy === 'plan' && (
              <p className="pricing" role="status">
                <span className="spin" aria-hidden /> Pricing both sides on mainnet…
              </p>
            )}
            {error && errorAt === 'plan' && (
              <div className="refused" role="alert">
                <img src="/art/v2/eidolon2-ghost-cracked.webp" alt="" width={56} height={56} />
                <div>
                  <b>Predict refuses this bet</b>
                  <p>{error}</p>
                  <p className="fine">Predict only opens bets it prices between 15% and 50%. Move the strike closer to BTC now.</p>
                </div>
              </div>
            )}
            {preview && (
              <Quote
                preview={preview}
                side={side}
                amount={amount}
                history={history}
                canTrade={live && !readOnly && Boolean(account)}
                fork={forkMode}
                busy={busy}
                onTrade={trade}
              />
            )}
          </section>

          <section className="card tabs-card" id="tabs">
            <div className="tabs" role="tablist" aria-label="Details">
              {(
                [
                  ['history', 'Your history', history?.trades.length],
                  ['rounds', 'Your rounds', mine.length || undefined],
                  ['board', 'You vs ghost', undefined],
                  ['how', 'How it works', undefined],
                ] as const
              ).map(([id, label, n]) => (
                <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                  {label}
                  {n != null && <span className="count num">{n}</span>}
                </button>
              ))}
            </div>
            <div className="tab-body" role="tabpanel">
              <div hidden={tab !== 'history'}>
                <HistoryPanel
                  owner={owner}
                  marketId={marketId}
                  side={side}
                  readOnly={readOnly}
                  live={live}
                  setup={status?.setup ?? []}
                  onHistory={setHistory}
                  onBusy={setHistoryBusy}
                />
              </div>
              {tab === 'rounds' && <Rounds rounds={mine} />}
              {tab === 'board' && <Leaderboard />}
              {tab === 'how' && <HowItWorks />}
            </div>
          </section>
        </div>

        <aside className="rail">
          <section className="card bet-card" aria-labelledby="bet-title">
            <h2 id="bet-title">Place a bet</h2>
            <div className="markets" role="radiogroup" aria-label="Market">
              {!marketsLoaded && <span className="seg-skel" aria-hidden />}
              {marketsLoaded && visibleMarkets.length === 0 && <p className="fine">No Predict market is open right now. New ones open every minute.</p>}
              {visibleMarkets.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={m.id === marketId}
                  className={m.id === marketId ? 'on' : ''}
                  onClick={() => {
                    setMarketId(m.id);
                    reset();
                  }}
                >
                  <img src={`/art/v2/eidolon2-hourglass-${m.cadence}m.webp`} alt="" width={18} height={18} />
                  <span>{m.cadence} min</span>
                  <small className="num">{m.mintPaused ? 'paused' : clockText(m.expiryMs - now)}</small>
                </button>
              ))}
            </div>

            <div className="sides" role="radiogroup" aria-label="Direction">
              {(['up', 'down'] as const).map((s) => {
                const hint = s === 'up' ? market?.suggestedStrike : market?.suggestedStrikeDown;
                return (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={side === s}
                    className={`side side-${s} ${side === s ? 'on' : ''}`}
                    onClick={() => {
                      setSide(s);
                      reset();
                    }}
                  >
                    <span className="side-name">{s === 'up' ? '↑ Higher' : '↓ Lower'}</span>
                    <small className="num">{hint != null ? `ends ${s === 'up' ? 'above' : 'below'} ${usd(hint)}` : s === 'up' ? 'ends above' : 'ends below'}</small>
                  </button>
                );
              })}
            </div>

            <label className="field-label" htmlFor="amount">
              Amount
            </label>
            <div className="stepper">
              <button aria-label="Less" onClick={() => { setAmount(String(Math.max(2, Number(amount || 0) - 1))); reset(); }}>
                −
              </button>
              <span>
                <input
                  id="amount"
                  className="num"
                  type="number"
                  inputMode="decimal"
                  min="2"
                  step="0.5"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    reset();
                  }}
                />
                <i>USDC</i>
              </span>
              <button aria-label="More" onClick={() => { setAmount(String(Number(amount || 0) + 1)); reset(); }}>
                +
              </button>
            </div>
            <div className="chips-row">
              {['2', '5', '10', '25'].map((v) => (
                <button key={v} className={amount === v ? 'on' : ''} onClick={() => { setAmount(v); reset(); }}>
                  {v}
                </button>
              ))}
            </div>

            <details className="strike">
              <summary>
                Strike <span className="num">{strike ? usd(Number(strike)) : suggested != null ? `${usd(suggested)} suggested` : 'live suggestion'}</span>
              </summary>
              <span className="input-unit">
                <input
                  className="num"
                  type="number"
                  inputMode="decimal"
                  aria-label="Custom strike in USD"
                  placeholder={suggested ? String(suggested) : 'live strike'}
                  value={strike}
                  onChange={(e) => {
                    setStrike(e.target.value);
                    reset();
                  }}
                />
                <i>USD</i>
              </span>
              <p className="fine">Leave it empty to use the strike Predict’s pricer suggests.</p>
            </details>

            <button className="primary big" disabled={!owner || !market || busy !== null} onClick={planBet}>
              {busy === 'plan' ? (
                <>
                  <span className="spin" aria-hidden /> Quoting on mainnet…
                </>
              ) : owner ? (
                'Quote and dry-run'
              ) : (
                'Connect, or paste an address above'
              )}
            </button>
            <p className="fine center">Min 2 USDC · Predict fee 0.02 USDC · rounds to whole lots</p>
          </section>

          <GhostPanel status={status} round={mine.at(-1)} history={history} historyBusy={historyBusy} side={side} preview={preview} />

          <Funding live={live && !readOnly && Boolean(account)} fork={forkMode} owner={owner} signAndSend={signAndSend} />
        </aside>
      </main>

      <footer className="foot">
        <img src="/art/v2/eidolon2-mark.webp" alt="" width={22} height={22} />
        <p>
          Markets and settlement: DeepBook Predict, settled at the Pyth price at expiry. Memory: Walrus Memory mainnet.
          Chain reads: {status?.rpc ?? 'loading'}. Every number comes from the chain or from recalled memories. Art generated with ChatGPT.
        </p>
      </footer>
    </div>
  );
}

/** The price, flashing green or pink for a moment whenever a new sample moves it. */
function Flash({ value }: { value: number | null }) {
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (value == null || prev == null || value === prev) {
      setPrev(value);
      return;
    }
    setDir(value > prev ? 'up' : 'down');
    setPrev(value);
    const t = setTimeout(() => setDir(''), 900);
    return () => clearTimeout(t);
  }, [value]);
  return <b className={`num flash ${dir ? `flash-${dir}` : ''}`}>{usd(value, 2)}</b>;
}

const STEPS = [
  { art: 'memory-vault', title: 'It reads your trades', text: 'Your settled Predict trades on Sui mainnet give the ghost your habits: how often you bet UP, how often you win, how much you stake.' },
  { art: 'coin-ghost', title: 'It takes the other side', text: 'Quote a bet and the ghost places the opposite one at the nearest strike Predict will price.' },
  { art: 'hourglass-1m', title: 'Pyth settles both', text: 'At expiry both bets settle. Between the two strikes sits a dead zone where both lose.' },
  { art: 'memory-shards', title: 'Every round is remembered', text: 'Each settled round is written to Walrus mainnet and recalled the next time you play.' },
] as const;

function HowItWorks() {
  return (
    <>
    <div className="how-banner">
      <img src="/art/v2/eidolon2-duel.webp" alt="" width={1536} height={1024} loading="lazy" />
      <p>One market. Two bets on opposite sides. Pyth settles both.</p>
    </div>
    <ol className="how">
      {STEPS.map((s, i) => (
        <li key={s.art}>
          <img className="float" src={`/art/v2/eidolon2-${s.art}.webp`} alt="" width={88} height={88} loading="lazy" style={{ animationDelay: `${i * 0.6}s` }} />
          <span className="num">0{i + 1}</span>
          <b>{s.title}</b>
          <p>{s.text}</p>
        </li>
      ))}
    </ol>
    </>
  );
}

function Funding({
  live,
  fork,
  owner,
  signAndSend,
}: {
  live: boolean;
  fork: boolean;
  owner: string | undefined;
  signAndSend: (tx: string) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState('10');
  const [create, setCreate] = useState(true);
  const [plan, setPlan] = useState<FundingPlan | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = plan?.dryRun.status === 'success';
  return (
    <details className="card funding">
      <summary>
        <img src="/art/v2/eidolon2-memory-vault.webp" alt="" width={32} height={32} />
        <span>
          <b>Fund your Predict account</b>
          <small>Predict trades from a USDC balance in its own account</small>
        </span>
      </summary>
      <div className="stepper stepper-sm">
        <span>
          <input className="num" type="number" min="1" step="1" aria-label="Deposit in USDC" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <i>USDC</i>
        </span>
      </div>
      <label className="check">
        <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
        <span>Create the account in the same transaction</span>
      </label>
      <button
        disabled={!owner || busy}
        onClick={() => {
          setBusy(true);
          setMsg('');
          post<FundingPlan>('/fund', { owner, amount: Number(amount), create })
            .then(setPlan)
            .catch((e) => setMsg(String(e.message ?? e)))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? (
          <>
            <span className="spin" aria-hidden /> Dry-running…
          </>
        ) : (
          'Dry-run the deposit'
        )}
      </button>
      {plan && (
        <p className={`dry ${ok ? 'dry-ok' : 'dry-fail'}`}>
          <i aria-hidden />
          Dry-run {plan.dryRun.status} via {plan.rpc}
          {plan.dryRun.error ? `: ${humanError(plan.dryRun.error)}` : ''}
        </p>
      )}
      {plan?.transaction && live && (
        <button className="primary" onClick={() => signAndSend(plan.transaction!).then(() => setPlan(null))}>
          {fork ? 'Sign and deposit (local fork, no real funds)' : 'Sign and deposit real USDC'}
        </button>
      )}
      {msg && <p className="notice notice-error">{msg}</p>}
    </details>
  );
}
