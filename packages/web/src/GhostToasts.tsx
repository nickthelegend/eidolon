import { useEffect, useRef, useState } from 'react';
import { usd, type GhostFeed, type GhostTrade, type Round } from './api';
import { Icon, go } from './ui';

type Toast = { key: string; title: string; body?: string; tone: 'think' | 'act' | 'won' | 'lost'; id: string };
const sideWord = (t: GhostTrade) => (t.side === 'up' ? 'Up' : 'Down');

/** What the ghost just did, as a notification: analysing → placed (or priced) → won / would have won. */
function phase(t: GhostTrade): Toast | null {
  if (t.won != null)
    return { key: `${t.id}:done`, id: t.id, tone: t.won ? 'won' : 'lost', title: `Ghost ${t.status}`, body: t.recap ?? `${sideWord(t)} at ${usd(t.strike)}, BTC closed at ${usd(t.settlement, 2)}.` };
  if (t.leg?.digest) return { key: `${t.id}:placed`, id: t.id, tone: 'act', title: `Ghost placed ${sideWord(t)} at ${usd(t.strike)}`, body: t.commentary };
  if (t.commentary) return { key: `${t.id}:explained`, id: t.id, tone: 'act', title: `Ghost bets ${sideWord(t)} at ${usd(t.strike)}`, body: t.commentary };
  if (t.status === 'thinking') return { key: `${t.id}:think`, id: t.id, tone: 'think', title: 'Ghost is analyzing…', body: t.steps.at(-1)?.detail };
  return null;
}

function duel(r: Round): Toast | null {
  const g = r.ghost;
  if (!g) return null;
  const s = g.side === 'up' ? 'Up' : 'Down';
  if (g.leg?.digest) return { key: `${r.digest}:answered`, id: r.digest, tone: 'act', title: `Ghost answered: ${s} at ${usd(g.strike)}`, body: g.line };
  return { key: `${r.digest}:${g.status}`, id: r.digest, tone: 'think', title: `Ghost is answering your ${r.side === 'up' ? 'Up' : 'Down'}…`, body: g.status };
}

/** Notifications for the ghost's own rounds. Only changes seen while the page is open notify; nothing is generated here. */
export function GhostToasts({ feed, rounds }: { feed: GhostFeed | null; rounds: Round[] }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!feed) return;
    const now = [...feed.trades.slice(0, 3).map(phase), ...rounds.slice(-2).map(duel)].filter((x): x is Toast => Boolean(x));
    if (!seen.current) {
      // First load: remember what is already there, so old rounds don't pop up.
      seen.current = new Set(now.map((x) => x.key));
      return;
    }
    const fresh = now.filter((x) => !seen.current!.has(x.key));
    for (const x of fresh) seen.current.add(x.key);
    if (fresh.length) setToasts((ts) => [...fresh.reverse(), ...ts.filter((t) => !fresh.some((f) => f.id === t.id))].slice(0, 3));
  }, [feed, rounds]);
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((ts) => ts.slice(0, -1)), 12_000);
    return () => clearTimeout(timer);
  }, [toasts]);
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite" data-film="ghost-toasts">
      {toasts.map((t) => (
        <button key={t.key} className={`toast toast-${t.tone}`} onClick={() => go(`/round/${t.id}`)} data-film="ghost-toast">
          <img src="/art/v2/eidolon2-ghost-smug.webp" alt="" aria-hidden />
          <span>
            <b>
              {t.tone === 'think' && <i className="spin" aria-hidden />}
              {t.title}
            </b>
            {t.body && <small>{t.body}</small>}
          </span>
          <Icon name="arrow" size={14} />
        </button>
      ))}
    </div>
  );
}
