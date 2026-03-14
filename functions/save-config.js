/**
 * Netlify Function: save-config
 *
 * Reads and writes assets/js/availability-config.js
 * directly to the GitHub repo via the GitHub Contents API.
 *
 * Supports: schedule, dateOverrides, settings, and pricing
 *   (including subtext and subItems on addon services).
 *
 * Requires these Netlify environment variables:
 *   GITHUB_TOKEN        - Personal access token with "repo" scope
 *   GITHUB_REPO_OWNER   - e.g. "yourUsername"
 *   GITHUB_REPO_NAME    - e.g. "heartland-site"
 *   ADMIN_PASSWORD       - Password for admin page login
 *
 * Optional:
 *   CONFIG_FILE_PATH    - defaults to "assets/js/availability-config.js"
 *   GITHUB_BRANCH       - defaults to "main"
 */

const OWNER  = process.env.GITHUB_REPO_OWNER;
const REPO   = process.env.GITHUB_REPO_NAME;
const TOKEN  = process.env.GITHUB_TOKEN;
const PASS   = process.env.ADMIN_PASSWORD;
const PATH   = process.env.CONFIG_FILE_PATH || 'assets/js/availability-config.js';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const ghHeaders = {
  Authorization: `token ${TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'heartland-admin',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Authenticate
  const pw = event.headers['x-admin-password'] || '';
  if (pw !== PASS) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Verify env vars
  if (!OWNER || !REPO || !TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured — missing GitHub env vars' }) };
  }

  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}`;

  try {
    // —— GET: Read current config from GitHub ——
    if (event.httpMethod === 'GET') {
      const res = await fetch(apiBase, { headers: ghHeaders });
      if (!res.ok) {
        const err = await res.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'GitHub read failed', detail: err }) };
      }
      const data = await res.json();
      const content = Buffer.from(data.content, 'base64').toString('utf-8');

      let config = null;
      try {
        const match = content.match(/var\s+HEARTLAND_CONFIG\s*=\s*(\{[\s\S]*\});/);
        if (match) {
          config = new Function('return ' + match[1])();
        }
      } catch (e) {
        // return raw if parse fails
      }

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ sha: data.sha, config, raw: content }),
      };
    }

    // —— POST: Write updated config to GitHub ——
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { config, sha } = body;

      if (!config || !sha) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing config or sha' }) };
      }

      // Auto-clean past date overrides
      if (config.dateOverrides) {
        const today = new Date().toISOString().split('T')[0];
        const cleaned = {};
        for (const [key, val] of Object.entries(config.dateOverrides)) {
          if (key >= today) cleaned[key] = val;
        }
        config.dateOverrides = cleaned;
      }

      // Build the JS file content
      const fileContent = buildConfigFile(config);
      const encoded = Buffer.from(fileContent, 'utf-8').toString('base64');

      const res = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Update availability config via admin panel',
          content: encoded,
          sha: sha,
          branch: BRANCH,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'GitHub write failed', detail: err }) };
      }

      const result = await res.json();
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, newSha: result.content.sha }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};


// ——— Helpers ———————————————————————————————
function esc(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatEntry(entry) {
  if (!entry || entry === 'closed') return 'null';
  if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string') {
    return '["' + entry[0] + '", "' + entry[1] + '"]';
  }
  if (Array.isArray(entry) && Array.isArray(entry[0])) {
    return '[' + entry.map(function(w) { return '["' + w[0] + '", "' + w[1] + '"]'; }).join(', ') + ']';
  }
  return JSON.stringify(entry);
}

function buildConfigFile(cfg) {
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var lines = [];

  lines.push('/**');
  lines.push(' * ============================================');
  lines.push(' * HEARTLAND AVAILABILITY CONFIGURATION');
  lines.push(' * ============================================');
  lines.push(' * Auto-generated by admin panel. Do not edit manually.');
  lines.push(' */');
  lines.push('');
  lines.push('var HEARTLAND_CONFIG = {');
  lines.push('');

  // ——— Schedule ———
  lines.push('  schedule: {');
  for (var i = 0; i < 7; i++) {
    var val = formatEntry(cfg.schedule[i]);
    var padStr = '    ' + i + ': ' + val + ',';
    while (padStr.length < 46) padStr += ' ';
    padStr += '// ' + days[i];
    lines.push(padStr);
  }
  lines.push('  },');
  lines.push('');

  // ——— Date Overrides ———
  if (cfg.dateOverrides && Object.keys(cfg.dateOverrides).length > 0) {
    lines.push('  dateOverrides: {');
    var overrideKeys = Object.keys(cfg.dateOverrides).sort();
    for (var k = 0; k < overrideKeys.length; k++) {
      var dk = overrideKeys[k];
      var ovVal = formatEntry(cfg.dateOverrides[dk]);
      var comma = k < overrideKeys.length - 1 ? ',' : '';
      lines.push('    "' + dk + '": ' + ovVal + comma);
    }
    lines.push('  },');
  } else {
    lines.push('  dateOverrides: {');
    lines.push('  },');
  }
  lines.push('');

  // ——— Settings ———
  lines.push('  INSPECTION_DURATION_HOURS: ' + (cfg.INSPECTION_DURATION_HOURS || 2.5) + ',');
  lines.push('  SLOT_STEP_MINUTES: ' + (cfg.SLOT_STEP_MINUTES || 60) + ',');
  lines.push('  BUFFER_MINUTES: ' + (cfg.BUFFER_MINUTES || 30) + ',');
  lines.push('  PUBLIC_WEEKS_AHEAD: ' + (cfg.PUBLIC_WEEKS_AHEAD || 4) + ',');
  lines.push('  ADMIN_WEEKS_AHEAD: ' + (cfg.ADMIN_WEEKS_AHEAD || 8) + ',');
  lines.push('  TIMEZONE: "' + (cfg.TIMEZONE || 'America/Chicago') + '",');
  lines.push('  MIN_ADVANCE_HOURS: ' + (cfg.MIN_ADVANCE_HOURS !== undefined ? cfg.MIN_ADVANCE_HOURS : 24) + ',');
  lines.push('');

  // ——— Pricing & Services ———
  if (cfg.pricing) {
    lines.push('  pricing: {');

    // Base services
    lines.push('    baseServices: [');
    if (cfg.pricing.baseServices) {
      for (var bs = 0; bs < cfg.pricing.baseServices.length; bs++) {
        var bsvc = cfg.pricing.baseServices[bs];
        var bsComma = bs < cfg.pricing.baseServices.length - 1 ? ',' : '';
        lines.push('      {id: "' + esc(bsvc.id) + '", name: "' + esc(bsvc.name) + '"}' + bsComma);
      }
    }
    lines.push('    ],');

    // Add-on services (with optional subtext and subItems)
    lines.push('    addonServices: [');
    if (cfg.pricing.addonServices) {
      for (var as = 0; as < cfg.pricing.addonServices.length; as++) {
        var asvc = cfg.pricing.addonServices[as];
        var asComma = as < cfg.pricing.addonServices.length - 1 ? ',' : '';
        var parts = 'id: "' + esc(asvc.id) + '", name: "' + esc(asvc.name) + '", price: ' + (asvc.price || 0);
        if (asvc.subtext) {
          parts += ', subtext: "' + esc(asvc.subtext) + '"';
        }
        if (asvc.subItems && asvc.subItems.length) {
          parts += ', subItems: [';
          for (var si = 0; si < asvc.subItems.length; si++) {
            var sub = asvc.subItems[si];
            var siComma = si < asvc.subItems.length - 1 ? ', ' : '';
            parts += '{id: "' + esc(sub.id) + '", name: "' + esc(sub.name) + '", price: ' + (sub.price || 0) + ', minQty: ' + (sub.minQty || 0) + ', maxQty: ' + (sub.maxQty || 10) + '}' + siComma;
          }
          parts += ']';
        }
        lines.push('      {' + parts + '}' + asComma);
      }
    }
    lines.push('    ],');

    // Home size tiers
    lines.push('    homeSizeTiers: [');
    if (cfg.pricing.homeSizeTiers) {
      for (var ht = 0; ht < cfg.pricing.homeSizeTiers.length; ht++) {
        var tier = cfg.pricing.homeSizeTiers[ht];
        var htComma = ht < cfg.pricing.homeSizeTiers.length - 1 ? ',' : '';
        lines.push('      {label: "' + esc(tier.label) + '", price: ' + (tier.price || 0) + '}' + htComma);
      }
    }
    lines.push('    ],');

    // Discount tiers
    lines.push('    discountTiers: [');
    if (cfg.pricing.discountTiers) {
      for (var dt = 0; dt < cfg.pricing.discountTiers.length; dt++) {
        var disc = cfg.pricing.discountTiers[dt];
        var dtComma = dt < cfg.pricing.discountTiers.length - 1 ? ',' : '';
        lines.push('      {services: ' + (disc.services || 1) + ', pct: ' + (disc.pct || 0) + '}' + dtComma);
      }
    }
    lines.push('    ],');

    lines.push('    maxDiscountPct: ' + (cfg.pricing.maxDiscountPct || 30));
    lines.push('  },');
  }

  // ——— Coupons ———
  if (cfg.coupons && cfg.coupons.length > 0) {
    lines.push('');
    lines.push('  coupons: [');
    for (var ci = 0; ci < cfg.coupons.length; ci++) {
      var cpn = cfg.coupons[ci];
      var cpnComma = ci < cfg.coupons.length - 1 ? ',' : '';
      lines.push('    {code: "' + esc(cpn.code || '') + '", value: ' + (cpn.value || 0) + ', type: "' + (cpn.type || 'flat') + '", active: ' + (cpn.active !== false ? 'true' : 'false') + '}' + cpnComma);
    }
    lines.push('  ],');
  }

  lines.push('');
  lines.push('};');

  return lines.join('\n') + '\n';
}
