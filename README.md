# Reflect AI

A private personal planning prototype with a single active goal, realistic workday scheduling, daily actions, and a goal-specific reflection journal.

## Host on Render

Use the included `render.yaml` Blueprint and follow [RENDER.md](RENDER.md). It runs the Node server with direct Google login. Set your Google OAuth credentials and approved email addresses in Render; real secrets are not included in this repository.

## Run locally

Use Node.js 24. From the repository root:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The local static preview needs no build step and runs without authentication. Production `npm start` requires Google OAuth configuration and serves the protected planner. Run `npm test` for the scheduling, authentication, data model, and DOM interaction tests.

For optional browser tests, install Playwright and Chromium with `npm install --no-save playwright` and `npx playwright install chromium`. Keep `npm run dev` running, then run `npm run test:browser`. Screenshots are written to the ignored `test-results/` folder. Set `REFLECT_TEST_URL` or `REFLECT_TEST_OUTPUT_DIR` to override the defaults. These browser tests run against the static prototype, without Google sign-in.

## Behavior

- Goal setup captures an outcome, a deadline, a reason, workdays, and a daily time budget.
- Suggested checkpoints and their actions are editable before activation. The scheduler rejects outlines that exceed available capacity and keeps dates within the goal.
- Today includes scheduled actions and unfinished overdue actions. Completing, editing, adding, and rescheduling actions updates the plan.
- Weekly, calendar-month, and end-of-goal reflections include a mood, observations, lessons, and an optional next step linked to an action. Updating a linked next step updates its action rather than duplicating it.
- New goals archive the previous personal goal. Previous goals can be reopened.
- Progress and streaks use actual action completion records. A 25-minute focus timer is optional.
- Data is stored in browser localStorage. Export and validated import provide backup and restore. Data does not sync between devices.
- Planning uses editable templates, not a remote language model. No emails or reminders are sent.

## Hosting and privacy

The existing prototype remains privately hosted on Sites. This repository includes the portable Render version, which requires Google sign-in and an explicit list of approved email addresses. The private prototype's provider-specific hosting configuration is excluded from this source export. No credentials belong in this repository. Browser planning data is never included in the deployed source.

## Direct Google login

A separate Google OAuth server is prepared in `server/`. See [GOOGLE_AUTH.md](GOOGLE_AUTH.md) for configuration and activation. It is not active on the current private Sites URL. The existing ChatGPT gate and its owner-only audience remain in place.
