-- Migration: Add budget controls to agents table
-- Date: 2025-01-27
-- Description: Adds monthly cost limits and kill-switch functionality for agents

-- Add budget control columns to agents table
ALTER TABLE agents 
ADD COLUMN monthly_cost_limit DECIMAL(10,2) DEFAULT NULL,  -- NULL = unlimited budget
ADD COLUMN is_suspended BOOLEAN DEFAULT FALSE NOT NULL;   -- kill-switch flag

-- Add index for fast kill-switch lookups
CREATE INDEX IF NOT EXISTS idx_agents_suspended ON agents(is_suspended) WHERE is_suspended = true;

-- Add index for budget limit queries
CREATE INDEX IF NOT EXISTS idx_agents_budget_limit ON agents(monthly_cost_limit) WHERE monthly_cost_limit IS NOT NULL;

-- Create materialized view for monthly agent spending
CREATE MATERIALIZED VIEW IF NOT EXISTS agent_monthly_spend AS
SELECT
  a.id as agent_uuid,
  a.agent_id,
  a.user_id,
  DATE_TRUNC('month', ue.event_timestamp) AS month,
  SUM(ue.cost_amount) AS total_cost,
  COUNT(*) AS event_count,
  MAX(ue.event_timestamp) AS last_event_at
FROM agents a
LEFT JOIN usage_events ue ON a.id = ue.agent_id
WHERE ue.event_timestamp >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
GROUP BY a.id, a.agent_id, a.user_id, DATE_TRUNC('month', ue.event_timestamp);

-- Create unique index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_monthly_spend_unique 
ON agent_monthly_spend(agent_uuid, month);

-- Add comments for documentation
COMMENT ON COLUMN agents.monthly_cost_limit IS 'Monthly spending limit in USD. NULL means unlimited.';
COMMENT ON COLUMN agents.is_suspended IS 'Kill-switch flag. When true, agent cannot create new usage events.';
COMMENT ON MATERIALIZED VIEW agent_monthly_spend IS 'Pre-computed monthly spending per agent for fast budget checks.';

-- Function to refresh the materialized view (call this from cron)
CREATE OR REPLACE FUNCTION refresh_agent_monthly_spend()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY agent_monthly_spend;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON agent_monthly_spend TO PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_agent_monthly_spend() TO PUBLIC;
