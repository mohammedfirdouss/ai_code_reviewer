import { D1Database } from '../types';

/**
 * Database Service - Uses Cloudflare D1 for persistent storage and analytics
 * 
 * Features:
 * - Review history storage
 * - Analytics and metrics
 * - User management
 * - Team-wide insights
 */

export interface ReviewRecord {
  id: string;
  code_hash: string;
  code_snippet: string;
  language: string;
  category: string;
  model: string;
  result: string;
  confidence: number;
  user_id: string | null;
  ip_address: string;
  created_at: number;
  processing_time_ms: number;
  token_count: number;
}

export interface AnalyticsRecord {
  total_reviews: number;
  reviews_today: number;
  avg_confidence: number;
  avg_processing_time: number;
  top_languages: { language: string; count: number }[];
  top_categories: { category: string; count: number }[];
  reviews_by_day: { date: string; count: number }[];
}

export interface UserStats {
  user_id: string;
  total_reviews: number;
  avg_confidence: number;
  most_used_language: string;
  most_used_category: string;
  first_review: number;
  last_review: number;
}

// SQL queries for creating tables
const SCHEMA = `
-- Reviews table for storing all code reviews
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  code_snippet TEXT,
  language TEXT NOT NULL,
  category TEXT NOT NULL,
  model TEXT NOT NULL,
  result TEXT NOT NULL,
  confidence REAL DEFAULT 0,
  user_id TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL,
  processing_time_ms INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_language ON reviews(language);
CREATE INDEX IF NOT EXISTS idx_reviews_category ON reviews(category);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_code_hash ON reviews(code_hash);

-- Analytics daily aggregates
CREATE TABLE IF NOT EXISTS analytics_daily (
  date TEXT PRIMARY KEY,
  total_reviews INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  avg_confidence REAL DEFAULT 0,
  avg_processing_time REAL DEFAULT 0,
  languages_json TEXT,
  categories_json TEXT
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  tier TEXT DEFAULT 'free',
  created_at INTEGER NOT NULL,
  last_active INTEGER,
  total_reviews INTEGER DEFAULT 0,
  api_key TEXT UNIQUE
);

-- Feedback table for model improvement
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  user_id TEXT,
  rating INTEGER CHECK(rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (review_id) REFERENCES reviews(id)
);
`;

export class DatabaseService {
  private db: D1Database;
  private initialized: boolean = false;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.db.exec(SCHEMA);
      this.initialized = true;
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  /**
   * Store a new review
   */
  async saveReview(review: Omit<ReviewRecord, 'id'>): Promise<string> {
    await this.initialize();
    
    const id = crypto.randomUUID();
    
    await this.db.prepare(`
      INSERT INTO reviews (
        id, code_hash, code_snippet, language, category, model, 
        result, confidence, user_id, ip_address, created_at, 
        processing_time_ms, token_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      review.code_hash,
      review.code_snippet,
      review.language,
      review.category,
      review.model,
      review.result,
      review.confidence,
      review.user_id,
      review.ip_address,
      review.created_at,
      review.processing_time_ms,
      review.token_count
    ).run();
    
    // Update daily analytics
    await this.updateDailyAnalytics(review);
    
    return id;
  }

  /**
   * Get review by ID
   */
  async getReview(id: string): Promise<ReviewRecord | null> {
    await this.initialize();
    
    return await this.db.prepare(
      'SELECT * FROM reviews WHERE id = ?'
    ).bind(id).first<ReviewRecord>();
  }

  /**
   * Get reviews by user
   */
  async getReviewsByUser(userId: string, limit: number = 50, offset: number = 0): Promise<ReviewRecord[]> {
    await this.initialize();
    
    const result = await this.db.prepare(`
      SELECT * FROM reviews 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).bind(userId, limit, offset).all<ReviewRecord>();
    
    return result.results;
  }

  /**
   * Get recent reviews
   */
  async getRecentReviews(limit: number = 100): Promise<ReviewRecord[]> {
    await this.initialize();
    
    const result = await this.db.prepare(`
      SELECT * FROM reviews 
      ORDER BY created_at DESC 
      LIMIT ?
    `).bind(limit).all<ReviewRecord>();
    
    return result.results;
  }

  /**
   * Search reviews by code hash
   */
  async findSimilarReviews(codeHash: string): Promise<ReviewRecord[]> {
    await this.initialize();
    
    const result = await this.db.prepare(`
      SELECT * FROM reviews 
      WHERE code_hash = ? 
      ORDER BY created_at DESC 
      LIMIT 10
    `).bind(codeHash).all<ReviewRecord>();
    
    return result.results;
  }

  /**
   * Get analytics overview
   */
  async getAnalytics(days: number = 30): Promise<AnalyticsRecord> {
    await this.initialize();
    
    const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const todayStart = new Date().setHours(0, 0, 0, 0);
    
    // Total reviews
    const totalResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM reviews'
    ).first<{ count: number }>();
    
    // Reviews today
    const todayResult = await this.db.prepare(
      'SELECT COUNT(*) as count FROM reviews WHERE created_at >= ?'
    ).bind(todayStart).first<{ count: number }>();
    
    // Average confidence
    const avgConfidence = await this.db.prepare(
      'SELECT AVG(confidence) as avg FROM reviews WHERE created_at >= ?'
    ).bind(startTime).first<{ avg: number }>();
    
    // Average processing time
    const avgTime = await this.db.prepare(
      'SELECT AVG(processing_time_ms) as avg FROM reviews WHERE created_at >= ?'
    ).bind(startTime).first<{ avg: number }>();
    
    // Top languages
    const languages = await this.db.prepare(`
      SELECT language, COUNT(*) as count 
      FROM reviews 
      WHERE created_at >= ? 
      GROUP BY language 
      ORDER BY count DESC 
      LIMIT 10
    `).bind(startTime).all<{ language: string; count: number }>();
    
    // Top categories
    const categories = await this.db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM reviews 
      WHERE created_at >= ? 
      GROUP BY category 
      ORDER BY count DESC
    `).bind(startTime).all<{ category: string; count: number }>();
    
    // Reviews by day
    const reviewsByDay = await this.db.prepare(`
      SELECT 
        date(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as count 
      FROM reviews 
      WHERE created_at >= ? 
      GROUP BY date 
      ORDER BY date
    `).bind(startTime).all<{ date: string; count: number }>();
    
    return {
      total_reviews: totalResult?.count || 0,
      reviews_today: todayResult?.count || 0,
      avg_confidence: avgConfidence?.avg || 0,
      avg_processing_time: avgTime?.avg || 0,
      top_languages: languages.results,
      top_categories: categories.results,
      reviews_by_day: reviewsByDay.results
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<UserStats | null> {
    await this.initialize();
    
    const stats = await this.db.prepare(`
      SELECT 
        user_id,
        COUNT(*) as total_reviews,
        AVG(confidence) as avg_confidence,
        MIN(created_at) as first_review,
        MAX(created_at) as last_review
      FROM reviews 
      WHERE user_id = ? 
      GROUP BY user_id
    `).bind(userId).first<UserStats>();
    
    if (!stats) return null;
    
    // Get most used language
    const lang = await this.db.prepare(`
      SELECT language, COUNT(*) as count 
      FROM reviews 
      WHERE user_id = ? 
      GROUP BY language 
      ORDER BY count DESC 
      LIMIT 1
    `).bind(userId).first<{ language: string }>();
    
    // Get most used category
    const cat = await this.db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM reviews 
      WHERE user_id = ? 
      GROUP BY category 
      ORDER BY count DESC 
      LIMIT 1
    `).bind(userId).first<{ category: string }>();
    
    return {
      ...stats,
      most_used_language: lang?.language || 'unknown',
      most_used_category: cat?.category || 'quick'
    };
  }

  /**
   * Save user feedback for model improvement
   */
  async saveFeedback(reviewId: string, rating: number, feedbackText?: string, userId?: string): Promise<string> {
    await this.initialize();
    
    const id = crypto.randomUUID();
    
    await this.db.prepare(`
      INSERT INTO feedback (id, review_id, user_id, rating, feedback_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, reviewId, userId || null, rating, feedbackText || null, Date.now()).run();
    
    return id;
  }

  /**
   * Update daily analytics
   */
  private async updateDailyAnalytics(review: Omit<ReviewRecord, 'id'>): Promise<void> {
    const date = new Date(review.created_at).toISOString().split('T')[0];
    
    try {
      await this.db.prepare(`
        INSERT INTO analytics_daily (date, total_reviews, avg_confidence, avg_processing_time)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          total_reviews = total_reviews + 1,
          avg_confidence = (avg_confidence * total_reviews + ?) / (total_reviews + 1),
          avg_processing_time = (avg_processing_time * total_reviews + ?) / (total_reviews + 1)
      `).bind(
        date,
        review.confidence,
        review.processing_time_ms,
        review.confidence,
        review.processing_time_ms
      ).run();
    } catch (error) {
      console.error('Failed to update daily analytics:', error);
    }
  }

  /**
   * Create or update user
   */
  async upsertUser(user: { id: string; email?: string; name?: string; tier?: string }): Promise<void> {
    await this.initialize();
    
    const now = Date.now();
    
    await this.db.prepare(`
      INSERT INTO users (id, email, name, tier, created_at, last_active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = COALESCE(?, email),
        name = COALESCE(?, name),
        tier = COALESCE(?, tier),
        last_active = ?
    `).bind(
      user.id,
      user.email || null,
      user.name || null,
      user.tier || 'free',
      now,
      now,
      user.email || null,
      user.name || null,
      user.tier || null,
      now
    ).run();
  }
}
