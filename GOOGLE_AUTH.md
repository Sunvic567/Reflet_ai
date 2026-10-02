# Google authentication

The independent Google login integration is prepared in `server/`. It is not enabled on the current Sites deployment. The current host still enforces its private ChatGPT sign-in gate, which already offers Google as a sign-in method. Its owner-only audience has not changed.

For Render deployment, use [RENDER.md](RENDER.md) and the included Blueprint.

## Activate on a Node-capable host

1. Create a Google OAuth client of type **Web application** in [Google Cloud Console](https://console.cloud.google.com/auth/clients). Configure the consent screen, and add the approved accounts as test users while the Google app is in testing mode.
2. Register the exact callback `${REFLECT_BASE_URL}/auth/google/callback` as an **Authorized redirect URI**. For local development, this is `http://localhost:3000/auth/google/callback`.
3. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `REFLECT_BASE_URL`, and `REFLECT_ALLOWED_EMAILS` as server environment variables. On Render, `REFLECT_BASE_URL` can be omitted because the server uses `RENDER_EXTERNAL_URL`. Store the client secret in the host’s secret manager, never in frontend code or Git. `server/.env.example` contains placeholders only.
4. Set the optional `REFLECT_OWNER_EMAIL` to the original planner owner’s approved Gmail address to copy the existing browser workspace into that account’s storage namespace. This preserves the original backup rather than deleting it. Other accounts start with their own example workspace.
5. Run `npm ci --omit=dev` and `npm start`. In production, use an HTTPS origin for `REFLECT_BASE_URL`. The server uses `PORT` if the host provides it.

Moving to another origin does not transfer browser storage. Export a backup from the existing private site and restore it after signing in on the new origin. Changing the published host or admitting additional people requires the owner’s explicit approval.

## Implemented behavior

- Google authorization-code sign-in with PKCE, random state and nonce, and server-side verification through Google’s official `google-auth-library`.
- Only verified Google email addresses in the exact allowlist can enter. The server refuses to start with an empty or wildcard allowlist.
- Random, opaque, HttpOnly session cookies. Production cookies use Secure and the `__Host-` prefix. Sessions expire after eight hours; logout revokes the server-side session.
- Single-use login transactions expire after ten minutes. State mismatches, provider rejection, expired transactions, invalid tokens, unverified email, and unapproved accounts are rejected.
- Same-origin POST logout, non-cacheable personalized pages, and protected planner HTML and JavaScript assets.
- Separate browser-storage keys for each Google subject ID. No access to Gmail messages is requested; scopes are `openid email profile`.

The prototype’s sessions and login transactions are stored in memory. Run one server instance; restarts require signing in again. A shared durable session store is needed before scaling across multiple instances. Planner data remains local to each browser and has export/import support.

## Verification

Run `npm test`. Authentication tests exercise approved-account login, PKCE, state and nonce rejection, token-verification failures, restricted access, cookie flags, session expiry and revocation, logout origin checks, protected assets, and account-separated storage. The Google provider is mocked in these tests. A real Google consent and callback smoke test remains necessary after credentials and the intended HTTPS host are configured.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) and [Google OAuth for web servers](https://developers.google.com/identity/protocols/oauth2/web-server).
