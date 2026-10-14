# Mzuzu Connect Client Acquisition System

A beginner-friendly Node.js + Express starter app for managing business leads in Mzuzu, Malawi.

## Features in this starter
- Admin-protected dashboard
- Add, edit and search business leads
- Discover nearby businesses from OpenStreetMap (free, no API key)
- Match prospects to Mzuzu Connect services and create contact playbooks and editable outreach drafts
- Track website opportunity and the service to offer
- CSV import/export
- Contact-permission tracking
- Consent-based email outreach via SMTP
- WhatsApp Cloud API template-message integration
- Follow-up dates, lead stages and opt-out/suppression
- JSON-file storage for a small initial test

## Important limits
- Business discovery uses OpenStreetMap's public data service without an API key. Coverage may be incomplete; results are suggestions to review, not verified prospects. Please use the map data attribution shown in the app and avoid repeated searches that burden the free service.
- Service suggestions are rule-based matches from public listing categories and fields, informed by the services shown on https://mzuzuconnect.netlify.app. They are starting points, not verified needs; check the business website and ask before proposing work.
- Prospect records can show public phone/email, website, address, opening hours, and the OpenStreetMap source when those fields are listed. Missing details do not mean the business lacks them.
- Contact guides provide editable drafts and channel-specific reminders. Drafting or finding a public listing does not establish consent. Actual email/WhatsApp sending remains blocked unless genuine permission and its source are recorded.
- This starter does **not** scrape Google Maps, Facebook, WhatsApp or private directories.
- Use permitted public directories, business websites, referrals, trade associations, or a data provider whose terms allow your intended use. Enter or import leads you are allowed to use.
- A public phone number is not automatically permission to send marketing messages.
- Automated sending is blocked unless the lead has `contactPermission=true`, a recorded `permissionSource`, a valid contact detail, and is not opted out.
- WhatsApp outbound business-initiated messages normally require an approved template and must follow Meta's current rules. See https://developers.facebook.com/docs/whatsapp/cloud-api/overview
- Google Places content has storage/use restrictions. Review its policies before using its API as a persistent lead database: https://developers.google.com/maps/documentation/places/web-service/policies
- JSON storage is for a small prototype only. Render's local filesystem may not persist data across deploys/restarts unless a persistent disk is configured. For a live business, move to a managed database or persistent storage.
- Never commit `.env` or API tokens to GitHub.

## Run locally on Windows
1. Install Node.js 18 or newer.
2. Extract this ZIP.
3. Open Command Prompt in the extracted folder.
4. Run `npm.cmd install` (in PowerShell; use `npm install` in Command Prompt).
5. Copy `.env.example` to `.env` in the project folder and replace the `ADMIN_PASSWORD` placeholder with your password. The app reads `.env` from the folder containing `server.js`, not from your terminal's current folder.
6. Run `npm.cmd start` (in PowerShell; use `npm start` in Command Prompt).
7. Open http://localhost:3000

If you change `.env` while the app is running, stop it and start it again so the new password is loaded.

## Safe first test
1. Log in using the password in `.env`.
2. Add a test lead that you own/control.
3. Mark contact permission only when permission has actually been obtained, and record its source.
4. Configure SMTP or WhatsApp Cloud API only after you have the relevant account and credentials.
5. Test with your own email/WhatsApp number first.

## Email setup
Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM. Provider-specific app passwords may be required.

## WhatsApp setup
1. In Meta for Developers, create an app, add the WhatsApp product, and connect or create a WhatsApp Business Account and sending phone number.
2. In the WhatsApp API setup panel, copy the **Phone number ID** and create a secure access token with the permissions Meta requires for WhatsApp messaging. Do not paste the token into chat or commit it to Git.
3. In WhatsApp Manager, create and get approval for a message template in the language you will send. This app sends exactly two body parameters: business name (`{{1}}`) and service name (`{{2}}`), so the approved template must accept those parameters.
4. Put the token, phone number ID, approved template name, and language in the matching `WHATSAPP_*` entries in `.env`. `.env.example` lists the variable names; keep your real token only in `.env` or your deployment's secret settings.
5. Restart the app. The dashboard's outreach notice reports whether the required WhatsApp settings are present. Test only with a number you control first.

Sending is still blocked unless the business has genuinely opted in to WhatsApp messages, the permission source is recorded, and the business has not opted out. Finding a business or seeing its public phone number is not permission to message it. Follow Meta's current WhatsApp policies and applicable local laws.

## Render deployment
This repository includes a `render.yaml` Blueprint for a **free demo** service. Connect the GitHub repository in the Render dashboard to deploy. In Render, open the service's **Environment** settings and set `ADMIN_PASSWORD` to a strong, unique value; save and redeploy if prompted. Never use the example/local password for the hosted app. Share the hosted password with the demo team privately.

**Free demo warning:** free Render services can sleep when idle, and their local filesystem is temporary. This app stores prospects in local JSON files, so demo data can disappear after a restart, sleep, or redeploy. Do not use the free demo for important client data. The same shared password is used by all demo team members; it does not provide per-person accounts or an audit trail identifying each teammate.

### Install from Chrome
The site is also an installable web app (PWA). After the updated files have been deployed over HTTPS, open the Render URL in Chrome on Android, sign in if needed, then use Chrome's menu and choose **Install app**. Chrome may also show an in-page **Install app** button when it offers the install prompt. On a computer, use the install icon in Chrome's address bar or Chrome's **Install page as app** menu item. If the install option is not available, confirm the latest deployment is live and reload the site in Chrome.

The install opens the hosted app in its own app window; it is not an APK and still needs internet access to sign in and use shared data. The service worker caches only the public app shell for an offline fallback; it never caches API responses or prospect data.

### Android app
The `android` folder contains a WebView app project for the hosted dashboard. Install Android Studio, open the `android` folder, wait for Gradle sync, then choose **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The app opens `https://connect-zj8v.onrender.com` by default; teammates can edit the server URL in the app if it changes. Sign in using the hosted `ADMIN_PASSWORD`. Distribute the generated `android/app/build/outputs/apk/debug/app-debug.apk` privately to teammates; Android may ask them to allow installation from that source.

An APK does not host the server itself: every phone needs internet access to reach the Render service. Never put the admin password or WhatsApp token in the APK source or inside the APK. For reliable shared prospect data and individual team logins, migrate to persistent database storage and proper user accounts before using this with real client records.

## Suggested next steps
1. Add a vetted lead-source API integration (after checking its terms and costs).
2. Add unsubscribe handling for inbound replies/webhooks.
3. Add rate limits, audit logs and a managed database before production use.
4. Consider sending one relevant message at a time rather than bulk campaigns.
