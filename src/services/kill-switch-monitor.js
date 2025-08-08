const db = require('../config/database');

class KillSwitchMonitor {
  constructor() {
    this.monitoringInterval = null;
    this.isRunning = false;
    this.checkIntervalMs = 30000; // Check every 30 seconds
  }

  start() {
    if (this.isRunning) {
      console.log('Kill switch monitor is already running');
      return;
    }

    console.log('🛡️ Starting Kill Switch Monitor...');
    this.isRunning = true;
    
    // Initial check
    this.performMonitoringChecks();
    
    // Set up interval checks
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringChecks();
    }, this.checkIntervalMs);

    console.log(`✅ Kill Switch Monitor started (checking every ${this.checkIntervalMs/1000}s)`);
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Kill Switch Monitor stopped');
  }

  async performMonitoringChecks() {
    try {
      await Promise.all([
        this.checkSpendRates(),
        this.checkInfiniteLoops(),
        this.checkErrorRates(),
        this.updateSpendRateMonitoring()
      ]);
    } catch (error) {
      console.error('Kill switch monitoring error:', error);
    }
  }

  async checkSpendRates() {
    try {
      // Get all active spend rate triggers
      const triggers = await db.query(`
        SELECT t.*, u.email 
        FROM kill_switch_triggers t
        JOIN users u ON t.user_id = u.id
        WHERE t.is_active = true 
        AND t.trigger_type IN ('spend_rate', 'total_daily_spend')
      `);

      for (const trigger of triggers.rows) {
        await this.checkSpendRateTrigger(trigger);
      }
    } catch (error) {
      console.error('Error checking spend rates:', error);
    }
  }

  async checkSpendRateTrigger(trigger) {
    try {
      let timeWindow, query;
      
      if (trigger.trigger_type === 'spend_rate') {
        // Calculate time window based on threshold_unit
        switch (trigger.threshold_unit) {
          case 'per_minute':
            timeWindow = "NOW() - INTERVAL '1 minute'";
            break;
          case 'per_hour':
            timeWindow = "NOW() - INTERVAL '1 hour'";
            break;
          default:
            timeWindow = "NOW() - INTERVAL '1 minute'";
        }

        query = `
          SELECT 
            a.id as agent_uuid,
            a.agent_id,
            a.agent_name,
            c.customer_id,
            SUM(ue.cost_amount) as total_cost,
            COUNT(*) as event_count
          FROM usage_events ue
          JOIN agents a ON ue.agent_id = a.id
          JOIN customers c ON ue.customer_id = c.id
          WHERE ue.user_id = $1 
          AND ue.created_at >= ${timeWindow}
          AND a.status = 'active'
          GROUP BY a.id, a.agent_id, a.agent_name, c.customer_id
          HAVING SUM(ue.cost_amount) > $2
        `;
      } else if (trigger.trigger_type === 'total_daily_spend') {
        query = `
          SELECT 
            a.id as agent_uuid,
            a.agent_id,
            a.agent_name,
            c.customer_id,
            SUM(ue.cost_amount) as total_cost,
            COUNT(*) as event_count
          FROM usage_events ue
          JOIN agents a ON ue.agent_id = a.id
          JOIN customers c ON ue.customer_id = c.id
          WHERE ue.user_id = $1 
          AND ue.created_at >= CURRENT_DATE
          AND a.status = 'active'
          GROUP BY a.id, a.agent_id, a.agent_name, c.customer_id
          HAVING SUM(ue.cost_amount) > $2
        `;
      }

      const violations = await db.query(query, [trigger.user_id, trigger.threshold_value]);

      for (const violation of violations.rows) {
        await this.triggerAutoKill(trigger, violation);
      }
    } catch (error) {
      console.error(`Error checking spend rate trigger ${trigger.id}:`, error);
    }
  }

  async checkInfiniteLoops() {
    try {
      // Find agents with excessive identical requests
      const loopDetectionQuery = `
        WITH request_patterns AS (
          SELECT 
            ue.agent_id,
            a.agent_id as agent_external_id,
            ue.event_name,
            ue.model,
            ue.metadata->>'request_hash' as request_signature,
            COUNT(*) as identical_requests,
            MAX(ue.created_at) as latest_request
          FROM usage_events ue
          JOIN agents a ON ue.agent_id = a.id
          WHERE ue.created_at >= NOW() - INTERVAL '10 minutes'
          AND a.status = 'active'
          AND ue.metadata->>'request_hash' IS NOT NULL
          GROUP BY ue.agent_id, a.agent_id, ue.event_name, ue.model, ue.metadata->>'request_hash'
          HAVING COUNT(*) >= 50 -- 50+ identical requests in 10 minutes
        )
        SELECT 
          rp.*,
          a.user_id,
          u.email
        FROM request_patterns rp
        JOIN agents a ON rp.agent_id = a.id
        JOIN users u ON a.user_id = u.id
      `;

      const loops = await db.query(loopDetectionQuery);

      for (const loop of loops.rows) {
        await this.triggerAutoKill({
          user_id: loop.user_id,
          trigger_type: 'infinite_loop',
          trigger_name: 'Auto Loop Detection',
          threshold_value: loop.identical_requests
        }, {
          agent_id: loop.agent_external_id,
          agent_uuid: loop.agent_id,
          total_cost: 0,
          event_count: loop.identical_requests,
          loop_signature: loop.request_signature
        });
      }
    } catch (error) {
      console.error('Error checking infinite loops:', error);
    }
  }

  async checkErrorRates() {
    try {
      const errorRateQuery = `
        WITH agent_stats AS (
          SELECT 
            a.id as agent_uuid,
            a.agent_id,
            a.user_id,
            COUNT(*) as total_requests,
            SUM(CASE WHEN ue.metadata->>'error' IS NOT NULL THEN 1 ELSE 0 END) as error_count,
            CASE 
              WHEN COUNT(*) > 0 THEN 
                (SUM(CASE WHEN ue.metadata->>'error' IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
              ELSE 0 
            END as error_rate
          FROM usage_events ue
          JOIN agents a ON ue.agent_id = a.id
          WHERE ue.created_at >= NOW() - INTERVAL '15 minutes'
          AND a.status = 'active'
          GROUP BY a.id, a.agent_id, a.user_id
          HAVING COUNT(*) >= 10 -- At least 10 requests to calculate error rate
        ),
        high_error_agents AS (
          SELECT ast.*, t.threshold_value, t.id as trigger_id
          FROM agent_stats ast
          JOIN kill_switch_triggers t ON t.user_id = ast.user_id
          WHERE t.trigger_type = 'error_rate' 
          AND t.is_active = true
          AND ast.error_rate > t.threshold_value
        )
        SELECT hea.*, u.email
        FROM high_error_agents hea
        JOIN users u ON hea.user_id = u.id
      `;

      const highErrorAgents = await db.query(errorRateQuery);

      for (const agent of highErrorAgents.rows) {
        await this.triggerAutoKill({
          user_id: agent.user_id,
          trigger_type: 'error_rate',
          trigger_name: 'Auto Error Rate Detection',
          threshold_value: agent.threshold_value
        }, {
          agent_id: agent.agent_id,
          agent_uuid: agent.agent_uuid,
          total_cost: 0,
          event_count: agent.total_requests,
          error_rate: agent.error_rate,
          error_count: agent.error_count
        });
      }
    } catch (error) {
      console.error('Error checking error rates:', error);
    }
  }

  async updateSpendRateMonitoring() {
    try {
      // Update spend rate monitoring data for all active agents
      const windowStart = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const windowEnd = new Date();

      const query = `
        WITH agent_window_stats AS (
          SELECT 
            ue.user_id,
            ue.customer_id,
            ue.agent_id,
            SUM(ue.cost_amount) as total_cost,
            COUNT(*) as total_requests,
            SUM(ue.total_tokens) as total_tokens,
            SUM(CASE WHEN ue.metadata->>'error' IS NOT NULL THEN 1 ELSE 0 END) as error_count
          FROM usage_events ue
          JOIN agents a ON ue.agent_id = a.id
          WHERE ue.created_at >= $1 
          AND ue.created_at <= $2
          AND a.status = 'active'
          GROUP BY ue.user_id, ue.customer_id, ue.agent_id
        )
        INSERT INTO spend_rate_monitoring (
          user_id, customer_id, agent_id, window_start, window_end, window_duration_minutes,
          total_cost, total_requests, total_tokens, error_count,
          cost_per_minute, requests_per_minute, error_rate
        )
        SELECT 
          user_id, customer_id, agent_id, $1, $2, 5,
          total_cost, total_requests, total_tokens, error_count,
          total_cost / 5.0 as cost_per_minute,
          total_requests / 5.0 as requests_per_minute,
          CASE WHEN total_requests > 0 THEN (error_count * 100.0 / total_requests) ELSE 0 END as error_rate
        FROM agent_window_stats
        WHERE total_requests > 0
      `;

      await db.query(query, [windowStart, windowEnd]);
    } catch (error) {
      console.error('Error updating spend rate monitoring:', error);
    }
  }

  async triggerAutoKill(trigger, violation) {
    try {
      const reason = `Auto-kill triggered: ${trigger.trigger_name} (${trigger.trigger_type}) exceeded threshold of ${trigger.threshold_value}`;
      
      console.log(`🚨 AUTO KILL TRIGGERED: Agent ${violation.agent_id} - ${reason}`);

      // Kill the agent
      await db.query(`
        UPDATE agents 
        SET status = 'killed', killed_at = NOW(), kill_reason = $1
        WHERE id = $2 AND status = 'active'
      `, [reason, violation.agent_uuid]);

      // Log the kill switch event
      await db.query(`
        INSERT INTO kill_switch_events 
        (event_type, target_type, target_id, user_id, triggered_by, reason, metadata)
        VALUES ('kill_agent', 'agent', $1, $2, $3, $4, $5)
      `, [
        violation.agent_id,
        trigger.user_id,
        `auto_${trigger.trigger_type}`,
        reason,
        {
          trigger_id: trigger.id,
          violation_data: violation,
          auto_killed: true
        }
      ]);

      // Here you could add alerting (email, Slack, etc.)
      console.log(`📧 Alert sent for auto-killed agent: ${violation.agent_id}`);

    } catch (error) {
      console.error('Error triggering auto kill:', error);
    }
  }

  // Method to be called when the server starts
  static initialize() {
    const monitor = new KillSwitchMonitor();
    monitor.start();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down kill switch monitor...');
      monitor.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('Shutting down kill switch monitor...');
      monitor.stop();
    });

    return monitor;
  }
}

module.exports = KillSwitchMonitor;