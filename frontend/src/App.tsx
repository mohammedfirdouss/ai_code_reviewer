import { useState, useEffect, useRef } from 'react'
import './App.css'

interface Message {
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
}

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [code, setCode] = useState('');
  const [category, setCategory] = useState<'quick' | 'security' | 'performance' | 'documentation'>('quick');
  const [language, setLanguage] = useState('javascript');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
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
    // Use explicit URL with port for worker dev server
    const host = import.meta.env.DEV ? 'localhost:8787' : window.location.host;
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
          const reviews = data.reviews || [];
          if (reviews.length === 0) {
            addMessage('system', 'No past reviews found.');
          } else {
            addMessage('system', `Found ${reviews.length} review(s). Displaying results:`);
            reviews.forEach((r: any) => {
              const header = `Review ID: ${r.id} — ${new Date(r.timestamp).toLocaleString()}`;
              addMessage('agent', header + '\n' + (r.result || '(no result saved)'));
            });
          }
        } catch (e) {
          addMessage('system', 'Failed to parse reviews response');
        }
        break;
      case 'done':
        setStreaming(false);
        // Show the full review result if stream chunks weren't received
        if (data.review.result) {
          addMessage('agent', data.review.result);
        }
        addMessage('system', `✅ Review completed (ID: ${data.review.id})`);
        break;
      case 'error':
        setStreaming(false);
        addMessage('system', `Error: ${data.error}`);
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
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🤖 AI Code Reviewer</h1>
        <div className="status">
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}></span>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <div className="container">
        <div className="input-section">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="language">Language</label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="go">Go</option>
                <option value="rust">Rust</option>
                <option value="cpp">C++</option>
                <option value="csharp">C#</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="category">Review Type</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
              >
                <option value="quick">Quick Review</option>
                <option value="security">Security Audit</option>
                <option value="performance">Performance Analysis</option>
                <option value="documentation">Documentation Review</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="code">Code to Review</label>
              <textarea
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste your code here..."
                rows={15}
              />
            </div>

            <div className="button-group">
              <button type="submit" disabled={!connected || streaming}>
                {streaming ? 'Reviewing...' : 'Review Code'}
              </button>
              <button type="button" onClick={handleClear}>
                Clear
              </button>
              <button type="button" onClick={() => {
                if (!ws || !connected) {
                  alert('Not connected to server');
                  return;
                }
                ws.send(JSON.stringify({ type: 'list_reviews' }));
              }}>
                View Reviews
              </button>
            </div>
          </form>
        </div>

        <div className="output-section">
          <div className="messages-header">
            <h2>Analysis Output</h2>
            {streaming && <div className="loading-spinner"></div>}
          </div>
          <div className="messages">
            {messages.length === 0 && (
              <div className="empty-state">
                <p>No messages yet. Submit code to start reviewing.</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`message message-${msg.type}`}>
                <div className="message-header">
                  <span className="message-type">{msg.type}</span>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
