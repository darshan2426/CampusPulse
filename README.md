# CampusPulse — Smart Campus Issue Reporting & Resolution

Portfolio-grade React + TypeScript + Vite application using Supabase Auth, PostgreSQL, RLS and private Storage.

## Included
- Responsive landing page and role-aware entry flow.
- Supabase student sign up/sign in/password reset.
- Complaint submission wizard: student data (only name required), category, severity, location, evidence upload, browser camera capture, previews, validation and review.
- Priority scoring (transparent rule-based), open-complaint similarity warning.
- Student dashboard, administrator complaint list/filters/assignment/status/priority operations, staff assigned-task view.
- SQL schema, RLS policies, private evidence bucket, submit RPC and scheduled escalation Edge Function.
- Netlify SPA routing.

## Run locally
1. Install Node.js 20+.
2. `npm install`
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. In Supabase SQL Editor, run `supabase/migrations/001_campuspulse.sql`.
5. Run `npm run dev`; production build: `npm run build`.

## Supabase configuration
- Authentication: enable email/password. Set site URL and redirect URLs for local and Netlify deployment.
- SQL: run migration. The auth trigger creates profiles with `student` role; registration metadata cannot set a privileged role.
- Staff: register a user then promote only via trusted admin operation, create staff_profiles.
- Admin bootstrap: promote an existing profile from SQL editor/trusted backend. Never ship admin secrets to client.
- Storage: migration creates private `complaint-evidence` bucket and object policies.
- Edge Function: deploy `supabase/functions/escalate-overdue`; set secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Schedule using Supabase Cron (e.g. hourly) invoking function with service-role bearer secret. Do not expose service role key in Vite environment.
- Guest complaint submission stores token hash in database. The UI keeps token in sessionStorage and shows it at successful submission. Guest secure tracking/retrieval endpoint is a follow-on backend integration; guest submissions are not exposed by public complaint-number lookup.

## Netlify
Build command `npm run build`, publish directory `dist`; `netlify.toml` includes SPA fallback. Add the two Vite public Supabase environment variables in Netlify UI.

## Notes / honest scope
This is a runnable full-stack starter with Supabase integration, schema and foundational RLS. Some enterprise features still require hardening/integration before a real production rollout: guest token verification endpoint + guest secure status view, realtime notifications/notification inbox UI, staff creation and full admin account/departments management, activity timeline and internal-note UI, analytics export/custom date filtering, feedback UI, attachment signed URL viewer, and comprehensive integration/security testing. Escalation scheduling must be configured in Supabase Cron. Never consider client-side filtering a security boundary.


## Feature migration and security checks

Apply `supabase/migrations/002_security_features.sql` after migration 001. It adds:
- Secret-verified guest tracking and guest-visible status timeline RPCs.
- Status-change audit trigger (one event per status transition).
- Server-side notifications for new complaints, status changes, and assignment changes.
- Staff profile administration, assigned-workload display, and staff-only maintenance notes.
- Relevant indexes and RLS policies.

### Guest tracking secret
Guest submissions create a random high-entropy secret. Save the one-time secret displayed after submission; the guest tracking screen requires both the complaint reference and this secret. The secret is stored in browser session storage for convenient same-session autofill. It is not a password reset mechanism; if lost, campus administrators must verify the reporter separately.

### QA / end-to-end checklist
Run `supabase/tests/permissions_smoke_test.sql` in a staging database for schema checks. Then test with distinct student, staff, admin, and anonymous accounts as listed in that file. Verify Storage API access using authenticated JWTs and confirm the evidence bucket remains private. Test the React app with:
```bash
npm install
npm run dev
```
For a production build:
```bash
npm run build
```
Note: an end-to-end run against a live Supabase project requires project credentials and test users; those are intentionally not embedded in this repository.
