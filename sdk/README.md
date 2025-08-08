# AI Cost Tracker SDK

Track your AI service costs automatically with our lightweight SDK. Get real-time visibility into OpenAI, Anthropic, and other AI provider costs.

## Installation

```bash
npm install ai-cost-tracker-sdk
```

## Quick Start

### 1. Basic Setup

```typescript
import { CostTracker, TrackedOpenAI } from 'ai-cost-tracker-sdk';
import OpenAI from 'openai';

// Initialize the cost tracker
const tracker = new CostTracker({
  apiKey: 'your-api-key', // Get from your dashboard
  apiUrl: 'https://your-api.com', // Your API endpoint
  agentId: 'my-chatbot',
  customerId: 'customer-123'
});

// Wrap your OpenAI client
const openai = new OpenAI({ apiKey: 'your-openai-key' });
const trackedOpenAI = new TrackedOpenAI(openai, tracker);

// Use it exactly like the regular OpenAI client
const completion = await trackedOpenAI.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Costs are automatically tracked!
```

### 2. Manual Cost Tracking

```typescript
// Track custom API calls or other services
await tracker.record({
  event_name: 'custom_ai_call',
  vendor: 'anthropic',
  model: 'claude-3-sonnet',
  cost_amount: 0.008,
  input_tokens: 100,
  output_tokens: 50,
  metadata: {
    conversation_id: 'conv-123',
    user_id: 'user-456'
  }
});
```

### 3. Batch Tracking

```typescript
// Record multiple events efficiently
await tracker.recordBatch([
  {
    event_name: 'batch_processing',
    vendor: 'openai',
    model: 'gpt-3.5-turbo',
    cost_amount: 0.002,
    input_tokens: 50,
    output_tokens: 25
  },
  {
    event_name: 'embedding_generation',
    vendor: 'openai', 
    model: 'text-embedding-ada-002',
    cost_amount: 0.0001,
    input_tokens: 1000
  }
]);
```

## Configuration Options

```typescript
const tracker = new CostTracker({
  apiKey: 'your-api-key',         // Required: Your API key
  apiUrl: 'https://api.com',      // Optional: API endpoint (default: localhost:3000)
  agentId: 'my-agent',            // Optional: Default agent ID
  customerId: 'customer-123',     // Optional: Default customer ID
  batchSize: 10,                  // Optional: Events per batch (default: 10)
  flushInterval: 30000,           // Optional: Auto-flush interval in ms (default: 30s)
  debug: true                     // Optional: Enable debug logging (default: false)
});
```

## Supported AI Providers

### OpenAI (Automatic Tracking)
- ✅ Chat Completions (GPT-4, GPT-3.5)
- ✅ Embeddings (text-embedding-ada-002, text-embedding-3-*)
- ✅ Image Generation (DALL-E 2, DALL-E 3)
- ✅ Audio Transcription (Whisper)
- ✅ Text-to-Speech

### Manual Tracking
- ✅ Anthropic (Claude models)
- ✅ Mistral AI
- ✅ Any custom AI service

## Advanced Usage

### Dynamic Customer/Agent Assignment

```typescript
// Change customer context mid-session
tracker.setCustomerId('new-customer-456');
tracker.setAgentId('different-agent');

// Next API calls will be tracked under new IDs
const response = await trackedOpenAI.chat.completions.create({...});
```

### Custom Metadata

```typescript
await tracker.record({
  event_name: 'support_chat',
  vendor: 'openai',
  model: 'gpt-4',
  cost_amount: 0.03,
  metadata: {
    session_id: 'sess-789',
    category: 'customer-support',
    priority: 'high',
    resolved: true
  }
});
```

### Cost Calculation Helpers

```typescript
import { calculateOpenAICost } from 'ai-cost-tracker-sdk';

// Calculate costs before making API calls
const costData = calculateOpenAICost('gpt-4', 1000, 500); // input, output tokens
console.log(`Estimated cost: $${costData.cost_amount}`);
```

## Error Handling

```typescript
try {
  const completion = await trackedOpenAI.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }]
  });
} catch (error) {
  // Failed API calls are still tracked with 0 cost
  console.error('API call failed:', error);
}
```

## Cleanup

```typescript
// Flush remaining events and cleanup
await tracker.destroy();
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import { 
  CostTracker,
  TrackedOpenAI, 
  UsageEvent, 
  SupportedVendors,
  OpenAIModels 
} from 'ai-cost-tracker-sdk';

const event: UsageEvent = {
  event_name: 'my-event',
  agent_id: 'agent-1',
  customer_id: 'customer-1', 
  vendor: SupportedVendors.OPENAI,
  model: OpenAIModels.GPT_4,
  cost_amount: 0.03,
  input_tokens: 1000,
  output_tokens: 500
};
```

## Examples

See the `/examples` directory for complete working examples:
- Basic chat application
- Batch processing
- Multi-customer support system
- Custom AI provider integration

## API Reference

### CostTracker

#### Methods
- `record(event: Partial<UsageEvent>): Promise<void>` - Record a single usage event
- `recordBatch(events: Partial<UsageEvent>[]): Promise<void>` - Record multiple events
- `flush(): Promise<void>` - Manually flush queued events
- `destroy(): Promise<void>` - Cleanup and flush all events
- `setAgentId(id: string): void` - Change default agent ID
- `setCustomerId(id: string): void` - Change default customer ID
- `getQueueLength(): number` - Get number of queued events

### TrackedOpenAI

Wraps the OpenAI client and automatically tracks all API calls. Provides the same interface as the regular OpenAI client.

## License

MIT