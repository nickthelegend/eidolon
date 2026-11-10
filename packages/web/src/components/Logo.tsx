/**
 * Eidolon's mark: you (a solid ember disc) and your ghost (its pale outline twin), overlapping where you meet.
 * Vector, so it stays crisp from the 16px favicon to the nav.
 */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="mark">
      <rect width="32" height="32" rx="9" fill="#0c0a09" />
      <clipPath id="mark-you">
        <circle cx="12.5" cy="16" r="7.5" />
      </clipPath>
      <circle cx="12.5" cy="16" r="7.5" fill="#ff7a3d" />
      <circle cx="19.5" cy="16" r="6.8" fill="none" stroke="#d9f99d" strokeWidth="1.5" />
      <circle cx="19.5" cy="16" r="7.5" fill="#0c0a09" clipPath="url(#mark-you)" opacity=".5" />
    </svg>
  );
}

export function Logo() {
  return (
    <a className="wordmark" href="#/home" aria-label="Eidolon home">
      <Mark size={30} />
      <b>Eidolon</b>
    </a>
  );
}
