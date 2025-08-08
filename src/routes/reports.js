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

// Helper function to convert rows to CSV
function arrayToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(','));
  
  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      // Handle null/undefined values and escape commas/quotes
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

// Export usage events as CSV
router.get('/export/usage', authenticateEither, async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      customer_id,
      agent_id,
      vendor,
      format = 'csv'
    } = req.query;
    
    if (format !== 'csv' && format !== 'json') {
      return res.status(400).json({ error: 'Format must be csv or json' });
    }
    
    let query = `
      SELECT 
        ue.id,
        ue.event_name,
        c.customer_id,
        c.customer_name,
        a.agent_id,
        a.agent_name,
        ue.vendor,
        ue.model,
        ue.cost_amount,
        ue.cost_currency,
        ue.input_tokens,
        ue.output_tokens,
        ue.total_tokens,
        ue.event_timestamp,
        ue.created_at
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      JOIN agents a ON ue.agent_id = a.id
      WHERE ue.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramIndex = 2;
    
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
    
    query += ` ORDER BY ue.event_timestamp DESC LIMIT 10000`;
    
    const result = await db.query(query, params);
    
    if (format === 'csv') {
      const csv = arrayToCSV(result.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="usage-export.csv"');
      res.send(csv);
    } else {
      res.json({
        usage_events: result.rows,
        exported_at: new Date().toISOString(),
        total_records: result.rows.length,
        filters: { start_date, end_date, customer_id, agent_id, vendor }
      });
    }
  } catch (error) {
    console.error('Export usage error:', error);
    res.status(500).json({ error: 'Failed to export usage data' });
  }
});

// Export cost summary report
router.get('/export/costs', authenticateEither, async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      group_by = 'customer', // customer, agent, vendor, model
      format = 'csv'
    } = req.query;
    
    if (!['customer', 'agent', 'vendor', 'model'].includes(group_by)) {
      return res.status(400).json({ error: 'group_by must be one of: customer, agent, vendor, model' });
    }
    
    if (format !== 'csv' && format !== 'json') {
      return res.status(400).json({ error: 'Format must be csv or json' });
    }
    
    let selectClause = '';
    let groupClause = '';
    
    switch (group_by) {
      case 'customer':
        selectClause = 'c.customer_id, c.customer_name,';
        groupClause = 'GROUP BY c.customer_id, c.customer_name';
        break;
      case 'agent':
        selectClause = 'a.agent_id, a.agent_name,';
        groupClause = 'GROUP BY a.agent_id, a.agent_name';
        break;
      case 'vendor':
        selectClause = 'ue.vendor,';
        groupClause = 'GROUP BY ue.vendor';
        break;
      case 'model':
        selectClause = 'ue.vendor, ue.model,';
        groupClause = 'GROUP BY ue.vendor, ue.model';
        break;
    }
    
    let query = `
      SELECT 
        ${selectClause}
        COUNT(*) as total_events,
        COALESCE(SUM(ue.cost_amount), 0) as total_cost,
        COALESCE(SUM(ue.input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(ue.output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(ue.total_tokens), 0) as total_tokens,
        COALESCE(AVG(ue.cost_amount), 0) as avg_cost_per_event,
        MIN(ue.event_timestamp) as first_event,
        MAX(ue.event_timestamp) as last_event
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      JOIN agents a ON ue.agent_id = a.id
      WHERE ue.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramIndex = 2;
    
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
    
    query += ` ${groupClause} ORDER BY total_cost DESC`;
    
    const result = await db.query(query, params);
    
    if (format === 'csv') {
      const csv = arrayToCSV(result.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="cost-summary-by-${group_by}.csv"`);
      res.send(csv);
    } else {
      res.json({
        cost_summary: result.rows,
        group_by,
        exported_at: new Date().toISOString(),
        total_records: result.rows.length,
        filters: { start_date, end_date }
      });
    }
  } catch (error) {
    console.error('Export costs error:', error);
    res.status(500).json({ error: 'Failed to export cost data' });
  }
});

// Generate monthly invoice data for a customer
router.get('/invoice/:customerId', authenticateEither, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { month, year = new Date().getFullYear() } = req.query;
    
    if (!month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Valid month (1-12) is required' });
    }
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    // Get customer info
    const customerResult = await db.query(
      'SELECT * FROM customers WHERE user_id = $1 AND customer_id = $2',
      [req.user.id, customerId]
    );
    
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const customer = customerResult.rows[0];
    
    // Get usage summary for the month
    const usageResult = await db.query(`
      SELECT 
        ue.vendor,
        ue.model,
        COUNT(*) as usage_count,
        COALESCE(SUM(ue.cost_amount), 0) as total_cost,
        COALESCE(SUM(ue.input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(ue.output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(ue.total_tokens), 0) as total_tokens
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      WHERE ue.user_id = $1 
      AND c.customer_id = $2
      AND ue.event_timestamp >= $3 
      AND ue.event_timestamp <= $4
      GROUP BY ue.vendor, ue.model
      ORDER BY total_cost DESC
    `, [req.user.id, customerId, startDate, endDate]);
    
    // Get totals
    const totalResult = await db.query(`
      SELECT 
        COUNT(*) as total_events,
        COALESCE(SUM(ue.cost_amount), 0) as total_cost,
        COALESCE(SUM(ue.total_tokens), 0) as total_tokens
      FROM usage_events ue
      JOIN customers c ON ue.customer_id = c.id
      WHERE ue.user_id = $1 
      AND c.customer_id = $2
      AND ue.event_timestamp >= $3 
      AND ue.event_timestamp <= $4
    `, [req.user.id, customerId, startDate, endDate]);
    
    res.json({
      invoice: {
        customer: {
          id: customer.customer_id,
          name: customer.customer_name,
          email: customer.email
        },
        period: {
          month: parseInt(month),
          year: parseInt(year),
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString()
        },
        usage_breakdown: usageResult.rows,
        totals: totalResult.rows[0],
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Generate invoice error:', error);
    res.status(500).json({ error: 'Failed to generate invoice data' });
  }
});

module.exports = router;