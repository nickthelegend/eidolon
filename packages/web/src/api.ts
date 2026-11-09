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
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
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
