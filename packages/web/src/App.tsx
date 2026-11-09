import { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { api, post, usd, usdc, type FundingPlan, type Market, type Plan, type Round, type Side, type Status } from './api';
import { Countdown } from './components/Countdown';
import { DuelBar } from './components/DuelBar';
import { GhostPanel } from './components/GhostPanel';
import { Leaderboard, Rounds } from './components/Rounds';

export function App() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [status, setStatus] = useState<Status | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [marketId, setMarketId] = useState('');
  const [side, setSide] = useState<Side>('up');
  const [amount, setAmount] = useState('2');
  const [strike, setStrike] = useState('');
  const [preview, setPreview] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const load = () => {
      api<Status>('/status').then(setStatus).catch((e) => setError(String(e.message ?? e)));
      api<{ markets: Market[] }>('/markets')
        .then((x) => {
          setMarkets(x.markets);
          setMarketId((id) => (x.markets.some((m) => m.id === id) ? id : (x.markets[0]?.id ?? '')));
        })
        .catch((e) => setError(String(e.message ?? e)));
      api<Round[]>('/rounds').then(setRounds).catch(() => {});
    };
    load();
    const t = setInterval(load, 15_000);
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      const x = JSON.parse(ev.data);
      if (x.type === 'rounds') setRounds(x.rounds);
    };
    return () => {
      clearInterval(t);
      es.close();
    };
  }, []);

  const market = markets.find((m) => m.id === marketId);
  const forward = markets.find((m) => m.forward != null)?.forward ?? null;
  const mine = useMemo(
    () => rounds.filter((r) => r.player === account?.address.toLowerCase()),
    [rounds, account?.address],
  );
  const settled = mine.filter((r) => r.status === 'settled');
  const youPnl = settled.reduce((n, r) => n + (r.playerLeg?.pnl ?? 0), 0);
  const ghostPnl = settled.reduce((n, r) => n + (r.ghost?.leg?.pnl ?? 0), 0);
  const memories = mine.filter((r) => r.memoryBlobId).length;
  const suggested = side === 'up' ? market?.suggestedStrike : market?.suggestedStrikeDown;

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }

  const planBet = () =>
    run('plan', async () => {
      if (!account || !market) return;
      setPreview(null);
      setPreview(
        await post<Plan>('/plan', {
          owner: account.address,
          marketId,
          side,
          amount: Number(amount),
          strike: strike ? Number(strike) : undefined,
        }),
      );
    });

  async function signAndSend(transaction: string) {
    const signed = await dAppKit.signTransaction({ transaction });
    return post<{ digest: string }>('/execute', { bytes: signed.bytes, signature: signed.signature });
  }

  const trade = () =>
    run('trade', async () => {
      if (!preview?.transaction || !status?.mainnetWrites) return;
      const done = await signAndSend(preview.transaction);
      await post('/rounds', { digest: done.digest });
      setPreview(null);
    });

  const live = status?.mainnetWrites ?? false;

  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="/" aria-label="Eidolon home">
          <span className="brand-mark" aria-hidden />
          <span>
            Eidolon <em>εἴδωλον</em>
          </span>
        </a>
        <div className="top-right">
          <span className={`mode ${live ? 'mode-live' : ''}`}>{live ? 'Real USDC' : 'Dry-run only'}</span>
          <ConnectButton />
        </div>
      </header>

      <section className="hero">
        <h1>
          Trade against <span className="spectral">your past self.</span>
        </h1>
        <p>
          One- and five-minute BTC markets on DeepBook Predict. Your ghost is built only from your own trades,
          remembered on Walrus, and it bets the other way.
        </p>
      </section>

      <section className="stats" aria-label="Live numbers">
        <Stat label="BTC (Predict forward)" value={usd(forward)} />
        <Stat label="Your P&L (USDC)" value={usdc(settled.length ? youPnl : null)} tone="ember" />
        <Stat label="Ghost P&L (USDC)" value={usdc(settled.length ? ghostPnl : null)} tone="spectral" />
        <Stat label="Memories on Walrus" value={String(memories)} />
        <Stat label="Chain reads" value={status?.rpc ?? '…'} warn={status?.rpc !== 'Tatum'} />
      </section>

      {status && status.setup.length > 0 && (
        <div className="setup" role="status">
          <b>Setup required</b>
          <span>{status.setup.map((s) => s.replace('Setup required: ', '')).join(' · ')}</span>
        </div>
      )}
      {status?.chainError && <div className="alert">Chain: {status.chainError}</div>}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <main className="grid">
        <section className="panel arena" aria-labelledby="arena-title">
          <header className="panel-head">
            <h2 id="arena-title">Arena</h2>
            <p className="muted small">Live markets from Sui mainnet · min 1 USDC · 0.02 USDC order fee</p>
          </header>

          <div className="markets" role="radiogroup" aria-label="Market">
            {markets.length === 0 && <p className="muted">Loading live markets…</p>}
            {markets.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={m.id === marketId}
                className={`market ${m.id === marketId ? 'on' : ''}`}
                onClick={() => {
                  setMarketId(m.id);
                  setPreview(null);
                }}
              >
                <Countdown expiryMs={m.expiryMs} cadence={m.cadence} now={now} />
                <span>
                  <b>BTC · {m.cadence} min</b>
                  <small className="num">
                    expires {new Date(m.expiryMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    {m.mintPaused ? ' · paused' : ''}
                  </small>
                </span>
              </button>
            ))}
          </div>

          <div className="slip">
            <div className="sides" role="radiogroup" aria-label="Direction">
              {(['up', 'down'] as const).map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={side === s}
                  className={`side side-${s} ${side === s ? 'on' : ''}`}
                  onClick={() => {
                    setSide(s);
                    setPreview(null);
                  }}
                >
                  {s === 'up' ? 'Ends above' : 'Ends below'}
                  <small>{s === 'up' ? 'UP' : 'DOWN'}</small>
                </button>
              ))}
            </div>
            <div className="fields">
              <label>
                Strike (USD)
                <input
                  className="num"
                  type="number"
                  inputMode="decimal"
                  placeholder={suggested ? `${suggested} suggested` : 'live strike'}
                  value={strike}
                  onChange={(e) => {
                    setStrike(e.target.value);
                    setPreview(null);
                  }}
                />
              </label>
              <label>
                Spend (USDC)
                <input
                  className="num"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.5"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setPreview(null);
                  }}
                />
              </label>
            </div>
            <button className="primary" disabled={!account || !market || busy !== null} onClick={planBet}>
              {busy === 'plan' ? 'Quoting on mainnet…' : account ? 'Quote and dry-run' : 'Connect a Sui wallet to bet'}
            </button>
          </div>

          {preview && forward != null && preview.strike != null && (
            <DuelBar forward={forward} side={side} strike={preview.strike} ghost={preview.ghostPreview} />
          )}

          {preview && (
            <div className={`quote ${preview.accepting ? '' : 'refused'}`}>
              <div className="quote-row">
                <span>{preview.accepting ? 'Predict accepts this bet' : `Predict refuses: ${preview.refusal}`}</span>
              </div>
              <dl>
                <div>
                  <dt>Pays if right</dt>
                  <dd className="num">{preview.quote.potentialPayout.toFixed(2)} USDC</dd>
                </div>
                <div>
                  <dt>You pay</dt>
                  <dd className="num">{preview.quote.totalDebit.toFixed(2)} USDC</dd>
                </div>
                <div>
                  <dt>Order fee</dt>
                  <dd className="num">{preview.quote.orderFee.toFixed(2)} USDC</dd>
                </div>
              </dl>
              <p className="muted small">
                Dry-run{' '}
                {preview.dryRun
                  ? `${preview.dryRun.status.status} via ${preview.dryRun.rpc}${preview.dryRun.status.error ? `: ${preview.dryRun.status.error}` : ''}`
                  : 'not available: fund your Predict account first'}
              </p>
              {preview.dryRun?.status.status === 'success' &&
                (live ? (
                  <button className="primary ember" disabled={busy !== null} onClick={trade}>
                    {busy === 'trade' ? 'Signing…' : 'Sign and queue the real order'}
                  </button>
                ) : (
                  <p className="muted small">Real orders are off on this server (dry-run only).</p>
                ))}
            </div>
          )}

          <Funding live={live} owner={account?.address} signAndSend={signAndSend} />
        </section>

        <GhostPanel status={status} round={mine.at(-1)} />

        <Rounds rounds={mine} />
        <Leaderboard />
      </main>

      <footer className="foot">
        <p>
          Markets and settlement: DeepBook Predict (Pyth price at expiry). Memory: Walrus Memory on mainnet.
          Chain reads: Tatum Sui RPC. Every number here comes from chain or from your own recalled memories.
        </p>
      </footer>
    </div>
  );
}

function Stat({ label, value, tone, warn }: { label: string; value: string; tone?: 'ember' | 'spectral'; warn?: boolean }) {
  return (
    <div className={`stat ${tone ?? ''} ${warn ? 'warn' : ''}`}>
      <span>{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}

function Funding({
  live,
  owner,
  signAndSend,
}: {
  live: boolean;
  owner: string | undefined;
  signAndSend: (tx: string) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState('10');
  const [create, setCreate] = useState(true);
  const [plan, setPlan] = useState<FundingPlan | null>(null);
  const [msg, setMsg] = useState('');
  return (
    <details className="funding">
      <summary>Fund your Predict account</summary>
      <p className="muted small">
        Predict trades from a USDC balance inside its own account. Creating it and the first deposit can be one
        signed transaction.
      </p>
      <div className="fields">
        <label>
          Deposit (USDC)
          <input className="num" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} /> Create the
          account in the same transaction
        </label>
      </div>
      <button
        disabled={!owner}
        onClick={() =>
          post<FundingPlan>('/fund', { owner, amount: Number(amount), create })
            .then(setPlan)
            .catch((e) => setMsg(String(e.message ?? e)))
        }
      >
        Dry-run the deposit
      </button>
      {plan && (
        <p className="muted small">
          Dry-run {plan.dryRun.status} via {plan.rpc}
          {plan.dryRun.error ? `: ${plan.dryRun.error}` : ''}
        </p>
      )}
      {plan?.transaction && live && (
        <button className="primary ember" onClick={() => signAndSend(plan.transaction!).then(() => setPlan(null))}>
          Sign and deposit real USDC
        </button>
      )}
      {msg && <p className="alert">{msg}</p>}
    </details>
  );
}
