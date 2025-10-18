import { CodeReviewRequest } from "../types";

// Language detection patterns
const LANGUAGE_PATTERNS = {
  javascript: [
    /\b(function|const|let|var|=>|console\.log|require|import|export)\b/,
    /\b(async|await|Promise|setTimeout|setInterval)\b/,
    /\.(js|jsx|ts|tsx)$/,
    /document\.|window\.|localStorage\./,
    /React\.|useState|useEffect/
  ],
  typescript: [
    /\b(interface|type|enum|namespace|implements|extends)\b/,
    /:\s*(string|number|boolean|any|void|object)/,
    /\.(ts|tsx)$/,
    /<[A-Z][^>]*>/,
    /\bas\s+\w+/
  ],
  python: [
    /\b(def|class|import|from|if __name__|print|len|range)\b/,
    /\b(self|None|True|False|elif|lambda)\b/,
    /\.py$/,
    /@\w+/,
    /\bwith\s+\w+.*:/
  ],
  java: [
    /\b(public|private|protected|static|class|interface|extends|implements)\b/,
    /\b(String|int|boolean|void|ArrayList|HashMap)\b/,
    /\.java$/,
    /System\.out\.println/,
    /\bnew\s+\w+\(/
  ],
  go: [
    /\b(package|func|var|const|import|type|struct|interface)\b/,
    /\b(fmt\.Print|make|append|len|cap)\b/,
    /\.go$/,
    /:=/,
    /\bgo\s+\w+/
  ],
  rust: [
    /\b(fn|let|mut|impl|struct|enum|trait|use|mod)\b/,
    /\b(String|Vec|Option|Result|unwrap|expect)\b/,
    /\.rs$/,
    /println!/,
    /&str|&mut/
  ],
  cpp: [
    /\b(#include|using namespace|class|struct|template|public|private)\b/,
    /\b(std::|cout|cin|endl|vector|string)\b/,
    /\.(cpp|cc|cxx|h|hpp)$/,
    /#include\s*<\w+>/,
    /\bint\s+main\s*\(/
  ],
  csharp: [
    /\b(using|namespace|class|struct|interface|public|private|static)\b/,
    /\b(string|int|bool|void|List|Dictionary|Console\.WriteLine)\b/,
    /\.cs$/,
    /\[.*\]/,
    /\bnew\s+\w+\(/
  ]
};

/**
 * Detect the programming language of the given code
 */
function detectLanguage(code: string): string[] {
  const detectedLanguages: string[] = [];
  const codeNormalized = code.toLowerCase();
  
  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    let matches = 0;
    for (const pattern of patterns) {
      if (pattern.test(codeNormalized) || pattern.test(code)) {
        matches++;
      }
    }
    
    // If at least 2 patterns match, consider it a candidate
    if (matches >= 2) {
      detectedLanguages.push(language);
    }
  }
  
  return detectedLanguages;
}

/**
 * Validate if the provided language matches the detected language
 */
function validateLanguage(code: string, providedLanguage: string): { 
  isValid: boolean; 
  detectedLanguages: string[]; 
  suggestion?: string;
  errorMessage?: string;
} {
  const detectedLanguages = detectLanguage(code);
  
  // If no language detected, it might be pseudocode or generic
  if (detectedLanguages.length === 0) {
    // Check if it looks like actual code
    const hasCodeStructure = /[{}();=\[\]]/.test(code) || /\b(if|for|while|function|class)\b/i.test(code);
    
    if (!hasCodeStructure && code.trim().length > 10) {
      return {
        isValid: false,
        detectedLanguages: [],
        errorMessage: "The provided text doesn't appear to be code. Please provide actual source code for review."
      };
    }
    
    // Allow review if it looks like code but language is unclear
    return {
      isValid: true,
      detectedLanguages: [],
      suggestion: "Could not detect specific language. Proceeding with generic code review."
    };
  }
  
  // Check if provided language matches detected languages
  const isValid = detectedLanguages.includes(providedLanguage.toLowerCase());
  
  if (!isValid) {
    const primaryDetected = detectedLanguages[0];
    return {
      isValid: false,
      detectedLanguages,
      errorMessage: `Code appears to be ${detectedLanguages.join(' or ')} but you selected ${providedLanguage}. Please select the correct language for accurate analysis.`,
      suggestion: `Try selecting "${primaryDetected}" instead.`
    };
  }
  
  return {
    isValid: true,
    detectedLanguages
  };
}

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
    
    // Validate language before processing
    const validation = validateLanguage(code, language || 'javascript');
    
    if (!validation.isValid) {
      const errorMessage = validation.errorMessage || "Language validation failed";
      const suggestion = validation.suggestion ? `\n\n💡 ${validation.suggestion}` : "";
      throw new Error(`${errorMessage}${suggestion}`);
    }
    
    // If we have a suggestion but validation passed, include it in the review
    let languageNote = "";
    if (validation.suggestion) {
      languageNote = `\n\n**Language Detection Note:** ${validation.suggestion}\n\n`;
    } else if (validation.detectedLanguages.length > 1) {
      languageNote = `\n\n**Language Detection:** Code appears to be ${validation.detectedLanguages.join(' or ')}.\n\n`;
    }
    
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
      
      // Prepend language detection note if any
      const finalResponse = languageNote + fullResponse;
      
      console.log("Final response length:", finalResponse.length);
      return finalResponse;
      
    } catch (error) {
      console.error("AI Review Error:", error);
      throw new Error(`AI review failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}