import { CostTracker } from '../cost-tracker';
import { SupportedVendors, OpenAIResponse } from '../types';
import { calculateOpenAICost } from '../utils/cost-calculator';

export class TrackedOpenAI {
  private costTracker: CostTracker;
  private openai: any; // OpenAI instance

  constructor(openai: any, costTracker: CostTracker) {
    this.openai = openai;
    this.costTracker = costTracker;
    
    this.wrapMethods();
  }

  private wrapMethods(): void {
    // Wrap chat completions
    if (this.openai.chat?.completions?.create) {
      const originalCreate = this.openai.chat.completions.create.bind(this.openai.chat.completions);
      
      this.openai.chat.completions.create = async (params: any) => {
        const startTime = Date.now();
        
        try {
          const response = await originalCreate(params);
          
          if (response.usage) {
            const costData = calculateOpenAICost(
              response.model || params.model,
              response.usage.prompt_tokens || 0,
              response.usage.completion_tokens || 0
            );

            await this.costTracker.record({
              event_name: 'openai_chat_completion',
              vendor: SupportedVendors.OPENAI,
              model: response.model || params.model,
              cost_amount: costData.cost_amount,
              input_tokens: response.usage.prompt_tokens,
              output_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
              metadata: {
                duration_ms: Date.now() - startTime,
                temperature: params.temperature,
                max_tokens: params.max_tokens,
                stream: params.stream || false
              }
            });
          }

          return response;
        } catch (error) {
          // Still track the attempt even if it failed
          await this.costTracker.record({
            event_name: 'openai_chat_completion_error',
            vendor: SupportedVendors.OPENAI,
            model: params.model,
            cost_amount: 0,
            metadata: {
              duration_ms: Date.now() - startTime,
              error: error instanceof Error ? error.message : 'Unknown error',
              temperature: params.temperature,
              max_tokens: params.max_tokens
            }
          });
          
          throw error;
        }
      };
    }

    // Wrap embeddings
    if (this.openai.embeddings?.create) {
      const originalEmbeddingsCreate = this.openai.embeddings.create.bind(this.openai.embeddings);
      
      this.openai.embeddings.create = async (params: any) => {
        const startTime = Date.now();
        
        try {
          const response = await originalEmbeddingsCreate(params);
          
          if (response.usage) {
            const costData = calculateOpenAICost(
              response.model || params.model,
              response.usage.prompt_tokens || 0,
              0
            );

            await this.costTracker.record({
              event_name: 'openai_embeddings',
              vendor: SupportedVendors.OPENAI,
              model: response.model || params.model,
              cost_amount: costData.cost_amount,
              input_tokens: response.usage.prompt_tokens,
              total_tokens: response.usage.total_tokens,
              metadata: {
                duration_ms: Date.now() - startTime,
                input_type: Array.isArray(params.input) ? 'array' : 'string',
                input_count: Array.isArray(params.input) ? params.input.length : 1
              }
            });
          }

          return response;
        } catch (error) {
          await this.costTracker.record({
            event_name: 'openai_embeddings_error',
            vendor: SupportedVendors.OPENAI,
            model: params.model,
            cost_amount: 0,
            metadata: {
              duration_ms: Date.now() - startTime,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });
          
          throw error;
        }
      };
    }

    // Wrap image generation
    if (this.openai.images?.generate) {
      const originalImagesGenerate = this.openai.images.generate.bind(this.openai.images);
      
      this.openai.images.generate = async (params: any) => {
        const startTime = Date.now();
        
        try {
          const response = await originalImagesGenerate(params);
          
          // DALL-E pricing is per image
          const model = params.model || 'dall-e-2';
          const numImages = params.n || 1;
          
          const costData = calculateOpenAICost(model, numImages, 0);

          await this.costTracker.record({
            event_name: 'openai_image_generation',
            vendor: SupportedVendors.OPENAI,
            model: model,
            cost_amount: costData.cost_amount,
            metadata: {
              duration_ms: Date.now() - startTime,
              prompt: params.prompt,
              size: params.size || '1024x1024',
              quality: params.quality || 'standard',
              n: numImages
            }
          });

          return response;
        } catch (error) {
          await this.costTracker.record({
            event_name: 'openai_image_generation_error',
            vendor: SupportedVendors.OPENAI,
            model: params.model || 'dall-e-2',
            cost_amount: 0,
            metadata: {
              duration_ms: Date.now() - startTime,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });
          
          throw error;
        }
      };
    }

    // Wrap audio transcription (Whisper)
    if (this.openai.audio?.transcriptions?.create) {
      const originalTranscriptionsCreate = this.openai.audio.transcriptions.create.bind(this.openai.audio.transcriptions);
      
      this.openai.audio.transcriptions.create = async (params: any) => {
        const startTime = Date.now();
        
        try {
          const response = await originalTranscriptionsCreate(params);
          
          // Whisper pricing is per minute (estimate duration from file if available)
          const estimatedMinutes = 1; // Default estimate, could be improved
          const costData = calculateOpenAICost(
            params.model || 'whisper-1',
            estimatedMinutes,
            0
          );

          await this.costTracker.record({
            event_name: 'openai_audio_transcription',
            vendor: SupportedVendors.OPENAI,
            model: params.model || 'whisper-1',
            cost_amount: costData.cost_amount,
            metadata: {
              duration_ms: Date.now() - startTime,
              language: params.language,
              response_format: params.response_format || 'json',
              estimated_minutes: estimatedMinutes
            }
          });

          return response;
        } catch (error) {
          await this.costTracker.record({
            event_name: 'openai_audio_transcription_error',
            vendor: SupportedVendors.OPENAI,
            model: params.model || 'whisper-1',
            cost_amount: 0,
            metadata: {
              duration_ms: Date.now() - startTime,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });
          
          throw error;
        }
      };
    }
  }

  // Expose the wrapped OpenAI instance
  get chat() {
    return this.openai.chat;
  }

  get embeddings() {
    return this.openai.embeddings;
  }

  get images() {
    return this.openai.images;
  }

  get audio() {
    return this.openai.audio;
  }

  get completions() {
    return this.openai.completions;
  }

  // Allow direct access to any other methods
  [key: string]: any;
}