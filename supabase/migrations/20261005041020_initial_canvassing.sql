-- Browser/mobile clients are read-only. All writes pass through authenticated Edge Functions.
create schema if not exists extensions;
create schema if not exists private;
create extension if not exists postgis with schema extensions;
create table public.companies (id uuid primary key default gen_random_uuid(), name text not null, timezone text not null default 'America/New_York');
create table public.memberships (user_id uuid primary key references auth.users(id), company_id uuid not null references public.companies(id), name text not null, email text not null, role text not null check(role in ('owner','canvasser')), active boolean not null default true);
create index membership_company on public.memberships(company_id);
create table public.territories (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), name text not null, color text not null default '#147b70', boundary jsonb not null, assigned_user_ids uuid[] not null default '{}', archived boolean not null default false, check(jsonb_typeof(boundary->'coordinates')='array' and boundary->>'type'='Polygon'));
create table public.shifts (id uuid primary key, company_id uuid not null references public.companies(id), user_id uuid not null references auth.users(id), status text not null check(status in ('active','break','ended')), started_at timestamptz not null, ended_at timestamptz);
create unique index one_open_shift on public.shifts(user_id) where status<>'ended';
create table public.shift_events (id uuid primary key, company_id uuid not null references public.companies(id), shift_id uuid not null references public.shifts(id), user_id uuid not null references auth.users(id), action text not null check(action in ('clock_in','break_start','break_end','clock_out')), occurred_at timestamptz not null, unique(shift_id,occurred_at));
create index shift_events_time on public.shift_events(shift_id,occurred_at);
create table public.properties (id uuid primary key, company_id uuid not null references public.companies(id), territory_id uuid references public.territories(id), created_by uuid not null references auth.users(id), address text not null check(length(trim(address))>0), latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180), do_not_knock boolean not null default false, version integer not null default 1, location extensions.geography(Point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography) stored);
create index property_location on public.properties using gist(location);
create table public.visits (id uuid primary key, company_id uuid not null references public.companies(id), property_id uuid not null references public.properties(id), user_id uuid not null references auth.users(id), shift_id uuid not null references public.shifts(id), outcome text not null check(outcome in ('no_answer','not_interested','follow_up','interested','inspection_requested','existing_customer','do_not_knock')), notes text not null default '', occurred_at timestamptz not null, gps jsonb, follow_up_at timestamptz);
create index visits_property_time on public.visits(property_id,occurred_at desc);
create table public.location_samples (id uuid primary key, company_id uuid not null references public.companies(id), user_id uuid not null references auth.users(id), shift_id uuid not null references public.shifts(id), latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180), accuracy double precision not null check(accuracy>=0), captured_at timestamptz not null);
create index locations_rep_time on public.location_samples(user_id,captured_at desc);
create table public.leads (id uuid primary key, company_id uuid not null references public.companies(id), visit_id uuid not null unique references public.visits(id), property_id uuid not null references public.properties(id), user_id uuid not null references auth.users(id), name text not null check(length(trim(name))>0), phone text not null default '', email text not null default '', concerns text not null default '', notes text not null default '', preferred_window text not null default '', sync_status text not null default 'pending' check(sync_status in ('pending','synced','failed','review')), remote_contact_id text, created_at timestamptz not null default now(), check(length(trim(phone))>0 or length(trim(email))>0));
create table public.inspection_requests (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), lead_id uuid not null unique references public.leads(id), user_id uuid not null references auth.users(id), preferred_window text not null default '', status text not null default 'office_confirmation_required');
create table public.review_flags (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), visit_id uuid references public.visits(id), user_id uuid not null references auth.users(id), reason text not null, detail text not null default '', resolved_at timestamptz, resolved_by uuid references auth.users(id), created_at timestamptz not null default now());
create table public.time_corrections (id uuid primary key, company_id uuid not null references public.companies(id), shift_id uuid not null references public.shifts(id), user_id uuid not null references auth.users(id), requested_minutes integer not null check(requested_minutes between -1440 and 1440), reason text not null check(length(trim(reason))>0), status text not null default 'pending' check(status in ('pending','approved','rejected')), reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now());
create table public.crm_sync_jobs (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), lead_id uuid not null unique references public.leads(id), status text not null default 'pending' check(status in ('pending','processing','synced','failed','review')), attempts integer not null default 0, remote_contact_id text, remote_task_id text, step text not null default 'contact', last_error text, locked_at timestamptz, updated_at timestamptz not null default now());
create table private.processed_commands (id uuid primary key, user_id uuid not null, kind text not null, processed_at timestamptz not null default now());
alter table private.processed_commands enable row level security;
create table public.audit_log (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), actor_id uuid not null references auth.users(id), action text not null, record_id uuid, detail jsonb not null default '{}', created_at timestamptz not null default now());

-- Policy helpers require bypass for the membership lookup only. Never accept a user ID from clients.
create function private.my_company() returns uuid language sql stable security definer set search_path='' as $$ select company_id from public.memberships where user_id=(select auth.uid()) and active $$;
create function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select role='owner' from public.memberships where user_id=(select auth.uid()) and active),false) $$;
revoke all on function private.my_company(), private.is_owner() from public;
grant usage on schema private to authenticated;
grant execute on function private.my_company(), private.is_owner() to authenticated;

alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.territories enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_events enable row level security;
alter table public.properties enable row level security;
alter table public.visits enable row level security;
alter table public.location_samples enable row level security;
alter table public.leads enable row level security;
alter table public.inspection_requests enable row level security;
alter table public.review_flags enable row level security;
alter table public.time_corrections enable row level security;
alter table public.crm_sync_jobs enable row level security;
alter table public.audit_log enable row level security;
create policy company_read on public.companies for select to authenticated using(id=(select private.my_company()));
create policy members_read on public.memberships for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or user_id=(select auth.uid())));
create policy territory_read on public.territories for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or (select auth.uid())=any(assigned_user_ids)));
create policy properties_read on public.properties for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or created_by=(select auth.uid()) or do_not_knock or exists(select 1 from public.territories t where t.id=territory_id and (select auth.uid())=any(t.assigned_user_ids))));
create policy visits_read on public.visits for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or user_id=(select auth.uid()) or exists(select 1 from public.properties p join public.territories t on t.id=p.territory_id where p.id=property_id and (select auth.uid())=any(t.assigned_user_ids))));
create policy shifts_read on public.shifts for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or user_id=(select auth.uid())));
create policy events_read on public.shift_events for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or user_id=(select auth.uid())));
create policy locations_read on public.location_samples for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or user_id=(select auth.uid())));
create policy leads_read on public.leads for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or user_id=(select auth.uid())));
create policy inspections_read on public.inspection_requests for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or user_id=(select auth.uid())));
create policy corrections_read on public.time_corrections for select to authenticated using(company_id=(select private.my_company()) and ((select private.is_owner()) or user_id=(select auth.uid())));
create policy flags_read on public.review_flags for select to authenticated using(company_id=(select private.my_company()) and (select private.is_owner()));
create policy crm_read on public.crm_sync_jobs for select to authenticated using(company_id=(select private.my_company()) and (select private.is_owner()));
create policy audit_read on public.audit_log for select to authenticated using(company_id=(select private.my_company()) and (select private.is_owner()));
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all tables in schema private to service_role;

create function private.active_at(p_shift uuid, p_time timestamptz) returns boolean language sql stable set search_path='' as $$ select coalesce((select action in ('clock_in','break_end') from public.shift_events where shift_id=p_shift and occurred_at<=p_time order by occurred_at desc limit 1),false) $$;

-- One RPC transaction per command: a failed visit cannot leave a half-saved lead/property.
create function public.apply_field_command(p_user uuid, command jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  member public.memberships; s public.shifts; prop public.properties; p jsonb:=command->'payload'; c_id uuid:=(command->>'id')::uuid; at_time timestamptz:=(command->>'occurred_at')::timestamptz;
  action text; shift_id uuid; property_id uuid; visit_id uuid; territory_id uuid; gps jsonb; gps_time timestamptz; gps_distance double precision; lead jsonb; latest_time timestamptz;
begin
  select * into member from public.memberships where user_id=p_user and active for update;
  if member.user_id is null or member.role<>'canvasser' then raise exception 'Active canvasser account required'; end if;
  if exists(select 1 from private.processed_commands where id=c_id and user_id=p_user) then return jsonb_build_object('id',c_id,'status','accepted'); end if;
  if at_time>now()+interval '5 minutes' then raise exception 'Device clock is ahead; correct the phone time'; end if;
  shift_id:=(p->>'shift_id')::uuid;
  if command->>'kind'='shift' then
    action:=p->>'action';
    if action='clock_in' then
      insert into public.shifts values(shift_id,member.company_id,p_user,'active',at_time,null);
    else
      select * into s from public.shifts where id=shift_id and user_id=p_user and company_id=member.company_id for update;
      select max(occurred_at) into latest_time from public.shift_events where shift_events.shift_id=s.id;
      if s.id is null or at_time<=latest_time then raise exception 'Shift event is out of order'; end if;
      if not ((action='break_start' and s.status='active') or (action='break_end' and s.status='break') or (action='clock_out' and s.status in ('active','break'))) then raise exception 'Invalid shift transition'; end if;
      update public.shifts set status=case when action='break_start' then 'break' when action='clock_out' then 'ended' else 'active' end, ended_at=case when action='clock_out' then at_time else null end where id=s.id;
    end if;
    insert into public.shift_events values(c_id,member.company_id,shift_id,p_user,action,at_time);
  elsif command->>'kind' in ('location','visit') then
    select * into s from public.shifts where id=shift_id and user_id=p_user and company_id=member.company_id;
    if s.id is null or not private.active_at(shift_id,at_time) then raise exception 'Record is outside active field time'; end if;
    if command->>'kind'='location' then
      insert into public.location_samples values(c_id,member.company_id,p_user,shift_id,(p->>'latitude')::float8,(p->>'longitude')::float8,(p->>'accuracy')::float8,at_time);
    else
      property_id:=(p->'property'->>'id')::uuid; visit_id:=c_id; gps:=nullif(p->'gps','null'::jsonb);
      -- Serialize matching house addresses across reps, preserving separate unit numbers.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(member.company_id::text||lower(regexp_replace(p->'property'->>'address','[^[:alnum:]]','','g')),0));
      select * into prop from public.properties where company_id=member.company_id and (id=property_id or (lower(regexp_replace(address,'[^[:alnum:]]','','g'))=lower(regexp_replace(p->'property'->>'address','[^[:alnum:]]','','g')) and extensions.st_dwithin(location,extensions.st_setsrid(extensions.st_makepoint((p->'property'->>'longitude')::float8,(p->'property'->>'latitude')::float8),4326)::extensions.geography,15))) order by (id=property_id) desc limit 1 for update;
      if prop.id is null then
        select id into territory_id from public.territories t where t.company_id=member.company_id and not archived and extensions.st_covers(extensions.st_setsrid(extensions.st_geomfromgeojson(t.boundary),4326),extensions.st_setsrid(extensions.st_makepoint((p->'property'->>'longitude')::float8,(p->'property'->>'latitude')::float8),4326)) order by ((p_user=any(t.assigned_user_ids))) desc limit 1;
        insert into public.properties(id,company_id,territory_id,created_by,address,latitude,longitude) values(property_id,member.company_id,territory_id,p_user,p->'property'->>'address',(p->'property'->>'latitude')::float8,(p->'property'->>'longitude')::float8) returning * into prop;
      elsif prop.version<>coalesce((p->'property'->>'version')::int,prop.version) then
        insert into public.review_flags(company_id,user_id,reason,detail) values(member.company_id,p_user,'Property edit conflict','Visit preserved; server address retained for property '||prop.id);
      end if;
      if prop.do_not_knock and not coalesce((p->>'acknowledge_dnk')::boolean,false) then raise exception 'Acknowledge the do-not-knock warning before recording this visit'; end if;
      if (p->'property'->>'address') is distinct from prop.address then insert into public.review_flags(company_id,user_id,reason,detail) values(member.company_id,p_user,'Property edit conflict','Submitted address: '||(p->'property'->>'address')); end if;
      -- A visit may be retained without GPS, but never retain an off-shift GPS fix.
      gps_time:=(gps->>'captured_at')::timestamptz;
      if gps_time is not null and not private.active_at(shift_id,gps_time) then gps:=null;end if;
      insert into public.visits values(visit_id,member.company_id,prop.id,p_user,shift_id,p->>'outcome',coalesce(p->>'notes',''),at_time,gps,nullif(p->>'follow_up_at','')::timestamptz);
      if p->>'outcome'='do_not_knock' then update public.properties set do_not_knock=true,version=version+1 where id=prop.id; end if;
      gps_time:=(gps->>'captured_at')::timestamptz;
      if gps is null or gps_time is null or abs(extract(epoch from at_time-gps_time))>120 or coalesce((gps->>'accuracy')::float8,999)>50 then
        insert into public.review_flags(company_id,visit_id,user_id,reason) values(member.company_id,visit_id,p_user,'GPS unverified');
      end if;
      if gps is not null then
        gps_distance:=extensions.st_distance(prop.location,extensions.st_setsrid(extensions.st_makepoint((gps->>'longitude')::float8,(gps->>'latitude')::float8),4326)::extensions.geography);
        if gps_distance>75 then insert into public.review_flags(company_id,visit_id,user_id,reason,detail) values(member.company_id,visit_id,p_user,'Away from property',round(gps_distance)::text||' metres from the pin'); end if;
      end if;
      if not exists(select 1 from public.territories t where t.company_id=member.company_id and not archived and p_user=any(t.assigned_user_ids) and extensions.st_covers(extensions.st_setsrid(extensions.st_geomfromgeojson(t.boundary),4326),prop.location::extensions.geometry)) then insert into public.review_flags(company_id,visit_id,user_id,reason) values(member.company_id,visit_id,p_user,'Outside assigned territory'); end if;
      lead:=nullif(p->'lead','null'::jsonb);
      if lead is not null then
        insert into public.leads(id,company_id,visit_id,property_id,user_id,name,phone,email,concerns,notes,preferred_window,created_at) values((lead->>'id')::uuid,member.company_id,visit_id,prop.id,p_user,lead->>'name',coalesce(lead->>'phone',''),coalesce(lead->>'email',''),coalesce(lead->>'concerns',''),coalesce(p->>'notes',''),coalesce(lead->>'preferred_window',''),at_time);
        insert into public.crm_sync_jobs(company_id,lead_id) values(member.company_id,(lead->>'id')::uuid);
        if p->>'outcome'='inspection_requested' then insert into public.inspection_requests(company_id,lead_id,user_id,preferred_window) values(member.company_id,(lead->>'id')::uuid,p_user,coalesce(lead->>'preferred_window','')); end if;
      elsif p->>'outcome' in ('interested','inspection_requested') then raise exception 'Homeowner details required for this outcome'; end if;
    end if;
  elsif command->>'kind'='correction' then
    if not exists(select 1 from public.shifts where id=shift_id and user_id=p_user and company_id=member.company_id) then raise exception 'Shift not found'; end if;
    insert into public.time_corrections(id,company_id,shift_id,user_id,requested_minutes,reason) values(c_id,member.company_id,shift_id,p_user,(p->>'requested_minutes')::int,p->>'reason');
  else raise exception 'Unknown command'; end if;
  insert into private.processed_commands(id,user_id,kind) values(c_id,p_user,command->>'kind');
  return jsonb_build_object('id',c_id,'status','accepted');
end $$;
revoke all on function public.apply_field_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_field_command(uuid,jsonb) to service_role;

create function public.claim_crm_jobs() returns setof public.crm_sync_jobs language plpgsql set search_path='' as $$ begin
  -- A stale lease might have completed a remote write. Never automatically recreate it.
  update public.crm_sync_jobs set status='review',last_error='Worker interrupted; reconcile remote record before retry',updated_at=now() where status='processing' and locked_at<now()-interval '5 minutes';
  update public.leads l set sync_status='review' from public.crm_sync_jobs j where j.lead_id=l.id and j.status='review';
  return query update public.crm_sync_jobs set status='processing',locked_at=now(),attempts=attempts+1,updated_at=now() where id in (select id from public.crm_sync_jobs where status='pending' order by updated_at for update skip locked limit 10) returning *;
end $$;
revoke all on function public.claim_crm_jobs() from public,anon,authenticated;
grant execute on function public.claim_crm_jobs() to service_role;
alter publication supabase_realtime add table public.shift_events,public.location_samples,public.visits,public.leads,public.review_flags,public.time_corrections,public.territories,public.memberships,public.properties;

create function public.apply_owner_action(p_owner uuid,input jsonb) returns jsonb language plpgsql set search_path='' as $$
declare m public.memberships; t jsonb:=input->'territory'; rid uuid; affected integer; s public.shifts; geom extensions.geometry; begin
 select * into m from public.memberships where user_id=p_owner and role='owner' and active;
 if m.user_id is null then raise exception 'Active owner account required';end if;
 rid:=coalesce(input->>'id',input->>'user_id',t->>'id')::uuid;
 if input->>'action'='member_active' then
  update public.memberships set active=(input->>'active')::boolean where user_id=rid and company_id=m.company_id and role='canvasser';get diagnostics affected=row_count;
  if not (input->>'active')::boolean then
   for s in select * from public.shifts where user_id=rid and company_id=m.company_id and status<>'ended' for update loop
    insert into public.shift_events values(gen_random_uuid(),m.company_id,s.id,rid,'clock_out',now());update public.shifts set status='ended',ended_at=now() where id=s.id;
   end loop;
  end if;
 elsif input->>'action'='territory_save' then
  geom:=extensions.st_setsrid(extensions.st_geomfromgeojson(t->'boundary'),4326);
  if extensions.st_geometrytype(geom)<>'ST_Polygon' or not extensions.st_isvalid(geom) or extensions.st_area(geom)=0 or not extensions.st_within(geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then raise exception 'Draw a valid territory polygon';end if;
  if length(trim(t->>'name'))=0 then raise exception 'Territory name required';end if;
  if exists(select 1 from jsonb_array_elements_text(t->'assigned_user_ids') a where not exists(select 1 from public.memberships where user_id=a::uuid and company_id=m.company_id and active and role='canvasser')) then raise exception 'Assignment must be an active company canvasser';end if;
  if exists(select 1 from public.territories where id=rid and company_id<>m.company_id) then raise exception 'Territory not found';end if;
  insert into public.territories values(rid,m.company_id,t->>'name',coalesce(t->>'color','#147b70'),t->'boundary',array(select jsonb_array_elements_text(t->'assigned_user_ids')::uuid),false)
  on conflict(id) do update set name=excluded.name,color=excluded.color,boundary=excluded.boundary,assigned_user_ids=excluded.assigned_user_ids;
  update public.properties set territory_id=rid where company_id=m.company_id and (territory_id is null or territory_id=rid) and extensions.st_covers(geom,location::extensions.geometry);
  update public.properties set territory_id=null where company_id=m.company_id and territory_id=rid and not extensions.st_covers(geom,location::extensions.geometry);
  affected:=1;
 elsif input->>'action'='resolve_flag' then update public.review_flags set resolved_at=now(),resolved_by=p_owner where id=rid and company_id=m.company_id;get diagnostics affected=row_count;
 elsif input->>'action'='clear_dnk' then update public.properties set do_not_knock=false,version=version+1 where id=rid and company_id=m.company_id;get diagnostics affected=row_count;
 elsif input->>'action'='correction_review' then update public.time_corrections set status=case when (input->>'approved')::boolean then 'approved' else 'rejected' end,reviewed_by=p_owner,reviewed_at=now() where id=rid and company_id=m.company_id and status='pending';get diagnostics affected=row_count;
 elsif input->>'action'='crm_retry' then
  update public.crm_sync_jobs set status='pending',last_error=null,updated_at=now() where lead_id=rid and company_id=m.company_id and status='failed';get diagnostics affected=row_count;
  if affected>0 then update public.leads set sync_status='pending' where id=rid;end if;
 elsif input->>'action'='crm_reconcile' then
  if length(trim(input->>'remote_contact_id'))=0 then raise exception 'Verified JobNimbus contact ID required';end if;
  update public.crm_sync_jobs set remote_contact_id=input->>'remote_contact_id',remote_task_id=nullif(input->>'remote_task_id',''),status='pending',step=case when nullif(input->>'remote_task_id','') is not null then 'complete' else 'task' end,last_error=null,updated_at=now() where lead_id=rid and company_id=m.company_id and status='review';get diagnostics affected=row_count;
  if affected>0 then update public.leads set remote_contact_id=input->>'remote_contact_id',sync_status='pending' where id=rid;end if;
 else raise exception 'Unknown owner action';end if;
 if affected=0 then raise exception 'Record not found or no longer actionable';end if;
 insert into public.audit_log(company_id,actor_id,action,record_id,detail) values(m.company_id,p_owner,input->>'action',rid,input-'territory');
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.apply_owner_action(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_owner_action(uuid,jsonb) to service_role;

grant usage on schema private,extensions to service_role;
create function public.prune_route_data() returns void language sql set search_path='' as $$ delete from public.location_samples where captured_at<now()-interval '90 days' $$;
revoke all on function public.prune_route_data() from public,anon,authenticated;
grant execute on function public.prune_route_data() to service_role;
-- Keep command IDs permanently: old retries must never recreate historical work.
create index territory_company on public.territories(company_id);
create index property_territory on public.properties(territory_id);
create index visits_user_time on public.visits(user_id,occurred_at desc);
create index leads_company on public.leads(company_id);
create index flags_company_open on public.review_flags(company_id) where resolved_at is null;
