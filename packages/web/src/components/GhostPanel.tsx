import { pct, short, usd, walruscan, type Round, type Status } from '../api';

/** The ghost: what it recalled from Walrus, the habits it read from those memories, and its line. */
export function GhostPanel({ status, round }: { status: Status | null; round: Round | undefined }) {
  const memoryMissing = status?.setup.some((s) => s.includes('MEMWAL')) ?? true;
  const ghost = round?.ghost;
  return (
    <aside className="panel ghost" aria-labelledby="ghost-title">
      <div className="ghost-veil" aria-hidden />
      <header className="panel-head">
        <p className="eyebrow spectral">εἴδωλον</p>
        <h2 id="ghost-title">Your ghost</h2>
      </header>

      {memoryMissing ? (
        <div className="empty">
          <img className="empty-art" src="/art/eidolon-empty-ghost.webp" alt="" width={96} height={96} />
          <b>Setup required: Walrus Memory</b>
          <p>
            The ghost is built only from your recalled trades. Without a Walrus Memory account
            (MEMWAL_MAINNET_ACCOUNT_ID and MEMWAL_MAINNET_KEY) there is no ghost, and it never makes one up.
          </p>
        </div>
      ) : !ghost ? (
        <div className="empty">
          <img className="empty-art" src="/art/eidolon-empty-ghost.webp" alt="" width={96} height={96} />
          <b>No memories of you yet</b>
          <p>
            Your first settled round becomes the ghost’s first memory on Walrus mainnet. From the second
            round on, it bets against what it remembers.
          </p>
        </div>
      ) : (
        <>
          <p className="roast">{ghost.line ?? 'Narration off: the decision below is the deterministic policy.'}</p>
          <div className="ghost-bet">
            <span className={`side-pill side-${ghost.side}`}>{ghost.side === 'up' ? 'UP' : 'DOWN'}</span>
            <span className="num">{ghost.strike ? usd(ghost.strike) : 'strike pending'}</span>
            <span className="num">{ghost.size.toFixed(2)} USDC</span>
          </div>
          <p className="muted small">
            {ghost.exactMirror === false ? 'Nearest admissible strike · ' : ''}
            {ghost.status}
          </p>

          <h3 className="sub">Read from your memories</h3>
          <Bar label="Bets UP" value={ghost.profile.upBias} />
          <Bar label="Hit rate in this setup" value={ghost.profile.hitRate} />
          <p className="muted small num">
            {ghost.profile.matched ?? 0} of {ghost.profile.recalled} recalled trades match this setup
          </p>

          <h3 className="sub">
            Recalled <span className="count num">{ghost.recalledBlobIds.length}</span>
          </h3>
          <div className="chips">
            {ghost.recalledBlobIds.map((id) => (
              <a key={id} className="chip" href={walruscan(id)} target="_blank" rel="noreferrer">
                {short(id)}
              </a>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <span className="bar-track" aria-hidden>
        <span className="bar-fill" style={{ width: pct(value) }} />
      </span>
      <b className="num">{pct(value)}</b>
    </div>
  );
}
