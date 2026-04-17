-- 013-ai-visibility-edge-types.sql
-- Add 'measures' edge type for Nova's ai_probe_result -> ai_query edges.
-- Keeps parity with VALID_EDGE_TYPES in src/lib/knowledge/extract.ts.
-- Idempotent: re-runs are safe.

alter table public.knowledge_edges drop constraint if exists valid_edge_type;

alter table public.knowledge_edges
  add constraint valid_edge_type
  check (edge_type = any (array[
    'targets'::text, 'competes_with'::text, 'supports'::text, 'undermines'::text,
    'derived_from'::text, 'similar_to'::text, 'used_in'::text, 'triggers'::text,
    'ranks_for'::text, 'authored_by'::text, 'belongs_to'::text, 'precedes'::text,
    'follows'::text, 'variant_of'::text, 'promotes'::text, 'uses_creative'::text,
    'inspired_by'::text, 'performs_on'::text, 'generated_by'::text,
    'reviewed_by'::text, 'part_of'::text, 'sends_to'::text, 'has_variant'::text,
    'supersedes'::text, 'mentions'::text,
    -- Nova AI visibility:
    'measures'::text
  ]));

comment on constraint valid_edge_type on public.knowledge_edges is
  'Enum-style allow-list for edge_type. Keep in sync with VALID_EDGE_TYPES in src/lib/knowledge/extract.ts.';
