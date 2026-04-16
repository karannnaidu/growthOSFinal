-- 006-wallet-transactions-metadata.sql
-- Adds metadata jsonb to wallet_transactions so we can split free vs. paid deductions.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN wallet_transactions.metadata IS
  'Extensible metadata — e.g. { from_free, from_balance } on debits.';
