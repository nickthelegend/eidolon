import { pct, usd, type GhostPreview, type Side } from '../api';

/**
 * The duel on one price line: your strike (ember) and the ghost's (spectral), the live BTC
 * forward, and the dead zone between the two strikes where both bets lose.
 */
export function DuelBar({
  forward,
  side,
  strike,
  ghost,
}: {
  forward: number;
  side: Side;
  strike: number;
  ghost: GhostPreview | null;
}) {
  const points = [forward, strike, ghost?.strike ?? strike];
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const pad = Math.max(8, (hi - lo) * 0.6);
  const min = lo - pad;
  const max = hi + pad;
  const x = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const dead =
    ghost && !ghost.exact ? { from: Math.min(strike, ghost.strike), to: Math.max(strike, ghost.strike) } : null;
  return (
    <figure className="duel" aria-label="Your strike and the ghost's strike on the BTC price line">
      <div className="duel-axis">
        {dead && (
          <div
            className="duel-dead"
            style={{ left: x(dead.from), width: `calc(${x(dead.to)} - ${x(dead.from)})` }}
            title="Both bets lose if BTC settles in here"
          />
        )}
        <Marker at={x(forward)} kind="forward" label="BTC now" value={usd(forward)} />
        <Marker
          at={x(strike)}
          kind="you"
          label={`You · ${side === 'up' ? 'above' : 'below'}`}
          value={usd(strike)}
          sub={ghost ? pct(ghost.playerProbability) : undefined}
          dir={side}
        />
        {ghost && (
          <Marker
            at={x(ghost.strike)}
            kind="ghost"
            label={`Ghost · ${ghost.side === 'up' ? 'above' : 'below'}`}
            value={usd(ghost.strike)}
            sub={pct(ghost.probability)}
            dir={ghost.side}
          />
        )}
      </div>
      <figcaption>
        {!ghost
          ? 'The ghost’s counter-strike appears once the live pricer answers.'
          : ghost.exact
            ? 'Exact mirror: the ghost takes the other side of your strike.'
            : `Predict only opens bets priced 15–50%, so the ghost stands at the nearest strike it can: a ${usd(Math.abs(strike - ghost.strike))} dead zone where you both lose.`}
      </figcaption>
    </figure>
  );
}

function Marker({
  at,
  kind,
  label,
  value,
  sub,
  dir,
}: {
  at: string;
  kind: 'forward' | 'you' | 'ghost';
  label: string;
  value: string;
  sub?: string;
  dir?: Side;
}) {
  return (
    <div className={`duel-mark duel-${kind}`} style={{ left: at }}>
      <span className="duel-tick" />
      {dir && <span className={`duel-arrow duel-arrow-${dir}`} aria-hidden />}
      <span className="duel-label">
        {label}
        <b className="num">{value}</b>
        {sub && <em className="num">{sub}</em>}
      </span>
    </div>
  );
}
