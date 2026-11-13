# TURN relay setup

Updated 11 November 2026. **User decision: keep STUN-only calls now; defer TURN activation and verification to final handover.** The reminder is tracked in `docs/FOLLOW_UPS.md` and the handover source document. STUN-only calls may fail on restrictive networks; deferring TURN does not establish full public-network readiness.

Application integration is implemented for Cloudflare Realtime TURN. **No live TURN relay has been activated or verified:** the user does not yet have a service account and no provider key/token is configured. This is an outstanding provider-activation step, not a completed networking release gate.

## Current STUN-only settings

Set these in the private backend environment and restart the backend:

```dotenv
TURN_PROVIDER=stun
TURN_FORCE_RELAY=0
```

This explicitly permits direct/STUN-only calls, including when `NODE_ENV=production`. It does not contact a TURN provider or require provider credentials. Meeting ownership checks, live-room restrictions and the 30-minute limit remain enforced. `TURN_PROVIDER=none` still permits development calls only and blocks production startup of calls. `npm run turn:check` checks TURN activation and will report it as inactive until the deferred setup is completed.

## What the application does

- Student and RO clients request `GET /api/meetings/:issueId/ice` using the existing authenticated session before creating their WebRTC connection.
- The backend verifies role, issue ownership, online/live meeting state and the saved 30-minute deadline. Other students, unrelated ROs and Mentors cannot obtain relay credentials. Admin access follows the existing case permissions; an RO cannot obtain credentials for an administrative hearing.
- The backend calls Cloudflare with its private key ID/API token and returns only short-lived ICE credentials. Long-lived provider secrets stay on the server, outside frontend code, browser storage and signaling messages.
- Credentials last for the remaining meeting duration plus a two-minute allocation allowance, at most 32 minutes. This allowance does not extend the application's 30-minute call limit. Credentials are reused in bounded server memory per participant/session and regenerated after a restart as needed. Room state is checked again after provider issuance to avoid returning credentials for an ended/rescheduled meeting.
- Normal mode allows direct connections and TURN relay candidates. `TURN_FORCE_RELAY=1` is a server-side diagnostic that forces relay use for supervised verification.
- Explicit `TURN_PROVIDER=stun` allows STUN-only calls with a network-compatibility warning. Missing configuration (`none`) still blocks production calls; development permits `none`. Invalid relay settings or a configured provider outage return a visible error rather than silently falling back to STUN. None of these checks establishes public-network readiness.
- Reconnects reuse the session ICE configuration. Startup cancellation aborts credential loading, and both dashboards offer a retry action on connection setup errors. Existing recording/feedback and 30-minute expiry flows remain in place.

## Account setup required from the owner

1. Create or sign in to your own account at https://dash.cloudflare.com/sign-up . A custom domain is not needed merely to use the TURN service.
2. Open Cloudflare Realtime's TURN / SFU-and-TURN area and create a TURN key, following the official credential guide below. Use the key ID and its authorised API token; do not use example credentials from documentation.
3. Review the provider's activation, payment-method and usage terms before enabling billing. Cloudflare's checked documentation lists a 1,000 GB free allowance before usage charges and describes self-serve billing with a credit card. It is not an unlimited-free-service commitment. No billable resource was created by this implementation.
4. Paste the values directly into the ignored local `server/.env` file, or the production host's private environment settings. Do not paste them into chat, GitHub, screenshots, React files or any `VITE_` variable.

```dotenv
TURN_PROVIDER=cloudflare
CLOUDFLARE_TURN_KEY_ID=YOUR_PRIVATE_KEY_ID
CLOUDFLARE_TURN_API_TOKEN=YOUR_PRIVATE_API_TOKEN
TURN_FORCE_RELAY=0
```

These are placeholders, not working credentials. Use `server/.env.example` as a reference. The application loads `server/.env` before fallback root settings; remove conflicting old settings rather than keeping two different provider configurations.

5. Restart the backend after changing settings. During development, keep email disabled; relay verification does not require sending email or changing account data.

## Verify before declaring the relay ready

First check that required private settings are present:

```text
npm run turn:check
```

This default command is local configuration validation only. It does not prove the provider accepts the credentials.

Then verify provider issuance and an actual browser TURN allocation:

```text
npm run turn:check -- --relay
```

This makes a real provider request, issues two-minute test credentials and gathers browser ICE candidates with `iceTransportPolicy: relay`. It prints only candidate counts/protocols, not credentials or IP addresses. A relay candidate is necessary evidence that allocation works; it does not certify a complete two-party video call or network capacity. The diagnostic needs a supported installed Chromium browser. It uses Edge on this Windows development machine; elsewhere set `TURN_TEST_BROWSER` to the browser executable or install the Playwright browser according to the host's setup instructions. It should be run on a test/admin machine, not exposed as a public endpoint.

Finally, during a supervised test window:

1. Set `TURN_FORCE_RELAY=1` and restart the backend.
2. Use test RO/student accounts and a legitimate scheduled meeting. Start it as the RO, then join as the correct student.
3. Test two different networks (for example college Wi-Fi and mobile data), both audio/video directions, mute/camera controls, disconnect/rejoin and the 30-minute end behaviour.
4. Verify RO recording upload/playback, student media cleanup and post-meeting feedback. Check that an unrelated student cannot get ICE settings or join.
5. Inspect the browser's selected ICE candidate pair to confirm actual relay traffic; watching a picture alone is not sufficient when direct connections are enabled.
6. Restore `TURN_FORCE_RELAY=0` and restart for normal use. Record usage and call-quality results. Repeat on representative Android/iOS/laptop browsers and restrictive networks.

Do not put permanent shared TURN credentials into the browser to bypass this setup. Short-lived credentials are still usable by their holder until provider expiry; meeting authorisation controls issuance, while the existing application lifecycle closes supported clients at 30 minutes. TURN issuance/revocation is not a network-wide media cutoff for modified clients.

## Local verification performed

Unit/API tests use a fake provider to check role/ownership restrictions, expired/changed meetings, short-lived credential reuse, safe provider errors, response filtering, non-cacheable responses and forced-relay configuration. Browser fixtures verify that WebRTC waits for settings, uses relay configuration on reconnect, avoids storing secrets in local storage/signaling, handles cancellation/outages, and preserves the existing countdown/recording-finalisation flow. The opt-in isolated PostgreSQL reliability test also checks the real SQL used to authorise ICE settings.

These fixture tests do not create a Cloudflare account or prove live relay connectivity. Provider activation, real ICE allocation and different-network calls remain pending until account credentials are supplied privately.

## Official references

- Credential API and server-side key handling: https://developers.cloudflare.com/realtime/turn/generate-credentials/
- TURN service endpoints: https://developers.cloudflare.com/realtime/turn/
- Pricing/allowance and self-serve billing information: https://developers.cloudflare.com/realtime/turn/faq/

This integration can be used with an application hosted on AWS, college infrastructure or another compatible Node host; the relay provider is separate from application/database hosting.
