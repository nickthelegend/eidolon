// The ghost's analyst: Claude Haiku explains, in one or two sentences, what the deterministic policy already decided
// (side, strike, size) and how a round ended. It never decides anything. Every text is generated once per key (round id
// or trader + market) and cached on disk, because each call costs real money; nothing is generated on page load.
import Anthropic from '@anthropic-ai/sdk';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const MODEL = 'claude-haiku-5-5';
type Entry = { text: string; at: string; model: string };
let cache: Record<string, Entry> = {};
let path = 'data/analyst-cache.json';
let loaded = false;
const pending = new Map<string, Promise<Entry>>();

export async function initAnalyst(dataDir: string) {
  path = `${dataDir}/analyst-cache.json`;
  try {
    cache = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    cache = {};
  }
  loaded = true;
}

export const analystReady = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const cached = (key: string) => cache[key] ?? null;

const SYSTEM =
  'You are the voice of a trading ghost in a Bitcoin Up/Down prediction game. A fixed policy has already made the decision; ' +
  'you only explain it, in plain words a non-trader understands. Use only the numbers given. Never invent numbers, never give advice, ' +
  'never promise a result. Answer in at most two short sentences, first person, no emojis, no markdown.';

/** Generate once per key; later calls (and concurrent ones) get the cached text. Throws "Setup required" without a key. */
export async function explain(key: string, facts: string): Promise<Entry> {
  if (!loaded) throw new Error('Analyst not initialised');
  const hit = cache[key];
  if (hit) return hit;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Setup required: ANTHROPIC_API_KEY');
  const run = (async () => {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: facts }],
    });
    if (res.stop_reason === 'refusal') throw new Error('Analyst declined to explain this round');
    const text = res.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) throw new Error(`Analyst returned no text (stop: ${res.stop_reason})`);
    const entry = { text, at: new Date().toISOString(), model: MODEL };
    cache[key] = entry;
    await mkdir(path.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    await writeFile(path, JSON.stringify(cache, null, 1));
    return entry;
  })();
  pending.set(key, run);
  try {
    return await run;
  } finally {
    pending.delete(key);
  }
}
