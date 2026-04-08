-- =============================================================================
-- Growth OS — Supabase RPC Functions
-- =============================================================================
-- Run this against your Supabase project via the SQL editor or CLI.
-- Depends on: knowledge-graph.sql (knowledge_nodes must exist with pgvector).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- match_knowledge_nodes
--
-- Performs cosine-similarity search over knowledge_nodes.embedding using the
-- pgvector <=> operator. Called by src/lib/knowledge/rag.ts via supabase.rpc().
--
-- Parameters:
--   query_embedding   — 768-dim vector produced by Gemini text-embedding-004
--   match_brand_id    — restricts search to one brand
--   match_threshold   — minimum similarity score (0–1), default 0.3
--   match_count       — max rows to return, default 10
--   filter_node_types — optional array of node_type values to restrict to
--
-- Returns the matching node fields plus a computed `similarity` column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_knowledge_nodes(
  query_embedding    vector(768),
  match_brand_id     uuid,
  match_threshold    float    DEFAULT 0.3,
  match_count        int      DEFAULT 10,
  filter_node_types  text[]   DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  brand_id     uuid,
  node_type    text,
  name         text,
  summary      text,
  properties   jsonb,
  confidence   numeric,
  similarity   float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kn.id,
    kn.brand_id,
    kn.node_type,
    kn.name,
    kn.summary,
    kn.properties,
    kn.confidence,
    (1 - (kn.embedding <=> query_embedding))::float AS similarity
  FROM knowledge_nodes kn
  WHERE kn.brand_id = match_brand_id
    AND kn.is_active = true
    AND kn.embedding IS NOT NULL
    AND (filter_node_types IS NULL OR kn.node_type = ANY(filter_node_types))
    AND (1 - (kn.embedding <=> query_embedding)) > match_threshold
  ORDER BY kn.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to authenticated users (RLS on the underlying table still applies)
GRANT EXECUTE ON FUNCTION match_knowledge_nodes(vector, uuid, float, int, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION match_knowledge_nodes(vector, uuid, float, int, text[]) TO service_role;
