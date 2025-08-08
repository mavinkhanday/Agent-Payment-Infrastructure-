import { OpenAIModels, CostData, SupportedVendors } from '../types';

// OpenAI pricing per 1K tokens (as of December 2023)
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  [OpenAIModels.GPT_4]: { input: 0.03, output: 0.06 },
  [OpenAIModels.GPT_4_TURBO]: { input: 0.01, output: 0.03 },
  [OpenAIModels.GPT_4_TURBO_PREVIEW]: { input: 0.01, output: 0.03 },
  [OpenAIModels.GPT_4_0125_PREVIEW]: { input: 0.01, output: 0.03 },
  [OpenAIModels.GPT_4_1106_PREVIEW]: { input: 0.01, output: 0.03 },
  [OpenAIModels.GPT_3_5_TURBO]: { input: 0.0015, output: 0.002 },
  [OpenAIModels.GPT_3_5_TURBO_16K]: { input: 0.003, output: 0.004 },
  [OpenAIModels.GPT_3_5_TURBO_INSTRUCT]: { input: 0.0015, output: 0.002 },
  [OpenAIModels.TEXT_EMBEDDING_ADA_002]: { input: 0.0001, output: 0 },
  [OpenAIModels.TEXT_EMBEDDING_3_SMALL]: { input: 0.00002, output: 0 },
  [OpenAIModels.TEXT_EMBEDDING_3_LARGE]: { input: 0.00013, output: 0 },
  [OpenAIModels.WHISPER_1]: { input: 0.006, output: 0 }, // per minute
  [OpenAIModels.TTS_1]: { input: 0.015, output: 0 }, // per 1K characters
  [OpenAIModels.TTS_1_HD]: { input: 0.030, output: 0 }, // per 1K characters
  [OpenAIModels.DALL_E_2]: { input: 0.020, output: 0 }, // per image (1024x1024)
  [OpenAIModels.DALL_E_3]: { input: 0.040, output: 0 }, // per image (1024x1024)
};

export function calculateOpenAICost(
  model: string, 
  inputTokens: number, 
  outputTokens: number = 0
): CostData {
  const pricing = OPENAI_PRICING[model];
  
  if (!pricing) {
    console.warn(`Unknown OpenAI model: ${model}, using default pricing`);
    return {
      vendor: SupportedVendors.OPENAI,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_amount: 0
    };
  }

  // Calculate cost per 1K tokens
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    vendor: SupportedVendors.OPENAI,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_amount: Math.round(totalCost * 1000000) / 1000000 // Round to 6 decimal places
  };
}

export function calculateAnthropicCost(
  model: string,
  inputTokens: number,
  outputTokens: number = 0
): CostData {
  // Anthropic pricing (approximate, should be updated with actual pricing)
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
    'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    'claude-2.1': { input: 0.008, output: 0.024 },
    'claude-2.0': { input: 0.008, output: 0.024 },
    'claude-instant-1.2': { input: 0.0008, output: 0.0024 }
  };

  const modelPricing = pricing[model];
  if (!modelPricing) {
    console.warn(`Unknown Anthropic model: ${model}, using default pricing`);
    return {
      vendor: SupportedVendors.ANTHROPIC,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_amount: 0
    };
  }

  const inputCost = (inputTokens / 1000) * modelPricing.input;
  const outputCost = (outputTokens / 1000) * modelPricing.output;
  const totalCost = inputCost + outputCost;

  return {
    vendor: SupportedVendors.ANTHROPIC,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_amount: Math.round(totalCost * 1000000) / 1000000
  };
}