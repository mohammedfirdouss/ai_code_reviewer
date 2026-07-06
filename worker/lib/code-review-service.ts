import { CodeReviewRequest, ReviewFinding, StructuredReview } from "../types";

// The single Workers AI model backing every review pass (main prose, lenses,
// and the confidence pass). Kept as one constant so all AI.run() calls stay
// on a model that is actually available/verified on this account.
const REVIEW_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

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

// ─── Narrow-scope "lens" prompts (part B) ─────────────────────────────────
// Each lens is a single-purpose pass over the code, returning only findings
// within its narrow focus as JSON. Several lenses run concurrently per
// review and their findings are merged.

interface LensDef {
  id: string;
  defaultCategory: string;
  instruction: string;
}

const LENS_DEFS: Record<string, LensDef> = {
  bug: {
    id: 'bug',
    defaultCategory: 'bug',
    instruction: `Find only concrete bugs and correctness issues: logic errors, off-by-one errors, null/undefined handling, race conditions, unhandled exceptions/rejections, incorrect API usage, resource leaks. Ignore style, formatting, documentation, and pure performance concerns.`,
  },
  security: {
    id: 'security',
    defaultCategory: 'security',
    instruction: `Find only security vulnerabilities per the OWASP Top 10: injection (SQL/XSS/command/etc.), broken authentication/authorization, sensitive data exposure, insecure input validation, cryptographic weaknesses, insecure dependencies or deserialization. Ignore style and non-security bugs.`,
  },
  performance: {
    id: 'performance',
    defaultCategory: 'performance',
    instruction: `Find only performance issues: algorithmic complexity (Big O), memory usage/leaks, inefficient database or network calls, missed caching opportunities, blocking operations, unnecessary re-computation, scalability concerns. Ignore style and security.`,
  },
  style: {
    id: 'style',
    defaultCategory: 'style',
    instruction: `Find only style, documentation, and project-guideline compliance issues: missing/incorrect comments or docstrings, unclear naming, inconsistent formatting, missing API documentation. If a finding is specifically a violation of the project-specific rules supplied below, set its "category" field to "guideline" instead of "style". Ignore bugs, security, and performance issues.`,
  },
};

// Which lenses run for each review category. 2-3 narrow passes per review,
// chosen to be sensible for that category rather than running all lenses
// every time.
const CATEGORY_LENSES: Record<string, string[]> = {
  quick: ['bug', 'style'],
  security: ['security', 'bug'],
  performance: ['performance', 'bug'],
  documentation: ['style', 'bug'],
};

const FINDINGS_JSON_INSTRUCTIONS = `Respond with ONLY a single fenced code block, tagged \`\`\`json, containing a JSON array of findings — nothing before or after it. If there are no findings, respond with an empty array: \`\`\`json\n[]\n\`\`\`

Each element of the array must match this exact shape:
{
  "line": <integer, optional, best-effort 1-indexed line number within the submitted code>,
  "endLine": <integer, optional, for multi-line findings>,
  "severity": "critical" | "important" | "nitpick",
  "category": "bug" | "security" | "performance" | "documentation" | "style" | "guideline",
  "summary": "<one-line description of the issue>",
  "detail": "<optional, longer explanation>",
  "suggestion": "<optional, suggested fix>"
}

Do not include a "confidence" field — confidence is scored separately.`;

// ─── Confidence + false-positive filtering pass (part C) ──────────────────
// Rubric adapted from Anthropic's own code-review plugin.
const CONFIDENCE_RUBRIC = `Rate each finding's confidence from 0-100 using this rubric:
- 0: not confident at all — false positive, or a pre-existing issue unrelated to review scope
- 25: somewhat confident — might be real, might not; unverified
- 50: moderately confident — verified real, but minor/nitpick
- 75: highly confident — verified, will matter in practice
- 100: absolutely certain — critical, definitely real

Common false-positive patterns to watch for and score low:
- Pre-existing issues not introduced by, or unrelated to, the reviewed code
- Things that look like bugs but are actually intentional/correct behavior
- Pedantic nitpicks a senior engineer wouldn't bother raising
- Issues a linter, type-checker, or compiler would already catch automatically
- Issues explicitly silenced by a comment (e.g. eslint-disable, // noqa, # type: ignore)
- Intentional or likely-deliberate design choices, even if unconventional`;

export class CodeReviewService {
  /**
   * Get system prompt based on review category, optionally folding in
   * user-supplied project rules (part D).
   */
  static getSystemPrompt(category: string, rules?: string): string {
    const base = SYSTEM_PROMPTS[category as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.quick;
    return this.withRules(base, rules);
  }

  private static withRules(prompt: string, rules?: string): string {
    if (rules && rules.trim()) {
      return `${prompt}\n\nAdditionally check compliance with these project-specific rules:\n${rules.trim()}`;
    }
    return prompt;
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
    const { code, category, language, rules } = data;
    const systemPrompt = this.getSystemPrompt(category, rules);

    try {
      const response = await ai.run(
        REVIEW_MODEL,
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
        const decoder = new (globalThis as any).TextDecoder();
        const bufferRef = { value: "" };

        for await (const chunk of response) {
          const text = this.extractStreamChunkText(chunk, decoder, bufferRef);
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

  /**
   * Pull the text token out of one streamed AI.run() chunk.
   *
   * Workers AI has shipped two different shapes for this model's stream
   * items: an older pre-parsed `{ response: string }` object, and a newer
   * one where each chunk is the raw bytes of an OpenAI-style SSE frame
   * (`data: {"choices":[{"delta":{"content":"..."}}], ...}\n\n`) with the
   * token living at `choices[0].delta.content` instead. Handle both so a
   * silent backend switch doesn't turn into a silent empty response again.
   *
   * `bufferRef` carries any partial SSE frame left over between calls (a
   * chunk boundary can land mid-frame); callers own the ref and should pass
   * a fresh `{ value: "" }` per response stream.
   */
  private static extractStreamChunkText(
    chunk: any,
    decoder: any,
    bufferRef: { value: string }
  ): string {
    if (chunk && typeof chunk === 'object' && !(chunk instanceof Uint8Array) && typeof chunk.response === 'string') {
      return chunk.response;
    }

    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(Object.values(chunk));
    const sseBuffer = bufferRef.value + decoder.decode(bytes, { stream: true });
    const frames = sseBuffer.split("\n\n");
    bufferRef.value = frames.pop() || "";

    let text = '';
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        text += parsed.response || parsed.choices?.[0]?.delta?.content || '';
      } catch {
        // Incomplete/malformed frame — skip rather than throw.
      }
    }
    return text;
  }

  /**
   * Produce a structured review: run narrow-scope lenses concurrently (B),
   * merge + lightly dedup their findings, then run an independent
   * confidence/false-positive pass over the merged list (C). Never throws —
   * on any failure this degrades to an empty findings list / neutral
   * confidence rather than breaking the surrounding review flow.
   */
  static async generateStructuredReview(
    ai: any,
    data: CodeReviewRequest
  ): Promise<StructuredReview> {
    try {
      const { code, category, language, rules } = data;
      const lensIds = CATEGORY_LENSES[category] || CATEGORY_LENSES.quick;

      const lensResults = await Promise.all(
        lensIds.map((id) => this.runLens(ai, id, code, language, rules))
      );

      const merged = this.dedupeFindings(lensResults.flat());
      if (merged.length === 0) {
        return { findings: [], summary: 'No issues found.' };
      }

      return await this.scoreConfidenceAndSummarize(ai, code, merged);
    } catch (error) {
      // Absolute last-resort fallback — generateStructuredReview must never throw.
      return { findings: [], summary: '' };
    }
  }

  /**
   * Run a single narrow-scope lens and parse its findings JSON.
   */
  private static async runLens(
    ai: any,
    lensId: string,
    code: string,
    language: string | undefined,
    rules: string | undefined
  ): Promise<ReviewFinding[]> {
    const lens = LENS_DEFS[lensId];
    if (!lens) return [];

    const systemPrompt = this.withRules(
      `You are an expert code reviewer performing a single, narrow-focus pass on submitted code. ${lens.instruction}\n\n${FINDINGS_JSON_INSTRUCTIONS}`,
      rules
    );

    try {
      const response = await ai.run(REVIEW_MODEL, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: this.formatCodeForReview(code, language) }
        ],
        stream: false,
      });

      const text = await this.collectResponseText(response);
      return this.parseFindingsJson(text, lens.defaultCategory);
    } catch (error) {
      console.error(`[CodeReviewService.runLens] Lens "${lensId}" failed, returning no findings from this lens:`, error);
      return [];
    }
  }

  /**
   * Collect full text from a Workers AI response, whether it came back as
   * an async-iterable stream or a plain { response } object. Reuses
   * extractStreamChunkText so the async-iterable branch handles both the
   * legacy `{ response }` shape and raw-bytes SSE frames, same as
   * performReview's streaming path.
   */
  private static async collectResponseText(response: any): Promise<string> {
    if (response && typeof response[Symbol.asyncIterator] === 'function') {
      const decoder = new (globalThis as any).TextDecoder();
      const bufferRef = { value: "" };
      let text = '';
      for await (const chunk of response) {
        text += this.extractStreamChunkText(chunk, decoder, bufferRef);
      }
      return text;
    }
    return response?.response || '';
  }

  /**
   * Parse a model's fenced ```json findings array, tolerating models that
   * wrap it in prose or forget the language tag. Never throws.
   */
  private static parseFindingsJson(text: string, defaultCategory: string): ReviewFinding[] {
    try {
      const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
      const jsonStr = (fenced ? fenced[1] : text).trim();
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) return [];

      const validSeverities = new Set(['critical', 'important', 'nitpick']);

      return parsed
        .filter((f: any) => f && typeof f.summary === 'string' && f.summary.trim())
        .map((f: any): ReviewFinding => ({
          line: typeof f.line === 'number' && Number.isFinite(f.line) ? Math.max(1, Math.round(f.line)) : undefined,
          endLine: typeof f.endLine === 'number' && Number.isFinite(f.endLine) ? Math.max(1, Math.round(f.endLine)) : undefined,
          severity: validSeverities.has(f.severity) ? f.severity : 'nitpick',
          category: typeof f.category === 'string' && f.category.trim() ? f.category.trim() : defaultCategory,
          summary: String(f.summary).trim().slice(0, 300),
          detail: typeof f.detail === 'string' && f.detail.trim() ? f.detail.trim().slice(0, 2000) : undefined,
          suggestion: typeof f.suggestion === 'string' && f.suggestion.trim() ? f.suggestion.trim().slice(0, 1000) : undefined,
          confidence: 50, // placeholder — overwritten by the independent confidence pass
        }));
    } catch (error) {
      console.error(`[CodeReviewService.parseFindingsJson] Failed to parse findings JSON for category "${defaultCategory}". Raw text (truncated): ${text.slice(0, 500)}`, error);
      return [];
    }
  }

  /**
   * Light dedup: drop findings that share a line number and a near-identical
   * summary (case/whitespace-insensitive prefix match).
   */
  private static dedupeFindings(findings: ReviewFinding[]): ReviewFinding[] {
    const seen = new Set<string>();
    const result: ReviewFinding[] = [];
    for (const finding of findings) {
      const key = `${finding.line ?? 'none'}:${finding.summary.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 48)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(finding);
    }
    return result;
  }

  /**
   * Independent confidence pass (part C): one more ai.run() call, given the
   * original code and the merged findings (without confidence scores), asks
   * the model to score each finding per the rubric and produce an overall
   * summary. Falls back to confidence 50 for every finding if the pass
   * fails or its output doesn't parse. Never throws.
   */
  private static async scoreConfidenceAndSummarize(
    ai: any,
    code: string,
    findings: ReviewFinding[]
  ): Promise<StructuredReview> {
    const indexed = findings.map(({ confidence, ...rest }, index) => ({ index, ...rest }));

    const systemPrompt = `You are an expert code reviewer performing an independent confidence review. You will be given the original code and a list of findings raised by other reviewers. You did not write these findings — verify each one against the actual code with a skeptical, senior-engineer eye.

${CONFIDENCE_RUBRIC}

Respond with ONLY a single fenced code block, tagged \`\`\`json, containing a JSON object of this exact shape — nothing before or after it:
{
  "summary": "<1-3 sentence overall summary of the code and the findings>",
  "scores": [ { "index": <integer, matching the finding's index>, "confidence": <integer 0-100> }, ... ]
}
Include one entry in "scores" for every finding index given to you.`;

    const userPrompt = `Original code:\n\`\`\`\n${code}\n\`\`\`\n\nFindings to verify (JSON):\n${JSON.stringify(indexed, null, 2)}`;

    try {
      const response = await ai.run(REVIEW_MODEL, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
      });

      const text = await this.collectResponseText(response);
      const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
      const parsed = JSON.parse((fenced ? fenced[1] : text).trim());

      const scores: Record<number, number> = {};
      if (Array.isArray(parsed?.scores)) {
        for (const entry of parsed.scores) {
          if (typeof entry?.index === 'number' && typeof entry?.confidence === 'number') {
            scores[entry.index] = Math.max(0, Math.min(100, Math.round(entry.confidence)));
          }
        }
      }

      const summary = typeof parsed?.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 500)
        : this.fallbackSummary(findings);

      const scoredFindings = findings
        .map((finding, index) => ({ ...finding, confidence: scores[index] ?? 50 }))
        .sort((a, b) => b.confidence - a.confidence);

      return { findings: scoredFindings, summary };
    } catch (error) {
      console.error(`[CodeReviewService.scoreConfidenceAndSummarize] Confidence pass failed for ${findings.length} finding(s); falling back to confidence 50 for all:`, error);
      const scoredFindings = findings
        .map((finding) => ({ ...finding, confidence: 50 }))
        .sort((a, b) => b.confidence - a.confidence);
      return { findings: scoredFindings, summary: this.fallbackSummary(findings) };
    }
  }

  private static fallbackSummary(findings: ReviewFinding[]): string {
    if (findings.length === 0) return 'No issues found.';
    const critical = findings.filter((f) => f.severity === 'critical').length;
    const important = findings.filter((f) => f.severity === 'important').length;
    const nitpick = findings.filter((f) => f.severity === 'nitpick').length;
    const parts: string[] = [];
    if (critical) parts.push(`${critical} critical`);
    if (important) parts.push(`${important} important`);
    if (nitpick) parts.push(`${nitpick} nitpick`);
    return `Found ${findings.length} finding${findings.length === 1 ? '' : 's'}: ${parts.join(', ')}.`;
  }
}