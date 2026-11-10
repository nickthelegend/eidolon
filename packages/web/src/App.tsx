import { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit, useWallets } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { DEMO_WALLET_NAME } from './demoWallet';
import { api, avatarFor, post, short, type GhostFeed, type HistoryResponse, type Market, type PriceSample, type Round, type Status } from './api';
import { Logo } from './components/Logo';
import { Board } from './components/Board';
import Landing from './Landing';
import Terminal from './Terminal';
import RoundPage from './RoundPage';
import ForkTxPage from './ForkTxPage';
import { GhostToasts } from './GhostToasts';
import { Icon, parseRoute, setForkMode, type Route } from './ui';

const ADDRESS = /^0x[0-9a-f]{64}$/i;
const addressFromUrl = () => {
  const value = new URLSearchParams(window.location.search).get('as') ?? '';
  return ADDRESS.test(value) ? value.toLowerCase() : '';
};

export function App() {
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const demoConnected = Boolean(account && wallet?.name === DEMO_WALLET_NAME);
  const dAppKit = useDAppKit();
  const wallets = useWallets();
  // ?connect=demo picks the server-held demo signer (only registered when the server enables it) without the wallet menu.
  useEffect(() => {
    if (account || new URLSearchParams(window.location.search).get('connect') !== 'demo') return;
    const demo = wallets.find((w) => w.name === DEMO_WALLET_NAME);
    if (demo) void dAppKit.connectWallet({ wallet: demo }).catch(() => {});
  }, [wallets.length, account]);
  const [viewAddress, setViewAddress] = useState(addressFromUrl);
  const [status, setStatus] = useState<Status | null>(null);
  setForkMode(Boolean(status?.fork));
  const signer = account?.address;
  const owner = signer ?? (viewAddress || undefined);
  // LOCAL FORK only: a fork-only wallet has no history, so the server names a public trader whose real Walrus memories
  // stand in for it. History, habits and the ghost's feed then read that seat; orders are still signed by the wallet.
  const forkSeat = status?.fork?.seat ?? null;
  const memOwner = signer && forkSeat ? forkSeat : owner;
  const readOnly = !account && Boolean(viewAddress);
  const [route, setRoute] = useState<Route>(() => parseRoute(Boolean(addressFromUrl())));
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

  useEffect(() => {
    const on = () => {
      const next = parseRoute(Boolean(new URLSearchParams(window.location.search).get('as')) || Boolean(account));
      setRoute((prev) => {
        if (prev.page !== next.page || (prev.page === 'round' && next.page === 'round' && prev.id !== next.id)) window.scrollTo({ top: 0 });
        return next;
      });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [account]);

  function viewAs(value: string) {
    const v = value.trim().toLowerCase();
    if (v && !ADDRESS.test(v)) return 'Paste a 0x address with 64 hexadecimal characters.';
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
          setError('');
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
    if (!memOwner) return setFeed(null);
    const load = () => api<GhostFeed>(`/ghost-feed?player=${memOwner}`).then(setFeed).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [memOwner]);

  // The player's history, and the ghost built from it, load as soon as there is an address.
  async function loadHistory(keep = false) {
    if (!memOwner) return;
    setHistoryBusy(true);
    if (!keep) setHistoryError('');
    try {
      const next = markets.filter((m) => m.cadence === 5 && m.expiryMs > Date.now() + 45_000).sort((x, y) => x.expiryMs - y.expiryMs)[0];
      const q = new URLSearchParams({ limit: '20', side: 'up', ...(next ? { marketId: next.id } : {}) });
      setHistory(await api<HistoryResponse>(`/history/${memOwner}?${q}`));
      setHistoryError('');
    } catch (e) {
      setHistoryError(String((e as Error).message ?? e));
    } finally {
      setHistoryBusy(false);
    }
  }
  useEffect(() => {
    setHistory(null);
    if (memOwner && marketsLoaded) void loadHistory();
  }, [memOwner, marketsLoaded]);

  const mine = useMemo(() => rounds.filter((r) => r.player === owner?.toLowerCase()), [rounds, owner]);
  const forkMode = Boolean(status?.fork);
  const live = Boolean(status?.mainnetWrites || (forkMode && status?.fork?.writes));
  const isFork = String(status?.rpc ?? '').includes('LOCAL FORK');

  async function signAndSend(transaction: string) {
    const signed = await dAppKit.signTransaction({ transaction });
    return post<{ digest: string }>('/execute', { bytes: signed.bytes, signature: signed.signature });
  }

  useEffect(() => {
    document.title = route.page === 'home' ? 'Eidolon · Trade against your past self' : route.page === 'trade' ? 'Eidolon · Bitcoin Up or Down' : route.page === 'round' ? 'Eidolon · Round' : route.page === 'tx' ? 'Eidolon · Fork transaction' : 'Eidolon · Leaderboard';
  }, [route.page]);

  const banners = (
    <>
      {demoConnected && (
        <p className="banner banner-demo" role="status">
          Demo signer · server-held demo key · {isFork ? 'LOCAL FORK of Sui mainnet · no real funds' : 'real mainnet funds'}
        </p>
      )}
      {status && status.setup.length > 0 && (
        <p className="banner banner-setup" role="status">
          <Icon name="lock" size={14} />
          <b>Setup required:</b> {status.setup.map((s) => s.replace('Setup required: ', '')).join(', ')}
          <span className="dim"> · reads and dry-runs still work</span>
        </p>
      )}
      {status?.chainError && <p className="banner" role="alert">Chain: {status.chainError}</p>}
      {error && <p className="banner" role="alert">{error}</p>}
    </>
  );

  if (route.page === 'home')
    return (
      <div className="site">
        <a className="skip" href="#main">Skip to content</a>
        {banners}
        <Landing markets={markets} samples={samples} now={now} status={status} onViewAs={viewAs} />
      </div>
    );

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="ahead">
        <Logo />
        <nav className="ahead-nav" aria-label="App">
          <a href="#/trade" aria-current={route.page === 'trade' ? 'page' : undefined}>Market</a>
          <a href="#/leaderboard" aria-current={route.page === 'leaderboard' ? 'page' : undefined}>Leaderboard</a>
          <a href="#/home">How it works</a>
        </nav>
        <div className="ahead-right">
          <span className={`net ${forkMode ? 'net-fork' : live ? 'net-live' : ''}`} data-film="network" title="Whether this server sends real orders">
            <i className="live" />
            {forkMode ? 'LOCAL FORK of Sui mainnet · no real funds' : live ? 'LIVE · Sui mainnet · real USDC' : 'LIVE · Sui mainnet · dry-run'}
          </span>
          {readOnly && (
            <span className="addr-pill" role="status" data-film="viewing">
              <img className="avatar" src={avatarFor(owner!)} alt="" width={22} height={22} />
              <span className="mono">{short(owner!)}</span>
              <span className="dim hide-sm">read-only</span>
              <button aria-label="Stop viewing this address" onClick={() => viewAs('')}>
                <Icon name="x" size={14} />
              </button>
            </span>
          )}
          <ConnectButton />
        </div>
      </header>
      {banners}
      {route.page === 'trade' ? (
        <Terminal
          owner={owner}
          account={Boolean(account)}
          readOnly={readOnly}
          markets={markets}
          marketsLoaded={marketsLoaded}
          samples={samples}
          now={now}
          live={live}
          fork={forkMode}
          history={history}
          historyBusy={historyBusy}
          historyError={historyError}
          feed={feed}
          setFeed={setFeed}
          rounds={mine}
          status={status}
          signAndSend={signAndSend}
          reload={() => loadHistory(true)}
          tab={route.tab}
          onViewAs={viewAs}
          seat={signer && forkSeat ? forkSeat : null}
        />
      ) : route.page === 'round' ? (
        <RoundPage id={route.id} feed={feed} rounds={mine} now={now} />
      ) : route.page === 'tx' ? (
        <ForkTxPage digest={route.id} />
      ) : (
        <Board owner={owner} />
      )}
      <GhostToasts feed={feed} rounds={mine} />
      <footer className="term-foot mono">
        <span>
          <i className="live" />
          {status?.rpc ? `Chain reads: ${status.rpc}` : 'Connecting…'}
        </span>
        <span>Markets: DeepBook Predict · settled at the Pyth price</span>
        <span>Memory: Walrus mainnet</span>
        <a href="#/leaderboard">Leaderboard</a>
        <span>Art generated with ChatGPT</span>
      </footer>
    </div>
  );
}
