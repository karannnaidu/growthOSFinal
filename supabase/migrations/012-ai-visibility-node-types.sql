-- 012-ai-visibility-node-types.sql
-- Register Nova's AI-visibility node types in the valid_node_type CHECK
-- constraint. Keeps parity with VALID_NODE_TYPES in src/lib/knowledge/extract.ts.
-- Idempotent: drops the old constraint if present before re-adding.

alter table public.knowledge_nodes drop constraint if exists valid_node_type;

alter table public.knowledge_nodes
  add constraint valid_node_type
  check (node_type = any (array[
    'product'::text, 'audience'::text, 'competitor'::text, 'content'::text,
    'campaign'::text, 'metric'::text, 'insight'::text, 'trend'::text,
    'keyword'::text, 'landing_page'::text, 'email'::text, 'ad_creative'::text,
    'brand_asset'::text, 'persona'::text, 'funnel_stage'::text, 'offer'::text,
    'testimonial'::text, 'usp'::text, 'channel'::text, 'experiment'::text,
    'creative'::text, 'email_flow'::text, 'product_image'::text,
    'competitor_creative'::text, 'video_asset'::text, 'review_theme'::text,
    'price_point'::text, 'brand_guidelines'::text, 'top_content'::text,
    'mia_decision'::text, 'mia_digest'::text, 'platform_status'::text,
    'instruction'::text, 'agent_setup'::text, 'brand_data'::text,
    'mia_memory'::text,
    -- Nova AI visibility:
    'brand_dna'::text, 'ai_query'::text, 'ai_probe_result'::text,
    'ai_artifact'::text
  ]));

comment on constraint valid_node_type on public.knowledge_nodes is
  'Enum-style allow-list for node_type. Keep in sync with VALID_NODE_TYPES in src/lib/knowledge/extract.ts.';
