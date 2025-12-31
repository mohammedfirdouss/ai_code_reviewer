import { useState, useEffect, useRef } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, coy } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { 
  Copy, Check, Search, Moon, Sun, Download, Filter, 
  TrendingUp, Code, Shield, Zap, Book, X, 
  Sparkles, ChevronRight, Clock, FileCode
} from 'lucide-react'
import './App.css'

interface Message {
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
}

interface Review {
  id: string;
  result: string;
  timestamp: number;
  language: string;
  category: string;
  code: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [code, setCode] = useState('');
  const [category, setCategory] = useState<'quick' | 'security' | 'performance' | 'documentation'>('quick');
  const [language, setLanguage] = useState('javascript');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'reviews' | 'stats'>('chat');
  const [currentReview, setCurrentReview] = useState<Review | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLanguage, setFilterLanguage] = useState<string>('all');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageRef = useRef<string>('');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (ws) ws.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Check if user is near bottom of scroll container
  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const container = messagesContainerRef.current;
    const threshold = 150; // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  // Handle scroll events to detect manual scrolling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScrollStart = () => {
      isUserScrollingRef.current = true;
      shouldAutoScrollRef.current = false;
      
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // After user stops scrolling, check if they're near bottom
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
        shouldAutoScrollRef.current = isNearBottom();
      }, 150);
    };

    container.addEventListener('scroll', handleScrollStart, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScrollStart);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll only when appropriate - with debouncing
  useEffect(() => {
    // Don't auto-scroll if user is actively scrolling
    if (isUserScrollingRef.current) {
      return;
    }

    // Only auto-scroll if:
    // 1. User is near bottom (hasn't manually scrolled up), OR
    // 2. Currently streaming (new content is being added) AND user was at bottom
    if (shouldAutoScrollRef.current || (streaming && shouldAutoScrollRef.current)) {
      // Debounce scroll to prevent rapid scrolling
      const timeoutId = setTimeout(() => {
        if (!isUserScrollingRef.current && messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          // Update shouldAutoScrollRef after scrolling
          setTimeout(() => {
            shouldAutoScrollRef.current = isNearBottom();
          }, 200);
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [messages, streaming]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        codeTextareaRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && code.trim()) {
        e.preventDefault();
        handleSubmit(e as any);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code]);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const connectWebSocket = () => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Prevent too many reconnection attempts
    if (reconnectAttemptsRef.current > 5) {
      reconnectAttemptsRef.current = 0;
      addMessage('system', 'Too many connection attempts. Please refresh the page.');
      showToast('Connection failed. Please refresh.', 'error');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV 
      ? 'localhost:8787' 
      : 'ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev';
    const wsUrl = `${protocol}//${host}/agent`;
    
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      setConnected(true);
      reconnectAttemptsRef.current = 0; // Reset on successful connection
      addMessage('system', 'Connected to AI Code Reviewer');
      showToast('Connected successfully', 'success');
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      reconnectAttemptsRef.current++;
      // Only show error message if not already showing one
      if (!lastMessageRef.current.includes('Connection error')) {
        addMessage('system', 'Connection error occurred');
        showToast('Connection error', 'error');
      }
    };
    
    socket.onclose = (event) => {
      setConnected(false);
      
      // Only show disconnect message if it's an unexpected close (not manual)
      if (event.code !== 1000 && reconnectAttemptsRef.current < 3) {
        if (!lastMessageRef.current.includes('Disconnected')) {
          addMessage('system', 'Disconnected from server');
        }
        showToast('Reconnecting...', 'info');
      }
      
      // Exponential backoff for reconnection
      const delay = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current++;
      
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, delay);
    };
    
    setWs(socket);
  };

  const handleMessage = (data: any) => {
    switch (data.type) {
      case 'stream':
        setStreaming(true);
        addMessage('agent', data.text);
        break;
      case 'reviews':
        try {
          const fetchedReviews = data.reviews || [];
          const validReviews = fetchedReviews.filter((review: Review) => 
            review.result && review.result.trim() !== ''
          );
          
          setReviews(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const newReviews = validReviews.filter((review: Review) => !existingIds.has(review.id));
            return [...prev, ...newReviews];
          });
          
          if (validReviews.length === 0) {
            addMessage('system', 'No past reviews found. Your reviews will appear here once you submit code for analysis.');
          } else {
            addMessage('system', `Found ${validReviews.length} review(s). Check the "Reviews" tab to see them.`);
            setActiveTab('reviews');
          }
        } catch (e) {
          addMessage('system', 'Failed to load reviews');
        }
        break;
      case 'done':
        setStreaming(false);
        if (data.review.result) {
          addMessage('agent', data.review.result);
        }
        const newReview: Review = {
          id: data.review.id,
          result: data.review.result || '',
          timestamp: data.review.timestamp || Date.now(),
          language: data.review.language || language,
          category: data.review.category || category,
          code: data.review.code || code
        };
        setReviews(prev => {
          const exists = prev.some(review => review.id === newReview.id);
          if (exists) {
            return prev;
          }
          return [newReview, ...prev];
        });
        showToast('Review completed!', 'success');
        setActiveTab('reviews');
        break;
      case 'language_error':
        setStreaming(false);
        addMessage('system', `Language Detection Issue: ${data.error}`);
        if (data.suggestion) {
          addMessage('system', `Suggestion: ${data.suggestion}`);
        }
        showToast('Language mismatch detected', 'error');
        break;
      case 'error':
        setStreaming(false);
        addMessage('system', `Error: ${data.error}`);
        showToast(data.error, 'error');
        break;
      case 'pong':
        console.log('Received pong');
        break;
    }
  };

  const addMessage = (type: Message['type'], content: string) => {
    // Prevent duplicate messages (especially error messages)
    const messageKey = `${type}:${content}`;
    if (messageKey === lastMessageRef.current) {
      return; // Skip duplicate
    }
    lastMessageRef.current = messageKey;
    
    // Reset duplicate check after 2 seconds
    setTimeout(() => {
      if (lastMessageRef.current === messageKey) {
        lastMessageRef.current = '';
      }
    }, 2000);
    
    setMessages(prev => {
      // Also check if the last message in the array is the same
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.type === type && lastMsg.content === content) {
        return prev; // Don't add duplicate
      }
      return [...prev, { type, content, timestamp: Date.now() }];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code.trim()) {
      showToast('Please paste some code to review', 'error');
      return;
    }
    
    if (!ws || !connected) {
      showToast('Not connected to server', 'error');
      return;
    }

    addMessage('user', `Submitted ${language} code for ${category} review`);
    setStreaming(true);

    ws.send(JSON.stringify({
      type: 'submit_code',
      code,
      category,
      language
    }));
  };

  const handleClear = () => {
    setMessages([]);
    setCode('');
    setCurrentReview(null);
    showToast('Cleared', 'info');
  };

  const loadReviews = () => {
    if (!ws || !connected) {
      showToast('Not connected to server', 'error');
      return;
    }
    ws.send(JSON.stringify({ type: 'list_reviews' }));
  };

  const viewReview = (review: Review) => {
    setCurrentReview(review);
    setActiveTab('chat');
    setMessages([
      { type: 'user', content: `Viewing review: ${review.language} ${review.category} review`, timestamp: Date.now() },
      { type: 'agent', content: review.result, timestamp: review.timestamp }
    ]);
  };

  const copyToClipboard = async (text: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (id) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
      showToast('Copied to clipboard!', 'success');
    } catch (err) {
      showToast('Failed to copy', 'error');
    }
  };

  const exportReview = (review: Review) => {
    const content = `# Code Review - ${review.category}\n\n**Language:** ${review.language}\n**Date:** ${new Date(review.timestamp).toLocaleString()}\n\n## Code\n\`\`\`${review.language}\n${review.code}\n\`\`\`\n\n## Review\n\n${review.result}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-${review.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Review exported!', 'success');
  };

  const getLanguageName = (lang: string) => {
    const names: Record<string, string> = {
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      python: 'Python',
      java: 'Java',
      go: 'Go',
      rust: 'Rust',
      cpp: 'C++',
      csharp: 'C#',
      php: 'PHP',
      ruby: 'Ruby',
      swift: 'Swift',
      kotlin: 'Kotlin',
      other: 'Other'
    };
    return names[lang] || lang;
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'quick': return <Sparkles className="icon-sm" />;
      case 'security': return <Shield className="icon-sm" />;
      case 'performance': return <Zap className="icon-sm" />;
      case 'documentation': return <Book className="icon-sm" />;
      default: return <Code className="icon-sm" />;
    }
  };

  const filteredReviews = reviews.filter(review => {
    const matchesSearch = searchQuery === '' || 
      review.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.result.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || review.category === filterCategory;
    const matchesLanguage = filterLanguage === 'all' || review.language === filterLanguage;
    return matchesSearch && matchesCategory && matchesLanguage;
  });

  const stats = {
    totalReviews: reviews.length,
    byCategory: {
      quick: reviews.filter(r => r.category === 'quick').length,
      security: reviews.filter(r => r.category === 'security').length,
      performance: reviews.filter(r => r.category === 'performance').length,
      documentation: reviews.filter(r => r.category === 'documentation').length,
    },
    byLanguage: reviews.reduce((acc, r) => {
      acc[r.language] = (acc[r.language] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    recentActivity: reviews.slice(0, 5)
  };

  const renderCodeBlock = (code: string, lang: string) => {
    const style = darkMode ? vscDarkPlus : coy;
    return (
      <SyntaxHighlighter
        language={lang === 'cpp' ? 'cpp' : lang === 'csharp' ? 'csharp' : lang}
        style={style}
        customStyle={{
          borderRadius: '8px',
          padding: '1rem',
          margin: '0.5rem 0',
          fontSize: '0.875rem'
        }}
      >
        {code}
      </SyntaxHighlighter>
    );
  };

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">
              <Code className="icon" style={{ color: 'white' }} />
            </div>
            <div className="logo-text">
              <h1>AI Code Reviewer</h1>
              <p>Intelligent Code Analysis & Review</p>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="icon" /> : <Moon className="icon" />}
            </button>
            <div className="status">
              <div className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}></div>
              <span className="status-text">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <div className="tab-navigation">
            <button 
              className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
              aria-label="Live Chat"
            >
              <Code className="icon-sm" />
              <span>Review</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('reviews');
                loadReviews();
              }}
              aria-label="Reviews"
            >
              <FileCode className="icon-sm" />
              <span>History</span>
              {reviews.length > 0 && (
                <span style={{ 
                  marginLeft: '4px',
                  padding: '2px 6px',
                  background: 'var(--accent-primary)',
                  color: 'var(--text-inverse)',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 600
                }}>
                  {reviews.length}
                </span>
              )}
            </button>
            <button 
              className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveTab('stats')}
              aria-label="Statistics"
            >
              <TrendingUp className="icon-sm" />
              <span>Stats</span>
            </button>
          </div>

          {activeTab === 'chat' && (
            <div className="input-panel">
              <form onSubmit={handleSubmit} className="review-form">
                <div className="form-section">
                  <h3>Code Review Settings</h3>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="language">Programming Language</label>
                      <select
                        id="language"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="form-select"
                      >
                        <option value="javascript">JavaScript</option>
                        <option value="typescript">TypeScript</option>
                        <option value="python">Python</option>
                        <option value="java">Java</option>
                        <option value="go">Go</option>
                        <option value="rust">Rust</option>
                        <option value="cpp">C++</option>
                        <option value="csharp">C#</option>
                        <option value="php">PHP</option>
                        <option value="ruby">Ruby</option>
                        <option value="swift">Swift</option>
                        <option value="kotlin">Kotlin</option>
                        <option value="other">Other/Unknown</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="category">Review Type</label>
                      <select
                        id="category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as any)}
                        className="form-select"
                      >
                        <option value="quick">Quick Review</option>
                        <option value="security">Security Audit</option>
                        <option value="performance">Performance Analysis</option>
                        <option value="documentation">Documentation Review</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <div className="form-group-header">
                      <label htmlFor="code">Code to Review</label>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => copyToClipboard(code)}
                        title="Copy code"
                      >
                        <Copy className="icon-xs" />
                      </button>
                    </div>
                    <textarea
                      ref={codeTextareaRef}
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Paste your code here for AI analysis... (Ctrl+K to focus)"
                      className="code-textarea"
                      rows={12}
                    />
                  </div>

                  <div className="form-actions">
                    <button 
                      type="submit" 
                      disabled={!connected || streaming}
                      className="submit-button"
                    >
                      {streaming ? (
                        <>
                          <div className="spinner"></div>
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="icon-sm" />
                          Review Code
                        </>
                      )}
                    </button>
                    <button 
                      type="button" 
                      onClick={handleClear}
                      className="clear-button"
                      title="Clear form"
                    >
                      <X className="icon-sm" />
                      Clear
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="reviews-panel">
              <div className="reviews-header">
                <h3>Review History</h3>
                <button onClick={loadReviews} className="refresh-button" title="Refresh reviews">
                  <Search className="icon-xs" />
                  Refresh
                </button>
              </div>

              <div className="search-filters">
                <div className="search-box">
                  <Search className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search reviews..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                  {searchQuery && (
                    <button
                      className="clear-search"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="icon-xs" />
                    </button>
                  )}
                </div>
                <div className="filters">
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="filter-select"
                  >
                    <option value="all">All Categories</option>
                    <option value="quick">Quick Review</option>
                    <option value="security">Security Audit</option>
                    <option value="performance">Performance</option>
                    <option value="documentation">Documentation</option>
                  </select>
                  <select
                    value={filterLanguage}
                    onChange={(e) => setFilterLanguage(e.target.value)}
                    className="filter-select"
                  >
                    <option value="all">All Languages</option>
                    {Object.keys(stats.byLanguage).map(lang => (
                      <option key={lang} value={lang}>{getLanguageName(lang)}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="reviews-list">
                {filteredReviews.length === 0 ? (
                  <div className="empty-reviews">
                    <div className="empty-icon">
                      <FileCode className="icon" style={{ width: '48px', height: '48px', opacity: 0.4 }} />
                    </div>
                    <p>{searchQuery || filterCategory !== 'all' || filterLanguage !== 'all' ? 'No matching reviews' : 'No reviews yet'}</p>
                    <p>{searchQuery || filterCategory !== 'all' || filterLanguage !== 'all' ? 'Try adjusting your filters' : 'Submit code for analysis to see your reviews here'}</p>
                  </div>
                ) : (
                  filteredReviews.map((review) => (
                    <div 
                      key={review.id} 
                      className="review-item"
                    >
                      <div className="review-header">
                        <div className="review-meta">
                          <span className="review-language">{getLanguageName(review.language)}</span>
                          <span className="review-category">
                            {getCategoryIcon(review.category)}
                            {review.category}
                          </span>
                        </div>
                        <div className="review-actions">
                          <button
                            className="action-button"
                            onClick={() => copyToClipboard(review.code, `code-${review.id}`)}
                            title="Copy code"
                          >
                            {copiedId === `code-${review.id}` ? <Check className="icon-xs" /> : <Copy className="icon-xs" />}
                          </button>
                          <button
                            className="action-button"
                            onClick={() => exportReview(review)}
                            title="Export review"
                          >
                            <Download className="icon-xs" />
                          </button>
                          <button
                            className="action-button"
                            onClick={() => viewReview(review)}
                            title="View review"
                          >
                            <ChevronRight className="icon-xs" />
                          </button>
                        </div>
                      </div>
                      <div className="review-time">
                        <Clock className="icon-xs" />
                        {new Date(review.timestamp).toLocaleString()}
                      </div>
                      <div className="review-preview">
                        {review.result.substring(0, 150)}...
                      </div>
                      <div className="code-preview">
                        <FileCode className="icon-xs" />
                        <code>{review.code.substring(0, 80)}...</code>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="stats-panel">
              <h3>Statistics</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{stats.totalReviews}</div>
                  <div className="stat-label">Total Reviews</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.byCategory.quick}</div>
                  <div className="stat-label">Quick Reviews</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.byCategory.security}</div>
                  <div className="stat-label">Security Audits</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.byCategory.performance}</div>
                  <div className="stat-label">Performance</div>
                </div>
              </div>
              <div className="language-stats">
                <h4>By Language</h4>
                {Object.entries(stats.byLanguage).map(([lang, count]) => (
                  <div key={lang} className="language-stat">
                    <span>{getLanguageName(lang)}</span>
                    <div className="stat-bar">
                      <div 
                        className="stat-bar-fill"
                        style={{ width: `${(count / stats.totalReviews) * 100}%` }}
                      ></div>
                    </div>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="chat-panel">
          <div className="chat-header">
            <h2>
              {activeTab === 'chat' ? 'Live Analysis' : activeTab === 'reviews' ? 'Review Details' : 'Dashboard'}
            </h2>
            {streaming && <div className="streaming-indicator">Streaming...</div>}
          </div>
          
          <div className="messages-container" ref={messagesContainerRef}>
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="empty-icon">
                  <Code className="icon" style={{ width: '64px', height: '64px', opacity: 0.3 }} />
                </div>
                <h3>Ready to analyze your code!</h3>
                <p>Paste your code and select a review type to get started</p>
                <div className="shortcuts-hint">
                  <kbd>Ctrl</kbd> + <kbd>K</kbd> to focus code input
                  <br />
                  <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to submit
                </div>
              </div>
            ) : (
              <div className="messages">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`message message-${msg.type}`}>
                    <div className="message-avatar">
                      {msg.type === 'user' ? (
                        <Code className="icon" style={{ fontSize: '20px' }} />
                      ) : msg.type === 'agent' ? (
                        <Sparkles className="icon" style={{ fontSize: '20px' }} />
                      ) : (
                        <Clock className="icon" style={{ fontSize: '20px' }} />
                      )}
                    </div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-type">
                          {msg.type === 'user' ? 'You' : msg.type === 'agent' ? 'AI Assistant' : 'System'}
                        </span>
                        <div className="message-actions">
                          <button
                            className="message-action"
                            onClick={() => copyToClipboard(msg.content, `msg-${idx}`)}
                            title="Copy message"
                          >
                            {copiedId === `msg-${idx}` ? <Check className="icon-xs" /> : <Copy className="icon-xs" />}
                          </button>
                        </div>
                        <span className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="message-text">
                        {msg.type === 'user' && msg.content.includes('code') ? (
                          currentReview ? (
                            <div className="code-display">
                              {renderCodeBlock(currentReview.code, currentReview.language)}
                            </div>
                          ) : (
                            msg.content
                          )
                        ) : (
                          <div className="message-content-text">
                            {msg.content.split(/```(\w+)?\n([\s\S]*?)```/).map((part, i) => {
                              if (i % 3 === 2) {
                                const lang = msg.content.split('```')[i - 1] || 'text';
                                return (
                                  <div key={i}>
                                    {renderCodeBlock(part, lang)}
                                  </div>
                                );
                              }
                              return <span key={i}>{part}</span>;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
