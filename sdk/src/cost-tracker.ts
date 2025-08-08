import axios, { AxiosInstance } from 'axios';
import { TrackerConfig, UsageEvent, ApiResponse } from './types';

export class CostTracker {
  private client: AxiosInstance;
  private config: Required<TrackerConfig>;
  private eventQueue: UsageEvent[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: TrackerConfig) {
    this.config = {
      apiUrl: 'http://localhost:3000',
      agentId: 'default-agent',
      customerId: 'default-customer',
      batchSize: 10,
      flushInterval: 30000, // 30 seconds
      debug: false,
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    this.startFlushTimer();
  }

  async record(event: Partial<UsageEvent>): Promise<void> {
    // 🚨 KILL SWITCH CHECK - Check agent status before recording
    const isActive = await this.checkAgentStatus();
    if (!isActive) {
      throw new Error(`Agent ${this.config.agentId} is currently inactive (killed, paused, or under emergency stop)`);
    }

    const fullEvent: UsageEvent = {
      event_name: 'api_call',
      agent_id: this.config.agentId,
      customer_id: this.config.customerId,
      ...event,
      event_timestamp: event.event_timestamp || new Date()
    } as UsageEvent;

    if (this.config.debug) {
      console.log('CostTracker: Recording event', fullEvent);
    }

    this.eventQueue.push(fullEvent);

    if (this.eventQueue.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async recordBatch(events: Partial<UsageEvent>[]): Promise<void> {
    const fullEvents: UsageEvent[] = events.map(event => ({
      event_name: 'api_call',
      agent_id: this.config.agentId,
      customer_id: this.config.customerId,
      ...event,
      event_timestamp: event.event_timestamp || new Date()
    } as UsageEvent));

    this.eventQueue.push(...fullEvents);

    if (this.eventQueue.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      if (this.config.debug) {
        console.log(`CostTracker: Flushing ${eventsToSend.length} events`);
      }

      if (eventsToSend.length === 1) {
        await this.client.post<ApiResponse>('/api/usage/record', eventsToSend[0]);
      } else {
        await this.client.post<ApiResponse>('/api/usage/record-bulk', {
          events: eventsToSend
        });
      }

      if (this.config.debug) {
        console.log('CostTracker: Events sent successfully');
      }
    } catch (error) {
      console.error('CostTracker: Failed to send events', error);
      
      // Put events back in queue for retry
      this.eventQueue.unshift(...eventsToSend);
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('CostTracker: Auto-flush failed', error);
      });
    }, this.config.flushInterval);
  }

  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    await this.flush();
  }

  setAgentId(agentId: string): void {
    this.config.agentId = agentId;
  }

  setCustomerId(customerId: string): void {
    this.config.customerId = customerId;
  }

  getQueueLength(): number {
    return this.eventQueue.length;
  }

  async checkAgentStatus(): Promise<boolean> {
    try {
      const response = await this.client.get(`/api/killswitch/check-agent/${this.config.agentId}`);
      return response.data.is_active;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Agent doesn't exist yet, consider it active
        return true;
      }
      if (error.response?.status === 403) {
        // Agent is killed/paused
        return false;
      }
      
      // For other errors, log but don't block (fail open)
      if (this.config.debug) {
        console.warn('CostTracker: Failed to check agent status, assuming active', error.message);
      }
      return true;
    }
  }

  async emergencyStop(): Promise<void> {
    try {
      await this.client.post('/api/killswitch/emergency-stop-all', {
        reason: 'Emergency stop initiated from SDK',
        confirm: true
      });
      console.log('🚨 EMERGENCY STOP ACTIVATED - All agents terminated');
    } catch (error: any) {
      console.error('Failed to activate emergency stop:', error.message);
      throw error;
    }
  }

  async killAgent(reason: string): Promise<void> {
    try {
      await this.client.post(`/api/killswitch/kill-agent/${this.config.agentId}`, {
        reason,
        metadata: { killed_from_sdk: true }
      });
      console.log(`🔴 Agent ${this.config.agentId} killed: ${reason}`);
    } catch (error: any) {
      console.error('Failed to kill agent:', error.message);
      throw error;
    }
  }

  async pauseAgent(durationMinutes: number, reason: string): Promise<void> {
    try {
      await this.client.post(`/api/killswitch/pause-agent/${this.config.agentId}`, {
        duration_minutes: durationMinutes,
        reason,
        metadata: { paused_from_sdk: true }
      });
      console.log(`⏸️ Agent ${this.config.agentId} paused for ${durationMinutes} minutes: ${reason}`);
    } catch (error: any) {
      console.error('Failed to pause agent:', error.message);
      throw error;
    }
  }
}