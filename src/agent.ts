import { DurableObject } from "cloudflare:workers";
import { Env, ReviewState } from './types';
import { WebSocketHandler } from './lib/websocket-handler';

/**
 * CodeReviewerAgent - Durable Object for handling code review requests
 * 
 * This agent handles both HTTP and WebSocket connections, maintaining state
 * for reviews and conversation history.
 */
export class CodeReviewerAgent extends DurableObject {
  private state: ReviewState;
  private ctx: any;
  private env: Env;
  private wsHandler: WebSocketHandler;

  constructor(ctx: any, env: Env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    
    // Initialize state
    this.state = {
      history: [],
      reviews: []
    };
    
    // Initialize WebSocket handler
    this.wsHandler = new WebSocketHandler(this.state, env);
  }

  /**
   * Handle HTTP and WebSocket upgrade requests
   */
  async fetch(request: any): Promise<any> {
    const url = new URL(request.url);
    
    // WebSocket upgrade for real-time communication
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    // HTTP API endpoints
    return this.handleHTTPRequest(url, request);
  }
  
  /**
   * Handle WebSocket upgrade request
   */
  private handleWebSocketUpgrade(request: any): any {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    this.ctx.acceptWebSocket(server);
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
  
  /**
   * Handle HTTP API requests
   */
  private handleHTTPRequest(url: any, request: any): any {
    // GET /reviews - Return all reviews
    if (url.pathname === "/reviews" && request.method === "GET") {
      return new Response(JSON.stringify(this.state.reviews), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // GET /history - Return conversation history
    if (url.pathname === "/history" && request.method === "GET") {
      return new Response(JSON.stringify(this.state.history), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // GET /status - Service status
    if (url.pathname === "/status") {
      return new Response(JSON.stringify({
        status: "ok",
        reviewsCount: this.state.reviews.length,
        messagesCount: this.state.history.length
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Not found
    return new Response("Not found", { status: 404 });
  }

  /**
   * Handle WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.wsHandler.handleMessage(ws, message);
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // We could persist state here if needed
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
  }
}
