# Deploy Reflect AI on Render

The repository includes the complete frontend, Google authentication server, locked dependencies, tests, and `render.yaml`. Production runs as one **Node Web Service**, not a Static Site. No frontend build or Python installation is required.

## Create the service

In Render, choose **New → Blueprint**, connect this GitHub repository, and use the included `render.yaml`. The Blueprint chooses a free web service, one instance, `npm ci --omit=dev`, `npm start`, and the `/healthz` health check. Automatic redeploys are disabled so you choose when later commits go live.

You can also use **New → Web Service** with these settings:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Branch | `main` |
| Root directory | Repository root; leave blank |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/healthz` |
| Instances | `1` |
| Auto deploy | Off |

The `.node-version` file selects Node 24.21.0. Render supplies `PORT`, and the server binds to `0.0.0.0`.

## Environment variables

The Blueprint prompts for the first three values. Configure them directly in Render; do not put real secrets in a GitHub file.

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The Web application OAuth client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | That OAuth client's secret; keep it in Render's environment settings |
| `REFLECT_ALLOWED_EMAILS` | Your approved Gmail address; comma-separated exact addresses if you later approve more people |
| `REFLECT_OWNER_EMAIL` | Optional original owner email, also present in the allowlist |
| `REFLECT_BASE_URL` | Optional on Render; set only to use an exact HTTPS custom-domain origin |
| `NODE_ENV` | `production`; already set by the Blueprint |

Without a `REFLECT_BASE_URL` override, the server uses Render's provided `RENDER_EXTERNAL_URL`, so you do not need to guess the allocated hostname before the first deploy. It refuses to start if OAuth credentials or the email allowlist are missing. The app's planner pages and scripts require an approved Google session; the login page and health check are reachable without one.

## Configure Google OAuth

Create a Google OAuth client with application type **Web application** in [Google Cloud Console](https://console.cloud.google.com/auth/clients). Configure the consent screen. While the Google app is in testing mode, add each approved Gmail account as a test user.

Once Render gives you the service URL, add this exact **Authorized redirect URI** to the Google client:

```text
https://YOUR-SERVICE.onrender.com/auth/google/callback
```

`YOUR-SERVICE` is a placeholder; copy the actual URL from Render. This integration uses a server-side redirect flow, so no browser Google SDK or authorized JavaScript origin is required for this flow. For a custom domain, set `REFLECT_BASE_URL` to that origin and register its `/auth/google/callback` URI too.

Open the Render URL, choose **Continue with Google**, and sign in with an allowlisted account. Confirm goal creation, action completion, a saved reflection, and sign-out. Real Google consent/callback testing requires your credentials and deployed hostname and has not been completed by the automated provider tests.

## Data and privacy

- The source repository is public with the owner's approval; it contains no credentials or personal planning data. This file does not create or deploy a Render service by itself.
- The Render login page uses a publicly reachable HTTPS origin. The planner is restricted to verified accounts in your allowlist. Only deploy when you are ready for that login page to be reachable.
- Plans and reflections remain in browser storage, separated by Google account. They do not sync across devices. Export a backup from the existing prototype and import it on the Render origin; moving hosts does not transfer browser storage.
- Authentication sessions are stored in server memory. A restart or redeploy requires signing in again; it does not delete browser planning data. Keep one instance until a shared session store is added.
- This is a prototype. Plan suggestions use editable templates. It sends no reminder emails and requests no access to Gmail messages.

## Local checks

```bash
npm ci
npm test
npm run dev
```

`npm run dev` starts a local-only static preview without sign-in. To try real Google login locally, copy `.env.example` to `.env`, enter your local OAuth settings, register `http://localhost:3000/auth/google/callback`, and run:

```bash
node --env-file=.env server/start.mjs
```

Official references: [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Render Node versions](https://render.com/docs/node-version), [Render environment variables](https://render.com/docs/environment-variables), and [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
