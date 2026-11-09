import { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { DEMO_WALLET_NAME } from './demoWallet';
import { api, avatarFor, post, short, type GhostFeed, type HistoryResponse, type Market, type PriceSample, type Round, type Status } from './api';
import { Logo, Mark } from './components/Logo';
import { Arena } from './components/Arena';
import { GhostView } from './components/GhostView';
import { Memories } from './components/Memories';
import { Board } from './components/Board';
import { Onboarding } from './components/Onboarding';

const ADDRESS = /^0x[0-9a-f]{64}$/i;
export type View = 'arena' | 'ghost' | 'memories' | 'leaderboard';
const VIEWS: { id: View; label: string; short: string }[] = [
  { id: 'arena', label: 'Arena', short: 'Arena' },
  { id: 'ghost', label: 'Ghost', short: 'Ghost' },
  { id: 'memories', label: 'Memories', short: 'Memories' },
  { id: 'leaderboard', label: 'Leaderboard', short: 'Ranks' },
];
const viewFromHash = (): View => {
  const v = window.location.hash.replace('#/', '') as View;
  return VIEWS.some((x) => x.id === v) ? v : 'arena';
};

export function App() {
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const demoConnected = Boolean(account && wallet?.name === DEMO_WALLET_NAME);
  const dAppKit = useDAppKit();
  const [view, setView] = useState<View>(viewFromHash);
  const [status, setStatus] = useState<Status | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketsLoaded, setMarketsLoaded] = useState(false);
  const [samples, setSamples] = useState<PriceSample[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [feed, setFeed] = useState<GhostFeed | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [viewAddress, setViewAddress] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('as') ?? '';
    return ADDRESS.test(value) ? value.toLowerCase() : '';
  });
  const owner = account?.address ?? (viewAddress || undefined);
  const readOnly = !account && Boolean(viewAddress);

  useEffect(() => {
    const on = () => {
      setView(viewFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (v: View) => {
    window.location.hash = `/${v}`;
  };

  function viewAs(value: string) {
    const v = value.trim().toLowerCase();
    if (v && !ADDRESS.test(v)) return 'Paste a 0x address with 64 hexadecimal characters';
    setViewAddress(v);
    const url = new URL(window.location.href);
    if (v) url.searchParams.set('as', v);
    else url.searchParams.delete('as');
    window.history.replaceState(null, '', url);
    return '';
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const loadMarkets = () =>
      api<{ markets: Market[] }>('/markets')
        .then((x) => {
          setMarkets(x.markets);
          setMarketsLoaded(true);
        })
        .catch((e) => setError(String(e.message ?? e)));
    const loadPrices = () => api<{ samples: PriceSample[] }>('/prices').then((x) => setSamples(x.samples)).catch(() => {});
    const loadSlow = () => {
      api<Status>('/status').then(setStatus).catch((e) => setError(String(e.message ?? e)));
      api<Round[]>('/rounds').then(setRounds).catch(() => {});
    };
    loadMarkets();
    loadPrices();
    loadSlow();
    const a = setInterval(loadMarkets, 8_000);
    const b = setInterval(loadPrices, 4_000);
    const c = setInterval(loadSlow, 15_000);
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      const x = JSON.parse(ev.data);
      if (x.type === 'rounds') setRounds(x.rounds);
      if (x.type === 'ghost')
        setFeed((f) => {
          if (!f || x.trade.player !== f.haunting?.player) return f;
          const rest = f.trades.filter((t) => t.id !== x.trade.id);
          return { ...f, trades: [x.trade, ...rest].sort((p, q) => q.createdAt.localeCompare(p.createdAt)) };
        });
    };
    return () => {
      clearInterval(a);
      clearInterval(b);
      clearInterval(c);
      es.close();
    };
  }, []);

  // The ghost's own feed for this player: what it traded on its own, step by step.
  useEffect(() => {
    if (!owner) return setFeed(null);
    const load = () => api<GhostFeed>(`/ghost-feed?player=${owner}`).then(setFeed).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [owner]);

  // The player's history, and the ghost built from it, load as soon as there is an address.
  async function loadHistory(keep = false) {
    if (!owner) return;
    setHistoryBusy(true);
    if (!keep) setHistoryError('');
    try {
      const next = markets.filter((m) => m.cadence === 5 && m.expiryMs > Date.now() + 5_000).sort((x, y) => x.expiryMs - y.expiryMs)[0];
      const q = new URLSearchParams({ limit: '20', side: 'up', ...(next ? { marketId: next.id } : {}) });
      setHistory(await api<HistoryResponse>(`/history/${owner}?${q}`));
    } catch (e) {
      setHistoryError(String((e as Error).message ?? e));
    } finally {
      setHistoryBusy(false);
    }
  }
  useEffect(() => {
    setHistory(null);
    if (owner && marketsLoaded) void loadHistory();
  }, [owner, marketsLoaded]);

  const mine = useMemo(() => rounds.filter((r) => r.player === owner?.toLowerCase()), [rounds, owner]);
  const forkMode = Boolean(status?.fork);
  const live = Boolean(status?.mainnetWrites || (forkMode && status?.fork?.writes));

  async function signAndSend(transaction: string) {
    const signed = await dAppKit.signTransaction({ transaction });
    return post<{ digest: string }>('/execute', { bytes: signed.bytes, signature: signed.signature });
  }

  return (
    <div className={`shell view-${view}`}>
      {demoConnected && (
        <div className="demo-signer-badge">
          Demo signer · server-held demo key · {String(status?.rpc ?? '').includes('LOCAL FORK') ? 'LOCAL FORK of Sui mainnet · no real funds' : 'real mainnet funds'}
        </div>
      )}
      <header className="nav">
        <Logo />
        <nav className="tabs-nav" aria-label="Screens">
          {VIEWS.map((v) => (
            <a key={v.id} href={`#/${v.id}`} className={view === v.id ? 'on' : ''} aria-current={view === v.id ? 'page' : undefined}>
              {v.label}
            </a>
          ))}
        </nav>
        <div className="nav-right">
          <span className={`mode ${live ? 'mode-live' : ''}`} title="Whether this server sends real orders">
            <i aria-hidden />
            {live ? (forkMode ? 'Fork writes' : 'Live USDC') : 'Dry-run'}
          </span>
          {readOnly && (
            <span className="addr-pill" role="status">
              <img className="avatar" src={avatarFor(owner!)} alt="" width={20} height={20} />
              <span className="num">{short(owner!)}</span>
              <span className="muted hide-sm">read-only</span>
              <button aria-label="Stop viewing this address" onClick={() => viewAs('')}>
                ✕
              </button>
            </span>
          )}
          <ConnectButton />
        </div>
      </header>

      {(status?.setup.length || status?.chainError || error) && (
        <div className="notices">
          {status && status.setup.length > 0 && (
            <div className="notice notice-setup" role="status">
              <b>Setup required</b>
              {status.setup.map((s) => (
                <code key={s}>{s.replace('Setup required: ', '')}</code>
              ))}
              <span className="muted">Reads and dry-runs work; real orders and Walrus writes stay off.</span>
            </div>
          )}
          {status?.chainError && <div className="notice notice-error">Chain: {status.chainError}</div>}
          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}

      <main className="stage-main">
        {!owner && view !== 'leaderboard' ? (
          <Onboarding onViewAs={viewAs} />
        ) : view === 'arena' ? (
          <Arena
            owner={owner!}
            account={Boolean(account)}
            readOnly={readOnly}
            markets={markets}
            marketsLoaded={marketsLoaded}
            samples={samples}
            now={now}
            live={live}
            fork={forkMode}
            history={history}
            feed={feed}
            rounds={mine}
            signAndSend={signAndSend}
            onGhost={() => go('ghost')}
          />
        ) : view === 'ghost' ? (
          <GhostView owner={owner!} now={now} history={history} historyBusy={historyBusy} feed={feed} setFeed={setFeed} rounds={mine} status={status} onMemories={() => go('memories')} />
        ) : view === 'memories' ? (
          <Memories owner={owner!} readOnly={readOnly} history={history} historyBusy={historyBusy} historyError={historyError} status={status} reload={() => loadHistory(true)} />
        ) : (
          <Board owner={owner} />
        )}
      </main>

      <footer className="foot">
        <Mark size={18} />
        <p>
          Markets and settlement: DeepBook Predict on Sui mainnet, settled at the Pyth price at expiry. Memory: Walrus Memory mainnet. Chain reads:{' '}
          {status?.rpc ?? 'loading'}. Every number comes from the chain or from recalled memories. Art and screen designs generated with ChatGPT.
        </p>
      </footer>

      <nav className="tabbar" aria-label="Screens">
        {VIEWS.map((v) => (
          <a key={v.id} href={`#/${v.id}`} className={view === v.id ? 'on' : ''} aria-current={view === v.id ? 'page' : undefined}>
            <TabIcon id={v.id} />
            <span>{v.short}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

function TabIcon({ id }: { id: View }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {id === 'arena' && <path {...p} d="M4 20 20 4M14 4h6v6M4 4l6 6M14 14l6 6M4 20h4M20 20v-4" />}
      {id === 'ghost' && <path {...p} d="M6 20V10a6 6 0 0 1 12 0v10l-3-2-3 2-3-2-3 2zM9.5 10.5h.01M14.5 10.5h.01" />}
      {id === 'memories' && <path {...p} d="M4 7h16M4 12h16M4 17h16M7 4v16" />}
      {id === 'leaderboard' && <path {...p} d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />}
    </svg>
  );
}
