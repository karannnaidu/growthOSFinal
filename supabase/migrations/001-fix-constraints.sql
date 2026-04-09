-- Fix knowledge_nodes node_type constraint — add missing types
ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS valid_node_type;
ALTER TABLE knowledge_nodes ADD CONSTRAINT valid_node_type CHECK (node_type IN (
  'product', 'audience', 'campaign', 'content', 'competitor',
  'insight', 'metric', 'experiment', 'creative', 'keyword',
  'email_flow', 'channel', 'persona', 'product_image',
  'competitor_creative', 'ad_creative', 'video_asset',
  'landing_page', 'review_theme', 'price_point',
  'brand_guidelines', 'brand_asset', 'top_content'
));

-- Fix knowledge_edges edge_type constraint — add reviewed_by
ALTER TABLE knowledge_edges DROP CONSTRAINT IF EXISTS valid_edge_type;
ALTER TABLE knowledge_edges ADD CONSTRAINT valid_edge_type CHECK (edge_type IN (
  'targets', 'uses_creative', 'competes_with', 'inspired_by',
  'performs_on', 'belongs_to', 'generated_by', 'reviewed_by',
  'derived_from', 'part_of', 'sends_to', 'has_variant',
  'supersedes', 'similar_to', 'mentions'
));
