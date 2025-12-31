# AI-Powered Code Reviewer

A modern, real-time AI code review application with intelligent language detection, built on Cloudflare's edge computing platform. Get instant code analysis, security audits, performance insights, and documentation suggestions powered by Llama 3.1.

## ✨ Features

- **🔍 Intelligent Language Detection** - Automatically detects and validates programming languages
- **⚡ Real-time Streaming** - Watch AI analysis stream in real-time as it's generated
- **🌐 Multi-language Support** - JavaScript, TypeScript, Python, Java, Go, Rust, C++, C#, PHP, Ruby, Swift, Kotlin
- **📋 Review Categories**:
  - 🚀 **Quick Review** - Overall code quality assessment
  - 🔒 **Security Audit** - Vulnerability detection & OWASP analysis
  - ⚡ **Performance Analysis** - Optimization suggestions
  - 📚 **Documentation Review** - Comment & documentation improvements
- **💾 Review History** - Search, filter, and export your past reviews
- **🎨 Modern UI** - Dark mode, syntax highlighting, keyboard shortcuts
- **📊 Statistics Dashboard** - Track your review activity and insights
- **🛡️ Smart Validation** - Prevents errors and provides helpful suggestions

## 🚀 Quick Start

### Option 1: Use the Live Application

Visit the deployed application: **[https://ai-code-reviewer-5fq.pages.dev](https://ai-code-reviewer-5fq.pages.dev)**

No setup required - just paste your code and get instant AI-powered reviews!

### Option 2: Local Development

```bash
# Clone the repository
git clone <your-repo-url>
cd ai_code_reviewer

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..

# Start the backend Worker (in one terminal)
npm run dev

# Start the frontend (in another terminal)
npm run dev:frontend
```

The frontend will be available at `http://localhost:5173` and connects to the local Worker at `http://localhost:8787`.

### Option 3: HTTP API

Use the REST API directly without the frontend:

```bash
# Submit code for review
curl -X POST https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "code": "console.log(\"Hello World\");",
    "category": "quick",
    "language": "javascript"
  }'

# Get all reviews
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api/reviews

# Check service status
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api/status
```

## 📖 API Reference

### Endpoints

#### `POST /api/review`
Submit code for AI analysis.

**Request:**
```json
{
  "code": "console.log('Hello World');",
  "category": "quick|security|performance|documentation",
  "language": "javascript|typescript|python|java|go|rust|cpp|csharp|php|ruby|swift|kotlin|other"
}
```

**Response:**
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

#### `GET /api/reviews`
Retrieve all submitted code reviews.

#### `GET /api/status`
Check service health and statistics.

#### `GET /health`
Basic health check endpoint.

#### `GET /api`
Interactive API documentation.

### WebSocket API

The application also supports WebSocket connections for real-time streaming. Connect to `/agent` endpoint and send:

```json
{
  "type": "submit_code",
  "code": "your code here",
  "category": "quick",
  "language": "javascript"
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   Frontend (React + Vite)          │
│   - Modern UI with dark mode       │
│   - Real-time streaming display    │
│   - Review history & search        │
└──────────────┬──────────────────────┘
               │ WebSocket / HTTP
               ▼
┌─────────────────────────────────────┐
│   Cloudflare Worker                 │
│   - Durable Objects for state       │
│   - Language detection              │
│   - Request validation              │
└──────────────┬──────────────────────┘
               │ AI Binding
               ▼
┌─────────────────────────────────────┐
│   Cloudflare Workers AI             │
│   - Llama 3.1 8B Model              │
└─────────────────────────────────────┘
```

## 📁 Project Structure

```
ai_code_reviewer/
├── worker/                       # Cloudflare Worker backend
│   ├── index.ts                 # Worker entry point
│   ├── agent.ts                 # Durable Object Agent
│   ├── types.ts                 # TypeScript definitions
│   └── lib/
│       ├── code-review-service.ts
│       └── websocket-handler.ts
├── frontend/                     # React frontend application
│   ├── src/
│   │   ├── App.tsx              # Main component
│   │   ├── App.css              # Styles
│   │   └── main.tsx             # Entry point
│   ├── package.json
│   └── vite.config.ts
├── scripts/                      # Deployment & utility scripts
│   ├── setup-env.sh             # Environment setup
│   ├── pre-deploy-check.sh      # Pre-deployment validation
│   └── verify-deployment.sh     # Post-deployment verification
├── tests/                        # Test files
│   └── test-websocket.html      # WebSocket test utility
├── docs/                         # Documentation
│   └── PROMPT.md                # Project prompt/requirements
├── config/                       # Configuration files
│   ├── wrangler.workers.toml    # Worker configuration
│   └── wrangler.pages.toml      # Pages configuration
├── wrangler.toml                 # Main Worker config
├── package.json                  # Backend dependencies
└── tsconfig.json                 # TypeScript configuration
```

## 🛠️ Development

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account (for deployment)
- Wrangler CLI (installed via npm)

### Setup

1. **Install dependencies:**
   ```bash
   # Backend
   npm install
   
   # Frontend
   cd frontend && npm install && cd ..
   ```

2. **Configure environment:**
   ```bash
   npm run setup
   # Edit .env with your Cloudflare credentials
   ```

3. **Run locally:**
   ```bash
   # Terminal 1: Backend
   npm run dev
   
   # Terminal 2: Frontend
   npm run dev:frontend
   ```

### Testing

1. Open `http://localhost:5173` in your browser
2. Paste code into the editor
3. Select a review category
4. Click "Review Code" to see streaming AI analysis

## 🚢 Deployment

### Backend (Cloudflare Worker)

```bash
# Configure environment first
npm run setup

# Deploy
npm run deploy
```

### Frontend (Cloudflare Pages)

```bash
cd frontend
npm run deploy
```

The deployment script uses API tokens from `.env` - no OAuth required!

### Verify Deployment

```bash
# Check health
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/health

# View logs
npm run logs

# Verify deployment
npm run verify
```

## 🧠 Language Detection

The application intelligently detects programming languages using pattern recognition:

- **Automatic Detection** - Analyzes code syntax to identify the language
- **Validation** - Prevents mismatched language selections
- **Smart Suggestions** - Recommends correct language when mismatch detected
- **Non-code Detection** - Identifies and rejects plain text submissions

### Supported Languages

JavaScript, TypeScript, Python, Java, Go, Rust, C++, C#, PHP, Ruby, Swift, Kotlin, and more.

## ⌨️ Keyboard Shortcuts

- `Ctrl/Cmd + K` - Focus code input
- `Ctrl/Cmd + Enter` - Submit review

## 🔧 Configuration

### Worker Configuration (`wrangler.toml`)

- **AI Binding**: Connects to Workers AI for Llama 3.1
- **Durable Object**: `CodeReviewerAgent` for stateful sessions
- **Compatibility**: Node.js compatibility enabled

### Environment Variables

Create a `.env` file with:

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

## 📚 Resources

- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the MIT License.
