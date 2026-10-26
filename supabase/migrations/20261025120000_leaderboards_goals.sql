-- Leaderboards and company goals.
-- Reps may see team rankings, but only as counts: no other rep's locations, routes or homeowner contacts.

create table public.company_goals (
 company_id uuid primary key references public.companies(id),
 daily_doors integer not null default 40 check(daily_doors between 0 and 1000),
 daily_leads integer not null default 4 check(daily_leads between 0 and 200),
 daily_inspections integer not null default 2 check(daily_inspections between 0 and 200),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.company_goals enable row level security;
create policy goals_read on public.company_goals for select to authenticated using(company_id=(select private.my_company()));
revoke all on public.company_goals from anon, authenticated;
grant select on public.company_goals to authenticated;
grant all on public.company_goals to service_role;

-- Day and week boundaries follow the company timezone. Weeks start on Monday.
create function public.leaderboard(p_period text default 'day')
returns table(user_id uuid, name text, doors bigint, leads bigint, inspections bigint)
language plpgsql stable security definer set search_path='' as $$
declare company uuid:=private.my_company(); tz text; local_now timestamp; start_at timestamptz; begin
 if company is null then raise exception 'Active company membership required';end if;
 if p_period not in ('day','week') then raise exception 'Period must be day or week';end if;
 select timezone into tz from public.companies where id=company;
 local_now:=now() at time zone tz;
 start_at:=(date_trunc(case when p_period='day' then 'day' else 'week' end,local_now)) at time zone tz;
 return query
  select m.user_id,m.name,
   (select count(*) from public.visits v where v.user_id=m.user_id and v.company_id=company and v.occurred_at>=start_at),
   (select count(*) from public.leads l join public.visits v on v.id=l.visit_id where l.user_id=m.user_id and l.company_id=company and v.occurred_at>=start_at),
   (select count(*) from public.visits v where v.user_id=m.user_id and v.company_id=company and v.outcome='inspection_requested' and v.occurred_at>=start_at)
  from public.memberships m
  where m.company_id=company and m.role='canvasser' and m.active
  order by 3 desc,4 desc,2;
end $$;
revoke all on function public.leaderboard(text) from public,anon;
grant execute on function public.leaderboard(text) to authenticated;

create function public.save_company_goals(p_owner uuid,input jsonb) returns jsonb language plpgsql set search_path='' as $$
declare m public.memberships; begin
 select * into m from public.memberships where user_id=p_owner and role='owner' and active;
 if m.user_id is null then raise exception 'Active owner account required';end if;
 insert into public.company_goals(company_id,daily_doors,daily_leads,daily_inspections,updated_by,updated_at)
 values(m.company_id,(input->>'daily_doors')::integer,(input->>'daily_leads')::integer,(input->>'daily_inspections')::integer,p_owner,now())
 on conflict(company_id) do update set daily_doors=excluded.daily_doors,daily_leads=excluded.daily_leads,daily_inspections=excluded.daily_inspections,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into public.audit_log(company_id,actor_id,action,detail) values(m.company_id,p_owner,'goals_save',input);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.save_company_goals(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_company_goals(uuid,jsonb) to service_role;
