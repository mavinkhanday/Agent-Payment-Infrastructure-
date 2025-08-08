// Basic usage example for AI Cost Tracker SDK
const { CostTracker, TrackedOpenAI } = require('ai-cost-tracker-sdk');
const OpenAI = require('openai');

async function basicExample() {
  // Initialize the cost tracker
  const tracker = new CostTracker({
    apiKey: 'your-api-key-here', // Get this from your dashboard
    apiUrl: 'http://localhost:3000', // Your API endpoint
    agentId: 'example-chatbot',
    customerId: 'demo-customer-123',
    debug: true // Enable logging for demonstration
  });

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: 'your-openai-api-key-here'
  });

  // Wrap with cost tracking
  const trackedOpenAI = new TrackedOpenAI(openai, tracker);

  try {
    console.log('Making OpenAI API call...');
    
    // Use exactly like regular OpenAI client
    const completion = await trackedOpenAI.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Explain the benefits of cost tracking for AI applications in 2 sentences.'
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    });

    console.log('Response:', completion.choices[0].message.content);
    console.log('Usage:', completion.usage);
    
    // Cost is automatically tracked!
    
    // You can also track custom events
    await tracker.record({
      event_name: 'custom_analysis',
      vendor: 'custom',
      model: 'my-model-v1',
      cost_amount: 0.005,
      metadata: {
        analysis_type: 'sentiment',
        text_length: 250,
        confidence: 0.95
      }
    });

    console.log('Custom event tracked!');
    
    // Flush any remaining events
    await tracker.flush();
    console.log('All events sent to server');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Cleanup
    await tracker.destroy();
  }
}

// Run the example
if (require.main === module) {
  basicExample().catch(console.error);
}

module.exports = { basicExample };