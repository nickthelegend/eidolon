import { useEffect, useRef, useState } from 'react';
import { usd, type GhostPreview, type PriceSample, type Side } from '../api';

type Line = { value: number; kind: 'you' | 'ghost' | 'hint'; label: string; side: Side };

/** Monotone cubic (Fritsch–Carlson): smooth between samples without overshooting past any real price. */
function smooth(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return '';
  const dx = (i: number) => pts[i + 1][0] - pts[i][0];
  const sl = pts.slice(0, -1).map((p, i) => (pts[i + 1][1] - p[1]) / (dx(i) || 1));
  const m = pts.map((_, i) => (i === 0 ? sl[0] : i === n - 1 ? sl[n - 2] : sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / sl[i], b = m[i + 1] / sl[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * sl[i]; m[i + 1] = t * b * sl[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx(i) / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + m[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - m[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function niceStep(span: number) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => span / s <= 5) ?? 2000;
}

const hms = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * BTC on DeepBook Predict, as the server sampled its forward, running up to the market's close.
 * Your strike, the ghost's strike and the dead zone between them sit on the same axis.
 */
export function LiveChart({
  samples,
  now,
  expiryMs,
  side,
  strike,
  suggested,
  ghost,
}: {
  samples: PriceSample[];
  now: number;
  expiryMs: number | null;
  side: Side;
  strike: number | null;
  suggested: number | null;
  ghost: GhostPreview | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = w < 560;
  const h = narrow ? 220 : 270;
  const padR = narrow ? 64 : 84;
  const padB = 28;
  const padT = 18;

  const lines: Line[] = [];
  if (strike != null) lines.push({ value: strike, kind: 'you', side, label: `You · ${side === 'up' ? 'above' : 'below'}` });
  if (ghost) lines.push({ value: ghost.strike, kind: 'ghost', side: ghost.side, label: `Ghost · ${ghost.side === 'up' ? 'above' : 'below'}` });
  if (strike == null && suggested != null) lines.push({ value: suggested, kind: 'hint', side, label: `Suggested · ${side === 'up' ? 'above' : 'below'}` });

  const lastAt = samples.at(-1)?.at ?? now;
  const end = expiryMs && expiryMs > now ? Math.max(expiryMs, now + 5_000) : now + 10_000;
  // Keep the future (up to the close) to about a third of the width; the rest is the price so far.
  const start = Math.min(now - (narrow ? 4 : 8) * 60_000, now - (end - now) * 2);
  const shown = samples.filter((s) => s.at >= start - 30_000);
  const tail = shown.at(-1);
  // The last sample holds until the next one lands; the dot sits at "now".
  const series = tail ? [...shown, { at: Math.max(lastAt, Math.min(now, tail.at + 15_000)), forward: tail.forward }] : [];

  const values = [...series.map((s) => s.forward), ...lines.map((l) => l.value)];
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = Math.max(6, (hi - lo) * 0.18);
  const min = lo - pad;
  const max = hi + pad;
  const x = (t: number) => ((t - start) / (end - start)) * (w - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (h - padT - padB);

  const pts = series.map((s) => [x(s.at), y(s.forward)] as [number, number]);
  const path = smooth(pts);
  const area = pts.length > 1 ? `${path} L${pts.at(-1)![0].toFixed(1)},${h - padB} L${pts[0][0].toFixed(1)},${h - padB} Z` : '';
  const step = niceStep(max - min);
  const yTicks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) yTicks.push(v);
  const xStep = (end - start) / (narrow ? 3 : 6);
  const xTicks = Array.from({ length: narrow ? 3 : 6 }, (_, i) => start + xStep * (i + 0.5));

  const you = lines.find((l) => l.kind === 'you');
  const gh = lines.find((l) => l.kind === 'ghost');
  const dead = you && gh && !ghost?.exact ? [Math.min(you.value, gh.value), Math.max(you.value, gh.value)] : null;
  const dot = pts.at(-1);
  const closeX = expiryMs && expiryMs > start ? x(expiryMs) : null;

  return (
    <div className="chart" ref={wrap}>
      {series.length < 2 ? (
        <div className="chart-wait" style={{ height: h }}>
          <span className="spin" aria-hidden /> Collecting live BTC prices from DeepBook Predict…
        </div>
      ) : (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`BTC forward ${usd(tail?.forward, 2)}${you ? `, your strike ${usd(you.value)}` : ''}${gh ? `, ghost strike ${usd(gh.value)}` : ''}`}>
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--ember)" stopOpacity=".22" />
              <stop offset="1" stopColor="var(--ember)" stopOpacity="0" />
            </linearGradient>
            <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="rgba(255,92,122,.07)" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,92,122,.35)" strokeWidth="1.4" />
            </pattern>
          </defs>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={0} x2={w - padR} y1={y(v)} y2={y(v)} className="grid" />
              <text x={w - padR + 10} y={y(v) + 4} className="axis">{usd(v)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={h - 8} className="axis" textAnchor="middle">{hms(t)}</text>
          ))}
          {you && (
            <rect
              className="win-you"
              x={0}
              width={w - padR}
              y={you.side === 'up' ? padT : y(you.value)}
              height={you.side === 'up' ? Math.max(0, y(you.value) - padT) : Math.max(0, h - padB - y(you.value))}
            />
          )}
          {dead && <rect x={0} width={w - padR} y={y(dead[1])} height={Math.max(2, y(dead[0]) - y(dead[1]))} fill="url(#hatch)" />}
          {dead && y(dead[0]) - y(dead[1]) > 14 && (
            <g className="strike strike-dead">
              <Chip x={(w - padR) / 2 + 60} y={(y(dead[0]) + y(dead[1])) / 2} text="DEAD ZONE · both lose" />
            </g>
          )}
          {closeX != null && (
            <g className="close-line">
              <line x1={closeX} x2={closeX} y1={padT} y2={h - padB} />
              <text x={closeX - 6} y={padT + 10} textAnchor="end">close</text>
            </g>
          )}
          {area && <path d={area} fill="url(#area)" />}
          <path d={path} className="price-line" pathLength={1} />
          {lines.map((l) => (
            <g key={l.kind} className={`strike strike-${l.kind}`}>
              <line x1={0} x2={w - padR} y1={y(l.value)} y2={y(l.value)} />
              <Chip
                x={w - padR - 12}
                y={y(l.value) + (l.kind === 'ghost' && you && you.value > l.value ? 14 : l.kind === 'you' && gh && gh.value > l.value ? 14 : -14)}
                text={`${l.kind === 'you' ? 'YOU' : l.kind === 'ghost' ? 'GHOST' : 'SUGGESTED'} · ${l.side === 'up' ? 'HIGHER above' : 'LOWER below'} ${usd(l.value)}`}
              />
            </g>
          ))}
          {dot && (
            <g>
              <circle cx={dot[0]} cy={dot[1]} r={9} className="dot-pulse" />
              <circle cx={dot[0]} cy={dot[1]} r={4} className="dot" />
              <g transform={`translate(${w - padR + 4},${dot[1] - 11})`}>
                <rect width={padR - 6} height={22} rx={5} className="tag" />
                <text x={(padR - 6) / 2} y={15} textAnchor="middle" className="tag-text">{usd(tail?.forward, narrow ? 0 : 2)}</text>
              </g>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

/** A small label chip, right-aligned at x, vertically centred on y. */
function Chip({ x, y, text }: { x: number; y: number; text: string }) {
  const width = text.length * 6.9 + 18;
  return (
    <g className="chip-g" transform={`translate(${Math.max(4, x - width)},${y - 11})`}>
      <rect width={width} height={22} rx={6} />
      <text x={9} y={15}>{text}</text>
    </g>
  );
}
