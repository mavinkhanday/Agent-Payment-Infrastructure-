const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateApiKey = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid API key' });
    }
    
    const apiKey = authHeader.substring(7);
    
    // Validate API key format
    if (!apiKey.startsWith('ak_')) {
      return res.status(401).json({ error: 'Invalid API key format' });
    }
    
    // Check API key in database
    const result = await db.query(
      `SELECT ak.*, u.id as user_id, u.email, u.company_name 
       FROM api_keys ak 
       JOIN users u ON ak.user_id = u.id 
       WHERE ak.api_key = $1 AND ak.is_active = true`,
      [apiKey]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const apiKeyData = result.rows[0];
    
    // Update last used timestamp
    await db.query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [apiKeyData.id]
    );
    
    // Add user data to request
    req.user = {
      id: apiKeyData.user_id,
      email: apiKeyData.email,
      company_name: apiKeyData.company_name
    };
    
    req.apiKey = {
      id: apiKeyData.id,
      name: apiKeyData.key_name
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }
    
    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user data
    const result = await db.query(
      'SELECT id, email, company_name FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    console.error('JWT auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = {
  authenticateApiKey,
  authenticateJWT
};