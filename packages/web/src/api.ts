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
  fork?: { label?: string; writes?: boolean } | null;
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
