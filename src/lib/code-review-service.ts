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
    
    try {
      // Call Workers AI with a more reliable model
      const response = await ai.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: this.formatCodeForReview(code, language) }
          ]
        }
      );

      let fullResponse = "";
      
      // Debug: Log the response structure
      console.log("AI Response type:", typeof response);
      console.log("AI Response:", response);
      
      // Handle the response from the non-streaming model
      if (response && response.response) {
        fullResponse = response.response;
        onChunk(fullResponse);
      } else if (response && typeof response === 'string') {
        fullResponse = response;
        onChunk(fullResponse);
      } else if (response && response.text) {
        fullResponse = response.text;
        onChunk(fullResponse);
      } else if (response && response.content) {
        fullResponse = response.content;
        onChunk(fullResponse);
      } else {
        // Fallback: try to extract any text content
        console.log("Fallback response processing...");
        const result = response?.message || response?.output || JSON.stringify(response);
        if (result && typeof result === 'string') {
          fullResponse = result;
          onChunk(fullResponse);
        } else {
          throw new Error(`Unexpected AI response format: ${JSON.stringify(response)}`);
        }
      }
      
      if (!fullResponse || fullResponse.trim() === "") {
        throw new Error("AI returned empty response");
      }
      
      console.log("Final response length:", fullResponse.length);
      return fullResponse;
      
    } catch (error) {
      console.error("AI Review Error:", error);
      throw new Error(`AI review failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}