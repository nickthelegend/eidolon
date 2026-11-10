import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ago, api, clockText, hm, humanError, learn, pct, post, short, usd, usdc, type FundingPlan, type GhostFeed, type GhostTrade, type HistoricalTrade, type HistoryResponse, type Market, type Plan, type PriceSample, type Round, type Side, type Status } from './api';
import Chart, { type StrikeLine } from './Chart';
import { Blob, Btc, Icon, SidePill, State, Tx, go, setTab, sideWord, useMedia, type Tab } from './ui';

export const PREDICT_MIN_USDC = 2;
const other = (s: Side): Side => (s === 'up' ? 'down' : 'up');

export type TerminalProps = {
  owner: string | undefined;
  account: boolean;
  readOnly: boolean;
  markets: Market[];
  marketsLoaded: boolean;
  samples: PriceSample[];
  now: number;
  live: boolean;
  fork: boolean;
  history: HistoryResponse | null;
  historyBusy: boolean;
  historyError: string;
  feed: GhostFeed | null;
  setFeed: (f: GhostFeed) => void;
  rounds: Round[];
  status: Status | null;
  signAndSend: (tx: string) => Promise<{ digest: string }>;
  reload: () => Promise<void>;
  tab: Tab;
  onViewAs: (address: string) => string;
  /** LOCAL FORK only: the public trader whose real Walrus memories stand in for the fork-only wallet. */
  seat?: string | null;
};

/** Predict stops taking orders shortly before a market closes, so a market needs this much time left to be offered. */
export const MIN_TIME_LEFT_MS = 45_000;
/** The next market to close for a cadence that still takes orders. */
export function nextMarket(markets: Market[], cadence: 1 | 5, now: number) {
  return markets.filter((m) => m.cadence === cadence && m.expiryMs > now + MIN_TIME_LEFT_MS).sort((x, y) => x.expiryMs - y.expiryMs)[0];
}

/** How far BTC moved over about the last five minutes of samples. */
export function useMove(samples: PriceSample[]) {
  return useMemo(() => {
    if (samples.length < 2) return null;
    const last = samples.at(-1)!;
    const ref = [...samples].reverse().find((s) => s.at <= last.at - 300_000) ?? samples[0];
    const minutes = Math.round((last.at - ref.at) / 60_000);
    return minutes >= 1 ? { delta: last.forward - ref.forward, minutes } : null;
  }, [samples]);
}

/* ================================================================ page */
export default function Terminal(p: TerminalProps) {
  const wide = useMedia('(min-width: 1200px)');
  const [marketId, setMarketId] = useState('');
  const [side, setSide] = useState<Side>('up');
  const [amount, setAmount] = useState('2');
  const [strike, setStrike] = useState('');
  const [preview, setPreview] = useState<Plan | null>(null);

  const market = p.markets.find((m) => m.id === marketId && m.expiryMs > p.now + MIN_TIME_LEFT_MS) ?? nextMarket(p.markets, p.markets.find((m) => m.id === marketId)?.cadence ?? 5, p.now) ?? nextMarket(p.markets, 1, p.now);
  useEffect(() => {
    if (market && market.id !== marketId) {
      setMarketId(market.id);
      setPreview(null);
    }
  }, [market?.id]);
  const options = ([1, 5] as const).map((c) => (market?.cadence === c ? market : nextMarket(p.markets, c, p.now))).filter((m): m is Market => Boolean(m));
  const forward = p.samples.at(-1)?.forward ?? market?.forward ?? null;
  const beat = (s: Side) => (s === 'up' ? market?.suggestedStrike : market?.suggestedStrikeDown) ?? null;
  const youStrike = preview?.strike ?? (strike ? Number(strike) : null);
  const lines: StrikeLine[] = [];
  if (youStrike != null) lines.push({ value: youStrike, who: 'you', side });
  else if (beat(side) != null) lines.push({ value: beat(side)!, who: 'beat', side });
  if (preview?.ghostPreview) lines.push({ value: preview.ghostPreview.strike, who: 'ghost', side: preview.ghostPreview.side });
  const reset = () => setPreview(null);

  const chart = <ChartPanel market={market} samples={p.samples} lines={lines} preview={preview} side={side} />;
  const ghost = <GhostPanel {...p} side={side} market={market} preview={preview} />;

  if (!p.owner)
    return (
      <main className="term term-empty" id="main">
        <MarketBar market={market} options={options} forward={forward} samples={p.samples} now={p.now} marketsLoaded={p.marketsLoaded} side={side} onPick={(id) => { setMarketId(id); reset(); }} />
        <MeetCard onViewAs={p.onViewAs} />
      </main>
    );

  return (
    <main className={`term ${wide ? 'term-wide' : ''}`} id="main">
      <MarketBar market={market} options={options} forward={forward} samples={p.samples} now={p.now} marketsLoaded={p.marketsLoaded} side={side} onPick={(id) => { setMarketId(id); reset(); }} />
      {chart}
      {ghost}
      <OrderPanel {...p} market={market} side={side} setSide={(s) => { setSide(s); reset(); }} amount={amount} setAmount={(a) => { setAmount(a); reset(); }} strike={strike} setStrike={(s) => { setStrike(s); reset(); }} preview={preview} setPreview={setPreview} beat={beat} />
      <Bottom {...p} />
    </main>
  );
}

/* ================================================================ onboarding inside the app */
export const SAMPLE = '0x7c9250467b7d7cc0aa2a9e76d06e9e8af313afa22285f1a3c314d749617b486e';
export function MeetForm({ onViewAs, big = false }: { onViewAs: (a: string) => string; big?: boolean }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  return (
    <form
      className={`meet ${big ? 'meet-big' : ''}`}
      data-film="meet-form"
      onSubmit={(e) => {
        e.preventDefault();
        const e2 = onViewAs(value.trim() || SAMPLE);
        setErr(e2);
        if (!e2) go('/trade');
      }}
    >
      <label className="meet-in">
        <span className="sr">Sui address</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste a Sui address, or leave empty" spellCheck={false} autoComplete="off" />
      </label>
      <button className="btn btn-primary btn-lg" data-film="meet-ghost">
        Meet the ghost <Icon name="arrow" size={17} />
      </button>
      <p className={`meet-note ${err ? 'meet-err' : ''}`} role={err ? 'alert' : undefined}>
        {err || 'Empty? You meet the ghost of a real public trader on Sui mainnet. Read-only, nothing is signed.'}
      </p>
    </form>
  );
}
function MeetCard({ onViewAs }: { onViewAs: (a: string) => string }) {
  return (
    <section className="pnl meet-card">
      <img src="/art/v2/eidolon2-ghost-idle.webp" alt="" width={120} height={120} aria-hidden />
      <h1>Whose ghost do you want to meet?</h1>
      <p>Eidolon reads a trader’s settled BTC bets from Sui and builds a ghost that bets against them.</p>
      <MeetForm onViewAs={onViewAs} />
    </section>
  );
}

/* ================================================================ market bar (dark) */
function MarketBar({ market, options, forward, samples, now, marketsLoaded, side, onPick }: { market: Market | undefined; options: Market[]; forward: number | null; samples: PriceSample[]; now: number; marketsLoaded: boolean; side: Side; onPick: (id: string) => void }) {
  const move = useMove(samples);
  const left = market ? Math.max(0, market.expiryMs - now) : 0;
  const beat = side === 'up' ? market?.suggestedStrike : market?.suggestedStrikeDown;
  return (
    <section className="mbar dark" aria-label="Market" data-film="market-bar">
      <div className="mb-pair">
        <Btc size={34} />
        <div>
          <b>Bitcoin Up or Down</b>
          <small>{market ? `${market.cadence}-minute market · closes ${hm(market.expiryMs).slice(0, 5)}` : 'DeepBook Predict · Sui mainnet'}</small>
        </div>
      </div>
      <div className="mb-cell mb-beat">
        <span>Price to beat <small>({sideWord(side)} {side === 'up' ? 'above' : 'below'})</small></span>
        <b className="num">{beat != null ? usd(beat) : '…'}</b>
      </div>
      <div className={`mb-cell mb-now ${move ? (move.delta >= 0 ? 'up' : 'down') : ''}`}>
        <span>Current price</span>
        <b className="num">
          {usd(forward, 2)}
          {move && <small> {move.delta >= 0 ? '▲' : '▼'} {usd(Math.abs(move.delta))} / {move.minutes}m</small>}
        </b>
      </div>
      <div className={`mb-cell mb-clock ${left < 15_000 ? 'late' : ''}`} aria-label={`${Math.floor(left / 1000)} seconds to close`}>
        <span>Closes in</span>
        <b className="num" data-film="countdown">{market ? (market.mintPaused ? 'paused' : clockText(left)) : '—'}</b>
      </div>
      <div className="mb-mkts" role="radiogroup" aria-label="Market length">
        {!marketsLoaded && <span className="dim small">Loading markets…</span>}
        {marketsLoaded && !options.length && <span className="dim small">No Predict market open right now</span>}
        {options.map((m) => (
          <button key={m.id} role="radio" aria-checked={m.id === market?.id} className={m.id === market?.id ? 'on' : ''} onClick={() => onPick(m.id)}>
            {m.cadence} min
          </button>
        ))}
      </div>
    </section>
  );
}

/* ================================================================ chart */
function ChartPanel({ market, samples, lines, preview, side }: { market: Market | undefined; samples: PriceSample[]; lines: StrikeLine[]; preview: Plan | null; side: Side }) {
  const g = preview?.ghostPreview;
  return (
    <section className="pnl chartp" aria-label="BTC price chart" data-film="chart">
      <header className="pnl-tabs">
        <span className="pnl-tab on">BTC / USD</span>
        <span className="legend">
          <i className="lg lg-price" />
          Live price
          {lines.some((l) => l.who === 'beat') && (
            <>
              <i className="lg lg-beat" />
              Price to beat
            </>
          )}
          {lines.some((l) => l.who === 'you') && (
            <>
              <i className="lg lg-you" />
              You
            </>
          )}
          {g && (
            <>
              <i className="lg lg-ghost" />
              Ghost
            </>
          )}
        </span>
      </header>
      <div className="chart-box">
        <Chart samples={samples} expiryMs={market?.expiryMs ?? null} lines={lines} />
      </div>
      <p className="chart-foot mono">
        {g && preview?.strike != null && !g.exact
          ? `Dead zone ${usd(Math.min(preview.strike, g.strike))}–${usd(Math.max(preview.strike, g.strike))}: if BTC closes there, you and the ghost both lose. Predict only admits strikes priced 15–50%, so the ghost can’t always stand exactly opposite you.`
          : `DeepBook Predict BTC forward, sampled every 4 s · settles at the Pyth price at ${market ? hm(market.expiryMs) : 'expiry'} · ${sideWord(side)} wins ${side === 'up' ? 'above' : 'below'} the line`}
      </p>
    </section>
  );
}

/* ================================================================ order panel (Up / Down) */
function OrderPanel(
  p: TerminalProps & {
    market: Market | undefined;
    side: Side;
    setSide: (s: Side) => void;
    amount: string;
    setAmount: (a: string) => void;
    strike: string;
    setStrike: (s: string) => void;
    preview: Plan | null;
    setPreview: (x: Plan | null) => void;
    beat: (s: Side) => number | null;
  },
) {
  const { market, side, preview } = p;
  const [busy, setBusy] = useState<'plan' | 'trade' | null>(null);
  const [error, setError] = useState('');
  const canTrade = p.live && !p.readOnly && p.account;
  const dryOk = preview?.dryRun?.status.status === 'success';
  useEffect(() => setError(''), [side, p.amount, p.strike, market?.id]);

  async function quote() {
    if (!market || !p.owner) return;
    setBusy('plan');
    setError('');
    p.setPreview(null);
    try {
      p.setPreview(await post<Plan>('/plan', { owner: p.owner, marketId: market.id, side, amount: Number(p.amount), strike: p.strike ? Number(p.strike) : undefined }));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }
  async function trade() {
    if (!preview?.transaction || !p.live) return;
    setBusy('trade');
    setError('');
    try {
      const done = await p.signAndSend(preview.transaction);
      await post('/rounds', { digest: done.digest });
      p.setPreview(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }
  const odds = (s: Side) => (preview && s === side && preview.ghostPreview ? pct(preview.ghostPreview.playerProbability) : null);
  const n = Number(p.amount || 0);

  return (
    <aside className="pnl form" aria-label="Place a bet" data-film="order-panel">
      <div className="form-head">
        <Btc size={36} />
        <div>
          <b>Bitcoin Up or Down · {market ? `${market.cadence} min` : '—'}</b>
          <small>Up wins above {usd(p.beat('up'))} · Down wins below {usd(p.beat('down'))}</small>
        </div>
      </div>
      <div className="form-body">
        <div className="updown" role="radiogroup" aria-label="Your call">
          {(['up', 'down'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={side === s} className={`ud ud-${s} ${side === s ? 'on' : ''}`} onClick={() => p.setSide(s)} data-film={`call-${s}`}>
              <span>
                <Icon name={s} size={16} />
                {sideWord(s)}
              </span>
              <small className="num">{odds(s) ? `${odds(s)} odds` : `${s === 'up' ? 'above' : 'below'} ${usd(p.beat(s))}`}</small>
            </button>
          ))}
        </div>
        <label className="fld">
          <span>Amount</span>
          <div className="fld-in">
            <button type="button" className="step" aria-label="0.5 USDC less" onClick={() => p.setAmount(String(Math.max(PREDICT_MIN_USDC, n - 0.5)))}>−</button>
            <input inputMode="decimal" type="number" min={PREDICT_MIN_USDC} step="0.5" value={p.amount} onChange={(e) => p.setAmount(e.target.value)} aria-label="Amount in USDC" />
            <em>USDC</em>
            <button type="button" className="step" aria-label="0.5 USDC more" onClick={() => p.setAmount(String(n + 0.5))}>+</button>
          </div>
          <div className="chips">
            {[2, 5, 10].map((v) => (
              <button key={v} type="button" className={n === v ? 'on' : ''} onClick={() => p.setAmount(String(v))}>
                {v} USDC
              </button>
            ))}
          </div>
          {n > 0 && n < PREDICT_MIN_USDC && <small className="warn">Predict’s minimum order is 2 USDC.</small>}
        </label>
        <details className="strike-fld">
          <summary>
            <span>Strike</span>
            <b className="num">{p.strike ? usd(Number(p.strike)) : `${side === 'up' ? 'above' : 'below'} ${usd(p.beat(side))}`}</b>
          </summary>
          <div className="fld-in">
            <input inputMode="decimal" type="number" value={p.strike} placeholder={String(p.beat(side) ?? '')} onChange={(e) => p.setStrike(e.target.value)} aria-label="Custom strike in USD" />
            <em>USD</em>
          </div>
          <small className="dim">Predict only opens bets it prices between 15% and 50%.</small>
        </details>
        <dl className="summ">
          <div>
            <dt>Payout if right</dt>
            <dd className="num" data-film="payout">{preview ? `${preview.quote.potentialPayout.toFixed(2)} USDC` : '—'}</dd>
          </div>
          <div>
            <dt>You pay</dt>
            <dd className="num">{preview ? `${preview.quote.totalDebit.toFixed(2)} USDC · fee ${preview.quote.orderFee.toFixed(2)}` : '—'}</dd>
          </div>
        </dl>
        {preview && dryOk && canTrade ? (
          <button className="btn btn-primary btn-block btn-lg" disabled={busy !== null} onClick={trade} data-film="sign">
            {busy === 'trade' ? 'Signing…' : p.fork ? 'Sign it (local fork)' : `Sign and place ${sideWord(side)}`}
          </button>
        ) : (
          <button className="btn btn-primary btn-block btn-lg" disabled={!market || busy !== null} onClick={quote} data-film="call-it">
            {busy === 'plan' ? (
              <>
                <i className="spin" aria-hidden /> {p.fork ? 'Pricing on the fork…' : 'Pricing on mainnet…'}
              </>
            ) : (
              `Call it: ${sideWord(side)}`
            )}
          </button>
        )}
        {preview && (
          <p className={`dry ${dryOk ? 'dry-ok' : preview.dryRun ? 'dry-fail' : ''}`} data-film="dry-run">
            <i aria-hidden />
            <span>
              {preview.accepting ? '' : `Predict refuses: ${humanError(preview.refusal ?? '')}. `}
              Dry-run {preview.dryRun ? `${preview.dryRun.status.status} via ${preview.dryRun.rpc}${preview.dryRun.status.error ? `: ${humanError(preview.dryRun.status.error)}` : ''}` : 'not available: fund your Predict account first'}
              {dryOk && !canTrade ? '. Real orders are off here, so nothing is sent.' : ''}
            </span>
          </p>
        )}
        {error && (
          <div className="refused" role="alert" data-film="refused">
            <b>Predict refuses this bet</b>
            <p>{error}</p>
            <small>Predict only opens bets it prices between 15% and 50%, from 2 USDC. Move the strike closer to BTC now, or raise the amount.</small>
          </div>
        )}
        <p className="form-note">{p.readOnly ? 'Read-only view of another trader: Eidolon prices and simulates the bet on mainnet, nothing is signed.' : canTrade ? 'Signed by your wallet, settled at the Pyth price at the close.' : 'Priced and simulated on Sui mainnet. This server sends no real orders.'}</p>
      </div>
      <Funding live={canTrade} fork={p.fork} owner={p.owner!} signAndSend={p.signAndSend} />
    </aside>
  );
}

function Funding({ live, fork, owner, signAndSend }: { live: boolean; fork: boolean; owner: string; signAndSend: (tx: string) => Promise<unknown> }) {
  const [amount, setAmount] = useState('10');
  const [create, setCreate] = useState(true);
  const [plan, setPlan] = useState<FundingPlan | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = plan?.dryRun.status === 'success';
  return (
    <details className="vault-box">
      <summary className="vb-head">
        <span className="vb-title">
          <Icon name="wallet" size={16} />
          Fund your Predict account
        </span>
        <span className="dim small">USDC</span>
      </summary>
      <p className="form-note">Predict trades from a USDC balance in its own account on Sui.</p>
      <div className="fld-in">
        <input type="number" min="1" step="1" aria-label="Deposit in USDC" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <em>USDC</em>
      </div>
      <label className="check">
        <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
        <span>Create the account in the same transaction</span>
      </label>
      <button
        className="btn btn-ghost btn-sm btn-block"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMsg('');
          post<FundingPlan>('/fund', { owner, amount: Number(amount), create })
            .then(setPlan)
            .catch((e) => setMsg(String(e.message ?? e)))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'Dry-running…' : 'Dry-run the deposit'}
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
        <button className="btn btn-primary btn-block" onClick={() => signAndSend(plan.transaction!).then(() => setPlan(null))}>
          {fork ? 'Sign and deposit (local fork, no real funds)' : 'Sign and deposit real USDC'}
        </button>
      )}
      {msg && <p className="sheet-err" role="alert">{msg}</p>}
    </details>
  );
}

/* ================================================================ your ghost */
export function habitLine(h: HistoryResponse) {
  const up = h.profile.upBias >= 0.5;
  return `You bet ${up ? 'Up' : 'Down'} ${pct(up ? h.profile.upBias : 1 - h.profile.upBias)} of the time and win ${pct(h.profile.hitRate)}.`;
}
function sizeLine(h: HistoryResponse) {
  const l = learn(h.trades);
  if (l.afterLoss == null || l.size == null) return null;
  if (l.afterLoss > l.size * 1.1) return `After a loss you size up: ${l.afterLoss.toFixed(2)} USDC against your ${l.size.toFixed(2)} average.`;
  if (l.afterLoss < l.size * 0.9) return `After a loss you shrink to ${l.afterLoss.toFixed(2)} USDC (average ${l.size.toFixed(2)}).`;
  return null;
}

function GhostPanel(p: TerminalProps & { side: Side; market: Market | undefined; preview: Plan | null }) {
  const { history, feed, preview } = p;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const gSide = other(p.side);
  const gStrike = preview?.ghostPreview?.strike ?? (gSide === 'up' ? p.market?.suggestedStrike : p.market?.suggestedStrikeDown) ?? null;
  const habit = history?.decision ? Math.max(PREDICT_MIN_USDC, history.decision.size) : null;
  const raised = history?.decision && history.decision.size < PREDICT_MIN_USDC;
  const blobs = history?.blobIds ?? [];
  const settled = p.rounds.filter((r) => r.status === 'settled').at(-1);
  const cracked = settled && (settled.ghost?.leg?.pnl ?? 0) < (settled.playerLeg?.pnl ?? 0);
  const size = sizeLine(history ?? ({ trades: [] } as unknown as HistoryResponse));
  const last = feed?.trades[0];

  async function toggle() {
    setBusy(true);
    setMsg('');
    try {
      p.setFeed(await post<GhostFeed>('/haunt', { player: p.seat ?? p.owner, on: !feed?.haunting, cadence: 5 }));
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pnl ghostp" aria-label="Your ghost" data-film="your-ghost">
      <header className="pnl-tabs">
        <span className="pnl-tab on">Your ghost</span>
        <span className={`auto ${feed?.haunting ? 'on' : ''}`}>
          <i className={feed?.haunting ? 'live' : 'off'} />
          {feed?.haunting ? 'Trading on its own' : 'Asleep'}
        </span>
      </header>
      <div className="gp-body">
        <GhostStatus feed={feed} now={p.now} />
        <div className="gp-will" data-film="ghost-will">
          <img src={`/art/v2/eidolon2-ghost-${cracked ? 'cracked' : 'smug'}.webp`} alt="" width={56} height={56} aria-hidden />
          <div>
            <span className="label">If you call {sideWord(p.side)}, it takes</span>
            <b>
              <SidePill side={gSide} /> <span className="num">{gStrike != null ? `${gSide === 'up' ? 'above' : 'below'} ${usd(gStrike)}` : '—'}</span>
            </b>
            <small className="num">
              {habit != null ? `${habit.toFixed(2)} USDC from its own wallet${raised ? ' (raised to the 2 USDC minimum)' : ''}` : 'Stake set from your habits'}
              {preview?.ghostPreview ? ` · ${pct(preview.ghostPreview.probability)} odds` : ' · strike priced when you call it'}
            </small>
          </div>
        </div>

        {p.seat && (
          <p className="seat-note" data-film="fork-seat">
            <b>LOCAL FORK:</b> your seat is a fork-only wallet with no history, so the ghost reads public trader <span className="mono">{short(p.seat)}</span>’s real Walrus memories. Nothing is written to Walrus here.
          </p>
        )}
        <div className="gp-why" data-film="ghost-why">
          <span className="label">Why: what it recalled about you</span>
          {p.historyBusy && !history ? (
            <p className="dim">Reading this trader’s settled bets from Sui…</p>
          ) : p.historyError && !history ? (
            <p className="down">{p.historyError}</p>
          ) : history && (history.trades.length || history.profile.recalled) ? (
            <ul>
              <li>“{habitLine(history)}”</li>
              {size && <li>“{size}”</li>}
              <li>“So I bet the other way. Every round.”</li>
            </ul>
          ) : (
            <p className="dim">No settled trades to learn from yet, so the ghost has no habits to read.</p>
          )}
          {history && (
            <p className="gp-src">
              <Icon name="memory" size={14} />
              {blobs.length ? (
                <span>
                  Recalled {blobs.length} memories from Walrus:{' '}
                  {blobs.slice(0, 2).map((b) => (
                    <Blob key={b} id={b} />
                  ))}
                  {blobs.length > 2 && (
                    <button className="link" onClick={() => go('/trade/memories')}>
                      +{blobs.length - 2}
                    </button>
                  )}
                </span>
              ) : (
                <span>{history.memoryError ? `Not on Walrus yet: ${history.memoryError}` : 'Built from chain history. Not on Walrus yet.'}</span>
              )}
            </p>
          )}
        </div>

        <div className="gp-auto">
          <button className={`btn btn-block ${feed?.haunting ? 'btn-ghost' : 'btn-accent'}`} disabled={busy || !(history?.trades.length || history?.profile.recalled)} onClick={toggle} data-film="haunt-toggle">
            <Icon name={feed?.haunting ? 'pause' : 'play'} size={15} />
            {busy ? 'One moment…' : feed?.haunting ? 'Stop it trading on its own' : 'Let it trade on its own'}
          </button>
          <small className="dim">
            {feed?.haunting ? `Bets against you every 5-minute round${last ? ` · last move ${ago(last.createdAt, p.now)}` : ''}. ` : 'Haunt mode: it trades every round, even while you’re away. '}
            {feed?.mode === 'live' ? 'Live orders, capped per day.' : 'This server is dry-run: it prices, simulates and settles every call, but sends nothing.'}
          </small>
          {msg && <p className="sheet-err" role="alert">{msg}</p>}
        </div>
      </div>
    </section>
  );
}

/** The ghost trades every round on its own: when it moves next, its running record, and what Claude Haiku said about its latest call. */
function GhostStatus({ feed, now }: { feed: GhostFeed | null; now: number }) {
  const [analyst, setAnalyst] = useState<{ ready: boolean; setup: string | null } | null>(null);
  useEffect(() => {
    api<{ ready: boolean; setup: string | null }>('/analyst').then(setAnalyst).catch(() => setAnalyst({ ready: false, setup: 'Analyst status unavailable' }));
  }, []);
  const called = feed?.trades.filter((t) => t.won != null) ?? [];
  const wins = called.filter((t) => t.won).length;
  const next = Math.ceil(now / 300_000) * 300_000;
  const latest = feed?.trades.find((t) => t.commentary);
  return (
    <div className="gstat" data-film="ghost-status">
      <div className="gstat-row">
        <div>
          <span className="label">{feed?.haunting ? 'Next round in' : 'Asleep · next round'}</span>
          <b className="num" data-film="ghost-next">{clockText(next - now)}</b>
        </div>
        <div data-film="ghost-record">
          <span className="label">{feed?.mode === 'live' ? 'Its record' : 'Would have won'}</span>
          <b className="num">{called.length ? `${wins} of ${called.length}` : '—'}</b>
        </div>
      </div>
      {analyst && !analyst.ready ? (
        <p className="gstat-say down">{analyst.setup}</p>
      ) : latest ? (
        <p className="gstat-say" data-film="ghost-analysis">
          <span className="label">Claude Haiku, on its latest call</span>“{latest.commentary}”
        </p>
      ) : null}
    </div>
  );
}

/* ================================================================ bottom tabs */
function Bottom(p: TerminalProps) {
  const settledRecent = [...p.rounds].reverse().find((r) => r.status === 'settled' && r.playerLeg?.pnl != null && p.now - r.expiryMs < 10 * 60_000);
  const called = p.feed?.trades.filter((t) => t.won != null) ?? [];
  const onWalrus = p.history ? p.history.trades.filter((t) => p.history!.memoryByFill?.[t.fillDigest]).length : 0;
  const tabs: [Tab, string, ReactNode][] = [
    ['ghost', 'Ghost’s trades', p.feed ? p.feed.trades.length : null],
    ['rounds', 'Your rounds', p.rounds.length],
    ['memories', 'Memories', p.history ? (p.history.blobIds?.length ?? onWalrus) : null],
    ['habits', 'Habits', null],
  ];
  return (
    <section className="pnl bottom" aria-label="Trades, memories and habits">
      {settledRecent && <Resolved round={settledRecent} />}
      <header className="pnl-tabs btabs" role="tablist">
        {tabs.map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={p.tab === k} className={`pnl-tab ${p.tab === k ? 'on' : ''}`} onClick={() => setTab(k)} data-film={`tab-${k}`}>
            {l}
            {n != null && <small>{n}</small>}
          </button>
        ))}
        <span className="pnl-note">
          {p.tab === 'ghost' && called.length ? `${called.filter((t) => t.won).length} of ${called.length} ${p.feed?.mode === 'live' ? 'won' : 'would have won'}` : p.owner ? `${p.readOnly ? 'Viewing' : 'Account'} ${short(p.owner)}` : ''}
        </span>
      </header>
      <div className="tbl-wrap">
        {p.tab === 'ghost' && <GhostTrades feed={p.feed} />}
        {p.tab === 'rounds' && <Rounds rounds={p.rounds} />}
        {p.tab === 'memories' && <Memories {...p} />}
        {p.tab === 'habits' && <Habits {...p} />}
      </div>
    </section>
  );
}

const tone = (n: number | undefined | null) => (n == null ? 'dim' : n > 0 ? 'up' : n < 0 ? 'down' : '');

function Resolved({ round }: { round: Round }) {
  const you = round.playerLeg?.pnl ?? 0;
  const ghost = round.ghost?.leg?.pnl ?? null;
  const won = ghost == null ? you > 0 : you > ghost;
  return (
    <div className={`resolved dark ${won ? 'won' : 'lost'}`} aria-live="polite" data-film="resolved">
      <div>
        <span className="label">Round settled · Pyth close {usd(round.settlement, 2)}</span>
        <h2>{won ? 'You beat your ghost' : 'Your ghost beat you'}</h2>
      </div>
      <div className="resolved-row">
        <div>
          <span className="label">You</span>
          <b className={`num ${tone(you)}`}>{usdc(you)} USDC</b>
        </div>
        <div>
          <span className="label">Ghost</span>
          <b className={`num ${tone(ghost)}`}>{ghost == null ? '—' : `${usdc(ghost)} USDC`}</b>
        </div>
        {round.playerLeg?.payoutDigest && <Tx digest={round.playerLeg.payoutDigest} label="payout" />}
        {round.memoryBlobId && <Blob id={round.memoryBlobId} label={`memory ${short(round.memoryBlobId)}`} />}
      </div>
    </div>
  );
}

function GhostTrades({ feed }: { feed: GhostFeed | null }) {
  const [all, setAll] = useState(false);
  if (!feed) return <State kind="loading" title="Reading the ghost’s trades…" />;
  if (!feed.trades.length)
    return (
      <State kind="empty" title={feed.haunting ? 'Waiting for the next 5-minute market' : 'No trades of its own yet'}>
        {feed.haunting ? 'It picks the next market with at least 45 seconds left and trades it.' : 'Press “Let it trade on its own” and every round lands here, each step visible.'}
      </State>
    );
  return (
    <table className="tbl" data-film="ghost-trades">
      <thead>
        <tr>
          <th>Round</th>
          <th>Ghost bet</th>
          <th>Strike <i>USD</i></th>
          <th>Stake <i>USDC</i></th>
          <th className="hide-sm">Odds</th>
          <th className="hide-sm">Steps</th>
          <th>Result</th>
          <th className="hide-sm">Proof</th>
          <th className="hide-sm" />
        </tr>
      </thead>
      <tbody>
        {(all ? feed.trades : feed.trades.slice(0, 8)).map((t) => [
          <tr key={t.id} className="clickable" onClick={() => go(`/round/${t.id}`)} data-film="ghost-trade-row">
            <td className="mono">
              {hm(t.createdAt)}
              <small>{t.cadence}-min market</small>
            </td>
            <td>
              <SidePill side={t.side} />
              <small>you’d go {sideWord(t.playerSide)}</small>
            </td>
            <td className="mono">{t.strike ? usd(t.strike) : '—'}</td>
            <td className="mono">{t.size ? t.size.toFixed(2) : '—'}</td>
            <td className="mono hide-sm">{t.probability != null ? pct(t.probability) : '—'}</td>
            <td className="mono hide-sm">
              {t.steps.filter((s) => s.ok).length}/{t.steps.length}
              <small>{t.steps.at(-1)?.tool}</small>
            </td>
            <td>
              <span className={`st ${statusTone(t)}`}>
                <i />
                {t.status}
              </span>
            </td>
            <td className="hide-sm">{t.leg?.digest ? <Tx digest={t.leg.digest} /> : <span className="dim small">{t.live ? '—' : 'not placed'}</span>}</td>
            <td className="acts hide-sm">
              <a className="btn btn-ghost btn-xs" href={`#/round/${encodeURIComponent(t.id)}`} onClick={(e) => e.stopPropagation()}>
                View
              </a>
            </td>
          </tr>,
          t.commentary || t.recap ? (
            <tr key={`${t.id}-say`} className="say-row" onClick={() => go(`/round/${t.id}`)}>
              <td colSpan={9}>
                <span className="say" data-film="ghost-say">
                  <img src="/art/v2/eidolon2-ghost-smug.webp" alt="" aria-hidden />
                  {t.recap ?? t.commentary}
                </span>
              </td>
            </tr>
          ) : null,
        ])}
      </tbody>
      {feed.trades.length > 8 && (
        <tfoot>
          <tr>
            <td colSpan={9}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAll((x) => !x)}>
                {all ? 'Show the latest 8' : `Show all ${feed.trades.length} rounds`}
              </button>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
export const statusTone = (t: GhostTrade) => (t.won === true ? 'st-won' : t.won === false ? 'st-lost' : t.leg ? 'st-live' : /refus|no admissible|Setup/i.test(t.status) ? 'st-refused' : 'st-wait');

function Rounds({ rounds }: { rounds: Round[] }) {
  if (!rounds.length)
    return (
      <State kind="empty" title="No rounds of yours yet">
        Call Up or Down above. Each signed round lands here with the ghost’s answer, the payout and the memory it leaves on Walrus.
      </State>
    );
  return (
    <table className="tbl" data-film="your-rounds">
      <thead>
        <tr>
          <th>Your call</th>
          <th>Strike <i>USD</i></th>
          <th>Stake <i>USDC</i></th>
          <th>You <i>USDC</i></th>
          <th>Ghost <i>USDC</i></th>
          <th>Status</th>
          <th>Proof</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {[...rounds].reverse().map((r) => (
          <tr key={r.digest} className="clickable" onClick={() => go(`/round/${r.digest}`)} data-film="round-row">
            <td>
              <SidePill side={r.side} />
              <small>{r.cadence}-min · {hm(r.expiryMs).slice(0, 5)}</small>
            </td>
            <td className="mono">{usd(r.strike)}</td>
            <td className="mono">{r.size.toFixed(2)}</td>
            <td className={`mono ${tone(r.playerLeg?.pnl)}`}>{usdc(r.playerLeg?.pnl)}</td>
            <td className={`mono ${tone(r.ghost?.leg?.pnl)}`}>
              {r.ghost ? (r.ghost.leg?.pnl != null ? usdc(r.ghost.leg.pnl) : <SidePill side={r.ghost.side} />) : usdc(undefined)}
              {r.ghost && r.ghost.leg?.pnl == null && <small>{r.ghost.strike ? `${usd(r.ghost.strike)} · ` : ''}{r.ghost.size.toFixed(2)} USDC</small>}
            </td>
            <td>
              <span className={`st ${r.status === 'settled' ? 'st-won' : r.ghost?.leg ? 'st-live' : 'st-wait'}`} title={r.status}>
                <i />
                {r.status.length > 40 ? r.status.split(' · ')[0] : r.status}
              </span>
            </td>
            <td className="links" onClick={(e) => e.stopPropagation()}>
              <Tx digest={r.digest} label="order" />
              {r.ghost?.leg && <Tx digest={r.ghost.leg.digest} label="ghost" />}
              {r.playerLeg?.payoutDigest && <Tx digest={r.playerLeg.payoutDigest} label="payout" />}
              {r.memoryBlobId && <Blob id={r.memoryBlobId} label="memory" />}
            </td>
            <td className="acts">
              <a className="btn btn-ghost btn-xs" href={`#/round/${r.digest}`} onClick={(e) => e.stopPropagation()}>
                View
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- memories ---------------- */
type Filter = 'all' | 'wins' | 'losses' | 'up' | 'down';
function Memories(p: TerminalProps) {
  const { history } = p;
  const [filter, setFilter] = useState<Filter>('all');
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const trades = history?.trades ?? [];
  const byFill = history?.memoryByFill ?? {};
  const onWalrus = trades.filter((t) => byFill[t.fillDigest]).length;
  const shown = trades.filter((t) => (filter === 'wins' ? t.pnl > 0 : filter === 'losses' ? t.pnl < 0 : filter === 'up' ? t.side === 'up' : filter === 'down' ? t.side === 'down' : true));
  const selected = trades.find((t) => t.fillDigest === pick) ?? shown[0] ?? null;
  const missing = p.status?.setup.find((s) => s.includes('MEMWAL_'));

  async function remember() {
    setBusy(true);
    setMsg('');
    try {
      const r = await post<{ blobIds: string[] }>(`/history/${p.owner}/remember`, {});
      setMsg(`Wrote ${r.blobIds.length} trade memories to Walrus mainnet.`);
      await p.reload();
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (!history)
    return p.historyBusy ? (
      <State kind="loading" title={`Reading ${short(p.owner ?? '')}’s settled trades from Sui mainnet…`} />
    ) : (
      <State kind={p.historyError ? 'error' : 'empty'} title={p.historyError ? 'Could not read the trade history' : 'No history loaded'} action={<button className="btn btn-ghost btn-sm" onClick={() => void p.reload()}>Read the Predict history</button>}>
        {p.historyError}
      </State>
    );
  if (!trades.length)
    return (
      <State kind="empty" title="No settled trades found">
        No complete Predict trade (fill and payout) in the history this RPC can reach.
      </State>
    );
  return (
    <div className="mem" data-film="memories">
      <div className="mem-bar">
        <div className="seg" role="radiogroup" aria-label="Filter memories">
          {(
            [
              ['all', 'All'],
              ['wins', 'Wins'],
              ['losses', 'Losses'],
              ['up', 'Up'],
              ['down', 'Down'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="mem-count" data-film="memory-count">
          <Icon name="memory" size={14} />
          <b className="num">{onWalrus}</b> of <b className="num">{trades.length}</b> trades on Walrus
          {history.blobIds?.length ? <span className="dim"> · {history.blobIds.length} recalled</span> : null}
        </span>
        {onWalrus < trades.length && (
          <button className="btn btn-accent btn-sm" disabled={busy || Boolean(missing)} onClick={remember} data-film="remember">
            {busy ? (
              <>
                <i className="spin" aria-hidden /> Writing to Walrus…
              </>
            ) : missing ? (
              missing
            ) : p.readOnly ? (
              'Remember this trader on Walrus'
            ) : (
              'Teach my ghost (write to Walrus)'
            )}
          </button>
        )}
      </div>
      {msg && <p className="msg" role="status">{msg}</p>}
      <div className="mem-grid">
        <table className="tbl">
          <thead>
            <tr>
              <th>Settled</th>
              <th>Call</th>
              <th>Strike <i>USD</i></th>
              <th>Stake <i>USDC</i></th>
              <th>P&amp;L <i>USDC</i></th>
              <th>Walrus blob</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.fillDigest} className={`clickable ${selected?.fillDigest === t.fillDigest ? 'sel' : ''}`} onClick={() => setPick(t.fillDigest)} data-film="memory-row">
                <td className="mono">{new Date(t.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td>
                  <SidePill side={t.side} />
                </td>
                <td className="mono">{usd(t.strike)}</td>
                <td className="mono">{t.size.toFixed(2)}</td>
                <td className={`mono ${tone(t.pnl)}`}>{usdc(t.pnl)}</td>
                <td onClick={(e) => e.stopPropagation()}>{byFill[t.fillDigest] ? <Blob id={byFill[t.fillDigest]} /> : <span className="dim small">not on Walrus yet</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {selected && <MemoryCard t={selected} blob={byFill[selected.fillDigest]} all={trades} />}
      </div>
    </div>
  );
}

function MemoryCard({ t, blob, all }: { t: HistoricalTrade; blob?: string; all: HistoricalTrade[] }) {
  return (
    <aside className="mem-card" aria-label="Selected memory" data-film="memory-card">
      <header>
        <SidePill side={t.side} />
        <b className={`num ${tone(t.pnl)}`}>{usdc(t.pnl)} USDC</b>
      </header>
      <dl className="summ">
        <div><dt>Settled</dt><dd className="num">{new Date(t.createdAt).toLocaleString('en-GB')}</dd></div>
        <div><dt>Strike</dt><dd className="num">{usd(t.strike)}</dd></div>
        <div><dt>Stake</dt><dd className="num">{t.size.toFixed(2)} USDC</dd></div>
        <div><dt>Result</dt><dd className={t.hit ? 'up' : 'down'}>{t.hit ? 'Hit' : 'Missed'}</dd></div>
        <div><dt>Stored</dt><dd className="num">{blob ? `Walrus blob ${short(blob)}` : 'chain only'}</dd></div>
      </dl>
      <p className="lesson" data-film="lesson">
        <span className="label">The ghost learned</span>
        {lesson(t, all)}
      </p>
      <div className="mem-actions">
        {blob && <Blob id={blob} label="Open on Walruscan" />}
        <Tx digest={t.fillDigest} label="Fill on SuiScan" />
        <Tx digest={t.payoutDigest} label="Payout" />
      </div>
    </aside>
  );
}

/** One plain sentence on what this trade taught the ghost, using only this trade and the rest of the history. */
function lesson(t: HistoricalTrade, all: HistoricalTrade[]) {
  const same = all.filter((x) => x.side === t.side);
  const hits = same.filter((x) => x.pnl > 0).length;
  const avg = all.reduce((n, x) => n + x.size, 0) / all.length;
  const s = sideWord(t.side);
  const big = t.size > avg * 1.25 ? ` at ${t.size.toFixed(2)} USDC, well above your ${avg.toFixed(2)} average` : '';
  return `${t.pnl > 0 ? 'A win' : 'A loss'} on ${s}${big}. You call ${s} in ${same.length} of ${all.length} trades and it pays ${hits} of ${same.length} times, so the ghost leans ${sideWord(other(t.side))} against you.`;
}

/* ---------------- habits ---------------- */
function Habits(p: TerminalProps) {
  const h = p.history;
  if (!h) return <State kind={p.historyBusy ? 'loading' : 'empty'} title={p.historyBusy ? 'Reading habits…' : 'No history loaded'} />;
  if (!h.trades.length && !h.profile.recalled) return <State kind="empty" title="No settled trades to read habits from yet" />;
  const l = learn(h.trades);
  const lines: string[] = [];
  const sl = sizeLine(h);
  if (sl) lines.push(sl);
  if (l.afterWin != null && l.size != null && Math.abs(l.afterWin - l.size) > l.size * 0.1) lines.push(`After a win you bet ${l.afterWin > l.size ? 'bigger' : 'smaller'}: ${l.afterWin.toFixed(2)} USDC.`);
  if (l.streak) lines.push(`You are on a ${Math.abs(l.streak)}-trade ${l.streak > 0 ? 'winning' : 'losing'} streak.`);
  if (l.worst && l.worst.pnl < 0) lines.push(`Your worst trade: ${sideWord(l.worst.side)} at ${usd(l.worst.strike)}, ${usdc(l.worst.pnl)} USDC.`);
  if (l.best && l.best.pnl > 0) lines.push(`Your best: ${sideWord(l.best.side)} at ${usd(l.best.strike)}, ${usdc(l.best.pnl)} USDC.`);
  const settled = p.rounds.filter((r) => r.status === 'settled');
  const you = settled.reduce((n, r) => n + (r.playerLeg?.pnl ?? 0), 0);
  const gh = settled.reduce((n, r) => n + (r.ghost?.leg?.pnl ?? 0), 0);
  const called = p.feed?.trades.filter((t) => t.won != null) ?? [];
  const w = 320;
  const ht = 72;
  const min = Math.min(0, ...l.curve);
  const max = Math.max(0, ...l.curve);
  const x = (i: number) => (l.curve.length < 2 ? 0 : (i / (l.curve.length - 1)) * w);
  const y = (v: number) => ht - ((v - min) / (max - min || 1)) * ht;
  const d = l.curve.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = l.curve.at(-1) ?? 0;
  return (
    <div className="habits" data-film="habits">
      <div className="hb-col">
        <h3>Read from memory</h3>
        <Bar label="Bets Up" value={h.profile.upBias} text={pct(h.profile.upBias)} />
        <Bar label="Hit rate" value={h.profile.hitRate} text={pct(h.profile.hitRate)} />
        <Bar label="Average stake" value={Math.min(1, (h.profile.averageSize ?? 0) / 10)} text={`${(h.profile.averageSize ?? 0).toFixed(2)} USDC`} />
        <p className="form-note">{h.source}.</p>
      </div>
      <div className="hb-col" data-film="learned">
        <h3>What it learned about you</h3>
        <ul className="learned">
          <li>{habitLine(h)}</li>
          {lines.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <figure className="curve" aria-label={`Your P&L over ${l.count} settled trades: ${usdc(last)} USDC`} data-film="curve">
          <svg viewBox={`0 0 ${w} ${ht}`} width="100%" height={ht} preserveAspectRatio="none" aria-hidden>
            <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="zero" />
            <path d={d} className={last >= 0 ? 'up' : 'down'} />
          </svg>
          <figcaption>
            Your P&amp;L over {l.count} settled trades <b className={`num ${tone(last)}`}>{usdc(last)} USDC</b>
          </figcaption>
        </figure>
      </div>
      <div className="hb-col">
        <h3>You vs your ghost</h3>
        <dl className="summ">
          <div><dt>Settled rounds between you</dt><dd className="num">{settled.length}</dd></div>
          <div><dt>Your P&amp;L</dt><dd className={`num ${tone(you)}`}>{settled.length ? `${usdc(you)} USDC` : '—'}</dd></div>
          <div><dt>Ghost P&amp;L</dt><dd className={`num ${tone(gh)}`}>{settled.length ? `${usdc(gh)} USDC` : '—'}</dd></div>
          <div><dt>Its own calls settled</dt><dd className="num">{called.length}</dd></div>
          <div><dt>{p.feed?.mode === 'live' ? 'Won' : 'Would have won'}</dt><dd className="num">{called.length ? `${called.filter((t) => t.won).length} of ${called.length}` : '—'}</dd></div>
          {p.feed?.stats.placed ? <div><dt>Live P&amp;L</dt><dd className={`num ${tone(p.feed.stats.pnl)}`}>{usdc(p.feed.stats.pnl)} USDC</dd></div> : null}
        </dl>
      </div>
    </div>
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
