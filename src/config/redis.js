const { createClient } = require('redis');
require('dotenv').config();

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Initialize connection
(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
  }
})();

/**
 * Increment agent spending in Redis for fast budget checks
 */
async function incrementAgentSpend(agentId, costAmount, monthKey = null) {
  try {
    const month = monthKey || new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `agent_spend_${month}`;
    
    await redisClient.hIncrByFloat(key, agentId, costAmount);
    
    // Set expiry on the key if it's new (35 days from now)
    const ttl = await redisClient.ttl(key);
    if (ttl === -1) { // Key exists but no expiry set
      await redisClient.expire(key, 35 * 24 * 60 * 60); // 35 days
    }
    
    return true;
  } catch (error) {
    console.error('Redis increment error:', error);
    return false;
  }
}

/**
 * Get agent spending from Redis cache
 */
async function getAgentSpend(agentId, monthKey = null) {
  try {
    const month = monthKey || new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `agent_spend_${month}`;
    
    const spend = await redisClient.hGet(key, agentId);
    return parseFloat(spend) || 0;
  } catch (error) {
    console.error('Redis get error:', error);
    return 0; // Fallback to 0 if Redis fails
  }
}

/**
 * Get all agent spending for a specific month
 */
async function getAllAgentSpend(monthKey = null) {
  try {
    const month = monthKey || new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `agent_spend_${month}`;
    
    const spendData = await redisClient.hGetAll(key);
    
    // Convert string values to numbers
    const result = {};
    for (const [agentId, spend] of Object.entries(spendData)) {
      result[agentId] = parseFloat(spend) || 0;
    }
    
    return result;
  } catch (error) {
    console.error('Redis get all error:', error);
    return {};
  }
}

/**
 * Reset agent spending (useful for testing or manual adjustments)
 */
async function resetAgentSpend(agentId, monthKey = null) {
  try {
    const month = monthKey || new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `agent_spend_${month}`;
    
    await redisClient.hDel(key, agentId);
    return true;
  } catch (error) {
    console.error('Redis reset error:', error);
    return false;
  }
}

/**
 * Health check for Redis connection
 */
async function healthCheck() {
  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

module.exports = {
  client: redisClient,
  incrementAgentSpend,
  getAgentSpend,
  getAllAgentSpend,
  resetAgentSpend,
  healthCheck
};
