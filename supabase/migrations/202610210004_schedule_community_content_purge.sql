-- Install the hosted scheduler and outbound HTTP extension used by Supabase's
-- supported pg_cron + pg_net pattern. The job stays dormant until the secret is
-- present in Vault, and the Edge Function checks the matching Edge Function secret.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job bigint;
begin
  for existing_job in select jobid from cron.job where jobname = 'purge-expired-community-content' loop
    perform cron.unschedule(existing_job);
  end loop;

  perform cron.schedule(
    'purge-expired-community-content',
    '17 * * * *',
    $job$
      select net.http_post(
        url := 'https://egeehlsxsibewarlvjhw.supabase.co/functions/v1/community-api',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-community-purge-secret', (
            select decrypted_secret from vault.decrypted_secrets where name = 'community_purge_secret' limit 1
          )
        ),
        body := '{"action":"purge-expired-content"}'::jsonb
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'community_purge_secret');
    $job$
  );
end;
$$;
