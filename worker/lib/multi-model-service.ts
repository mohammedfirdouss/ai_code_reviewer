import { WorkersAI } from '../types';

/**
 * Multi-Model AI Service
 * 
 * Features:
 * - Multiple AI models for different review types
 * - Model routing based on code category
 * - Confidence scoring
 * - Model ensemble for higher accuracy
 * - A/B testing support
 */

// Available models and their capabilities
export const AI_MODELS = {
  // Primary code review model - fast and balanced
  'llama-3.1-8b': {
    id: '@cf/meta/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    description: 'Fast, balanced code review',
    strengths: ['quick', 'documentation', 'general'],
    maxTokens: 4096,
    costTier: 'low'
  },
  // Deep analysis model - more thorough
  'llama-3.1-70b': {
    id: '@cf/meta/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    description: 'Deep, thorough analysis',
    strengths: ['security', 'performance', 'architecture'],
    maxTokens: 8192,
    costTier: 'high'
  },
  // Alternative perspective
  'mistral-7b': {
    id: '@cf/mistral/mistral-7b-instruct-v0.2',
    name: 'Mistral 7B',
    description: 'Alternative analysis perspective',
    strengths: ['quick', 'general'],
    maxTokens: 4096,
    costTier: 'low'
  },
  // Code-specific model
  'deepseek-coder': {
    id: '@cf/deepseek-ai/deepseek-coder-6.7b-instruct',
    name: 'DeepSeek Coder',
    description: 'Specialized for code understanding',
    strengths: ['performance', 'refactoring', 'bugs'],
    maxTokens: 4096,
    costTier: 'medium'
  }
} as const;

export type ModelKey = keyof typeof AI_MODELS;

// Category to model mapping
const CATEGORY_MODEL_MAP: Record<string, ModelKey[]> = {
  quick: ['llama-3.1-8b', 'mistral-7b'],
  security: ['llama-3.1-70b', 'llama-3.1-8b'],
  performance: ['deepseek-coder', 'llama-3.1-70b'],
  documentation: ['llama-3.1-8b', 'mistral-7b'],
  architecture: ['llama-3.1-70b', 'llama-3.1-8b'],
  refactoring: ['deepseek-coder', 'llama-3.1-8b']
};

// System prompts for different categories
const SYSTEM_PROMPTS = {
  quick: `You are an expert code reviewer. Provide a quick but thorough code quality assessment covering:
- Code clarity and readability
- Potential bugs and issues
- Basic best practices
- Maintainability concerns

Be concise but comprehensive. Rate your confidence in your analysis from 0-100.`,

  security: `You are a security-focused code reviewer with expertise in OWASP Top 10 vulnerabilities. Analyze for:
- SQL injection vulnerabilities
- XSS (Cross-Site Scripting) risks
- Authentication/authorization issues
- Sensitive data exposure
- Input validation problems
- Insecure dependencies
- Cryptographic weaknesses

Prioritize findings by severity. Rate your confidence from 0-100.`,

  performance: `You are a performance optimization expert. Analyze the code for:
- Algorithmic complexity (Big O analysis)
- Memory usage and leaks
- Database query efficiency
- Caching opportunities
- Async/await patterns
- Resource management
- Scalability concerns

Provide specific optimization suggestions. Rate your confidence from 0-100.`,

  documentation: `You are a documentation and code clarity expert. Review:
- Function/method documentation
- Inline comment quality
- API documentation completeness
- Code self-documentation (naming, structure)
- README and usage documentation needs
- Type annotations and interfaces

Suggest specific documentation improvements. Rate your confidence from 0-100.`,

  architecture: `You are a software architecture expert. Analyze:
- Design patterns used/needed
- SOLID principles adherence
- Separation of concerns
- Dependency management
- Modularity and reusability
- Error handling patterns
- Testability

Provide architectural recommendations. Rate your confidence from 0-100.`,

  refactoring: `You are a code refactoring expert. Identify:
- Code smells and anti-patterns
- DRY violations
- Complex conditionals to simplify
- Functions to extract or combine
- Dead code to remove
- Naming improvements
- Structure improvements

Provide specific refactoring steps. Rate your confidence from 0-100.`
};

export interface ReviewResult {
  model: string;
  modelName: string;
  result: string;
  confidence: number;
  processingTime: number;
  tokenCount: number;
}

export interface EnsembleResult {
  primaryResult: ReviewResult;
  secondaryResult?: ReviewResult;
  combinedConfidence: number;
  agreement: number;
}

export class MultiModelService {
  private ai: WorkersAI;

  constructor(ai: WorkersAI) {
    this.ai = ai;
  }

  /**
   * Select the best model(s) for the given category
   */
  selectModels(category: string): ModelKey[] {
    return CATEGORY_MODEL_MAP[category] || CATEGORY_MODEL_MAP.quick;
  }

  /**
   * Get model info
   */
  getModelInfo(modelKey: ModelKey) {
    return AI_MODELS[modelKey];
  }

  /**
   * Perform code review with a specific model
   */
  async reviewWithModel(
    code: string,
    category: string,
    language: string,
    modelKey: ModelKey,
    onChunk?: (chunk: string) => void
  ): Promise<ReviewResult> {
    const model = AI_MODELS[modelKey];
    const systemPrompt = SYSTEM_PROMPTS[category as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.quick;
    
    const startTime = Date.now();
    
    const userPrompt = `Review this ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`

Provide your analysis and end with a confidence score in the format:
**Confidence: XX/100**`;

    try {
      const response = await this.ai.run(model.id, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: !!onChunk
      });

      let result = '';
      
      if (onChunk && Symbol.asyncIterator in response) {
        // Streaming response
        for await (const chunk of response) {
          if (chunk.response) {
            result += chunk.response;
            onChunk(chunk.response);
          }
        }
      } else {
        // Non-streaming response
        result = (response as any).response || JSON.stringify(response);
      }

      const processingTime = Date.now() - startTime;
      const confidence = this.extractConfidence(result);
      const tokenCount = this.estimateTokens(code + result);

      return {
        model: model.id,
        modelName: model.name,
        result,
        confidence,
        processingTime,
        tokenCount
      };
    } catch (error) {
      console.error(`Model ${modelKey} failed:`, error);
      throw error;
    }
  }

  /**
   * Perform review with model ensemble (multiple models)
   */
  async reviewWithEnsemble(
    code: string,
    category: string,
    language: string,
    onChunk?: (chunk: string) => void
  ): Promise<EnsembleResult> {
    const models = this.selectModels(category);
    const primaryModel = models[0];
    
    // Always run primary model
    const primaryResult = await this.reviewWithModel(
      code, category, language, primaryModel, onChunk
    );

    // If confidence is low and we have a secondary model, run it too
    let secondaryResult: ReviewResult | undefined;
    let agreement = 100;

    if (primaryResult.confidence < 70 && models.length > 1) {
      const secondaryModel = models[1];
      
      try {
        secondaryResult = await this.reviewWithModel(
          code, category, language, secondaryModel
        );
        
        // Calculate agreement between models
        agreement = this.calculateAgreement(primaryResult.result, secondaryResult.result);
      } catch (error) {
        console.error('Secondary model failed:', error);
      }
    }

    // Calculate combined confidence
    const combinedConfidence = secondaryResult
      ? (primaryResult.confidence * 0.6 + secondaryResult.confidence * 0.3 + agreement * 0.1)
      : primaryResult.confidence;

    return {
      primaryResult,
      secondaryResult,
      combinedConfidence,
      agreement
    };
  }

  /**
   * Quick review with the fastest model
   */
  async quickReview(
    code: string,
    language: string,
    onChunk?: (chunk: string) => void
  ): Promise<ReviewResult> {
    return this.reviewWithModel(code, 'quick', language, 'llama-3.1-8b', onChunk);
  }

  /**
   * Deep review with the most capable model
   */
  async deepReview(
    code: string,
    category: string,
    language: string,
    onChunk?: (chunk: string) => void
  ): Promise<ReviewResult> {
    return this.reviewWithModel(code, category, language, 'llama-3.1-70b', onChunk);
  }

  /**
   * Extract confidence score from model response
   */
  private extractConfidence(result: string): number {
    // Look for patterns like "Confidence: 85/100" or "confidence: 85%"
    const patterns = [
      /\*\*Confidence:\s*(\d+)\/100\*\*/i,
      /Confidence:\s*(\d+)\/100/i,
      /confidence:\s*(\d+)%/i,
      /confidence\s+score[:\s]+(\d+)/i,
      /(\d+)\/100\s*confidence/i
    ];

    for (const pattern of patterns) {
      const match = result.match(pattern);
      if (match) {
        const confidence = parseInt(match[1]);
        if (confidence >= 0 && confidence <= 100) {
          return confidence;
        }
      }
    }

    // Default confidence based on response length and quality indicators
    const hasCodeBlocks = /```[\s\S]*```/.test(result);
    const hasBulletPoints = /^[\s]*[-*•]\s/m.test(result);
    const wordCount = result.split(/\s+/).length;

    let defaultConfidence = 60;
    if (hasCodeBlocks) defaultConfidence += 10;
    if (hasBulletPoints) defaultConfidence += 5;
    if (wordCount > 200) defaultConfidence += 10;
    if (wordCount > 500) defaultConfidence += 5;

    return Math.min(defaultConfidence, 85);
  }

  /**
   * Calculate agreement between two model outputs
   */
  private calculateAgreement(result1: string, result2: string): number {
    // Simple keyword-based agreement calculation
    const keywords1 = this.extractKeywords(result1);
    const keywords2 = this.extractKeywords(result2);

    const intersection = keywords1.filter(k => keywords2.includes(k));
    const union = [...new Set([...keywords1, ...keywords2])];

    if (union.length === 0) return 50;
    return Math.round((intersection.length / union.length) * 100);
  }

  /**
   * Extract important keywords from review
   */
  private extractKeywords(text: string): string[] {
    const importantTerms = [
      'bug', 'error', 'vulnerability', 'security', 'performance',
      'memory', 'leak', 'injection', 'xss', 'sql', 'auth',
      'refactor', 'complexity', 'duplicate', 'dead code',
      'naming', 'documentation', 'comment', 'type', 'null',
      'exception', 'async', 'promise', 'callback', 'race condition'
    ];

    const lowerText = text.toLowerCase();
    return importantTerms.filter(term => lowerText.includes(term));
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return Object.entries(AI_MODELS).map(([key, model]) => ({
      key,
      ...model
    }));
  }

  /**
   * Get categories
   */
  getCategories() {
    return Object.keys(SYSTEM_PROMPTS);
  }
}
