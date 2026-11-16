-- CampusPulse Supabase smoke test checklist (run in a staging project only).
-- These assertions verify schema/features; run auth/RLS checks as separate test users.

do $$
begin
 if to_regclass('public.complaints') is null then raise exception 'complaints table missing'; end if;
 if to_regclass('public.complaint_history') is null then raise exception 'complaint_history table missing'; end if;
 if to_regclass('public.complaint_notes') is null then raise exception 'complaint_notes table missing'; end if;
 if to_regclass('public.notifications') is null then raise exception 'notifications table missing'; end if;
 if to_regclass('public.staff_profiles') is null then raise exception 'staff_profiles table missing'; end if;
 if not exists(select 1 from pg_proc where proname='track_guest_complaint') then raise exception 'guest tracking RPC missing'; end if;
 if not exists(select 1 from pg_proc where proname='guest_complaint_timeline') then raise exception 'guest timeline RPC missing'; end if;
 if not exists(select 1 from pg_trigger where tgname='complaints_status_history') then raise exception 'status audit trigger missing'; end if;
 if not exists(select 1 from pg_trigger where tgname='complaints_notifications') then raise exception 'notification trigger missing'; end if;
 if not exists(select 1 from storage.buckets where id='complaint-evidence' and public=false) then raise exception 'evidence bucket missing or public'; end if;
end $$;

-- Manual end-to-end RLS verification:
-- 1) Student A submits a complaint; verify select returns own complaint only.
-- 2) Student B cannot select Student A complaint or its attachment metadata.
-- 3) Staff assigned to complaint can select/update complaint, see private notes and evidence.
-- 4) Unassigned staff cannot select complaint or read internal notes/evidence.
-- 5) Admin can view/update complaints, maintain staff profiles and assign staff.
-- 6) Guest calls track_guest_complaint with correct reference + token -> row JSON.
--    Wrong token / wrong reference / short token -> NULL; RPC must not leak token hash.
-- 7) Status change writes exactly one history entry and sends notifications.
-- 8) Anonymous evidence storage insert/read is denied; authenticated complaint participant
--    can upload/read authorized evidence. Test in Supabase Storage API with JWTs.
-- 9) Submit twice after network retry: ensure submission_key idempotency is used if enabled.
