import { DurableObject } from "cloudflare:workers";

// Environment variables and bindings
export interface Env {
  CODE_REVIEWER_AGENT: DurableObjectNamespace;
  AI: WorkersAI;
  // KV Namespaces
  REVIEW_CACHE: KVNamespace;
  RATE_LIMITER: KVNamespace;
  // D1 Database
  DB: D1Database;
  // R2 Storage
  CODE_STORAGE: R2Bucket;
  // Vectorize
  VECTORIZE: VectorizeIndex;
}

// KV Namespace interface
export interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<any>;
  put(key: string, value: string | ReadableStream | ArrayBuffer, options?: { expirationTtl?: number; metadata?: any }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string; metadata?: any }[]; list_complete: boolean; cursor?: string }>;
}

// D1 Database interface
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta?: any;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

// R2 Bucket interface
export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions): Promise<R2Object>;
  delete(key: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  head(key: string): Promise<R2Object | null>;
}

export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2ListOptions {
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

export interface R2Checksums {
  md5?: ArrayBuffer;
}

export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

// Vectorize interface
export interface VectorizeIndex {
  query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches>;
  insert(vectors: VectorizeVector[]): Promise<VectorizeMutation>;
  upsert(vectors: VectorizeVector[]): Promise<VectorizeMutation>;
  deleteByIds(ids: string[]): Promise<VectorizeMutation>;
}

export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeQueryOptions {
  topK?: number;
  returnValues?: boolean;
  returnMetadata?: boolean;
  filter?: Record<string, any>;
}

export interface VectorizeMatches {
  count: number;
  matches: VectorizeMatch[];
}

export interface VectorizeMatch {
  id: string;
  score: number;
  values?: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeMutation {
  count: number;
  ids: string[];
}

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

// Code review request
export interface CodeReviewRequest {
  code: string;
  category: 'quick' | 'security' | 'performance' | 'documentation';
  language?: string;
}

// Review state stored in Durable Object
export interface ReviewState {
  history: Array<{ role: string; content: string; timestamp: number }>;
  reviews: Array<{
    id: string;
    code: string;
    category: string;
    result: string;
    timestamp: number;
  }>;
}

// Workers AI interface
export interface WorkersAI {
  run(model: string, options: WorkersAIOptions): Promise<WorkersAIResponse>;
}

export interface WorkersAIOptions {
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
}

export interface WorkersAIResponse extends AsyncIterable<{ response?: string }> {}

// Simplified Cloudflare Worker Types for our needs
export interface DurableObjectNamespace {
  newUniqueId(): { toString(): string };
  idFromName(name: string): { toString(): string };
  idFromString(idString: string): { toString(): string };
  get(id: { toString(): string }): DurableObject;
}

export interface DurableObjectState {
  acceptWebSocket(socket: any): void;
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
}

// Declare types to avoid TypeScript errors
declare global {
  // Make constructors and globals available
  const WebSocketPair: any;
  const Response: any;
  const Request: any;
  const URL: any;
  const crypto: any;
  const console: any;
  
  interface WebSocket {
    send(data: any): void;
    close(code?: number, reason?: string): void;
  }
}