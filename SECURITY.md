# 🔒 Security Guidelines for AgentOS

## ⚠️ CRITICAL: API Key Security

### Before Committing Code:
1. **NEVER** commit real API keys to Git
2. **ALWAYS** use environment variables for secrets
3. **CHECK** all files before `git add`

### Protected Secrets:
- OpenAI API keys (`sk-proj-...`, `sk-...`)
- Anthropic API keys (`sk-ant-...`)
- AgentOS API keys (`ak_...`)
- JWT secrets
- Database passwords
- Redis URLs with auth

### Safe Patterns:
```javascript
// ✅ GOOD - Uses environment variables
const apiKey = process.env.OPENAI_API_KEY;
const authToken = process.env.AUTH_TOKEN;

// ❌ BAD - Hardcoded secrets
const apiKey = 'sk-proj-abc123...';
const authToken = 'ak_fe8f9592e91c4586...';
```

### Setup Instructions:
1. Copy `env.example` to `.env`
2. Fill in your actual values in `.env`
3. **NEVER** commit `.env` to Git (protected by `.gitignore`)

### Pre-commit Checklist:
- [ ] No `sk-` keys in code
- [ ] No `ak_` keys in code  
- [ ] All secrets use `process.env`
- [ ] `.env` file not tracked
- [ ] Test files use placeholder keys

### Emergency Response:
If you accidentally commit secrets:
1. **IMMEDIATELY** revoke/regenerate the exposed keys
2. `git filter-branch` to remove from history
3. Force push to overwrite remote history
4. Audit all commits for other secrets

### Cost Safety:
When testing with real APIs:
- Set strict budget limits (`monthly_cost_limit`)
- Use minimal token limits (`max_tokens: 10`)
- Monitor spend in real-time
- Never exceed $5 in testing
