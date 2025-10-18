import { DurableObject } from "cloudflare:workers";

// Environment variables and bindings
export interface Env {
  CODE_REVIEWER_AGENT: DurableObjectNamespace;
  AI: WorkersAI;
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