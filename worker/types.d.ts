// Cloudflare Workers types
declare interface DurableObjectState {
  acceptWebSocket(socket: WebSocket): void;
}

declare interface DurableObjectNamespace {
  newUniqueId(): { toString(): string };
  idFromName(name: string): { toString(): string };
  idFromString(idString: string): { toString(): string };
  get(id: { toString(): string }): DurableObject;
}

declare interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

// Global types that would normally be available in the Worker runtime
interface Response {}
interface Request {}

// Add missing built-in types
declare const WebSocket: any;
declare const WebSocketPair: {
  new(): WebSocketPair;
};
declare const Response: {
  new(body?: BodyInit | null, init?: ResponseInit): Response;
};
declare const Request: {
  new(input: RequestInfo, init?: RequestInit): Request;
};
declare const URL: {
  new(url: string, base?: string): URL;
};
declare const crypto: {
  randomUUID(): string;
};
declare const console: {
  log(...data: any[]): void;
  error(...data: any[]): void;
  warn(...data: any[]): void;
  info(...data: any[]): void;
};