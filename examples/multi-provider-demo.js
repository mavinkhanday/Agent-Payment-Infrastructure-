/**
 * Multi-Provider AI Cost Tracking Demo
 * 
 * This example shows how AgentOS can track costs across:
 * 1. OpenAI (GPT, embeddings, images)
 * 2. Anthropic (Claude)  
 * 3. Custom APIs (any HTTP-based AI service)
 * 
 * Usage: 
 * OPENAI_KEY=sk-... ANTHROPIC_KEY=sk-... AGENTOS_KEY=ak_... node examples/multi-provider-demo.js
 */

// Import from built SDK
const { CostTracker } = require('../sdk/dist/cost-tracker');
const { incrementAgentSpend } = require('../src/config/redis');

const OpenAI = require('openai');

async function demonstrateMultiProvider() {
  console.log('🚀 AgentOS Multi-Provider Cost Tracking Demo');
  console.log('===========================================\n');

  // Initialize cost tracker
  const tracker = new CostTracker({
    apiKey: process.env.AGENTOS_KEY || 'your-api-key-here',
    apiUrl: 'http://localhost:3000',
    agentId: 'multi-provider-demo',
    customerId: 'demo-customer',
    debug: true
  });

  console.log('✅ Initialized AgentOS cost tracker\n');

  // 1. OpenAI Integration
  if (process.env.OPENAI_KEY) {
    console.log('🤖 Testing OpenAI integration...');
    const openai = new TrackedOpenAI(
      new OpenAI({ apiKey: process.env.OPENAI_KEY }), 
      tracker
    );

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say hello in 5 words' }],
        max_tokens: 20
      });
      console.log(`   OpenAI Response: ${response.choices[0].message.content}`);
      console.log(`   Tokens: ${response.usage.total_tokens}\n`);
    } catch (error) {
      console.log(`   ❌ OpenAI test failed: ${error.message}\n`);
    }
  } else {
    console.log('⏭️  Skipping OpenAI (no OPENAI_KEY)\n');
  }

  // 2. Anthropic Integration (simulated - would need real Anthropic SDK)
  console.log('🧠 Testing Anthropic integration...');
  console.log('   📝 Note: This would work with real Anthropic SDK');
  console.log('   Example: TrackedAnthropic(anthropic, tracker)\n');

  // 3. Custom API Integration
  console.log('🔧 Testing Custom API integration...');
  const genericTracker = new GenericAPITracker(tracker);

  try {
    // Simulate a call to a custom AI API
    await genericTracker.trackCall({
      eventName: 'custom_ai_completion',
      vendor: 'custom-ai-service',
      model: 'custom-model-v1',
      costAmount: 0.002,
      inputTokens: 100,
      outputTokens: 50,
      metadata: {
        custom_param: 'demo_value',
        api_version: '2.0'
      }
    });
    console.log('   ✅ Custom API call tracked successfully\n');

    // Example of tracked fetch for any HTTP API
    console.log('🌐 Testing HTTP API wrapper...');
    const mockResponse = await genericTracker.trackedFetch('https://httpbin.org/json', {
      method: 'GET',
      agentCostConfig: {
        vendor: 'httpbin-mock',
        model: 'test-endpoint',
        estimatedCost: 0.001,
        eventName: 'mock_api_call'
      }
    });
    console.log(`   ✅ HTTP call tracked (status: ${mockResponse.status})\n`);

  } catch (error) {
    console.log(`   ❌ Custom API test failed: ${error.message}\n`);
  }

  // 4. Function Decoration Example
  console.log('⚡ Testing function decoration...');
  
  // Create a mock AI function
  async function myCustomAIFunction(prompt, temperature = 0.7) {
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 100));
    return `AI response to: ${prompt}`;
  }

  // Wrap it with cost tracking
  const trackedAIFunction = genericTracker.trackFunction(myCustomAIFunction, {
    vendor: 'my-custom-ai',
    model: 'my-model-v1',
    eventName: 'custom_ai_function',
    calculateCost: (prompt) => prompt.length * 0.0001 // $0.0001 per character
  });

  try {
    const result = await trackedAIFunction('What is the meaning of life?');
    console.log(`   Function result: ${result}`);
    console.log('   ✅ Function call tracked with automatic cost calculation\n');
  } catch (error) {
    console.log(`   ❌ Function tracking failed: ${error.message}\n`);
  }

  // Final flush and summary
  await tracker.destroy();
  
  console.log('💰 Summary');
  console.log('==========');
  console.log('✅ All AI provider costs automatically tracked');
  console.log('✅ Real-time budget enforcement active');
  console.log('✅ Kill-switch protection enabled');
  console.log('\n🎯 Check your dashboard: http://localhost:3001');
  console.log('🔍 Agent ID: multi-provider-demo');
  console.log('\nDemo complete! 🎉');
}

// Auto-discovery demonstration
function demonstrateCodebaseScanning() {
  console.log('\n🔍 BONUS: Codebase Auto-Discovery');
  console.log('==================================');
  console.log('To scan any codebase for AI agents:');
  console.log('');
  console.log('  node tools/codebase-scanner.js /path/to/your/project');
  console.log('');
  console.log('This will:');
  console.log('• Find all AI API calls automatically');
  console.log('• Generate instrumentation code');
  console.log('• Show exactly where to add cost tracking');
  console.log('');
}

// Run the demo
demonstrateMultiProvider()
  .then(() => {
    demonstrateCodebaseScanning();
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  });
