import { pct, usd, type HistoryResponse, type Market, type Plan, type Side } from '../api';
import { DuelBar, IdleAxis } from './DuelBar';

/** The arena's centre: the selected market, the duel line, the quote and the ghost's counter-strike. */
export function Stage({
  market,
  forward,
  now,
  side,
  amount,
  suggested,
  preview,
  refusal,
  busy,
  canTrade,
  onTrade,
  history,
}: {
  market: Market | undefined;
  forward: number | null;
  now: number;
  side: Side;
  amount: string;
  suggested: number | null;
  preview: Plan | null;
  refusal: string | null;
  busy: string | null;
  canTrade: boolean;
  onTrade: () => void;
  history: HistoryResponse | null;
}) {
  const left = market ? Math.max(0, market.expiryMs - now) : 0;
  const s = Math.floor(left / 1000);
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const ghost = preview?.ghostPreview ?? null;
  const decision = history?.decision && ghost && history.decision.side === ghost.side ? history.decision : null;
  const dryOk = preview?.dryRun?.status.status === 'success';

  return (
    <section className="panel stage" aria-labelledby="stage-title" aria-busy={busy === 'plan'}>
      <header className="stage-head">
        <div>
          <p className="eyebrow">The duel</p>
          <h2 id="stage-title">{market ? `BTC · ${market.cadence}-minute market` : 'Waiting for a live market'}</h2>
          {market && (
            <p className="muted small num">
              ends {new Date(market.expiryMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {market.referencePrice != null ? ` · reference ${usd(market.referencePrice)}` : ''}
              {market.mintPaused ? ' · minting paused' : ''}
            </p>
          )}
        </div>
        {market && (
          <div className="clock-wrap">
            <img className="clock-art float" src="/art/eidolon-clock-5m.webp" alt="" width={48} height={48} />
            <div className={`clock ${s <= 10 ? 'clock-late' : ''}`} aria-label={`${s} seconds to expiry`}>
              <b className="fig">{clock}</b>
              <span>to expiry</span>
            </div>
          </div>
        )}
      </header>

      <div className="stage-plot">
        {busy === 'plan' && <div className="stage-busy" role="status"><span className="spin" aria-hidden /> Pricing both sides on mainnet…</div>}
        {preview && forward != null && preview.strike != null ? (
          <DuelBar forward={forward} side={side} strike={preview.strike} ghost={ghost} />
        ) : forward != null ? (
          <IdleAxis forward={forward} suggested={suggested} side={side} />
        ) : (
          <div className="stage-skel" aria-hidden />
        )}
      </div>

      {refusal && (
        <div className="quote refused" role="alert">
          <img className="refused-art float" src="/art/eidolon-refused-gate.webp" alt="" width={80} height={80} />
          <div>
            <div className="quote-row">
              <span className="quote-flag">Predict refuses this bet</span>
            </div>
            <p className="refusal-text">{refusal}</p>
            <p className="fine">Predict only opens bets it prices between 15% and 50%. Move the strike closer to BTC now.</p>
          </div>
        </div>
      )}

      {preview && (
        <div className="tickets">
          <div className={`quote ${preview.accepting ? '' : 'refused'}`}>
            <img className={`ticket-sigil sigil-${side}`} src={`/art/eidolon-${side}-sigil.webp`} alt="" width={72} height={72} />
            <div className="quote-row">
              <span className="who who-you">You</span>
              <span className="quote-flag">{preview.accepting ? 'Predict accepts this bet' : `Predict refuses: ${preview.refusal}`}</span>
            </div>
            <p className="ticket-line">
              <span className={`side-pill side-${side}`}>{side === 'up' ? 'UP' : 'DOWN'}</span>
              <b className="num">{usd(preview.strike)}</b>
              {ghost && <span className="muted num">{pct(ghost.playerProbability)} odds</span>}
            </p>
            <dl>
              <div>
                <dt>Pays if right <i>USDC</i></dt>
                <dd className="num">
                  {preview.quote.potentialPayout.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>You pay <i>USDC</i></dt>
                <dd className="num">
                  {preview.quote.totalDebit.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>Order fee <i>USDC</i></dt>
                <dd className="num">
                  {preview.quote.orderFee.toFixed(2)}
                </dd>
              </div>
            </dl>
            <p className={`dry ${dryOk ? 'dry-ok' : preview.dryRun ? 'dry-fail' : ''}`}>
              <i aria-hidden />
              <span>
                Dry-run{' '}
                {preview.dryRun
                  ? `${preview.dryRun.status.status} via ${preview.dryRun.rpc}${preview.dryRun.status.error ? `: ${preview.dryRun.status.error}` : ''}`
                  : 'not available: fund your Predict account first'}
              </span>
            </p>
            {dryOk &&
              (canTrade ? (
                <button className="primary ember" disabled={busy !== null} onClick={onTrade}>
                  {busy === 'trade' ? 'Signing…' : 'Sign and queue the real order'}
                </button>
              ) : (
                <p className="fine">Real orders are off on this server (dry-run only).</p>
              ))}
          </div>

          <span className="vs" aria-hidden>
            vs
          </span>

          <div className="counter">
            <div className="quote-row">
              <span className="who who-ghost">Ghost</span>
              <span className="quote-flag">{ghost ? (ghost.exact ? 'Mirror strike' : 'Nearest strike Predict admits') : 'No counter-strike'}</span>
            </div>
            {ghost ? (
              <>
                <img className={`ticket-sigil sigil-${ghost.side}`} src={`/art/eidolon-${ghost.side}-sigil.webp`} alt="" width={72} height={72} />
                <p className="ticket-line">
                  <span className={`side-pill side-${ghost.side}`}>{ghost.side === 'up' ? 'UP' : 'DOWN'}</span>
                  <b className="num">{usd(ghost.strike)}</b>
                  <span className="muted num">{pct(ghost.probability)} odds</span>
                </p>
                <dl>
                  <div>
                    <dt>Ghost stakes <i>USDC</i></dt>
                    <dd className="num">{decision ? decision.size.toFixed(2) : <span className="muted">after history</span>}</dd>
                  </div>
                  <div>
                    <dt>Your spend <i>USDC</i></dt>
                    <dd className="num">
                      {Number(amount).toFixed(2)}
                    </dd>
                  </div>
                </dl>
                <p className="fine">
                  {decision
                    ? 'Size from the ghost policy over your settled trades.'
                    : 'Read your Predict history and the ghost sizes its bet from your habits.'}
                </p>
              </>
            ) : (
              <p className="fine">The live pricer gave no counter-strike. Mirror at your strike: {preview.mirror}.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
