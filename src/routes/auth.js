const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  company_name: Joi.string().min(1).max(255).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { email, password, company_name } = value;
    
    // Check if user exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    
    // Create user
    await db.query(
      'INSERT INTO users (id, email, password_hash, company_name) VALUES ($1, $2, $3, $4)',
      [userId, email, passwordHash, company_name]
    );
    
    // Create default API key
    const apiKey = `ak_${uuidv4().replace(/-/g, '')}`;
    await db.query(
      'INSERT INTO api_keys (user_id, key_name, api_key) VALUES ($1, $2, $3)',
      [userId, 'Default Key', apiKey]
    );
    
    // Generate JWT
    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { id: userId, email, company_name },
      api_key: apiKey
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { email, password } = value;
    
    // Get user
    const userResult = await db.query(
      'SELECT id, email, password_hash, company_name FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = userResult.rows[0];
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        company_name: user.company_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get API keys for authenticated user
router.get('/api-keys', authenticateJWT, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, key_name, api_key, is_active, created_at, last_used_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    
    res.json({ api_keys: result.rows });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Create new API key
router.post('/api-keys', authenticateJWT, async (req, res) => {
  try {
    const { key_name } = req.body;
    
    if (!key_name || key_name.trim().length === 0) {
      return res.status(400).json({ error: 'API key name is required' });
    }
    
    const apiKey = `ak_${uuidv4().replace(/-/g, '')}`;
    
    const result = await db.query(
      'INSERT INTO api_keys (user_id, key_name, api_key) VALUES ($1, $2, $3) RETURNING id, key_name, api_key, created_at',
      [req.user.id, key_name.trim(), apiKey]
    );
    
    res.status(201).json({
      message: 'API key created successfully',
      api_key: result.rows[0]
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Deactivate API key
router.delete('/api-keys/:keyId', authenticateJWT, async (req, res) => {
  try {
    const { keyId } = req.params;
    
    const result = await db.query(
      'UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING id',
      [keyId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    res.json({ message: 'API key deactivated successfully' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Failed to deactivate API key' });
  }
});

module.exports = router;