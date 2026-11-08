export type Side = 'up' | 'down';
export type Context = { cadence: 1 | 5; strikeDistance: number; move60s: number | null; move5m: number | null; hourUtc: number };
export type TradeMemory = { kind: 'round'; player: string; cadence: 1 | 5; side: Side; strike: number; distance: number; size: number; premium: number; context: Context; hit: boolean; pnl: number; fillDigest: string; ghost?: { side: Side; size: number; pnl: number; fillDigest: string }; createdAt: string };
export type HabitMemory = { kind: 'analysis'; player: string; line: string; createdAt: string };
export type Memory = TradeMemory | HabitMemory;
export type Hit = { blobId: string; memory: Memory; distance?: number };
export type HabitProfile = { recalled: number; matched: number; upBias: number; averageDistance: number; averageSize: number; hitRate: number };

export function encodeMemory(memory: Memory): string { return `EIDOLON_V1 ${JSON.stringify(memory)}`; }
export function decodeMemory(text: string): Memory | null {
  if (!text.startsWith('EIDOLON_V1 ')) return null;
  try { const value = JSON.parse(text.slice(11)); return value?.kind === 'round' || value?.kind === 'analysis' ? value as Memory : null; } catch { return null; }
}

export function contextQuery(c: Context): string {
  const move = c.move60s == null ? 'unknown minute move' : `${c.move60s >= 0 ? 'green' : 'red'} minute ${Math.round(Math.abs(c.move60s))} USD`;
  return `EIDOLON_V1 BTC ${c.cadence} minute cadence ${move} five minute move ${c.move5m == null ? 'unknown' : Math.round(c.move5m)} strike distance ${Math.round(c.strikeDistance)} hour UTC ${c.hourUtc} trade outcome`;
}

export function habitProfile(hits: Hit[], context: Context): HabitProfile {
  const all = hits.filter((h): h is Hit & { memory: TradeMemory } => h.memory.kind === 'round');
  const matched = all.filter(h => h.memory.cadence === context.cadence && (h.memory.context.move60s == null || context.move60s == null || Math.sign(h.memory.context.move60s) === Math.sign(context.move60s)));
  const use = matched.length ? matched : all;
  const avg = (get: (m: TradeMemory) => number) => use.length ? use.reduce((n,h) => n + get(h.memory), 0) / use.length : 0;
  return { recalled: all.length, matched: matched.length, upBias: avg(m => m.side === 'up' ? 1 : 0), averageDistance: avg(m => m.distance), averageSize: avg(m => m.size), hitRate: avg(m => m.hit ? 1 : 0) };
}

export function ghostDecision(playerSide: Side, hits: Hit[], context: Context, maxUsdc: number) {
  if (!Number.isFinite(maxUsdc) || maxUsdc < 1) throw new Error('EIDOLON_GHOST_MAX_USDC must be at least 1');
  const profile = habitProfile(hits, context);
  if (!profile.recalled) throw new Error('Ghost requires recalled trade memories');
  const size = Math.min(maxUsdc, Math.max(1, Math.round(profile.averageSize * (1 + Math.max(0, 0.5 - profile.hitRate) * 2) * 100) / 100));
  return { side: playerSide === 'up' ? 'down' as const : 'up' as const, size, profile, blobIds: hits.filter(h => h.memory.kind === 'round').map(h => h.blobId) };
}
