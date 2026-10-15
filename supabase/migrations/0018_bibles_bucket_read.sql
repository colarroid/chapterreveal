-- Uploading a Bible on the admin site failed with "new row violates
-- row-level security policy": the upload may replace an existing file
-- (upsert), which makes Storage look the file up first, and 0005 gave the
-- bibles bucket insert, update and delete policies but no select one.
-- Listing a translation's files before deleting it needs the same.
-- (Churches read the files through the public URL, which needs no policy.)

drop policy if exists "admins read bibles" on storage.objects;
create policy "admins read bibles" on storage.objects
  for select to authenticated using (bucket_id = 'bibles' and public.is_platform_admin());
