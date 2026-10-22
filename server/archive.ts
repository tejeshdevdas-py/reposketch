import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import { isSource, isConfig } from './files.js';

export interface ArchiveLimits {
  compressed: number;
  expanded: number;
  entries: number;
  files: number;
  fileSize: number;
}
export const LIMITS: ArchiveLimits = {
  compressed: 12 * 1024 * 1024,
  expanded: 40 * 1024 * 1024,
  entries: 10_000,
  files: 250,
  fileSize: 512 * 1024,
};

export async function readArchive(
  source: Readable,
  limits: ArchiveLimits = LIMITS,
): Promise<Record<string, string>> {
  const files: Record<string, string> = Object.create(null);
  let count = 0;
  let entries = 0;
  const extract = tar.extract();
  const limiter = (max: number, label: string) => {
    let size = 0;
    return new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        callback(
          size > max
            ? new Error(`${label} archive limit exceeded. Try a smaller repository.`)
            : null,
          chunk,
        );
      },
    });
  };
  extract.on('entry', (header, stream, next) => {
    stream.on('error', (error) => extract.destroy(error));
    try {
      if (++entries > limits.entries)
        throw new Error('Too many archive entries. Try a smaller repository.');
      if (
        header.name.startsWith('/') ||
        header.name.includes('\\') ||
        header.name.split('/').some((p) => p === '..') ||
        header.name.includes('\0')
      )
        throw new Error('Unsafe path in repository archive.');
      const p = header.name.split('/').slice(1).join('/');
      if (header.type !== 'file' || !(isSource(p) || isConfig(p))) {
        stream.resume();
        stream.on('end', next);
        return;
      }
      if ((header.size ?? 0) > limits.fileSize)
        throw new Error(
          `File too large: ${p}. Each analyzed file must be under ${Math.round(limits.fileSize / 1024)} KiB.`,
        );
      if (isSource(p) && ++count > limits.files)
        throw new Error(
          `This repository has more than ${limits.files} source files. Try a smaller repository.`,
        );
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (data: unknown) => {
        if (!Buffer.isBuffer(data)) {
          extract.destroy(new Error('Invalid archive stream.'));
          return;
        }
        const chunk = data;
        size += chunk.length;
        if (size > limits.fileSize) extract.destroy(new Error(`File size limit exceeded: ${p}`));
        else chunks.push(chunk);
      });
      stream.on('end', () => {
        files[p] = Buffer.concat(chunks).toString('utf8');
        next();
      });
    } catch (error) {
      extract.destroy(error as Error);
    }
  });
  await pipeline(
    source,
    limiter(limits.compressed, 'Compressed'),
    createGunzip(),
    limiter(limits.expanded, 'Expanded'),
    extract,
  );
  return files;
}
