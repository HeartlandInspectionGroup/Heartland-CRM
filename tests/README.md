# Testing — Heartland Inspection Group

## Quick Start

```bash
# Run all unit tests
npm run test:unit

# Run E2E tests (requires Netlify Dev running)
npx netlify dev &    # start in background first
npm run test:e2e

# Run E2E in headed mode (see the browser)
npm run test:e2e:headed

# Run everything
npm test
```

## Test Structure

```
tests/
├── unit/                          # Vitest — fast, no server needed
│   ├── address-parser.test.js     # parseAddress + normalizeAddress
│   ├── normalizers.test.js        # RentCast/Mashvisor/Realtor/Zillow normalizers
│   ├── recommendations.test.js    # Service recommendation rules engine
│   └── tier-matching.test.js      # Home size tier range matching
├── e2e/                           # Playwright — needs `npx netlify dev`
│   ├── navigation.spec.js         # Nav links, dropdowns, mobile menu
│   ├── service-pages.spec.js      # All 10 service pages load correctly
│   ├── form-test.spec.js          # Property data test page
│   └── homepage.spec.js           # Homepage sections, service cards, wizard
└── README.md                      # This file
```

## Prerequisites

- **Unit tests:** No prerequisites — runs standalone.
- **E2E tests:** Requires `npx netlify dev` running on port 8888.
- **Full integration tests:** Some E2E tests may need Netlify env vars (RENTCAST_API_KEY, etc.) for API-dependent features.

## Adding New Tests

### Unit tests
1. Create a new `.test.js` file in `tests/unit/`
2. Import from `vitest` and the module under test
3. For testing `availability-config.js` (uses `var`), use the `vm` module pattern:
   ```js
   import { readFileSync } from 'fs';
   import { createContext, Script } from 'vm';
   const source = readFileSync('assets/js/availability-config.js', 'utf-8');
   const ctx = createContext({});
   new Script(source).runInContext(ctx);
   const CONFIG = ctx.HEARTLAND_CONFIG;
   ```
4. For testing Netlify Functions, import exported functions:
   ```js
   const { parseAddress } = require('../../functions/property-details');
   ```

### E2E tests
1. Create a new `.spec.js` file in `tests/e2e/`
2. Import from `@playwright/test`
3. Tests run against `http://localhost:8888` (Netlify Dev)
4. Avoid tests that consume paid API calls (RentCast has a 50/month limit)

## Environment Variables for Full Integration Tests

These are only needed if you want E2E tests to exercise real API endpoints:

- `RENTCAST_API_KEY` — property data lookups (50 calls/month limit!)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — cache layer
- `REALTOR_RAPIDAPI_KEY` — alternative property provider
