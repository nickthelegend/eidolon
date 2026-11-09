/**
 * Eidolon's mark: you (a solid ember disc) and your ghost (its pale outline twin), overlapping where you meet.
 * Vector, so it stays crisp from the 16px favicon to the nav.
 */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="mark">
      <defs>
        <clipPath id="mark-you">
          <circle cx="12" cy="16" r="9" />
        </clipPath>
      </defs>
      <circle cx="12" cy="16" r="9" fill="var(--ember)" />
      <circle cx="20" cy="16" r="8.2" fill="none" stroke="var(--spectral)" strokeWidth="1.6" />
      <circle cx="20" cy="16" r="9" fill="#050505" clipPath="url(#mark-you)" opacity=".55" />
    </svg>
  );
}

export function Logo() {
  return (
    <a className="brand" href="/" aria-label="Eidolon home">
      <Mark />
      <span className="wordmark">EIDOLON</span>
    </a>
  );
}
