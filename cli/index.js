#!/usr/bin/env node

/**
 * AI Code Reviewer CLI Tool
 * 
 * Usage:
 *   npx ai-code-reviewer review file.js
 *   npx ai-code-reviewer review --code "console.log('hello')" --language javascript
 *   npx ai-code-reviewer batch src/
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');

// Configuration
const DEFAULT_ENDPOINT = 'https://ai-code-reviewer.pages.dev';

class CodeReviewerCLI {
  constructor(endpoint = DEFAULT_ENDPOINT) {
    this.endpoint = endpoint;
  }

  /**
   * Review a single file
   */
  async reviewFile(filePath, options = {}) {
    try {
      const code = fs.readFileSync(filePath, 'utf8');
      const language = options.language || this.detectLanguage(filePath);
      
      console.log(`📝 Reviewing ${filePath} (${language})...`);
      
      const result = await this.sendReview(code, language, options.category);
      this.printResult(result, options);
      
    } catch (error) {
      console.error(`❌ Error reviewing ${filePath}:`, error.message);
      process.exit(1);
    }
  }

  /**
   * Review code directly from command line
   */
  async reviewCode(code, language, options = {}) {
    try {
      console.log(`📝 Reviewing ${language} code...`);
      
      const result = await this.sendReview(code, language, options.category);
      this.printResult(result, options);
      
    } catch (error) {
      console.error('❌ Error reviewing code:', error.message);
      process.exit(1);
    }
  }

  /**
   * Review multiple files in a directory
   */
  async reviewBatch(dirPath, options = {}) {
    try {
      const files = this.getCodeFiles(dirPath, options.extensions);
      
      console.log(`📁 Found ${files.length} files to review in ${dirPath}`);
      
      const results = [];
      
      for (const file of files) {
        try {
          const code = fs.readFileSync(file, 'utf8');
          const language = this.detectLanguage(file);
          
          console.log(`📝 Reviewing ${path.relative(dirPath, file)}...`);
          
          const result = await this.sendReview(code, language, options.category);
          results.push({ file, result });
          
          if (options.verbose) {
            this.printResult(result, { file });
          }
          
          // Rate limiting - wait between requests
          await this.sleep(500);
          
        } catch (error) {
          console.error(`❌ Error reviewing ${file}:`, error.message);
        }
      }
      
      this.printBatchSummary(results, options);
      
    } catch (error) {
      console.error(`❌ Error reviewing directory ${dirPath}:`, error.message);
      process.exit(1);
    }
  }

  /**
   * Send review request to API
   */
  async sendReview(code, language, category = 'quick') {
    const response = await fetch(`${this.endpoint}/api/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        language,
        category,
        source: 'cli'
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Print review result
   */
  printResult(result, options = {}) {
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('\n' + '='.repeat(60));
    if (options.file) {
      console.log(`📄 File: ${options.file}`);
    }
    console.log(`🤖 Model: ${result.model}`);
    console.log(`📊 Confidence: ${result.confidence}%`);
    console.log(`⏱️  Time: ${result.processingTime}ms`);
    console.log('='.repeat(60));
    console.log(result.review);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Print batch review summary
   */
  printBatchSummary(results, options = {}) {
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    console.log('\n' + '📊 Batch Review Summary');
    console.log('='.repeat(40));
    console.log(`Total files reviewed: ${results.length}`);
    
    const avgConfidence = results.reduce((sum, r) => sum + r.result.confidence, 0) / results.length;
    console.log(`Average confidence: ${avgConfidence.toFixed(1)}%`);
    
    const totalTime = results.reduce((sum, r) => sum + r.result.processingTime, 0);
    console.log(`Total processing time: ${totalTime}ms`);
    
    // Issues summary
    const issueFiles = results.filter(r => r.result.review.toLowerCase().includes('issue') || r.result.review.toLowerCase().includes('problem'));
    if (issueFiles.length > 0) {
      console.log(`\n⚠️  Files with potential issues: ${issueFiles.length}`);
      issueFiles.forEach(({ file }) => {
        console.log(`  - ${file}`);
      });
    } else {
      console.log('\n✅ No major issues found!');
    }
    
    console.log('='.repeat(40));
  }

  /**
   * Detect language from file extension
   */
  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const langMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r',
      '.m': 'objc',
      '.sql': 'sql',
      '.sh': 'bash',
      '.ps1': 'powershell',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
    };
    return langMap[ext] || 'text';
  }

  /**
   * Get all code files in a directory
   */
  getCodeFiles(dirPath, extensions = []) {
    const defaultExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', 
      '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala'
    ];
    
    const targetExtensions = extensions.length > 0 ? extensions : defaultExtensions;
    
    const files = [];
    
    const walk = (dir) => {
      const entries = fs.readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip common build/dependency directories
          if (!['node_modules', '.git', 'dist', 'build', '__pycache__'].includes(entry)) {
            walk(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(entry).toLowerCase();
          if (targetExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };
    
    walk(dirPath);
    return files;
  }

  /**
   * Sleep utility
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI Setup
program
  .name('ai-code-reviewer')
  .description('AI-powered code review tool')
  .version('1.0.0');

program
  .command('review [file]')
  .description('Review a code file or code from stdin')
  .option('-c, --code <code>', 'Code to review directly')
  .option('-l, --language <language>', 'Programming language')
  .option('-t, --category <category>', 'Review category (quick|security|performance|documentation)', 'quick')
  .option('-j, --json', 'Output in JSON format')
  .option('-e, --endpoint <url>', 'API endpoint', DEFAULT_ENDPOINT)
  .action(async (file, options) => {
    const cli = new CodeReviewerCLI(options.endpoint);
    
    if (options.code) {
      const language = options.language || 'javascript';
      await cli.reviewCode(options.code, language, options);
    } else if (file) {
      await cli.reviewFile(file, options);
    } else {
      console.error('❌ Please provide either a file path or use --code option');
      process.exit(1);
    }
  });

program
  .command('batch <directory>')
  .description('Review all code files in a directory')
  .option('-t, --category <category>', 'Review category (quick|security|performance|documentation)', 'quick')
  .option('-j, --json', 'Output in JSON format')
  .option('-v, --verbose', 'Show individual file results')
  .option('-e, --extensions <extensions...>', 'File extensions to include')
  .option('--endpoint <url>', 'API endpoint', DEFAULT_ENDPOINT)
  .action(async (directory, options) => {
    const cli = new CodeReviewerCLI(options.endpoint);
    await cli.reviewBatch(directory, options);
  });

program
  .command('config')
  .description('Show configuration')
  .action(() => {
    console.log('🔧 AI Code Reviewer CLI Configuration');
    console.log('=====================================');
    console.log(`Default endpoint: ${DEFAULT_ENDPOINT}`);
    console.log(`Supported languages: javascript, typescript, python, java, c, cpp, csharp, go, rust, php, ruby, swift, kotlin, scala`);
    console.log(`Review categories: quick, security, performance, documentation`);
  });

// Parse CLI arguments
program.parse();