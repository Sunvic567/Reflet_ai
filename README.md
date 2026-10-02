# Reflect AI

A goal planner with practical scheduling, today's actions, motivation, and weekly, monthly, and end-of-goal reflections.

Anyone with a Gmail address can create an account using their email and a preferred Reflect AI password. Supabase manages authentication and stores each account's private workspace. Email ownership must be confirmed before accessing the planner.

## Set up Supabase and Render

1. Follow [SUPABASE.md](SUPABASE.md) to create the project, run [supabase/schema.sql](supabase/schema.sql), and configure authentication emails.
2. Follow [RENDER.md](RENDER.md) to host the Node web service from this repository.
3. Enter environment values in Render. No admin API key or database connection password is required.

The source repository is public as approved. The existing private prototype has not been redeployed by this source change. Deploying the new service is a separate action.

## Run locally

Use Node.js 24:

```bash
npm ci
npm run dev
```

This local preview binds to `127.0.0.1:3000`, uses browser storage, and does not authenticate or access Supabase.

To run the full service, copy `.env.example` to `.env`, fill in your Supabase values, set the local redirect URLs/templates described in SUPABASE.md, and run:

```bash
node --env-file=.env server/start.mjs
```

`npm start` reads environment variables provided by the host. There is no frontend build step and no runtime npm dependency; the server uses Node's fetch API to call Supabase Auth and PostgREST.

## Behavior

- Goal setup captures an outcome, deadline, reason, workdays, and daily time budget.
- Checkpoints and actions are editable before activation. Plans that exceed capacity are rejected with a useful correction.
- Complete, undo, edit, add, remove, or reschedule actions. Progress, streaks, and a focus timer offer simple motivation.
- Record weekly, calendar-month, and end-of-goal reflections. A reflection can add one linked next action without duplicating it on edit.
- One goal is active at a time; previous personal goals are archived and can be restored.
- Workspaces sync to Supabase with revision checks. Failed saves stay pending in a per-account local backup. Conflicting writes stop; a superseded unsaved version is preserved for download from Settings after reload.
- Export/import validated JSON backups. Use exports to move existing goals from the old prototype to the new Render origin. Accounts use Supabase user IDs, so backups from earlier authentication accounts are not silently reassigned.
- The planner uses editable templates, not a remote language model. No AI API key is needed.

## Validation

```bash
npm test
```

Tests cover scheduling and reflections, signup/login/confirmation/reset/logout, verified Gmail checks, persistent cookie sessions and refresh, ownership derived from the authenticated user, cloud request contracts, serialized saves, conflicts, offline recovery, and actual application DOM interactions. Provider tests use mocks. Live email delivery, Supabase RLS enforcement, and hosted multi-device behavior must be tested after the real project is configured.

Optional browser tests: install Playwright with `npm install --no-save playwright`, install Chromium with `npx playwright install chromium`, keep `npm run dev` running, then run `npm run test:browser`. Screenshots go to `test-results/`. Set `REFLECT_TEST_URL` or `REFLECT_TEST_OUTPUT_DIR` to override the defaults. These optional tests exercise the local preview.

Never commit actual `.env` files, passwords, SMTP credentials, refresh tokens, or admin keys.
