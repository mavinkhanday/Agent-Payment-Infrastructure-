# Agent-Payment-Infrastructure-
> Building the infrastructure AI agents need to transact with each other

[![GitHub](https://img.shields.io/badge/GitHub-AgentOS-blue?logo=github)](https://github.com/mavinkhanday/Agent-Payment-Infrastructure-)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](docker-compose.yml)

## 🎯 Vision

AgentOS is the financial infrastructure layer that enables AI agents to spend money safely, with per-agent cards, real-time cost tracking, and instant kill-switches. Think "Stripe for AI agents."

### The Problem We Solve
- 💸 **Runaway Costs**: Founders' personal cards melted by $72k OpenAI weekend bills
- 🔑 **Shared API Keys**: No isolation = cascading rate-limit failures  
- 📊 **Zero Attribution**: Can't bill customers correctly without per-agent tracking
- 🚨 **No Guardrails**: No real-time way to stop runaway agents

## ✨ Features

### 🔥 **Core MVP (Ready Now)**
- ✅ **Real-time Cost Tracking** - Automatic usage monitoring for OpenAI, Anthropic, and custom APIs
- ✅ **Per-Agent Budgets** - Set monthly spending limits with automatic kill-switch
- ✅ **Multi-Provider Support** - Works with OpenAI, Anthropic, and generic APIs
- ✅ **Redis-Powered** - Sub-millisecond budget checks with real-time caching
- ✅ **React Dashboard** - Beautiful UI for monitoring costs and managing agents
- ✅ **SDK Integration** - Drop-in replacement for OpenAI/Anthropic clients

### 🚀 **Coming Soon**
- 🎫 Virtual API Keys (proxy layer for isolation)
- 💳 Virtual Cards via Stripe Issuing  
- 🤝 Agent-to-Agent Payments
- 🏪 Agent Marketplace

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   AI Agents     │    │   AgentOS    │    │   Providers     │
│                 │    │              │    │                 │
│ ┌─────────────┐ │    │ ┌──────────┐ │    │ ┌─────────────┐ │
│ │ Agent A     │◄┼────┼►│Cost Track│ │    │ │ OpenAI      │ │
│ │ Budget: $50 │ │    │ │+ Budget  │ │    │ │ Anthropic   │ │
│ └─────────────┘ │    │ │Enforcement│◄┼────┼►│ Custom APIs │ │
│                 │    │ └──────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │              │    │                 │
│ │ Agent B     │◄┼────┼► Redis Cache │    │                 │
│ │ Suspended   │ │    │   Dashboard  │    │                 │
│ └─────────────┘ │    │              │    │                 │
└─────────────────┘    └──────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)

### 1. Clone and Setup
```bash
git clone https://github.com/mavinkhanday/Agent-Payment-Infrastructure-.git
cd Agent-Payment-Infrastructure-
cp env.example .env
# Edit .env with your API keys
```

### 2. Start with Docker
```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- 🗄️ PostgreSQL database
- 🔴 Redis cache  
- 🚀 API server (port 3000)
- 🎨 React dashboard (port 5173)

### 3. Verify Setup
```bash
curl http://localhost:3000/health
# Should return: {"status":"OK","message":"AI Cost Tracker API is running"}
```

### 4. Access Dashboard
Open http://localhost:5173 to see the cost tracking dashboard!

## 💻 SDK Usage

### OpenAI with Cost Tracking
```javascript
const { TrackedOpenAI } = require('agentos-sdk');

const openai = new TrackedOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  agentId: 'my-sales-agent',
  customerId: 'customer-123',
  apiBaseUrl: 'http://localhost:3000',
  authToken: process.env.AGENTOS_KEY
});

// Use exactly like OpenAI client - costs tracked automatically!
const completion = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Set Budget Limits
```bash
# Set $100 monthly limit for agent
curl -X PATCH http://localhost:3000/api/agents/my-sales-agent/budget \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"monthly_cost_limit": 100.00}'
```

### Kill-Switch (Suspend Agent)
```bash
# Emergency stop
curl -X POST http://localhost:3000/api/agents/my-sales-agent/suspend \
  -H "Authorization: Bearer your-api-key" \
  -d '{"reason": "Emergency stop - unexpected spend"}'
```

## 🔧 API Reference

### Core Endpoints

#### Record Usage
```http
POST /api/usage/record
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "event_name": "chat_completion",
  "agent_id": "sales-agent-1",
  "customer_id": "acme-corp",
  "vendor": "openai",
  "model": "gpt-3.5-turbo", 
  "cost_amount": 0.002,
  "metadata": {
    "tokens": 150,
    "prompt_type": "sales_email"
  }
}
```

#### Get Agent Status
```http
GET /api/agents/{agent_id}
Authorization: Bearer your-api-key

Response:
{
  "agent_id": "sales-agent-1",
  "monthly_cost_limit": "100.00",
  "is_suspended": false,
  "current_month_spend": "23.45"
}
```

#### Budget Management
```http
# Set budget
PATCH /api/agents/{agent_id}/budget
{"monthly_cost_limit": 100.00}

# Suspend agent  
POST /api/agents/{agent_id}/suspend
{"reason": "Manual suspension"}

# Reactivate agent
POST /api/agents/{agent_id}/reactivate
```

## 📊 Real-World Example

Here's how AgentOS prevented a $1000+ runaway cost:

```javascript
// Agent starts making calls
const agent = new TrackedOpenAI({
  agentId: 'content-generator',
  monthlyLimit: 50.00  // $50 budget
});

// After $50 spent...
const response = await agent.chat.completions.create({...});
// ❌ Throws: "Agent suspended - monthly budget exceeded"

// Check status
curl /api/agents/content-generator
// Returns: {"is_suspended": true, "current_month_spend": "50.01"}
```

**Result**: Automatic protection saved $950+ in runaway costs! 🛡️

## 🧪 Testing

### Run Test Suite
```bash
# Unit tests
npm test

# Integration tests with real APIs (set budget limits!)
OPENAI_API_KEY=sk-... npm run test:integration

# Load testing
npm run test:load
```

### Test with Real OpenAI (Safe)
```bash
# Ultra-safe test with $2 budget limit
OPENAI_API_KEY=sk-... node test/real-openai-safe.js
```

## 🔒 Security

AgentOS takes security seriously:

- 🔐 **No Hardcoded Secrets** - All keys via environment variables
- 🛡️ **Budget Enforcement** - Real-time spend monitoring with Redis
- 🚨 **Kill-Switch** - Instant agent suspension
- 📝 **Audit Logs** - Full usage event tracking
- 🔍 **Rate Limiting** - Protection against abuse

See [SECURITY.md](SECURITY.md) for detailed guidelines.

## 🏢 Production Deployment

### Environment Variables (Required)
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379

# Security
JWT_SECRET=your-super-secure-32-char-secret
API_KEY_PREFIX=ak_

# APIs
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Docker Production
```bash
docker compose -f docker-compose.yml up -d
```

### Scaling Considerations
- **Redis**: Required for real-time budget checks
- **Database**: PostgreSQL with materialized views for fast queries
- **API**: Stateless - can scale horizontally
- **Rate Limits**: 400 req/sec per instance tested

## 🛣️ Roadmap

### 🎯 **Phase 1: Cost Tracking MVP** ✅
- [x] Real-time usage tracking
- [x] Budget limits & kill-switch
- [x] Multi-provider support
- [x] React dashboard

### 🎯 **Phase 2: API Proxy** (Month 2)
- [ ] Virtual API keys
- [ ] Rate limit isolation
- [ ] Request/response caching
- [ ] Custom model routing

### 🎯 **Phase 3: Virtual Cards** (Month 3)
- [ ] Stripe Issuing integration
- [ ] Per-agent card provisioning
- [ ] Spend controls & webhooks
- [ ] Real-time card blocking

### 🎯 **Phase 4: Agent Economy** (Month 4-6)
- [ ] Agent-to-agent payments
- [ ] Service marketplace
- [ ] Escrow & disputes
- [ ] Revenue sharing

## 📈 Market Opportunity

- **TAM**: $50B+ AI infrastructure market
- **Problem**: Every AI company faces runaway costs
- **Competition**: Paid.ai (bills but can't pay), no real alternatives
- **Edge**: Free cost tracking → paid virtual cards → agent economy

## 🤝 Contributing

We're building in public! Here's how to help:

1. **Try the MVP** - Deploy locally and give feedback
2. **Report Issues** - Found a bug? Open an issue
3. **Feature Requests** - What would make AgentOS better?
4. **Code Contributions** - PRs welcome!

### Development Setup
```bash
npm install
npm run dev
docker compose -f docker-compose.dev.yml up postgres redis
```

## 📞 Support & Community

- 🐛 **Issues**: [GitHub Issues](https://github.com/mavinkhanday/Agent-Payment-Infrastructure-/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/mavinkhanday/Agent-Payment-Infrastructure-/discussions)
- 📧 **Email**: Contact via GitHub
- 🐦 **Updates**: Follow development on GitHub

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🚀 **Ready to stop AI agents from bankrupting you?**

```bash
git clone https://github.com/mavinkhanday/Agent-Payment-Infrastructure-.git
cd Agent-Payment-Infrastructure-
docker compose -f docker-compose.dev.yml up -d
```

**Your agents' spending is now under control.** 🎉

---

*Built with ❤️ for the AI agent economy*
