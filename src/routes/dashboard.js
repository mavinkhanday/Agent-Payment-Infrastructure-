const express = require('express');
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

// Get cost summary
router.get('/costs/summary', authenticateEither, async (req, res) => {
  try {
    const { period = '7d', customer_id, agent_id } = req.query;
    
    let dateFilter = '';
    const params = [req.user.id];
    let paramIndex = 2;
    
    // Set date filter based on period
    switch (period) {
      case '1d':
        dateFilter = "AND ue.event_timestamp >= NOW() - INTERVAL '1 day'";
        break;
      case '7d':
        dateFilter = "AND ue.event_timestamp >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        dateFilter = "AND ue.event_timestamp >= NOW() - INTERVAL '30 days'";
        break;
      case '90d':
        dateFilter = "AND ue.event_timestamp >= NOW() - INTERVAL '90 days'";
        break;
      default:
        dateFilter = "AND ue.event_timestamp >= NOW() - INTERVAL '7 days'";
    }
    
    let customerFilter = '';
    if (customer_id) {
      customerFilter = ` AND c.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }
    
    let agentFilter = '';
    if (agent_id) {
      agentFilter = ` AND a.agent_id = $${paramIndex}`;
      params.push(agent_id);
      paramIndex++;
    }
    
    // Total costs
    const totalCostResult = await db.query(`
      SELECT 
        COALESCE(SUM(ue.cost_amount), 0) as total_cost,
        COUNT(*) as total_events,
        COALESCE(SUM(ue.total_tokens), 0) as total_tokens
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      JOIN agents a ON ue.agent_id = a.id
      WHERE ue.user_id = $1 ${dateFilter} ${customerFilter} ${agentFilter}
    `, params);
    
    // Costs by vendor
    const vendorCostResult = await db.query(`
      SELECT 
        ue.vendor,
        COALESCE(SUM(ue.cost_amount), 0) as total_cost,
        COUNT(*) as total_events,
        COALESCE(SUM(ue.total_tokens), 0) as total_tokens
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      JOIN agents a ON ue.agent_id = a.id
      WHERE ue.user_id = $1 ${dateFilter} ${customerFilter} ${agentFilter}
      GROUP BY ue.vendor
      ORDER BY total_cost DESC
    `, params);
    
    // Top customers by cost
    const topCustomersResult = await db.query(`
      SELECT 
        c.customer_id,
        c.customer_name,
        COALESCE(SUM(ue.cost_amount), 0) as total_cost,
        COUNT(*) as total_events
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      JOIN agents a ON ue.agent_id = a.id
      WHERE ue.user_id = $1 ${dateFilter} ${customerFilter} ${agentFilter}
      GROUP BY c.customer_id, c.customer_name
      ORDER BY total_cost DESC
      LIMIT 10
    `, params);
    
    // Top agents by cost
    const topAgentsResult = await db.query(`
      SELECT 
        a.agent_id,
        a.agent_name,
        COALESCE(SUM(ue.cost_amount), 0) as total_cost,
        COUNT(*) as total_events
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      JOIN agents a ON ue.agent_id = a.id
      WHERE ue.user_id = $1 ${dateFilter} ${customerFilter} ${agentFilter}
      GROUP BY a.agent_id, a.agent_name
      ORDER BY total_cost DESC
      LIMIT 10
    `, params);
    
    res.json({
      summary: totalCostResult.rows[0],
      by_vendor: vendorCostResult.rows,
      top_customers: topCustomersResult.rows,
      top_agents: topAgentsResult.rows,
      period,
      filters: { customer_id, agent_id }
    });
  } catch (error) {
    console.error('Dashboard cost summary error:', error);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

// Get daily cost trends
router.get('/costs/trends', authenticateEither, async (req, res) => {
  try {
    const { days = 30, customer_id, agent_id } = req.query;
    
    const params = [req.user.id, parseInt(days)];
    let paramIndex = 3;
    
    let customerFilter = '';
    if (customer_id) {
      customerFilter = ` AND c.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }
    
    let agentFilter = '';
    if (agent_id) {
      agentFilter = ` AND a.agent_id = $${paramIndex}`;
      params.push(agent_id);
      paramIndex++;
    }
    
    const result = await db.query(`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '1 day' * ($2 - 1),
          CURRENT_DATE,
          '1 day'::interval
        )::date as date
      ),
      daily_costs AS (
        SELECT 
          DATE(ue.event_timestamp) as date,
          COALESCE(SUM(ue.cost_amount), 0) as total_cost,
          COUNT(*) as total_events,
          COALESCE(SUM(ue.total_tokens), 0) as total_tokens
        FROM usage_events ue
        JOIN customers c ON ue.customer_id = c.id
        JOIN agents a ON ue.agent_id = a.id
        WHERE ue.user_id = $1 
        AND ue.event_timestamp >= CURRENT_DATE - INTERVAL '1 day' * ($2 - 1)
        ${customerFilter} ${agentFilter}
        GROUP BY DATE(ue.event_timestamp)
      )
      SELECT 
        ds.date,
        COALESCE(dc.total_cost, 0) as total_cost,
        COALESCE(dc.total_events, 0) as total_events,
        COALESCE(dc.total_tokens, 0) as total_tokens
      FROM date_series ds
      LEFT JOIN daily_costs dc ON ds.date = dc.date
      ORDER BY ds.date
    `, params);
    
    res.json({
      trends: result.rows,
      period: `${days} days`,
      filters: { customer_id, agent_id }
    });
  } catch (error) {
    console.error('Dashboard trends error:', error);
    res.status(500).json({ error: 'Failed to fetch cost trends' });
  }
});

// Get usage statistics
router.get('/stats', authenticateEither, async (req, res) => {
  try {
    // Get basic counts
    const statsResult = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM customers WHERE user_id = $1) as total_customers,
        (SELECT COUNT(*) FROM agents WHERE user_id = $1) as total_agents,
        (SELECT COUNT(*) FROM usage_events WHERE user_id = $1) as total_events,
        (SELECT COUNT(DISTINCT vendor) FROM usage_events WHERE user_id = $1) as unique_vendors
    `, [req.user.id]);
    
    // Get recent activity (last 24 hours)
    const recentActivityResult = await db.query(`
      SELECT 
        COUNT(*) as events_last_24h,
        COALESCE(SUM(cost_amount), 0) as cost_last_24h,
        COALESCE(SUM(total_tokens), 0) as tokens_last_24h
      FROM usage_events 
      WHERE user_id = $1 
      AND event_timestamp >= NOW() - INTERVAL '24 hours'
    `, [req.user.id]);
    
    // Get average costs
    const avgCostsResult = await db.query(`
      SELECT 
        COALESCE(AVG(cost_amount), 0) as avg_cost_per_event,
        COALESCE(AVG(total_tokens), 0) as avg_tokens_per_event
      FROM usage_events 
      WHERE user_id = $1
      AND event_timestamp >= NOW() - INTERVAL '30 days'
    `, [req.user.id]);
    
    res.json({
      ...statsResult.rows[0],
      recent_activity: recentActivityResult.rows[0],
      averages: avgCostsResult.rows[0]
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Get model breakdown
router.get('/models', authenticateEither, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let dateFilter = '';
    switch (period) {
      case '7d':
        dateFilter = "AND event_timestamp >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        dateFilter = "AND event_timestamp >= NOW() - INTERVAL '30 days'";
        break;
      case '90d':
        dateFilter = "AND event_timestamp >= NOW() - INTERVAL '90 days'";
        break;
      default:
        dateFilter = "AND event_timestamp >= NOW() - INTERVAL '30 days'";
    }
    
    const result = await db.query(`
      SELECT 
        vendor,
        model,
        COUNT(*) as usage_count,
        COALESCE(SUM(cost_amount), 0) as total_cost,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(cost_amount), 0) as avg_cost_per_request,
        COALESCE(AVG(total_tokens), 0) as avg_tokens_per_request
      FROM usage_events 
      WHERE user_id = $1 ${dateFilter}
      GROUP BY vendor, model
      ORDER BY total_cost DESC
    `, [req.user.id]);
    
    res.json({
      models: result.rows,
      period
    });
  } catch (error) {
    console.error('Dashboard models error:', error);
    res.status(500).json({ error: 'Failed to fetch model breakdown' });
  }
});

module.exports = router;