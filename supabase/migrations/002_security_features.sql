-- CampusPulse hardening and feature migration 002
-- Apply after 001_campuspulse.sql in Supabase SQL editor or via supabase db push.

-- Staff profile management policy: administrators can maintain profiles; staff may read own profile.
alter table public.staff_profiles enable row level security;
drop policy if exists staff_profiles_admin_all on public.staff_profiles;
create policy staff_profiles_admin_all on public.staff_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists staff_profiles_self_read on public.staff_profiles;
create policy staff_profiles_self_read on public.staff_profiles for select to authenticated using (profile_id=auth.uid());

-- Admin profile updates for staff management; self-service role changes remain blocked by 001.
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Private internal notes: staff assigned to complaint and administrators can access.
alter table public.complaint_notes enable row level security;
drop policy if exists notes_staff_admin on public.complaint_notes;
drop policy if exists "notes staff/admin access" on public.complaint_notes;
create policy notes_staff_admin on public.complaint_notes for all to authenticated
using (public.is_admin() or (staff_id=auth.uid() and exists(select 1 from complaints c where c.id=complaint_id and c.assigned_staff_id=auth.uid())))
with check (public.is_admin() or (staff_id=auth.uid() and exists(select 1 from complaints c where c.id=complaint_id and c.assigned_staff_id=auth.uid())));

-- Complaint events: create a reliable audit row for status changes, including updates by admins.
create or replace function public.record_complaint_status_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from new.status then
  insert into public.complaint_history(complaint_id,previous_status,new_status,updated_by,remarks)
  values(new.id,old.status,new.status,auth.uid(),coalesce(new.priority_override_reason,'Status changed'));
 end if;
 return new;
end $$;
drop trigger if exists complaints_status_history on public.complaints;
create trigger complaints_status_history after update on public.complaints
for each row execute function public.record_complaint_status_change();

-- Notification generation is server-side and transactional.
create or replace function public.generate_complaint_notifications() returns trigger
language plpgsql security definer set search_path=public as $$
declare admin_user record;
begin
 if tg_op='INSERT' then
  if new.student_id is not null then
   insert into public.notifications(user_id,title,message,complaint_id)
   values(new.student_id,'Complaint received',new.complaint_number||' has been submitted successfully.',new.id);
  end if;
  for admin_user in select id from public.profiles where role='admin' loop
   insert into public.notifications(user_id,title,message,complaint_id)
   values(admin_user.id,'New campus complaint',new.complaint_number||' · '||new.title,new.id);
  end loop;
  if new.assigned_staff_id is not null then
   insert into public.notifications(user_id,title,message,complaint_id)
   values(new.assigned_staff_id,'New maintenance assignment',new.complaint_number||' · '||new.title,new.id);
  end if;
 else
  if old.status is distinct from new.status and new.student_id is not null then
   insert into public.notifications(user_id,title,message,complaint_id)
   values(new.student_id,'Complaint status updated',new.complaint_number||' is now '||new.status::text||'.',new.id);
  end if;
  if old.assigned_staff_id is distinct from new.assigned_staff_id and new.assigned_staff_id is not null then
   insert into public.notifications(user_id,title,message,complaint_id)
   values(new.assigned_staff_id,'Maintenance assignment updated',new.complaint_number||' · '||new.title,new.id);
  end if;
 end if;
 return new;
end $$;
drop trigger if exists complaints_notifications on public.complaints;
create trigger complaints_notifications after insert or update of status,assigned_staff_id on public.complaints
for each row execute function public.generate_complaint_notifications();

-- Guest lookup requires both the public reference and a high-entropy secret.
-- The secret is compared only as a SHA-256 hash; no token/hash is returned.
create or replace function public.track_guest_complaint(p_complaint_number text,p_guest_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.complaints;
begin
 if p_guest_token is null or length(p_guest_token)<32 then return null; end if;
 select * into c from public.complaints
 where complaint_number=upper(trim(p_complaint_number))
 and student_id is null
 and guest_token_hash=encode(digest(p_guest_token,'sha256'),'hex');
 if not found then return null; end if;
 return jsonb_build_object('id',c.id,'complaint_number',c.complaint_number,'title',c.title,
 'description',c.description,'category',c.category,'location',c.location,'priority',c.priority,
 'status',c.status,'submitted_at',c.submitted_at,'public_update',c.priority_reason);
end $$;
revoke all on function public.track_guest_complaint(text,text) from public;
grant execute on function public.track_guest_complaint(text,text) to anon,authenticated;

create or replace function public.guest_complaint_timeline(p_complaint_number text,p_guest_token text)
returns table(id uuid,new_status text,remarks text,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare complaint_id_value uuid;
begin
 if p_guest_token is null or length(p_guest_token)<32 then return; end if;
 select c.id into complaint_id_value from public.complaints c
 where c.complaint_number=upper(trim(p_complaint_number)) and c.student_id is null
 and c.guest_token_hash=encode(digest(p_guest_token,'sha256'),'hex');
 if complaint_id_value is null then return; end if;
 return query select h.id,h.new_status::text,h.remarks,h.created_at
 from public.complaint_history h where h.complaint_id=complaint_id_value order by h.created_at;
end $$;
revoke all on function public.guest_complaint_timeline(text,text) from public;
grant execute on function public.guest_complaint_timeline(text,text) to anon,authenticated;

-- Useful indexes for timeline and workload query paths.
create index if not exists complaint_notes_complaint_idx on public.complaint_notes(complaint_id,created_at desc);
create index if not exists assignments_staff_status_idx on public.assignments(staff_id,assignment_status);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
