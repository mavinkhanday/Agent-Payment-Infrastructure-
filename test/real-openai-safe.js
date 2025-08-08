#!/usr/bin/env node

/**
 * ULTRA-SAFE Real OpenAI Test
 * Direct API calls with manual cost tracking
 * MAX BUDGET: $5 (will stop at $2)
 */

const https = require('https');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-api-key-here';

// SAFETY LIMITS
const MAX_TOKENS = 10;        // Tiny responses
const MAX_CALLS = 2;          // Only 2 calls
const MAX_SPEND = 2.00;       // $2 hard limit

async function makeOpenAICall(prompt, testNumber) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-3.5-turbo',
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Parse error: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function recordUsage(agentId, customerId, cost, metadata = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      event_name: 'real_openai_test',
      agent_id: agentId,
      customer_id: customerId,
      vendor: 'openai',
      model: 'gpt-3.5-turbo',
      cost_amount: cost,
      metadata: metadata
    });

    const url = new URL(`${API_BASE_URL}/api/usage/record`);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = (url.protocol === 'https:' ? https : require('http')).request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (e) {
          resolve({ message: responseData });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runSafeTest() {
  console.log('🔥 ULTRA-SAFE Real OpenAI Test');
  console.log('==============================');
  console.log(`Max spend: $${MAX_SPEND}`);
  console.log(`Max calls: ${MAX_CALLS}`);
  console.log(`Max tokens per call: ${MAX_TOKENS}`);
  console.log('');

  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY required');
    process.exit(1);
  }

  let totalCost = 0;

  for (let i = 1; i <= MAX_CALLS; i++) {
    console.log(`\n🧪 Test ${i}/${MAX_CALLS}: Minimal OpenAI call...`);
    
    try {
      const start = Date.now();
      
      // MINIMAL prompt for safety
      const result = await makeOpenAICall(`Say "${i}"`, i);
      
      if (result.error) {
        console.error(`❌ OpenAI Error:`, result.error.message);
        if (result.error.message.includes('quota')) {
          console.log('🛑 Quota exceeded - stopping');
          break;
        }
        continue;
      }

      const duration = Date.now() - start;
      const response = result.choices?.[0]?.message?.content || 'No response';
      const usage = result.usage || {};
      
      // Calculate actual cost
      const inputTokens = usage.prompt_tokens || 5;
      const outputTokens = usage.completion_tokens || 1;
      const cost = (inputTokens * 0.0015 + outputTokens * 0.002) / 1000;
      
      totalCost += cost;
      
      console.log(`✅ Response: "${response}"`);
      console.log(`📊 Tokens: ${usage.total_tokens || 'unknown'} (in: ${inputTokens}, out: ${outputTokens})`);
      console.log(`💰 Real Cost: $${cost.toFixed(6)}`);
      console.log(`⏱️  Duration: ${duration}ms`);
      
      // Record in our system
      const trackResult = await recordUsage(
        'real-test-agent', 
        'real-api-test', 
        cost,
        { test_number: i, tokens: usage.total_tokens }
      );
      console.log(`📝 Tracked: ${trackResult.message || 'OK'}`);
      
      // SAFETY CHECK
      if (totalCost > MAX_SPEND) {
        console.log(`\n🛑 SAFETY STOP: Cost $${totalCost.toFixed(4)} > limit $${MAX_SPEND}`);
        break;
      }
      
      // Pause between calls
      if (i < MAX_CALLS) {
        await new Promise(r => setTimeout(r, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Test ${i} failed:`, error.message);
      if (error.message.includes('quota') || error.message.includes('billing')) {
        console.log('🛑 Quota/billing issue - stopping');
        break;
      }
    }
  }

  console.log(`\n📊 FINAL SUMMARY`);
  console.log(`===============`);
  console.log(`💰 Total spent: $${totalCost.toFixed(6)}`);
  console.log(`💡 Budget used: ${((totalCost/MAX_SPEND)*100).toFixed(1)}%`);
  console.log(`✅ Test completed safely!`);
  
  if (totalCost > 0.1) {
    console.log(`⚠️  WARNING: Spent more than $0.10 - verify tracking`);
  }
}

if (require.main === module) {
  runSafeTest().catch(console.error);
}
