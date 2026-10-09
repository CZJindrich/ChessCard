/**
 * `npm run server`: serves dist/ and the online game on one port (PORT, default 8787).
 *
 *   npm run build && npm run server   # then open http://localhost:8787
 *
 * Environment: PORT, HOST (bind address, default all interfaces), WICKWATCH_DATA (where running
 * games are saved, default server/data), WICKWATCH_DIST (the built client, default dist).
 */
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SERVER_PORT } from '../src/net/protocol';
import { startServer } from './app';
import { consoleLogger } from './log';
import { fileRoomStore } from './persist';

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) if (net.family === 'IPv4' && !net.internal) out.push(net.address);
  }
  return out;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
  const dataDir = process.env.WICKWATCH_DATA ?? fileURLToPath(new URL('./data', import.meta.url));
  const distDir = process.env.WICKWATCH_DIST ?? fileURLToPath(new URL('../dist', import.meta.url));
  const store = fileRoomStore(dataDir, consoleLogger);
  const server = await startServer({ port: Number.isFinite(port) ? port : DEFAULT_SERVER_PORT, host: process.env.HOST, distDir, store, log: consoleLogger });
  consoleLogger.info(`Wickwatch server on ${server.url} (WebSocket /ws, client from ${distDir})`);
  for (const address of lanAddresses()) consoleLogger.info(`  on your network: http://${address}:${server.port}`);
  const shutdown = (): void => {
    consoleLogger.info('shutting down');
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  consoleLogger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
