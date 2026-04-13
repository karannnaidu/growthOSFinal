-- 004: Add user_id and agent columns to conversations table
-- Required for per-user conversation isolation and multi-agent chat support

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent   text DEFAULT 'mia';

-- Index for fast lookups by brand + agent + user
CREATE INDEX IF NOT EXISTS idx_conv_brand_agent
  ON conversations(brand_id, agent, user_id);

-- Allow 'assistant' role in conversation_messages (chat route stores role='assistant')
ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_role_check;
ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_role_check
  CHECK (role IN ('user', 'assistant', 'mia'));
