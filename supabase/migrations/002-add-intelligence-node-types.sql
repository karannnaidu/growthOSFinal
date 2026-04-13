-- 002: Add intelligence node types used by mia-intelligence and knowledge/intelligence.
--
-- The original inline CHECK (auto-named knowledge_nodes_node_type_check) and
-- migration 001's valid_node_type both omit mia_decision, platform_status,
-- instruction, agent_setup, brand_data.  Without these Mia's decisions
-- silently fail to insert and the chain-processor never fires.
--
-- Drop BOTH possible constraint names, then create a single comprehensive one.

ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS knowledge_nodes_node_type_check;
ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS valid_node_type;

ALTER TABLE knowledge_nodes ADD CONSTRAINT valid_node_type CHECK (node_type IN (
  -- Core entity types (original schema)
  'product', 'audience', 'competitor', 'content',
  'campaign', 'metric', 'insight', 'trend',
  'keyword', 'landing_page', 'email', 'ad_creative',
  'brand_asset', 'persona', 'funnel_stage',
  'offer', 'testimonial', 'usp', 'channel', 'experiment',
  -- Types added by migration 001
  'creative', 'email_flow', 'product_image',
  'competitor_creative', 'video_asset',
  'review_theme', 'price_point',
  'brand_guidelines', 'top_content',
  -- Intelligence types (mia-intelligence / knowledge/intelligence / retention)
  'mia_decision', 'mia_digest', 'platform_status', 'instruction',
  'agent_setup', 'brand_data'
));

-- Same treatment for knowledge_edges — migration 001 added valid_edge_type but
-- the original inline CHECK may still be present.
ALTER TABLE knowledge_edges DROP CONSTRAINT IF EXISTS knowledge_edges_edge_type_check;
ALTER TABLE knowledge_edges DROP CONSTRAINT IF EXISTS valid_edge_type;

ALTER TABLE knowledge_edges ADD CONSTRAINT valid_edge_type CHECK (edge_type IN (
  -- Original types
  'targets', 'competes_with', 'supports', 'undermines',
  'derived_from', 'similar_to', 'used_in', 'triggers',
  'ranks_for', 'authored_by', 'belongs_to',
  'precedes', 'follows', 'variant_of', 'promotes',
  -- Types added by migration 001
  'uses_creative', 'inspired_by', 'performs_on',
  'generated_by', 'reviewed_by', 'part_of',
  'sends_to', 'has_variant', 'supersedes', 'mentions'
));
