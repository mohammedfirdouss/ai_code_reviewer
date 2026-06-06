# AI Code Reviewer

Real-time AI-powered code analysis running on Cloudflare's edge. Paste code, get a streaming review — security audits, performance analysis, documentation feedback, or a general quality pass.

**Live:** [ai-code-reviewer-5fq.pages.dev](https://ai-code-reviewer-5fq.pages.dev)

## How It Works

```
Browser (React) ──WebSocket──> Cloudflare Worker ──> Durable Object ──> Workers AI (Llama 3.3 70B)
                                                            |
                                                     Persistent state
                                                     (review history)
```

- The frontend connects via WebSocket on load and streams review output chunk-by-chunk.
- The backend is a Cloudflare Durable Object — one persistent instance per agent that holds conversation history and past reviews in storage.
- Language detection runs before the AI call. If the selected language doesn't match the code, the review is rejected with a suggestion.

## Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React + TypeScript (Vite)           |
| Backend   | Cloudflare Workers (TypeScript)     |
| State     | Cloudflare Durable Objects          |
| AI        | Workers AI — Llama 3.3 70B Instruct |
| Deploy    | Cloudflare Pages + Workers          |

## Review Types

| Type            | What it checks                                          |
|-----------------|---------------------------------------------------------|
| `quick`         | Overall code quality, structure, naming, logic          |
| `security`      | Vulnerabilities, OWASP Top 10, injection risks          |
| `performance`   | Bottlenecks, algorithmic complexity, memory usage       |
| `documentation` | Inline comments, docstrings, API surface clarity        |

## Local Development

**Prerequisites:** Node.js 18+, a Cloudflare account, Wrangler CLI

```bash
# 1. Install dependencies
npm install
cd frontend && npm install && cd ..

# 2. Configure environment
cp .env.example .env
# Fill in CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN

# 3. Start the backend Worker (terminal 1)
npm run dev

# 4. Start the frontend (terminal 2)
npm run dev:frontend
```

Frontend: `http://localhost:5173`
Worker: `http://localhost:8787`


## WebSocket Protocol

Connect to `/agent` and send JSON messages:

**Submit code for review:**
```json
{
  "type": "submit_code",
  "code": "func main() { fmt.Println(\"hello\") }",
  "language": "go",
  "category": "performance"
}
```

**Server events:**
```
{ "type": "stream", "text": "chunk..." }   -- streaming content
{ "type": "done",   "review": { ... } }    -- review complete
{ "type": "language_error", "error": "..." } -- language mismatch
{ "type": "error",  "error": "..." }       -- general error
```

**List past reviews:**
```json
{ "type": "list_reviews" }
```

## REST API

```bash
# Submit for review (non-streaming)
curl -X POST https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api/review \
  -H "Content-Type: application/json" \
  -d '{"code": "...", "category": "quick", "language": "python"}'

# Get all past reviews
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/api/reviews

# Health check
curl https://ai-code-reviewer-backend.mohammedfirdousaraoye.workers.dev/health
```

## Deployment

```bash
# Deploy the Worker
npm run deploy

# Deploy the frontend to Cloudflare Pages
cd frontend && npm run deploy
```

```bash
# Verify after deploy
npm run verify

# Tail live logs
npm run logs
```

## Keyboard Shortcuts

| Shortcut           | Action           |
|--------------------|------------------|
| `Ctrl/Cmd + K`     | Focus code input |
| `Ctrl/Cmd + Enter` | Submit review    |

## Environment Variables

```env
# .env (never commit this)
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

## References

- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
