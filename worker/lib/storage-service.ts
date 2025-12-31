import { R2Bucket } from '../types';

/**
 * Storage Service - Uses Cloudflare R2 for code storage
 * 
 * Features:
 * - Store large codebases
 * - Version history
 * - Organized storage by user/review
 * - Metadata tracking
 */

export interface CodeFile {
  key: string;
  content: string;
  language: string;
  size: number;
  uploadedAt: Date;
  metadata?: Record<string, string>;
}

export interface StorageMetadata {
  reviewId: string;
  userId?: string;
  language: string;
  filename?: string;
  version?: number;
  lineCount: number;
  characterCount: number;
}

export class StorageService {
  private bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  /**
   * Generate storage key for code files
   */
  private generateKey(reviewId: string, filename?: string, version?: number): string {
    const base = `reviews/${reviewId}`;
    const file = filename || 'code.txt';
    const ver = version ? `_v${version}` : '';
    return `${base}/${file}${ver}`;
  }

  /**
   * Store code for a review
   */
  async storeCode(
    reviewId: string,
    code: string,
    options: {
      language: string;
      filename?: string;
      userId?: string;
      version?: number;
    }
  ): Promise<string> {
    const key = this.generateKey(reviewId, options.filename, options.version);
    const lines = code.split('\n').length;
    
    const metadata: StorageMetadata = {
      reviewId,
      userId: options.userId,
      language: options.language,
      filename: options.filename,
      version: options.version || 1,
      lineCount: lines,
      characterCount: code.length
    };

    await this.bucket.put(key, code, {
      httpMetadata: {
        contentType: this.getContentType(options.language)
      },
      customMetadata: this.serializeMetadata(metadata)
    });

    return key;
  }

  /**
   * Retrieve stored code
   */
  async getCode(reviewId: string, filename?: string, version?: number): Promise<CodeFile | null> {
    const key = this.generateKey(reviewId, filename, version);
    
    const object = await this.bucket.get(key);
    if (!object) return null;

    const content = await object.text();
    const metadata = this.deserializeMetadata(object.customMetadata);

    return {
      key,
      content,
      language: metadata?.language || 'unknown',
      size: object.size,
      uploadedAt: object.uploaded,
      metadata: object.customMetadata
    };
  }

  /**
   * Store multiple files (for multi-file reviews)
   */
  async storeCodeBundle(
    reviewId: string,
    files: Array<{ filename: string; content: string; language: string }>,
    userId?: string
  ): Promise<string[]> {
    const keys: string[] = [];

    for (const file of files) {
      const key = await this.storeCode(reviewId, file.content, {
        language: file.language,
        filename: file.filename,
        userId
      });
      keys.push(key);
    }

    // Store manifest
    const manifest = {
      reviewId,
      files: files.map(f => ({ filename: f.filename, language: f.language })),
      totalFiles: files.length,
      createdAt: Date.now()
    };

    await this.bucket.put(
      `reviews/${reviewId}/manifest.json`,
      JSON.stringify(manifest),
      {
        httpMetadata: { contentType: 'application/json' }
      }
    );

    return keys;
  }

  /**
   * List files for a review
   */
  async listReviewFiles(reviewId: string): Promise<string[]> {
    const result = await this.bucket.list({
      prefix: `reviews/${reviewId}/`,
      limit: 100
    });

    return result.objects.map(obj => obj.key);
  }

  /**
   * Delete all files for a review
   */
  async deleteReview(reviewId: string): Promise<number> {
    const files = await this.listReviewFiles(reviewId);
    
    if (files.length > 0) {
      await this.bucket.delete(files);
    }

    return files.length;
  }

  /**
   * Store review result (for archiving)
   */
  async storeReviewResult(
    reviewId: string,
    result: {
      code: string;
      review: string;
      category: string;
      language: string;
      model: string;
      confidence: number;
      timestamp: number;
    }
  ): Promise<string> {
    const key = `results/${reviewId}.json`;
    
    await this.bucket.put(key, JSON.stringify(result), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        category: result.category,
        language: result.language,
        model: result.model,
        confidence: String(result.confidence)
      }
    });

    return key;
  }

  /**
   * Get review result from archive
   */
  async getReviewResult(reviewId: string): Promise<any | null> {
    const key = `results/${reviewId}.json`;
    const object = await this.bucket.get(key);
    
    if (!object) return null;
    return await object.json();
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalObjects: number;
    totalSize: number;
    reviewCount: number;
  }> {
    let totalObjects = 0;
    let totalSize = 0;
    let cursor: string | undefined;
    const reviewIds = new Set<string>();

    do {
      const result = await this.bucket.list({ cursor, limit: 1000 });
      
      for (const object of result.objects) {
        totalObjects++;
        totalSize += object.size;
        
        // Extract review ID from key
        const match = object.key.match(/reviews\/([^/]+)/);
        if (match) {
          reviewIds.add(match[1]);
        }
      }
      
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    return {
      totalObjects,
      totalSize,
      reviewCount: reviewIds.size
    };
  }

  /**
   * Get content type based on language
   */
  private getContentType(language: string): string {
    const contentTypes: Record<string, string> = {
      javascript: 'text/javascript',
      typescript: 'text/typescript',
      python: 'text/x-python',
      java: 'text/x-java',
      go: 'text/x-go',
      rust: 'text/x-rust',
      cpp: 'text/x-c++src',
      csharp: 'text/x-csharp',
      html: 'text/html',
      css: 'text/css',
      json: 'application/json',
      yaml: 'text/yaml',
      markdown: 'text/markdown'
    };

    return contentTypes[language.toLowerCase()] || 'text/plain';
  }

  /**
   * Serialize metadata for R2
   */
  private serializeMetadata(metadata: StorageMetadata): Record<string, string> {
    return {
      reviewId: metadata.reviewId,
      userId: metadata.userId || '',
      language: metadata.language,
      filename: metadata.filename || '',
      version: String(metadata.version || 1),
      lineCount: String(metadata.lineCount),
      characterCount: String(metadata.characterCount)
    };
  }

  /**
   * Deserialize metadata from R2
   */
  private deserializeMetadata(metadata?: Record<string, string>): StorageMetadata | null {
    if (!metadata) return null;

    return {
      reviewId: metadata.reviewId,
      userId: metadata.userId || undefined,
      language: metadata.language,
      filename: metadata.filename || undefined,
      version: parseInt(metadata.version) || 1,
      lineCount: parseInt(metadata.lineCount) || 0,
      characterCount: parseInt(metadata.characterCount) || 0
    };
  }
}
