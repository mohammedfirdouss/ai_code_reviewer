import { CodeReviewRequest } from "../types";

// Review category-specific system prompts
const SYSTEM_PROMPTS = {
  quick: `You are an expert code reviewer with deep knowledge of multiple programming languages, security best practices, and software engineering principles. 
          Provide a quick overall code quality assessment covering: clarity, maintainability, potential bugs, and basic best practices.`,
  
  security: `You are an expert code reviewer with deep knowledge of multiple programming languages, security best practices, and software engineering principles.
             Focus on security vulnerabilities including: SQL injection, XSS, authentication issues, sensitive data exposure, input validation, and other OWASP top 10 concerns.`,
  
  performance: `You are an expert code reviewer with deep knowledge of multiple programming languages, security best practices, and software engineering principles.
                Analyze performance aspects: algorithmic complexity, memory usage, database query optimization, caching opportunities, async/await patterns, and scalability concerns.`,
  
  documentation: `You are an expert code reviewer with deep knowledge of multiple programming languages, security best practices, and software engineering principles.
                  Review documentation quality and suggest improvements: function/class documentation, inline comments, README updates, API documentation, and code clarity.`
};

export class CodeReviewService {
  /**
   * Get system prompt based on review category
   */
  static getSystemPrompt(category: string): string {
    return SYSTEM_PROMPTS[category as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.quick;
  }

  /**
   * Format the user's code for review
   */
  static formatCodeForReview(code: string, language?: string): string {
    return `Review this code:\n\`\`\`${language || ''}\n${code}\n\`\`\``;
  }

  /**
   * Generate a unique review ID
   */
  static generateReviewId(): string {
    return crypto.randomUUID();
  }

  /**
   * Perform code review using Workers AI
   */
  static async performReview(
    ai: any, 
    data: CodeReviewRequest, 
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const { code, category, language } = data;
    const systemPrompt = this.getSystemPrompt(category);
    
    // Call Workers AI with Llama 3.3
    const response = await ai.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: this.formatCodeForReview(code, language) }
        ],
        stream: true
      }
    );

    let fullResponse = "";
    
    // Debug: Log the response structure
    console.log("AI Response type:", typeof response);
    console.log("AI Response keys:", response ? Object.keys(response) : "null");
    
    // Handle both streaming and non-streaming responses
    if (response && typeof response[Symbol.asyncIterator] === 'function') {
      // Stream the response
      for await (const chunk of response) {
        if (chunk.response) {
          fullResponse += chunk.response;
          onChunk(chunk.response);
        }
      }
    } else {
      // Handle non-streaming response - try different possible response formats
      const result = response?.response || response?.text || response?.content || response?.message || response?.output || JSON.stringify(response);
      fullResponse = result || "No response received";
      onChunk(fullResponse);
      console.log("Non-streaming result:", result);
    }
    
    return fullResponse;
  }
}