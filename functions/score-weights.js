// score-weights.js
// Reads and writes score settings from config_json (id=1) in Supabase.
// app_config table does not exist in this project — use config_json instead.

const { createClient } = require('@supabase/supabase-js');

const { corsHeaders } = require('./lib/cors');
const { requireAuth } = require('./auth');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DEFAULT_WEIGHTS = {
  electrical: 15, plumbing: 15, furnace: 15, ac: 15,
  smoke: 8, co: 8, filters: 6, driveways: 4,
  grading: 4, windows: 4, doors: 4, garage: 4, attic: 4, appliances: 4,
};

const DEFAULT_CONDITION_SCORES = { good: 100, fair: 65, attention: 20 };

const DEFAULT_THRESHOLDS = [
  { label: 'Excellent', min: 90, max: 100, color: '#f59e0b' },
  { label: 'Good',      min: 75, max: 89,  color: '#22c55e' },
  { label: 'Fair',      min: 55, max: 74,  color: '#eab308' },
  { label: 'Poor',      min: 0,  max: 54,  color: '#ef4444' },
];

const DEFAULT_DISPLAY = { showClient: true, showNumber: true, showLabel: true, showBar: true };

const FALLBACK = {
  weights: DEFAULT_WEIGHTS,
  conditionScores: DEFAULT_CONDITION_SCORES,
  thresholds: { green: 75, amber: 50 },
  fullThresholds: DEFAULT_THRESHOLDS,
  display: DEFAULT_DISPLAY,
  sectionWeights: null,
};

async function getConfigJson() {
  const { data, error } = await supabase.from('config_json').select('config').eq('id', 1).single();
  if (error || !data) return null;
  return data.config || null;
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };

  if (event.httpMethod === 'GET') {
    try {
      const config = await getConfigJson();
      const ss = (config && config.scoreSettings) ? config.scoreSettings : {};

      // Build weights map — sectionWeights array (new) or plain object (legacy)
      let weights = DEFAULT_WEIGHTS;
      if (ss.sectionWeights && Array.isArray(ss.sectionWeights)) {
        weights = {};
        ss.sectionWeights.forEach(function(s) {
          if (s.included !== false) weights[s.id] = s.weight;
        });
      } else if (ss.weights) {
        weights = ss.weights;
      }

      // Wizard uses { green, amber } thresholds — derive from full threshold array
      let green = 75, amber = 50;
      if (ss.thresholds && Array.isArray(ss.thresholds) && ss.thresholds.length >= 2) {
        const sorted = ss.thresholds.slice().sort(function(a, b) { return b.min - a.min; });
        green = sorted.length > 1 ? sorted[1].min : 75;
        amber = sorted.length > 2 ? sorted[sorted.length - 2].min : 50;
      }

      return {
        statusCode: 200, headers: headers,
        body: JSON.stringify({
          weights,
          conditionScores: ss.conditionScores || DEFAULT_CONDITION_SCORES,
          thresholds:      { green, amber },
          fullThresholds:  ss.thresholds     || DEFAULT_THRESHOLDS,
          display:         ss.display        || DEFAULT_DISPLAY,
          sectionWeights:  ss.sectionWeights || null,
        }),
      };
    } catch (err) {
      console.error('score-weights GET error:', err);
      return { statusCode: 200, headers: headers, body: JSON.stringify(FALLBACK) };
    }
  }

  if (event.httpMethod === 'POST') {
    const authError = await requireAuth(event);
    if (authError) return authError;

    let parsed;
    try { parsed = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    try {
      const existing = await getConfigJson() || {};
      const scoreSettings = {
        sectionWeights:  parsed.sectionWeights  || null,
        conditionScores: parsed.conditionScores || DEFAULT_CONDITION_SCORES,
        thresholds:      parsed.thresholds      || DEFAULT_THRESHOLDS,
        display:         parsed.display         || DEFAULT_DISPLAY,
      };
      const { error } = await supabase
        .from('config_json')
        .upsert({ id: 1, config: { ...existing, scoreSettings } }, { onConflict: 'id' });
      if (error) throw error;
      return { statusCode: 200, headers: headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error('score-weights POST error:', err);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ success: false, error: err.message }) };
    }
  }

  return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
