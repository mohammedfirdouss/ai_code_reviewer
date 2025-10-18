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
  private env: Env;
  private wsHandler: WebSocketHandler;
  private stateReady: Promise<void>;

  constructor(ctx: any, env: Env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    
    // Initialize state
    this.state = {
      history: [],
      reviews: []
    };

    // Initialize WebSocket handler with in-memory state
    this.wsHandler = new WebSocketHandler(this.state, env);

    // Load state from storage
    this.stateReady = this.loadState();
  }

  private async loadState() {
    try {
      // Load reviews from storage
      const [reviews, history] = await Promise.all([
        this.ctx.storage.get('reviews'),
        this.ctx.storage.get('history')
      ]);

      this.state.reviews = Array.isArray(reviews) ? reviews : [];
      this.state.history = Array.isArray(history) ? history : [];
    } catch (error) {
      this.state.reviews = [];
      this.state.history = [];
      console.error('Failed to load Durable Object state:', error);
    }
  }

  private async saveState() {
    // Save state to storage
    await this.ctx.storage.put('reviews', this.state.reviews);
    await this.ctx.storage.put('history', this.state.history);
  }

  /**
   * Handle HTTP and WebSocket upgrade requests
   */
  async fetch(request: any): Promise<any> {
    await this.stateReady;
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
  private async handleHTTPRequest(url: any, request: any): Promise<any> {
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

    // POST /api/review - Handle code review via HTTP
    if (url.pathname === "/api/review" && request.method === "POST") {
      try {
        const body = await request.json();
        const { code, category = 'quick', language = 'javascript' } = body;

        if (!code) {
          return new Response(JSON.stringify({ error: 'Code is required' }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Validate language before processing
        const { validateLanguage } = await import('./lib/code-review-service');
        const validation = validateLanguage(code, language);
        
        if (!validation.isValid) {
          const errorMessage = validation.errorMessage || "Language validation failed";
          const suggestion = validation.suggestion ? ` ${validation.suggestion}` : "";
          return new Response(JSON.stringify({ 
            error: `${errorMessage}${suggestion}`,
            detectedLanguages: validation.detectedLanguages
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Perform the review
        const reviewId = this.generateReviewId();
        const review = {
          id: reviewId,
          code: code.slice(0, 2000),
          category,
          language,
          result: '',
          timestamp: Date.now()
        };

        // Add to conversation history
        this.state.history.push({
          role: "user",
          content: `Review this ${language} (${category} analysis):\n${code.slice(0, 500)}...`,
          timestamp: Date.now()
        });

        try {
          // Perform AI review
          const fullResponse = await this.performAIReview(code, category, language);
          
          review.result = fullResponse;
          this.state.reviews.push(review);
          
          this.state.history.push({
            role: "assistant",
            content: fullResponse.slice(0, 500),
            timestamp: Date.now()
          });

          // Save state
          await this.saveState();

          return new Response(JSON.stringify({
            success: true,
            review: review
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (aiError) {
          return new Response(JSON.stringify({
            success: false,
            error: aiError instanceof Error ? aiError.message : 'AI review failed'
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Invalid request'
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Not found
    return new Response("Not found", { status: 404 });
  }

  /**
   * Generate a unique review ID
   */
  private generateReviewId(): string {
    return crypto.randomUUID();
  }

  /**
   * Perform AI review using Workers AI
   */
  private async performAIReview(code: string, category: string, language: string): Promise<string> {
    const { CodeReviewService } = await import('./lib/code-review-service');
    
    // Ensure category is valid
    const validCategory = ['quick', 'security', 'performance', 'documentation'].includes(category) 
      ? category as 'quick' | 'security' | 'performance' | 'documentation'
      : 'quick';
    
    return await CodeReviewService.performReview(
      this.env.AI,
      { code, category: validCategory, language },
      (chunk: string) => {
        // The CodeReviewService handles accumulation internally
        // This callback can be used for real-time streaming if needed
      }
    );
  }

  /**
   * Handle WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.stateReady;
    await this.wsHandler.handleMessage(ws, message);
    // Save state after each message
    await this.saveState();
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
