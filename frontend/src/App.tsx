import { useState, useEffect, useRef } from 'react'
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

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [code, setCode] = useState('');
  const [category, setCategory] = useState<'quick' | 'security' | 'performance' | 'documentation'>('quick');
  const [language, setLanguage] = useState('javascript');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'reviews'>('chat');
  const [currentReview, setCurrentReview] = useState<Review | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (ws) ws.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use production Worker URL or localhost for development
    const host = import.meta.env.DEV 
      ? 'localhost:8787' 
      : 'ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev';
    const wsUrl = `${protocol}//${host}/agent`;
    
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      setConnected(true);
      addMessage('system', 'Connected to AI Code Reviewer');
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
      addMessage('system', 'Connection error occurred');
    };
    
    socket.onclose = () => {
      setConnected(false);
      addMessage('system', 'Disconnected from server');
      // Attempt reconnection after 3 seconds
      setTimeout(connectWebSocket, 3000);
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
          // Filter out empty results and merge with existing reviews (avoid duplicates)
          const validReviews = fetchedReviews.filter((review: Review) => 
            review.result && review.result.trim() !== ''
          );
          
          setReviews(prev => {
            // Merge reviews, avoiding duplicates based on ID
            const existingIds = new Set(prev.map(r => r.id));
            const newReviews = validReviews.filter((review: Review) => !existingIds.has(review.id));
            return [...prev, ...newReviews];
          });
          
          if (validReviews.length === 0) {
            addMessage('system', '📋 No past reviews found. Your reviews will appear here once you submit code for analysis.');
          } else {
            addMessage('system', `📋 Found ${validReviews.length} review(s). Check the "Reviews" tab to see them.`);
            setActiveTab('reviews');
          }
        } catch (e) {
          addMessage('system', '❌ Failed to load reviews');
        }
        break;
      case 'done':
        setStreaming(false);
        // Show the full review result if stream chunks weren't received
        if (data.review.result) {
          addMessage('agent', data.review.result);
        }
        // Add the completed review to our local state (avoid duplicates)
        const newReview: Review = {
          id: data.review.id,
          result: data.review.result || '',
          timestamp: data.review.timestamp || Date.now(),
          language: data.review.language || language,
          category: data.review.category || category,
          code: data.review.code || code
        };
        setReviews(prev => {
          // Check if this review already exists
          const exists = prev.some(review => review.id === newReview.id);
          if (exists) {
            return prev; // Don't add duplicate
          }
          return [newReview, ...prev];
        });
        addMessage('system', `✅ Review completed! Check the "Reviews" tab to see all your reviews.`);
        setActiveTab('reviews');
        break;
      case 'language_error':
        setStreaming(false);
        addMessage('system', `🔍 Language Detection Issue: ${data.error}`);
        if (data.suggestion) {
          addMessage('system', `💡 ${data.suggestion}`);
        }
        break;
      case 'error':
        setStreaming(false);
        addMessage('system', `❌ Error: ${data.error}`);
        break;
      case 'pong':
        console.log('Received pong');
        break;
    }
  };

  const addMessage = (type: Message['type'], content: string) => {
    setMessages(prev => [...prev, { type, content, timestamp: Date.now() }]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code.trim()) {
      alert('Please paste some code to review');
      return;
    }
    
    if (!ws || !connected) {
      alert('Not connected to server');
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
  };

  const loadReviews = () => {
    if (!ws || !connected) {
      alert('Not connected to server');
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

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">🤖</div>
            <div className="logo-text">
              <h1>AI Code Reviewer</h1>
              <p>Intelligent Code Analysis & Review</p>
            </div>
          </div>
          <div className="status">
            <div className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}></div>
            <span className="status-text">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <div className="tab-navigation">
            <button 
              className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <span className="tab-icon">💬</span>
              Live Chat
            </button>
            <button 
              className={`tab-button ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('reviews');
                loadReviews();
              }}
            >
              <span className="tab-icon">📋</span>
              Reviews ({reviews.length})
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
                        <option value="quick">🚀 Quick Review</option>
                        <option value="security">🔒 Security Audit</option>
                        <option value="performance">⚡ Performance Analysis</option>
                        <option value="documentation">📚 Documentation Review</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="code">Code to Review</label>
                    <textarea
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Paste your code here for AI analysis..."
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
                          <span>🔍</span>
                          Review Code
                        </>
                      )}
                    </button>
                    <button 
                      type="button" 
                      onClick={handleClear}
                      className="clear-button"
                    >
                      <span>🗑️</span>
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
                <button onClick={loadReviews} className="refresh-button">
                  <span>🔄</span>
                  Refresh
                </button>
              </div>
              
              <div className="reviews-list">
                {reviews.length === 0 ? (
                  <div className="empty-reviews">
                    <div className="empty-icon">📝</div>
                    <p>No reviews yet</p>
                    <p>Submit code for analysis to see your reviews here</p>
                  </div>
                ) : (
                  reviews.map((review) => (
                    <div 
                      key={review.id} 
                      className="review-item"
                      onClick={() => viewReview(review)}
                    >
                      <div className="review-header">
                        <div className="review-meta">
                          <span className="review-language">{review.language}</span>
                          <span className="review-category">{review.category}</span>
                        </div>
                        <div className="review-time">
                          {new Date(review.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="review-preview">
                        {review.result.substring(0, 100)}...
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="chat-panel">
          <div className="chat-header">
            <h2>
              {activeTab === 'chat' ? 'Live Analysis' : 'Review Details'}
            </h2>
            {streaming && <div className="streaming-indicator">Streaming...</div>}
          </div>
          
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="empty-icon">💡</div>
                <h3>Ready to analyze your code!</h3>
                <p>Paste your code and select a review type to get started</p>
              </div>
            ) : (
              <div className="messages">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`message message-${msg.type}`}>
                    <div className="message-avatar">
                      {msg.type === 'user' ? '👤' : msg.type === 'agent' ? '🤖' : '⚙️'}
                    </div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-type">
                          {msg.type === 'user' ? 'You' : msg.type === 'agent' ? 'AI Assistant' : 'System'}
                        </span>
                        <span className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="message-text">{msg.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
