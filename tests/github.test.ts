import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepositoryInput, loadRepository } from '../server/github.js';

test('normalizes public repository URLs and shorthand', () => {
  assert.deepEqual(parseRepositoryInput(' https://github.com/sindresorhus/is.git/ '), {
    owner: 'sindresorhus',
    name: 'is',
  });
  assert.deepEqual(parseRepositoryInput('excalidraw/excalidraw'), {
    owner: 'excalidraw',
    name: 'excalidraw',
  });
});

test('rejects ambiguous subpaths, credentials, query strings and non-GitHub hosts', () => {
  for (const input of [
    'https://github.com.evil.test/a/b',
    'http://github.com/a/b',
    'https://a@github.com/a/b',
    'https://github.com/a/b/tree/main',
    'https://github.com/a/b?x=1',
    'https://github.com/a/b#x',
    'https://github.com:443/a/b',
    'a/..',
    '../b',
    '',
    'file:///tmp/test',
  ]) {
    assert.throws(() => parseRepositoryInput(input), /GitHub|repository/i, input);
  }
});

test('turns GitHub rate limits into an actionable error', async () => {
  const fakeFetch = (async () =>
    new Response('{"message":"API rate limit exceeded"}', {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0' },
    })) as typeof fetch;
  await assert.rejects(() => loadRepository('a/b', fakeFetch), /rate limit/i);
});

test('distinguishes private or missing repos and invalid upstream responses', async () => {
  await assert.rejects(
    () => loadRepository('a/b', (async () => new Response('{}', { status: 404 })) as typeof fetch),
    /public|found/i,
  );
  await assert.rejects(
    () => loadRepository('a/b', (async () => new Response('<html>')) as typeof fetch),
    /response/i,
  );
});
