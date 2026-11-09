import { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import { DEMO_WALLET_NAME } from './demoWallet';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { api, post, short, usd, usdc, type FundingPlan, type Market, type Plan, type Round, type Side, type Status, humanError, type HistoryResponse } from './api';
import { Countdown } from './components/Countdown';
import { GhostPanel } from './components/GhostPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { Leaderboard, Rounds } from './components/Rounds';
import { Stage } from './components/Stage';

export function App() {
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const demoConnected = Boolean(account && wallet?.name === DEMO_WALLET_NAME);
  const dAppKit = useDAppKit();
  const [status, setStatus] = useState<Status | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketsLoaded, setMarketsLoaded] = useState(false);
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
  const [viewInput, setViewInput] = useState(new URLSearchParams(window.location.search).get('as') ?? '');
  const [viewAddress, setViewAddress] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('as') ?? '';
    return /^0x[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : '';
  });
  const owner = account?.address ?? (viewAddress || undefined);
  const readOnly = !account && Boolean(viewAddress);

  function applyViewAddress() {
    const value = viewInput.trim();
    if (value && !/^0x[0-9a-f]{64}$/i.test(value)) {
      setError('Enter a 0x address with 64 hexadecimal characters');
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
    const load = () => {
      api<Status>('/status').then(setStatus).catch((e) => setError(String(e.message ?? e)));
      api<{ markets: Market[] }>('/markets')
        .then((x) => {
          setMarkets(x.markets);
          setMarketsLoaded(true);
          setMarketId((id) => (x.markets.some((m) => m.id === id) ? id : (x.markets[0]?.id ?? '')));
        })
        .catch((e) => setError(String(e.message ?? e)));
      api<Round[]>('/rounds').then(setRounds).catch(() => {});
    };
    load();
    const t = setInterval(load, 15_000);
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      const x = JSON.parse(ev.data);
      if (x.type === 'rounds') setRounds(x.rounds);
    };
    return () => {
      clearInterval(t);
      es.close();
    };
  }, []);

  const market = markets.find((m) => m.id === marketId);
  const forward = markets.find((m) => m.forward != null)?.forward ?? null;
  const mine = useMemo(
    () => rounds.filter((r) => r.player === owner?.toLowerCase()),
    [rounds, owner],
  );
  const settled = mine.filter((r) => r.status === 'settled');
  const youPnl = settled.reduce((n, r) => n + (r.playerLeg?.pnl ?? 0), 0);
  const ghostPnl = settled.reduce((n, r) => n + (r.ghost?.leg?.pnl ?? 0), 0);
  const memories = mine.filter((r) => r.memoryBlobId).length;
  const suggested = side === 'up' ? market?.suggestedStrike : market?.suggestedStrikeDown;

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
      if (!preview?.transaction || !status?.mainnetWrites) return;
      const done = await signAndSend(preview.transaction);
      await post('/rounds', { digest: done.digest });
      setPreview(null);
    });

  const live = status?.mainnetWrites ?? false;
  const visibleMarkets = markets.filter((m) => m.expiryMs > now || m.id === marketId);
  const reset = () => setPreview(null);

  return (
    <div className="shell">
      {demoConnected && <div className="demo-signer-badge">Demo signer · server-held demo key · {String(status?.rpc ?? '').includes('LOCAL FORK') ? 'LOCAL FORK of Sui mainnet · no real funds' : 'real mainnet funds'}</div>}
      <header className="top">
        <a className="brand" href="/" aria-label="Eidolon home">
          <img className="brand-mark" src="/art/eidolon-mark.webp" alt="" width={32} height={32} />
          <span className="brand-word">Eidolon</span>
          <em lang="grc">εἴδωλον</em>
        </a>
        <nav className="top-nav" aria-label="Sections">
          <a href="#arena-title">Arena</a>
          <a href="#ghost-title">Ghost</a>
          <a href="#history-title">History</a>
          <a href="#board-title">Board</a>
        </nav>
        <div className="top-right">
          <span className={`mode ${live ? 'mode-live' : ''}`}>
            <i aria-hidden />
            {live ? 'Real USDC' : 'Dry-run only'}
          </span>
          <ConnectButton />
        </div>
      </header>

      <section className="stats" aria-label="Live numbers">
        <Stat label="BTC · Predict forward" value={usd(forward)} unit="USD" lead />
        <Stat label="Your P&L" value={usdc(settled.length ? youPnl : null)} unit="USDC" tone="ember" />
        <Stat label="Ghost P&L" value={usdc(settled.length ? ghostPnl : null)} unit="USDC" tone="spectral" />
        <Stat label="Memories on Walrus" value={String(memories)} />
        <Stat label="Chain reads" value={status?.rpc ?? 'Loading…'} warn={status != null && status.rpc !== 'Tatum'} />
      </section>

      <section className="hero" aria-labelledby="hero-title">
        <HeroMedia />
        <span className="hero-fog" aria-hidden />
        <span className="hero-rain" aria-hidden />
        <span className="hero-flash" aria-hidden />
        <div className="hero-copy">
          <p className="eyebrow">DeepBook Predict · BTC 1 and 5 minute markets · Sui mainnet</p>
          <h1 id="hero-title">
            Trade against <span className="spectral">your past self.</span>
          </h1>
          <p className="hero-sub">
            Your ghost is built from your own settled trades and always takes the other side. Beat it, or see
            what your habits cost you.
          </p>
          <div className="hero-legend" aria-hidden>
            <span className="lg-you">You</span>
            <span className="lg-line" />
            <span className="lg-ghost">Your ghost</span>
          </div>
        </div>
      </section>

      {(status?.setup.length || status?.chainError || readOnly || (error && errorAt !== 'plan')) && (
        <div className="notices">
          {status && status.setup.length > 0 && (
            <div className="setup" role="status">
              <b>Setup required</b>
              <span className="keys">
                {status.setup.map((s) => (
                  <code key={s}>{s.replace('Setup required: ', '')}</code>
                ))}
              </span>
              <span className="setup-note">Reads and dry-runs work; real orders and Walrus writes stay off.</span>
            </div>
          )}
          {readOnly && (
            <div className="viewing" role="status">
              <span className="viewing-dot" aria-hidden />
              <span className="viewing-text">
                Viewing as <b className="num">{short(owner!)}</b> <span className="muted">(read-only, not your wallet)</span>
              </span>
              <button className="ghost-btn" onClick={clearViewAddress}>
                Stop viewing
              </button>
            </div>
          )}
          {status?.chainError && <div className="alert">Chain: {status.chainError}</div>}
          {error && errorAt !== 'plan' && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
        </div>
      )}

      <main className="arena-grid">
        <aside className="panel you-col" aria-labelledby="arena-title">
          <header className="panel-head stack with-bust">
            <img className="bust bust-you" src="/art/eidolon-trader-bust.webp" alt="" width={48} height={48} />
            <div>
              <p className="eyebrow ember">You · the arena</p>
              <h2 id="arena-title">Place your bet</h2>
            </div>
          </header>

          {!account && (
            <div className="viewas">
              <label htmlFor="viewas-input">Preview any Sui address (read-only)</label>
              <div className="viewas-row">
                <input
                  id="viewas-input"
                  className="num"
                  value={viewInput}
                  onChange={(e) => setViewInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyViewAddress()}
                  placeholder="0x… address with Predict history"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button onClick={applyViewAddress}>Preview</button>
              </div>
            </div>
          )}

          <div className="block">
            <p className="block-label">
              Market <span className="muted">live on Sui mainnet</span>
            </p>
            <div className="markets" role="radiogroup" aria-label="Market">
              {!marketsLoaded && (
                <>
                  <span className="market-skel" aria-hidden />
                  <span className="market-skel" aria-hidden />
                  <span className="sr-only">Loading live markets…</span>
                </>
              )}
              {marketsLoaded && visibleMarkets.length === 0 && (
                <p className="muted small">No active Predict market right now. New ones open every minute.</p>
              )}
              {visibleMarkets.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={m.id === marketId}
                  className={`market ${m.id === marketId ? 'on' : ''}`}
                  onClick={() => {
                    setMarketId(m.id);
                    reset();
                  }}
                >
                  <Countdown expiryMs={m.expiryMs} cadence={m.cadence} now={now} />
                  <span className="market-text">
                    <b>BTC · {m.cadence} min</b>
                    <small className="num">
                      ends {new Date(m.expiryMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      {m.mintPaused ? ' · paused' : ''}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="slip block">
            <p className="block-label">Your bet</p>
            <div className="sides" role="radiogroup" aria-label="Direction">
              {(['up', 'down'] as const).map((s) => (
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
                  <img className="sigil" src={`/art/eidolon-${s}-sigil.webp`} alt="" width={26} height={26} />
                  <span className="side-text">
                    {s === 'up' ? 'Ends above' : 'Ends below'}
                    <small>{s === 'up' ? 'UP' : 'DOWN'}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="fields">
              <label>
                <span>Strike</span>
                <span className="input-unit">
                  <input
                    className="num"
                    type="number"
                    inputMode="decimal"
                    placeholder={suggested ? String(suggested) : 'live strike'}
                    value={strike}
                    onChange={(e) => {
                      setStrike(e.target.value);
                      reset();
                    }}
                  />
                  <i>USD</i>
                </span>
              </label>
              <label>
                <span>Spend</span>
                <span className="input-unit">
                  <input
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
              </label>
            </div>
            <p className="fine strike-hint">
              {suggested != null ? (
                <>
                  Predict’s pricer suggests <b className="num">{usd(suggested)}</b> for {side === 'up' ? 'above' : 'below'}. Leave the strike empty to use it.
                </>
              ) : (
                'Leave the strike empty to use the live suggested strike.'
              )}
            </p>
            <button className="primary" disabled={!owner || !market || busy !== null} onClick={planBet}>
              {busy === 'plan' ? (
                <>
                  <span className="spin" aria-hidden /> Quoting on mainnet…
                </>
              ) : owner ? (
                'Quote and dry-run'
              ) : (
                'Connect a Sui wallet or view an address'
              )}
            </button>
            <p className="fine">Minimum 2 USDC. Predict takes a 0.02 USDC fee and rounds to whole lots.</p>
          </div>

          <Funding live={live && !readOnly && Boolean(account)} owner={owner} signAndSend={signAndSend} />
        </aside>

        <Stage
          market={market}
          forward={forward}
          now={now}
          side={side}
          amount={amount}
          suggested={suggested ?? null}
          preview={preview}
          refusal={error && errorAt === 'plan' ? error : null}
          busy={busy}
          canTrade={live && !readOnly && Boolean(account)}
          onTrade={trade}
          history={history}
        />

        <GhostPanel status={status} round={mine.at(-1)} history={history} historyBusy={historyBusy} side={side} preview={preview} />
      </main>

      <div className="divider" aria-hidden />

      <section className="lower">
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
        <div className="lower-side">
          <Rounds rounds={mine} />
          <Leaderboard />
        </div>
      </section>

      <HowItWorks />

      <footer className="foot">
        <img src="/art/eidolon-mark.webp" alt="" width={24} height={24} />
        <p>
          Markets and settlement: DeepBook Predict (Pyth price at expiry). Memory: Walrus Memory on mainnet.
          Chain reads: {status?.rpc ?? 'loading'}. Every number here comes from chain or from your own recalled memories.
        </p>
      </footer>
    </div>
  );
}

/** Hero background: a looping clip over its poster. The poster alone carries the design (missing clip, reduced motion). */
function HeroMedia() {
  const [still] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  return still ? (
    <img className="hero-art" src="/art/eidolon-hero.webp" alt="" width={1536} height={1024} fetchPriority="high" />
  ) : (
    <video
      className="hero-art"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster="/art/eidolon-hero.webp"
      src="/art/eidolon-hero-loop.mp4"
      aria-hidden
    />
  );
}

const STEPS = [
  {
    art: 'film-bg-2',
    title: 'Your ghost reads your trades',
    text: 'Settled Predict trades from Sui mainnet give it your habits: how often you bet UP, how often you win, how much you stake.',
  },
  {
    art: 'price-duel',
    title: 'It always takes the other side',
    text: 'Quote a bet and the ghost places the opposite one at the nearest strike Predict will price.',
  },
  {
    art: 'dead-zone',
    title: 'Pyth settles both at expiry',
    text: 'Between the two strikes is a dead zone where both bets lose. The board counts only payouts proven on chain.',
  },
  {
    art: 'film-bg-3',
    title: 'Every round becomes a memory',
    text: 'With Walrus Memory set up, each settled round is written to Walrus mainnet and recalled the next time you play.',
  },
] as const;

function HowItWorks() {
  return (
    <section className="how" aria-labelledby="how-title">
      <img className="how-bg" src="/art/eidolon-social-1.webp" alt="" loading="lazy" aria-hidden />
      <header className="how-head">
        <p className="eyebrow">How a round works</p>
        <h2 id="how-title">One market, two bets, one settlement</h2>
      </header>
      <ol className="how-steps">
        {STEPS.map((step, i) => (
          <li key={step.art}>
            <span className="how-art">
              <img src={`/art/eidolon-${step.art}.webp`} alt="" loading="lazy" width={1536} height={1024} />
            </span>
            <span className="how-n num">0{i + 1}</span>
            <b>{step.title}</b>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stat({ label, value, unit, tone, warn, lead }: { label: string; value: string; unit?: string; tone?: 'ember' | 'spectral'; warn?: boolean; lead?: boolean }) {
  return (
    <div className={`stat ${tone ?? ''} ${warn ? 'warn' : ''} ${lead ? 'lead' : ''}`}>
      <span>
        {label}
        {unit && <i> ({unit})</i>}
      </span>
      <b className={lead ? 'fig' : 'num'}>{value}</b>
    </div>
  );
}

function Funding({
  live,
  owner,
  signAndSend,
}: {
  live: boolean;
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
    <details className="funding">
      <summary>
        <span>Fund your Predict account</span>
      </summary>
      <div className="funding-intro">
        <img className="float" src="/art/eidolon-vault.webp" alt="" width={64} height={64} />
        <p className="muted small">
          Predict trades from a USDC balance inside its own account. Creating it and the first deposit can be one
          signed transaction.
        </p>
      </div>
      <div className="fields">
        <label>
          <span>Deposit</span>
          <span className="input-unit">
            <input className="num" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <i>USDC</i>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
          <span>Create the account in the same transaction</span>
        </label>
      </div>
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
          <span>
            Dry-run {plan.dryRun.status} via {plan.rpc}
            {plan.dryRun.error ? `: ${humanError(plan.dryRun.error)}` : ''}
          </span>
        </p>
      )}
      {plan?.transaction && live && (
        <button className="primary ember" onClick={() => signAndSend(plan.transaction!).then(() => setPlan(null))}>
          Sign and deposit real USDC
        </button>
      )}
      {msg && <p className="alert">{msg}</p>}
    </details>
  );
}
