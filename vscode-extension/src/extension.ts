import * as vscode from 'vscode';

interface ReviewResult {
  review: string;
  confidence: number;
  model: string;
  processingTime: number;
  category: string;
  suggestions?: string[];
}

interface ReviewDecoration {
  decoration: vscode.TextEditorDecorationType;
  range: vscode.Range;
  review: ReviewResult;
}

export function activate(context: vscode.ExtensionContext) {
  const reviewProvider = new CodeReviewProvider();
  const reviewDecorations: ReviewDecoration[] = [];

  // Register commands
  const reviewFileCommand = vscode.commands.registerCommand(
    'aiCodeReviewer.reviewFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }
      
      await reviewProvider.reviewDocument(editor.document);
    }
  );

  const reviewSelectionCommand = vscode.commands.registerCommand(
    'aiCodeReviewer.reviewSelection', 
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showErrorMessage('No selection');
        return;
      }
      
      const selectedText = editor.document.getText(editor.selection);
      await reviewProvider.reviewCode(selectedText, getLanguageFromDocument(editor.document), editor.selection);
    }
  );

  const reviewWorkspaceCommand = vscode.commands.registerCommand(
    'aiCodeReviewer.reviewWorkspace',
    async () => {
      await reviewProvider.reviewWorkspace();
    }
  );

  const showReviewPanelCommand = vscode.commands.registerCommand(
    'aiCodeReviewer.showReviewPanel',
    () => {
      reviewProvider.showReviewPanel();
    }
  );

  // Register tree data provider
  const treeDataProvider = new ReviewTreeDataProvider();
  vscode.window.createTreeView('aiCodeReviewerPanel', {
    treeDataProvider: treeDataProvider,
    showCollapseAll: true
  });

  // Auto-review on save (if enabled)
  const onSaveHandler = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    if (config.get('autoReview')) {
      await reviewProvider.reviewDocument(document);
    }
  });

  context.subscriptions.push(
    reviewFileCommand,
    reviewSelectionCommand, 
    reviewWorkspaceCommand,
    showReviewPanelCommand,
    onSaveHandler
  );

  // Initialize extension
  vscode.commands.executeCommand('setContext', 'aiCodeReviewer.hasReviews', false);
}

class CodeReviewProvider {
  private outputChannel: vscode.OutputChannel;
  private webviewPanel: vscode.WebviewPanel | undefined;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('AI Code Reviewer');
  }

  async reviewDocument(document: vscode.TextDocument) {
    if (!this.isCodeFile(document)) {
      vscode.window.showInformationMessage('File type not supported for review');
      return;
    }

    const code = document.getText();
    const language = getLanguageFromDocument(document);
    
    this.outputChannel.appendLine(`Reviewing ${document.fileName}...`);
    this.outputChannel.show();

    try {
      const result = await this.callReviewAPI(code, language);
      this.displayReviewResult(result, document.fileName);
      this.addInlineDecorations(document, result);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Review failed: ${error.message}`);
      this.outputChannel.appendLine(`Error: ${error.message}`);
    }
  }

  async reviewCode(code: string, language: string, selection?: vscode.Selection) {
    this.outputChannel.appendLine(`Reviewing ${language} code selection...`);
    this.outputChannel.show();

    try {
      const result = await this.callReviewAPI(code, language);
      this.displayReviewResult(result, 'Code Selection');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Review failed: ${error.message}`);
      this.outputChannel.appendLine(`Error: ${error.message}`);
    }
  }

  async reviewWorkspace() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    // Find all code files in workspace
    const codeFiles = await vscode.workspace.findFiles(
      '**/*.{js,jsx,ts,tsx,py,java,c,cpp,cs,go,rs,php,rb,swift,kt}',
      '{node_modules,dist,build,out}/**'
    );

    if (codeFiles.length === 0) {
      vscode.window.showInformationMessage('No code files found in workspace');
      return;
    }

    const selection = await vscode.window.showQuickPick(
      ['All files', 'Select specific files'],
      { placeHolder: `Found ${codeFiles.length} code files` }
    );

    if (!selection) return;

    let filesToReview = codeFiles;
    
    if (selection === 'Select specific files') {
      const selectedFiles = await vscode.window.showQuickPick(
        codeFiles.map(file => ({
          label: vscode.workspace.asRelativePath(file),
          uri: file
        })),
        { canPickMany: true, placeHolder: 'Select files to review' }
      );
      
      if (!selectedFiles) return;
      filesToReview = selectedFiles.map(item => item.uri);
    }

    // Review files with progress
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'AI Code Review',
      cancellable: true
    }, async (progress, token) => {
      const results = [];
      
      for (let i = 0; i < filesToReview.length; i++) {
        if (token.isCancellationRequested) break;
        
        const file = filesToReview[i];
        const fileName = vscode.workspace.asRelativePath(file);
        
        progress.report({ 
          increment: (100 / filesToReview.length),
          message: `Reviewing ${fileName}...`
        });
        
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const code = document.getText();
          const language = getLanguageFromDocument(document);
          
          const result = await this.callReviewAPI(code, language);
          results.push({ fileName, result });
          
        } catch (error: any) {
          this.outputChannel.appendLine(`Error reviewing ${fileName}: ${error.message}`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      this.displayBatchResults(results);
    });
  }

  private async callReviewAPI(code: string, language: string): Promise<ReviewResult> {
    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    const endpoint = config.get<string>('apiEndpoint') || 'https://ai-code-reviewer.pages.dev';
    const category = config.get<string>('defaultCategory') || 'quick';

    const response = await fetch(`${endpoint}/api/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        language,
        category,
        source: 'vscode'
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private displayReviewResult(result: ReviewResult, fileName: string) {
    this.outputChannel.appendLine('\\n' + '='.repeat(60));
    this.outputChannel.appendLine(`📄 File: ${fileName}`);
    this.outputChannel.appendLine(`🤖 Model: ${result.model}`);
    this.outputChannel.appendLine(`📊 Confidence: ${result.confidence}%`);
    this.outputChannel.appendLine(`⏱️  Time: ${result.processingTime}ms`);
    this.outputChannel.appendLine('='.repeat(60));
    this.outputChannel.appendLine(result.review);
    this.outputChannel.appendLine('='.repeat(60) + '\\n');

    // Show notification based on content
    if (result.review.toLowerCase().includes('issue') || result.review.toLowerCase().includes('problem')) {
      vscode.window.showWarningMessage(`AI found potential issues in ${fileName}`, 'View Details')
        .then(selection => {
          if (selection === 'View Details') {
            this.outputChannel.show();
          }
        });
    } else {
      vscode.window.showInformationMessage(`✅ ${fileName} looks good!`);
    }

    // Update context
    vscode.commands.executeCommand('setContext', 'aiCodeReviewer.hasReviews', true);
  }

  private displayBatchResults(results: Array<{fileName: string, result: ReviewResult}>) {
    this.outputChannel.appendLine('\\n' + '📊 Workspace Review Summary');
    this.outputChannel.appendLine('='.repeat(50));
    this.outputChannel.appendLine(`Total files reviewed: ${results.length}`);
    
    const avgConfidence = results.reduce((sum, r) => sum + r.result.confidence, 0) / results.length;
    this.outputChannel.appendLine(`Average confidence: ${avgConfidence.toFixed(1)}%`);
    
    const totalTime = results.reduce((sum, r) => sum + r.result.processingTime, 0);
    this.outputChannel.appendLine(`Total processing time: ${totalTime}ms`);
    
    const issueFiles = results.filter(r => 
      r.result.review.toLowerCase().includes('issue') || 
      r.result.review.toLowerCase().includes('problem')
    );
    
    if (issueFiles.length > 0) {
      this.outputChannel.appendLine(`\\n⚠️  Files with potential issues: ${issueFiles.length}`);
      issueFiles.forEach(({ fileName }) => {
        this.outputChannel.appendLine(`  - ${fileName}`);
      });
    } else {
      this.outputChannel.appendLine('\\n✅ No major issues found!');
    }
    
    this.outputChannel.appendLine('='.repeat(50));
    this.outputChannel.show();

    // Show summary notification
    const message = issueFiles.length > 0 
      ? `Workspace review complete: ${issueFiles.length} files have potential issues`
      : `Workspace review complete: No major issues found!`;
    
    vscode.window.showInformationMessage(message, 'View Details')
      .then(selection => {
        if (selection === 'View Details') {
          this.outputChannel.show();
        }
      });
  }

  private addInlineDecorations(document: vscode.TextDocument, result: ReviewResult) {
    const config = vscode.workspace.getConfiguration('aiCodeReviewer');
    if (!config.get('showInlineDecorations')) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) return;

    // Simple decoration for now - could be enhanced to parse specific line recommendations
    const decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` 🤖 AI: ${result.confidence}% confidence`,
        color: result.confidence > 80 ? 'green' : result.confidence > 60 ? 'orange' : 'red'
      }
    });

    const range = new vscode.Range(0, 0, 0, 0);
    editor.setDecorations(decorationType, [range]);

    // Auto-clear decoration after 5 seconds
    setTimeout(() => {
      decorationType.dispose();
    }, 5000);
  }

  showReviewPanel() {
    if (this.webviewPanel) {
      this.webviewPanel.reveal();
      return;
    }

    this.webviewPanel = vscode.window.createWebviewPanel(
      'aiCodeReviewer',
      'AI Code Review Results',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.webviewPanel.webview.html = this.getWebviewContent();
    
    this.webviewPanel.onDidDispose(() => {
      this.webviewPanel = undefined;
    });
  }

  private getWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>AI Code Review Results</title>
          <style>
              body { font-family: var(--vscode-font-family); }
              .review-item { border: 1px solid var(--vscode-panel-border); margin: 10px 0; padding: 10px; }
              .confidence-high { color: var(--vscode-charts-green); }
              .confidence-medium { color: var(--vscode-charts-orange); }
              .confidence-low { color: var(--vscode-charts-red); }
          </style>
      </head>
      <body>
          <h2>🤖 AI Code Review Results</h2>
          <p>Review results will appear here when you run code reviews.</p>
          <div id="reviews"></div>
      </body>
      </html>
    `;
  }

  private isCodeFile(document: vscode.TextDocument): boolean {
    const supportedExtensions = [
      'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 
      'csharp', 'go', 'rust', 'php', 'ruby', 'swift', 'kotlin'
    ];
    return supportedExtensions.includes(document.languageId);
  }
}

class ReviewTreeDataProvider implements vscode.TreeDataProvider<ReviewItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ReviewItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private reviews: ReviewItem[] = [];

  getTreeItem(element: ReviewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewItem): Thenable<ReviewItem[]> {
    if (!element) {
      return Promise.resolve(this.reviews);
    }
    return Promise.resolve([]);
  }

  addReview(fileName: string, result: ReviewResult) {
    this.reviews.unshift(new ReviewItem(fileName, result));
    this._onDidChangeTreeData.fire();
  }

  clear() {
    this.reviews = [];
    this._onDidChangeTreeData.fire();
  }
}

class ReviewItem extends vscode.TreeItem {
  constructor(
    public readonly fileName: string,
    public readonly result: ReviewResult
  ) {
    super(fileName, vscode.TreeItemCollapsibleState.None);
    
    this.tooltip = `${fileName}\\nConfidence: ${result.confidence}%\\nModel: ${result.model}`;
    this.description = `${result.confidence}%`;
    
    // Set icon based on confidence
    if (result.confidence > 80) {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    } else if (result.confidence > 60) {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
    } else {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    }
  }
}

function getLanguageFromDocument(document: vscode.TextDocument): string {
  const languageMap: {[key: string]: string} = {
    'javascript': 'javascript',
    'typescript': 'typescript', 
    'python': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'csharp': 'csharp',
    'go': 'go',
    'rust': 'rust',
    'php': 'php',
    'ruby': 'ruby',
    'swift': 'swift',
    'kotlin': 'kotlin'
  };
  
  return languageMap[document.languageId] || 'text';
}

export function deactivate() {}