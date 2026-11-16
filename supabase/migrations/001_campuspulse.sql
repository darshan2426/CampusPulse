-- CampusPulse core schema. Run in Supabase SQL Editor or via Supabase CLI.
create extension if not exists pgcrypto;
create type public.app_role as enum ('student','admin','staff');
create type public.complaint_status as enum ('Submitted','Under Review','Assigned','In Progress','Resolved','Closed','Reopened','Escalated');
create type public.priority_level as enum ('Low','Medium','High','Critical');
create table public.departments(id uuid primary key default gen_random_uuid(),department_name text not null unique,description text,created_at timestamptz not null default now());
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null,email text not null,phone text,role public.app_role not null default 'student',department_id uuid references departments(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.complaints(
 id uuid primary key default gen_random_uuid(),complaint_number text not null unique default ('CP-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 student_id uuid references profiles(id),guest_token_hash text,student_name text not null,register_number text,department text,mobile_number text,title text not null,description text not null,category text not null,building text,floor text,location text not null,severity public.priority_level not null,affected_people integer check(affected_people is null or affected_people>0),calculated_priority public.priority_level not null,priority public.priority_level not null,priority_reason text not null,status public.complaint_status not null default 'Submitted',assigned_staff_id uuid references profiles(id),submitted_at timestamptz not null default now(),due_at timestamptz,resolved_at timestamptz,closed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),priority_override_reason text,submission_key uuid
);
create unique index complaints_submission_key_uq on complaints(submission_key) where submission_key is not null;
create index complaints_student_idx on complaints(student_id,submitted_at desc);
create index complaints_staff_idx on complaints(assigned_staff_id,status);
create index complaints_status_priority_idx on complaints(status,priority,due_at);
create table public.complaint_attachments(id uuid primary key default gen_random_uuid(),complaint_id uuid not null references complaints(id) on delete cascade,file_path text not null unique,file_name text not null,uploaded_by uuid references profiles(id),created_at timestamptz not null default now());
create table public.assignments(id uuid primary key default gen_random_uuid(),complaint_id uuid not null references complaints(id) on delete cascade,staff_id uuid not null references profiles(id),assigned_by uuid references profiles(id),assigned_at timestamptz not null default now(),assignment_status text not null default 'Active',remarks text);
create table public.complaint_history(id uuid primary key default gen_random_uuid(),complaint_id uuid not null references complaints(id) on delete cascade,previous_status public.complaint_status,new_status public.complaint_status not null,updated_by uuid references profiles(id),remarks text,created_at timestamptz not null default now());
create index complaint_history_complaint_idx on complaint_history(complaint_id,created_at);
create table public.complaint_notes(id uuid primary key default gen_random_uuid(),complaint_id uuid not null references complaints(id) on delete cascade,staff_id uuid not null references profiles(id),note text not null,is_internal boolean not null default true,created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id) on delete cascade,title text not null,message text not null,complaint_id uuid references complaints(id) on delete cascade,is_read boolean not null default false,created_at timestamptz not null default now());
create table public.escalations(id uuid primary key default gen_random_uuid(),complaint_id uuid not null references complaints(id) on delete cascade,escalation_level public.priority_level not null,reason text not null,escalated_at timestamptz not null default now(),escalated_by uuid references profiles(id),created_at timestamptz not null default now(),unique(complaint_id,escalation_level));
create table public.feedback(id uuid primary key default gen_random_uuid(),complaint_id uuid not null unique references complaints(id) on delete cascade,student_id uuid references profiles(id),guest_token_hash text,rating int not null check(rating between 1 and 5),comments text,created_at timestamptz not null default now());
create table public.staff_profiles(profile_id uuid primary key references profiles(id) on delete cascade,staff_code text unique,department_id uuid references departments(id),specialization text,contact_number text,account_status text not null default 'Active',availability text not null default 'Available');
create table public.priority_targets(priority public.priority_level primary key,resolution_hours int not null check(resolution_hours>0),updated_at timestamptz not null default now());
insert into public.priority_targets(priority,resolution_hours) values('Critical',4),('High',12),('Medium',48),('Low',96) on conflict do nothing;

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select role='admin' from profiles where id=auth.uid()),false) $$;
-- Profile creation always student. Privilege escalation is only possible through trusted admin-side process.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name,email,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Student'),new.email,'student'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Secure RPC: guest secret is never returned by this function. Guest tracking requires the secret and a separate edge endpoint.
create or replace function public.submit_complaint(p_student_id uuid,p_student_name text,p_register_number text,p_department text,p_mobile_number text,p_title text,p_description text,p_category text,p_building text,p_floor text,p_location text,p_severity public.priority_level,p_affected_people integer,p_guest_token text,p_priority public.priority_level,p_priority_reason text)
returns public.complaints language plpgsql security definer set search_path=public as $$
declare c public.complaints;
begin
 if p_student_name is null or length(trim(p_student_name))=0 or p_title is null or length(trim(p_title))=0 or p_description is null or length(trim(p_description))=0 or p_location is null or length(trim(p_location))=0 then raise exception 'Required fields missing'; end if;
 if p_student_id is not null and p_student_id<>auth.uid() then raise exception 'Student identity mismatch'; end if;
 if p_student_id is null and (p_guest_token is null or length(p_guest_token)<40) then raise exception 'Guest token required'; end if;
 insert into complaints(student_id,guest_token_hash,student_name,register_number,department,mobile_number,title,description,category,building,floor,location,severity,affected_people,calculated_priority,priority,priority_reason,due_at)
 values(p_student_id,case when p_guest_token is null then null else encode(digest(p_guest_token,'sha256'),'hex') end,trim(p_student_name),nullif(trim(p_register_number),''),nullif(trim(p_department),''),nullif(trim(p_mobile_number),''),trim(p_title),trim(p_description),p_category,nullif(trim(p_building),''),nullif(trim(p_floor),''),trim(p_location),p_severity,p_affected_people,p_priority,p_priority,p_priority_reason,now()+make_interval(hours=>(select resolution_hours from priority_targets where priority=p_priority))) returning * into c;
 insert into complaint_history(complaint_id,previous_status,new_status,updated_by,remarks) values(c.id,null,'Submitted',p_student_id,'Complaint submitted');
 if p_student_id is not null then insert into notifications(user_id,title,message,complaint_id) values(p_student_id,'Complaint submitted',c.complaint_number||' has been received.',c.id); end if;
 return c;
end $$;
revoke all on function public.submit_complaint(uuid,text,text,text,text,text,text,text,text,text,text,public.priority_level,integer,text,public.priority_level,text) from public;
grant execute on function public.submit_complaint(uuid,text,text,text,text,text,text,text,text,text,text,public.priority_level,integer,text,public.priority_level,text) to anon,authenticated;

alter table profiles enable row level security; alter table departments enable row level security; alter table complaints enable row level security; alter table complaint_attachments enable row level security; alter table assignments enable row level security; alter table complaint_history enable row level security; alter table complaint_notes enable row level security; alter table notifications enable row level security; alter table escalations enable row level security; alter table feedback enable row level security; alter table staff_profiles enable row level security; alter table priority_targets enable row level security;
create policy "profile self or admin read" on profiles for select to authenticated using(id=auth.uid() or is_admin());
create policy "profile self update limited" on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and role=current_role());
create policy "departments authenticated read" on departments for select to authenticated using(true);
create policy "departments admin manage" on departments for all to authenticated using(is_admin()) with check(is_admin());
create policy "complaint student/admin/assigned staff read" on complaints for select to authenticated using(student_id=auth.uid() or is_admin() or assigned_staff_id=auth.uid());
create policy "admin complaint update" on complaints for update to authenticated using(is_admin()) with check(is_admin());
create policy "staff assigned complaint update" on complaints for update to authenticated using(assigned_staff_id=auth.uid() and current_role()='staff') with check(assigned_staff_id=auth.uid() and current_role()='staff');
create policy "attachments authorized complaint" on complaint_attachments for select to authenticated using(exists(select 1 from complaints c where c.id=complaint_id and (c.student_id=auth.uid() or c.assigned_staff_id=auth.uid() or is_admin())));
create policy "attachment metadata insert owner/admin" on complaint_attachments for insert to authenticated with check(uploaded_by=auth.uid() or is_admin());
create policy "assignment admin read manage" on assignments for all to authenticated using(is_admin() or staff_id=auth.uid()) with check(is_admin());
create policy "history authorized read" on complaint_history for select to authenticated using(exists(select 1 from complaints c where c.id=complaint_id and (c.student_id=auth.uid() or c.assigned_staff_id=auth.uid() or is_admin())));
create policy "history inserts by authorized actor" on complaint_history for insert to authenticated with check(updated_by=auth.uid() and exists(select 1 from complaints c where c.id=complaint_id and (c.student_id=auth.uid() or c.assigned_staff_id=auth.uid() or is_admin())));
create policy "notes staff/admin access" on complaint_notes for all to authenticated using(is_admin() or (staff_id=auth.uid() and exists(select 1 from complaints c where c.id=complaint_id and c.assigned_staff_id=auth.uid()))) with check(is_admin() or staff_id=auth.uid());
create policy "notifications own/admin" on notifications for all to authenticated using(user_id=auth.uid() or is_admin()) with check(user_id=auth.uid() or is_admin());
create policy "escalations admin/assigned read" on escalations for select to authenticated using(is_admin() or exists(select 1 from complaints c where c.id=complaint_id and c.assigned_staff_id=auth.uid()));
create policy "feedback authorized read" on feedback for select to authenticated using(student_id=auth.uid() or is_admin());
create policy "feedback student create" on feedback for insert to authenticated with check(student_id=auth.uid() and exists(select 1 from complaints c where c.id=complaint_id and c.student_id=auth.uid() and c.status in ('Resolved','Closed')));
create policy "staff profile admin or staff self" on staff_profiles for select to authenticated using(is_admin() or profile_id=auth.uid());
create policy "staff profile admin manage" on staff_profiles for all to authenticated using(is_admin()) with check(is_admin());
create policy "targets authenticated read admin manage" on priority_targets for select to authenticated using(true);
create policy "targets admin manage" on priority_targets for all to authenticated using(is_admin()) with check(is_admin());

-- Private evidence bucket; path convention complaint UUID / generated file name.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('complaint-evidence','complaint-evidence',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy "evidence read only authorized complaint" on storage.objects for select to authenticated using(bucket_id='complaint-evidence' and exists(select 1 from complaint_attachments a join complaints c on c.id=a.complaint_id where a.file_path=name and (c.student_id=auth.uid() or c.assigned_staff_id=auth.uid() or public.is_admin())));
create policy "evidence upload signed-in complaint participant" on storage.objects for insert to authenticated with check(bucket_id='complaint-evidence' and (public.is_admin() or (split_part(name,'/',1)::uuid in (select id from complaints where student_id=auth.uid() or assigned_staff_id=auth.uid()))));
