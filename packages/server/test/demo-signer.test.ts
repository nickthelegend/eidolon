import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toBase64 } from '@mysten/sui/utils';
import { createDemoSigner } from '../src/demo-signer.js';

test('demo signer HTTP route signs only fresh prepared bytes for its address', async () => {
  const key = Ed25519Keypair.generate();
  const address = key.toSuiAddress();
  const other = Ed25519Keypair.generate().toSuiAddress();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const encoded = toBase64(bytes);
  let now = 1_000_000;
  const prepared = new Map([[encoded, { address, at: now }]]);
  const handler = createDemoSigner(
    [{ label: 'Test player', variable: 'TEST_KEY' }], prepared, new Map(), () => true,
    { DEMO_SIGNER: 'I_UNDERSTAND_SERVER_HOLDS_KEYS', TEST_KEY: key.getSecretKey() }, () => now,
  );
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const sign = (input: object) => fetch(`${base}/demo-signer/sign`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  try {
    const status = await (await fetch(`${base}/demo-signer`)).json();
    assert.deepEqual(status, { demo: true, enabled: true, accounts: [{ label: 'Test player', address }] });
    const accepted = await sign({ address, bytes: encoded });
    assert.equal(accepted.status, 200);
    const signed = await accepted.json();
    assert.equal(signed.demo, true);
    assert.equal(signed.bytes, encoded);
    assert.equal(await key.getPublicKey().verifyTransaction(bytes, signed.signature), true);
    assert.equal((await sign({ address, bytes: toBase64(new Uint8Array([9])) })).status, 400);
    assert.equal((await sign({ address: other, bytes: encoded })).status, 400);
    prepared.set(encoded, { address: other, at: now });
    assert.equal((await sign({ address, bytes: encoded })).status, 400);
    prepared.set(encoded, { address, at: now - 60_001 });
    assert.equal((await sign({ address, bytes: encoded })).status, 400);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('demo signer stays disabled without the exact opt-in value', async () => {
  const handler = createDemoSigner([{ label: 'Test', variable: 'TEST_KEY' }], new Map(), new Map(), () => true, { DEMO_SIGNER: 'ON' });
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/demo-signer`)).json(), { demo: true, enabled: false, accounts: [] });
    const denied = await fetch(`${base}/demo-signer/sign`, { method: 'POST', body: JSON.stringify({ address: '0x0', bytes: 'AA==' }) });
    assert.equal(denied.status, 400);
    assert.equal((await denied.json()).demo, true);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
