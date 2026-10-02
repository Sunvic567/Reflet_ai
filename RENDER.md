# Host Reflect AI on Render

Source: https://github.com/Sunvic567/Reflet_ai

This repository includes a Node web service with Gmail/password registration, Supabase Auth, and per-user Supabase database storage. The source repository is public as approved; the existing private prototype remains unchanged until a separate deployment is authorized.

## Before deployment

Complete [SUPABASE.md](SUPABASE.md): create a project, run the SQL schema, enable Email authentication with confirmations, configure the two email templates, and set up custom SMTP for general user registration.

## Create the service

1. Sign in at https://dashboard.render.com.
2. Create a Blueprint from `Sunvic567/Reflet_ai`, branch `main`, using `render.yaml`. Alternatively create a Web Service with these settings:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | repository root / blank |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/healthz` |
| Node version | pinned by `.node-version` |
| Auto deploy | Off |

3. Add environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | project publishable key, or legacy anon key |
| `REFLECT_BASE_URL` | optional; exact HTTPS origin for a custom domain |
| `REFLECT_OWNER_EMAIL` | optional; original owner's Gmail for migration of the old unscoped browser backup |

The server uses Render's `RENDER_EXTERNAL_URL` automatically when `REFLECT_BASE_URL` is absent. Do not use a database password, `sb_secret_` key, or service_role key. Delete obsolete OAuth environment variables from an existing service.

4. Copy the assigned Render URL into Supabase's Site URL and allow `/auth/confirm` and `/auth/reset` redirects. Use the same origin for the browser, server configuration, and email links.
5. Deploy only when the owner is ready to activate this service. The login and registration pages will be reachable by anyone who can reach the service; every planner workspace requires its owner's verified account. Do not describe that as an owner-only host.

## Verify

`/healthz` should report `authentication: email-password`, `database: supabase`, and `private: true` (private account data). This is a process liveness check, not a check that the database schema or SMTP is ready.

Run the real-project checks in SUPABASE.md. The service stores refresh/access credentials in HttpOnly, SameSite cookies, validates identity with Supabase, refreshes expired sessions, and derives database ownership from the validated user. Planning data persists in Supabase rather than Render's filesystem or server memory.

The free Render plan can be used for a prototype; review the current plan's sleep/resource limits before relying on always-available service. Choose your Supabase and Render plans based on expected traffic, retention, and backup needs. No paid resource is provisioned by the source update.

## Existing data

Export a JSON backup from the earlier planner before changing hosts or clearing browser data. On the new service, sign in and use Settings > Restore a backup. The new workspace syncs to the user's Supabase account. Browser storage from a different origin or older account ID is not automatically moved.
