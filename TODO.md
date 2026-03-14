# Heartland Inspection Group — Master To Do List
Last Updated: Session 37
Never delete items — mark complete with [x] and date

---

## ⚠️ REQUIRED SUPABASE MIGRATIONS (must run before testing affected features)

### [ ] agents.portal_token — Session 35
```sql
ALTER TABLE agents ADD COLUMN portal_token text;
```
Needed for: agent portal token login, Send/Copy Portal Link buttons in admin.

### [ ] inspection_records.agent_id — Session 37
```sql
ALTER TABLE inspection_records ADD COLUMN agent_id uuid REFERENCES agents(id);
```
Needed for: agent_id propagating from bookings → inspection_records on confirm.
After running: confirm-booking-email.js already writes agent_id from b.agent_id.
Existing records: admin.html backfills agent_id at runtime from bookings via booking_id (fallback for pre-migration records).
Needed for Section 3 (Heartland Clients tab) to query inspection_records directly by agent_id.

---

## NON-NEGOTIABLES (architecture rules — never violate)

### URL Rules
- `invoice.html` — PRE-PAY ONLY (`?booking=<id>`). Styled in Inspector Wizard world. Never used as a receipt.
- `invoice-receipt.html` — THE receipt. Every "View Invoice", "Copy Invoice", "Send Invoice", "View Receipt" link everywhere must point here (`?id=<record_id>`).
- `report.html` — THE report. Every "View Report", "Copy Report", "Send Report" link points here (`?id=<record_id>`).

### Visual Worlds — Never Mix
1. **Admin / Index pages** — current dark CRM styling
2. **Inspector Wizard** — dark navy `#0d1a2e`, Barlow Condensed, green `#27ae60` accents
3. **Emails, Invoices (`invoice-receipt.html`), Reports (`report.html`)** — old brand.css style
- **Client Portal** — Inspector Wizard world
- **`invoice.html`** — Inspector Wizard world (pre-payment page)

### Code Rules
- IIFE scope: Both script blocks wrapped in `(function(){ 'use strict'; ... })()`. Functions called from inline `onclick` MUST be on `window.*`
- `URL` is reserved in Netlify env — always use `SITE_URL`
- Font-family quotes inside JS string concatenation must be escaped: `\'Work Sans\'`
- Unicode em-dash (`—`) in JS source files causes `str_replace` to fail — use Python `replace()` for edits
- Always use Python index-based replacement when str_replace fails — never truncate files
- After any file edit, verify line count is reasonable before building zip
- Emoji in HTML files must be actual UTF-8 characters, not `\uXXXX` escape sequences
- Inline onclick with single quotes inside double-quoted HTML attributes — use `data-*` attributes + event delegation instead
- Always run `node --check` on extracted script blocks after edits
- Read every relevant file COMPLETELY before any planning or building. Code first, talk second.

### Netlify Deploy
- Files MUST be at root level of zip — NOT inside a `heartland-website/` subfolder
- Zip command:
```bash
cd /home/claude/heartland-website
zip -qr /mnt/user-data/outputs/heartland-website-flat.zip admin.html inspector-wizard.html inspector.html inspection-wizard.html index.html client-portal.html invoice.html invoice-receipt.html agent-portal.html report.html success.html faq.html scheduler.html branding-guidelines.html brand.css manifest.json robots.txt sw.js netlify.toml package.json package-lock.json vitest.config.js CLAUDE.md TODO.md functions/ assets/ images/ services/ shared/ scripts/ docs/ tests/
```

---

## ARCHITECTURE TRUTHS (Session 22 — source of truth)

### `inspection_records` is the single source of truth
- Bookings table = **intake queue only**. A booking comes in, shows as pending, gets confirmed, then status is set to `confirmed` and it disappears from the Bookings UI. Row stays in Supabase as history.
- Everything downstream (portal, wizard, reports, invoices, payments) reads from `inspection_records` only.

### Two and only two statuses on `inspection_records`
- **`scheduled`** — Created at confirm time. Covers everything from confirm through wizard completion. Amber border (`#f59321`) in admin Client Records. Shows in wizard job picker. Card shows Edit + Delete only.
- **`submitted`** — Wizard has been submitted. Green border (`#27ae60`). Card shows all 8 buttons: View Report, Edit, Resend Report, Copy Report, Resend Invoice, Copy Invoice, Portal Link, Copy Portal.
- No `draft`, no `confirmed`, no `in_progress` for normal flow. Old status values `in_progress`, `review`, `approved`, `delivered` still exist in DB constraint for legacy records but are not written by any new code.

### Status constraint on `inspection_records`
```sql
CHECK (status = ANY (ARRAY['draft','scheduled','agreement_pending','in_progress','review','submitted','approved','delivered','cancelled']))
```
New code only writes `scheduled` and `submitted`.

### Flow
1. Client books → row in `bookings`, `status = 'pending'`
2. Admin confirms → `confirm-booking-email.js` creates `inspection_records` row (`status = 'scheduled'`, `payment_status = 'unpaid'`) + portal token + sends email + sets `bookings.status = 'confirmed'` (disappears from Bookings UI, stays in Supabase)
3. Client visits portal → `get-portal.js` fetches `inspection_records` by `cust_email` only. One table. No stitching.
4. Jake runs wizard → wizard finds `scheduled` record by `booking_id` in picker, fills it in. Auto-saves keep status `scheduled` (never downgrades). On submit: `status = 'submitted'`, `payment_status` set based on method.
5. Payment → all paths write `payment_status = 'paid'` to `inspection_records`.
6. Portal tabs driven entirely by `inspection_records` fields.

### Payment
- `isPaid(rec)` = `rec && rec.payment_status === 'paid'` — one line, no exceptions
- Clean payment_method values: `cash`, `check`, `card`, `invoice`, `stripe_online`
- Cash/Check/Card on-site → `payment_status = 'paid'` immediately on wizard submit
- Invoice → `payment_status = 'unpaid'`, client pays later via portal
- Stripe online → `record-online-payment.js` sets `payment_status = 'paid'`

### Status rank guard in `save-draft.js`
- Auto-saves from wizard never downgrade status
- `scheduled` stays `scheduled` until explicitly submitted
- Only `submitted` can advance status unconditionally

### Walk-in jobs (no prior booking)
- Jake starts fresh wizard with no booking → inserts new record with `status = 'scheduled'`
- Behaves identically to confirmed jobs in every other way

### `invoice_amount` is dead
- Column never existed. All reads now use `final_total` with `invoice_amount` as fallback.

---

## SUPABASE SCHEMA — `inspection_records` live columns
`id, booking_id, status, inspector_id, inspector_name, form_data, tier, category, cust_name, cust_email, cust_phone, address, inspection_date, created_at, updated_at, device_id, invoice_url, report_url, payment_method, stripe_payment_id, payment_signature, paid_at_inspection, onsite_payment_method, final_total, payment_status`

## SUPABASE SCHEMA — `bookings` live columns
`id, agent_id, status, client_name, client_email, client_phone, property_address, property_city, property_state, property_zip, year_built, sqft, home_size_tier, base_price, services, addons_total, discount_pct, discount_amount, coupon_code, coupon_discount, final_total, preferred_date, preferred_time, notes, created_at, tax_state, tax_rate, tax_amount, data_source, referring_agent_id, payment_status, stripe_transaction_id, reschedule_requested, reschedule_date, reschedule_time`

## SUPABASE POLICIES ADDED THIS SESSION
- `inspection_records` status check constraint updated to include `scheduled` and `cancelled`
- `bookings` DELETE policy added (harmless — added during troubleshooting, bookings are not deleted in normal flow)

## SUPABASE TABLES STILL NEEDED
```sql
create table broadcast_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  type text,
  subject text,
  recipient_count int default 0,
  failed_count int default 0,
  recipients jsonb
);
```

---

## TWO SUPABASE DATABASES

### Website Supabase: `https://fusravedbksupcsjfzda.supabase.co`
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1c3JhdmVkYmtzdXBjc2pmemRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzMxMTEsImV4cCI6MjA4Njk0OTExMX0.DOZAe6PNWKnKtrrlfCGWjyOMnmbdp92Vssj9ahUhvcU`
- Service key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1c3JhdmVkYmtzdXBjc2pmemRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3MzExMSwiZXhwIjoyMDg2OTQ5MTExfQ.nXAzXfGge16DimdrRpHdIYjOlRrShDPpGvxOlXp4aPM`

---

## KEY CONSTANTS
- Admin token: `3824d37e48745602d2f7de3bffd74fbf98063228b557110d`
- Hardcoded admin login: `Admin@heartlandinspectiongroup.com` / `Heartland26!`
- `SITE_URL` env var = `https://quiet-mousse-ce00ef.netlify.app` (test)
- Azure: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` in Netlify env vars
- `RESEND_API_KEY` in Netlify env vars
- Stripe: `STRIPE_SECRET_KEY_TEST` / `STRIPE_PUBLISHABLE_KEY_TEST`
- Brand phone: `(815) 329-8583` | Email: `info@heartlandinspectiongroup.com`
- Logo: `https://i.imgur.com/I1vTiVT.png` | BCC: `jake@heartlandinspectiongroup.com`
- Google Review: `https://g.page/r/CS4SFR_hU5gaEBM/review`
- Cloudinary: cloud `dmztfzqfm`, preset `slvlwkcf`
- Test site: `https://quiet-mousse-ce00ef.netlify.app`
- Production: `https://heartlandinspectiongroup.com`

---

## E2E TEST STEPS (run after every major deploy)

**Step 1 — Book**
Scheduler → fill name, email, address, date, service → submit. Check `bookings`: one row, `status = 'pending'`.

**Step 2 — Confirm**
Admin → Bookings tab → Confirm & Assign → pick inspector → Confirm. Check:
- `bookings` table — row is GONE (deleted)
- `inspection_records` — one row, `status = 'scheduled'`, `payment_status = 'unpaid'`, `booking_id` populated
- `client_portal_tokens` — one row for that email
- Email inbox — confirmation email with portal button

**Step 3 — Portal**
Click portal link from email. Check:
- Inspections tab — one card, status "Confirmed", address/date/inspector shown, Reschedule + Cancel visible
- Invoices tab — empty
- Reports tab — empty

**Step 4 — Wizard (Invoice)**
Admin → Inspector Wizard → job picker shows scheduled record → select it → fill sections → payment = Invoice → submit. Check:
- `inspection_records` — `status = 'submitted'`, `payment_status = 'unpaid'`, `payment_method = 'invoice'`, `invoice_url` + `report_url` populated
- Portal refreshed — card shows "Payment Required", Pay Now visible, report locked

**Step 5 — Online Payment**
Portal → Pay Now → `invoice.html` → Stripe test card `4242 4242 4242 4242`, any future date, any CVC → pay. Check:
- `inspection_records` — `payment_status = 'paid'`, `payment_method = 'stripe_online'`, `stripe_payment_id` populated
- Portal — card shows "Complete", View Report + View Invoice visible
- Reports tab — report card appears
- Invoices tab — moves to Past Invoices

**Step 6 — Cash**
New booking → confirm → wizard → payment = Cash → submit. Check:
- `inspection_records` — `payment_status = 'paid'` immediately, `payment_method = 'cash'`
- Portal — "Complete" immediately, no Pay Now ever shown

---

## COMPLETED

### Roles & Auth
- [x] Admin vs Inspector role gating (Session 10)
- [x] Inspector CRUD via manage-inspector function (Session 10)
- [x] Session passthrough to wizard — no PIN (Session 10)
- [x] Hardcoded admin fallback login (Session 12)

### Inspection Wizard
- [x] HHC, HI, NC, Add-On sections (Sessions 13–15)
- [x] Per-item notes, voice, photo (Session 15)
- [x] PDF / image upload to Cloudinary (Session 14)
- [x] Draft save / resume / picker (Session 15)
- [x] Payment picker — Card, Cash, Check, Invoice (Session 15)
- [x] Sticky header indicator pill (Session 16)
- [x] HHC tier selection (Session 16)
- [x] Job picker shows `scheduled` records (Session 22)
- [x] Auto-save never downgrades status (Session 22)
- [x] Walk-in jobs create `scheduled` record (Session 22)

### Bookings
- [x] Consumer booking wizard (Sessions 1–9)
- [x] Confirm & Assign modal (Session 12)
- [x] Calendar event creation / dedup guard (Session 20)
- [x] Booking status set to `confirmed` on confirm — disappears from Bookings UI (Session 22)

### Client Records Tab
- [x] Filter / sort / CSV export (Session 12)
- [x] All action buttons wired (Session 20)
- [x] Copy Portal Link (Session 20)
- [x] `scheduled` status — amber border, Edit + Delete only (Session 22)
- [x] `submitted` status — green border, all 8 buttons (Session 22)
- [x] Scheduled filter button (Session 22)
- [x] `final_total` replaces `invoice_amount` (Session 22)
- [x] Revenue page reads `final_total` (Session 22)

### Client Portal
- [x] Full portal in Inspector Wizard world (Session 18)
- [x] Token-based access (Session 18)
- [x] `inspection_records` only — no booking stitching (Session 22)
- [x] `isPaid()` = one line from `payment_status` (Session 22)
- [x] Pay Now, reschedule, cancel (Sessions 18–20)
- [x] Reports tab, Invoices tab (Sessions 18–20)

### Payment Flow
- [x] Online pre-pay via `invoice.html?booking=` (Session 19)
- [x] `record-online-payment` writes to `inspection_records` (Session 22)
- [x] On-site Cash/Check/Card with signature (Session 15)
- [x] Invoice / Bill Later (Session 15)
- [x] `payment_status` unified across all paths (Session 22)

### Emails
- [x] Booking confirmation — single portal button (Session 21)
- [x] Report email — single portal button (Session 21)
- [x] Invoice-only resend (Session 21)
- [x] Portal token — delete-then-insert, never expires (Session 18)

### Broadcasts Tab
- [x] Promotions, Google Review, 90 Day, 11 Month sections (Session 21)
- [x] Send History (Session 21)
- [x] send-broadcast.js (Session 21)

### Architecture Overhaul (Session 22)
- [x] `inspection_records` as single source of truth
- [x] Dead columns dropped from `inspection_records`
- [x] `confirm-booking-email.js` creates placeholder + sets booking status to `confirmed`
- [x] `save-draft.js` finds confirmed record by `booking_id`, fills it in
- [x] `get-portal.js` — email lookup only, no stitching
- [x] `get-clients.js` — comma-separated status filter
- [x] `draft` status eliminated — replaced with `scheduled` everywhere
- [x] Status check constraint updated in Supabase
- [x] DELETE policy added to bookings table

---

## IN PROGRESS

### E2E Testing (Session 22 — stopped mid-test)
- [x] Step 1: Book ✓
- [x] Step 2: Confirm — booking deletes, record creates as `scheduled` ✓ (pending retest with DELETE policy fix)
- [ ] Step 3: Portal shows scheduled card
- [ ] Step 4: Wizard finds scheduled record, submits
- [ ] Step 5: Online payment flow
- [ ] Step 6: Cash payment flow

### Broadcasts Tab
- [x] Create `broadcast_logs` table in Supabase (Session 22)
- [ ] Live test all four send types

### Client Portal
- [ ] Agreements tab — signing UI not yet wired
- [x] cancel-booking.js — points at inspection_records, validates ownership there, still clears calendar via bookings (Session 22)
- [x] request-reschedule.js — points at inspection_records, validates ownership there, mirrors to bookings for calendar awareness (Session 22)
- [x] reschedule_requested / reschedule_date / reschedule_time / calendar_event_id added to inspection_records schema (Session 22)
- [x] get-portal.js — selects reschedule fields from inspection_records (Session 22)
- [x] invoice.html — already reads from inspection_records (confirmed Session 22)

---

## OPEN

### Bookings → Full Cleanup (next logical step after E2E passes)
- [x] `cancel-booking.js` — points at `inspection_records` (Session 22)
- [x] `request-reschedule.js` — points at `inspection_records` (Session 22)
- [x] `invoice.html` — already reads `final_total` and `payment_status` from `inspection_records` (confirmed Session 22)
- [ ] Once above done: `bookings` is pure intake — could auto-purge after confirm

### Inspection Wizard
- [x] Retire `inspector.html` — nav link removed from admin sidebar (Session 22)

### Metrics Page
- [ ] Inspector metrics in My Account must mirror Metrics page definition
- [ ] Review add-on penetration accuracy

### Agent Portal
- [ ] Vet existing dedicated booking tool
- [ ] Client cards — agent name, client contact, address, report

### Admin Misc
- [ ] **Restructure Client Records tab** — discuss and redesign (Session 22)
- [ ] Section Templates — evaluate, likely remove
- [ ] Service FAQs — move to Settings group
- [ ] Confirm and Assign UX review

### QA Log, Audit Log, Contractors Directory
- [ ] Clarify purpose and improve UX

### Add-on Recommendations
- [ ] Make easier to understand

### Legal Agreements
- [ ] Upload / add / edit / delete in admin
- [ ] Send correct waiver on confirm based on service type
- [ ] Signed / not signed indicator in Client Records

### Email Templates (admin UI)
- [ ] Booking confirmation, Confirm/portal, Report, Invoice resend, Google Review, 90 Day, 11 Month

### Dead Code to Remove
- [ ] `resolve-portal-token.js` — dead function, nothing calls it
- [ ] `record-payment.js` — old payment path predating Stripe, likely dead
- [ ] `report-invoice.html` — possibly legacy file
- [ ] `send-portal-link.js` — nothing calls it; uses old client_id schema, not cust_email; Azure/MS Graph never configured
- [ ] `send-invoice.js` — "Resend Invoice" in admin calls send-report-email instead; this is fully orphaned and uses old client_id schema

---

## FINAL LAUNCH STEPS
- [x] Create `broadcast_logs` table in Supabase (Session 22)
- [ ] Point GoDaddy DNS to Netlify
- [ ] Add custom domain in Netlify dashboard
- [ ] Update `SITE_URL` env var to `heartlandinspectiongroup.com`
- [ ] Test all functions on live domain
- [ ] Retire `quiet-mousse-ce00ef.netlify.app`

---

## SESSION UPDATES (Current Session)

### Completed
- [x] Audit log infrastructure — `audit_log` table, `write-audit-log.js`, `log-audit-event.js`, `get-audit-log.js`, `clear-audit-log.js`
- [x] Audit log wired across all key events — bookings, payments, agreements, agent assignment, report release
- [x] Audit log tab rebuilt — Client | Category | Event | Actor | Time columns with hover tooltip
- [x] Agent report release toggle on client portal job cards (Approve/Deny per report type)
- [x] `agent_name` column added to `inspection_records`
- [x] Cancel/Reschedule flow rebuilt — all three portals (client, agent, admin) use `reschedule-booking.js`
- [x] `reschedule-booking.js` fully rewritten — delete old calendar event, cancel old records, create new pending booking, call `create-calendar-event`
- [x] Admin Edit and Reschedule buttons separated on both booking cards and scheduled cards
- [x] Admin reschedule modal with live availability calendar (reads from `cfg`)
- [x] Cancelled booking cards cleaned up — red label, Delete only, section collapsed by default
- [x] Field Photos offline mode — Go Offline button, offline banner, blob storage, ZIP download, Go Online sync modal
- [x] Inspector Wizard offline button relabeled to "🔴 Go Offline"
- [x] Section Templates tab removed from admin

### TODO
- [ ] V2 Inspection Wizard — rebuild dynamically driven by Supabase (sections, fields, conditions all configurable from admin)
- [ ] QA Review — full flow (inspector notification on revision, report delivery on approval, proper revision modal)
- [ ] Contractor Directory — client-facing delivery of recommendations from report
- [ ] Delete `inspection_sections` table from Supabase (Section Templates removed)

---

## UPCOMING FEATURE SESSIONS

### 🤖 AI Report Narrative Generation — PRIORITY
Use Anthropic API to generate professional written report narratives from wizard form data.
- "Generate Narrative" button in wizard post-submit or in admin Client Records
- Input: structured form_data (sections, checkboxes, findings, scores, photos)
- Output: professional paragraph-per-section narrative inserted into report
- Biggest time saver in the inspection business — 2-4 hrs per job reduced to minutes
- Already calling Anthropic API in artifacts — same pattern applies here
- Discuss: per-section generation vs full report at once, inspector edit before delivery

### 📅 Inspector Calendar View
Visual calendar showing all inspectors' booked jobs per day — who's assigned what, no double-booking.
- Admin-facing only
- Shows jobs by inspector, color-coded
- Highlights conflicts
- Fun build, good visual value

### 📊 QuickBooks / Accounting Export
CSV export of submitted + paid inspection records formatted for QuickBooks import.
- Fields: date, client, address, amount, payment method, category
- Could be a button in admin Revenue tab or Client Records
- Simple build, saves hours per month for every client

### 🏆 Agent Referral Performance Dashboard
Show Jake which agents send the most business.
- Volume, revenue, repeat bookings per agent
- Trend over time (this month vs last month vs all time)
- Exportable
- Needed, not just nice-to-have — agents love knowing their standing, inspectors love knowing who to prioritize

### 📱 Inspector Wizard Mobile Vet — PRE-LAUNCH
Full walkthrough of inspector-wizard.html on mobile/tablet before launch.
- Tap target sizes
- Camera integration
- Section navigation on small screens
- Photo capture and annotation on mobile
- Swipe gestures
- Flag anything that needs fixing before launch

### 📋 Pre-Inspection Agreement Email — DISCUSS BEFORE LAUNCH
Automatically send agreement signing link to client before inspection day.
- Timing: 24-48 hours before scheduled inspection_date
- Reduces on-site friction and liability
- Needs legal/workflow discussion before building

### ⏰ Client Reminder Emails — DISCUSS BEFORE LAUNCH
Automatic 48hr and 24hr reminder emails to client before their inspection.
- Reduces no-shows
- Needs discussion: tone, content, opt-out, timing rules
- Simple Netlify scheduled function or Supabase cron

### 🔁 Auto Follow-Up Emails — DISCUSS BEFORE LAUNCH
Trigger broadcast emails automatically based on inspection_date.
- 90-day check-in: auto-send 90 days after submitted inspection
- 11-month reminder: auto-send 11 months after submitted inspection
- Google review: auto-send X days after submitted inspection
- Currently manual — making it automatic is zero extra work for inspector
- Needs discussion: opt-out handling, timing, overlap with manual sends

---

## WHITE-LABEL TEMPLATE (future website selling)

Goal: onboarding a new client = set 8 Netlify env vars + update config_json. Zero code changes per client.

### Phase 1 — Functions: move hardcoded brand values to env vars (~45 min)
All 15 functions currently hardcode the same 6-8 values at the top. Replace with `process.env.*` with Heartland values as fallback.

**New Netlify env vars (set once per client in Netlify dashboard):**
- `COMPANY_NAME` — e.g. "Heartland Inspection Group"
- `COMPANY_PHONE` — e.g. "(815) 329-8583"
- `COMPANY_PHONE_RAW` — e.g. "8153298583"
- `COMPANY_EMAIL` — e.g. "info@heartlandinspectiongroup.com"
- `COMPANY_WEBSITE` — e.g. "https://www.heartlandinspectiongroup.com"
- `FROM_EMAIL` — e.g. "no-reply@heartlandinspectiongroup.com"
- `BCC_EMAIL` — e.g. "jake@heartlandinspectiongroup.com"
- `CALENDAR_USER` — e.g. "jake@heartlandinspectiongroup.com"
- `LOGO_URL` — e.g. "https://i.imgur.com/I1vTiVT.png"
- `COMPANY_CITY` — e.g. "Roscoe, IL 61073"
- `FACEBOOK_URL` — e.g. "https://www.facebook.com/heartlandinspectiongroup"
- `INSTAGRAM_URL` — e.g. "https://www.instagram.com/heartlandinspectiongroup"
- `YOUTUBE_URL` — e.g. "https://www.youtube.com/@heartlandinspectiongroup"

**Functions to update:**
- `lib/email-template.js` — phone, email, website, logo, city, social links
- `lib/ms-graph.js` — FROM_EMAIL, FROM_NAME
- `create-calendar-event.js` — FROM_EMAIL, FROM_NAME, JAKE_EMAIL, CALENDAR_USER, logo, phone, email, website
- `cancel-booking.js` — PHONE, FROM_EMAIL, FROM_NAME, JAKE_EMAIL, CALENDAR_USER
- `reschedule-booking.js` — JAKE_EMAIL, CALENDAR_USER
- `send-report-email.js` — FROM_EMAIL, FROM_NAME, BCC_EMAIL, logo, phone, email, website, social links
- `send-broadcast.js` — FROM_EMAIL, FROM_NAME, BCC_EMAIL
- `record-field-payment.js` — logo, phone, email, company name
- `get-agreements.js` — company name, phone, email
- `get-availability.js` — CALENDAR_USER
- `update-calendar-event.js` — CALENDAR_USER
- `sign-waiver.js` — phone
- `send-agent-portal-link.js` — company name
- `generate-report.js` — company name
- `request-reschedule.js` — FROM_EMAIL, FROM_NAME, JAKE_EMAIL

### Phase 2 — HTML: read brand values from config_json (~45 min)
Logo URL and company name appear ~15 times across 4 files. Already load config_json via config-loader.js — just wire the values through on config ready.

**Files to update:**
- `admin.html` — logo (×2), company name (×3), phone, email, website
- `inspector-wizard.html` — logo (×7), company name (×2)
- `client-portal.html` — logo (×3), company name (×3), phone, email
- `agent-portal.html` — logo (×4), company name (×4), phone, email

**New config_json fields needed:**
- `company_name`
- `company_phone`
- `company_phone_raw`
- `company_email`
- `company_website`
- `logo_url`

### Phase 3 — Broadcast email copy (~30 min)
Broadcast templates in admin.html have company name baked into sentences. Decision: leave as manually editable in the admin Broadcasts UI (inspector edits them to match their voice anyway). No code change needed — just document this in the onboarding checklist.

### Phase 4 — CSS theme system (~2 hrs, separate session)
One `theme.css` file with CSS variables. 5 pre-built themes (color palettes + font pairings). Each client picks a theme — no custom CSS work needed.
- World 1 (Admin/Index): `--brand-primary`, `--brand-accent`, `--brand-font-heading`, `--brand-font-body`
- World 2 (Wizard/Portal): same variables, dark navy base stays constant, accent color swappable
- World 3 (Emails/Reports): driven by `brand.css` which already uses variables

### Onboarding checklist per new client (post-build)
1. Spin up Supabase project, run setup SQL
2. Create Netlify site, set 13 env vars
3. Update config_json with their pricing, availability, branding
4. Upload their logo to Cloudinary or Imgur, set LOGO_URL
5. Set up Resend with their domain
6. Configure Azure/Outlook for their calendar user
7. Set up Stripe with their account
8. Set up Cloudinary (use shared account or their own)
9. Add their inspectors via admin Add Inspector
10. Point their domain DNS to Netlify
11. Edit broadcast email copy in admin to match their voice
12. Run E2E test booking end-to-end
