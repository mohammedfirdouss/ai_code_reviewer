import { Vectorize } from '../types';

/**
 * Vector Embeddings Service - Uses Cloudflare Vectorize for code similarity
 * 
 * Features:
 * - Generate code embeddings
 * - Semantic code search
 * - Similar pattern detection
 * - Code recommendation engine
 */

export interface CodeEmbedding {
  id: string;
  vector: number[];
  metadata: {
    language: string;
    codeHash: string;
    category: string;
    confidence: number;
    review: string;
    timestamp: number;
    userId?: string;
  };
}

export interface SimilarCode {
  id: string;
  score: number;
  metadata: CodeEmbedding['metadata'];
}

export class VectorEmbeddingsService {
  private vectorize: Vectorize;

  constructor(vectorize: Vectorize) {
    this.vectorize = vectorize;
  }

  /**
   * Generate embedding for code and store in Vectorize
   */
  async embedCode(
    code: string, 
    language: string, 
    category: string,
    review: string,
    confidence: number,
    userId?: string
  ): Promise<string> {
    try {
      // Generate embedding using a text embedding model
      const embedding = await this.generateEmbedding(code);
      
      // Create unique ID
      const id = await this.generateCodeHash(code);
      
      // Metadata for the embedding
      const metadata = {
        language,
        codeHash: id,
        category,
        confidence,
        review,
        timestamp: Date.now(),
        userId
      };

      // Store in Vectorize
      await this.vectorize.insert([{
        id,
        values: embedding,
        metadata
      }]);

      return id;

    } catch (error) {
      console.error('Error embedding code:', error);
      throw error;
    }
  }

  /**
   * Find similar code patterns
   */
  async findSimilarCode(
    code: string, 
    language?: string, 
    topK: number = 5
  ): Promise<SimilarCode[]> {
    try {
      // Generate embedding for query code
      const queryEmbedding = await this.generateEmbedding(code);

      // Build filter
      const filter = language ? { language: { $eq: language } } : {};

      // Query Vectorize for similar embeddings
      const results = await this.vectorize.query({
        vector: queryEmbedding,
        topK,
        filter,
        includeMetadata: true
      });

      // Transform results
      return results.matches.map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as CodeEmbedding['metadata']
      }));

    } catch (error) {
      console.error('Error finding similar code:', error);
      return [];
    }
  }

  /**
   * Get code recommendations based on similar patterns
   */
  async getRecommendations(
    code: string, 
    language: string,
    category: string = 'quick'
  ): Promise<string[]> {
    try {
      // Find similar high-confidence reviews
      const similarCode = await this.findSimilarCode(code, language, 10);
      
      // Filter for high-confidence results in same category
      const highConfidenceMatches = similarCode.filter(item => 
        item.metadata.confidence > 80 && 
        item.metadata.category === category &&
        item.score > 0.8 // High similarity threshold
      );

      if (highConfidenceMatches.length === 0) {
        return [];
      }

      // Extract unique recommendations
      const recommendations = new Set<string>();
      
      for (const match of highConfidenceMatches) {
        // Extract actionable recommendations from review text
        const review = match.metadata.review;
        const extracted = this.extractRecommendations(review);
        extracted.forEach(rec => recommendations.add(rec));
      }

      return Array.from(recommendations).slice(0, 5); // Top 5 recommendations

    } catch (error) {
      console.error('Error getting recommendations:', error);
      return [];
    }
  }

  /**
   * Search code by natural language query
   */
  async searchCode(
    query: string,
    language?: string,
    category?: string,
    topK: number = 10
  ): Promise<SimilarCode[]> {
    try {
      // Generate embedding for natural language query
      const queryEmbedding = await this.generateEmbedding(query);

      // Build filter
      const filter: any = {};
      if (language) filter.language = { $eq: language };
      if (category) filter.category = { $eq: category };

      // Query Vectorize
      const results = await this.vectorize.query({
        vector: queryEmbedding,
        topK,
        filter,
        includeMetadata: true
      });

      // Transform and return results
      return results.matches.map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as CodeEmbedding['metadata']
      }));

    } catch (error) {
      console.error('Error searching code:', error);
      return [];
    }
  }

  /**
   * Get analytics on code patterns
   */
  async getCodePatternAnalytics(): Promise<{
    totalEmbeddings: number;
    languageDistribution: Record<string, number>;
    categoryDistribution: Record<string, number>;
    averageConfidence: number;
  }> {
    try {
      // Query all embeddings with metadata
      const allResults = await this.vectorize.query({
        vector: new Array(384).fill(0), // Dummy vector
        topK: 10000, // Large number to get all
        includeMetadata: true
      });

      const embeddings = allResults.matches.map(m => m.metadata as CodeEmbedding['metadata']);

      // Calculate analytics
      const languageDistribution: Record<string, number> = {};
      const categoryDistribution: Record<string, number> = {};
      let totalConfidence = 0;

      for (const embedding of embeddings) {
        // Language distribution
        languageDistribution[embedding.language] = 
          (languageDistribution[embedding.language] || 0) + 1;

        // Category distribution
        categoryDistribution[embedding.category] = 
          (categoryDistribution[embedding.category] || 0) + 1;

        // Confidence sum
        totalConfidence += embedding.confidence;
      }

      return {
        totalEmbeddings: embeddings.length,
        languageDistribution,
        categoryDistribution,
        averageConfidence: embeddings.length > 0 ? totalConfidence / embeddings.length : 0
      };

    } catch (error) {
      console.error('Error getting analytics:', error);
      return {
        totalEmbeddings: 0,
        languageDistribution: {},
        categoryDistribution: {},
        averageConfidence: 0
      };
    }
  }

  /**
   * Delete old embeddings to manage storage
   */
  async cleanupOldEmbeddings(olderThanDays: number = 90): Promise<number> {
    try {
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      
      // Get all embeddings
      const allResults = await this.vectorize.query({
        vector: new Array(384).fill(0), // Dummy vector
        topK: 10000,
        includeMetadata: true
      });

      // Find old embeddings
      const oldEmbeddings = allResults.matches
        .filter(match => {
          const metadata = match.metadata as CodeEmbedding['metadata'];
          return metadata.timestamp < cutoffTime;
        })
        .map(match => match.id);

      // Delete old embeddings
      if (oldEmbeddings.length > 0) {
        await this.vectorize.deleteByIds(oldEmbeddings);
      }

      return oldEmbeddings.length;

    } catch (error) {
      console.error('Error cleaning up embeddings:', error);
      return 0;
    }
  }

  /**
   * Generate embedding for text using a simple approach
   * In production, you'd use a proper embedding model
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple embedding generation - in production use proper embedding model
    // This is a placeholder implementation
    const normalized = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Create a simple hash-based embedding (384 dimensions)
    const embedding = new Array(384).fill(0);
    
    for (const word of normalized) {
      const hash = this.simpleHash(word);
      const index = Math.abs(hash) % 384;
      embedding[index] += 1;
    }

    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Simple hash function for words
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Generate hash for code content
   */
  private async generateCodeHash(code: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Extract actionable recommendations from review text
   */
  private extractRecommendations(review: string): string[] {
    const recommendations: string[] = [];
    
    // Common patterns to look for
    const patterns = [
      /Consider (?:using|implementing|adding) ([^.]+)/gi,
      /(?:Should|Could) (?:use|implement|add) ([^.]+)/gi,
      /Recommend (?:using|implementing|adding) ([^.]+)/gi,
      /Try (?:using|implementing|adding) ([^.]+)/gi,
      /Use ([^.]+) instead/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(review)) !== null) {
        const recommendation = match[1].trim();
        if (recommendation.length > 10 && recommendation.length < 100) {
          recommendations.push(recommendation);
        }
      }
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }
}