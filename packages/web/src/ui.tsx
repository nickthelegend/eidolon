import { useEffect, useState, type ReactNode } from 'react';
import { short, suiscan, walruscan, type Side } from './api';

/* ---------- routing (hash, so the static build needs no server rewrites) ---------- */
export type Route =
  | { page: 'home' }
  | { page: 'trade'; tab: Tab }
  | { page: 'round'; id: string }
  | { page: 'leaderboard' };
export type Tab = 'ghost' | 'rounds' | 'memories' | 'habits';
const TABS: Tab[] = ['ghost', 'rounds', 'memories', 'habits'];

export function parseRoute(hasAddress: boolean): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  const [a, b] = h.split('/');
  if (a === 'trade') return { page: 'trade', tab: TABS.includes(b as Tab) ? (b as Tab) : 'ghost' };
  if (a === 'round' && b) return { page: 'round', id: h.slice('round/'.length) };
  if (a === 'leaderboard') return { page: 'leaderboard' };
  if (a === 'home') return { page: 'home' };
  // Older links: #/arena, #/ghost, #/memories.
  if (a === 'arena') return { page: 'trade', tab: 'ghost' };
  if (a === 'ghost') return { page: 'trade', tab: 'ghost' };
  if (a === 'memories') return { page: 'trade', tab: 'memories' };
  return hasAddress && !a ? { page: 'trade', tab: 'ghost' } : { page: 'home' };
}
export const go = (hash: string) => {
  window.location.hash = hash;
};
/** Switch the bottom tab without a history entry or a scroll jump. */
export function setTab(tab: Tab) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/trade/${tab}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/* ---------- icons ---------- */
const paths: Record<string, string> = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  memory: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  ghost: 'M6 20V10a6 6 0 0 1 12 0v10l-3-2-3 2-3-2-3 2zM9.5 10.5h.01M14.5 10.5h.01',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  wallet: 'M4 7a2 2 0 0 1 2-2h12v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14h.01',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  play: 'M7 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

/** A BTC disc, drawn inline so it needs no asset. */
export function Btc({ size = 28 }: { size?: number }) {
  return (
    <svg className="btc" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#f7931a" />
      <path fill="#fff" d="M22.2 14c.3-2-1.2-3-3.3-3.8l.7-2.7-1.6-.4-.7 2.6-1.3-.3.7-2.7-1.7-.4-.6 2.7-1-.3-2.3-.6-.4 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1v.1l-1.1 4.3c-.1.2-.3.5-.8.4l-1.2-.3-.8 1.9 2.2.5 1.2.3-.7 2.8 1.7.4.7-2.7 1.3.3-.7 2.7 1.7.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2-.03-3.2-1.5-3.9 1.1-.3 1.9-1 2.1-2.4zm-3.8 5.3c-.5 2-3.9.9-5 .6l.9-3.5c1.1.3 4.6.8 4.1 2.9zm.5-5.4c-.5 1.8-3.3.9-4.2.7l.8-3.2c.9.2 3.9.6 3.4 2.5z" />
    </svg>
  );
}

/* ---------- values ---------- */
export const sideWord = (s: Side) => (s === 'up' ? 'Up' : 'Down');
export function SidePill({ side, children }: { side: Side; children?: ReactNode }) {
  return (
    <span className={`spill spill-${side}`}>
      <Icon name={side} size={12} />
      {children ?? sideWord(side)}
    </span>
  );
}
export function Tx({ digest, label }: { digest: string; label?: string }) {
  return (
    <a className="tx" href={suiscan(digest)} target="_blank" rel="noreferrer">
      {label ?? short(digest)}
      <Icon name="external" size={12} />
    </a>
  );
}
export function Blob({ id, label }: { id: string; label?: string }) {
  return (
    <a className="tx blob" href={walruscan(id)} target="_blank" rel="noreferrer" title={`Walrus blob ${id}`}>
      {label ?? short(id)}
      <Icon name="external" size={12} />
    </a>
  );
}

export function State({ kind, title, children, action }: { kind: 'loading' | 'empty' | 'error' | 'setup'; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`state state-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="state-mark" aria-hidden="true">
        {kind === 'loading' ? <i className="pulse" /> : kind === 'error' ? '!' : kind === 'setup' ? <Icon name="lock" size={16} /> : <Icon name="eye" size={16} />}
      </span>
      <div>
        <h3>{title}</h3>
        {children && <p>{children}</p>}
        {action}
      </div>
    </div>
  );
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
