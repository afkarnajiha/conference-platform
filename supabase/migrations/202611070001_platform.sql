-- Apply once to a fresh Supabase project. All timestamps are server generated.
create type public.app_role as enum ('admin','supervisor','employee');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 full_name text not null check(length(trim(full_name)) between 2 and 150),
 email text not null unique, role public.app_role not null default 'employee',
 active boolean not null default true, manage_employees boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.employees (id uuid primary key references public.profiles(id) on delete cascade, job_title text not null default '');
create table public.conferences (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 200),
 location text not null default '', starts_on date not null, ends_on date not null,
 created_at timestamptz not null default now(), check(ends_on>=starts_on)
);
create table public.conference_assignments (
 id uuid primary key default gen_random_uuid(), conference_id uuid not null references public.conferences(id),
 employee_id uuid not null references public.profiles(id), participation_date date not null,
 unique(conference_id,employee_id,participation_date)
);
create table public.exhibitions (
 id uuid primary key default gen_random_uuid(), conference_id uuid not null references public.conferences(id),
 name text not null check(length(trim(name)) between 2 and 200), organization text not null check(length(trim(organization)) between 2 and 200),
 needs_review boolean not null default false, visit_round integer not null default 1 check(visit_round>0),
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now()
);
create table public.exhibition_qr_codes (
 id uuid primary key default gen_random_uuid(), conference_id uuid not null references public.conferences(id),
 exhibition_id uuid not null references public.exhibitions(id), content text not null check(length(content) between 1 and 4000),
 unique(conference_id,content)
);
create table public.visit_reservations (
 exhibition_id uuid primary key references public.exhibitions(id), employee_id uuid not null references public.profiles(id),
 token uuid not null default gen_random_uuid(), expires_at timestamptz not null default (now()+interval '20 minutes')
);
create table public.visits (
 id uuid primary key default gen_random_uuid(), exhibition_id uuid not null references public.exhibitions(id),
 employee_id uuid not null references public.profiles(id), visit_round integer not null,
 contact_name text not null, job_title text not null default '', phone text not null, email text not null default '',
 business_activity text not null, services text not null default '', products text not null default '',
 collaboration text not null default '', rating integer not null check(rating between 1 and 5),
 interest text not null check(interest in ('مرتفع','متوسط','منخفض')),
 priority text not null check(priority in ('مرتفعة','متوسطة','منخفضة')), notes text not null default '',
 visited_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(exhibition_id,visit_round),
 check(length(trim(contact_name)) between 2 and 200), check(phone ~ '^\+?[0-9 ()-]{7,20}$'),
 check(email='' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 check(length(trim(business_activity)) between 2 and 4000)
);
create table public.commercial_opportunities (
 id uuid primary key default gen_random_uuid(), visit_id uuid not null unique references public.visits(id),
 description text not null check(length(trim(description)) between 3 and 4000),
 importance text not null check(importance in ('مرتفعة','متوسطة','منخفضة')),
 follow_up_status text not null default 'جديدة' check(follow_up_status in ('جديدة','قيد المتابعة','مكتملة','مغلقة')),
 created_at timestamptz not null default now()
);
create table public.visit_attachments (
 id uuid primary key default gen_random_uuid(), visit_id uuid not null references public.visits(id),
 path text not null unique, name text not null, mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 size integer not null check(size between 1 and 10485760), created_at timestamptz not null default now()
);
create table public.activity_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), action text not null,
 entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index on public.exhibitions(conference_id);
create index on public.exhibition_qr_codes(exhibition_id);
create index on public.visits(employee_id,visited_at);
create index on public.visits(visited_at);
create index on public.conference_assignments(employee_id);
create index on public.visit_reservations(employee_id,expires_at);
create index on public.visit_attachments(visit_id);
create index on public.activity_logs(created_at);

create function public.current_role() returns text language sql stable security definer set search_path='' as $$
 select role::text from public.profiles where id=auth.uid() and active=true
$$;
create function public.is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.current_role() in ('admin','supervisor'),false)
$$;
create function public.can_manage_employees() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and (role='admin' or (role='supervisor' and manage_employees)))
$$;

do $$ declare t text; begin
 foreach t in array array['profiles','employees','conferences','conference_assignments','exhibitions','exhibition_qr_codes','visits','visit_reservations','visit_attachments','commercial_opportunities','activity_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t <> 'activity_logs' then
 execute format('create policy read_active on public.%I for select to authenticated using (public.current_role() is not null)',t);
 end if;
 end loop;
end $$;
create policy read_logs on public.activity_logs for select to authenticated using(public.is_staff());
-- Only service role may write account records. No user receives direct write grants.
grant all on all tables in schema public to service_role;

create function public.save_conference(p_id uuid,p_name text,p_location text,p_start date,p_end date) returns uuid
language plpgsql security definer set search_path='' as $$ declare v_id uuid; begin
 if public.current_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
 if p_id is null then
 insert into public.conferences(name,location,starts_on,ends_on) values(trim(p_name),p_location,p_start,p_end) returning id into v_id;
 else update public.conferences set name=trim(p_name),location=p_location,starts_on=p_start,ends_on=p_end where id=p_id returning id into v_id;
 if v_id is null then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.conference_assignments where conference_id=v_id and participation_date not between p_start and p_end) then raise exception 'ASSIGNMENTS_OUTSIDE_DATES'; end if;
 end if;
 insert into public.activity_logs(actor_id,action,entity_id) values(auth.uid(),'حفظ المؤتمر',v_id); return v_id;
end $$;

create function public.assign_employee(p_conference uuid,p_employee uuid,p_dates date[]) returns void
language plpgsql security definer set search_path='' as $$ declare c public.conferences; begin
 if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
 select * into c from public.conferences where id=p_conference for update;
 if c.id is null or not exists(select 1 from public.profiles where id=p_employee and active) then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from unnest(p_dates) d where d not between c.starts_on and c.ends_on or extract(dow from d) not between 0 and 3) then raise exception 'INVALID_DAY'; end if;
 delete from public.conference_assignments where conference_id=p_conference and employee_id=p_employee;
 insert into public.conference_assignments(conference_id,employee_id,participation_date) select p_conference,p_employee,d from (select distinct unnest(p_dates) d) s;
 insert into public.activity_logs(actor_id,action,entity_id,details) values(auth.uid(),'تعديل توزيع الموظف',p_employee,jsonb_build_object('conference',p_conference,'dates',p_dates));
end $$;

create function public.register_exhibition(p_conference uuid,p_name text,p_organization text,p_qr text,p_existing uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$ declare v_id uuid; begin
 if public.current_role() is null then raise exception 'FORBIDDEN'; end if;
 if p_existing is not null and not public.is_staff() then raise exception 'LINK_REQUIRES_REVIEW'; end if;
 if p_existing is null then
 insert into public.exhibitions(conference_id,name,organization,needs_review) values(p_conference,trim(p_name),trim(p_organization),not public.is_staff()) returning id into v_id;
 else select id into v_id from public.exhibitions where id=p_existing and conference_id=p_conference for update;
 if v_id is null then raise exception 'NOT_FOUND'; end if; end if;
 insert into public.exhibition_qr_codes(conference_id,exhibition_id,content) values(p_conference,v_id,trim(p_qr));
 insert into public.activity_logs(actor_id,action,entity_id) values(auth.uid(),'تسجيل رمز معرض',v_id); return v_id;
end $$;

create function public.edit_exhibition(p_id uuid,p_name text,p_organization text,p_reviewed boolean) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
 update public.exhibitions set name=trim(p_name),organization=trim(p_organization),needs_review=not p_reviewed where id=p_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 insert into public.activity_logs(actor_id,action,entity_id) values(auth.uid(),'تعديل المعرض',p_id);
end $$;

create function public.reserve_exhibition(p_exhibition uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.exhibitions; v public.visits; r public.visit_reservations; n text;
begin
 if public.current_role() is null then raise exception 'FORBIDDEN'; end if;
 select * into e from public.exhibitions where id=p_exhibition for update;
 if e.id is null then raise exception 'NOT_FOUND'; end if;
 if e.needs_review then return jsonb_build_object('status','review'); end if;
 select * into v from public.visits where exhibition_id=e.id and visit_round=e.visit_round;
 if v.id is not null then
 select full_name into n from public.profiles where id=v.employee_id;
 return jsonb_build_object('status','completed','employee',n,'visited_at',v.visited_at,'visit_id',v.id);
 end if;
 select * into r from public.visit_reservations where exhibition_id=e.id;
 if r.expires_at>clock_timestamp() then
 if r.employee_id<>auth.uid() then
 select full_name into n from public.profiles where id=r.employee_id;
 return jsonb_build_object('status','reserved','employee',n,'expires_at',r.expires_at);
 end if;
 else
 insert into public.visit_reservations(exhibition_id,employee_id,token,expires_at) values(e.id,auth.uid(),gen_random_uuid(),clock_timestamp()+interval '20 minutes')
 on conflict(exhibition_id) do update set employee_id=excluded.employee_id,token=excluded.token,expires_at=excluded.expires_at returning * into r;
 end if;
 return jsonb_build_object('status','accepted','token',r.token,'expires_at',r.expires_at);
end $$;

create function public.release_reservation(p_exhibition uuid,p_token uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 if public.current_role() is null then raise exception 'FORBIDDEN'; end if;
 perform 1 from public.exhibitions where id=p_exhibition for update;
 delete from public.visit_reservations where exhibition_id=p_exhibition and token=p_token and employee_id=auth.uid();
end $$;

create function public.reset_exhibition(p_exhibition uuid,p_additional boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$ declare e public.exhibitions; begin
 if public.current_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
 if length(trim(p_reason))<5 then raise exception 'REASON_REQUIRED'; end if;
 select * into e from public.exhibitions where id=p_exhibition for update;
 if e.id is null then raise exception 'NOT_FOUND'; end if;
 delete from public.visit_reservations where exhibition_id=e.id;
 if p_additional and exists(select 1 from public.visits where exhibition_id=e.id and visit_round=e.visit_round) then
 update public.exhibitions set visit_round=visit_round+1 where id=e.id;
 end if;
 insert into public.activity_logs(actor_id,action,entity_id,details) values(auth.uid(),'إعادة تعيين المعرض',e.id,jsonb_build_object('additional',p_additional,'reason',p_reason));
end $$;

create function public.save_visit(p_exhibition uuid,p_token uuid,p_data jsonb,p_files jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.exhibitions; r public.visit_reservations; v_id uuid; f jsonb; prefix text;
begin
 if public.current_role() is null then raise exception 'FORBIDDEN'; end if;
 select * into e from public.exhibitions where id=p_exhibition for update;
 select * into r from public.visit_reservations where exhibition_id=p_exhibition;
 if e.id is null or e.needs_review or r.employee_id is distinct from auth.uid() or r.token is distinct from p_token or r.expires_at<=clock_timestamp() then raise exception 'RESERVATION_EXPIRED'; end if;
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>10 then raise exception 'INVALID_FILES'; end if;
 insert into public.visits(exhibition_id,employee_id,visit_round,contact_name,job_title,phone,email,business_activity,services,products,collaboration,rating,interest,priority,notes)
 values(e.id,auth.uid(),e.visit_round,p_data->>'contact_name',coalesce(p_data->>'job_title',''),p_data->>'phone',coalesce(p_data->>'email',''),p_data->>'business_activity',coalesce(p_data->>'services',''),coalesce(p_data->>'products',''),coalesce(p_data->>'collaboration',''),(p_data->>'rating')::integer,p_data->>'interest',p_data->>'priority',coalesce(p_data->>'notes','')) returning id into v_id;
 if length(trim(coalesce(p_data->>'opportunity','')))>0 then
 insert into public.commercial_opportunities(visit_id,description,importance) values(v_id,p_data->>'opportunity',p_data->>'importance'); end if;
 prefix := auth.uid()::text || '/' || e.id::text || '/' || p_token::text || '/';
 for f in select value from jsonb_array_elements(p_files) loop
 if left(f->>'path',length(prefix))<>prefix or not exists(select 1 from storage.objects where bucket_id='visit-files' and name=f->>'path' and (metadata->>'size')::bigint=(f->>'size')::bigint and metadata->>'mimetype'=f->>'mime_type') then raise exception 'INVALID_FILES'; end if;
 insert into public.visit_attachments(visit_id,path,name,mime_type,size) values(v_id,f->>'path',f->>'name',f->>'mime_type',(f->>'size')::integer);
 end loop;
 delete from public.visit_reservations where exhibition_id=e.id;
 insert into public.activity_logs(actor_id,action,entity_id) values(auth.uid(),'حفظ الزيارة',v_id);
 return v_id;
end $$;

create function public.update_visit(p_visit uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$ begin
 if public.current_role() is null then raise exception 'FORBIDDEN'; end if;
 perform 1 from public.visits where id=p_visit and (employee_id=auth.uid() or public.is_staff()) for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 update public.visits set contact_name=p_data->>'contact_name',job_title=coalesce(p_data->>'job_title',''),phone=p_data->>'phone',email=coalesce(p_data->>'email',''),business_activity=p_data->>'business_activity',services=coalesce(p_data->>'services',''),products=coalesce(p_data->>'products',''),collaboration=coalesce(p_data->>'collaboration',''),rating=(p_data->>'rating')::integer,interest=p_data->>'interest',priority=p_data->>'priority',notes=coalesce(p_data->>'notes',''),updated_at=clock_timestamp() where id=p_visit;
 if length(trim(coalesce(p_data->>'opportunity','')))>0 then
 insert into public.commercial_opportunities(visit_id,description,importance) values(p_visit,p_data->>'opportunity',p_data->>'importance') on conflict(visit_id) do update set description=excluded.description,importance=excluded.importance;
 else delete from public.commercial_opportunities where visit_id=p_visit; end if;
 insert into public.activity_logs(actor_id,action,entity_id) values(auth.uid(),'تعديل الزيارة',p_visit);
end $$;

create function public.follow_up(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
 update public.commercial_opportunities set follow_up_status=p_status where id=p_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 insert into public.activity_logs(actor_id,action,entity_id,details) values(auth.uid(),'متابعة فرصة',p_id,jsonb_build_object('status',p_status));
end $$;

-- Private bucket, write only while owning the live reservation.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('visit-files','visit-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);
create function public.can_upload_file(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_role() is not null and exists(select 1 from public.visit_reservations r where r.employee_id=auth.uid() and r.expires_at>now() and p_name like auth.uid()::text||'/'||r.exhibition_id::text||'/'||r.token::text||'/%')
$$;
create policy upload_reserved on storage.objects for insert to authenticated with check(bucket_id='visit-files' and public.can_upload_file(name));
create policy read_visit_files on storage.objects for select to authenticated using(bucket_id='visit-files' and public.current_role() is not null and (exists(select 1 from public.visit_attachments a where a.path=storage.objects.name) or split_part(name,'/',1)=auth.uid()::text));
create policy remove_unattached on storage.objects for delete to authenticated using(bucket_id='visit-files' and public.current_role() is not null and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from public.visit_attachments a where a.path=storage.objects.name));

-- No anonymous access to functions; no inherited PUBLIC execution.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Realtime is optional; polling also keeps the interface current.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['profiles','conferences','conference_assignments','exhibitions','exhibition_qr_codes','visits','visit_reservations','commercial_opportunities','visit_attachments'] loop
 execute format('alter publication supabase_realtime add table public.%I',t);
 end loop; end if;
end $$;
