const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateApiKey, authenticateJWT } = require('../middleware/auth');

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
const killAgentSchema = Joi.object({
  reason: Joi.string().required().max(500),
  metadata: Joi.object().default({})
});

const pauseAgentSchema = Joi.object({
  duration_minutes: Joi.number().integer().min(1).max(10080).required(), // Max 1 week
  reason: Joi.string().required().max(500),
  metadata: Joi.object().default({})
});

const emergencyStopSchema = Joi.object({
  reason: Joi.string().required().max(1000),
  confirm: Joi.boolean().valid(true).required() // Safety confirmation
});

const triggerSchema = Joi.object({
  trigger_name: Joi.string().required().max(100),
  trigger_type: Joi.string().valid(
    'spend_rate', 'total_daily_spend', 'error_rate', 
    'infinite_loop', 'requests_per_minute', 'cost_acceleration'
  ).required(),
  threshold_value: Joi.number().positive().required(),
  threshold_unit: Joi.string().valid(
    'per_minute', 'per_hour', 'per_day', 'percentage'
  ).required(),
  target_scope: Joi.string().valid('global', 'customer', 'agent').default('agent'),
  is_active: Joi.boolean().default(true),
  metadata: Joi.object().default({})
});

// Helper function to log kill switch events
async function logKillSwitchEvent(eventType, targetType, targetId, userId, reason, triggeredBy = 'manual', metadata = {}) {
  await db.query(`
    INSERT INTO kill_switch_events 
    (event_type, target_type, target_id, user_id, triggered_by, reason, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [eventType, targetType, targetId, userId, triggeredBy, reason, metadata]);
}

// 🚨 EMERGENCY STOP ALL - Nuclear Option
router.post('/emergency-stop-all', authenticateEither, async (req, res) => {
  try {
    const { error, value } = emergencyStopSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { reason, confirm } = value;

    if (!confirm) {
      return res.status(400).json({ 
        error: 'Emergency stop requires explicit confirmation with confirm: true' 
      });
    }

    console.log(`🚨 EMERGENCY STOP ALL initiated by user ${req.user.id}: ${reason}`);

    // Set global emergency stop
    await db.query(`
      UPDATE global_kill_switch 
      SET is_emergency_stopped = true, stopped_at = NOW(), stopped_by = $1, stop_reason = $2
      WHERE id = 1
    `, [req.user.id, reason]);

    // Kill all agents globally
    await db.query(`
      UPDATE agents 
      SET status = 'killed', killed_at = NOW(), killed_by = $1, kill_reason = $2
      WHERE status != 'killed'
    `, [req.user.id, `Emergency stop: ${reason}`]);

    // Log the event
    await logKillSwitchEvent('emergency_stop_all', 'global', null, req.user.id, reason, 'manual');

    res.json({
      message: 'EMERGENCY STOP ACTIVATED - All agents have been terminated',
      stopped_at: new Date().toISOString(),
      reason: reason
    });

  } catch (error) {
    console.error('Emergency stop error:', error);
    res.status(500).json({ error: 'Failed to execute emergency stop' });
  }
});

// Disable emergency stop
router.post('/emergency-stop-disable', authenticateEither, async (req, res) => {
  try {
    console.log(`🔓 Emergency stop disabled by user ${req.user.id}`);

    await db.query(`
      UPDATE global_kill_switch 
      SET is_emergency_stopped = false, stopped_at = NULL, stopped_by = NULL, stop_reason = NULL
      WHERE id = 1
    `);

    await logKillSwitchEvent('emergency_stop_disabled', 'global', null, req.user.id, 'Emergency stop disabled', 'manual');

    res.json({ message: 'Emergency stop has been disabled. Agents can be individually revived.' });

  } catch (error) {
    console.error('Emergency stop disable error:', error);
    res.status(500).json({ error: 'Failed to disable emergency stop' });
  }
});

// Kill all agents for a specific customer
router.post('/kill-customer/:customerId', authenticateEither, async (req, res) => {
  try {
    const { error, value } = killAgentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { customerId } = req.params;
    const { reason, metadata } = value;

    // Get customer UUID
    const customerResult = await db.query(
      'SELECT id FROM customers WHERE user_id = $1 AND customer_id = $2',
      [req.user.id, customerId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customerUuid = customerResult.rows[0].id;

    // Kill all agents for this customer
    const result = await db.query(`
      UPDATE agents 
      SET status = 'killed', killed_at = NOW(), killed_by = $1, kill_reason = $2
      WHERE user_id = $1 AND id IN (
        SELECT a.id FROM agents a 
        JOIN customers c ON a.user_id = c.user_id
        WHERE c.id = $3 AND a.status != 'killed'
      )
      RETURNING agent_id
    `, [req.user.id, reason, customerUuid]);

    await logKillSwitchEvent('kill_customer', 'customer', customerId, req.user.id, reason, 'manual', metadata);

    res.json({
      message: `Killed ${result.rows.length} agents for customer ${customerId}`,
      killed_agents: result.rows.map(r => r.agent_id),
      reason: reason
    });

  } catch (error) {
    console.error('Kill customer error:', error);
    res.status(500).json({ error: 'Failed to kill customer agents' });
  }
});

// Kill specific agent
router.post('/kill-agent/:agentId', authenticateEither, async (req, res) => {
  try {
    const { error, value } = killAgentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { agentId } = req.params;
    const { reason, metadata } = value;

    const result = await db.query(`
      UPDATE agents 
      SET status = 'killed', killed_at = NOW(), killed_by = $1, kill_reason = $2
      WHERE user_id = $1 AND agent_id = $3 AND status != 'killed'
      RETURNING id, agent_name
    `, [req.user.id, reason, agentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found or already killed' });
    }

    await logKillSwitchEvent('kill_agent', 'agent', agentId, req.user.id, reason, 'manual', metadata);

    res.json({
      message: `Agent ${agentId} has been killed`,
      agent_name: result.rows[0].agent_name,
      reason: reason
    });

  } catch (error) {
    console.error('Kill agent error:', error);
    res.status(500).json({ error: 'Failed to kill agent' });
  }
});

// Pause specific agent temporarily
router.post('/pause-agent/:agentId', authenticateEither, async (req, res) => {
  try {
    const { error, value } = pauseAgentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { agentId } = req.params;
    const { duration_minutes, reason, metadata } = value;
    const pauseUntil = new Date(Date.now() + duration_minutes * 60000);

    const result = await db.query(`
      UPDATE agents 
      SET status = 'paused', pause_until = $1, kill_reason = $2
      WHERE user_id = $3 AND agent_id = $4 AND status = 'active'
      RETURNING id, agent_name
    `, [pauseUntil, reason, req.user.id, agentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found or not active' });
    }

    await logKillSwitchEvent('pause_agent', 'agent', agentId, req.user.id, reason, 'manual', {
      ...metadata,
      duration_minutes,
      pause_until: pauseUntil
    });

    res.json({
      message: `Agent ${agentId} has been paused for ${duration_minutes} minutes`,
      agent_name: result.rows[0].agent_name,
      pause_until: pauseUntil,
      reason: reason
    });

  } catch (error) {
    console.error('Pause agent error:', error);
    res.status(500).json({ error: 'Failed to pause agent' });
  }
});

// Revive killed or paused agent
router.post('/revive-agent/:agentId', authenticateEither, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { reason = 'Manual revival' } = req.body;

    const result = await db.query(`
      UPDATE agents 
      SET status = 'active', pause_until = NULL, kill_reason = NULL, killed_at = NULL, killed_by = NULL
      WHERE user_id = $1 AND agent_id = $2 AND status IN ('killed', 'paused')
      RETURNING id, agent_name
    `, [req.user.id, agentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found or already active' });
    }

    await logKillSwitchEvent('revive_agent', 'agent', agentId, req.user.id, reason, 'manual');

    res.json({
      message: `Agent ${agentId} has been revived`,
      agent_name: result.rows[0].agent_name
    });

  } catch (error) {
    console.error('Revive agent error:', error);
    res.status(500).json({ error: 'Failed to revive agent' });
  }
});

// Get kill switch status
router.get('/status', authenticateEither, async (req, res) => {
  try {
    // Get global emergency stop status
    const globalResult = await db.query('SELECT * FROM global_kill_switch WHERE id = 1');
    const globalStatus = globalResult.rows[0];

    // Get agent statuses for this user
    const agentResult = await db.query(`
      SELECT 
        agent_id, agent_name, status, kill_reason, killed_at, pause_until,
        CASE 
          WHEN status = 'paused' AND pause_until > NOW() THEN 'paused'
          WHEN status = 'paused' AND pause_until <= NOW() THEN 'active'
          ELSE status
        END as effective_status
      FROM agents 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [req.user.id]);

    // Get recent kill switch events
    const eventsResult = await db.query(`
      SELECT event_type, target_type, target_id, triggered_by, reason, created_at
      FROM kill_switch_events 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [req.user.id]);

    res.json({
      global_emergency_stop: {
        is_active: globalStatus.is_emergency_stopped,
        stopped_at: globalStatus.stopped_at,
        reason: globalStatus.stop_reason
      },
      agents: agentResult.rows,
      recent_events: eventsResult.rows
    });

  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get kill switch status' });
  }
});

// Check if specific agent is active
router.get('/check-agent/:agentId', authenticateEither, async (req, res) => {
  try {
    const { agentId } = req.params;

    const result = await db.query(`
      SELECT 
        agent_id, 
        agent_name,
        status,
        kill_reason,
        pause_until,
        is_agent_active(id, user_id) as is_active
      FROM agents 
      WHERE user_id = $1 AND agent_id = $2
    `, [req.user.id, agentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = result.rows[0];

    res.json({
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      status: agent.status,
      is_active: agent.is_active,
      kill_reason: agent.kill_reason,
      pause_until: agent.pause_until
    });

  } catch (error) {
    console.error('Check agent error:', error);
    res.status(500).json({ error: 'Failed to check agent status' });
  }
});

// Create automatic kill trigger
router.post('/triggers', authenticateEither, async (req, res) => {
  try {
    const { error, value } = triggerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const {
      trigger_name,
      trigger_type,
      threshold_value,
      threshold_unit,
      target_scope,
      is_active,
      metadata
    } = value;

    const result = await db.query(`
      INSERT INTO kill_switch_triggers 
      (user_id, trigger_name, trigger_type, threshold_value, threshold_unit, target_scope, is_active, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at
    `, [req.user.id, trigger_name, trigger_type, threshold_value, threshold_unit, target_scope, is_active, metadata]);

    res.status(201).json({
      message: 'Kill switch trigger created successfully',
      trigger_id: result.rows[0].id,
      created_at: result.rows[0].created_at
    });

  } catch (error) {
    console.error('Create trigger error:', error);
    res.status(500).json({ error: 'Failed to create kill switch trigger' });
  }
});

// List kill switch triggers
router.get('/triggers', authenticateEither, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, trigger_name, trigger_type, threshold_value, threshold_unit, 
             target_scope, is_active, metadata, created_at, updated_at
      FROM kill_switch_triggers 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [req.user.id]);

    res.json({
      triggers: result.rows
    });

  } catch (error) {
    console.error('List triggers error:', error);
    res.status(500).json({ error: 'Failed to list kill switch triggers' });
  }
});

// Update kill switch trigger
router.put('/triggers/:triggerId', authenticateEither, async (req, res) => {
  try {
    const { triggerId } = req.params;
    const allowedUpdates = ['trigger_name', 'threshold_value', 'threshold_unit', 'is_active', 'metadata'];
    const updates = {};
    
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [req.user.id, ...Object.values(updates), triggerId];

    const result = await db.query(`
      UPDATE kill_switch_triggers 
      SET ${setClause}, updated_at = NOW()
      WHERE user_id = $1 AND id = $${values.length}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    res.json({
      message: 'Trigger updated successfully',
      trigger: result.rows[0]
    });

  } catch (error) {
    console.error('Update trigger error:', error);
    res.status(500).json({ error: 'Failed to update kill switch trigger' });
  }
});

// Delete kill switch trigger
router.delete('/triggers/:triggerId', authenticateEither, async (req, res) => {
  try {
    const { triggerId } = req.params;

    const result = await db.query(`
      DELETE FROM kill_switch_triggers 
      WHERE user_id = $1 AND id = $2
      RETURNING trigger_name
    `, [req.user.id, triggerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trigger not found' });
    }

    res.json({
      message: `Trigger "${result.rows[0].trigger_name}" deleted successfully`
    });

  } catch (error) {
    console.error('Delete trigger error:', error);
    res.status(500).json({ error: 'Failed to delete kill switch trigger' });
  }
});

module.exports = router;