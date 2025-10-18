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

      // Static assets could be served here if needed
      
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
  }
};
