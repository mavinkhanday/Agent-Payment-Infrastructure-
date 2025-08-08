import { CostTracker } from '../cost-tracker';
import { SupportedVendors } from '../types';

/**
 * Generic API Call Tracker
 * For tracking custom AI APIs or services not directly supported
 */
export class GenericAPITracker {
  private costTracker: CostTracker;

  constructor(costTracker: CostTracker) {
    this.costTracker = costTracker;
  }

  /**
   * Track a custom API call manually
   */
  async trackCall(params: {
    eventName: string;
    vendor: string;
    model?: string;
    costAmount: number;
    inputTokens?: number;
    outputTokens?: number;
    metadata?: Record<string, any>;
  }) {
    await this.costTracker.record({
      event_name: params.eventName,
      vendor: params.vendor as SupportedVendors,
      model: params.model,
      cost_amount: params.costAmount,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      total_tokens: (params.inputTokens || 0) + (params.outputTokens || 0),
      metadata: params.metadata
    });
  }

  /**
   * Wrapper for fetch() calls that automatically tracks costs
   */
  async trackedFetch(url: string, options: RequestInit & {
    // Custom tracking options
    agentCostConfig?: {
      vendor: string;
      model?: string;
      estimatedCost?: number;
      eventName?: string;
    }
  } = {}) {
    const startTime = Date.now();
    const { agentCostConfig, ...fetchOptions } = options;

    try {
      const response = await fetch(url, fetchOptions);
      const duration = Date.now() - startTime;

      // If cost config provided, track the call
      if (agentCostConfig) {
        await this.trackCall({
          eventName: agentCostConfig.eventName || 'custom_api_call',
          vendor: agentCostConfig.vendor,
          model: agentCostConfig.model || 'unknown',
          costAmount: agentCostConfig.estimatedCost || 0,
          metadata: {
            url,
            method: fetchOptions.method || 'GET',
            status: response.status,
            duration_ms: duration,
            success: response.ok
          }
        });
      }

      return response;
    } catch (error) {
      // Track failed calls
      if (agentCostConfig) {
        await this.trackCall({
          eventName: `${agentCostConfig.eventName || 'custom_api_call'}_error`,
          vendor: agentCostConfig.vendor,
          model: agentCostConfig.model || 'unknown',
          costAmount: 0,
          metadata: {
            url,
            method: fetchOptions.method || 'GET',
            duration_ms: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error',
            success: false
          }
        });
      }
      throw error;
    }
  }

  /**
   * Decorator function for automatic cost tracking
   */
  trackFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    config: {
      vendor: string;
      model?: string;
      eventName?: string;
      calculateCost?: (...args: Parameters<T>) => number;
    }
  ): T {
    return (async (...args: Parameters<T>) => {
      const startTime = Date.now();
      
      try {
        const result = await fn(...args);
        const duration = Date.now() - startTime;
        
        const cost = config.calculateCost ? config.calculateCost(...args) : 0;
        
        await this.trackCall({
          eventName: config.eventName || 'custom_function_call',
          vendor: config.vendor,
          model: config.model || 'unknown',
          costAmount: cost,
          metadata: {
            function_name: fn.name,
            duration_ms: duration,
            args_count: args.length,
            success: true
          }
        });

        return result;
      } catch (error) {
        await this.trackCall({
          eventName: `${config.eventName || 'custom_function_call'}_error`,
          vendor: config.vendor,
          model: config.model || 'unknown',
          costAmount: 0,
          metadata: {
            function_name: fn.name,
            duration_ms: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error',
            success: false
          }
        });
        throw error;
      }
    }) as T;
  }
}

/**
 * Python-style decorator for Node.js
 * Usage: @track({ vendor: 'custom-ai', eventName: 'my_ai_call' })
 */
export function track(config: {
  vendor: string;
  model?: string;
  eventName?: string;
  calculateCost?: (...args: any[]) => number;
}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      // Get tracker from instance (assumes it exists)
      const tracker = (this as any).costTracker || (this as any).tracker;
      if (!tracker) {
        console.warn('No cost tracker found on instance, skipping tracking');
        return originalMethod.apply(this, args);
      }

      const genericTracker = new GenericAPITracker(tracker);
      const trackedMethod = genericTracker.trackFunction(originalMethod.bind(this), config);
      
      return trackedMethod(...args);
    };

    return descriptor;
  };
}
