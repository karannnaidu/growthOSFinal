-- =============================================================================
-- Growth OS — Knowledge Graph Schema
-- =============================================================================
-- Run AFTER supabase/schema.sql (depends on brands, skill_runs).
-- Requires pgvector and pg_trgm extensions.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- SECTION 1: KNOWLEDGE NODES
-- =============================================================================
-- Central entity table. Each row represents a discrete piece of brand
-- knowledge — a product, audience segment, competitor insight, content asset,
-- metric snapshot, etc. The embedding column enables semantic similarity search.

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid        REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  node_type       text        NOT NULL CHECK (node_type IN (
                                'product','audience','competitor','content',
                                'campaign','metric','insight','trend',
                                'keyword','landing_page','email','ad_creative',
                                'brand_asset','persona','funnel_stage',
                                'offer','testimonial','usp','channel','experiment'
                              )),
  name            text        NOT NULL,
  summary         text,
  properties      jsonb       DEFAULT '{}',
  tags            text[]      DEFAULT '{}',
  source_skill    text,
  source_run_id   uuid        REFERENCES skill_runs(id) ON DELETE SET NULL,
  confidence      numeric(4,3) DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  superseded_by   uuid        REFERENCES knowledge_nodes(id) ON DELETE SET NULL,
  is_active       boolean     DEFAULT true,
  -- Storage / media
  storage_path    text,
  storage_bucket  text,
  media_type      text,
  media_url       text,
  thumbnail_url   text,
  -- Vector embedding (768 dimensions — Gemini text-embedding-004 / compatible)
  embedding       vector(768),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Standard lookup indexes
CREATE INDEX IF NOT EXISTS idx_kn_brand_type   ON knowledge_nodes(brand_id, node_type);
CREATE INDEX IF NOT EXISTS idx_kn_brand_active ON knowledge_nodes(brand_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_kn_tags         ON knowledge_nodes USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_kn_properties   ON knowledge_nodes USING GIN (properties jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_kn_source_run   ON knowledge_nodes(source_run_id);
CREATE INDEX IF NOT EXISTS idx_kn_updated      ON knowledge_nodes(brand_id, updated_at DESC);

-- Trigram index for fast fuzzy name search
CREATE INDEX IF NOT EXISTS idx_kn_name_trgm    ON knowledge_nodes USING GIN (name gin_trgm_ops);

-- IVFFlat ANN index for cosine similarity search (requires data before training)
-- lists=100 is appropriate for up to ~1M rows; tune upward as data grows.
CREATE INDEX IF NOT EXISTS idx_kn_embedding    ON knowledge_nodes
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================================================
-- SECTION 2: KNOWLEDGE EDGES
-- =============================================================================
-- Typed, directional relationships between knowledge_nodes.
-- A weighted edge captures how strongly two entities are related and why.

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid        REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  source_node_id  uuid        REFERENCES knowledge_nodes(id) ON DELETE CASCADE NOT NULL,
  target_node_id  uuid        REFERENCES knowledge_nodes(id) ON DELETE CASCADE NOT NULL,
  edge_type       text        NOT NULL CHECK (edge_type IN (
                                'targets','competes_with','supports','undermines',
                                'derived_from','similar_to','used_in','triggers',
                                'ranks_for','authored_by','belongs_to',
                                'precedes','follows','variant_of','promotes'
                              )),
  weight          numeric(4,3) DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  properties      jsonb       DEFAULT '{}',
  source_skill    text,
  source_run_id   uuid        REFERENCES skill_runs(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  -- Constraints
  CONSTRAINT no_self_loop   CHECK (source_node_id <> target_node_id)
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_ke_brand  ON knowledge_edges(brand_id);
CREATE INDEX IF NOT EXISTS idx_ke_source ON knowledge_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_ke_target ON knowledge_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_ke_type   ON knowledge_edges(brand_id, edge_type);

-- Enforce one typed edge per directed node pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_ke_unique_edge
  ON knowledge_edges(source_node_id, target_node_id, edge_type);

-- =============================================================================
-- SECTION 3: KNOWLEDGE SNAPSHOTS
-- =============================================================================
-- Temporal metric data points attached to a node. Enables trend analysis and
-- time-series queries without mutating the node itself.

CREATE TABLE IF NOT EXISTS knowledge_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid        REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  node_id       uuid        REFERENCES knowledge_nodes(id) ON DELETE CASCADE NOT NULL,
  snapshot_at   timestamptz NOT NULL DEFAULT now(),
  metrics       jsonb       NOT NULL DEFAULT '{}',
  source_skill  text,
  source_run_id uuid        REFERENCES skill_runs(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

-- Time-series indexes
CREATE INDEX IF NOT EXISTS idx_ks_node_time  ON knowledge_snapshots(node_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_ks_brand_time ON knowledge_snapshots(brand_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_ks_metrics    ON knowledge_snapshots USING GIN (metrics);

-- =============================================================================
-- SECTION 4: AGENCY PATTERNS
-- =============================================================================
-- Cross-brand patterns discovered by agency-tier accounts. Each pattern
-- aggregates signals from multiple client brands without exposing raw data.

CREATE TABLE IF NOT EXISTS agency_patterns (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_brand_id      uuid        REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  pattern_type         text        NOT NULL CHECK (pattern_type IN (
                                     'audience_insight','content_performance',
                                     'channel_mix','seasonal_trend',
                                     'competitive_gap','offer_archetype'
                                   )),
  name                 text        NOT NULL,
  description          text,
  data                 jsonb       DEFAULT '{}',
  confidence           numeric(4,3) DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  sample_size          integer     DEFAULT 0,
  contributing_brands  uuid[]      DEFAULT '{}',
  embedding            vector(768),
  is_active            boolean     DEFAULT true,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_ap_agency ON agency_patterns(agency_brand_id);
CREATE INDEX IF NOT EXISTS idx_ap_type   ON agency_patterns(agency_brand_id, pattern_type);

-- IVFFlat ANN index; lists=50 appropriate for smaller per-agency datasets
CREATE INDEX IF NOT EXISTS idx_ap_embedding ON agency_patterns
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- =============================================================================
-- SECTION 5: ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE knowledge_nodes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_edges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_patterns     ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- knowledge_nodes — standard brand_access pattern
-- ---------------------------------------------------------------------------
CREATE POLICY "brand_access" ON knowledge_nodes
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- knowledge_edges — standard brand_access pattern
-- ---------------------------------------------------------------------------
CREATE POLICY "brand_access" ON knowledge_edges
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- knowledge_snapshots — standard brand_access pattern
-- ---------------------------------------------------------------------------
CREATE POLICY "brand_access" ON knowledge_snapshots
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- agency_patterns — agency_access: user must own or be a member of the
-- agency_brand_id brand (same predicate as brand_access but different column)
-- ---------------------------------------------------------------------------
CREATE POLICY "agency_access" ON agency_patterns
  FOR ALL USING (agency_brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

-- =============================================================================
-- END OF KNOWLEDGE GRAPH SCHEMA
-- =============================================================================
