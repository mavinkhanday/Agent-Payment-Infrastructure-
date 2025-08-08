const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateApiKey, authenticateJWT } = require('../middleware/auth');
const { suspendAgent, reactivateAgent, getAgentSpendingStatus } = require('../middleware/agentBudget');

const router = express.Router();

// Middleware to allow both API key and JWT authentication
const authenticateEither = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  if (authHeader.startsWith('Bearer ak_')) {
    return authenticateApiKey(req, res, next);
  } else {
    return authenticateJWT(req, res, next);
  }
};

// Validation schemas
const setBudgetSchema = Joi.object({
  monthly_cost_limit: Joi.number().positive().precision(2).allow(null).required()
});

const agentActionSchema = Joi.object({
  reason: Joi.string().max(500).optional()
});

// Get all agents for a user
router.get('/', authenticateEither, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        a.agent_id,
        a.agent_name,
        a.description,
        a.is_suspended,
        a.monthly_cost_limit,
        a.created_at,
        a.updated_at,
        COALESCE(SUM(ue.cost_amount), 0) as total_cost,
        COUNT(ue.id) as total_events,
        COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month', ue.event_timestamp) = DATE_TRUNC('month', CURRENT_DATE) 
          THEN ue.cost_amount 
          ELSE 0 
        END), 0) as current_month_cost
      FROM agents a
      LEFT JOIN usage_events ue ON a.id = ue.agent_id
      WHERE a.user_id = $1
      GROUP BY a.id, a.agent_id, a.agent_name, a.description, a.is_suspended, a.monthly_cost_limit, a.created_at, a.updated_at
      ORDER BY a.created_at DESC
    `, [req.user.id]);

    const agents = result.rows.map(agent => ({
      ...agent,
      total_cost: parseFloat(agent.total_cost),
      current_month_cost: parseFloat(agent.current_month_cost),
      utilization_percent: agent.monthly_cost_limit 
        ? (parseFloat(agent.current_month_cost) / parseFloat(agent.monthly_cost_limit)) * 100
        : null
    }));

    res.json({ agents });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Get specific agent details and spending status
router.get('/:agentId', authenticateEither, async (req, res) => {
  try {
    const { agentId } = req.params;
    const status = await getAgentSpendingStatus(agentId, req.user.id);
    res.json(status);
  } catch (error) {
    if (error.message === 'Agent not found') {
      return res.status(404).json({ error: 'Agent not found' });
    }
    console.error('Get agent status error:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// Set monthly budget limit for an agent
router.patch('/:agentId/budget', authenticateEither, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { error, value } = setBudgetSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { monthly_cost_limit } = value;

    const result = await db.query(`
      UPDATE agents 
      SET monthly_cost_limit = $1, updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = $2 AND user_id = $3
      RETURNING agent_id, agent_name, monthly_cost_limit
    `, [monthly_cost_limit, agentId, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = result.rows[0];
    console.log(`💰 Budget updated for agent ${agentId}: $${monthly_cost_limit || 'unlimited'}`);

    res.json({
      message: 'Budget limit updated successfully',
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      monthly_cost_limit: parseFloat(agent.monthly_cost_limit) || null
    });
  } catch (error) {
    console.error('Set budget error:', error);
    res.status(500).json({ error: 'Failed to update budget limit' });
  }
});

// Suspend an agent (kill-switch)
router.post('/:agentId/suspend', authenticateEither, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { error, value } = agentActionSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { reason = 'Manual suspension via API' } = value;
    const agent = await suspendAgent(agentId, req.user.id, reason);

    res.json({
      message: 'Agent suspended successfully',
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      reason
    });
  } catch (error) {
    if (error.message === 'Agent not found') {
      return res.status(404).json({ error: 'Agent not found' });
    }
    console.error('Suspend agent error:', error);
    res.status(500).json({ error: 'Failed to suspend agent' });
  }
});

// Reactivate a suspended agent
router.post('/:agentId/reactivate', authenticateEither, async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await reactivateAgent(agentId, req.user.id);

    res.json({
      message: 'Agent reactivated successfully',
      agent_id: agent.agent_id,
      agent_name: agent.agent_name
    });
  } catch (error) {
    if (error.message === 'Agent not found') {
      return res.status(404).json({ error: 'Agent not found' });
    }
    console.error('Reactivate agent error:', error);
    res.status(500).json({ error: 'Failed to reactivate agent' });
  }
});

// Get agent spending history
router.get('/:agentId/spending-history', authenticateEither, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { months = 6 } = req.query;

    const result = await db.query(`
      SELECT 
        DATE_TRUNC('month', event_timestamp) as month,
        SUM(cost_amount) as total_cost,
        COUNT(*) as event_count,
        AVG(cost_amount) as avg_cost_per_event
      FROM usage_events ue
      JOIN agents a ON ue.agent_id = a.id
      WHERE a.agent_id = $1 AND a.user_id = $2
      AND event_timestamp >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '${parseInt(months)} months')
      GROUP BY DATE_TRUNC('month', event_timestamp)
      ORDER BY month DESC
    `, [agentId, req.user.id]);

    const history = result.rows.map(row => ({
      month: row.month,
      total_cost: parseFloat(row.total_cost),
      event_count: parseInt(row.event_count),
      avg_cost_per_event: parseFloat(row.avg_cost_per_event)
    }));

    res.json({ spending_history: history });
  } catch (error) {
    console.error('Get spending history error:', error);
    res.status(500).json({ error: 'Failed to get spending history' });
  }
});

module.exports = router;
