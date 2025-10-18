# AI-Powered Code Reviewer & Explainer

A real-time AI code review application built with Cloudflare's modern stack: Workers AI (Llama 3.3), Durable Objects, and Cloudflare Pages.

## Features

- **Real-time Code Analysis**: Stream AI responses as they're generated
- **Multi-language Support**: JavaScript, TypeScript, Python, Java, Go, Rust, C++, C#
- **Review Categories**:
  - Quick Review: Overall code quality assessment
  - Security Audit: Vulnerability detection & OWASP analysis
  - Performance Analysis: Optimization suggestions
  - Documentation Review: Comment & doc improvements
- **Stateful Conversations**: Maintains review history in Durable Objects
- **WebSocket Communication**: Instant bidirectional updates

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
│  - State management                         │
│  - Multi-turn conversations                 │
└──────────────┬──────────────────────────────┘
               │ AI Binding
               ▼
┌─────────────────────────────────────────────┐
│  Cloudflare Workers AI                      │
│  - Llama 3.3 70B (FP8 Fast)                 │
│  - Streaming inference                      │
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

### Deploy Worker

```bash
npm run deploy
```

### Deploy Frontend (Cloudflare Pages)

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Deploy to Cloudflare Pages:
```bash
wrangler pages deploy dist
```

Or connect your GitHub repo to Cloudflare Pages for automatic deployments.

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

// Error
{ type: 'error', error: string }
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