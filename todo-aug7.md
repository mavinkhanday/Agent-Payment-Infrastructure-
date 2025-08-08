Ran tool
Here's your comprehensive MVP readiness checklist. I've organized it by priority - tackle the **Critical Path** items first, then the **Production Hardening** items before any beta users touch the system.

## 🚨 Critical Path (Week 1 - Core Functionality)

These are blocking issues that prevent the core "kill runaway agents" promise:

1. **Schema & Budget Controls** - Add the database columns needed for spend limits
2. **Budget Middleware** - The core logic that enforces limits and flips kill-switches  
3. **Redis Spend Cache** - Real-time cost tracking without hitting Postgres on every check
4. **Idempotent Events** - Prevent duplicate charges from retry attempts
5. **Race Condition Fix** - Stop concurrent requests from breaking agent/customer creation

## 🛡️ Production Hardening (Week 1-2 - Security & Reliability)

Essential before any external users:

6. **Rate Limiting** - Protect auth endpoints from brute force
7. **Security Headers** - Basic web security with Helmet
8. **Secret Management** - Remove hardcoded secrets, secure env loading
9. **Input Validation** - Server-side limits on API responses
10. **SDK Error Handling** - Graceful handling of suspended agent errors

## 🧪 Validation & Quality (Week 2 - Confidence Building)

Prove it works under stress:

11. **Integration Tests** - End-to-end tests covering the budget enforcement flow
12. **Load Testing** - Validate your 400 req/sec target capacity  
13. **Observability** - Proper logging and metrics for production monitoring
14. **CI Pipeline** - Automated testing to catch regressions
15. **Documentation** - Clear examples of the new budget features

## 🎯 Success Criteria

Your MVP is ready when you can demo:
- ✅ Agent hits monthly limit → immediate 403 response
- ✅ Kill-switch toggle → agent cannot post new events
- ✅ Dashboard shows real-time spend per agent
- ✅ System handles 400 req/sec without degradation
- ✅ Duplicate events are rejected (idempotency)
- ✅ Security scan passes (no obvious vulnerabilities)

Start with the **Critical Path** items - they're the core differentiation from existing solutions. Once those work, the production hardening ensures you won't embarrass yourself when beta users start hammering the system.

Each TODO item includes the specific technical approach needed. Ready to dive into the first one?