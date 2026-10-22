import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import tar from 'tar-stream';
import { readArchive, LIMITS } from '../server/archive.js';

async function archive(entries: Record<string, string>): Promise<Readable> {
  const pack = tar.pack();
  for (const [name, content] of Object.entries(entries)) pack.entry({ name }, content);
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of pack) {
    assert.ok(Buffer.isBuffer(chunk));
    chunks.push(chunk);
  }
  return Readable.from(gzipSync(Buffer.concat(chunks)));
}

test('reads source and config from archives while ignoring generated files', async () => {
  const files = await readArchive(
    await archive({
      'repo-sha/src/main.ts': 'export const a = 1',
      'repo-sha/package.json': '{}',
      'repo-sha/dist/output.js': 'built',
      'repo-sha/node_modules/dep/index.js': 'dependency',
      'repo-sha/photo.png': 'image',
    }),
  );
  assert.deepEqual(Object.keys(files).sort(), ['package.json', 'src/main.ts']);
});

test('rejects traversal paths before retaining archive entries', async () => {
  await assert.rejects(() => readArchive(archiveStream()), /unsafe|path/i);
  function archiveStream() {
    const pack = tar.pack();
    pack.entry({ name: 'repo/../escape.ts' }, 'bad');
    pack.finalize();
    const gzip = (async function* () {
      const parts: Buffer[] = [];
      for await (const chunk of pack) {
        assert.ok(Buffer.isBuffer(chunk));
        parts.push(chunk);
      }
      yield gzipSync(Buffer.concat(parts));
    })();
    return Readable.from(gzip);
  }
});

test('enforces source-file count and individual file-size bounds', async () => {
  await assert.rejects(
    () =>
      archive({ 'repo/a.ts': 'a', 'repo/b.ts': 'b' }).then((s) =>
        readArchive(s, { ...LIMITS, files: 1 }),
      ),
    /source files/i,
  );
  await assert.rejects(
    () =>
      archive({ 'repo/a.ts': 'long source' }).then((s) =>
        readArchive(s, { ...LIMITS, fileSize: 4 }),
      ),
    /file.*large|file.*limit/i,
  );
});

test('enforces decompression bounds even for ignored content', async () => {
  await assert.rejects(
    () =>
      archive({ 'repo/image.png': 'x'.repeat(20000) }).then((s) =>
        readArchive(s, { ...LIMITS, expanded: 10000 }),
      ),
    /expanded|decompress/i,
  );
});
