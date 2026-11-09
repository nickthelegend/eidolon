import { useEffect, useMemo, useState } from 'react';
import { ago, clockText, humanError, pct, post, suiscan, usd, usdc, walruscan, short, type FundingPlan, type GhostFeed, type HistoryResponse, type Market, type Plan, type PriceSample, type Round, type Side } from '../api';
import { LiveChart } from './LiveChart';

/** The arena: you and your ghost face off across the live BTC line, and you call the next close. */
export function Arena({
  owner,
  account,
  readOnly,
  markets,
  marketsLoaded,
  samples,
  now,
  live,
  fork,
  history,
  feed,
  rounds,
  signAndSend,
  onGhost,
}: {
  owner: string;
  account: boolean;
  readOnly: boolean;
  markets: Market[];
  marketsLoaded: boolean;
  samples: PriceSample[];
  now: number;
  live: boolean;
  fork: boolean;
  history: HistoryResponse | null;
  feed: GhostFeed | null;
  rounds: Round[];
  signAndSend: (tx: string) => Promise<{ digest: string }>;
  onGhost: () => void;
}) {
  const [marketId, setMarketId] = useState('');
  const [side, setSide] = useState<Side>('up');
  const [amount, setAmount] = useState('2');
  const [strike, setStrike] = useState('');
  const [preview, setPreview] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<'plan' | 'trade' | null>(null);
  const [error, setError] = useState('');

  // One market per cadence: the selected one, else the next to close with a few seconds left. 5 minutes by default.
  const pickNext = (c: 1 | 5) => markets.filter((m) => m.cadence === c && m.expiryMs > now + 5_000).sort((x, y) => x.expiryMs - y.expiryMs)[0];
  const market = markets.find((m) => m.id === marketId && m.expiryMs > now) ?? pickNext(markets.find((m) => m.id === marketId)?.cadence ?? 5) ?? pickNext(1);
  useEffect(() => {
    if (market && market.id !== marketId) {
      setMarketId(market.id);
      setPreview(null);
    }
  }, [market?.id]);
  const options = ([1, 5] as const).map((c) => (market?.cadence === c ? market : pickNext(c))).filter((m): m is Market => Boolean(m));
  const forward = samples.at(-1)?.forward ?? market?.forward ?? null;
  const suggested = side === 'up' ? market?.suggestedStrike : market?.suggestedStrikeDown;
  const left = market ? Math.max(0, market.expiryMs - now) : 0;
  const reset = () => {
    setPreview(null);
    setError('');
  };

  const move = useMemo(() => {
    if (samples.length < 2) return null;
    const last = samples.at(-1)!;
    const ref = [...samples].reverse().find((s) => s.at <= last.at - 300_000) ?? samples[0];
    const minutes = Math.round((last.at - ref.at) / 60_000);
    return minutes >= 1 ? { delta: last.forward - ref.forward, minutes } : null;
  }, [samples]);

  async function quote() {
    if (!market) return;
    setBusy('plan');
    setError('');
    setPreview(null);
    try {
      setPreview(await post<Plan>('/plan', { owner, marketId: market.id, side, amount: Number(amount), strike: strike ? Number(strike) : undefined }));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }
  async function trade() {
    if (!preview?.transaction || !live) return;
    setBusy('trade');
    setError('');
    try {
      const done = await signAndSend(preview.transaction);
      await post('/rounds', { digest: done.digest });
      setPreview(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }

  const ghostSide: Side = side === 'up' ? 'down' : 'up';
  const lastGhost = feed?.trades[0];
  const dryOk = preview?.dryRun?.status.status === 'success';
  const canTrade = live && !readOnly && account;
  const settledRecent = [...rounds].reverse().find((r) => r.status === 'settled' && r.playerLeg?.pnl != null && now - r.expiryMs < 10 * 60_000);

  return (
    <section className="arena" aria-labelledby="arena-price">
      <img className="duelist duelist-you" src="/art/v2/eidolon2-duel-you.webp" alt="" aria-hidden />
      <img className="duelist duelist-ghost" src="/art/v2/eidolon2-duel-ghost.webp" alt="" aria-hidden />

      <header className="arena-head">
        <div className="mkt-switch" role="radiogroup" aria-label="Market">
          {!marketsLoaded && <span className="seg-skel" aria-hidden />}
          {marketsLoaded && options.length === 0 && <span className="muted small">No Predict market open right now</span>}
          {options.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={m.id === market?.id}
              className={m.id === market?.id ? 'on' : ''}
              onClick={() => {
                setMarketId(m.id);
                reset();
              }}
            >
              BTC / USD · {m.cadence}-minute market <span className="num">{m.mintPaused ? 'paused' : clockText(m.expiryMs - now)}</span>
            </button>
          ))}
        </div>
        <div className="price-row">
          <h1 id="arena-price" className="price-big num">
            <Flash value={forward} />
          </h1>
          {market && <CloseRing left={left} total={market.cadence * 60_000} />}
        </div>
        {move && (
          <p className="move">
            BTC is <b className={move.delta >= 0 ? 'up' : 'down'}>{move.delta >= 0 ? 'up' : 'down'} {usd(Math.abs(move.delta))}</b> in {move.minutes === 1 ? 'a minute' : `${move.minutes} minutes`}
          </p>
        )}
      </header>

      <div className="arena-chart">
        <LiveChart samples={samples} now={now} expiryMs={market?.expiryMs ?? null} side={side} strike={preview?.strike ?? null} suggested={suggested ?? null} ghost={preview?.ghostPreview ?? null} />
      </div>

      {feed && feed.trades.some((t) => t.won != null) && (
        <button className="calls-strip" onClick={onGhost} aria-label="The ghost's recent calls; open the ghost">
          <span className="cs-label">Ghost’s last calls</span>
          <span className="cs-dots">
            {feed.trades
              .filter((t) => t.won != null)
              .slice(0, 12)
              .reverse()
              .map((t) => (
                <i key={t.id} className={t.won ? 'won' : 'lost'} title={`${t.side === 'up' ? 'Higher' : 'Lower'} ${t.strike ? usd(t.strike) : ''}: ${t.status}`} />
              ))}
          </span>
          <span className="cs-sum num">
            {feed.trades.filter((t) => t.won).length} of {feed.trades.filter((t) => t.won != null).length} {feed.mode === 'live' ? 'won' : 'would have won'}
          </span>
        </button>
      )}

      <div className="arena-bottom">
        <button className="bubble" onClick={onGhost} aria-label="Open your ghost">
          <img src="/art/v2/eidolon2-ghost-smug.webp" alt="" width={64} height={64} />
          <span>
            <q>
              {history?.trades.length
                ? `You go ${history.profile.upBias >= 0.5 ? 'Higher' : 'Lower'} ${pct(history.profile.upBias >= 0.5 ? history.profile.upBias : 1 - history.profile.upBias)} of the time. I'll take ${history.profile.upBias >= 0.5 ? 'Lower' : 'Higher'}.`
                : history
                  ? 'I have no trades of yours to learn from yet.'
                  : 'Reading your trades…'}
            </q>
            <small>
              <i className={`dot ${feed?.haunting ? 'dot-live' : ''}`} aria-hidden />
              {feed?.haunting
                ? `Autonomous · trading every round${lastGhost ? ` · last move ${ago(lastGhost.createdAt, now)}` : ''}`
                : 'Turn on autonomous trading →'}
            </small>
          </span>
        </button>

        <div className="betcard">
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
                {s === 'up' ? '↑ Higher' : '↓ Lower'}
              </button>
            ))}
          </div>
          <div className="stepper">
            <button aria-label="Less" onClick={() => { setAmount(String(Math.max(2, Number(amount || 0) - 0.5))); reset(); }}>−</button>
            <span>
              <input className="num" type="number" inputMode="decimal" min="2" step="0.5" aria-label="Amount in USDC" value={amount} onChange={(e) => { setAmount(e.target.value); reset(); }} />
              <i>USDC</i>
            </span>
            <button aria-label="More" onClick={() => { setAmount(String(Number(amount || 0) + 0.5)); reset(); }}>+</button>
          </div>
          <details className="strike">
            <summary>
              <span>Strike</span>
              <span className="num">{strike ? usd(Number(strike)) : suggested != null ? `${side === 'up' ? 'above' : 'below'} ${usd(suggested)}` : 'live'}</span>
            </summary>
            <input className="num" type="number" inputMode="decimal" aria-label="Custom strike in USD" placeholder={suggested ? String(suggested) : 'live strike'} value={strike} onChange={(e) => { setStrike(e.target.value); reset(); }} />
          </details>
          <p className="payout">
            <span>Payout if right</span>
            <b className="num ember">{preview ? `${preview.quote.potentialPayout.toFixed(2)} USDC` : '—'}</b>
          </p>
          {preview && dryOk && canTrade ? (
            <button className="callit" disabled={busy !== null} onClick={trade}>
              {busy === 'trade' ? 'Signing…' : fork ? 'Sign it (local fork)' : 'Sign and place it'}
            </button>
          ) : (
            <button className="callit" disabled={!market || busy !== null} onClick={quote}>
              {busy === 'plan' ? (
                <>
                  <span className="spin" aria-hidden /> Pricing on mainnet…
                </>
              ) : (
                'Call it'
              )}
            </button>
          )}
          <p className="fine center">Min 2 USDC · Predict fee 0.02 USDC</p>
        </div>
      </div>

      {error && (
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
        <div className="duel-tickets">
          <div className="dt dt-you">
            <span className="dt-who">You</span>
            <span className={`pill pill-${side}`}>{side === 'up' ? '↑ Higher' : '↓ Lower'}</span>
            <b className="num">{usd(preview.strike)}</b>
            {preview.ghostPreview && <span className="muted num">{pct(preview.ghostPreview.playerProbability)} odds</span>}
            <span className="muted num">pay {preview.quote.totalDebit.toFixed(2)} · fee {preview.quote.orderFee.toFixed(2)} USDC</span>
          </div>
          <div className="dt dt-ghost">
            <span className="dt-who">Ghost</span>
            {preview.ghostPreview ? (
              <>
                <span className={`pill pill-${preview.ghostPreview.side}`}>{preview.ghostPreview.side === 'up' ? '↑ Higher' : '↓ Lower'}</span>
                <b className="num">{usd(preview.ghostPreview.strike)}</b>
                <span className="muted num">{pct(preview.ghostPreview.probability)} odds</span>
                <span className="muted">{history?.decision ? `stakes ${history.decision.size.toFixed(2)} USDC` : preview.ghostPreview.exact ? 'exact mirror' : 'nearest strike Predict admits'}</span>
              </>
            ) : (
              <span className="muted">No counter-strike from the pricer · {ghostSide.toUpperCase()}</span>
            )}
          </div>
          <p className={`dry ${dryOk ? 'dry-ok' : preview.dryRun ? 'dry-fail' : ''}`}>
            <i aria-hidden />
            {preview.accepting ? '' : `Predict refuses: ${preview.refusal}. `}
            Dry-run{' '}
            {preview.dryRun
              ? `${preview.dryRun.status.status} via ${preview.dryRun.rpc}${preview.dryRun.status.error ? `: ${preview.dryRun.status.error}` : ''}`
              : 'not available: fund your Predict account first'}
            {dryOk && !canTrade ? ' · real orders are off here, so nothing is sent' : ''}
          </p>
        </div>
      )}

      {settledRecent && <Resolved round={settledRecent} />}

      {rounds.length > 0 && (
        <section className="card rounds-card" aria-labelledby="rounds-title">
          <h2 id="rounds-title">Your rounds</h2>
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
                    <span className={`pill pill-${r.side}`}>{r.side === 'up' ? '↑ Higher' : '↓ Lower'}</span> <span className="muted small">{r.status}</span>
                  </td>
                  <td className="r num">{usd(r.strike)}</td>
                  <td className={`r num ${tone(r.playerLeg?.pnl)}`}>{usdc(r.playerLeg?.pnl)}</td>
                  <td className={`r num ${tone(r.ghost?.leg?.pnl)}`}>{usdc(r.ghost?.leg?.pnl)}</td>
                  <td className="r hide-sm links">
                    <a href={suiscan(r.digest)} target="_blank" rel="noreferrer">order</a>
                    {r.ghost?.leg && <a href={suiscan(r.ghost.leg.digest)} target="_blank" rel="noreferrer">ghost</a>}
                    {r.playerLeg?.payoutDigest && <a href={suiscan(r.playerLeg.payoutDigest)} target="_blank" rel="noreferrer">payout</a>}
                    {r.memoryBlobId && <a href={walruscan(r.memoryBlobId)} target="_blank" rel="noreferrer">memory</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Funding live={canTrade} fork={fork} owner={owner} signAndSend={signAndSend} />
    </section>
  );
}

const tone = (n: number | undefined) => (n == null ? 'muted' : n > 0 ? 'up' : n < 0 ? 'down' : '');

/** A round that just settled: who won, by how much, and the memory it left on Walrus. */
function Resolved({ round }: { round: Round }) {
  const you = round.playerLeg?.pnl ?? 0;
  const ghost = round.ghost?.leg?.pnl ?? null;
  const won = ghost == null ? you > 0 : you > ghost;
  return (
    <section className={`resolved ${won ? 'resolved-win' : 'resolved-loss'}`} aria-live="polite">
      <h2>{won ? 'You beat your ghost' : 'Your ghost beat you'}</h2>
      <p className="num muted">
        Close {usd(round.settlement, 2)} · your strike {round.side === 'up' ? 'above' : 'below'} {usd(round.strike)}
        {round.ghost?.strike ? ` · ghost strike ${round.ghost.side === 'up' ? 'above' : 'below'} ${usd(round.ghost.strike)}` : ''}
      </p>
      <div className="resolved-row">
        <div className="resolved-pnl">
          <b className={`num ${you >= 0 ? 'up' : 'down'}`}>{usdc(you)} USDC</b>
          <small>Stake {round.size.toFixed(2)} · settled on Sui</small>
        </div>
        {round.memoryBlobId && (
          <a className="receipt" href={walruscan(round.memoryBlobId)} target="_blank" rel="noreferrer">
            <small>Memory written to Walrus</small>
            <span className="num">blob {short(round.memoryBlobId)}</span>
          </a>
        )}
      </div>
    </section>
  );
}

function CloseRing({ left, total }: { left: number; total: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, left / total);
  return (
    <div className={`close-ring ${left < 10_000 ? 'late' : ''}`} aria-label={`${Math.floor(left / 1000)} seconds to market close`}>
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden>
        <circle cx="36" cy="36" r={r} className="cr-track" />
        <circle cx="36" cy="36" r={r} className="cr-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 36 36)" />
      </svg>
      <span>
        <b className="num">{clockText(left)}</b>
        <small>to market close</small>
      </span>
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
  return <span className={`flash ${dir ? `flash-${dir}` : ''}`}>{usd(value, 2)}</span>;
}

function Funding({ live, fork, owner, signAndSend }: { live: boolean; fork: boolean; owner: string; signAndSend: (tx: string) => Promise<unknown> }) {
  const [amount, setAmount] = useState('10');
  const [create, setCreate] = useState(true);
  const [plan, setPlan] = useState<FundingPlan | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = plan?.dryRun.status === 'success';
  return (
    <details className="card funding">
      <summary>
        <img src="/art/v2/eidolon2-memory-vault.webp" alt="" width={36} height={36} />
        <span>
          <b>Fund your Predict account</b>
          <small>Predict trades from a USDC balance in its own account</small>
        </span>
      </summary>
      <div className="funding-row">
        <span className="input-unit">
          <input className="num" type="number" min="1" step="1" aria-label="Deposit in USDC" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <i>USDC</i>
        </span>
        <button
          className="ghost-btn"
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
      </div>
      <label className="check">
        <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
        <span>Create the account in the same transaction</span>
      </label>
      {plan && (
        <p className={`dry ${ok ? 'dry-ok' : 'dry-fail'}`}>
          <i aria-hidden />
          Dry-run {plan.dryRun.status} via {plan.rpc}
          {plan.dryRun.error ? `: ${humanError(plan.dryRun.error)}` : ''}
        </p>
      )}
      {plan?.transaction && live && (
        <button className="callit" onClick={() => signAndSend(plan.transaction!).then(() => setPlan(null))}>
          {fork ? 'Sign and deposit (local fork, no real funds)' : 'Sign and deposit real USDC'}
        </button>
      )}
      {msg && <p className="notice notice-error">{msg}</p>}
    </details>
  );
}
