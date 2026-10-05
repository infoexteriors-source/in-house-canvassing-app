-- Run after deployment and after creating the two Vault secrets described in docs/SETUP.md.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('fieldwork-route-retention','15 7 * * *', $job$delete from public.location_samples where captured_at<now()-interval '90 days'$job$);
select cron.schedule('fieldwork-jobnimbus','* * * * *', $job$
 select net.http_post(
   url:=(select decrypted_secret from vault.decrypted_secrets where name='fieldwork_supabase_url')||'/functions/v1/jobnimbus-worker',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='fieldwork_crm_worker_key')),
   body:='{}'::jsonb,
   timeout_milliseconds:=10000
 );
$job$);
