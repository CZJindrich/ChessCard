/**
 * The Wickwatch server in one call: an HTTP server for the built client plus the WebSocket
 * endpoint at /ws, both on one port (ARCHITECTURE §7), so friends on a LAN need one command.
 * `startServer({ port: 0 })` picks a free port (tests).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_CLIENT_MESSAGE_BYTES, WS_PATH, type ServerMessage } from '../src/net/protocol';
import { Hub, type HubConn, type HubOptions } from './hub';
import { consoleLogger, type Logger } from './log';
import { createStaticHandler } from './static';

export interface ServerOptions extends HubOptions {
  port?: number;
  host?: string;
  /** The built client to serve (default: dist/ next to package.json). */
  distDir?: string;
  /** Ping interval for dead-socket detection (ms). */
  heartbeatMs?: number;
  /** Restore rooms from the store on start (default true). */
  restore?: boolean;
}

export interface RunningServer {
  port: number;
  url: string;
  hub: Hub;
  http: Server;
  close(): Promise<void>;
}

interface Tracked {
  conn: HubConn;
  alive: boolean;
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const log: Logger = options.log ?? consoleLogger;
  const hub = new Hub({ ...options, log });
  if (options.restore !== false) {
    const restored = hub.restore();
    if (restored > 0) log.info(`restored ${restored} room${restored === 1 ? '' : 's'} from disk`);
  }
  hub.start();

  const serveStatic = createStaticHandler(options.distDir ?? new URL('../dist', import.meta.url).pathname);
  const http = createServer((req, res) => serveStatic(req, res));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MESSAGE_BYTES * 2 });
  const sockets = new Map<WebSocket, Tracked>();

  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    const conn: HubConn = {
      send(message: ServerMessage) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
      },
      close(code, reason) {
        try {
          ws.close(code, reason);
        } catch {
          ws.terminate();
        }
      },
    };
    const tracked: Tracked = { conn, alive: true };
    sockets.set(ws, tracked);
    hub.connect(conn);
    ws.on('pong', () => {
      tracked.alive = true;
    });
    ws.on('message', (data, isBinary) => {
      tracked.alive = true;
      if (isBinary) {
        conn.send({ type: 'error', code: 'bad_message', message: 'Messages must be JSON text.' });
        return;
      }
      hub.receive(conn, Array.isArray(data) ? Buffer.concat(data).toString('utf8') : data.toString('utf8'));
    });
    ws.on('close', () => {
      sockets.delete(ws);
      hub.disconnect(conn);
    });
    ws.on('error', () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const [ws, tracked] of sockets) {
      if (!tracked.alive) {
        ws.terminate();
        continue;
      }
      tracked.alive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, options.heartbeatMs ?? 15_000);
  heartbeat.unref();

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port ?? 8787, options.host, () => {
      http.off('error', reject);
      resolve();
    });
  });
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    url: `http://localhost:${port}`,
    hub,
    http,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        hub.stop();
        options.store?.flush();
        for (const ws of sockets.keys()) ws.terminate();
        wss.close();
        http.close(() => resolve());
        http.closeAllConnections?.();
      }),
  };
}
