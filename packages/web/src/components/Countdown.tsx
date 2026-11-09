/** Time left to expiry as a ring that drains over the cadence (1 or 5 minutes). */
export function Countdown({ expiryMs, cadence, now }: { expiryMs: number; cadence: 1 | 5; now: number }) {
  const total = cadence * 60_000;
  const left = Math.max(0, expiryMs - now);
  const frac = Math.min(1, left / total);
  const r = 22;
  const c = 2 * Math.PI * r;
  const s = Math.floor(left / 1000);
  const label = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
  return (
    <svg className="ring" viewBox="0 0 56 56" role="img" aria-label={`${s} seconds to expiry`}>
      <circle cx="28" cy="28" r={r} className="ring-track" />
      <circle
        cx="28"
        cy="28"
        r={r}
        className={`ring-fill${s <= 10 ? ' ring-late' : ''}`}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle" className="ring-text">
        {label}
      </text>
    </svg>
  );
}
