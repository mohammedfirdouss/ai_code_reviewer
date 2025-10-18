# AI-Powered Code Reviewer & Explainer

## Project Overview

Build an AI-powered Code Reviewer & Explainer using Cloudflare's modern stack, leveraging the Agents SDK to create a stateful, real-time interactive agent that analyzes, reviews, and explains code submissions.

## Core Requirements

### 1. LLM Integration

Use Llama 3.3 via Cloudflare Workers AI as the primary AI model. The model should analyze code for:

- Bug detection and potential issues
- Code quality and best practices
- Performance optimizations
- Security vulnerabilities
- Code explanation and documentation suggestions

### 2. Workflow & Coordination (Using Cloudflare Agents SDK)

Build an Agent class that extends the Agents SDK's Agent class. The Agent should:

- Manage multi-turn conversations with code review context
- Coordinate between user input and LLM processing
- Handle long-running code analysis tasks
- Support asynchronous workflows for complex reviews

Deploy on Durable Objects for stateful execution. Optionally integrate Cloudflare Workflows for scheduled or queued code reviews.

### 3. User Input & Real-Time Communication

Build a Cloudflare Pages frontend with a chat interface where users can:

- Paste code snippets via text input
- Optionally use voice input to describe code or ask questions
- Ask follow-up questions about the review
- Request specific analysis (performance, security, style)

Use WebSockets (via Agents SDK) for real-time bidirectional communication and stream responses back as the LLM processes the review.

### 4. Memory & State Management

Leverage built-in Agent state (`this.setState()`) to persist:

- Conversation history
- Previously reviewed code snippets
- User preferences and focus areas
- Review metadata (timestamp, language, complexity)

Use the Agent's built-in SQL database to store and query past reviews. Implement state synchronization between Agent and client using the `useAgent` hook.

## Technical Architecture

```
┌─────────────────────────────────────────────┐
│     Cloudflare Pages (Frontend)             │
│  - Chat UI for code submission              │
│  - Real-time message display                │
│  - Voice input integration                  │
│  - Conversation history                     │
└──────────────┬──────────────────────────────┘
               │ WebSocket
               │ (Real-time, bidirectional)
               ▼
┌─────────────────────────────────────────────┐
│    Cloudflare Agents (Durable Objects)      │
│  - Agent class managing code review logic   │
│  - State management (conversation, reviews) │
│  - Multi-turn conversation coordination     │
│  - Built-in SQL for persistence             │
└──────────────┬──────────────────────────────┘
               │ API calls
               ▼
┌─────────────────────────────────────────────┐
│  Cloudflare Workers AI                      │
│  - Llama 3.3 model inference                │
│  - Code analysis & review                   │
│  - Streaming responses                      │
└─────────────────────────────────────────────┘
```

## Key Features to Implement

**Multi-language Code Support:** Detect and review code in Python, JavaScript, Java, C++, Go, Rust, and other languages.

**Contextual Follow-ups:** User asks "Why is this a problem?" and the Agent recalls the code and previous analysis.

**Review Categories:**

- Quick Review (overall quality check)
- Security Audit (vulnerability detection)
- Performance Analysis (optimization suggestions)
- Documentation (add comments and docstrings)

**Conversation Memory:** The Agent maintains full conversation context, allowing users to refine questions and build on previous feedback.

**Real-time Streaming:** As Llama 3.3 processes the review, stream partial results back to the user for better UX.

## Development Steps

1. Initialize project with Cloudflare's Agents starter template
2. Define Agent class with code review methods
3. Connect to Workers AI for Llama 3.3 inference
4. Build Pages frontend with chat UI and voice support
5. Implement WebSocket communication between Pages and Agent
6. Set up state persistence using Agent's built-in database
7. Deploy and test across the Cloudflare global network

## Resources

- [Cloudflare Agents SDK Docs](https://developers.cloudflare.com/agents/)
- [Build a Chat Agent Guide](https://developers.cloudflare.com/agents/getting-started/build-a-chat-agent)
- [Agents API Reference](https://developers.cloudflare.com/agents/api-reference/agents-api/)
- [Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Durable Objects Guide](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)