export interface TrackerConfig {
  apiKey: string;
  apiUrl?: string;
  agentId?: string;
  customerId?: string;
  batchSize?: number;
  flushInterval?: number;
  debug?: boolean;
}

export interface UsageEvent {
  event_name: string;
  agent_id: string;
  customer_id: string;
  vendor: SupportedVendors;
  model?: string;
  cost_amount: number;
  cost_currency?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  metadata?: Record<string, any>;
  event_timestamp?: Date;
}

export interface CostData {
  vendor: SupportedVendors;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_amount: number;
}

export enum SupportedVendors {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  MISTRAL = 'mistral',
  CUSTOM = 'custom'
}

export enum OpenAIModels {
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo',
  GPT_4_TURBO_PREVIEW = 'gpt-4-turbo-preview',
  GPT_4_0125_PREVIEW = 'gpt-4-0125-preview',
  GPT_4_1106_PREVIEW = 'gpt-4-1106-preview',
  GPT_3_5_TURBO = 'gpt-3.5-turbo',
  GPT_3_5_TURBO_16K = 'gpt-3.5-turbo-16k',
  GPT_3_5_TURBO_INSTRUCT = 'gpt-3.5-turbo-instruct',
  TEXT_EMBEDDING_ADA_002 = 'text-embedding-ada-002',
  TEXT_EMBEDDING_3_SMALL = 'text-embedding-3-small',
  TEXT_EMBEDDING_3_LARGE = 'text-embedding-3-large',
  WHISPER_1 = 'whisper-1',
  TTS_1 = 'tts-1',
  TTS_1_HD = 'tts-1-hd',
  DALL_E_2 = 'dall-e-2',
  DALL_E_3 = 'dall-e-3'
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIResponse {
  usage?: OpenAIUsage;
  model?: string;
}

export interface ApiResponse {
  message: string;
  event_id?: string;
  events?: { event_id: string; recorded_at: string }[];
  recorded_at?: string;
}