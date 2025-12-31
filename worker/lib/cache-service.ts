import { KVNamespace } from '../types';

/**
 * Cache Service - Uses Cloudflare KV for caching review results
 * 
 * Features:
 * - Cache review results by code hash
 * - TTL-based expiration
 * - Cache hit/miss tracking
 */

// Cache TTL in seconds (24 hours default)
const DEFAULT_TTL = 60 * 60 * 24;

// Generate a hash for code content
async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface CachedReview {
  reviewId: string;
  code: string;
  category: string;
  language: string;
  result: string;
  model: string;
  confidence: number;
  timestamp: number;
  cacheHits: number;
}

export interface CacheStats {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  cachedReviews: number;
}

export class CacheService {
  private kv: KVNamespace;
  private statsKey = 'cache:stats';

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Generate a cache key based on code content and review parameters
   */
  async generateCacheKey(code: string, category: string, language: string, model: string): Promise<string> {
    const codeHash = await hashCode(code);
    return `review:${codeHash}:${category}:${language}:${model}`;
  }

  /**
   * Get a cached review result
   */
  async get(code: string, category: string, language: string, model: string): Promise<CachedReview | null> {
    try {
      const key = await this.generateCacheKey(code, category, language, model);
      const cached = await this.kv.get(key, { type: 'json' }) as CachedReview | null;
      
      if (cached) {
        // Update stats
        await this.updateStats(true);
        
        // Update cache hit count
        cached.cacheHits = (cached.cacheHits || 0) + 1;
        await this.kv.put(key, JSON.stringify(cached), { expirationTtl: DEFAULT_TTL });
        
        return cached;
      }
      
      // Update stats for miss
      await this.updateStats(false);
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Store a review result in cache
   */
  async set(
    code: string, 
    category: string, 
    language: string, 
    model: string,
    result: string,
    confidence: number,
    reviewId: string,
    ttl: number = DEFAULT_TTL
  ): Promise<void> {
    try {
      const key = await this.generateCacheKey(code, category, language, model);
      const cached: CachedReview = {
        reviewId,
        code: code.slice(0, 2000), // Store truncated code
        category,
        language,
        result,
        model,
        confidence,
        timestamp: Date.now(),
        cacheHits: 0
      };
      
      await this.kv.put(key, JSON.stringify(cached), { expirationTtl: ttl });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Invalidate a cached review
   */
  async invalidate(code: string, category: string, language: string, model: string): Promise<void> {
    try {
      const key = await this.generateCacheKey(code, category, language, model);
      await this.kv.delete(key);
    } catch (error) {
      console.error('Cache invalidate error:', error);
    }
  }

  /**
   * Update cache statistics
   */
  private async updateStats(isHit: boolean): Promise<void> {
    try {
      const stats = await this.getStats();
      if (isHit) {
        stats.totalHits++;
      } else {
        stats.totalMisses++;
      }
      stats.hitRate = stats.totalHits / (stats.totalHits + stats.totalMisses);
      await this.kv.put(this.statsKey, JSON.stringify(stats));
    } catch (error) {
      console.error('Stats update error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const stats = await this.kv.get(this.statsKey, { type: 'json' }) as CacheStats | null;
      return stats || { totalHits: 0, totalMisses: 0, hitRate: 0, cachedReviews: 0 };
    } catch (error) {
      return { totalHits: 0, totalMisses: 0, hitRate: 0, cachedReviews: 0 };
    }
  }

  /**
   * Clear all cached reviews (admin function)
   */
  async clearAll(): Promise<number> {
    try {
      let cleared = 0;
      let cursor: string | undefined;
      
      do {
        const result = await this.kv.list({ prefix: 'review:', limit: 1000, cursor });
        
        for (const key of result.keys) {
          await this.kv.delete(key.name);
          cleared++;
        }
        
        cursor = result.list_complete ? undefined : result.cursor;
      } while (cursor);
      
      // Reset stats
      await this.kv.put(this.statsKey, JSON.stringify({ 
        totalHits: 0, 
        totalMisses: 0, 
        hitRate: 0, 
        cachedReviews: 0 
      }));
      
      return cleared;
    } catch (error) {
      console.error('Cache clear error:', error);
      return 0;
    }
  }
}
