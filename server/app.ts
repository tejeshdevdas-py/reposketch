import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Analysis } from '../shared/types.js';
import { demo } from './demo.js';
import { loadRepository, parseRepositoryInput } from './github.js';

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new Error('BODY_LIMIT');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function createApp(
  options: { dev?: boolean; loader?: (input: string) => Promise<Analysis> } = {},
) {
  const loader = options.loader ?? loadRepository;
  const cache = new Map<string, { at: number; data: Analysis }>();
  let active = 0;
  const vite = options.dev
    ? await (
        await import('vite')
      ).createServer({ server: { middlewareMode: true }, appType: 'spa' })
    : null;
  const dist = path.resolve('dist');
  const server = createServer(async (request, response) => {
    let url: URL;
    try {
      url = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      return json(response, 400, { error: 'Malformed request URL.' });
    }
    try {
      if (url.pathname === '/api/health' && request.method === 'GET')
        return json(response, 200, { status: 'ok' });
      if (url.pathname === '/api/demo' && request.method === 'GET')
        return json(response, 200, demo);
      if (url.pathname === '/api/analyze' && request.method === 'POST') {
        const origin = request.headers.origin;
        if (
          origin &&
          origin !== `http://${request.headers.host}` &&
          origin !== `https://${request.headers.host}`
        )
          return json(response, 403, { error: 'Cross-origin analysis requests are not allowed.' });
        if (!request.headers['content-type']?.startsWith('application/json'))
          return json(response, 415, { error: 'Use application/json.' });
        let input: string;
        let key: string;
        try {
          const body = JSON.parse(await readBody(request));
          if (typeof body?.repository !== 'string')
            throw new Error('Enter a GitHub repository URL.');
          input = body.repository;
          const repo = parseRepositoryInput(input);
          key = `${repo.owner}/${repo.name}`.toLowerCase();
        } catch (error) {
          const message = (error as Error).message;
          return json(response, message === 'BODY_LIMIT' ? 413 : 400, {
            error:
              message === 'BODY_LIMIT'
                ? 'Request is too large.'
                : message.startsWith('Enter')
                  ? message
                  : 'Enter a valid GitHub repository URL.',
          });
        }
        const cached = cache.get(key);
        if (cached && Date.now() - cached.at < 5 * 60_000) return json(response, 200, cached.data);
        if (active >= 2)
          return json(response, 429, {
            error: 'Two repositories are being analyzed. Please try again in a moment.',
          });
        active++;
        try {
          const data = await loader(input);
          if (cache.size >= 4) cache.delete(cache.keys().next().value!);
          cache.set(key, { at: Date.now(), data });
          return json(response, 200, data);
        } catch (error) {
          return json(response, 422, {
            error: (error as Error).message || 'The repository could not be analyzed.',
          });
        } finally {
          active--;
        }
      }
      if (url.pathname.startsWith('/api/'))
        return json(response, 404, { error: 'Endpoint not found.' });
      if (vite) {
        vite.middlewares(request, response);
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return json(response, 405, { error: 'Method not allowed.' });
      const decoded = decodeURIComponent(url.pathname);
      const location = path.resolve(dist, '.' + (decoded === '/' ? '/index.html' : decoded));
      if (!location.startsWith(dist + path.sep))
        return json(response, 403, { error: 'Forbidden path.' });
      try {
        if (!(await stat(location)).isFile()) throw new Error('not file');
        const content = await readFile(location);
        const mime: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
          '.json': 'application/json',
          '.png': 'image/png',
        };
        response.writeHead(200, {
          'Content-Type': mime[path.extname(location)] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(request.method === 'HEAD' ? undefined : content);
      } catch {
        json(response, 404, { error: 'Page not found. Run npm run build before npm start.' });
      }
    } catch {
      if (!response.headersSent)
        json(response, 500, { error: 'Something went wrong. Please try again.' });
      else response.end();
    }
  });
  server.requestTimeout = 70_000;
  server.headersTimeout = 10_000;
  server.on('close', () => {
    void vite?.close();
  });
  return server;
}
