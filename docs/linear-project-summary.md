# Heartland Project Review Summary (for Linear)

## What this project is
Heartland is a marketing + booking website for a home inspection business, built as a mostly static site with Netlify Functions for backend workflows.

## Current architecture (high level)
- **Frontend:** Multi-page static HTML site (`index.html`, service pages, FAQ, sample report, scheduler).
- **Shared UI modules:** Reusable header/footer and service FAQ loader scripts in `/shared`.
- **Backend runtime:** Netlify Functions (`/functions`) for calendar availability, calendar event creation, and config persistence.
- **Data/Auth:** Supabase is used for configuration data, FAQ content, and admin authentication.
- **Scheduling:** Spectora embed + iCal sync are used to drive appointment flow and availability.

## Core user flows in production
1. **Visitor discovery** on homepage + service pages.
2. **Booking wizard** on homepage:
   - Loads pricing/config from Supabase.
   - Pulls blocked times from Netlify iCal function.
   - Calculates service totals, tier pricing, discounts, and coupon impact.
3. **Submission flow**:
   - Sends booking payload to Netlify `create-calendar-event` function.
   - Function creates Outlook calendar event and sends customer confirmation email via Microsoft Graph.
4. **Admin flow** (`admin.html`):
   - Supabase-authenticated login.
   - Editors for weekly schedule, date overrides, pricing, coupons, FAQs, and booking settings.
   - Saves normalized config and FAQ data back to Supabase tables.

## Strengths
- Clear separation between static content and backend actions.
- Business-critical booking logic is centralized in the wizard/admin config model.
- Admin panel gives non-developers operational control over pricing, slots, and FAQ content.
- Availability fetch is server-side (avoids browser CORS issues).

## Key risks / technical debt
- **Secret exposure risk:** Supabase URL + anon key are hardcoded in public-facing pages and shared scripts (normal for anon keys, but should still be reviewed alongside RLS policies).
- **Inline monolith scripts:** `index.html` and `admin.html` contain very large inline scripts/styles, which increase maintenance cost and regression risk.
- **Mixed config strategy:** There is active Supabase config persistence and an older GitHub-based `save-config` function in the repo, which can cause confusion if both paths are considered “source of truth.”
- **No visible automated test suite** in repository; behavior appears validated manually.
- **Potential PII sensitivity:** booking flow processes customer contact + property details; compliance/logging posture should be explicitly documented.

## Suggested next actions (ticket-friendly)
1. **Stabilize source of truth:** Decide and document one config persistence approach (Supabase vs GitHub function), then deprecate the other path.
2. **Refactor large inline scripts** into versioned JS modules (`/assets/js`) with smaller units per domain (wizard pricing, availability, admin schedule, FAQ manager).
3. **Add baseline automated checks:** lint + smoke tests for booking calculations and availability slot generation.
4. **Security hardening pass:** verify Supabase RLS policies, rotate keys if needed, and document data-handling practices for booking PII.
5. **Observability:** add structured logs + error tracking for Netlify Functions to speed production debugging.

## One-paragraph Linear blurb
Heartland is a static, Netlify-hosted inspection website with a sophisticated in-page booking wizard, Supabase-backed admin/config workflows, and Netlify Functions that integrate Spectora iCal availability plus Microsoft Graph calendar/email automation. The product is operational and flexible for business users, but maintainability risk is growing due to large inline scripts and mixed legacy/current config paths. Recommended next phase is to consolidate config ownership, modularize frontend logic, and add baseline automated tests + security/observability hardening.
