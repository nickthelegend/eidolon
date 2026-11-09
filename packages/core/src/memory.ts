import { MemWal } from '@mysten-incubation/memwal';
import { contextQuery, decodeMemory, encodeMemory, type Context, type Hit, type Memory } from './policy.js';

export function memoryFor(player: string, env = process.env) {
  if (!env.MEMWAL_MAINNET_KEY) throw new Error('Setup required: MEMWAL_MAINNET_KEY');
  if (!env.MEMWAL_MAINNET_ACCOUNT_ID) throw new Error('Setup required: MEMWAL_MAINNET_ACCOUNT_ID');
  const client = MemWal.create({
    key: env.MEMWAL_MAINNET_KEY,
    accountId: env.MEMWAL_MAINNET_ACCOUNT_ID,
    serverUrl: 'https://relayer.memory.walrus.xyz',
    namespace: `eidolon-v1:${player.toLowerCase()}`,
  });
  return {
    async recall(context: Context): Promise<Hit[]> {
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await client.recall({ query: contextQuery(context), limit: 40 });
          return result.results.flatMap((r) => {
            const memory = decodeMemory(r.text);
            return memory ? [{ blobId: r.blob_id, memory, distance: r.distance }] : [];
          });
        } catch (error) {
          if (attempt >= 3 || !String(error).includes('429')) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
        }
      }
    },
    // Many memories in one relayer bulk job: one signed request, certified in parallel.
    async rememberMany(memories: Memory[]): Promise<{ blobIds: string[]; failed: { index: number; error: string }[] }> {
      const blobIds: string[] = [], failed: { index: number; error: string }[] = [];
      for (let start = 0; start < memories.length; start += 20) { // the relayer caps a bulk request at 20 items
        const chunk = memories.slice(start, start + 20);
        const result = await client.rememberBulkAndWait(chunk.map((m) => ({ text: encodeMemory(m) })), { timeoutMs: 900_000 });
        result.results.forEach((r, i) => (r.status === 'done' ? blobIds.push(r.blob_id) : failed.push({ index: start + i, error: r.error ?? r.status })));
      }
      return { blobIds, failed };
    },
    async remember(memory: Memory): Promise<string> {
      for (let attempt = 0; ; attempt++) {
        try {
          // Walrus mainnet often takes 1-2 minutes to certify a blob; the SDK's 60 s default gave up on writes that then landed.
          return (await client.rememberAndWait(encodeMemory(memory), { timeoutMs: 300_000 })).blob_id;
        } catch (error) {
          if (attempt >= 3 || !String(error).includes('429')) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
        }
      }
    },
  };
}
