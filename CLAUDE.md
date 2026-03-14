# CLAUDE.md — Heartland Inspection Group CRM

> **READ THIS FIRST.** This file is the authoritative reference for every Claude session.
> Before touching any file, read the relevant sections below.

---

## ⚠️ DEPLOY COMMAND (authoritative)

Working directory: `/home/claude/site/`

```bash
cd /home/claude/site
rm -f /mnt/user-data/outputs/heartland-website-flat.zip
zip -qr /mnt/user-data/outputs/heartland-website-flat.zip \
  admin.html inspector-wizard.html inspector.html inspection-wizard.html index.html \
  client-portal.html invoice.html invoice-receipt.html agent-portal.html report.html \
  report-invoice.html report-receipt.html agreement-receipt.html success.html faq.html \
  scheduler.html branding-guidelines.html field-photos.html \
  brand.css manifest.json robots.txt sw.js netlify.toml package.json package-lock.json \
  vitest.config.js config.js CLAUDE.md TODO.md \
  functions/ assets/ images/ services/ shared/ scripts/ docs/ tests/
```

Files MUST be at root of zip. Test: `unzip -l` and confirm `admin.html` not nested.

**Test URL:** https://quiet-mousse-ce00ef.netlify.app
**Production:** https://heartlandinspectiongroup.com

---

## Architecture Overview

Flat-file Netlify site. No build step. No framework. Vanilla HTML/CSS/JS.
Backend: Supabase (PostgreSQL + RLS) + Netlify Functions (Node.js serverless).

### Key Constants (all set in config.js)
- `window.SUPABASE_URL` = `https://fusravedbksupcsjfzda.supabase.co`
- `window.SUPABASE_ANON_KEY` = anon key (safe for client-side reads with RLS)
- `window.ADMIN_TOKEN` = `3824d37e48745602d2f7de3bffd74fbf98063228b557110d`
- Brand phone: `(815) 329-8583`
- Logo: `https://i.imgur.com/I1vTiVT.png`
- Cloudinary: cloud `dmztfzqfm`, preset `slvlwkcf`
- BCC: `jake@heartlandinspectiongroup.com`
- Geoapify key: `5d418eda80154ea2abaf816531ac89d1`
- Timezone: `America/Chicago`

---

## ⚠️ SHARED FILES — NEVER DUPLICATE INLINE

The `/shared/` directory contains modules used across multiple pages.
**Always use `<link>` or `<script src>`. Never copy their contents inline.**

### `/shared/config-loader.js`
Fetches `HEARTLAND_CONFIG` from Supabase `config_json` once, fires `heartland-config-ready` event.
- **Load after** `config.js`
- **Used by:** `agent-portal.html`, `inspector-wizard.html`, `client-portal.html`
- Pages listen: `window.addEventListener('heartland-config-ready', fn, { once: true })`
- **Do NOT** write inline config fetches on pages that load this script.
- **Do NOT** manually dispatch `heartland-config-ready`.

### `/shared/booking-tool.css`
All `.apw-*` and `.wiz-*` CSS for the 4-step booking wizard.
- **Used by:** `agent-portal.html`, `inspector-wizard.html`
- **Do NOT** copy these classes inline — they were removed from both pages.
- Scoped overrides (e.g. `#walkinOverlay .apw-logo`) may remain inline in the page.

### `/shared/booking-tool.js`
Shared utilities: `BookingTool.initCalendar`, `fetchBusy`, `renderCalendar`, `renderTimeSlots`, `getSlots`, `initGeoapify`.
- Exposes `window.BookingTool`
- **Not yet wired** into apw/iwb (still inline). Future work: migrate to use this.

### `/shared/hw-dialogs.js`
Injects `hwAlert(msg, opts)`, `hwConfirm(msg, opts)`, `hwToast(msg, opts)`.
- **Used by:** `inspector-wizard.html`, `agent-portal.html`
- `admin.html` and `client-portal.html` have their own dialog implementations — do not change those.
- **Never use bare `alert()` / `confirm()` / `prompt()`** on pages that load hw-dialogs.

### `/shared/header.js`, `/shared/footer.js`
Public-facing pages only. Not loaded by app pages (admin, portals, wizard).

---

## Page Inventory

| File | Role | Notes |
|------|------|-------|
| `index.html` | Public homepage | **NEVER EDIT** |
| `admin.html` | Admin panel | Auth: ADMIN_TOKEN |
| `agent-portal.html` | Agent booking + client lookup | Auth: portal_token |
| `inspector-wizard.html` | Inspector field report tool | Auth: PIN / auto-login |
| `client-portal.html` | Client agreements + invoice | Auth: portal link token |
| `invoice.html` | Stripe Pay Now page ONLY | Never link here for "View Invoice" |
| `invoice-receipt.html` | ALL "View Invoice" buttons | — |
| `report.html` | Interactive report viewer | — |
| `report-receipt.html` | Print/PDF report | — |
| `field-photos.html` | Inspector photo upload | — |
| `agreement-receipt.html` | Print/PDF signed agreement | — |
| `inspector.html` | RETIRED — never edit | — |

### Orphaned Pages (not linked from anywhere — keep but do not edit)
- `inspection-wizard.html` — old version of the wizard, superseded by `inspector-wizard.html`
- `inspector.html` — retired inspector tool
- `scheduler.html` — Spectora scheduling embed, not currently linked
- `branding-guidelines.html` — internal reference page, not currently linked
- `faq.html` — not currently linked
- `success.html` — not currently linked

---

## Data Architecture

- `inspection_records` = single source of truth for all inspections
- `bookings` = intake queue only; confirmed bookings become inspection_records
- `isPaid(rec)` = `rec.payment_status === 'paid'` — no other checks

### Supabase Tables
| Table | Purpose |
|-------|---------|
| `inspection_records` | All inspection data, status, payment |
| `bookings` | Agent/walk-in intake queue |
| `config_json` | Single row (id=1): live HEARTLAND_CONFIG blob |
| `waiver_versions` | Active agreement templates |
| `waiver_signatures` | Per-record signed agreements |
| `field_photos` | Cloudinary photo refs |
| `agents` | Agent portal users |

### field_photos Schema
```sql
create table field_photos (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references inspection_records(id) on delete cascade,
  section_id text not null,
  subsection_id text,
  cloudinary_url text not null,
  cloudinary_public_id text,
  caption text,
  created_at timestamptz default now()
);
```

---

## Visual Design System

| Token | Value |
|-------|-------|
| Dark navy bg | `#121e30` |
| Mid navy | `#1a2a44` |
| Brand green | `#27ae60` |
| Heading font | Barlow Condensed (uppercase, letter-spacing) |
| Body font | Barlow |

**Never use:** bare `alert()`/`confirm()`, Bootstrap, Tailwind, jQuery.

---

## Inspector Wizard

### Category / Tier Reference
```
currentCategory:
  'home_health_check'  → tiers: Standard, Premium, Signature
  'home_inspection'    → tiers: Pre Purchase, Pre Listing
  'new_construction'   → tiers: Pre Pour, Pre Drywall, Final Walkthrough
  'addon'              → standalone add-on
  'bundle_addon'       → add-on bundled with main inspection
```

### Critical State Globals
| Variable | Meaning |
|----------|---------|
| `currentDraftId` | UUID of active inspection_record |
| `currentInspector` | `{ id, name, role }` |
| `currentCategory` | Active job category |
| `currentTier` | Active job tier |
| `agreementsBlocked` | true = submit locked |
| `currentFinalTotal` | Payment amount in dollars |

### Gate Rules (never relax without owner approval)
1. **Agreement gate:** Blocked until all waivers confirmed signed. No draft ID → stays BLOCKED.
2. **Payment gate:** No submission without payment selection.
3. **No report without payment — no exceptions (state law).**

### Walk-In Booking (IWB namespace)
- Config: `iwb.cfg` = `window.HEARTLAND_CONFIG` via `heartland-config-ready` (config-loader.js)
- On success: redirects to `/admin.html#bookings` after 3 seconds
- `openWalkinBooking()` / `closeWalkinBooking()` / `openBundleAddonFromPicker()`

---

## Agent Portal (APW namespace)

- Config: `apw.cfg` = `window.HEARTLAND_CONFIG` via `heartland-config-ready` (config-loader.js)
- Auth: `portal_token` in localStorage, validated against `agents` table

---

## Payment Flows

| Flow | Function | Result |
|------|----------|--------|
| Client portal card | `invoice.html` → Stripe → `record-online-payment.js` | `payment_status: 'paid'` |
| Field card/cash/check | `record-field-payment.js` | `payment_status: 'paid'` |
| Wizard card | `create-payment.js` → `save-draft` | `payment_status: 'paid'` |

---

## Agreement Architecture

- `waiver_versions`: active waivers (`id`, `name`, `applies_to`, `is_active`)
- `waiver_signatures`: per-record signed agreements
- Gate: `agreementsBlocked = true` on review open. Fails open on network error.
- Portal link via `confirm-booking-email` with `{ booking_id, portal_only: true }`

---

## Netlify Functions

| Function | Purpose |
|----------|---------|
| `confirm-booking-email.js` | Sends confirmation + portal link to client |
| `create-calendar-event.js` | Creates Outlook calendar event |
| `update-calendar-event.js` | Updates calendar event |
| `cancel-booking.js` | Cancels booking + calendar event |
| `reschedule-booking.js` | Reschedules booking |
| `get-availability.js` | Returns busy calendar slots |
| `get-clients.js` | Lists inspection records |
| `get-agreements.js` | Fetches waiver versions + signatures |
| `save-draft.js` | Upserts inspection_record |
| `load-draft.js` | Fetches single inspection_record |
| `create-payment.js` | Stripe PaymentIntent |
| `record-field-payment.js` | Records field payment |
| `record-online-payment.js` | Records client portal Stripe payment |
| `generate-report.js` | Generates report ZIP |
| `send-report-email.js` | Emails report to client |
| `save-config.js` | Saves HEARTLAND_CONFIG to config_json |
| `property-details.js` | Property data lookup |
| `create-invoice.js` | Creates invoice record |

### Required Netlify Env Vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- `RENTCAST_API_KEY`
- `ADMIN_TOKEN`

---

## ⚠️ ARCHITECTURE RULES — READ BEFORE EVERY CHANGE

These rules exist because we spent sessions correcting violations of each one.
**Every PR/change must be checked against this list before deploying.**

---

### 1. DOM Timing — Scripts Must Not Touch the DOM at Parse Time

**Rule:** Never call `getElementById`, `querySelector`, or `addEventListener` at the top level
of a `<script>` block or external JS file. The DOM does not exist yet.

**Correct pattern:**
```js
document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('myBtn');
  if (!btn) return;
  btn.addEventListener('click', handleClick);
});
```

**Also correct — IIFEs that only bind listeners must be inside DOMContentLoaded:**
```js
document.addEventListener('DOMContentLoaded', function() {
  (function() {
    var btn = document.getElementById('myBtn');
    if (!btn) return;
    btn.addEventListener('click', fn);
  })();
});
```

**Exception — functions called via `onclick=` attributes must be GLOBAL (outside DOMContentLoaded):**
```js
// ✓ Global — reachable by onclick="openWalkinBooking()"
function openWalkinBooking() { ... }

// ✗ Wrong — trapped, onclick will throw "not defined"
document.addEventListener('DOMContentLoaded', function() {
  function openWalkinBooking() { ... }  // invisible to onclick
});
```

**Violation symptom:** Button clicks do nothing. Console: `ReferenceError: X is not defined`.

---

### 2. Every `getElementById` Must Have a Matching `id=` in the DOM

**Rule:** Before adding a JS reference to an element by ID, confirm the HTML element exists.
If the element is conditional / not always rendered, add a null guard.

**Null guard pattern:**
```js
var el = document.getElementById('maybeElement');
if (!el) return;  // or if (el) { ... }
```

**Violation symptom:** `Uncaught TypeError: Cannot read properties of null`.

**After any surgical deletion of HTML screens, run:**
```bash
python3 -c "
import re
html = open('inspector-wizard.html').read()
ids_defined = set(re.findall(r'id=[\"\']([\w-]+)[\"\']]', html))
ids_ref = set(re.findall(r'getElementById\([\"\']([\w-]+)[\"\']\)', html))
print('MISSING:', sorted(ids_ref - ids_defined))
"
```

---

### 3. CSS Classes Must Be Defined Before Use

**Rule:** Every class used in HTML or JS-generated HTML must have a CSS rule somewhere —
either inline `<style>`, a shared `.css` file, or a justified inline `style=` attribute.

**When deleting a CSS block, audit what classes it contained and verify they are either:**
- (a) No longer used anywhere, OR
- (b) Defined in another block that is NOT being deleted

**When extracting JS to a separate file, carry over any CSS that only that JS uses.**

**Run after any CSS deletion:**
```bash
python3 << 'EOF'
import re
html = open('FILE.html').read()
booking_css = open('shared/booking-tool.css').read()
styles = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL)
defined = set(re.findall(r'\.([a-zA-Z][\w-]+)', '\n'.join(styles) + booking_css))
used = set()
for m in re.finditer(r'class=["\']([^"\']+)["\']', html):
    for c in m.group(1).split(): used.add(c)
skip = {'active','done','hidden','error','success','disabled','selected','green'}
missing = sorted(used - defined - skip - {c for c in used if '$' in c})
print('MISSING CSS:', missing or 'none')
EOF
```

---

### 4. Globally-Called Functions Must Be at Global Scope

**Rule:** Any function called via `onclick=`, `onchange=`, or any HTML event attribute
must be defined at the top level of a `<script>` block — not inside `DOMContentLoaded`,
not inside an IIFE, not inside another function.

**Check for trapped functions:**
```bash
# Functions in onclick attributes
grep -o 'onclick="[^"]*"' FILE.html | grep -o '[a-zA-Z_]\w*(' | sort -u
# vs functions defined globally in JS files
grep '^function ' scripts/FILE.js | awk '{print $2}' | sed 's/(.*$//'
```

**When extracting code to a new `.js` file**, move onclick-callable functions to
the TOP of the file, outside any wrapper.

---

### 5. Return Values Must Be Captured When Used Downstream

**Rule:** If a function returns a value that will be used later, capture it.
Silent failures from uncaptured returns cause bugs that are impossible to find by reading the code.

**Current known pattern (IWB):**
```js
// ✓ Correct — captures Geoapify handles for later reset
var geoHandles = BookingTool.initGeoapify({ ... });
if (geoHandles) {
  iwb._acCurr = geoHandles.acCurr;
  iwb._acInsp = geoHandles.acInsp;
}
```

**Violation symptom:** `iwbReset()` calls `iwb._acCurr.setValue('')` → silently fails
because `iwb._acCurr` is always `undefined`.

---

### 6. Third-Party Widget Dark-Theme Scoping

**Rule:** Third-party widgets (Geoapify autocomplete, Stripe Elements, etc.) inject their own
CSS that assumes a light theme. When embedding inside a dark overlay, always scope overrides
using the overlay's ID.

**Pattern:**
```css
/* Scope to dark overlay — override Geoapify's light defaults */
#walkinOverlay .geoapify-autocomplete-input {
  background: #1a2a44 !important;
  color: #fff !important;
}
#walkinOverlay .geoapify-autocomplete-items {
  background: #1a2a44 !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
}
#walkinOverlay .geoapify-autocomplete-items div {
  color: #fff !important;
}
#walkinOverlay .geoapify-autocomplete-input-container {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
```

Also override autofill:
```css
#walkinOverlay input:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 1000px #1a2a44 inset !important;
  -webkit-text-fill-color: #fff !important;
}
```

---

### 7. Deleted Screens — Full Audit Required

When removing a screen (HTML block + CSS + JS functions), check ALL of:

| What to check | How |
|---|---|
| HTML elements removed | `grep -n "id=\"deletedId\""` |
| CSS classes removed | Check every class in removed HTML is not used elsewhere |
| JS functions removed | Grep every function name across all files |
| References to removed fns | Grep every removed function name — find all callers |
| References to removed IDs | `getElementById('deletedId')` anywhere |
| `classList` operations on deleted screens | `classList.add/remove/toggle('active')` |
| `style.display` ops on deleted screens | `.style.display =` |

**Screens deleted in March 2026 refactor (DO NOT RESTORE):**
- `pinGate` — PIN entry overlay
- `categoryScreen` — inspection type picker
- `addonScreen` — old addon screen
- `hhcTierScreen` — HHC tier screen
- `tierSelectScreen` — generic tier picker

**Functions deleted with those screens:**
`showCategoryScreen`, `selectCategory`, `goBackToCategory`, `showTierSelectScreen`,
`showAddonScreen`, `showHHCTierDrafts`, `submitInspectorPin`, `resumeHHCDraft`, `selectHHCTier`

---

### 8. Script Load Order Is Sacred

**inspector-wizard.html load order (do not reorder):**
1. `browser-image-compression` (CDN)
2. `@geoapify/geocoder-autocomplete` (CDN) — must be before DOMContentLoaded fires
3. `jszip` (CDN)
4. `/config.js` — sets `window.SUPABASE_URL`, `window.ADMIN_TOKEN`, etc.
5. `/shared/config-loader.js` — fetches HEARTLAND_CONFIG, fires `heartland-config-ready`
6. `/shared/booking-tool.js` — exposes `window.BookingTool`
7. `/scripts/inspector-wizard-iwb.js` — IWB overlay logic
8. `/shared/hw-dialogs.js` (defer) — injects hwAlert/hwConfirm/hwToast
9. Supabase CDN
10. Stripe CDN
11. Inline `<script>` — main wizard logic

**Rule:** `config.js` before everything. `booking-tool.js` before `inspector-wizard-iwb.js`.
`hw-dialogs.js` can be deferred — IWB only calls hw* inside event handlers, never at load time.

---

### 9. IWB Object Contract

`iwb` object in `/scripts/inspector-wizard-iwb.js` must always have:

| Property | Set by | Reset by `iwbReset()`? |
|---|---|---|
| `iwb.step` | `iwbGoTo()` | ✓ |
| `iwb.cfg` | `heartland-config-ready` | ✗ (intentional — config persists) |
| `iwb.category` | step 2 pricing panel | ✓ |
| `iwb.total` | `iwbCalcTotal()` | ✓ |
| `iwb._acCurr` | `DOMContentLoaded` → `initGeoapify` return | ✗ (persists) |
| `iwb._acInsp` | `DOMContentLoaded` → `initGeoapify` return | ✗ (persists) |
| `iwb.calMonth/calYear` | `BookingTool.initCalendar` | ✗ (managed by BookingTool) |

**Do not reset `iwb.cfg` or `iwb.calMonth/calYear` in `iwbReset()` — they are intentionally persistent.**

---

### 10. No Dialog Without hw-dialogs

**Rule:** Never use `alert()`, `confirm()`, or `prompt()` on any page that loads `hw-dialogs.js`.
Pages that load hw-dialogs: `inspector-wizard.html`, `agent-portal.html`.

Use instead:
```js
hwAlert('Message', { title: 'Title', success: true });
hwConfirm('Are you sure?', { title: 'Confirm' }).then(function(ok) { if (ok) doThing(); });
hwToast('Saved!');
```

---

### The Pre-Deploy Audit Checklist

Run mentally (or literally) before every deploy:

- [ ] Every `getElementById` has a matching `id=` in DOM, or has a null guard
- [ ] Every class in HTML/JS-generated HTML has a CSS rule
- [ ] Every `onclick=` function is defined at global scope
- [ ] No script touches DOM at parse time (everything in DOMContentLoaded or event handlers)
- [ ] Return values that are used downstream are captured
- [ ] No references to deleted screens/functions
- [ ] Script load order unchanged
- [ ] No bare `alert()`/`confirm()` on wizard or agent portal
- [ ] Dark overlay inputs have explicit background/color overrides for third-party widgets

---

## Known Technical Debt

- `inspector-wizard.html` (~8100 lines) and `admin.html` (~7800 lines) are monolithic
- `BookingTool` in `shared/booking-tool.js` exists but apw/iwb still use inline implementations
- `TIER_PRICES` / `TIER_AMOUNTS` in wizard are hardcoded, should come from `HEARTLAND_CONFIG`
- Mixed async patterns (async/await vs .then()) throughout
- `admin.html` hw-dialogs defined inline, not via shared/hw-dialogs.js

