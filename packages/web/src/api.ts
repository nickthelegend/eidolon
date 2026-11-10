export type Side = 'up' | 'down';

export type Market = {
  id: string;
  expiryMs: number;
  cadence: 1 | 5;
  referencePrice: number | null;
  forward: number | null;
  suggestedStrike: number | null;
  suggestedStrikeDown: number | null;
  admissionTickSize: number;
  mintPaused: boolean;
};

export type Status = {
  rpc: string;
  chainError: string | null;
  memoryNetwork: string;
  ghostBalance: number | null;
  setup: string[];
  mainnetWrites: boolean;
  /** Set only in LOCAL FORK mode: the fork checkpoint label and whether fork writes are enabled. */
  fork?: { label?: string; writes?: boolean; seat?: string | null } | null;
};

export type GhostPreview = {
  side: Side;
  strike: number;
  probability: number;
  exact: boolean;
  playerProbability: number;
};

export type Plan = {
  strike: number | null;
  accepting: boolean;
  refusal: string | null;
  mirror: string;
  ghostPreview: GhostPreview | null;
  quote: { potentialPayout: number; totalDebit: number; orderFee: number };
  dryRun: { status: { status: string; error?: string }; rpc: string } | null;
  transaction: string | null;
  mode: string;
  rpc: string;
};

export type FundingPlan = {
  dryRun: { status: string; error: string | null };
  transaction: string | null;
  mode: string;
  rpc: string;
};

export type HistoricalTrade = {
  side: Side;
  strike: number;
  size: number;
  hit: boolean;
  pnl: number;
  fillDigest: string;
  payoutDigest: string;
  enqueueDigest: string;
  createdAt: string;
};
export type HistoryResponse = {
  trades: HistoricalTrade[];
  profile: GhostProfile & { averageSize: number };
  decision: { side: Side; size: number; profile: GhostProfile } | null;
  source: string;
  blobIds?: string[];
  memoryError?: string | null;
  memoryByFill?: Record<string, string>;
};

export type Leg = { digest: string; pnl?: number; fillDigest?: string; payoutDigest?: string };

export type GhostProfile = {
  hitRate: number;
  upBias: number;
  recalled: number;
  matched?: number;
  averageSize?: number;
};

export type Round = {
  digest: string;
  player: string;
  expiryMs: number;
  createdAt?: string;
  cadence: 1 | 5;
  side: Side;
  strike: number;
  size: number;
  recordId: string;
  status: string;
  memoryBlobId?: string;
  playerLeg?: Leg;
  ghost?: {
    side: Side;
    size: number;
    strike?: number;
    exactMirror?: boolean;
    line?: string;
    status: string;
    recalledBlobIds: string[];
    profile: GhostProfile;
    leg?: Leg;
    /** LOCAL FORK only: the public trader whose Walrus memories stood in for the fork wallet's history. */
    seat?: string;
  };
  settlement?: number;
};

export type LeaderRow = {
  player: string;
  rounds: number;
  settled: number;
  playerPnl: number;
  ghostPnl: number;
  wins1m: number;
  played1m: number;
  wins5m: number;
  played5m: number;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(humanError(String(body.error ?? `HTTP ${res.status}`)));
  return body as T;
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export const usd = (n: number | null | undefined, digits = 0) =>
  n == null
    ? '—'
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const usdc = (n: number | null | undefined) =>
  n == null ? '—' : `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(n).toFixed(2)}`;
export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const suiscan = (digest: string) => `https://suiscan.xyz/mainnet/tx/${digest}`;
export const walruscan = (blob: string) => `https://walruscan.com/mainnet/blob/${blob}`;

const pctText = (p: number) => (p < 0.001 ? 'under 0.1%' : `${(p * 100).toFixed(1)}%`);

/** Turns raw chain and SDK errors into one plain sentence. Keeps every real number; drops type prefixes and base units. */
export function humanError(raw: string): string {
  let s = raw.replace(/^(?:\w*Error:\s*)+/, '');
  s = s.replace(
    /the (up|down) probability ([0-9.e-]+) is outside the market's entry band \[([0-9.]+), ([0-9.]+)\]/i,
    (_, side: string, p: string, a: string, b: string) =>
      `Predict prices this ${side.toUpperCase()} bet at ${pctText(Number(p))}, outside its ${Number(a) * 100}–${Number(b) * 100}% entry band`,
  );
  s = s.replace(
    /Insufficient balance of 0x[0-9a-f]+::usdc::USDC for owner (0x[0-9a-f]{64})\. Required: (\d+), Available: (\d+)/i,
    (_, owner: string, req: string, avail: string) =>
      `${short(owner)} holds ${(Number(avail) / 1e6).toFixed(2)} USDC in its wallet; this deposit needs ${(Number(req) / 1e6).toFixed(2)} USDC`,
  );
  return s;
}

export type PriceSample = { at: number; forward: number };

/** One of twelve generated avatars, picked from the address so the same trader always gets the same one. */
export function avatarFor(address: string) {
  let h = 0;
  for (const ch of address.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `/art/v2/eidolon2-avatar-${String((h % 12) + 1).padStart(2, '0')}.webp`;
}

export const clockText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export type GhostStep = { at: string; tool: string; detail: string; ok: boolean };
export type GhostTrade = {
  id: string;
  player: string;
  marketId: string;
  expiryMs: number;
  cadence: 1 | 5;
  playerSide: Side;
  side: Side;
  strike?: number;
  exact?: boolean;
  probability?: number;
  size: number;
  profile: { upBias: number; hitRate: number; recalled: number };
  blobIds: string[];
  live: boolean;
  status: string;
  steps: GhostStep[];
  leg?: Leg & { recordId?: string };
  settlement?: number;
  won?: boolean;
  /** Claude Haiku's explanation of the policy's decision (generated once per round, server-side). */
  commentary?: string;
  /** Claude Haiku's recap after the round settled. */
  recap?: string;
  createdAt: string;
};
export type GhostFeed = {
  ghost: string | null;
  mode: 'live' | 'dry-run';
  haunting: { player: string; cadence: 1 | 5; since: string } | null;
  haunts: number;
  stats: { cycles: number; placed: number; settled: number; wins: number; pnl: number };
  trades: GhostTrade[];
};
export const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};
export const hm = (t: number | string) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Plain facts the ghost reads from settled trades (oldest first): how you size after wins and losses, your streak, your extremes. */
export function learn(tradesNewestFirst: HistoricalTrade[]) {
  const t = [...tradesNewestFirst].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null);
  const afterLoss = avg(t.slice(1).filter((_, i) => t[i].pnl < 0).map((x) => x.size));
  const afterWin = avg(t.slice(1).filter((_, i) => t[i].pnl > 0).map((x) => x.size));
  const size = avg(t.map((x) => x.size));
  let streak = 0;
  for (const x of [...t].reverse()) {
    if (streak === 0) streak = x.pnl > 0 ? 1 : -1;
    else if ((x.pnl > 0) === streak > 0) streak += streak > 0 ? 1 : -1;
    else break;
  }
  const best = t.reduce<HistoricalTrade | null>((b, x) => (!b || x.pnl > b.pnl ? x : b), null);
  const worst = t.reduce<HistoricalTrade | null>((b, x) => (!b || x.pnl < b.pnl ? x : b), null);
  let run = 0;
  const curve = t.map((x) => (run += x.pnl));
  return { size, afterLoss, afterWin, streak, best, worst, curve, count: t.length };
}
