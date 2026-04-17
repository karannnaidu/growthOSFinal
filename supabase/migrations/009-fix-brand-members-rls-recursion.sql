-- migrations/009-fix-brand-members-rls-recursion.sql
--
-- Fix "infinite recursion detected in policy for relation brand_members".
--
-- The two policies referenced each other:
--   brands.owner_access          → SELECT FROM brand_members
--   brand_members.member_access  → SELECT FROM brands
-- Postgres evaluates RLS on every subquery, so each policy triggered the
-- other's RLS check in a loop.
--
-- Fix: introduce a SECURITY DEFINER helper that checks brand ownership
-- without triggering RLS on the brands table, and rewrite the brand_members
-- policy to use it. The brands policy keeps its subquery on brand_members —
-- that side of the cycle is now broken because brand_members no longer
-- reaches back into brands.

-- ---------------------------------------------------------------------------
-- Helper: is_brand_owner(brand_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_brand_owner(_brand_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.brands
    WHERE id = _brand_id
      AND owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_brand_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_brand_owner(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rewrite brand_members policy — self or (owner check via SECURITY DEFINER)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "member_access" ON public.brand_members;

CREATE POLICY "member_access" ON public.brand_members
  FOR ALL USING (
    user_id = auth.uid()
    OR public.is_brand_owner(brand_id)
  );
