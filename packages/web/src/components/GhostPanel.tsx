import { pct, short, usd, walruscan, type HistoryResponse, type Plan, type Round, type Side, type Status } from '../api';

/** The ghost card: what it recalled from Walrus, the habits it read, and the bet it will place against you. */
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
  const lost = !memoryMissing && (ghost?.leg?.pnl ?? 0) < 0;
  const mood = historyBusy || status == null ? 'thinking' : lost ? 'cracked' : awake ? 'smug' : 'idle';
  return (
    <section className={`card ghost-card ${awake ? 'awake' : ''}`} id="ghost" aria-labelledby="ghost-title">
      <img key={mood} className="ghost-mask" src={`/art/v2/eidolon2-ghost-${mood}.webp`} alt="" width={160} height={160} aria-hidden />
      <h2 id="ghost-title">Your ghost</h2>
      <p className="ghost-sub">Built from your trades. Always takes the other side.</p>

      {status == null || (historyBusy && !chainGhost) ? (
        <div className="ghost-skel" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      ) : chainGhost ? (
        <ChainGhost history={chainGhost} side={side ?? 'up'} preview={preview ?? null} />
      ) : memoryMissing ? (
        <div className="ghost-empty">
          <b>Setup required: Walrus Memory</b>
          <p>
            The ghost is built only from your recalled trades. Without <code>MEMWAL_MAINNET_ACCOUNT_ID</code> and{' '}
            <code>MEMWAL_MAINNET_KEY</code> there is no memory, and it never makes one up.
          </p>
          <a className="text-link" href="#history">Start it from your chain history →</a>
        </div>
      ) : !ghost ? (
        <div className="ghost-empty">
          <p>
            It hasn’t met you yet. Read your Predict history below and it learns your habits, or play a round and
            that round becomes its first memory on Walrus.
          </p>
          <a className="text-link" href="#history">Read my history →</a>
        </div>
      ) : (
        <>
          <p className="ghost-line">{ghost.line ?? 'Narration off: the bet below is the deterministic policy.'}</p>
          <BetRow side={ghost.side} strike={ghost.strike ? usd(ghost.strike) : 'pending'} stake={ghost.size} />
          <p className="fine">
            {ghost.exactMirror === false ? 'Nearest strike Predict admits · ' : ''}
            {ghost.status}
          </p>
          <Bar label="Bets UP" value={ghost.profile.upBias} />
          <Bar label="Hit rate here" value={ghost.profile.hitRate} />
          <p className="fine num">
            {ghost.profile.matched ?? 0} of {ghost.profile.recalled} recalled trades match this setup
          </p>
          <Blobs ids={ghost.recalledBlobIds} />
        </>
      )}
    </section>
  );
}

function ChainGhost({ history, side, preview }: { history: HistoryResponse; side: Side; preview: Plan | null }) {
  const decision = history.decision!;
  const blobs = history.blobIds ?? [];
  const fromWalrus = history.source.startsWith('Walrus') && blobs.length > 0;
  const placed = preview?.ghostPreview && preview.ghostPreview.side === decision.side ? preview.ghostPreview : null;
  return (
    <>
      <p className="ghost-line">
        “{fromWalrus ? `I recalled ${blobs.length} of your trades from Walrus` : `I read your last ${history.trades.length} settled trades`}. You bet UP{' '}
        {pct(history.profile.upBias)} of the time and hit {pct(history.profile.hitRate)}. Against your {side.toUpperCase()}, I go{' '}
        {decision.side.toUpperCase()}
        {history.profile.hitRate < 0.5 ? ', sized up because you lose more than you win.”' : ' with your own average size.”'}
      </p>
      <BetRow side={decision.side} strike={placed ? usd(placed.strike) : null} stake={decision.size} />
      <p className="fine">
        {placed
          ? `${placed.exact ? 'Mirror strike' : 'Nearest strike Predict admits'} · ${pct(placed.probability)} odds`
          : 'Quote a bet and the ghost places its counter-strike.'}
      </p>
      <Bar label="Bets UP" value={history.profile.upBias} />
      <Bar label="Hit rate" value={history.profile.hitRate} />
      {fromWalrus ? (
        <Blobs ids={blobs} />
      ) : (
        <p className="fine">
          {history.memoryError
            ? `Walrus recall failed: ${history.memoryError}`
            : 'Read from Sui mainnet events. Teach your ghost below and it recalls these trades from Walrus instead.'}
        </p>
      )}
    </>
  );
}

function BetRow({ side, strike, stake }: { side: Side; strike: string | null; stake: number }) {
  return (
    <div className="ghost-bet">
      <span className={`pill pill-${side}`}>{side === 'up' ? '↑ Higher' : '↓ Lower'}</span>
      <span>
        <small>Strike</small>
        {strike ? <b className="num">{strike}</b> : <b className="pending">after your quote</b>}
      </span>
      <span>
        <small>Stake</small>
        <b className="num">
          {stake.toFixed(2)} <i>USDC</i>
        </b>
      </span>
    </div>
  );
}

function Blobs({ ids }: { ids: string[] }) {
  return (
    <div className="blobs">
      <p className="blobs-head">
        <img src="/art/v2/eidolon2-memory-shards.webp" alt="" width={28} height={28} />
        <span>
          <b className="num">{ids.length}</b> memories on Walrus mainnet
        </span>
      </p>
      <div className="chips">
        {ids.slice(0, 6).map((id) => (
          <a key={id} className="chip" href={walruscan(id)} target="_blank" rel="noreferrer">
            {short(id)}
          </a>
        ))}
        {ids.length > 6 && <span className="chip chip-more">+{ids.length - 6}</span>}
      </div>
    </div>
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
