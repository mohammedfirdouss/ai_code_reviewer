import { Env } from './types';
import { CodeReviewerAgent } from './agent';

export { CodeReviewerAgent };

/**
 * AI Code Reviewer Worker
 * 
 * This worker routes requests to the Durable Object agent and handles CORS.
 */
export default {
  /**
   * Handle incoming requests
   */
  async fetch(request: any, env: Env): Promise<any> {
    const url = new URL(request.url);
    const corsHeaders = this.getCorsHeaders();

    // Handle preflight CORS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route to Durable Object Agent
      if (url.pathname.startsWith('/agent')) {
        return await this.handleAgentRequest(request, env, corsHeaders);
      }

      // Health check
      if (url.pathname === '/' || url.pathname === '/health') {
        return this.handleHealthCheck(corsHeaders);
      }

      // API endpoints for HTTP requests
      if (url.pathname === '/api/review' && request.method === 'POST') {
        return await this.handleCodeReview(request, env, corsHeaders);
      }

      if (url.pathname === '/api/reviews' && request.method === 'GET') {
        return await this.handleGetReviews(request, env, corsHeaders);
      }

      if (url.pathname === '/api/status' && request.method === 'GET') {
        return await this.handleStatus(request, env, corsHeaders);
      }

      // API documentation endpoint
      if (url.pathname === '/api' && request.method === 'GET') {
        return this.handleApiDocs(corsHeaders);
      }
      
      // Not found
      return new Response('Not Found', { 
        status: 404, 
        headers: corsHeaders 
      });
    } catch (error) {
      // Error handling
      return new Response(
        JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }
  },

  /**
   * Get CORS headers for cross-origin requests
   */
  getCorsHeaders() {
    return {
      'Access-Control-Allow-Origin': '*', // TODO: In production, use specific domains
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version',
      // Security headers
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
  },

  /**
   * Handle requests to the agent endpoint
   */
  async handleAgentRequest(request: any, env: Env, corsHeaders: Record<string, string>) {
    // Get or create agent instance
    const agentId = env.CODE_REVIEWER_AGENT.idFromName('default-agent');
    const agent = env.CODE_REVIEWER_AGENT.get(agentId);
    
    // Modify the URL to remove /agent prefix for the Durable Object
    const url = new URL(request.url);
    url.pathname = url.pathname.replace('/agent', '');
    
    // Create new request with modified URL
    const newRequest = new Request(url.toString(), request);
    
    // Forward request to agent
    const response = await agent.fetch(newRequest);
    
    // Don't modify WebSocket upgrade responses
    if (response.webSocket) {
      return response;
    }
    
    // Add CORS headers to HTTP responses
    const responseHeaders = { ...corsHeaders };
    if (response.headers) {
      for (const [key, value] of response.headers) {
        responseHeaders[key] = value;
      }
    }
    
    // Return response with CORS headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },

  /**
   * Handle health check requests
   */
  handleHealthCheck(corsHeaders: Record<string, string>) {
    return new Response(JSON.stringify({ 
      status: 'ok', 
      service: 'AI Code Reviewer',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      }
    });
  },

  /**
   * Handle code review via HTTP POST
   */
  async handleCodeReview(request: any, env: Env, corsHeaders: Record<string, string>) {
    try {
      const body = await request.json();
      const { code, category = 'quick', language = 'javascript' } = body;

      if (!code) {
        return new Response(JSON.stringify({ error: 'Code is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Get agent instance
      const agentId = env.CODE_REVIEWER_AGENT.idFromName('default-agent');
      const agent = env.CODE_REVIEWER_AGENT.get(agentId);

      // Create a review request
      const reviewRequest = new Request('http://localhost/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, category, language })
      });

      // Forward to agent
      const response = await agent.fetch(reviewRequest);
      const result = await response.json();

      return new Response(JSON.stringify(result), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Review failed' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },

  /**
   * Handle getting reviews via HTTP GET
   */
  async handleGetReviews(request: any, env: Env, corsHeaders: Record<string, string>) {
    try {
      const agentId = env.CODE_REVIEWER_AGENT.idFromName('default-agent');
      const agent = env.CODE_REVIEWER_AGENT.get(agentId);

      const response = await agent.fetch('http://localhost/reviews');
      const reviews = await response.json();

      return new Response(JSON.stringify(reviews), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to get reviews' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },

  /**
   * Handle status check via HTTP GET
   */
  async handleStatus(request: any, env: Env, corsHeaders: Record<string, string>) {
    try {
      const agentId = env.CODE_REVIEWER_AGENT.idFromName('default-agent');
      const agent = env.CODE_REVIEWER_AGENT.get(agentId);

      const response = await agent.fetch('http://localhost/status');
      const status = await response.json();

      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Status check failed' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },

  /**
   * Handle API documentation
   */
  handleApiDocs(corsHeaders: Record<string, string>) {
    const docs = {
      service: 'AI Code Reviewer API',
      version: '1.0.0',
      endpoints: {
        'GET /': 'Health check',
        'GET /health': 'Health check',
        'GET /api': 'API documentation (this endpoint)',
        'POST /api/review': 'Submit code for review',
        'GET /api/reviews': 'Get all reviews',
        'GET /api/status': 'Get service status',
        'GET /agent': 'WebSocket endpoint for real-time reviews'
      },
      examples: {
        'POST /api/review': {
          body: {
            code: 'console.log("Hello World");',
            category: 'quick',
            language: 'javascript'
          }
        }
      }
    };

    return new Response(JSON.stringify(docs, null, 2), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};
