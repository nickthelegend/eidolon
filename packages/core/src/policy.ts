export type Side = 'up' | 'down';
export type Context = {
  cadence: 1 | 5;
  strikeDistance: number;
  move60s: number | null;
  move5m: number | null;
  hourUtc: number;
};
export type TradeMemory = {
  kind: 'round';
  player: string;
  cadence: 1 | 5;
  side: Side;
  strike: number;
  distance: number;
  size: number;
  premium: number;
  context: Context;
  hit: boolean;
  pnl: number;
  fillDigest: string;
  ghost?: { side: Side; size: number; strike?: number; pnl: number; fillDigest: string };
  createdAt: string;
};
export type HabitMemory = { kind: 'analysis'; player: string; line: string; createdAt: string };
export type Memory = TradeMemory | HabitMemory;
export type Hit = { blobId: string; memory: Memory; distance?: number };
export type HabitProfile = {
  recalled: number;
  matched: number;
  upBias: number;
  averageDistance: number;
  averageSize: number;
  hitRate: number;
};

export function encodeMemory(memory: Memory): string {
  return `EIDOLON_V1 ${JSON.stringify(memory)}`;
}
export function decodeMemory(text: string): Memory | null {
  if (!text.startsWith('EIDOLON_V1 ')) return null;
  try {
    const value = JSON.parse(text.slice(11));
    if (value?.kind === 'analysis')
      return typeof value.player === 'string' &&
        typeof value.line === 'string' &&
        typeof value.createdAt === 'string'
        ? (value as HabitMemory)
        : null;
    if (value?.kind !== 'round') return null;
    const numbers = [
      value.strike,
      value.distance,
      value.size,
      value.premium,
      value.pnl,
      value.context?.strikeDistance,
      value.context?.hourUtc,
    ];
    if (
      numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
      value.size <= 0 ||
      value.premium < 0
    )
      return null;
    if (
      ![1, 5].includes(value.cadence) ||
      !['up', 'down'].includes(value.side) ||
      typeof value.hit !== 'boolean' ||
      typeof value.player !== 'string' ||
      typeof value.fillDigest !== 'string' ||
      typeof value.createdAt !== 'string'
    )
      return null;
    if (
      value.context.cadence !== value.cadence ||
      (value.context.move60s != null && !Number.isFinite(value.context.move60s)) ||
      (value.context.move5m != null && !Number.isFinite(value.context.move5m))
    )
      return null;
    return value as TradeMemory;
  } catch {
    return null;
  }
}

export function contextQuery(c: Context): string {
  const move =
    c.move60s == null
      ? 'unknown minute move'
      : `${c.move60s >= 0 ? 'green' : 'red'} minute ${Math.round(Math.abs(c.move60s))} USD`;
  return `EIDOLON_V1 BTC ${c.cadence} minute cadence ${move} five minute move ${c.move5m == null ? 'unknown' : Math.round(c.move5m)} strike distance ${Math.round(c.strikeDistance)} hour UTC ${c.hourUtc} trade outcome`;
}

export function habitProfile(hits: Hit[], context: Context): HabitProfile {
  const all = hits.filter((h): h is Hit & { memory: TradeMemory } => h.memory.kind === 'round');
  const matched = all.filter(
    (h) =>
      h.memory.cadence === context.cadence &&
      (h.memory.context.move60s == null ||
        context.move60s == null ||
        Math.sign(h.memory.context.move60s) === Math.sign(context.move60s)) &&
      Math.abs(h.memory.context.strikeDistance - context.strikeDistance) <= 20 &&
      Math.min(
        Math.abs(h.memory.context.hourUtc - context.hourUtc),
        24 - Math.abs(h.memory.context.hourUtc - context.hourUtc),
      ) <= 3,
  );
  const use = matched.length ? matched : all;
  const avg = (get: (m: TradeMemory) => number) =>
    use.length ? use.reduce((n, h) => n + get(h.memory), 0) / use.length : 0;
  return {
    recalled: all.length,
    matched: matched.length,
    upBias: avg((m) => (m.side === 'up' ? 1 : 0)),
    averageDistance: avg((m) => m.distance),
    averageSize: avg((m) => m.size),
    hitRate: avg((m) => (m.hit ? 1 : 0)),
  };
}

export function ghostDecision(playerSide: Side, hits: Hit[], context: Context, maxUsdc: number) {
  if (!Number.isFinite(maxUsdc) || maxUsdc < 1) throw new Error('EIDOLON_GHOST_MAX_USDC must be at least 1');
  const profile = habitProfile(hits, context);
  if (!profile.recalled) throw new Error('Ghost requires recalled trade memories');
  const size = Math.min(
    maxUsdc,
    Math.max(1, Math.round(profile.averageSize * (1 + Math.max(0, 0.5 - profile.hitRate) * 2) * 100) / 100),
  );
  return {
    side: playerSide === 'up' ? ('down' as const) : ('up' as const),
    size,
    profile,
    blobIds: hits.filter((h) => h.memory.kind === 'round').map((h) => h.blobId),
  };
}

/**
 * DeepBook Predict admits a new one-sided mint only while its win probability sits inside the
 * entry band (observed on mainnet Nov 8 2026: 0.15 to 0.5). The exact opposite of a player's bet
 * at the same strike has probability 1 - p, so it is admissible only when p is exactly 0.5.
 */
export const ENTRY_BAND = { min: 0.15, max: 0.5 } as const;

export type StrikePricer = {
  probability(strike: number, side: Side): number;
  strikeAtProbability(pUp: number): number | null;
};
export type GhostStrike = { strike: number; probability: number; exact: boolean };

/**
 * The strike the ghost bets at. First choice is the exact mirror of the player's strike. When
 * the band refuses it, the ghost takes the nearest strike on the same side of the market that is
 * just inside the band: for a DOWN ghost the highest strike with P(down) <= max, for an UP ghost
 * the lowest strike with P(up) <= max. That leaves a dead zone between the two strikes where both
 * lose, which the UI shows. Null when no admissible strike exists (the round goes ghost-less).
 */
export function ghostStrike(
  pricer: StrikePricer,
  ghostSide: Side,
  playerStrike: number,
  tick: number,
  band = ENTRY_BAND,
): GhostStrike | null {
  const inBand = (p: number) => p >= band.min && p <= band.max;
  const exact = pricer.probability(playerStrike, ghostSide);
  if (inBand(exact)) return { strike: playerStrike, probability: exact, exact: true };
  const target = ghostSide === 'down' ? 1 - (band.max - 0.01) : band.max - 0.01;
  const raw = pricer.strikeAtProbability(target);
  if (raw == null || !Number.isFinite(raw) || tick <= 0) return null;
  const strike = ghostSide === 'down' ? Math.floor(raw / tick) * tick : Math.ceil(raw / tick) * tick;
  const probability = pricer.probability(strike, ghostSide);
  return inBand(probability) ? { strike, probability, exact: false } : null;
}
