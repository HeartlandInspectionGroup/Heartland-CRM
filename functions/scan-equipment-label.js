/**
 * Netlify Function: scan-equipment-label
 *
 * Accepts a label photo URL and section type, uses Claude Vision to extract
 * equipment details, queries the free CPSC recall API, and decodes serial
 * number age for known brand families.
 *
 * POST body: { imageUrl, sectionType }
 * Returns: { brand, model, serial, manufactureDate, age, capacity, efficiency,
 *            recalls: [], recallStatus: 'none'|'found'|'unavailable' }
 */

const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');

// Allow tests to inject a fetch stub
var _fetch = typeof fetch !== 'undefined' ? fetch : null;
exports._setFetch = function (f) { _fetch = f; };

// ── Serial Number Age Decoding (AI-based) ───────────────────────────────

async function decodeSerialDateAI(brand, serial, apiKey, fetchFn) {
  if (!brand || !serial) return null;

  var dateDecodePrompt = 'You are an HVAC and appliance serial number expert.\n\n' +
    'Brand: ' + brand + '\n' +
    'Serial Number: ' + serial + '\n\n' +
    'Decode the manufacture date from this serial number. Many brands encode the year and month (or week) in specific positions of the serial number.\n\n' +
    'Respond ONLY with valid JSON, no preamble, no markdown:\n' +
    '{\n' +
    '  "manufacture_year": 2018,\n' +
    '  "manufacture_month": 3,\n' +
    '  "confidence": "high",\n' +
    '  "decode_method": "brief explanation"\n' +
    '}\n\n' +
    'If you cannot determine the manufacture date with reasonable confidence, return:\n' +
    '{ "manufacture_year": null, "manufacture_month": null, "confidence": "low", "decode_method": "unknown format" }';

  try {
    var res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: dateDecodePrompt,
        }],
      }),
    });

    if (!res.ok) return null;

    var resData = await res.json();
    var text = '';
    if (resData.content && resData.content.length) {
      text = resData.content.map(function (c) { return c.text || ''; }).join('').trim();
    }

    var cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var decoded = JSON.parse(cleaned);

    if (decoded.confidence === 'high' || decoded.confidence === 'medium') {
      if (decoded.manufacture_year && decoded.manufacture_year > 1950 && decoded.manufacture_year <= new Date().getFullYear()) {
        return {
          year: decoded.manufacture_year,
          month: decoded.manufacture_month || null,
          confidence: decoded.confidence,
          decode_method: decoded.decode_method || null,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn('Serial date decode AI error:', err.message);
    return null;
  }
}

exports._decodeSerialDateAI = decodeSerialDateAI;

// ── Handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var imageUrl = body.imageUrl;
  var sectionType = body.sectionType || '';

  if (!imageUrl) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'imageUrl required' }) };
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  var fetchFn = _fetch || globalThis.fetch;

  try {
    // Step 1: Claude Vision to extract label data
    var visionPrompt = 'You are analyzing a photograph of an equipment manufacturer label. Extract the following information as structured JSON:\n\n' +
      '- brand: The manufacturer/brand name\n' +
      '- model: The model number\n' +
      '- serial: The serial number\n' +
      '- manufacture_date: The manufacture date if visible (any format)\n' +
      '- capacity: Equipment capacity (BTU, tons, watts, gallons, amps — include units)\n' +
      '- efficiency_rating: Efficiency rating if visible (SEER, AFUE, EER, Energy Star — include type)\n\n' +
      'Return ONLY valid JSON with these keys. If a field is not visible or readable on the label, set its value to null. No markdown fences, no extra text.';

    var visionRes = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: visionPrompt },
          ],
        }],
      }),
    });

    if (!visionRes.ok) {
      var errText = '';
      try { errText = await visionRes.text(); } catch (e) {}
      throw new Error('Claude Vision API error ' + visionRes.status + ': ' + errText.substring(0, 200));
    }

    var visionData = await visionRes.json();
    var visionText = '';
    if (visionData.content && visionData.content.length) {
      visionText = visionData.content.map(function (c) { return c.text || ''; }).join('').trim();
    }

    // Parse Claude's JSON response
    var cleaned = visionText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var labelData;
    try {
      labelData = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Vision JSON:', visionText.substring(0, 500));
      labelData = { brand: null, model: null, serial: null, manufacture_date: null, capacity: null, efficiency_rating: null };
    }

    // Step 2: Serial number age decoding via AI
    var age = null;
    var manufactureDate = labelData.manufacture_date || null;
    if (labelData.brand && labelData.serial) {
      var serialDecoded = await decodeSerialDateAI(labelData.brand, labelData.serial, apiKey, fetchFn);
      if (serialDecoded) {
        var currentYear = new Date().getFullYear();
        age = currentYear - serialDecoded.year;
        var monthStr = String(serialDecoded.month || 1).padStart(2, '0');
        manufactureDate = serialDecoded.year + '-' + monthStr + '-01';
      }
    }

    // Step 3: CPSC recall check (only if we have brand)
    var recalls = [];
    var recallStatus = 'none';

    if (labelData.brand) {
      try {
        var cpscUrl = 'https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName=' +
          encodeURIComponent(labelData.brand);
        if (labelData.model) {
          cpscUrl += '&RecallDescription=' + encodeURIComponent(labelData.model);
        }

        var cpscRes = await fetchFn(cpscUrl, { method: 'GET' });
        if (cpscRes.ok) {
          var cpscData = await cpscRes.json();
          if (Array.isArray(cpscData) && cpscData.length > 0) {
            recalls = cpscData.slice(0, 5).map(function (r) {
              return {
                recallNumber: r.RecallNumber || '',
                recallDate: r.RecallDate || '',
                description: r.Description || r.ProductDescription || '',
                hazard: r.Hazard || '',
                url: r.URL || r.RecallURL || '',
              };
            });
            recallStatus = 'found';
          }
        } else {
          console.warn('CPSC API returned status:', cpscRes.status);
          recallStatus = 'unavailable';
        }
      } catch (cpscErr) {
        console.warn('CPSC API error:', cpscErr.message);
        recallStatus = 'unavailable';
      }
    }

    var result = {
      brand: labelData.brand || null,
      model: labelData.model || null,
      serial: labelData.serial || null,
      manufactureDate: manufactureDate,
      age: age,
      capacity: labelData.capacity || null,
      efficiency: labelData.efficiency_rating || null,
      recalls: recalls,
      recallStatus: recallStatus,
    };

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify(result),
    };

  } catch (err) {
    console.error('scan-equipment-label error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
