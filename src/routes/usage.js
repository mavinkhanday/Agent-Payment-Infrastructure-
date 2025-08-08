const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticateApiKey } = require('../middleware/auth');
const { enforceAgentBudget, checkAgentBudgetAfterCreation } = require('../middleware/agentBudget');
const { incrementAgentSpend } = require('../config/redis');

const router = express.Router();

// Validation schemas
const usageEventSchema = Joi.object({
  event_name: Joi.string().required(),
  agent_id: Joi.string().required(),
  customer_id: Joi.string().required(),
  vendor: Joi.string().required(),
  model: Joi.string().optional(),
  cost_amount: Joi.number().positive().required(),
  cost_currency: Joi.string().default('USD'),
  input_tokens: Joi.number().integer().min(0).optional(),
  output_tokens: Joi.number().integer().min(0).optional(),
  total_tokens: Joi.number().integer().min(0).optional(),
  metadata: Joi.object().default({}),
  event_timestamp: Joi.date().iso().default(() => new Date())
});

const bulkUsageSchema = Joi.object({
  events: Joi.array().items(usageEventSchema).min(1).max(100).required()
});

// Helper function to ensure customer exists
async function ensureCustomerExists(userId, customerId, customerName = null) {
  const existing = await db.query(
    'SELECT id FROM customers WHERE user_id = $1 AND customer_id = $2',
    [userId, customerId]
  );
  
  if (existing.rows.length === 0) {
    const result = await db.query(
      'INSERT INTO customers (user_id, customer_id, customer_name) VALUES ($1, $2, $3) RETURNING id',
      [userId, customerId, customerName || customerId]
    );
    return result.rows[0].id;
  }
  
  return existing.rows[0].id;
}

// Helper function to ensure agent exists
async function ensureAgentExists(userId, agentId, agentName = null) {
  const existing = await db.query(
    'SELECT id FROM agents WHERE user_id = $1 AND agent_id = $2',
    [userId, agentId]
  );
  
  if (existing.rows.length === 0) {
    const result = await db.query(
      'INSERT INTO agents (user_id, agent_id, agent_name) VALUES ($1, $2, $3) RETURNING id',
      [userId, agentId, agentName || agentId]
    );
    return result.rows[0].id;
  }
  
  return existing.rows[0].id;
}

// Helper function to check if agent is active (not killed or paused)
// This should be called AFTER the agent has been created
async function checkAgentStatus(userId, agentUuid) {
  const result = await db.query(`
    SELECT is_agent_active($1, $2) as is_active
  `, [agentUuid, userId]);
  
  return result.rows[0]?.is_active || false;
}

// Record single usage event
router.post('/record', authenticateApiKey, enforceAgentBudget, async (req, res) => {
  try {
    const { error, value } = usageEventSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const {
      event_name,
      agent_id,
      customer_id,
      vendor,
      model,
      cost_amount,
      cost_currency,
      input_tokens,
      output_tokens,
      total_tokens,
      metadata,
      event_timestamp
    } = value;
    
    // Ensure customer and agent exist FIRST
    const customerUuid = await ensureCustomerExists(req.user.id, customer_id);
    const agentUuid = await ensureAgentExists(req.user.id, agent_id);

    // If budget check was deferred (new agent), check now
    if (req.agentBudgetCheck === 'DEFERRED') {
      const budgetCheck = await checkAgentBudgetAfterCreation(agentUuid, cost_amount, req.user.id);
      if (!budgetCheck.allowed) {
        return res.status(403).json({
          error: budgetCheck.error,
          code: budgetCheck.code,
          agent_id,
          ...(budgetCheck.monthly_limit && { monthly_limit: budgetCheck.monthly_limit }),
          ...(budgetCheck.requested_cost && { requested_cost: budgetCheck.requested_cost })
        });
      }
    }

    // 🚨 KILL SWITCH CHECK - Reject if agent is killed/paused
    const isActive = await checkAgentStatus(req.user.id, agentUuid);
    if (!isActive) {
      return res.status(403).json({ 
        error: 'Agent is currently inactive (killed, paused, or under emergency stop)',
        code: 'AGENT_KILLED',
        agent_id: agent_id
      });
    }
    
    // Calculate total_tokens if not provided
    const finalTotalTokens = total_tokens || (input_tokens || 0) + (output_tokens || 0);
    
    // Insert usage event
    const result = await db.query(
      `INSERT INTO usage_events (
        user_id, customer_id, agent_id, event_name, vendor, model,
        cost_amount, cost_currency, input_tokens, output_tokens, total_tokens,
        metadata, event_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, created_at`,
      [
        req.user.id, customerUuid, agentUuid, event_name, vendor, model,
        cost_amount, cost_currency, input_tokens, output_tokens, finalTotalTokens,
        metadata, event_timestamp
      ]
    );

    // Update Redis spend cache for fast budget checks
    await incrementAgentSpend(agent_id, cost_amount);
    
    res.status(201).json({
      message: 'Usage event recorded successfully',
      event_id: result.rows[0].id,
      recorded_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Record usage error:', error);
    res.status(500).json({ error: 'Failed to record usage event' });
  }
});

// Record bulk usage events  
router.post('/record-bulk', authenticateApiKey, enforceAgentBudget, async (req, res) => {
  try {
    const { error, value } = bulkUsageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { events } = value;

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const recordedEvents = [];
      
      for (const event of events) {
        const {
          event_name,
          agent_id,
          customer_id,
          vendor,
          model,
          cost_amount,
          cost_currency,
          input_tokens,
          output_tokens,
          total_tokens,
          metadata,
          event_timestamp
        } = event;
        
        // Ensure customer and agent exist
        const customerUuid = await ensureCustomerExists(req.user.id, customer_id);
        const agentUuid = await ensureAgentExists(req.user.id, agent_id);

        // 🚨 KILL SWITCH CHECK - Check each agent individually
        const isActive = await checkAgentStatus(req.user.id, agentUuid);
        if (!isActive) {
          throw new Error(`Agent ${agent_id} is currently inactive (killed, paused, or under emergency stop)`);
        }
        
        const finalTotalTokens = total_tokens || (input_tokens || 0) + (output_tokens || 0);
        
        // Insert usage event
        const result = await client.query(
          `INSERT INTO usage_events (
            user_id, customer_id, agent_id, event_name, vendor, model,
            cost_amount, cost_currency, input_tokens, output_tokens, total_tokens,
            metadata, event_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id, created_at`,
          [
            req.user.id, customerUuid, agentUuid, event_name, vendor, model,
            cost_amount, cost_currency, input_tokens, output_tokens, finalTotalTokens,
            metadata, event_timestamp
          ]
        );
        
        recordedEvents.push({
          event_id: result.rows[0].id,
          recorded_at: result.rows[0].created_at
        });
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        message: `${events.length} usage events recorded successfully`,
        events: recordedEvents
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Bulk record usage error:', error);
    res.status(500).json({ error: 'Failed to record usage events' });
  }
});

// Get usage events with filtering
router.get('/events', authenticateApiKey, async (req, res) => {
  try {
    const {
      customer_id,
      agent_id,
      vendor,
      start_date,
      end_date,
      limit = 100,
      offset = 0
    } = req.query;
    
    let query = `
      SELECT 
        ue.id, ue.event_name, ue.vendor, ue.model,
        ue.cost_amount, ue.cost_currency,
        ue.input_tokens, ue.output_tokens, ue.total_tokens,
        ue.metadata, ue.event_timestamp, ue.created_at,
        c.customer_id, c.customer_name,
        a.agent_id, a.agent_name
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      JOIN agents a ON ue.agent_id = a.id
      WHERE ue.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramIndex = 2;
    
    if (customer_id) {
      query += ` AND c.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }
    
    if (agent_id) {
      query += ` AND a.agent_id = $${paramIndex}`;
      params.push(agent_id);
      paramIndex++;
    }
    
    if (vendor) {
      query += ` AND ue.vendor = $${paramIndex}`;
      params.push(vendor);
      paramIndex++;
    }
    
    if (start_date) {
      query += ` AND ue.event_timestamp >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }
    
    if (end_date) {
      query += ` AND ue.event_timestamp <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }
    
    query += ` ORDER BY ue.event_timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await db.query(query, params);
    
    res.json({
      events: result.rows,
      total: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get usage events error:', error);
    res.status(500).json({ error: 'Failed to fetch usage events' });
  }
});

module.exports = router;