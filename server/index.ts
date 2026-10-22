import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const server = await createApp({ dev: process.argv.includes('--dev') });
server.listen(port, host, () =>
  console.log(`\n  RepoSketch is ready\n  Local: http://${host}:${port}\n`),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => server.close(() => process.exit()));
