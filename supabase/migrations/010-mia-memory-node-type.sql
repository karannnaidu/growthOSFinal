-- 010-mia-memory-node-type.sql
-- Adds 'mia_memory' to knowledge_nodes.valid_node_type so Mia can store
-- durable facts extracted from chat turns. See spec:
-- docs/superpowers/specs/2026-04-17-mia-trust-continuity-design.md

ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS valid_node_type;

ALTER TABLE knowledge_nodes ADD CONSTRAINT valid_node_type CHECK (node_type IN (
  'product', 'audience', 'competitor', 'content',
  'campaign', 'metric', 'insight', 'trend',
  'keyword', 'landing_page', 'email', 'ad_creative',
  'brand_asset', 'persona', 'funnel_stage',
  'offer', 'testimonial', 'usp', 'channel', 'experiment',
  'creative', 'email_flow', 'product_image',
  'competitor_creative', 'video_asset',
  'review_theme', 'price_point',
  'brand_guidelines', 'top_content',
  'mia_decision', 'mia_digest', 'platform_status', 'instruction',
  'agent_setup', 'brand_data',
  -- Added by migration 010
  'mia_memory'
));

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_mia_memory
  ON knowledge_nodes(brand_id, created_at DESC)
  WHERE node_type = 'mia_memory';
