import { CodeReviewRequest } from "../types";

// Language detection patterns — tested against raw (case-sensitive) code
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  javascript: [
    /\b(function|const|let|var)\b/,
    /\b(async|await|Promise|setTimeout|setInterval)\b/,
    /\b(require|module\.exports)\b/,
    /document\.|window\.|localStorage\./,
    /console\.log\s*\(/,
  ],
  typescript: [
    /:\s*(string|number|boolean|any|void|never|unknown)\b/,
    /\binterface\s+\w+/,
    /\btype\s+\w+\s*=/,
    /\benum\s+\w+/,
    /\bas\s+\w+|<\w+>\s*\(/,
  ],
  python: [
    /\bdef\s+\w+\s*\(/,
    /\b(elif|lambda|None|True|False)\b/,
    /\bself\b/,
    /\bwith\s+\w+.*:/,
    /^\s*@\w+/m,
  ],
  java: [
    /\bSystem\.out\.print/,
    /\bpublic\s+(static\s+)?void\s+main\s*\(\s*String/,
    /\bimport\s+java\./,
    /\b(ArrayList|HashMap|LinkedList)<\w+>/,
    /@Override\b/,
  ],
  go: [
    /\bpackage\s+\w+/,
    /\bfunc\s+\w+\s*\(/,
    /\bfmt\.(Print|Println|Printf|Sprintf)/,
    /:=/,
    /\bgo\s+func\b/,
  ],
  rust: [
    /\bfn\s+\w+\s*\(/,
    /\blet\s+mut\b/,
    /\b(impl|trait|enum)\s+\w+/,
    /println!\s*\(/,
    /&str\b|&mut\b/,
  ],
  cpp: [
    /#include\s*[<"]\w+/,
    /\bstd::/,
    /\bcout\s*<</,
    /\bint\s+main\s*\(/,
    /\b(template|nullptr)\b/,
  ],
  csharp: [
    /\busing\s+(System|Microsoft)\b/,
    /\bnamespace\s+\w+/,
    /\bConsole\.Write/,
    /\b(List|Dictionary|IEnumerable)<\w+>/,
    /\basync\s+Task\b/,
  ],
};

/**
 * Detect the programming language of the given code.
 * Patterns are tested against the raw code (case-sensitive) to avoid false matches.
 */
function detectLanguage(code: string): string[] {
  const detectedLanguages: string[] = [];

  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    let matches = 0;
    for (const pattern of patterns) {
      if (pattern.test(code)) {
        matches++;
      }
    }
    if (matches >= 2) {
      detectedLanguages.push(language);
    }
  }

  return detectedLanguages;
}

/**
 * Validate if the provided language matches the detected language
 */
export function validateLanguage(code: string, providedLanguage: string): { 
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
   * Perform code review using Workers AI with real streaming.
   * Each token is forwarded to onChunk as it arrives.
   */
  static async performReview(
    ai: any,
    data: CodeReviewRequest,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const { code, category, language } = data;
    const systemPrompt = this.getSystemPrompt(category);

    try {
      const response = await ai.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: this.formatCodeForReview(code, language) }
          ],
          stream: true,
        }
      );

      let fullResponse = "";

      if (response && typeof response[Symbol.asyncIterator] === 'function') {
        for await (const chunk of response) {
          const text = chunk.response || '';
          if (text) {
            fullResponse += text;
            onChunk(text);
          }
        }
      } else if (response?.response) {
        // Non-streaming fallback
        fullResponse = response.response;
        onChunk(fullResponse);
      } else {
        throw new Error(`Unexpected AI response format`);
      }

      if (!fullResponse.trim()) {
        throw new Error("AI returned empty response");
      }

      return fullResponse;

    } catch (error) {
      throw new Error(`AI review failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}