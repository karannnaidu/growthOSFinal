-- =============================================================================
-- Growth OS — Core Database Schema
-- =============================================================================
-- Run this against your Supabase project via the SQL editor or CLI.
-- Tables are created in dependency order (referenced tables first).
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- SECTION 1: CORE IDENTITY & BRAND TABLES
-- =============================================================================

-- 1. brands
CREATE TABLE IF NOT EXISTS brands (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid REFERENCES auth.users(id) NOT NULL,
  name                  text NOT NULL,
  domain                text,
  logo_url              text,
  product_context       jsonb DEFAULT '{}',
  brand_guidelines      jsonb DEFAULT '{}',
  focus_areas           text[] DEFAULT '{}',
  ai_preset             text DEFAULT 'autopilot' CHECK (ai_preset IN ('autopilot','budget','quality','byok')),
  plan                  text DEFAULT 'free' CHECK (plan IN ('free','starter','growth','agency')),
  onboarding_step       integer DEFAULT 0,
  onboarding_completed  boolean DEFAULT false,
  agency_parent_id      uuid REFERENCES brands(id),
  timezone              text DEFAULT 'Asia/Kolkata',
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_owner  ON brands(owner_id);
CREATE INDEX IF NOT EXISTS idx_brands_agency ON brands(agency_parent_id) WHERE agency_parent_id IS NOT NULL;

-- 2. brand_members
CREATE TABLE IF NOT EXISTS brand_members (
  brand_id   uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  invited_at timestamptz DEFAULT now(),
  PRIMARY KEY (brand_id, user_id)
);

-- =============================================================================
-- SECTION 2: INTEGRATIONS & CREDENTIALS
-- =============================================================================

-- 3. credentials
CREATE TABLE IF NOT EXISTS credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  platform      text CHECK (platform IN ('shopify','meta','google','klaviyo','stripe','ahrefs','snapchat','chatgpt_ads')),
  access_token  text NOT NULL,
  refresh_token text,
  expires_at    timestamptz,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(brand_id, platform)
);

-- 4. byok_keys
CREATE TABLE IF NOT EXISTS byok_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  provider        text CHECK (provider IN ('google','groq','deepseek','anthropic','openai','fal')),
  vault_secret_id uuid NOT NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(brand_id, provider)
);

-- =============================================================================
-- SECTION 3: AGENT & SKILL INFRASTRUCTURE
-- =============================================================================

-- 5. skill_runs
CREATE TABLE IF NOT EXISTS skill_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  agent_id        text NOT NULL,
  skill_id        text NOT NULL,
  model_used      text NOT NULL,
  model_tier      text CHECK (model_tier IN ('free','cheap','mid','premium')),
  ai_cost         numeric(10,4) DEFAULT 0,
  credits_used    integer DEFAULT 0,
  input           jsonb DEFAULT '{}',
  output          jsonb DEFAULT '{}',
  status          text CHECK (status IN ('running','completed','failed')),
  error_message   text,
  triggered_by    text CHECK (triggered_by IN ('user','mia','schedule')),
  parent_run_id   uuid REFERENCES skill_runs(id),
  chain_depth     integer DEFAULT 0,
  duration_ms     integer,
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sr_brand   ON skill_runs(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sr_agent   ON skill_runs(brand_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_sr_skill   ON skill_runs(brand_id, skill_id);
CREATE INDEX IF NOT EXISTS idx_sr_status  ON skill_runs(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_sr_parent  ON skill_runs(parent_run_id);

-- 6. brand_agents
CREATE TABLE IF NOT EXISTS brand_agents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  agent_id     text NOT NULL,
  enabled      boolean DEFAULT true,
  schedule     text,
  auto_approve boolean DEFAULT false,
  config       jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(brand_id, agent_id)
);

-- 7. custom_skills
CREATE TABLE IF NOT EXISTS custom_skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  skill_id    text NOT NULL,
  name        text NOT NULL,
  agent_id    text NOT NULL,
  markdown    text NOT NULL,
  complexity  text DEFAULT 'cheap' CHECK (complexity IN ('free','cheap','mid','premium')),
  credits     integer DEFAULT 1,
  is_active   boolean DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(brand_id, skill_id)
);

-- =============================================================================
-- SECTION 4: PRODUCT & COMPETITOR INTELLIGENCE
-- =============================================================================

-- 8. products
CREATE TABLE IF NOT EXISTS products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  shopify_id        text,
  title             text NOT NULL,
  description       text,
  price             numeric(10,2),
  compare_at_price  numeric(10,2),
  category          text,
  tags              text[] DEFAULT '{}',
  images            jsonb DEFAULT '[]',
  variants          jsonb DEFAULT '[]',
  status            text DEFAULT 'active',
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_brand_shopify ON products(brand_id, shopify_id) WHERE shopify_id IS NOT NULL;

-- 9. competitors
CREATE TABLE IF NOT EXISTS competitors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  name            text NOT NULL,
  domain          text,
  description     text,
  properties      jsonb DEFAULT '{}',
  last_scanned_at timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 10. benchmarks (NO RLS — shared reference data)
CREATE TABLE IF NOT EXISTS benchmarks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text NOT NULL,
  revenue_tier text NOT NULL,
  metrics      jsonb NOT NULL DEFAULT '{}',
  source       text,
  updated_at   timestamptz DEFAULT now()
);

-- =============================================================================
-- SECTION 5: METRICS & ANALYTICS
-- =============================================================================

-- 11. brand_metrics_history
CREATE TABLE IF NOT EXISTS brand_metrics_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  date       date NOT NULL,
  metrics    jsonb NOT NULL DEFAULT '{}',
  source     text DEFAULT 'health-check',
  created_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, date)
);

CREATE INDEX IF NOT EXISTS idx_bmh_brand_date ON brand_metrics_history(brand_id, date DESC);

-- 12. top_content
CREATE TABLE IF NOT EXISTS top_content (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  content_type        text CHECK (content_type IN ('ad','email','social','reel','landing_page')),
  title               text,
  content             jsonb DEFAULT '{}',
  performance_metrics jsonb DEFAULT '{}',
  tags                text[] DEFAULT '{}',
  rank                integer,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tc_brand ON top_content(brand_id, content_type);

-- =============================================================================
-- SECTION 6: BILLING & WALLET
-- =============================================================================

-- 13. wallets
CREATE TABLE IF NOT EXISTS wallets (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                 uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance                  integer DEFAULT 0 CHECK (balance >= 0),
  free_credits             integer DEFAULT 100,
  free_credits_expires_at  timestamptz DEFAULT (now() + interval '30 days'),
  auto_recharge            boolean DEFAULT false,
  auto_recharge_threshold  integer DEFAULT 100,
  auto_recharge_amount     integer DEFAULT 500,
  stripe_customer_id       text,
  circuit_breaker          boolean DEFAULT false,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

-- 14. wallet_transactions (Immutable ledger — no UPDATE/DELETE)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  wallet_id         uuid REFERENCES wallets(id) NOT NULL,
  type              text CHECK (type IN ('deposit','debit','refund','free_credit','expiry')),
  amount            integer NOT NULL,
  balance_after     integer NOT NULL,
  description       text,
  skill_run_id      uuid REFERENCES skill_runs(id),
  stripe_payment_id text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wt_brand  ON wallet_transactions(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wt_wallet ON wallet_transactions(wallet_id, created_at DESC);

-- 15. stripe_webhook_events (NO RLS — internal dedup table)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id           text PRIMARY KEY,
  event_type   text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  payload      jsonb
);

-- =============================================================================
-- SECTION 7: NOTIFICATIONS & CONVERSATIONS
-- =============================================================================

-- 16. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  agent_id     text,
  type         text CHECK (type IN ('needs_review','auto_completed','insight','alert','system')),
  priority     text DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  title        text NOT NULL,
  body         text,
  action_url   text,
  skill_run_id uuid REFERENCES skill_runs(id),
  read         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_brand  ON notifications(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(brand_id) WHERE read = false;

-- 17. conversations
CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent      text DEFAULT 'mia',
  title      text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_brand_agent
  ON conversations(brand_id, agent, user_id);

-- 18. conversation_messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id         uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role                    text CHECK (role IN ('user','assistant','mia')),
  content                 text NOT NULL,
  actions                 jsonb DEFAULT '[]',
  agents_referenced       text[] DEFAULT '{}',
  graph_nodes_referenced  uuid[] DEFAULT '{}',
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_convo ON conversation_messages(conversation_id, created_at);

-- =============================================================================
-- SECTION 8: BRAND GUIDELINES
-- =============================================================================

-- 19. brand_guidelines
CREATE TABLE IF NOT EXISTS brand_guidelines (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL UNIQUE,
  voice_tone              jsonb DEFAULT '{}',
  target_audience         jsonb DEFAULT '{}',
  positioning             text,
  do_say                  text[] DEFAULT '{}',
  dont_say                text[] DEFAULT '{}',
  typography              jsonb DEFAULT '{}',
  colors                  jsonb DEFAULT '{}',
  brand_story             text,
  competitor_positioning  text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- =============================================================================
-- SECTION 9: PLATFORM ADMINISTRATION
-- =============================================================================

-- 20. platform_roles
CREATE TABLE IF NOT EXISTS platform_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       text CHECK (role IN ('super_admin','support','viewer')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_pr_user ON platform_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_pr_role ON platform_roles(role);

-- 21. error_log
CREATE TABLE IF NOT EXISTS error_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid REFERENCES brands(id) ON DELETE CASCADE,
  error_type   text CHECK (error_type IN ('skill_error','integration_error','system_error','webhook_error','auth_error')),
  severity     text CHECK (severity IN ('critical','warning','info')),
  message      text NOT NULL,
  stack_trace  text,
  context      jsonb DEFAULT '{}',
  skill_run_id uuid REFERENCES skill_runs(id),
  resolved     boolean DEFAULT false,
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_el_brand      ON error_log(brand_id);
CREATE INDEX IF NOT EXISTS idx_el_severity   ON error_log(severity);
CREATE INDEX IF NOT EXISTS idx_el_unresolved ON error_log(brand_id) WHERE resolved = false;

-- 22. audit_log (Append-only — no updates, no deletes)
CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid REFERENCES brands(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id),
  action        text NOT NULL,
  resource_type text,
  resource_id   text,
  details       jsonb DEFAULT '{}',
  ip_address    text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_al_brand  ON audit_log(brand_id);
CREATE INDEX IF NOT EXISTS idx_al_user   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_al_action ON audit_log(brand_id, action);

-- =============================================================================
-- SECTION 10: ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE brands                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials             ENABLE ROW LEVEL SECURITY;
ALTER TABLE byok_keys               ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_skills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_metrics_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE top_content             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_guidelines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- brands — owner or member
-- ---------------------------------------------------------------------------
CREATE POLICY "owner_access" ON brands
  FOR ALL USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- brand_members — self or brand owner
-- ---------------------------------------------------------------------------
CREATE POLICY "member_access" ON brand_members
  FOR ALL USING (
    user_id = auth.uid()
    OR brand_id IN (
      SELECT id FROM brands WHERE owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Standard brand_access pattern — brand_id IN (member brands UNION owned brands)
-- Applied to: credentials, byok_keys, skill_runs, brand_agents, custom_skills,
--             products, competitors, brand_metrics_history, top_content,
--             wallets, wallet_transactions, notifications, conversations,
--             brand_guidelines
-- ---------------------------------------------------------------------------
CREATE POLICY "brand_access" ON credentials
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON byok_keys
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON skill_runs
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON brand_agents
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON custom_skills
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON products
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON competitors
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON brand_metrics_history
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON top_content
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON wallets
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON wallet_transactions
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON notifications
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON conversations
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

CREATE POLICY "brand_access" ON brand_guidelines
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- conversation_messages — nested lookup through conversations
-- ---------------------------------------------------------------------------
CREATE POLICY "message_access" ON conversation_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE brand_id IN (
        SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
        UNION SELECT id FROM brands WHERE owner_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- platform_roles — self or super_admin
-- ---------------------------------------------------------------------------
CREATE POLICY "self_or_admin" ON platform_roles
  FOR ALL USING (
    user_id = auth.uid()
    OR auth.uid() IN (
      SELECT user_id FROM platform_roles WHERE role = 'super_admin'
    )
  );

-- ---------------------------------------------------------------------------
-- error_log — brand access OR super_admin
-- ---------------------------------------------------------------------------
CREATE POLICY "brand_or_admin_access" ON error_log
  FOR ALL USING (
    brand_id IN (
      SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
      UNION SELECT id FROM brands WHERE owner_id = auth.uid()
    )
    OR auth.uid() IN (
      SELECT user_id FROM platform_roles WHERE role = 'super_admin'
    )
  );

-- ---------------------------------------------------------------------------
-- audit_log — brand access OR super_admin
-- ---------------------------------------------------------------------------
CREATE POLICY "brand_or_admin_access" ON audit_log
  FOR ALL USING (
    brand_id IN (
      SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
      UNION SELECT id FROM brands WHERE owner_id = auth.uid()
    )
    OR auth.uid() IN (
      SELECT user_id FROM platform_roles WHERE role = 'super_admin'
    )
  );

-- ---------------------------------------------------------------------------
-- benchmarks — NO RLS policy (shared reference data, public read)
-- stripe_webhook_events — NO RLS policy (internal dedup, server-side only)
-- RLS is enabled but no policies means service_role bypasses, anon has no access
-- ---------------------------------------------------------------------------

-- =============================================================================
-- SECTION 11: MATERIALIZED VIEW — SKILL METRICS
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS skill_metrics AS
SELECT
  brand_id,
  agent_id,
  skill_id,
  model_tier,
  COUNT(*)                                              AS total_runs,
  COUNT(*) FILTER (WHERE status = 'completed')          AS successful_runs,
  AVG(duration_ms)                                      AS avg_duration_ms,
  SUM(credits_used)                                     AS total_credits,
  SUM(ai_cost)                                          AS total_ai_cost,
  DATE(created_at)                                      AS day
FROM skill_runs
GROUP BY brand_id, agent_id, skill_id, model_tier, DATE(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_metrics
  ON skill_metrics(brand_id, agent_id, skill_id, model_tier, day);

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
