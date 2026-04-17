-- 011-brand-assets-public.sql
-- Flip storage.buckets.public=true for brand-assets so getPublicUrl() returns
-- a URL that actually loads in the browser. Product images, brand logos, and
-- reference files aren't sensitive (already on the brand's public website),
-- and the other two storage buckets (generated-assets, competitor-assets) are
-- already public.

update storage.buckets
set public = true
where id = 'brand-assets';
