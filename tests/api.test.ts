import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createConnection } from 'node:net';
import { createApp } from '../server/app.js';

test('serves a real demo graph without network requests', async (t) => {
  const server = await createApp();
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await fetch(base + '/api/demo');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.repository.isDemo, true);
  assert.ok(body.files.length >= 8);
  assert.ok(body.edges.length >= 8);
});

test('validates request shape and origin before calling GitHub', async (t) => {
  let calls = 0;
  const server = await createApp({
    loader: async () => {
      calls++;
      throw new Error('network should not be reached');
    },
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: string, headers: Record<string, string> = {}) =>
    fetch(base + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    });
  assert.equal((await post('{}')).status, 400);
  assert.equal((await post('{')).status, 400);
  assert.equal(
    (await post(JSON.stringify({ repository: 'a/b' }), { Origin: 'https://evil.test' })).status,
    403,
  );
  assert.equal((await post(JSON.stringify({ repository: 'https://evil.test/a/b' }))).status, 400);
  assert.equal((await post('x'.repeat(5000))).status, 413);
  assert.equal(calls, 0);
});

test(
  'returns a client error for malformed raw request targets without crashing',
  { timeout: 3000 },
  async (t) => {
    const server = await createApp();
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const response = await new Promise<string>((resolve) => {
      const socket = createConnection({
        host: '127.0.0.1',
        port: (server.address() as AddressInfo).port,
      });
      let result = '';
      socket.setTimeout(1000, () => socket.destroy());
      socket.on('connect', () =>
        socket.write('GET // HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'),
      );
      socket.on('data', (chunk) => {
        result += chunk.toString();
      });
      socket.on('close', () => resolve(result));
    });
    assert.match(response, /^HTTP\/1\.1 400/);
  },
);
