import { pct, usd, type HistoryResponse, type Plan, type Side } from '../api';

/** The two tickets after a quote: your bet as Predict priced it, and the ghost's counter-bet. */
export function Quote({
  preview,
  side,
  amount,
  history,
  canTrade,
  fork,
  busy,
  onTrade,
}: {
  preview: Plan;
  side: Side;
  amount: string;
  history: HistoryResponse | null;
  canTrade: boolean;
  fork: boolean;
  busy: string | null;
  onTrade: () => void;
}) {
  const ghost = preview.ghostPreview;
  const decision = history?.decision && ghost && history.decision.side === ghost.side ? history.decision : null;
  const dryOk = preview.dryRun?.status.status === 'success';
  return (
    <div className="quote">
      <div className={`ticket ticket-you ${preview.accepting ? '' : 'refused'}`}>
        <img className="ticket-coin" src={`/art/v2/eidolon2-coin-${side}.webp`} alt="" width={64} height={64} />
        <p className="ticket-who">You</p>
        <p className="ticket-main">
          <span className={`pill pill-${side}`}>{side === 'up' ? '↑ Higher' : '↓ Lower'}</span>
          <b className="num">{usd(preview.strike)}</b>
          {ghost && <span className="muted num">{pct(ghost.playerProbability)} odds</span>}
        </p>
        <dl>
          <div>
            <dt>Pays if right</dt>
            <dd className="num">
              {preview.quote.potentialPayout.toFixed(2)} <i>USDC</i>
            </dd>
          </div>
          <div>
            <dt>You pay</dt>
            <dd className="num">
              {preview.quote.totalDebit.toFixed(2)} <i>USDC</i>
            </dd>
          </div>
          <div>
            <dt>Order fee</dt>
            <dd className="num">
              {preview.quote.orderFee.toFixed(2)} <i>USDC</i>
            </dd>
          </div>
        </dl>
        <p className={`dry ${dryOk ? 'dry-ok' : preview.dryRun ? 'dry-fail' : ''}`}>
          <i aria-hidden />
          {preview.accepting ? '' : `Predict refuses: ${preview.refusal}. `}
          Dry-run{' '}
          {preview.dryRun
            ? `${preview.dryRun.status.status} via ${preview.dryRun.rpc}${preview.dryRun.status.error ? `: ${preview.dryRun.status.error}` : ''}`
            : 'not available: fund your Predict account first'}
        </p>
        {dryOk &&
          (canTrade ? (
            <button className="primary" disabled={busy !== null} onClick={onTrade}>
              {busy === 'trade' ? 'Signing…' : fork ? 'Sign and queue (local fork, no real funds)' : 'Sign and queue the real order'}
            </button>
          ) : (
            <p className="fine">Real orders are off on this server: dry-run only.</p>
          ))}
      </div>

      <span className="vs" aria-hidden>
        vs
      </span>

      <div className="ticket ticket-ghost">
        <img className="ticket-coin" src="/art/v2/eidolon2-coin-ghost.webp" alt="" width={64} height={64} />
        <p className="ticket-who">Ghost</p>
        {ghost ? (
          <>
            <p className="ticket-main">
              <span className={`pill pill-${ghost.side}`}>{ghost.side === 'up' ? '↑ Higher' : '↓ Lower'}</span>
              <b className="num">{usd(ghost.strike)}</b>
              <span className="muted num">{pct(ghost.probability)} odds</span>
            </p>
            <dl>
              <div>
                <dt>Ghost stakes</dt>
                <dd className="num">
                  {decision ? (
                    <>
                      {decision.size.toFixed(2)} <i>USDC</i>
                    </>
                  ) : (
                    <span className="muted">after your history</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Your spend</dt>
                <dd className="num">
                  {Number(amount).toFixed(2)} <i>USDC</i>
                </dd>
              </div>
              <div>
                <dt>Strike</dt>
                <dd>{ghost.exact ? 'Exact mirror' : 'Nearest Predict admits'}</dd>
              </div>
            </dl>
            <p className="fine">
              {decision ? 'Sized by the ghost policy from your settled trades.' : 'Read your history and the ghost sizes its bet from your habits.'}
            </p>
          </>
        ) : (
          <p className="fine">The live pricer gave no counter-strike. Mirror at your strike: {preview.mirror}.</p>
        )}
      </div>
    </div>
  );
}
