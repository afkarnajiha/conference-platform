-- Server-only account mutations. Actor is established by the Edge Function's verified JWT.
create function public.manage_profile(p_actor uuid,p_action text,p_id uuid,p_name text default '',p_email text default '',p_role text default 'employee',p_active boolean default true,p_manage boolean default false,p_title text default '') returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target public.profiles;
begin
 -- Serialize role/status changes, protecting the final active administrator.
 lock table public.profiles in share row exclusive mode;
 select * into actor from public.profiles where id=p_actor and active;
 select * into target from public.profiles where id=p_id;
 if actor.id is null or not(actor.role='admin' or (actor.role='supervisor' and actor.manage_employees)) then raise exception 'FORBIDDEN'; end if;
 if actor.role<>'admin' and (p_role<>'employee' or p_manage or (target.id is not null and target.role<>'employee')) then raise exception 'FORBIDDEN'; end if;
 if p_action='delete' then
 if p_id=p_actor then raise exception 'FORBIDDEN'; end if;
 if target.id is null then raise exception 'NOT_FOUND'; end if;
 if target.role='admin' and target.active and not exists(select 1 from public.profiles where role='admin' and active and id<>p_id) then raise exception 'LAST_ADMIN'; end if;
 delete from public.profiles where id=p_id;
 elsif p_action in ('create','update') then
 if p_action='update' and target.id is null then raise exception 'NOT_FOUND'; end if;
 if p_action='create' and target.id is not null then raise exception 'ALREADY_EXISTS'; end if;
 if target.role='admin' and target.active and (p_role<>'admin' or not p_active) and not exists(select 1 from public.profiles where role='admin' and active and id<>p_id) then raise exception 'LAST_ADMIN'; end if;
 if p_action='create' then
 insert into public.profiles(id,full_name,email,role,active,manage_employees) values(p_id,trim(p_name),lower(p_email),p_role::public.app_role,p_active,p_manage and p_role='supervisor');
 else update public.profiles set full_name=trim(p_name),role=p_role::public.app_role,active=p_active,manage_employees=p_manage and p_role='supervisor' where id=p_id; end if;
 insert into public.employees(id,job_title) values(p_id,p_title) on conflict(id) do update set job_title=excluded.job_title;
 else raise exception 'INVALID_ACTION'; end if;
 insert into public.activity_logs(actor_id,action,entity_id,details) values(p_actor,'إدارة حساب: '||p_action,p_id,jsonb_build_object('role',p_role,'active',p_active));
end $$;
revoke execute on function public.manage_profile(uuid,text,uuid,text,text,text,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.manage_profile(uuid,text,uuid,text,text,text,boolean,boolean,text) to service_role;

-- The index entry must remain within PostgreSQL's btree limit, including UTF-8.
alter table public.exhibition_qr_codes add constraint qr_byte_limit check(octet_length(content)<=2000);
