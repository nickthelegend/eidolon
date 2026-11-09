import type { CSSProperties } from 'react';
import { pct, usd, type GhostPreview, type Side } from '../api';

/** Round tick step so the axis shows about five labels. */
function ticks(min: number, max: number) {
  const span = max - min;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = steps.find((s) => span / s <= 6) ?? 10_000;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

function domain(points: number[]) {
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const pad = Math.max(8, (hi - lo) * 0.6);
  return { min: lo - pad, max: hi + pad };
}

/** Horizontal anchor for a label so it never runs off the axis. */
const anchor = (p: number) => (p < 14 ? 'start' : p > 86 ? 'end' : 'mid');

/**
 * The duel on one price line: your strike (ember) and the ghost's (spectral), the live BTC
 * forward, where each bet pays, and the dead zone between the two strikes where both bets lose.
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
  const { min, max } = domain([forward, strike, ghost?.strike ?? strike]);
  const p = (v: number) => ((v - min) / (max - min)) * 100;
  const dead =
    ghost && !ghost.exact ? { from: Math.min(strike, ghost.strike), to: Math.max(strike, ghost.strike) } : null;
  const youWin = side === 'up' ? { left: p(strike), right: 100 } : { left: 0, right: p(strike) };
  const ghostWin = ghost ? (ghost.side === 'up' ? { left: p(ghost.strike), right: 100 } : { left: 0, right: p(ghost.strike) }) : null;
  return (
    <figure className="duel" aria-label="Your strike and the ghost's strike on the BTC price line">
      <div className="duel-plot">
        <span className="duel-zone duel-zone-you" style={zone(youWin)} aria-hidden />
        {ghostWin && <span className="duel-zone duel-zone-ghost" style={zone(ghostWin)} aria-hidden />}
        {dead && (
          <span
            className="duel-dead"
            style={{ left: `${p(dead.from)}%`, width: `${p(dead.to) - p(dead.from)}%` }}
            title="Both bets lose if BTC settles in here"
          />
        )}
        <span className="duel-axis" aria-hidden />
        {ticks(min, max).map((t) => (
          <span key={t} className="duel-tickmark" style={{ left: `${p(t)}%` }} aria-hidden>
            <i className="num">{t.toLocaleString('en-US')}</i>
          </span>
        ))}
        <Marker at={p(forward)} kind="forward" label="BTC now" value={usd(forward)} />
        <Marker
          at={p(strike)}
          kind="you"
          label={`You · ${side === 'up' ? 'above' : 'below'}`}
          value={usd(strike)}
          sub={ghost ? pct(ghost.playerProbability) : undefined}
          dir={side}
        />
        {ghost && (
          <Marker
            at={p(ghost.strike)}
            kind="ghost"
            label={`Ghost · ${ghost.side === 'up' ? 'above' : 'below'}`}
            value={usd(ghost.strike)}
            sub={pct(ghost.probability)}
            dir={ghost.side}
          />
        )}
      </div>
      <ul className="duel-legend">
        <li className="lg-you-win">
          <i aria-hidden />
          You win {side === 'up' ? 'above' : 'below'} <b className="num">{usd(strike)}</b>
        </li>
        {ghost && (
          <li className="lg-ghost-win">
            <i aria-hidden />
            Ghost wins {ghost.side === 'up' ? 'above' : 'below'} <b className="num">{usd(ghost.strike)}</b>
          </li>
        )}
        {dead && (
          <li className="lg-dead">
            <i aria-hidden />
            Dead zone <b className="num">{usd(dead.to - dead.from)}</b> wide: both lose
          </li>
        )}
      </ul>
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

/** Before a quote: the live forward and the strike Predict's pricer suggests for this side. */
export function IdleAxis({ forward, suggested, side }: { forward: number; suggested: number | null; side: Side }) {
  const { min, max } = domain(suggested != null ? [forward, suggested] : [forward - 40, forward + 40]);
  const p = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <figure className="duel-idle" aria-label="The live BTC forward before you quote">
      <div className="duel-plot">
        <span className="duel-axis" aria-hidden />
        {ticks(min, max).map((t) => (
          <span key={t} className="duel-tickmark" style={{ left: `${p(t)}%` }} aria-hidden>
            <i className="num">{t.toLocaleString('en-US')}</i>
          </span>
        ))}
        <Marker at={p(forward)} kind="forward" label="BTC now" value={usd(forward)} />
        {suggested != null && (
          <Marker at={p(suggested)} kind="hint" label={`Suggested · ${side === 'up' ? 'above' : 'below'}`} value={usd(suggested)} dir={side} />
        )}
      </div>
      <figcaption>
        Quote a bet and your strike lands on this line. Your ghost answers on the other side, and the gap between
        you is where you both lose.
      </figcaption>
    </figure>
  );
}

const zone = (z: { left: number; right: number }): CSSProperties => ({ left: `${z.left}%`, width: `${Math.max(0, z.right - z.left)}%` });

function Marker({
  at,
  kind,
  label,
  value,
  sub,
  dir,
}: {
  at: number;
  kind: 'forward' | 'you' | 'ghost' | 'hint';
  label: string;
  value: string;
  sub?: string;
  dir?: Side;
}) {
  return (
    <div className={`duel-mark duel-${kind}`} data-anchor={anchor(at)} style={{ left: `${at}%` }}>
      <span className="duel-tick" />
      {dir && <span className={`duel-arrow duel-arrow-${dir}`} aria-hidden />}
      <span className="duel-label">
        <span className="duel-label-top">{label}</span>
        <b className="num">{value}</b>
        {sub && <em className="num">{sub} odds</em>}
      </span>
    </div>
  );
}
