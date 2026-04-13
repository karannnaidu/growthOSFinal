-- 003: campaigns table for tracking Meta (and future platform) ad campaigns

CREATE TABLE IF NOT EXISTS campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            uuid REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  name                text NOT NULL,
  objective           text NOT NULL CHECK (objective IN ('awareness', 'conversion', 'retention')),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft', 'generating', 'review', 'active', 'paused', 'completed', 'failed'
                      )),
  platform            text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta', 'google', 'klaviyo')),
  daily_budget        numeric(10,2) NOT NULL,
  launch_mode         text CHECK (launch_mode IN ('live', 'draft')),

  -- Meta platform IDs (populated after launch)
  meta_campaign_id    text,
  meta_adset_ids      text[] DEFAULT '{}',
  meta_ad_ids         text[] DEFAULT '{}',

  -- What was launched
  targeting           jsonb NOT NULL DEFAULT '{}',
  creatives           jsonb NOT NULL DEFAULT '[]',
  audience_tiers      jsonb NOT NULL DEFAULT '[]',

  -- Optimization state
  learning_ends_at    timestamptz,
  last_optimized_at   timestamptz,
  optimization_log    jsonb DEFAULT '[]',

  -- Source skill runs
  copy_run_id         uuid REFERENCES skill_runs(id),
  image_run_id        uuid REFERENCES skill_runs(id),
  targeting_run_id    uuid REFERENCES skill_runs(id),
  launcher_run_id     uuid REFERENCES skill_runs(id),

  -- Lifecycle
  launched_at         timestamptz,
  paused_at           timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(status) WHERE status = 'active';

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_access" ON campaigns
  FOR ALL USING (brand_id IN (
    SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    UNION SELECT id FROM brands WHERE owner_id = auth.uid()
  ));
