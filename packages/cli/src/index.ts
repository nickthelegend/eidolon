#!/usr/bin/env node
import 'dotenv/config';
import { chain, markets, memoryFor, habitProfile, type Context } from '@eidolon/core';
const [command, arg] = process.argv.slice(2);
const show = (value: unknown) =>
  console.log(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2));
try {
  if (command === 'status') {
    const c = chain();
    show({
      rpc: c.rpc,
      rpcUrl: c.rpcUrl,
      executionMode: await c.predict.read.executionMode(),
      memory:
        process.env.MEMWAL_MAINNET_KEY && process.env.MEMWAL_MAINNET_ACCOUNT_ID
          ? 'configured'
          : 'Setup required: MEMWAL_MAINNET_KEY, MEMWAL_MAINNET_ACCOUNT_ID',
      writes: process.env.EIDOLON_ALLOW_MAINNET === 'I_ACKNOWLEDGE_REAL_USDC' ? 'enabled' : 'dry-run only',
    });
  } else if (command === 'markets') show(await markets());
  else if (command === 'ghost' && arg) {
    if (!/^0x[0-9a-f]{64}$/i.test(arg)) throw new Error('Expected Sui address');
    const context: Context = {
      cadence: 1,
      strikeDistance: 0,
      move60s: null,
      move5m: null,
      hourUtc: new Date().getUTCHours(),
    };
    const hits = await memoryFor(arg).recall(context);
    show({ address: arg, profile: habitProfile(hits, context), recalledBlobIds: hits.map((h) => h.blobId) });
  } else {
    console.error('Usage: eidolon status | markets | ghost <address>');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
