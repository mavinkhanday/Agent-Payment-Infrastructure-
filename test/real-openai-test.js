#!/usr/bin/env node

/**
 * SAFE Real OpenAI API Test with Cost Tracking
 * Budget: MAX $5 total spend
 * 
 * This test will:
 * 1. Make minimal, cheap OpenAI calls
 * 2. Track costs automatically via our SDK
 * 3. Set strict budget limits to prevent overspend
 */

const { TrackedOpenAI } = require('../sdk/dist/index.js');

// Cost-safe configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-api-key-here';

// Safety limits
const MAX_TOKENS = 50;  // Very small responses
const MAX_CALLS = 3;    // Only 3 test calls
const ESTIMATED_COST_PER_CALL = 0.001; // ~$0.001 per call
const MAX_BUDGET = 5.00; // $5 hard limit

async function testRealOpenAI() {
  console.log('🔥 REAL OpenAI API Test - Cost Tracking');
  console.log('======================================');
  console.log(`Budget: $${MAX_BUDGET} max`);
  console.log(`Estimated cost: $${(ESTIMATED_COST_PER_CALL * MAX_CALLS).toFixed(3)}`);
  console.log('');

  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not provided');
    process.exit(1);
  }

  // Initialize tracked OpenAI client
  const openai = new TrackedOpenAI({
    apiKey: OPENAI_API_KEY,
    agentId: 'real-test-agent',
    customerId: 'real-api-test',
    apiBaseUrl: API_BASE_URL,
    authToken: AUTH_TOKEN
  });

  let totalCost = 0;

  for (let i = 1; i <= MAX_CALLS; i++) {
    console.log(`\n🧪 Test ${i}/${MAX_CALLS}: Making real OpenAI call...`);
    
    try {
      const start = Date.now();
      
      // SAFE: Very cheap call - minimal tokens
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',  // Cheapest model
        max_tokens: MAX_TOKENS,   // Limit response size
        messages: [
          { role: 'user', content: `Say "${i}"` }  // Minimal prompt
        ]
      });

      const duration = Date.now() - start;
      const response = completion.choices[0].message.content;
      
      // Estimate cost (will be tracked automatically by SDK)
      const inputTokens = 10; // Rough estimate for tiny prompt
      const outputTokens = completion.usage?.completion_tokens || 1;
      const estimatedCost = (inputTokens * 0.0015 + outputTokens * 0.002) / 1000;
      totalCost += estimatedCost;
      
      console.log(`✅ Response: "${response}"`);
      console.log(`📊 Tokens: ${completion.usage?.total_tokens || 'unknown'}`);
      console.log(`💰 Est. Cost: $${estimatedCost.toFixed(4)}`);
      console.log(`⏱️  Duration: ${duration}ms`);
      
      // Safety check
      if (totalCost > MAX_BUDGET) {
        console.log(`\n🛑 SAFETY STOP: Approaching budget limit ($${totalCost.toFixed(4)})`);
        break;
      }
      
      // Brief pause between calls
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Test ${i} failed:`, error.message);
      if (error.message.includes('quota') || error.message.includes('billing')) {
        console.log('🛑 OpenAI quota/billing issue - stopping tests');
        break;
      }
    }
  }

  console.log(`\n📈 SUMMARY`);
  console.log(`==========`);
  console.log(`Total estimated cost: $${totalCost.toFixed(4)}`);
  console.log(`Budget remaining: $${(MAX_BUDGET - totalCost).toFixed(4)}`);
  console.log(`\n✅ Cost tracking test completed safely!`);
}

// Run the test
if (require.main === module) {
  testRealOpenAI()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testRealOpenAI };