import { pct, short, usd, walruscan, type HistoryResponse, type Plan, type Round, type Side, type Status } from '../api';

/** The ghost: what it recalled from Walrus, the habits it read from those memories, and its line. */
export function GhostPanel({
  status,
  round,
  history,
  historyBusy,
  side,
  preview,
}: {
  status: Status | null;
  round: Round | undefined;
  history?: HistoryResponse | null;
  historyBusy?: boolean;
  side?: Side;
  preview?: Plan | null;
}) {
  const memoryMissing = status?.setup.some((s) => s.includes('MEMWAL')) ?? true;
  const ghost = round?.ghost;
  // Before any round of your own, the ghost comes from history: recalled from Walrus when memory is set up, else read from chain.
  const chainGhost = (memoryMissing || !ghost) && history?.decision && history.trades.length ? history : null;
  const awake = Boolean(chainGhost || (!memoryMissing && ghost));
  // Mood follows real state only: reading history, holding a counter-bet, or empty / lost its last round.
  const lost = !memoryMissing && (ghost?.leg?.pnl ?? 0) < 0;
  const mood = historyBusy || status == null ? 'thinking' : lost || !awake ? 'defeated' : 'confident';
  return (
    <aside className={`panel ghost ${awake ? 'awake' : ''} mood-${mood}`} aria-labelledby="ghost-title">
      <div className="ghost-veil" aria-hidden />
      <img key={mood} className="ghost-figure" src={`/art/eidolon-ghost-${mood}.webp`} alt="" width={768} height={768} aria-hidden />
      <header className="panel-head stack with-bust">
        <img className="bust bust-ghost" src="/art/eidolon-ghost-bust.webp" alt="" width={48} height={48} />
        <div>
          <p className="eyebrow spectral">
            <span lang="grc">εἴδωλον</span> · always the other side
          </p>
          <h2 id="ghost-title">Your ghost</h2>
        </div>
      </header>

      {status == null ? (
        <div className="ghost-skel" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      ) : chainGhost ? (
        <ChainGhost history={chainGhost} side={side ?? 'up'} preview={preview ?? null} />
      ) : memoryMissing ? (
        <div className="empty">
          <img className="empty-art empty-art-sm float" src="/art/eidolon-memory-crystal.webp" alt="" width={56} height={56} />
          <b>Setup required: Walrus Memory</b>
          <p>
            The ghost is built only from your recalled trades. Without a Walrus Memory account
            (<code>MEMWAL_MAINNET_ACCOUNT_ID</code> and <code>MEMWAL_MAINNET_KEY</code>) there is no memory, and it
            never makes one up.
          </p>
          <p className="ghost-hint">
            It can also start from chain: read a Predict history in <a href="#history-title">Your trading history</a>.
          </p>
        </div>
      ) : !ghost ? (
        <div className="empty">
          <img className="empty-art empty-art-sm" src="/art/eidolon-empty-ghost.webp" alt="" width={56} height={56} />
          <b>No memories of you yet</b>
          <p>
            Your first settled round becomes the ghost’s first memory on Walrus mainnet. From the second
            round on, it bets against what it remembers.
          </p>
        </div>
      ) : (
        <>
          <blockquote className="roast">{ghost.line ?? 'Narration off: the decision below is the deterministic policy.'}</blockquote>
          <div className="ghost-bet">
            <span className={`side-pill side-${ghost.side}`}>{ghost.side === 'up' ? 'UP' : 'DOWN'}</span>
            <span className="gb-cell">
              <small>Strike</small>
              <b className="num">{ghost.strike ? usd(ghost.strike) : 'pending'}</b>
            </span>
            <span className="gb-cell">
              <small>Stake</small>
              <b className="num">
                {ghost.size.toFixed(2)} <i>USDC</i>
              </b>
            </span>
          </div>
          <p className="fine">
            {ghost.exactMirror === false ? 'Nearest admissible strike · ' : ''}
            {ghost.status}
          </p>

          <h3 className="sub">Read from your memories</h3>
          <Bar label="Bets UP" value={ghost.profile.upBias} />
          <Bar label="Hit rate in this setup" value={ghost.profile.hitRate} />
          <p className="fine num">
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
  const blobs = history.blobIds ?? [];
  const fromWalrus = history.source.startsWith('Walrus') && blobs.length > 0;
  const placed = preview?.ghostPreview && preview.ghostPreview.side === decision.side ? preview.ghostPreview : null;
  return (
    <>
      <blockquote className="roast">
        {fromWalrus ? `I recalled ${blobs.length} of your trades from Walrus Memory` : `I read your last ${history.trades.length} settled trades`}: {pct(history.profile.upBias)} UP, {pct(history.profile.hitRate)}{' '}
        hit rate. I always take the other side, so against your {side.toUpperCase()} I go {decision.side.toUpperCase()} with{' '}
        {decision.size.toFixed(2)} USDC{history.profile.hitRate < 0.5 ? ', sized up because you lose more than you win.' : ', your own average size.'}
      </blockquote>
      <div className="ghost-bet">
        <span className={`side-pill side-${decision.side}`}>{decision.side === 'up' ? 'UP' : 'DOWN'}</span>
        <span className="gb-cell">
          <small>Strike</small>
          {placed ? <b className="num">{usd(placed.strike)}</b> : <b className="pending">after your quote</b>}
        </span>
        <span className="gb-cell">
          <small>Stake</small>
          <b className="num">
            {decision.size.toFixed(2)} <i>USDC</i>
          </b>
        </span>
      </div>
      <p className="fine">
        {placed
          ? `${placed.exact ? 'Mirror strike' : 'Nearest strike Predict admits'} · ${pct(placed.probability)} odds`
          : 'Quote a bet in the arena and the ghost places its counter-strike.'}
      </p>

      <h3 className="sub">{fromWalrus ? 'Read from your Walrus memories' : 'Read from your chain history'}</h3>
      <Bar label="Bets UP" value={history.profile.upBias} />
      <Bar label="Hit rate" value={history.profile.hitRate} />
      <p className="fine num">Average size {history.profile.averageSize.toFixed(2)} USDC · deterministic policy, no model</p>

      {fromWalrus ? (
        <>
          <h3 className="sub">
            Recalled from Walrus mainnet <span className="count num">{blobs.length}</span>
          </h3>
          <div className="chips">
            {blobs.slice(0, 8).map((id) => (
              <a key={id} className="chip" href={walruscan(id)} target="_blank" rel="noreferrer">
                {short(id)}
              </a>
            ))}
            {blobs.length > 8 && <span className="chip">+{blobs.length - 8} more</span>}
          </div>
        </>
      ) : (
        <p className="ghost-note">
          <img className="float" src="/art/eidolon-memory-crystal.webp" alt="" width={40} height={40} />
          <span>
            <b>Not on Walrus yet.</b>{' '}
            {history.memoryError
              ? `Walrus recall failed: ${history.memoryError}`
              : 'This ghost comes from Sui mainnet events. Remember these trades on Walrus and it recalls them from there.'}
          </span>
        </p>
      )}
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
