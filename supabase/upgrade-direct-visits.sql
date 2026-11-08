-- Apply to the existing project AFTER the two original migrations. No tables or visit data are deleted.
begin;
create or replace function public.register_exhibition(p_conference uuid,p_name text,p_organization text,p_qr text,p_existing uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$ declare v_id uuid; begin
 if public.current_role() is null then raise exception 'FORBIDDEN'; end if;

 if p_existing is null then
 insert into public.exhibitions(conference_id,name,organization,needs_review) values(p_conference,trim(p_name),trim(p_organization),false) returning id into v_id;
 else select id into v_id from public.exhibitions where id=p_existing and conference_id=p_conference for update;
 if v_id is null then raise exception 'NOT_FOUND'; end if; end if;
 insert into public.exhibition_qr_codes(conference_id,exhibition_id,content) values(p_conference,v_id,trim(p_qr));
 insert into public.activity_logs(actor_id,action,entity_id) values(auth.uid(),'تسجيل رمز معرض',v_id); return v_id;
end $$;
create or replace function public.edit_exhibition(p_id uuid,p_name text,p_organization text,p_reviewed boolean) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
 update public.exhibitions set name=trim(p_name),organization=trim(p_organization),needs_review=false where id=p_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 insert into public.activity_logs(actor_id,action,entity_id) values(auth.uid(),'تعديل المعرض',p_id);
end $$;
create or replace function public.save_visit_direct(p_exhibition uuid,p_round integer,p_data jsonb,p_files jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.exhibitions; v_id uuid; f jsonb; prefix text;
begin
 if public.current_role() is null then raise exception 'FORBIDDEN'; end if;
 select * into e from public.exhibitions where id=p_exhibition for update;
 if e.id is null then raise exception 'NOT_FOUND'; end if;
 if p_round is distinct from e.visit_round then raise exception 'ROUND_CHANGED'; end if;
 if exists(select 1 from public.visits where exhibition_id=e.id and visit_round=e.visit_round) then raise exception 'ALREADY_VISITED'; end if;
 if p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>10 then raise exception 'INVALID_FILES'; end if;
 insert into public.visits(exhibition_id,employee_id,visit_round,contact_name,job_title,phone,email,business_activity,services,products,collaboration,rating,interest,priority,notes)
 values(e.id,auth.uid(),e.visit_round,p_data->>'contact_name',coalesce(p_data->>'job_title',''),p_data->>'phone',coalesce(p_data->>'email',''),p_data->>'business_activity',coalesce(p_data->>'services',''),coalesce(p_data->>'products',''),coalesce(p_data->>'collaboration',''),(p_data->>'rating')::integer,p_data->>'interest',p_data->>'priority',coalesce(p_data->>'notes','')) returning id into v_id;
 if length(trim(coalesce(p_data->>'opportunity','')))>0 then
 insert into public.commercial_opportunities(visit_id,description,importance) values(v_id,p_data->>'opportunity',p_data->>'importance'); end if;
 prefix := auth.uid()::text || '/' || e.id::text || '/' || p_round::text || '/';
 for f in select value from jsonb_array_elements(p_files) loop
 if left(f->>'path',length(prefix))<>prefix or not exists(select 1 from storage.objects where bucket_id='visit-files' and name=f->>'path' and (metadata->>'size')::bigint=(f->>'size')::bigint and metadata->>'mimetype'=f->>'mime_type') then raise exception 'INVALID_FILES'; end if;
 insert into public.visit_attachments(visit_id,path,name,mime_type,size) values(v_id,f->>'path',f->>'name',f->>'mime_type',(f->>'size')::integer);
 end loop;

 insert into public.activity_logs(actor_id,action,entity_id) values(auth.uid(),'حفظ الزيارة',v_id);
 return v_id;
end $$;
create or replace function public.reset_exhibition(p_exhibition uuid,p_additional boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$ declare e public.exhibitions; begin
 if public.current_role() is distinct from 'admin' then raise exception 'FORBIDDEN'; end if;
 if length(trim(p_reason))<5 then raise exception 'REASON_REQUIRED'; end if;
 select * into e from public.exhibitions where id=p_exhibition for update;
 if e.id is null then raise exception 'NOT_FOUND'; end if;

 if p_additional and exists(select 1 from public.visits where exhibition_id=e.id and visit_round=e.visit_round) then
 update public.exhibitions set visit_round=visit_round+1 where id=e.id;
 end if;
 insert into public.activity_logs(actor_id,action,entity_id,details) values(auth.uid(),'إعادة تعيين المعرض',e.id,jsonb_build_object('additional',p_additional,'reason',p_reason));
end $$;
create or replace function public.can_upload_file(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_role() is not null and split_part(p_name,'/',1)=auth.uid()::text
 and exists(select 1 from public.exhibitions e where e.id::text=split_part(p_name,'/',2) and e.visit_round::text=split_part(p_name,'/',3)
 and length(split_part(p_name,'/',4))>0 and split_part(p_name,'/',5)=''
 and not exists(select 1 from public.visits v where v.exhibition_id=e.id and v.visit_round=e.visit_round))
$$;
update public.exhibitions set needs_review=false where needs_review;
-- Disable the legacy reservation flow, including in already-open old clients.
revoke execute on function public.reserve_exhibition(uuid), public.release_reservation(uuid,uuid), public.save_visit(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke execute on function public.save_visit_direct(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.save_visit_direct(uuid,integer,jsonb,jsonb) to authenticated,service_role;
notify pgrst, 'reload schema';
commit;
