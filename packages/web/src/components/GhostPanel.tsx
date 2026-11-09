import { pct, short, usd, walruscan, type HistoryResponse, type Plan, type Round, type Side, type Status } from '../api';

/** The ghost: what it recalled from Walrus, the habits it read from those memories, and its line. */
export function GhostPanel({
  status,
  round,
  history,
  side,
  preview,
}: {
  status: Status | null;
  round: Round | undefined;
  history?: HistoryResponse | null;
  side?: Side;
  preview?: Plan | null;
}) {
  const memoryMissing = status?.setup.some((s) => s.includes('MEMWAL')) ?? true;
  const ghost = round?.ghost;
  const chainGhost = memoryMissing && history?.decision && history.trades.length ? history : null;
  return (
    <aside className="panel ghost" aria-labelledby="ghost-title">
      <div className="ghost-veil" aria-hidden />
      <header className="panel-head">
        <p className="eyebrow spectral">εἴδωλον</p>
        <h2 id="ghost-title">Your ghost</h2>
      </header>

      {chainGhost ? (
        <ChainGhost history={chainGhost} side={side ?? 'up'} preview={preview ?? null} />
      ) : memoryMissing ? (
        <div className="empty">
          <img className="empty-art" src="/art/eidolon-empty-ghost.webp" alt="" width={96} height={96} />
          <b>Setup required: Walrus Memory</b>
          <p>
            The ghost is built only from your recalled trades. Without a Walrus Memory account
            (MEMWAL_MAINNET_ACCOUNT_ID and MEMWAL_MAINNET_KEY) there is no ghost, and it never makes one up.
          </p>
          <p className="muted small">It can also start from chain: read a Predict history in the panel below.</p>
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

function ChainGhost({ history, side, preview }: { history: HistoryResponse; side: Side; preview: Plan | null }) {
  const decision = history.decision!;
  const placed = preview?.ghostPreview && preview.ghostPreview.side === decision.side ? preview.ghostPreview : null;
  return (
    <>
      <p className="roast">
        I read your last {history.trades.length} settled trades: {pct(history.profile.upBias)} UP, {pct(history.profile.hitRate)}{' '}
        hit rate. I always take the other side, so against your {side.toUpperCase()} I go {decision.side.toUpperCase()} with{' '}
        {decision.size.toFixed(2)} USDC{history.profile.hitRate < 0.5 ? ', sized up because you lose more than you win.' : ', your own average size.'}
      </p>
      <div className="ghost-bet">
        <span className={`side-pill side-${decision.side}`}>{decision.side === 'up' ? 'UP' : 'DOWN'}</span>
        {placed ? <span className="num">{usd(placed.strike)}</span> : <span className="muted small">strike after your quote</span>}
        <span className="num">{decision.size.toFixed(2)} USDC</span>
      </div>
      <p className="muted small">
        {placed
          ? `${placed.exact ? 'Mirror strike' : 'Nearest strike Predict admits'} · ${pct(placed.probability)} odds`
          : 'Quote a bet in the arena and the ghost places its counter-strike.'}
      </p>

      <h3 className="sub">Read from your chain history</h3>
      <Bar label="Bets UP" value={history.profile.upBias} />
      <Bar label="Hit rate" value={history.profile.hitRate} />
      <p className="muted small num">Average size {history.profile.averageSize.toFixed(2)} USDC · deterministic policy, no model</p>

      <p className="ghost-note small">
        <b>Not on Walrus yet.</b> This ghost comes from Sui mainnet events. With Walrus Memory set up it remembers
        every new round and starts recalling them.
      </p>
    </>
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
