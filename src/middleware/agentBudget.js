const db = require('../config/database');
const { getAgentSpend, incrementAgentSpend } = require('../config/redis');

/**
 * Middleware to enforce agent budget limits and kill-switch functionality
 * 
 * This middleware:
 * 1. Checks if agent is suspended (kill-switch)
 * 2. Validates monthly spending limits 
 * 3. Automatically suspends agents that exceed limits
 * 4. Attaches agent data to request for downstream use
 */
async function enforceAgentBudget(req, res, next) {
  try {
    const { agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({ 
        error: 'agent_id is required',
        code: 'MISSING_AGENT_ID'
      });
    }

    // 1. Get agent details including budget controls
    const agentQuery = await db.query(`
      SELECT 
        id,
        agent_id,
        agent_name,
        is_suspended,
        monthly_cost_limit,
        user_id
      FROM agents 
      WHERE agent_id = $1 AND user_id = $2
    `, [agent_id, req.user.id]);

    // If agent doesn't exist, let the downstream middleware create it
    // We'll re-check after creation in ensureAgentExists
    if (agentQuery.rows.length === 0) {
      req.agentBudgetCheck = 'DEFERRED'; // Flag for post-creation check
      return next();
    }

    const agent = agentQuery.rows[0];

    // 2. Kill-switch check - immediate rejection if suspended
    if (agent.is_suspended) {
      return res.status(403).json({ 
        error: 'Agent is suspended due to budget limits or manual override',
        code: 'AGENT_SUSPENDED',
        agent_id: agent.agent_id,
        agent_name: agent.agent_name
      });
    }

    // 3. Budget limit check (skip if no limit set)
    if (agent.monthly_cost_limit !== null) {
      const requestedCost = parseFloat(req.body.cost_amount || 0);
      
      // Fast Redis lookup for current spending
      let currentSpend = await getAgentSpend(agent.agent_id);
      
      // Fallback to database if Redis fails
      if (currentSpend === 0) {
        const spendQuery = await db.query(`
          SELECT COALESCE(SUM(cost_amount), 0) as current_spend
          FROM usage_events 
          WHERE agent_id = $1 
          AND DATE_TRUNC('month', event_timestamp) = DATE_TRUNC('month', CURRENT_DATE)
        `, [agent.id]);
        currentSpend = parseFloat(spendQuery.rows[0].current_spend || 0);
        
        // Update Redis with the database value for future fast lookups
        if (currentSpend > 0) {
          await incrementAgentSpend(agent.agent_id, currentSpend);
          // Reset to actual spend since we just backfilled
          currentSpend = await getAgentSpend(agent.agent_id);
        }
      }

      const projectedSpend = currentSpend + requestedCost;

      // Check if this request would exceed the monthly limit
      if (projectedSpend > agent.monthly_cost_limit) {
        // Automatically suspend the agent
        await db.query(`
          UPDATE agents 
          SET is_suspended = TRUE, 
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = $1
        `, [agent.id]);

        console.log(`🛑 Agent ${agent.agent_id} automatically suspended - exceeded monthly limit of $${agent.monthly_cost_limit} (current: $${currentSpend.toFixed(4)}, requested: $${requestedCost.toFixed(4)})`);

        return res.status(403).json({ 
          error: 'Agent suspended: monthly cost limit exceeded',
          code: 'BUDGET_LIMIT_EXCEEDED',
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
          monthly_limit: parseFloat(agent.monthly_cost_limit),
          current_spend: currentSpend,
          requested_cost: requestedCost,
          projected_spend: projectedSpend
        });
      }

      // Warn if getting close to limit (>80%)
      const utilizationPercent = (projectedSpend / agent.monthly_cost_limit) * 100;
      if (utilizationPercent > 80) {
        console.warn(`⚠️  Agent ${agent.agent_id} at ${utilizationPercent.toFixed(1)}% of monthly budget ($${projectedSpend.toFixed(4)}/$${agent.monthly_cost_limit})`);
      }
    }

    // 4. Attach agent data to request for downstream middleware
    req.agent = agent;
    
    next();
  } catch (error) {
    console.error('Budget enforcement error:', error);
    res.status(500).json({ 
      error: 'Budget check failed',
      code: 'BUDGET_CHECK_ERROR'
    });
  }
}

/**
 * Utility function to manually suspend an agent
 */
async function suspendAgent(agentId, userId, reason = 'Manual suspension') {
  try {
    const result = await db.query(`
      UPDATE agents 
      SET is_suspended = TRUE,
          updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = $1 AND user_id = $2
      RETURNING agent_id, agent_name
    `, [agentId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }

    console.log(`🛑 Agent ${agentId} manually suspended: ${reason}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error suspending agent:', error);
    throw error;
  }
}

/**
 * Utility function to reactivate a suspended agent
 */
async function reactivateAgent(agentId, userId) {
  try {
    const result = await db.query(`
      UPDATE agents 
      SET is_suspended = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = $1 AND user_id = $2
      RETURNING agent_id, agent_name
    `, [agentId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }

    console.log(`✅ Agent ${agentId} reactivated`);
    return result.rows[0];
  } catch (error) {
    console.error('Error reactivating agent:', error);
    throw error;
  }
}

/**
 * Post-creation budget check for newly created agents
 */
async function checkAgentBudgetAfterCreation(agentUuid, requestedCost, userId) {
  try {
    const agentQuery = await db.query(`
      SELECT 
        id,
        agent_id,
        agent_name,
        is_suspended,
        monthly_cost_limit
      FROM agents 
      WHERE id = $1 AND user_id = $2
    `, [agentUuid, userId]);

    if (agentQuery.rows.length === 0) {
      throw new Error('Agent not found after creation');
    }

    const agent = agentQuery.rows[0];

    // Kill-switch check
    if (agent.is_suspended) {
      return {
        allowed: false,
        error: 'Agent is suspended',
        code: 'AGENT_SUSPENDED'
      };
    }

    // Budget check for newly created agents (they start with $0 spend)
    if (agent.monthly_cost_limit !== null && requestedCost > agent.monthly_cost_limit) {
      // Suspend immediately
      await db.query(`
        UPDATE agents 
        SET is_suspended = TRUE 
        WHERE id = $1
      `, [agentUuid]);

      return {
        allowed: false,
        error: 'Agent suspended: first event would exceed monthly limit',
        code: 'BUDGET_LIMIT_EXCEEDED',
        monthly_limit: parseFloat(agent.monthly_cost_limit),
        requested_cost: requestedCost
      };
    }

    return { allowed: true, agent };
  } catch (error) {
    console.error('Post-creation budget check error:', error);
    throw error;
  }
}

/**
 * Get current spending status for an agent
 */
async function getAgentSpendingStatus(agentId, userId) {
  try {
    const result = await db.query(`
      SELECT 
        a.agent_id,
        a.agent_name,
        a.is_suspended,
        a.monthly_cost_limit,
        COALESCE(SUM(ue.cost_amount), 0) as current_month_spend,
        COUNT(ue.id) as current_month_events
      FROM agents a
      LEFT JOIN usage_events ue ON a.id = ue.agent_id 
        AND DATE_TRUNC('month', ue.event_timestamp) = DATE_TRUNC('month', CURRENT_DATE)
      WHERE a.agent_id = $1 AND a.user_id = $2
      GROUP BY a.id, a.agent_id, a.agent_name, a.is_suspended, a.monthly_cost_limit
    `, [agentId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }

    const agent = result.rows[0];
    const utilizationPercent = agent.monthly_cost_limit 
      ? (agent.current_month_spend / agent.monthly_cost_limit) * 100
      : null;

    return {
      ...agent,
      current_month_spend: parseFloat(agent.current_month_spend),
      utilization_percent: utilizationPercent
    };
  } catch (error) {
    console.error('Error getting agent spending status:', error);
    throw error;
  }
}

module.exports = {
  enforceAgentBudget,
  checkAgentBudgetAfterCreation,
  suspendAgent,
  reactivateAgent,
  getAgentSpendingStatus
};
