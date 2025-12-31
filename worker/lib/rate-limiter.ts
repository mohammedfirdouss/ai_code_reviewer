import { KVNamespace } from '../types';

/**
 * Rate Limiter Service - Uses Cloudflare KV for distributed rate limiting
 * 
 * Features:
 * - Token bucket algorithm
 * - Per-user and per-IP rate limiting
 * - Configurable limits
 * - Sliding window
 */

export interface RateLimitConfig {
  // Maximum requests per window
  maxRequests: number;
  // Window size in seconds
  windowSizeSeconds: number;
  // Identifier type (ip, user, api-key)
  identifierType: 'ip' | 'user' | 'api-key';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitEntry {
  count: number;
  windowStart: number;
  windowEnd: number;
}

// Default rate limit configurations
export const RATE_LIMIT_CONFIGS = {
  // Standard user: 100 requests per hour
  standard: {
    maxRequests: 100,
    windowSizeSeconds: 3600,
    identifierType: 'ip' as const
  },
  // Free tier: 20 requests per hour
  free: {
    maxRequests: 20,
    windowSizeSeconds: 3600,
    identifierType: 'ip' as const
  },
  // Premium: 500 requests per hour
  premium: {
    maxRequests: 500,
    windowSizeSeconds: 3600,
    identifierType: 'user' as const
  },
  // API: 1000 requests per hour
  api: {
    maxRequests: 1000,
    windowSizeSeconds: 3600,
    identifierType: 'api-key' as const
  },
  // Burst protection: 10 requests per minute
  burst: {
    maxRequests: 10,
    windowSizeSeconds: 60,
    identifierType: 'ip' as const
  }
};

export class RateLimiterService {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Generate rate limit key
   */
  private generateKey(identifier: string, configName: string): string {
    return `ratelimit:${configName}:${identifier}`;
  }

  /**
   * Check if request is allowed under rate limit
   */
  async checkLimit(
    identifier: string, 
    config: RateLimitConfig | keyof typeof RATE_LIMIT_CONFIGS = 'standard'
  ): Promise<RateLimitResult> {
    const configObj = typeof config === 'string' ? RATE_LIMIT_CONFIGS[config] : config;
    const configName = typeof config === 'string' ? config : 'custom';
    const key = this.generateKey(identifier, configName);
    
    const now = Date.now();
    const windowSizeMs = configObj.windowSizeSeconds * 1000;
    
    try {
      // Get current rate limit entry
      const entry = await this.kv.get(key, { type: 'json' }) as RateLimitEntry | null;
      
      // If no entry or window expired, create new window
      if (!entry || now > entry.windowEnd) {
        const newEntry: RateLimitEntry = {
          count: 1,
          windowStart: now,
          windowEnd: now + windowSizeMs
        };
        
        await this.kv.put(key, JSON.stringify(newEntry), {
          expirationTtl: configObj.windowSizeSeconds + 60 // Add buffer
        });
        
        return {
          allowed: true,
          remaining: configObj.maxRequests - 1,
          resetAt: newEntry.windowEnd
        };
      }
      
      // Check if limit exceeded
      if (entry.count >= configObj.maxRequests) {
        const retryAfter = Math.ceil((entry.windowEnd - now) / 1000);
        return {
          allowed: false,
          remaining: 0,
          resetAt: entry.windowEnd,
          retryAfter
        };
      }
      
      // Increment counter
      entry.count++;
      await this.kv.put(key, JSON.stringify(entry), {
        expirationTtl: Math.ceil((entry.windowEnd - now) / 1000) + 60
      });
      
      return {
        allowed: true,
        remaining: configObj.maxRequests - entry.count,
        resetAt: entry.windowEnd
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request on error
      return {
        allowed: true,
        remaining: configObj.maxRequests,
        resetAt: now + windowSizeMs
      };
    }
  }

  /**
   * Consume multiple tokens (for batch operations)
   */
  async consumeTokens(
    identifier: string,
    tokens: number,
    config: RateLimitConfig | keyof typeof RATE_LIMIT_CONFIGS = 'standard'
  ): Promise<RateLimitResult> {
    const configObj = typeof config === 'string' ? RATE_LIMIT_CONFIGS[config] : config;
    const configName = typeof config === 'string' ? config : 'custom';
    const key = this.generateKey(identifier, configName);
    
    const now = Date.now();
    const windowSizeMs = configObj.windowSizeSeconds * 1000;
    
    try {
      const entry = await this.kv.get(key, { type: 'json' }) as RateLimitEntry | null;
      
      if (!entry || now > entry.windowEnd) {
        if (tokens > configObj.maxRequests) {
          return {
            allowed: false,
            remaining: configObj.maxRequests,
            resetAt: now + windowSizeMs,
            retryAfter: 0
          };
        }
        
        const newEntry: RateLimitEntry = {
          count: tokens,
          windowStart: now,
          windowEnd: now + windowSizeMs
        };
        
        await this.kv.put(key, JSON.stringify(newEntry), {
          expirationTtl: configObj.windowSizeSeconds + 60
        });
        
        return {
          allowed: true,
          remaining: configObj.maxRequests - tokens,
          resetAt: newEntry.windowEnd
        };
      }
      
      const newCount = entry.count + tokens;
      
      if (newCount > configObj.maxRequests) {
        const retryAfter = Math.ceil((entry.windowEnd - now) / 1000);
        return {
          allowed: false,
          remaining: configObj.maxRequests - entry.count,
          resetAt: entry.windowEnd,
          retryAfter
        };
      }
      
      entry.count = newCount;
      await this.kv.put(key, JSON.stringify(entry), {
        expirationTtl: Math.ceil((entry.windowEnd - now) / 1000) + 60
      });
      
      return {
        allowed: true,
        remaining: configObj.maxRequests - entry.count,
        resetAt: entry.windowEnd
      };
    } catch (error) {
      console.error('Token consume error:', error);
      return {
        allowed: true,
        remaining: configObj.maxRequests,
        resetAt: now + windowSizeMs
      };
    }
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string, configName: string = 'standard'): Promise<void> {
    const key = this.generateKey(identifier, configName);
    await this.kv.delete(key);
  }

  /**
   * Get current rate limit status
   */
  async getStatus(
    identifier: string,
    config: RateLimitConfig | keyof typeof RATE_LIMIT_CONFIGS = 'standard'
  ): Promise<RateLimitResult> {
    const configObj = typeof config === 'string' ? RATE_LIMIT_CONFIGS[config] : config;
    const configName = typeof config === 'string' ? config : 'custom';
    const key = this.generateKey(identifier, configName);
    
    const now = Date.now();
    const windowSizeMs = configObj.windowSizeSeconds * 1000;
    
    try {
      const entry = await this.kv.get(key, { type: 'json' }) as RateLimitEntry | null;
      
      if (!entry || now > entry.windowEnd) {
        return {
          allowed: true,
          remaining: configObj.maxRequests,
          resetAt: now + windowSizeMs
        };
      }
      
      return {
        allowed: entry.count < configObj.maxRequests,
        remaining: Math.max(0, configObj.maxRequests - entry.count),
        resetAt: entry.windowEnd
      };
    } catch (error) {
      return {
        allowed: true,
        remaining: configObj.maxRequests,
        resetAt: now + windowSizeMs
      };
    }
  }

  /**
   * Extract identifier from request
   */
  static getIdentifier(request: Request, type: 'ip' | 'user' | 'api-key' = 'ip'): string {
    switch (type) {
      case 'ip':
        return request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
               'unknown';
      case 'user':
        return request.headers.get('X-User-ID') || 
               request.headers.get('Authorization')?.split(' ')[1] ||
               'anonymous';
      case 'api-key':
        return request.headers.get('X-API-Key') || 
               request.headers.get('Authorization')?.replace('Bearer ', '') ||
               'no-key';
      default:
        return 'unknown';
    }
  }
}
