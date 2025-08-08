// Test script for the AI Cost Tracker SDK
const { CostTracker } = require('./sdk/dist/cost-tracker.js');
const axios = require('axios');

async function testSDK() {
  try {
    console.log('🧪 Testing AI Cost Tracker SDK...\n');
    
    // Initialize cost tracker
    const tracker = new CostTracker({
      apiKey: process.env.API_KEY || 'your-api-key-here',
      baseUrl: 'http://localhost:3000/api',
      agentId: 'sdk-test-agent',
      customerId: 'sdk-test-customer'
    });

    console.log('✅ CostTracker initialized');

    // Test 1: Record a manual usage event
    console.log('\n📝 Test 1: Recording manual usage event...');
    const recordResult = await tracker.record({
      event_name: 'test_event',
      vendor: 'openai',
      model: 'gpt-4',
      cost_amount: 0.01,
      input_tokens: 200,
      output_tokens: 100,
      metadata: { test: true }
    });

    console.log('✅ Manual event recorded:', recordResult);

    // Test 2: Record bulk events
    console.log('\n📝 Test 2: Recording bulk events...');
    const bulkEvents = [
      {
        event_name: 'bulk_test_1',
        vendor: 'openai',
        model: 'gpt-3.5-turbo',
        cost_amount: 0.005,
        input_tokens: 100,
        output_tokens: 50
      },
      {
        event_name: 'bulk_test_2', 
        vendor: 'anthropic',
        model: 'claude-3-haiku',
        cost_amount: 0.003,
        input_tokens: 150,
        output_tokens: 75
      }
    ];

    const bulkResult = await tracker.recordBulk(bulkEvents);
    console.log('✅ Bulk events recorded:', bulkResult);

    // Test 3: Verify events were recorded by checking API
    console.log('\n📋 Test 3: Verifying events in API...');
    const response = await axios.get('http://localhost:3000/api/usage/events', {
      headers: {
        'Authorization': `Bearer ${process.env.API_KEY || 'your-api-key-here'}`
      }
    });
    
    console.log(`✅ Total events found: ${response.data.events.length}`);
    console.log('Recent events:');
    response.data.events.slice(0, 3).forEach((event, idx) => {
      console.log(`  ${idx + 1}. ${event.event_name} - ${event.vendor}/${event.model} - $${event.cost_amount}`);
    });

    console.log('\n🎉 SDK Test completed successfully!');
    
  } catch (error) {
    console.error('❌ SDK Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testSDK();