import { D1Database } from '../types';
import { DatabaseService } from './database-service';
import { VectorEmbeddingsService } from './vector-embeddings-service';

/**
 * Advanced Analytics Service
 * 
 * Features:
 * - Team performance metrics
 * - Code quality trends
 * - Language usage statistics
 * - AI model performance tracking
 * - Security issue tracking
 * - Custom dashboards
 */

export interface AnalyticsDashboard {
  overview: {
    totalReviews: number;
    averageConfidence: number;
    topLanguages: Array<{ language: string; count: number }>;
    reviewsToday: number;
    trendsWeekly: number[];
  };
  performance: {
    averageProcessingTime: number;
    modelUsage: Record<string, number>;
    categoryDistribution: Record<string, number>;
    hourlyDistribution: number[];
  };
  quality: {
    issuesFound: number;
    securityIssues: number;
    performanceIssues: number;
    topIssueTypes: Array<{ type: string; count: number }>;
    qualityTrend: number[];
  };
  team: {
    activeUsers: number;
    topReviewers: Array<{ userId: string; count: number }>;
    collaborationMetrics: {
      sharedReviews: number;
      avgSessionLength: number;
    };
  };
}

export interface TrendData {
  date: string;
  reviews: number;
  averageConfidence: number;
  issues: number;
  processingTime: number;
}

export interface LanguageMetrics {
  language: string;
  totalReviews: number;
  averageConfidence: number;
  commonIssues: string[];
  trendsWeekly: number[];
}

export class AdvancedAnalyticsService {
  private db: DatabaseService;
  private vectorService: VectorEmbeddingsService;

  constructor(database: D1Database, vectorService: VectorEmbeddingsService) {
    this.db = new DatabaseService(database);
    this.vectorService = vectorService;
  }

  /**
   * Get comprehensive analytics dashboard
   */
  async getDashboard(timeRange: number = 30): Promise<AnalyticsDashboard> {
    const endTime = Date.now();
    const startTime = endTime - (timeRange * 24 * 60 * 60 * 1000);

    const [overview, performance, quality, team] = await Promise.all([
      this.getOverviewMetrics(startTime, endTime),
      this.getPerformanceMetrics(startTime, endTime),
      this.getQualityMetrics(startTime, endTime),
      this.getTeamMetrics(startTime, endTime)
    ]);

    return {
      overview,
      performance,
      quality,
      team
    };
  }

  /**
   * Get overview metrics
   */
  private async getOverviewMetrics(startTime: number, endTime: number) {
    // Total reviews in time range
    const totalReviews = await this.db.getReviewCount(startTime, endTime);
    
    // Average confidence
    const avgConfidence = await this.db.getAverageConfidence(startTime, endTime);
    
    // Top languages
    const languageStats = await this.db.getLanguageStatistics(startTime, endTime);
    const topLanguages = Object.entries(languageStats)
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Reviews today
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const reviewsToday = await this.db.getReviewCount(todayStart, Date.now());

    // Weekly trends (last 7 days)
    const trendsWeekly = await this.getWeeklyTrends(7);

    return {
      totalReviews,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      topLanguages,
      reviewsToday,
      trendsWeekly
    };
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(startTime: number, endTime: number) {
    // Average processing time
    const avgProcessingTime = await this.db.getAverageProcessingTime(startTime, endTime);
    
    // Model usage statistics
    const modelUsage = await this.db.getModelUsageStats(startTime, endTime);
    
    // Category distribution
    const categoryDistribution = await this.db.getCategoryStats(startTime, endTime);
    
    // Hourly distribution (24 hours)
    const hourlyDistribution = await this.getHourlyDistribution(startTime, endTime);

    return {
      averageProcessingTime: Math.round(avgProcessingTime),
      modelUsage,
      categoryDistribution,
      hourlyDistribution
    };
  }

  /**
   * Get quality metrics
   */
  private async getQualityMetrics(startTime: number, endTime: number) {
    // Count reviews with issues
    const issuesFound = await this.countReviewsWithIssues(startTime, endTime);
    
    // Security-specific issues
    const securityIssues = await this.countSecurityIssues(startTime, endTime);
    
    // Performance-specific issues
    const performanceIssues = await this.countPerformanceIssues(startTime, endTime);
    
    // Top issue types
    const topIssueTypes = await this.getTopIssueTypes(startTime, endTime);
    
    // Quality trend over time
    const qualityTrend = await this.getQualityTrend(7);

    return {
      issuesFound,
      securityIssues,
      performanceIssues,
      topIssueTypes,
      qualityTrend
    };
  }

  /**
   * Get team metrics
   */
  private async getTeamMetrics(startTime: number, endTime: number) {
    // Active users (users with reviews in time range)
    const activeUsers = await this.db.getActiveUserCount(startTime, endTime);
    
    // Top reviewers
    const topReviewers = await this.db.getTopReviewers(startTime, endTime, 10);
    
    // Collaboration metrics
    const sharedReviews = await this.db.getSharedReviewCount(startTime, endTime);
    const avgSessionLength = await this.db.getAverageSessionLength(startTime, endTime);

    return {
      activeUsers,
      topReviewers: topReviewers.map(([userId, count]) => ({ userId, count })),
      collaborationMetrics: {
        sharedReviews,
        avgSessionLength: Math.round(avgSessionLength / 1000 / 60) // Convert to minutes
      }
    };
  }

  /**
   * Get trends for specific time periods
   */
  async getTrends(days: number = 30): Promise<TrendData[]> {
    const trends: TrendData[] = [];
    const now = Date.now();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now - (i * 24 * 60 * 60 * 1000));
      const dayStart = new Date(date).setHours(0, 0, 0, 0);
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);

      const [reviews, avgConfidence, issues, processingTime] = await Promise.all([
        this.db.getReviewCount(dayStart, dayEnd),
        this.db.getAverageConfidence(dayStart, dayEnd),
        this.countReviewsWithIssues(dayStart, dayEnd),
        this.db.getAverageProcessingTime(dayStart, dayEnd)
      ]);

      trends.push({
        date: date.toISOString().split('T')[0],
        reviews,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        issues,
        processingTime: Math.round(processingTime)
      });
    }

    return trends;
  }

  /**
   * Get detailed language metrics
   */
  async getLanguageMetrics(language: string, days: number = 30): Promise<LanguageMetrics> {
    const endTime = Date.now();
    const startTime = endTime - (days * 24 * 60 * 60 * 1000);

    // Basic metrics
    const totalReviews = await this.db.getLanguageReviewCount(language, startTime, endTime);
    const averageConfidence = await this.db.getLanguageAverageConfidence(language, startTime, endTime);

    // Common issues for this language
    const commonIssues = await this.getLanguageCommonIssues(language, startTime, endTime);

    // Weekly trends
    const trendsWeekly = await this.getLanguageWeeklyTrends(language, 7);

    return {
      language,
      totalReviews,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      commonIssues,
      trendsWeekly
    };
  }

  /**
   * Export analytics data
   */
  async exportData(format: 'json' | 'csv', timeRange: number = 30): Promise<string> {
    const dashboard = await this.getDashboard(timeRange);
    const trends = await this.getTrends(timeRange);

    const exportData = {
      dashboard,
      trends,
      exportedAt: new Date().toISOString(),
      timeRange
    };

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    } else {
      return this.convertToCSV(exportData);
    }
  }

  /**
   * Get real-time metrics for live dashboard
   */
  async getRealtimeMetrics(): Promise<{
    activeReviews: number;
    reviewsLastHour: number;
    averageResponseTime: number;
    systemHealth: 'good' | 'warning' | 'critical';
  }> {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);

    const reviewsLastHour = await this.db.getReviewCount(hourAgo, now);
    const averageResponseTime = await this.db.getAverageProcessingTime(hourAgo, now);

    // Determine system health based on metrics
    let systemHealth: 'good' | 'warning' | 'critical' = 'good';
    if (averageResponseTime > 5000) systemHealth = 'warning';
    if (averageResponseTime > 10000) systemHealth = 'critical';

    return {
      activeReviews: 0, // Would be real-time from Durable Objects
      reviewsLastHour,
      averageResponseTime: Math.round(averageResponseTime),
      systemHealth
    };
  }

  // Helper methods

  private async getWeeklyTrends(days: number): Promise<number[]> {
    const trends: number[] = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now - (i * 24 * 60 * 60 * 1000)).setHours(0, 0, 0, 0);
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      const count = await this.db.getReviewCount(dayStart, dayEnd);
      trends.push(count);
    }

    return trends;
  }

  private async getHourlyDistribution(startTime: number, endTime: number): Promise<number[]> {
    const distribution = new Array(24).fill(0);
    
    // Get all reviews in time range
    const reviews = await this.db.getReviewsInRange(startTime, endTime);
    
    for (const review of reviews) {
      const hour = new Date(review.created_at).getHours();
      distribution[hour]++;
    }

    return distribution;
  }

  private async countReviewsWithIssues(startTime: number, endTime: number): Promise<number> {
    const reviews = await this.db.getReviewsInRange(startTime, endTime);
    return reviews.filter(review => 
      review.result.toLowerCase().includes('issue') ||
      review.result.toLowerCase().includes('problem') ||
      review.result.toLowerCase().includes('bug') ||
      review.result.toLowerCase().includes('vulnerability')
    ).length;
  }

  private async countSecurityIssues(startTime: number, endTime: number): Promise<number> {
    const reviews = await this.db.getReviewsInRange(startTime, endTime);
    return reviews.filter(review => 
      review.category === 'security' &&
      (review.result.toLowerCase().includes('security') ||
       review.result.toLowerCase().includes('vulnerability') ||
       review.result.toLowerCase().includes('exploit'))
    ).length;
  }

  private async countPerformanceIssues(startTime: number, endTime: number): Promise<number> {
    const reviews = await this.db.getReviewsInRange(startTime, endTime);
    return reviews.filter(review => 
      review.category === 'performance' &&
      (review.result.toLowerCase().includes('slow') ||
       review.result.toLowerCase().includes('performance') ||
       review.result.toLowerCase().includes('optimization'))
    ).length;
  }

  private async getTopIssueTypes(startTime: number, endTime: number): Promise<Array<{ type: string; count: number }>> {
    const reviews = await this.db.getReviewsInRange(startTime, endTime);
    const issueTypes: Record<string, number> = {};

    const patterns = {
      'Security Vulnerability': /security|vulnerability|exploit|injection|xss/i,
      'Performance Issue': /slow|performance|optimization|memory|cpu/i,
      'Code Quality': /quality|readable|maintainable|complex/i,
      'Bug Risk': /bug|error|exception|null|undefined/i,
      'Documentation': /comment|documentation|unclear|confusing/i
    };

    for (const review of reviews) {
      for (const [type, pattern] of Object.entries(patterns)) {
        if (pattern.test(review.result)) {
          issueTypes[type] = (issueTypes[type] || 0) + 1;
        }
      }
    }

    return Object.entries(issueTypes)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private async getQualityTrend(days: number): Promise<number[]> {
    const trend: number[] = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now - (i * 24 * 60 * 60 * 1000)).setHours(0, 0, 0, 0);
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      
      const totalReviews = await this.db.getReviewCount(dayStart, dayEnd);
      const issuesFound = await this.countReviewsWithIssues(dayStart, dayEnd);
      
      const qualityScore = totalReviews > 0 ? ((totalReviews - issuesFound) / totalReviews) * 100 : 100;
      trend.push(Math.round(qualityScore));
    }

    return trend;
  }

  private async getLanguageCommonIssues(language: string, startTime: number, endTime: number): Promise<string[]> {
    const reviews = await this.db.getLanguageReviews(language, startTime, endTime);
    const issueMap: Record<string, number> = {};

    for (const review of reviews) {
      // Extract common issues from review text
      const issues = this.extractIssues(review.result);
      for (const issue of issues) {
        issueMap[issue] = (issueMap[issue] || 0) + 1;
      }
    }

    return Object.entries(issueMap)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([issue]) => issue);
  }

  private async getLanguageWeeklyTrends(language: string, days: number): Promise<number[]> {
    const trend: number[] = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now - (i * 24 * 60 * 60 * 1000)).setHours(0, 0, 0, 0);
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      const count = await this.db.getLanguageReviewCount(language, dayStart, dayEnd);
      trend.push(count);
    }

    return trend;
  }

  private extractIssues(reviewText: string): string[] {
    const issues: string[] = [];
    const patterns = [
      /(?:issue|problem|concern)(?:s)?:?\s*([^.!?]+)/gi,
      /(?:should|could|might want to)\s+([^.!?]+)/gi,
      /(?:consider|try|use)\s+([^.!?]+)\s+instead/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(reviewText)) !== null) {
        const issue = match[1].trim();
        if (issue.length > 10 && issue.length < 100) {
          issues.push(issue);
        }
      }
    }

    return [...new Set(issues)];
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion for trends data
    const { trends } = data;
    const headers = 'Date,Reviews,Average Confidence,Issues,Processing Time\\n';
    const rows = trends.map((trend: TrendData) => 
      `${trend.date},${trend.reviews},${trend.averageConfidence},${trend.issues},${trend.processingTime}`
    ).join('\\n');
    
    return headers + rows;
  }
}