-- CampusPulse staff invitation registration.
-- Apply after 001_campuspulse.sql and 002_security_features.sql.

-- Restrict new self-service Auth accounts (including OAuth-created accounts) to the
-- two approved college domains. Existing administrator accounts are unaffected.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if lower(coalesce(new.email, '')) !~ '^[^@]+@(skct\.edu\.in|skcet\.ac\.in)$' then
    raise exception 'Use your official college email ending in @skct.edu.in or @skcet.ac.in';
  end if;
  insert into public.profiles(id,full_name,email,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Student'),new.email,'student');
  return new;
end;
$$;

alter table public.staff_profiles
  add column if not exists designation text;

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  staff_code text not null,
  department_id uuid references public.departments(id) on delete set null,
  designation text,
  code_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint staff_invitations_email_domain_chk check (
    lower(email) ~ '^[^@]+@(skct\.edu\.in|skcet\.ac\.in)$'
  )
);

create index if not exists staff_invitations_email_created_idx
  on public.staff_invitations(lower(email), created_at desc);
create index if not exists staff_invitations_pending_idx
  on public.staff_invitations(expires_at)
  where redeemed_at is null and revoked_at is null;
create unique index if not exists staff_invitations_one_open_email_uq
  on public.staff_invitations(lower(email))
  where redeemed_at is null and revoked_at is null;

alter table public.staff_invitations enable row level security;
drop policy if exists staff_invitations_admin_select on public.staff_invitations;
create policy staff_invitations_admin_select
  on public.staff_invitations for select to authenticated
  using (public.is_admin());

-- This function is callable only by the service role from the authenticated
-- staff-invitations Edge Function. It atomically consumes the invitation and
-- promotes the verified account, avoiding frontend-controlled role changes.
create or replace function public.redeem_staff_invitation(
  p_user_id uuid,
  p_email text,
  p_staff_code text,
  p_code_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation public.staff_invitations%rowtype;
  verified_email text;
begin
  select lower(u.email) into verified_email
  from auth.users u
  where u.id = p_user_id and u.email_confirmed_at is not null;

  if verified_email is null then
    raise exception 'Verify your college email before activating the staff account';
  end if;

  if verified_email <> lower(trim(p_email))
     or verified_email !~ '^[^@]+@(skct\.edu\.in|skcet\.ac\.in)$' then
    raise exception 'The signed-in account does not match an approved college email';
  end if;

  select * into invitation
  from public.staff_invitations
  where code_hash = p_code_hash
    and lower(email) = verified_email
    and lower(staff_code) = lower(trim(p_staff_code))
  for update;

  if not found then
    raise exception 'Invalid invitation code, email address or Staff ID';
  end if;
  if invitation.revoked_at is not null then
    raise exception 'This staff invitation has been revoked';
  end if;
  if invitation.redeemed_at is not null then
    raise exception 'This staff invitation has already been used';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'This staff invitation has expired';
  end if;

  update public.profiles
  set role = 'staff', department_id = invitation.department_id, updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception 'CampusPulse profile was not found for this account';
  end if;

  insert into public.staff_profiles(
    profile_id, staff_code, department_id, specialization, designation,
    account_status, availability
  ) values (
    p_user_id, invitation.staff_code, invitation.department_id,
    invitation.designation, invitation.designation, 'Active', 'Available'
  )
  on conflict (profile_id) do update set
    staff_code = excluded.staff_code,
    department_id = excluded.department_id,
    specialization = coalesce(excluded.specialization, public.staff_profiles.specialization),
    designation = coalesce(excluded.designation, public.staff_profiles.designation),
    account_status = 'Active';

  update public.staff_invitations
  set redeemed_at = now(), redeemed_by = p_user_id
  where id = invitation.id;

  return jsonb_build_object('success', true, 'role', 'staff');
end;
$$;

revoke all on function public.redeem_staff_invitation(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.redeem_staff_invitation(uuid,text,text,text) to service_role;
