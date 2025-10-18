# AI-Powered Code Reviewer & Explainer

A real-time AI code review application with **intelligent language detection** built with Cloudflare's modern stack: Workers AI (Llama 3.1), Durable Objects, and Cloudflare Pages.

## 🎉 Live Deployment

- **🌐 Frontend**: https://ai-code-reviewer-5fq.pages.dev
- **⚡ Backend Worker**: https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev
- **🔌 WebSocket**: wss://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/agent
- **📚 API Docs**: https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api

## 🚀 Quick Start (3 Ways)

### 1. Use Live App (Zero Setup!) 🌐
Just visit: **https://6960760b.ai-code-reviewer-5fq.pages.dev**

Paste code, select review type, and watch AI analysis stream in real-time!

### 2. Use HTTP API (No Frontend!) 🔗
Send HTTP requests directly to the backend:

```bash
# Submit code for review
curl -X POST https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api/review \
  -H "Content-Type: application/json" \
  -d '{"code": "console.log(\"Hello World\");", "category": "quick", "language": "javascript"}'

# Get all reviews
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api/reviews

# Check service status
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api/status

# View API documentation
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api
```

### 3. Test WebSocket (No Setup!) ⚡
```bash
# Open the standalone test file
open test-websocket.html
```
This provides an instant UI to test the AI code reviewer!

### 4. Local Development 💻
```bash
# Start frontend (connects to production Worker automatically)
npm run dev:frontend
# Opens at http://localhost:5173
```

### 5. Deploy Your Own 🚀
```bash
# Clone and set up
git clone <your-repo>
npm install
npm run setup  # Configure environment

# Deploy backend
npm run deploy

# Deploy frontend (uses .env for credentials - no OAuth!)
cd frontend && npm run deploy
```

## Features

- **🔍 Intelligent Language Detection**: Automatically detects programming languages and validates user selections
- **🚫 Smart Code Validation**: Rejects non-code text and provides helpful language suggestions
- **⚡ Real-time Code Analysis**: Stream AI responses as they're generated
- **🌐 Multi-language Support**: JavaScript, TypeScript, Python, Java, Go, Rust, C++, C#, PHP, Ruby, Swift, Kotlin
- **📋 Review Categories**:
  - 🚀 Quick Review: Overall code quality assessment
  - 🔒 Security Audit: Vulnerability detection & OWASP analysis
  - ⚡ Performance Analysis: Optimization suggestions
  - 📚 Documentation Review: Comment & doc improvements
- **💾 Stateful Conversations**: Maintains review history in SQLite-based Durable Objects
- **🔌 WebSocket Communication**: Instant bidirectional updates
- **💸 Free Plan Compatible**: Uses SQLite-based Durable Objects for Cloudflare free tier
- **🛡️ Error Prevention**: Prevents duplicate reviews and handles empty responses
- **🎯 Language-Specific Analysis**: Tailored feedback based on detected programming language

## Architecture

```
┌─────────────────────────────────────────────┐
│     Frontend (React + Vite)                 │
│  - Code submission interface                │
│  - Real-time streaming display              │
│  - Review history                           │
└──────────────┬──────────────────────────────┘
               │ WebSocket
               ▼
┌─────────────────────────────────────────────┐
│    Cloudflare Worker + Durable Objects      │
│  - CodeReviewerAgent class                  │
│  - Intelligent language detection           │
│  - State management & validation            │
│  - Multi-turn conversations                 │
└──────────────┬──────────────────────────────┘
               │ AI Binding
               ▼
┌─────────────────────────────────────────────┐
│  Cloudflare Workers AI                      │
│  - Llama 3.1 8B (Optimized & Reliable)     │
│  - Non-streaming inference for stability    │
└─────────────────────────────────────────────┘
```

## Setup & Installation

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account (for deployment)
- Wrangler CLI

### 1. Install Dependencies

**Backend (Worker):**
```bash
npm install
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 2. Development

Run the backend Worker locally:
```bash
npm run dev
```

In a separate terminal, run the frontend:
```bash
npm run dev:frontend
```

The Worker runs on `http://localhost:8787` and the frontend on `http://localhost:5173`.

### 3. Test the Application

1. Open `http://localhost:5173` in your browser
2. Paste code into the textarea
3. Select a review category (Quick, Security, Performance, Documentation)
4. Click "Review Code" to see streaming AI analysis

## Project Structure

```
cf_ai_code_reviewer/
├── src/
│   ├── index.ts                      # Worker entry point
│   ├── agent.ts                      # Durable Object Agent class
│   ├── types.ts                      # TypeScript type definitions
│   └── lib/
│       ├── code-review-service.ts    # Code review logic
│       └── websocket-handler.ts      # WebSocket message handling
├── frontend/
│   ├── src/
│   │   ├── App.tsx                   # Main React component
│   │   ├── App.css                   # Styles
│   │   ├── main.tsx                  # React entry
│   │   ├── vite-env.d.ts             # Vite environment types
│   │   └── index.css                 # Global styles
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── wrangler.toml                     # Worker configuration
├── package.json
└── tsconfig.json
```

## Deployment

### Backend Worker Deployment ✅ LIVE

The backend is already deployed and running!

**Worker URL**: https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev

To redeploy or update:
```bash
# Set up environment variables first
npm run setup  # Creates .env file
# Edit .env with your CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN

# Deploy
npm run deploy
```

### Frontend Deployment ✅ LIVE

The frontend is already deployed and connected to the production Worker!

**Frontend URL**: https://6960760b.ai-code-reviewer-5fq.pages.dev

To redeploy or update:
```bash
cd frontend
npm run deploy  # Uses .env credentials - NO OAUTH required!
```

**No OAuth Pop-ups!** The deployment script (`deploy-with-token.sh`) uses your API token from `.env` file directly.

### First-Time Setup

```bash
# Quick setup
npm run setup

# Or manually
cp .env.example .env
# Edit .env with your Cloudflare credentials:
# CLOUDFLARE_ACCOUNT_ID=your-account-id
# CLOUDFLARE_API_TOKEN=your-api-token
```

### Verify Deployment

```bash
# Check backend health
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/health

# View logs
npm run logs

# Verify deployment
npm run verify
```

## Configuration

### Worker Configuration (`wrangler.toml`)

- **AI Binding**: Connects to Workers AI for Llama 3.3
- **Durable Object**: `CodeReviewerAgent` for stateful sessions
- **Compatibility**: Node.js compatibility enabled

### Environment Variables

For production, you may want to add:
- API keys for additional services
- Rate limiting configuration
- Custom model parameters

## Testing WebSocket Connection

### Quick Test File (Recommended!)
We've included a standalone test file that requires no setup:

```bash
# Just open in your browser
open test-websocket.html
# or
python3 -m http.server 8080
# Then visit http://localhost:8080/test-websocket.html
```

This provides a simple UI to:
- Connect to the live Worker
- Submit code for review
- See real-time AI streaming responses
- Test all review categories

### Browser Test (With Full UI)
Run the frontend locally:
```bash
npm run dev:frontend
# Opens at http://localhost:5173
```

Then:
1. Paste some code in the textarea
2. Select a review type
3. Click "Review Code"
4. Watch the AI analysis stream in real-time!

### Command Line Test

```javascript
// Create test-websocket.html
<!DOCTYPE html>
<html>
<head><title>WebSocket Test</title></head>
<body>
<script>
const ws = new WebSocket('wss://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/agent');

ws.onopen = () => {
  console.log('✅ Connected!');
  ws.send(JSON.stringify({
    type: 'submit_code',
    code: 'console.log("Hello World");',
    category: 'quick',
    language: 'javascript'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('📨 Received:', data);
  
  if (data.type === 'stream') {
    console.log('🤖 AI Response:', data.text);
  }
};

ws.onerror = (error) => {
  console.error('❌ WebSocket error:', error);
};
</script>
</body>
</html>
```

Open this file in your browser and check the console!

```javascript
const ws = new WebSocket('ws://localhost:8787/agent');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'submit_code',
    code: 'console.log("Hello World");',
    category: 'quick',
    language: 'javascript'
  }));
};

ws.onmessage = (event) => {
  console.log(JSON.parse(event.data));
};
```

## API Reference

### HTTP API Endpoints

The backend now supports both WebSocket and HTTP requests:

#### **GET /api** - API Documentation
Returns complete API documentation and examples.

#### **POST /api/review** - Submit Code Review
Submit code for AI analysis via HTTP POST.

**Request Body:**
```json
{
  "code": "console.log('Hello World');",
  "category": "quick|security|performance|documentation",
  "language": "javascript|typescript|python|java|go|rust|cpp|csharp|php|ruby|swift|kotlin|other"
}
```

**Success Response:**
```json
{
  "success": true,
  "review": {
    "id": "unique-review-id",
    "code": "console.log('Hello World');",
    "category": "quick",
    "language": "javascript",
    "result": "AI analysis result...",
    "timestamp": 1760798282676
  }
}
```

**Language Validation Error:**
```json
{
  "success": false,
  "error": "Code appears to be python but you selected javascript. Please select the correct language for accurate analysis.\n\n💡 Try selecting 'python' instead."
}
```

#### **GET /api/reviews** - Get All Reviews
Retrieve all submitted code reviews.

**Response:**
```json
[
  {
    "id": "review-id",
    "code": "code snippet",
    "category": "quick",
    "language": "javascript",
    "result": "AI analysis",
    "timestamp": 1760798282676
  }
]
```

#### **GET /api/status** - Service Status
Check service health and statistics.

**Response:**
```json
{
  "status": "ok",
  "reviewsCount": 5,
  "messagesCount": 10
}
```

#### **GET /health** - Health Check
Basic health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "AI Code Reviewer",
  "version": "1.0.0",
  "timestamp": "2025-10-18T14:33:26.572Z"
}
```

### WebSocket Messages

**Client → Server:**
```typescript
{
  type: 'submit_code',
  code: string,
  category: 'quick' | 'security' | 'performance' | 'documentation',
  language?: string
}
```

**Server → Client:**
```typescript
// Streaming chunk
{ type: 'stream', stage: string, text: string }

// Completion
{ type: 'done', review: { id: string, code: string, result: string } }

// Language validation error
{ type: 'language_error', error: string, suggestion?: string }

// General error
{ type: 'error', error: string }
```

## 🧠 Language Detection Features

### Intelligent Code Analysis
- **Pattern Recognition**: Detects 10+ programming languages using syntax analysis
- **Validation**: Prevents mismatched language selections
- **Smart Suggestions**: Recommends correct language when mismatch detected
- **Non-code Detection**: Identifies and rejects plain text submissions

### Supported Languages
- JavaScript/TypeScript
- Python  
- Java
- Go
- Rust
- C++/C#
- PHP
- Ruby
- Swift
- Kotlin
- Other/Unknown (for edge cases)

### Example Validations
```bash
# Python code labeled as JavaScript → Rejected with suggestion
# Plain text labeled as code → Rejected with explanation  
# Multi-language code → Notes detected languages in review
# Correct language match → Proceeds with optimized analysis
```

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## Resources

- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Llama 3.3 Model](https://developers.cloudflare.com/workers-ai/models/)
- [Cloudflare Agents SDK Docs](https://developers.cloudflare.com/agents/)
- [Build a Chat Agent Guide](https://developers.cloudflare.com/agents/getting-started/build-a-chat-agent)
- [Agents API Reference](https://developers.cloudflare.com/agents/api-reference/agents-api/)