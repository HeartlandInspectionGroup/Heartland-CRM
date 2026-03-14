/**
 * Netlify Function: property-details
 *
 * Looks up property details (year built, living area sqft, bedrooms,
 * bathrooms, property type, basement) from an address. Keeps API keys
 * server-side for security. Supports multiple providers.
 *
 * ─── CACHE LAYER ──────────────────────────────────────────────────────
 *   Uses Supabase property_cache table (server-side via service role).
 *   Cache-first: returns cached data if < 90 days old, otherwise calls API.
 *   All API calls are logged to api_call_log for usage tracking.
 *
 * ─── KILL SWITCH ──────────────────────────────────────────────────────
 *   RentCast free tier = 50 calls/month. Once reached, the provider is
 *   disabled for the remainder of the month to avoid charges.
 *   Configurable via RENTCAST_MONTHLY_LIMIT env var (default: 50).
 *
 * ─── PROVIDERS (set via PROPERTY_API_PROVIDER env var) ───────────────
 *
 *   "rentcast" (default)
 *     → Base URL: https://api.rentcast.io/v1
 *     → GET /properties?address=...
 *     → Auth header: X-Api-Key
 *     → Env var: RENTCAST_API_KEY
 *     → Docs: https://developers.rentcast.io/reference/property-records
 *     → 50 free calls included, then paid plans
 *
 *   "mashvisor"
 *     → Base URL: https://mashvisor-team.p.rapidapi.com
 *     → GET /property?address=...&city=...&state=...&zip_code=...
 *     → Auth: x-rapidapi-key / x-rapidapi-host headers
 *     → Env var: MASHVISOR_RAPIDAPI_KEY
 *     → RapidAPI: https://rapidapi.com/mashvisor-team/api/mashvisor
 *
 *   "realtor" (Realtor.com via RapidAPI)
 *     → Host: realtor.p.rapidapi.com
 *     → Two-step: /locations/auto-complete → /properties/v2/detail
 *     → Auth: x-rapidapi-key / x-rapidapi-host headers
 *     → Env var: REALTOR_RAPIDAPI_KEY
 *     → RapidAPI: https://rapidapi.com/apidojo/api/realty-in-us
 *
 *   "zillow-working-api" (kept for future use if approved)
 *     → Host: zillow-working-api.p.rapidapi.com
 *     → GET /pro/byaddress?propertyaddress=...
 *     → Env var: ZILLOW_RAPIDAPI_KEY
 *
 *   "zillow-com1" (kept for future use if approved)
 *     → Host: zillow-com1.p.rapidapi.com
 *     → Two-step: /propertyExtendedSearch → /property
 *     → Env var: ZILLOW_RAPIDAPI_KEY
 *
 * Environment variables (set in Netlify dashboard):
 *   PROPERTY_API_PROVIDER      — Provider name (optional, defaults to "rentcast")
 *   RENTCAST_API_KEY           — RentCast API key
 *   RENTCAST_MONTHLY_LIMIT     — Max RentCast calls/month (default: 50)
 *   MASHVISOR_RAPIDAPI_KEY     — RapidAPI key (for mashvisor provider)
 *   REALTOR_RAPIDAPI_KEY       — RapidAPI key (for realtor provider)
 *   ZILLOW_RAPIDAPI_KEY        — RapidAPI key (for zillow providers)
 *   SUPABASE_URL               — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Supabase service role key (server-side only)
 *
 * Endpoint: GET /.netlify/functions/property-details?address=123+Main+St,+Roscoe,+IL+61073
 */

const { createClient } = require('@supabase/supabase-js');

const API_PROVIDER = process.env.PROPERTY_API_PROVIDER || 'rentcast';
const RENTCAST_MONTHLY_LIMIT = parseInt(process.env.RENTCAST_MONTHLY_LIMIT, 10) || 50;
const CACHE_MAX_DAYS = 90;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=86400',
};

// ═══════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT (lazy init — only created when needed)
// ═══════════════════════════════════════════════════════════════════════
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════
// CACHE: Read / Write / Kill Switch
// ═══════════════════════════════════════════════════════════════════════
function normalizeAddress(addr) {
  return addr.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function getCachedProperty(address) {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_MAX_DAYS);

    const { data, error } = await sb
      .from('property_cache')
      .select('*')
      .eq('address', address)
      .gte('cached_at', cutoff.toISOString())
      .single();

    if (error || !data) return null;
    return data;
  } catch (err) {
    console.warn('Cache read failed:', err.message);
    return null;
  }
}

async function upsertCache(address, yearBuilt, sqft, rawData, normalized, source) {
  const sb = getSupabase();
  if (!sb) return;

  try {
    await sb.from('property_cache').upsert({
      address,
      year_built: yearBuilt || null,
      sqft: sqft || null,
      raw_data: rawData || {},
      normalized: normalized || {},
      source,
      cached_at: new Date().toISOString(),
    }, { onConflict: 'address' });
  } catch (err) {
    console.warn('Cache write failed:', err.message);
  }
}

async function logApiCall(provider, address, success) {
  const sb = getSupabase();
  if (!sb) return;

  try {
    await sb.from('api_call_log').insert({
      provider,
      address,
      success,
    });
  } catch (err) {
    console.warn('API call log failed:', err.message);
  }
}

async function getMonthlyCallCount(provider) {
  const sb = getSupabase();
  if (!sb) return 0;

  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count, error } = await sb
      .from('api_call_log')
      .select('*', { count: 'exact', head: true })
      .eq('provider', provider)
      .gte('called_at', monthStart.toISOString());

    if (error) return 0;
    return count || 0;
  } catch (err) {
    console.warn('Call count check failed:', err.message);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: RentCast (default)
// ═══════════════════════════════════════════════════════════════════════
async function fetchViaRentCast(address) {
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) return null;

  const url =
    'https://api.rentcast.io/v1/properties' +
    '?address=' + encodeURIComponent(address);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Api-Key': apiKey,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('RentCast API error (' + res.status + '):', errText);
    return null;
  }

  const data = await res.json();

  if (Array.isArray(data)) {
    return data.length > 0 ? data[0] : null;
  }
  return data;
}

function normaliseRentCast(data) {
  if (!data) return { found: false };

  return {
    found: !!(data.yearBuilt || data.squareFootage),
    yearBuilt: data.yearBuilt || null,
    livingAreaSqft: data.squareFootage || null,
    lotSize: data.lotSize || null,
    bedrooms: data.bedrooms || null,
    bathrooms: data.bathrooms || null,
    propertyType: data.propertyType || null,
    hasBasement: data.features?.basement != null ? true : null,
    foundationType: data.features?.foundation || null,
    roofType: data.features?.roof || null,
    zestimate: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: Mashvisor (via RapidAPI)
// ═══════════════════════════════════════════════════════════════════════
async function fetchViaMashvisor(address) {
  const apiKey = process.env.MASHVISOR_RAPIDAPI_KEY;
  if (!apiKey) return null;

  const host = 'mashvisor-team.p.rapidapi.com';
  const parts = parseAddress(address);

  const params = new URLSearchParams();
  params.set('address', parts.street);
  if (parts.city) params.set('city', parts.city);
  if (parts.state) params.set('state', parts.state);
  if (parts.zip) params.set('zip_code', parts.zip);

  const url = 'https://' + host + '/v1.1/client/property?' + params.toString();

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': host,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Mashvisor API error (' + res.status + '):', errText);
    return null;
  }

  const json = await res.json();
  return json.content?.property_info || json.content || json;
}

function normaliseMashvisor(data) {
  if (!data) return { found: false };

  return {
    found: !!(data.year_built || data.sqft || data.square_feet),
    yearBuilt: data.year_built || null,
    livingAreaSqft: data.sqft || data.square_feet || data.squareFootage || null,
    lotSize: data.lot_size || data.lotSize || null,
    bedrooms: data.beds || data.bedrooms || null,
    bathrooms: data.baths || data.bathrooms || null,
    propertyType: data.property_type || data.propertyType || null,
    hasBasement: data.basement != null
      ? String(data.basement).toLowerCase() !== 'none' &&
        String(data.basement).toLowerCase() !== 'no'
      : null,
    foundationType: data.foundation || null,
    roofType: data.roof || null,
    zestimate: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: Realtor.com (via RapidAPI — realty-in-us)
// Two-step: auto-complete to get property_id, then detail lookup.
// ═══════════════════════════════════════════════════════════════════════
async function fetchViaRealtor(address) {
  const apiKey = process.env.REALTOR_RAPIDAPI_KEY;
  if (!apiKey) return null;

  const host = 'realtor.p.rapidapi.com';
  const apiHeaders = {
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': host,
  };

  // Step 1: Auto-complete to find property_id
  const acUrl =
    'https://' + host + '/locations/auto-complete' +
    '?input=' + encodeURIComponent(address);

  const acRes = await fetch(acUrl, { method: 'GET', headers: apiHeaders });
  if (!acRes.ok) {
    const errText = await acRes.text();
    console.error('Realtor auto-complete error (' + acRes.status + '):', errText);
    return null;
  }

  const acData = await acRes.json();

  // Find the first result that has a property_id (type "address" entries)
  let propertyId = null;
  const autocomplete = acData.autocomplete || [];
  for (let i = 0; i < autocomplete.length; i++) {
    const item = autocomplete[i];
    if (item.mpr_id) {
      propertyId = item.mpr_id;
      break;
    }
  }

  if (!propertyId) {
    console.warn('Realtor: no property_id found for address:', address);
    return null;
  }

  // Step 2: Get full property details
  const detailUrl =
    'https://' + host + '/properties/v2/detail' +
    '?property_id=' + encodeURIComponent(propertyId);

  const detailRes = await fetch(detailUrl, { method: 'GET', headers: apiHeaders });
  if (!detailRes.ok) {
    const errText = await detailRes.text();
    console.error('Realtor detail error (' + detailRes.status + '):', errText);
    return null;
  }

  const detailData = await detailRes.json();
  return detailData.properties?.[0] || detailData.data?.home || detailData;
}

function normaliseRealtor(data) {
  if (!data) return { found: false };

  const desc = data.description || {};
  const yearBuilt = desc.year_built || data.year_built || null;
  const sqft = desc.sqft || desc.building_size?.size || data.building_size?.size || null;
  const beds = desc.beds || data.beds || null;
  const baths = desc.baths || data.baths || null;
  const propType = desc.type || desc.prop_type || data.prop_type || null;
  const lotSize = desc.lot_sqft || data.lot_size?.size || null;

  return {
    found: !!(yearBuilt || sqft),
    yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) || null : null,
    livingAreaSqft: sqft ? parseInt(sqft, 10) || null : null,
    lotSize: lotSize || null,
    bedrooms: beds ? parseInt(beds, 10) || null : null,
    bathrooms: baths ? parseFloat(baths) || null : null,
    propertyType: propType || null,
    hasBasement: null, // Realtor API doesn't reliably surface this
    foundationType: null,
    roofType: null,
    zestimate: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: Zillow Working API (via RapidAPI) — kept for future use
// ═══════════════════════════════════════════════════════════════════════
async function fetchViaZillowWorkingApi(address) {
  const apiKey = process.env.ZILLOW_RAPIDAPI_KEY;
  if (!apiKey) return null;

  const host = 'zillow-working-api.p.rapidapi.com';
  const url =
    'https://' + host + '/pro/byaddress' +
    '?propertyaddress=' + encodeURIComponent(address);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': host,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('zillow-working-api error (' + res.status + '):', errText);
    return null;
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: Zillow.com1 (via RapidAPI) — kept for future use
// ═══════════════════════════════════════════════════════════════════════
async function fetchViaZillowCom1(address) {
  const apiKey = process.env.ZILLOW_RAPIDAPI_KEY;
  if (!apiKey) return null;

  const host = 'zillow-com1.p.rapidapi.com';
  const apiHeaders = {
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': host,
  };

  const searchUrl =
    'https://' + host + '/propertyExtendedSearch' +
    '?location=' + encodeURIComponent(address);

  const searchRes = await fetch(searchUrl, { method: 'GET', headers: apiHeaders });
  if (!searchRes.ok) {
    const errText = await searchRes.text();
    console.error('zillow-com1 search error (' + searchRes.status + '):', errText);
    return null;
  }

  const searchData = await searchRes.json();

  let zpid = null;
  if (searchData.zpid) {
    zpid = searchData.zpid;
  } else if (searchData.props && searchData.props.length > 0) {
    zpid = searchData.props[0].zpid;
  } else if (searchData.results && searchData.results.length > 0) {
    zpid = searchData.results[0].zpid;
  }

  if (!zpid) {
    console.warn('zillow-com1: no zpid found for address:', address);
    return null;
  }

  const propUrl = 'https://' + host + '/property?zpid=' + zpid;
  const propRes = await fetch(propUrl, { method: 'GET', headers: apiHeaders });
  if (!propRes.ok) {
    const errText = await propRes.text();
    console.error('zillow-com1 property error (' + propRes.status + '):', errText);
    return null;
  }

  return propRes.json();
}

function normaliseZillow(data) {
  if (!data) return { found: false };

  const yearBuilt = data.yearBuilt || data.resoFacts?.yearBuilt || null;
  const livingArea =
    data.livingArea ||
    data.resoFacts?.livingArea ||
    data.livingAreaValue ||
    null;
  const lotSize = data.lotSize || data.resoFacts?.lotSize || null;
  const bedrooms = data.bedrooms || data.resoFacts?.bedrooms || null;
  const bathrooms = data.bathrooms || data.resoFacts?.bathrooms || null;
  const propertyType = data.homeType || data.propertyTypeDimension || null;
  const hasBasement =
    data.resoFacts?.basement != null
      ? String(data.resoFacts.basement).toLowerCase() !== 'none' &&
        String(data.resoFacts.basement).toLowerCase() !== 'no basement'
      : null;
  const foundationType = data.resoFacts?.foundationDetails || null;
  const roofType = data.resoFacts?.roofType || null;
  const zestimate = data.zestimate || null;

  return {
    found: !!(yearBuilt || livingArea),
    yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) || null : null,
    livingAreaSqft: livingArea ? parseInt(livingArea, 10) || null : null,
    lotSize: lotSize || null,
    bedrooms: bedrooms ? parseInt(bedrooms, 10) || null : null,
    bathrooms: bathrooms ? parseFloat(bathrooms) || null : null,
    propertyType: propertyType || null,
    hasBasement: hasBasement,
    foundationType: foundationType,
    roofType: roofType || null,
    zestimate: zestimate ? parseInt(zestimate, 10) || null : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ADDRESS PARSER — extract street, city, state, zip from combined address
// ═══════════════════════════════════════════════════════════════════════
function parseAddress(combined) {
  const parts = combined.split(',').map(function (s) { return s.trim(); });

  const result = { street: parts[0] || combined, city: null, state: null, zip: null };

  if (parts.length >= 2) {
    result.city = parts[1];
  }

  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1].trim();
    const m = stateZip.match(/^([A-Z]{2})\s*(\d{5})?/i);
    if (m) {
      result.state = m[1].toUpperCase();
      result.zip = m[2] || null;
    } else {
      const zm = stateZip.match(/(\d{5})/);
      if (zm) result.zip = zm[1];
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════
exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const rawAddress = (event.queryStringParameters || {}).address;
  if (!rawAddress || rawAddress.trim().length < 5) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing or invalid "address" query parameter' }),
    };
  }

  const cacheKey = normalizeAddress(rawAddress);
  const provider = API_PROVIDER;

  // ─── STEP 1: Check cache ───────────────────────────────────────────
  try {
    const cached = await getCachedProperty(cacheKey);
    if (cached) {
      console.info('Cache HIT for:', cacheKey);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ...cached.normalized,
          cached: true,
          source: cached.source,
          cachedAt: cached.cached_at,
        }),
      };
    }
  } catch (err) {
    console.warn('Cache check failed, proceeding to API:', err.message);
  }

  console.info('Cache MISS for:', cacheKey, '— calling provider:', provider);

  // ─── STEP 2: Check kill switch (provider-specific rate limits) ─────
  if (provider === 'rentcast') {
    try {
      const count = await getMonthlyCallCount('rentcast');
      if (count >= RENTCAST_MONTHLY_LIMIT) {
        console.warn('KILL SWITCH: RentCast monthly limit reached (' + count + '/' + RENTCAST_MONTHLY_LIMIT + ')');
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            found: false,
            cached: false,
            source: 'rentcast',
            reason: 'Monthly API limit reached (' + count + '/' + RENTCAST_MONTHLY_LIMIT + '). Property lookup temporarily unavailable.',
            killSwitch: true,
          }),
        };
      }
    } catch (err) {
      console.warn('Kill switch check failed, proceeding cautiously:', err.message);
    }
  }

  // ─── STEP 3: Check that the provider has an API key ────────────────
  const keyMap = {
    'rentcast': process.env.RENTCAST_API_KEY,
    'mashvisor': process.env.MASHVISOR_RAPIDAPI_KEY,
    'realtor': process.env.REALTOR_RAPIDAPI_KEY,
    'zillow-working-api': process.env.ZILLOW_RAPIDAPI_KEY,
    'zillow-com1': process.env.ZILLOW_RAPIDAPI_KEY,
  };

  if (!keyMap[provider]) {
    const envName = {
      'rentcast': 'RENTCAST_API_KEY',
      'mashvisor': 'MASHVISOR_RAPIDAPI_KEY',
      'realtor': 'REALTOR_RAPIDAPI_KEY',
      'zillow-working-api': 'ZILLOW_RAPIDAPI_KEY',
      'zillow-com1': 'ZILLOW_RAPIDAPI_KEY',
    }[provider] || 'API key';

    console.warn('property-details: ' + envName + ' not set for provider "' + provider + '"');
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ found: false, cached: false, reason: 'API key not configured' }),
    };
  }

  // ─── STEP 4: Call the API ──────────────────────────────────────────
  try {
    let rawData;
    let result;

    switch (provider) {
      case 'rentcast':
        rawData = await fetchViaRentCast(rawAddress.trim());
        result = normaliseRentCast(rawData);
        break;

      case 'mashvisor':
        rawData = await fetchViaMashvisor(rawAddress.trim());
        result = normaliseMashvisor(rawData);
        break;

      case 'realtor':
        rawData = await fetchViaRealtor(rawAddress.trim());
        result = normaliseRealtor(rawData);
        break;

      case 'zillow-com1':
        rawData = await fetchViaZillowCom1(rawAddress.trim());
        result = normaliseZillow(rawData);
        break;

      case 'zillow-working-api':
        rawData = await fetchViaZillowWorkingApi(rawAddress.trim());
        result = normaliseZillow(rawData);
        break;

      default:
        console.warn('property-details: unknown provider "' + provider + '", falling back to rentcast');
        rawData = await fetchViaRentCast(rawAddress.trim());
        result = normaliseRentCast(rawData);
        break;
    }

    // ─── STEP 5: Log the API call ──────────────────────────────────
    const success = !!(result && result.found);
    await logApiCall(provider, cacheKey, success);

    // ─── STEP 6: Cache the result ──────────────────────────────────
    if (result && result.found) {
      await upsertCache(
        cacheKey,
        result.yearBuilt,
        result.livingAreaSqft,
        rawData,
        result,
        provider
      );
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ...result,
        cached: false,
        source: provider,
      }),
    };
  } catch (err) {
    console.error('property-details error:', err);
    // Log failed call attempt
    await logApiCall(provider, cacheKey, false).catch(() => {});
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ found: false, cached: false, reason: err.message }),
    };
  }
};

// Export pure functions for unit testing
exports.parseAddress = parseAddress;
exports.normalizeAddress = normalizeAddress;
exports.normaliseRentCast = normaliseRentCast;
exports.normaliseMashvisor = normaliseMashvisor;
exports.normaliseRealtor = normaliseRealtor;
exports.normaliseZillow = normaliseZillow;
