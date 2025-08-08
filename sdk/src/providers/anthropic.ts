import { CostTracker } from '../cost-tracker';
import { SupportedVendors } from '../types';
import { calculateAnthropicCost } from '../utils/cost-calculator';

export class TrackedAnthropic {
  private costTracker: CostTracker;
  private anthropic: any; // Anthropic SDK instance

  constructor(anthropic: any, costTracker: CostTracker) {
    this.anthropic = anthropic;
    this.costTracker = costTracker;
    
    this.wrapMethods();
  }

  private wrapMethods(): void {
    // Wrap messages.create for Claude
    if (this.anthropic.messages?.create) {
      const originalCreate = this.anthropic.messages.create.bind(this.anthropic.messages);
      
      this.anthropic.messages.create = async (params: any) => {
        const startTime = Date.now();
        
        try {
          const response = await originalCreate(params);
          
          // Anthropic returns usage in response.usage
          if (response.usage) {
            const costData = calculateAnthropicCost(
              response.model || params.model,
              response.usage.input_tokens || 0,
              response.usage.output_tokens || 0
            );

            await this.costTracker.record({
              event_name: 'anthropic_message_create',
              vendor: SupportedVendors.ANTHROPIC,
              model: response.model || params.model,
              cost_amount: costData.cost_amount,
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
              total_tokens: response.usage.input_tokens + response.usage.output_tokens,
              metadata: {
                duration_ms: Date.now() - startTime,
                max_tokens: params.max_tokens,
                temperature: params.temperature,
                stop_reason: response.stop_reason
              }
            });
          }

          return response;
        } catch (error) {
          // Track failed attempts
          await this.costTracker.record({
            event_name: 'anthropic_message_create_error',
            vendor: SupportedVendors.ANTHROPIC,
            model: params.model,
            cost_amount: 0,
            metadata: {
              duration_ms: Date.now() - startTime,
              error: error instanceof Error ? error.message : 'Unknown error',
              max_tokens: params.max_tokens
            }
          });
          
          throw error;
        }
      };
    }
  }

  // Expose the wrapped Anthropic instance methods
  get messages() {
    return this.anthropic.messages;
  }

  // Allow direct access to any other methods
  [key: string]: any;
}
