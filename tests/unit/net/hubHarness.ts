/**
 * Drives the server's Hub without sockets: fake connections record what the server sends,
 * and `client.send` feeds JSON text in, exactly like a WebSocket frame.
 */
import { contentHash, ENGINE_VERSION, getContent } from '../../../src/engine';
import type { ClientMessage, RoomSnapshot, ServerMessage, ServerMessageOf, ServerMessageType } from '../../../src/net/protocol';
import { PROTOCOL_VERSION } from '../../../src/net/protocol';
import { Hub, type HubConn, type HubOptions } from '../../../server/hub';
import { silentLogger } from '../../../server/log';
import type { RoomRecord, RoomStore } from '../../../server/persist';

export class FakeConn implements HubConn {
  readonly messages: ServerMessage[] = [];
  closed = false;

  send(message: ServerMessage): void {
    this.messages.push(message);
  }

  close(): void {
    this.closed = true;
  }

  all<K extends ServerMessageType>(type: K): Array<ServerMessageOf<K>> {
    return this.messages.filter((m): m is ServerMessageOf<K> => m.type === type);
  }

  last<K extends ServerMessageType>(type: K): ServerMessageOf<K> | undefined {
    const list = this.all(type);
    return list[list.length - 1];
  }

  room(): RoomSnapshot | null {
    return this.last('room')?.room ?? null;
  }

  errorCodes(): string[] {
    return this.all('error').map((e) => e.code);
  }
}

export interface TestClient {
  conn: FakeConn;
  send(message: ClientMessage | Record<string, unknown>): void;
  raw(text: string): void;
  id(): string;
  token(): string;
}

export function memoryStore(): RoomStore & { records: Map<string, RoomRecord> } {
  const records = new Map<string, RoomRecord>();
  return {
    records,
    save: (record) => {
      records.set(record.code, JSON.parse(JSON.stringify(record)) as RoomRecord);
    },
    remove: (code) => {
      records.delete(code);
    },
    loadAll: () => [...records.values()].map((r) => JSON.parse(JSON.stringify(r)) as RoomRecord),
    flush: () => undefined,
  };
}

export function makeHub(options: HubOptions = {}): Hub {
  return new Hub({ log: silentLogger, driver: { paceScale: 0 }, ...options });
}

export function connect(hub: Hub, name: string, token?: string): TestClient {
  const conn = new FakeConn();
  hub.connect(conn);
  const client: TestClient = {
    conn,
    send: (message) => hub.receive(conn, JSON.stringify(message)),
    raw: (text) => hub.receive(conn, text),
    id: () => conn.last('welcome')?.clientId ?? '',
    token: () => conn.last('welcome')?.token ?? '',
  };
  client.send({ type: 'hello', protocol: PROTOCOL_VERSION, name, engineVersion: ENGINE_VERSION, contentHash: contentHash(getContent()), ...(token ? { token } : {}) });
  return client;
}
