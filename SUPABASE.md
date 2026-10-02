# Supabase setup

Registration is open to anyone with a Gmail address. The signup form asks for Gmail and a preferred Reflect AI password only. Users confirm the email address before signing in. They must not enter their Gmail account password.

## 1. Create a project and collect the public connection details

1. Sign in at https://supabase.com/dashboard and create a project.
2. Choose your organization, a project name (for example Reflect AI), an appropriate region, and a database password. Keep the database password in your password manager; this app does not need it.
3. Once the project is ready, open its Connect dialog or project API settings and copy the project URL (`https://PROJECT.supabase.co`).
4. Under Settings > API Keys, copy a **publishable** key beginning `sb_publishable_`. A legacy `anon` key also works in the `SUPABASE_PUBLISHABLE_KEY` variable. Do not use a secret or `service_role` key: those bypass row-level security.

The project URL and publishable key are the two Supabase connection values needed for this app. Enter them in Render's environment settings rather than hardcoding them in the repository.

## 2. Create the database table

1. Open Supabase's SQL Editor.
2. Paste the complete contents of [supabase/schema.sql](supabase/schema.sql).
3. Run the SQL.
4. In Table Editor, confirm `public.reflect_workspaces` exists and RLS is enabled.

This schema creates one JSON workspace per Supabase user ID, including active and archived goals, actions, and reflections. Select/insert/update policies require the authenticated user's ID to match the row and require a verified Gmail address. The server uses the user's access token for every database request. No user can change another user's row through this app's API. Anonymous clients have no table access.

Use a dedicated project if possible. The script creates `reflect_private` and `reflect_workspaces` and replaces only this app's named policies, function, and timestamp trigger. Review existing objects with those names before applying it to an existing project.

## 3. Configure email/password authentication

In Authentication settings:

1. Enable Email provider and allow new user signups.
2. Keep **Confirm email** enabled. Do not enable anonymous sign-ins.
3. Set the password minimum length to 8 or higher. The app enforces 8–128 characters. Additional Supabase password rules can reject a password that meets the app minimum; users should then choose a stronger password.
4. Disable social authentication providers if previously configured. The repository has no social sign-in routes or credentials.
5. Set **Site URL** to the exact Render service origin, for example `https://reflect-ai-xxxx.onrender.com`.
6. Add these exact origins/paths under allowed Redirect URLs:
   - `https://YOUR-RENDER-SERVICE.onrender.com/auth/confirm`
   - `https://YOUR-RENDER-SERVICE.onrender.com/auth/reset`
7. For local testing, also allow `http://localhost:3000/auth/confirm` and `http://localhost:3000/auth/reset`. Use the matching local origin for REFLECT_BASE_URL.

## 4. Set the two email templates

The server verifies a token hash on a POST, so tokens are not consumed simply because an email scanner opens a link. Replace Supabase's default templates with these links in Authentication > Email Templates. They work using the `RedirectTo` configured by the app.

**Confirm signup**:

```html
<h2>Confirm your Reflect AI account</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}">Confirm my email</a></p>
```

**Reset password**:

```html
<h2>Reset your Reflect AI password</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}">Choose a new password</a></p>
<p>If you did not request this, you can ignore this email.</p>
```

Keep your email service's link tracking disabled for authentication emails. The confirmation link opens a page with a Confirm email button. The reset link opens a new password form, then asks the user to sign in with their updated password.

## 5. Configure reliable email delivery

Supabase's default email sender only delivers to addresses belonging to your project organization team and is rate limited. To support anyone registering, configure **custom SMTP** in Supabase Authentication settings.

Choose an email provider that supports SMTP. It supplies the SMTP host, port, username, and password. Verify a sending domain/address as required by that provider and choose a sender name, such as Reflect AI. Enter SMTP credentials directly into Supabase, not this repository or a chat message. The application itself needs no SMTP variables.

Test a confirmation email and password reset email using a Gmail account outside your Supabase organization.

## 6. Test the real project

Before activating the service for users:

1. Register a fresh Gmail account and confirm the email. Sign in, create a practical goal, complete an action, and record each reflection type.
2. Wait for "Saved to your account", then open the account on another device. Confirm the goal, action, and reflection persist.
3. Register a second Gmail account. Confirm it starts with its own workspace and cannot access the first user's data.
4. Test forgotten password, an expired/used confirmation link, wrong credentials, and logout. After logout, a direct workspace API request must return 401.
5. Verify RLS with both user access tokens against the Supabase REST API: account B's requests for account A's row should return no rows, and writes with account A's user_id should fail. Anonymous requests must fail.
6. Make conflicting edits in two tabs/devices. The later stale write should show a conflict. Export the unsaved version, reload, and confirm the recovery backup remains available.

Local automated tests do not establish that the live SQL policies or SMTP settings are configured correctly. Those final checks require the real project.

Official references: [Password auth](https://supabase.com/docs/guides/auth/passwords), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), and [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
