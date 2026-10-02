# NovaBot

The AI chat assistant built for [Novacane Studios](https://novacane.co.uk), a
recording studio in London. It runs on Cloudflare Workers, answers questions
with Claude (Anthropic), and sits on the studio's Squarespace website as a chat
widget.

This public copy has placeholders instead of the studio's account details, and
a **sandbox** so you can run it on your own computer without any accounts.

## What it does

- **Chat widget** (`public/novabot.js`, `public/novabot.css`): a themed chat
  panel that opens after the page loads, tucks out of the way of buttons and
  forms on the page, remembers the conversation across pages, and has a
  "Keep chat closed" switch. Optional voice: speak to it (Whisper) and hear
  replies (browser voice or MeloTTS).
- **Answers** (`src/index.js`): Claude answers from the studio's own
  information (prices, policies, booking rules). Every link it gives is checked,
  and anything made up is replaced with a real one.
- **Booking links and free times** (`src/booking.js`): reads the session types
  and free start times from the studio's *public* Acuity booking page (no login,
  read-only) and gives visitors a link that opens the right session, with the
  time already selected when they've picked one.
- **Enquiries** (`src/enquiries.js`): NovaBot can take an enquiry in the chat,
  show the visitor a summary, and send it to the team once they confirm. It's
  saved to the admin page and can be emailed (Resend).
- **Admin pages** (`src/admin.js`): password-protected tabs for enquiries,
  conversations (kept 90 days) and referral codes.
- **Safety**: per-visitor rate limits, only allowed websites can use the chat,
  spam limits on enquiries, IP addresses stored only as a hash.

## Try it on your computer (sandbox)

You need [Node.js](https://nodejs.org) 20 or newer. No Cloudflare, Claude or
Acuity account is needed.

```sh
git clone https://github.com/tuniveza/novabot.git
cd novabot
npm install
npm run sandbox:setup   # creates .dev.vars and a local database
npm run sandbox         # starts it at http://localhost:8787
```

Open <http://localhost:8787>: a pretend website with the chat widget on it.

- **Everything stays on your computer.** The sandbox has its own local
  database and can't reach any live NovaBot, database or calendar.
- **Without an AI key**, NovaBot gives clearly labelled stand-in replies, so you
  can try the widget, enquiries and admin pages for free.
- **For real answers**, put your own Claude API key
  ([console.anthropic.com](https://console.anthropic.com)) in `.dev.vars` as
  `ANTHROPIC_API_KEY=...` and restart. That uses your own Anthropic account.
- **Admin pages**: <http://localhost:8787/admin>, any username, password
  `sandbox` (set in `.dev.vars`).
- **Voice**: speech uses your browser's own voice; the microphone needs Cloudflare
  Workers AI, so it isn't available in the sandbox.
- Booking links and free times point at a placeholder Acuity account, so they
  fall back to the general booking link.

`.dev.vars` is in `.gitignore`: your keys never get committed.

## Tests

```sh
npm test
```

84 tests, fully offline: they use a local database and fake versions of
Claude, Acuity and Resend.

## Running your own copy

1. Log in to Cloudflare: `npx wrangler login`
2. Create the database: `npx wrangler d1 create novabot`, put its
   `database_id` in `wrangler.jsonc`, then
   `npx wrangler d1 migrations apply novabot --remote`
3. Add the secrets (they're stored in Cloudflare, never in the code):
   ```sh
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put ADMIN_PASSWORD
   ```
   Optional: `RESEND_API_KEY` and `ENQUIRY_EMAIL_TO` for enquiry emails,
   `ACUITY_USER_ID` and `ACUITY_API_KEY` for referral tracking (needs Acuity's
   Powerhouse plan).
4. Replace the placeholders with your own details:
   - `src/index.js`: `BOOKING_LINK`, `ENQUIRY_LINK`, `WHATSAPP_NUMBER`,
     `WHATSAPP_LINK`, `ALLOWED_ORIGINS`, and the studio information in
     `STUDIO_INFO`
   - `src/booking.js`: `ACUITY_OWNER` (the number after `owner=` in your Acuity
     booking page's address)
   - `public/novabot.js`: `LIVE_WORKER_URL`, `BOOKING_LINK`, `PRIVACY_LINK`
5. Deploy: `npm run deploy`, then add the widget to your website (see
   [README-SQUARESPACE.md](README-SQUARESPACE.md)).

More detail:
[README-ENQUIRIES.md](README-ENQUIRIES.md) (enquiries, booking links, free
times, chat log),
[README-REFERRALS.md](README-REFERRALS.md) (referral codes),
[PRIVACY-POLICY-NOVABOT.md](PRIVACY-POLICY-NOVABOT.md) (privacy policy wording).

## Project layout

```
public/          the chat widget (served by the Worker)
src/index.js     the Worker: chat, voice, routes, NovaBot's instructions
src/booking.js   session types, booking links, free times (public Acuity page)
src/enquiries.js enquiries, enquiry emails, chat log
src/admin.js     admin pages
src/referrals.js referral tracking (Acuity API)
migrations/      database tables
test/            tests
scripts/         sandbox setup
```
