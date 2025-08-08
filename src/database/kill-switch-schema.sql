-- Kill Switch System Database Schema Extensions
-- This extends the existing schema with kill switch functionality

-- Add kill switch columns to existing agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS kill_reason TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS killed_at TIMESTAMP;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS killed_by UUID REFERENCES users(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS pause_until TIMESTAMP;

-- Add status index for fast queries
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_pause_until ON agents(pause_until);

-- Create kill switch events table for audit logging
CREATE TABLE IF NOT EXISTS kill_switch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL, -- 'kill_all', 'kill_customer', 'kill_agent', 'pause_agent', 'revive_agent'
  target_type VARCHAR(20) NOT NULL, -- 'global', 'customer', 'agent'
  target_id VARCHAR(255), -- customer_id or agent_id
  user_id UUID REFERENCES users(id),
  triggered_by VARCHAR(100), -- 'manual', 'auto_spend_rate', 'auto_error_rate', etc.
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for kill switch events
CREATE INDEX IF NOT EXISTS idx_kill_events_type ON kill_switch_events(event_type);
CREATE INDEX IF NOT EXISTS idx_kill_events_target ON kill_switch_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_kill_events_created_at ON kill_switch_events(created_at);

-- Create kill switch triggers table for automatic monitoring
CREATE TABLE IF NOT EXISTS kill_switch_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  trigger_name VARCHAR(100) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- 'spend_rate', 'total_daily_spend', 'error_rate', 'infinite_loop', 'requests_per_minute'
  threshold_value DECIMAL(15,6),
  threshold_unit VARCHAR(20), -- 'per_minute', 'per_hour', 'per_day', 'percentage'
  target_scope VARCHAR(20) DEFAULT 'agent', -- 'global', 'customer', 'agent'
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}', -- Additional trigger configuration
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for triggers
CREATE INDEX IF NOT EXISTS idx_triggers_user_active ON kill_switch_triggers(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_triggers_type ON kill_switch_triggers(trigger_type);

-- Create global kill switch state table
CREATE TABLE IF NOT EXISTS global_kill_switch (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_emergency_stopped BOOLEAN DEFAULT false,
  stopped_at TIMESTAMP,
  stopped_by UUID REFERENCES users(id),
  stop_reason TEXT,
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial row for global kill switch
INSERT INTO global_kill_switch (id, is_emergency_stopped) 
VALUES (1, false) 
ON CONFLICT (id) DO NOTHING;

-- Create spend rate monitoring table for real-time tracking
CREATE TABLE IF NOT EXISTS spend_rate_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  agent_id UUID REFERENCES agents(id),
  
  -- Time window tracking
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,
  window_duration_minutes INTEGER NOT NULL,
  
  -- Spend data
  total_cost DECIMAL(15,6) NOT NULL DEFAULT 0,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  
  -- Calculated rates
  cost_per_minute DECIMAL(15,6),
  requests_per_minute DECIMAL(10,2),
  error_rate DECIMAL(5,2), -- percentage
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for spend monitoring
CREATE INDEX IF NOT EXISTS idx_spend_monitoring_agent ON spend_rate_monitoring(agent_id, window_start);
CREATE INDEX IF NOT EXISTS idx_spend_monitoring_customer ON spend_rate_monitoring(customer_id, window_start);
CREATE INDEX IF NOT EXISTS idx_spend_monitoring_rates ON spend_rate_monitoring(cost_per_minute, requests_per_minute);

-- Create agent heartbeat table for detecting stuck agents
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_request_signature VARCHAR(255), -- Hash of last request for loop detection
  consecutive_identical_requests INTEGER DEFAULT 0,
  is_alive BOOLEAN DEFAULT true,
  PRIMARY KEY (agent_id)
);

-- Update heartbeat trigger
CREATE OR REPLACE FUNCTION update_agent_heartbeat()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO agent_heartbeats (agent_id, user_id, last_activity)
  VALUES (NEW.agent_id, NEW.user_id, NEW.created_at)
  ON CONFLICT (agent_id) 
  DO UPDATE SET
    last_activity = NEW.created_at,
    is_alive = true;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update heartbeats on usage events
DROP TRIGGER IF EXISTS update_agent_heartbeat_trigger ON usage_events;
CREATE TRIGGER update_agent_heartbeat_trigger
  AFTER INSERT ON usage_events
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_heartbeat();

-- Function to check if agent is killed or paused
CREATE OR REPLACE FUNCTION is_agent_active(p_agent_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  agent_status VARCHAR(20);
  pause_until TIMESTAMP;
  global_stopped BOOLEAN;
BEGIN
  -- Check global emergency stop
  SELECT is_emergency_stopped INTO global_stopped 
  FROM global_kill_switch WHERE id = 1;
  
  IF global_stopped THEN
    RETURN FALSE;
  END IF;
  
  -- Check agent status
  SELECT status, agents.pause_until INTO agent_status, pause_until
  FROM agents 
  WHERE id = p_agent_id AND user_id = p_user_id;
  
  -- Agent not found or killed
  IF agent_status IS NULL OR agent_status = 'killed' THEN
    RETURN FALSE;
  END IF;
  
  -- Agent is paused and pause hasn't expired
  IF agent_status = 'paused' AND pause_until > NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Auto-unpause if pause period expired
  IF agent_status = 'paused' AND pause_until <= NOW() THEN
    UPDATE agents 
    SET status = 'active', pause_until = NULL
    WHERE id = p_agent_id;
    RETURN TRUE;
  END IF;
  
  RETURN agent_status = 'active';
END;
$$ LANGUAGE plpgsql;