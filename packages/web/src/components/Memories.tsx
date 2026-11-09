import { useState } from 'react';
import { post, short, suiscan, usdc, walruscan, type HistoricalTrade, type HistoryResponse, type Status } from '../api';

type Filter = 'all' | 'wins' | 'losses' | 'up' | 'down';

/** The ghost's memory: every settled trade it learned from, each a glass tablet linked to its Walrus blob. */
export function Memories({
  owner,
  readOnly,
  history,
  historyBusy,
  historyError,
  status,
  reload,
}: {
  owner: string;
  readOnly: boolean;
  history: HistoryResponse | null;
  historyBusy: boolean;
  historyError: string;
  status: Status | null;
  reload: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const trades = history?.trades ?? [];
  const byFill = history?.memoryByFill ?? {};
  const onWalrus = trades.filter((t) => byFill[t.fillDigest]).length;
  const shown = trades.filter((t) =>
    filter === 'wins' ? t.pnl > 0 : filter === 'losses' ? t.pnl < 0 : filter === 'up' ? t.side === 'up' : filter === 'down' ? t.side === 'down' : true,
  );
  const selected = trades.find((t) => t.fillDigest === pick) ?? shown[0] ?? null;
  const missingMemory = status?.setup.find((s) => s.includes('MEMWAL_'));

  async function remember() {
    setBusy(true);
    setMsg('');
    try {
      const r = await post<{ blobIds: string[] }>(`/history/${owner}/remember`, {});
      setMsg(`Wrote ${r.blobIds.length} trade memories to Walrus mainnet.`);
      await reload();
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="memories">
      <img className="mem-ghost" src="/art/v2/eidolon2-ghost-thinking.webp" alt="" aria-hidden width={300} height={300} />
      <header className="page-head">
        <h1>The ghost remembers</h1>
        <p>Every trade you make becomes a memory it learns from. Stored on Walrus.</p>
      </header>

      {!history ? (
        <div className="empty">
          {historyBusy ? <span className="spin" aria-hidden /> : <img className="empty-art" src="/art/v2/eidolon2-memory-vault.webp" alt="" width={120} height={120} />}
          <b>{historyBusy ? `Reading ${short(owner)}’s trades from Sui mainnet…` : historyError || 'No history loaded'}</b>
          {!historyBusy && <button className="callit" onClick={reload}>Read my Predict history</button>}
        </div>
      ) : trades.length === 0 ? (
        <div className="empty">
          <img className="empty-art" src="/art/v2/eidolon2-empty.webp" alt="" width={120} height={120} />
          <b>No settled trades found</b>
          <p>No complete Predict trade with fill and payout events in the history this RPC can reach.</p>
        </div>
      ) : (
        <>
          <div className="mem-bar">
            <div className="filters" role="radiogroup" aria-label="Filter memories">
              {(
                [
                  ['all', 'All'],
                  ['wins', 'Wins'],
                  ['losses', 'Losses'],
                  ['up', 'Higher'],
                  ['down', 'Lower'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <span className="muted small num">
              {onWalrus} of {trades.length} on Walrus
            </span>
            {onWalrus < trades.length && (
              <button className="callit small-btn" disabled={busy || Boolean(missingMemory)} onClick={remember}>
                {busy ? (
                  <>
                    <span className="spin" aria-hidden /> Writing to Walrus…
                  </>
                ) : missingMemory ? (
                  missingMemory
                ) : readOnly ? (
                  'Remember this trader on Walrus'
                ) : (
                  'Teach my ghost (write to Walrus)'
                )}
              </button>
            )}
          </div>
          {msg && (
            <p className="msg" role="status">
              {msg}
            </p>
          )}
          <div className="mem-layout">
            <ol className="tablets">
              {shown.map((t, i) => (
                <li key={t.fillDigest} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                  <button className={`tablet ${t.pnl > 0 ? 'win' : 'loss'} ${selected?.fillDigest === t.fillDigest ? 'on' : ''}`} onClick={() => setPick(t.fillDigest)}>
                    <span className={`pill pill-${t.side}`}>{t.side === 'up' ? 'Higher' : 'Lower'}</span>
                    <span className="num t-strike">${t.strike.toLocaleString('en-US')}</span>
                    <b className={`num ${t.pnl > 0 ? 'up' : 'down'}`}>{usdc(t.pnl)}</b>
                    <small className="num">{new Date(t.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                    <small className="num t-blob">{byFill[t.fillDigest] ? `blob ${short(byFill[t.fillDigest])}` : 'not on Walrus yet'}</small>
                  </button>
                </li>
              ))}
            </ol>
            {selected && <Detail t={selected} blob={byFill[selected.fillDigest]} lesson={lesson(selected, trades)} />}
          </div>
        </>
      )}
    </section>
  );
}

function Detail({ t, blob, lesson }: { t: HistoricalTrade; blob?: string; lesson: string }) {
  return (
    <aside className="card glass mem-detail" aria-label="Selected memory">
      <header>
        <span className={`pill pill-${t.side}`}>{t.side === 'up' ? 'Higher' : 'Lower'}</span>
        <b className={`num ${t.pnl > 0 ? 'up' : 'down'}`}>{usdc(t.pnl)} USDC</b>
      </header>
      <dl>
        <div>
          <dt>Date</dt>
          <dd className="num">{new Date(t.createdAt).toLocaleString('en-GB')}</dd>
        </div>
        <div>
          <dt>Strike</dt>
          <dd className="num">${t.strike.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Stake</dt>
          <dd className="num">{t.size.toFixed(2)} USDC</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd className={t.hit ? 'up' : 'down'}>{t.hit ? 'Hit' : 'Missed'}</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd className="num">{blob ? `blob ${short(blob)}` : 'chain only'}</dd>
        </div>
      </dl>
      <p className="lesson">
        <img src="/art/v2/eidolon2-ghost-thinking.webp" alt="" width={36} height={36} />
        <span>
          <small>The ghost learned</small>
          {lesson}
        </span>
      </p>
      <div className="mem-actions">
        {blob && (
          <a className="ghost-btn" href={walruscan(blob)} target="_blank" rel="noreferrer">
            Open on Walrus
          </a>
        )}
        <a className="ghost-btn" href={suiscan(t.fillDigest)} target="_blank" rel="noreferrer">
          Fill on SuiScan
        </a>
        <a className="ghost-btn" href={suiscan(t.payoutDigest)} target="_blank" rel="noreferrer">
          Payout
        </a>
      </div>
    </aside>
  );
}

/** One plain sentence on what this trade taught the ghost, using only this trade and the rest of the history. */
function lesson(t: HistoricalTrade, all: HistoricalTrade[]) {
  const sameSide = all.filter((x) => x.side === t.side);
  const hits = sameSide.filter((x) => x.pnl > 0).length;
  const avg = all.reduce((n, x) => n + x.size, 0) / all.length;
  const side = t.side === 'up' ? 'Higher' : 'Lower';
  const sizeNote = t.size > avg * 1.25 ? ` at ${t.size.toFixed(2)} USDC, well above your ${avg.toFixed(2)} average` : '';
  return `${t.pnl > 0 ? 'A win' : 'A loss'} on ${side}${sizeNote}. You call ${side} in ${sameSide.length} of ${all.length} trades and it pays ${hits} of ${sameSide.length} times, so the ghost leans ${t.side === 'up' ? 'Lower' : 'Higher'} against you.`;
}
