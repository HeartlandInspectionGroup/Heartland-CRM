/**
 * scripts/admin-score-settings.js — Score Settings tab (HEA-233)
 * Extracted from admin.html main IIFE.
 * Reads: window._hbShared.cfg
 */

var SCORE_SECTIONS = [
  { id: 'electrical', label: 'Electrical' },
  { id: 'plumbing',   label: 'Plumbing' },
  { id: 'furnace',    label: 'Furnace / Heating' },
  { id: 'ac',         label: 'Air Conditioning' },
  { id: 'smoke',      label: 'Smoke Detectors' },
  { id: 'co',         label: 'CO Detectors' },
  { id: 'filters',    label: 'Filters' },
  { id: 'driveways',  label: 'Driveways / Walkways' },
  { id: 'grading',    label: 'Grading / Drainage' },
  { id: 'windows',    label: 'Windows' },
  { id: 'doors',      label: 'Doors' },
  { id: 'garage',     label: 'Garage' },
  { id: 'attic',      label: 'Attic' },
  { id: 'appliances', label: 'Appliances' },
];

var scoreSettings = null;

function getDefaultScoreSettings() {
  return {
    sectionWeights: SCORE_SECTIONS.map(function(s) {
      var defaultWeights = { electrical:15, plumbing:15, furnace:15, ac:15, smoke:8, co:8, filters:6, driveways:4, grading:4, windows:4, doors:4, garage:4, attic:4, appliances:4 };
      return { id: s.id, label: s.label, weight: defaultWeights[s.id] || 5, included: true };
    }),
    conditionScores: { good: 100, fair: 65, attention: 20 },
    thresholds: [
      { label: 'Excellent', min: 90, max: 100, color: '#d97706' },
      { label: 'Good',      min: 75, max: 89,  color: '#16a34a' },
      { label: 'Fair',      min: 55, max: 74,  color: '#facc15' },
      { label: 'Poor',      min: 0,  max: 54,  color: '#dc2626' },
    ],
    display: { showClient: true, showNumber: true, showLabel: true, showBar: true },
  };
}

function renderScoreSettings() {
  var cfg = window._hbShared.cfg;
  if (!scoreSettings) {
    scoreSettings = (cfg && cfg.scoreSettings) ? cfg.scoreSettings : getDefaultScoreSettings();
    var existingIds = (scoreSettings.sectionWeights || []).map(function(s) { return s.id; });
    SCORE_SECTIONS.forEach(function(s) {
      if (existingIds.indexOf(s.id) === -1) {
        scoreSettings.sectionWeights.push({ id: s.id, label: s.label, weight: 5, included: true });
      }
    });
  }
  renderScoreThresholds();
  renderScoreSectionWeights();
  renderConditionScores();
  var d = scoreSettings.display || {};
  document.getElementById('scoreShowClient').checked = d.showClient !== false;
  document.getElementById('scoreShowNumber').checked = d.showNumber !== false;
  document.getElementById('scoreShowLabel').checked  = d.showLabel  !== false;
  document.getElementById('scoreShowBar').checked    = d.showBar    !== false;

  ['scoreShowClient','scoreShowNumber','scoreShowLabel','scoreShowBar'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.onchange = function() {
      var key = { scoreShowClient:'showClient', scoreShowNumber:'showNumber', scoreShowLabel:'showLabel', scoreShowBar:'showBar' }[id];
      if (!scoreSettings.display) scoreSettings.display = {};
      scoreSettings.display[key] = this.checked;
    };
  });

  document.getElementById('addScoreThresholdBtn').onclick = function() {
    scoreSettings.thresholds.push({ label: 'New Band', min: 0, max: 0, color: '#6b7280' });
    renderScoreThresholds();
  };
}

function saveScoreSettingsToServer() {
  var btn = document.getElementById('saveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  fetch('/.netlify/functions/score-weights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scoreSettings)
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    var st = document.getElementById('saveStatus');
    var cfg = window._hbShared.cfg;
    if (d.success) {
      if (st) { st.textContent = 'Saved!'; st.className = 'save-status save-ok'; }
      if (cfg) cfg.scoreSettings = scoreSettings;
    } else {
      if (st) { st.textContent = 'Error: ' + (d.error || 'unknown'); st.className = 'save-status save-err'; }
    }
    setTimeout(function() { if (st) { st.textContent = 'Ready'; st.className = 'save-status'; } }, 3000);
  });
}

function hookScoreSettingsSave() {
  var saveBtn = document.getElementById('saveBtn');
  if (!saveBtn || saveBtn._scoreHooked) return;
  saveBtn._scoreHooked = true;
  saveBtn.addEventListener('click', function() {
    var activeTab = document.querySelector('.tab-panel.active');
    if (activeTab && activeTab.id === 'tab-score-settings') {
      saveScoreSettingsToServer();
    }
  });
}

function renderScoreThresholds() {
  var el = document.getElementById('scoreThresholdsList');
  if (!el) return;
  el.innerHTML = (scoreSettings.thresholds || []).map(function(t, i) {
    return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:#f8f9fb;border:1px solid #e8eaed;border-radius:8px;">' +
      '<input type="text" value="' + esc(t.label) + '" placeholder="Label" data-si="' + i + '" data-f="stl" style="width:110px;padding:7px 10px;border:1.5px solid #ddd;border-radius:6px;font-family:sans-serif;font-size:13px;">' +
      '<span style="font-size:12px;color:#888;">Min</span>' +
      '<input type="number" value="' + t.min + '" min="0" max="100" data-si="' + i + '" data-f="stmin" style="width:64px;padding:7px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:13px;text-align:center;">' +
      '<span style="font-size:12px;color:#888;">Max</span>' +
      '<input type="number" value="' + t.max + '" min="0" max="100" data-si="' + i + '" data-f="stmax" style="width:64px;padding:7px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:13px;text-align:center;">' +
      '<span style="font-size:12px;color:#888;">Color</span>' +
      '<input type="color" value="' + esc(t.color) + '" data-si="' + i + '" data-f="stc" style="width:40px;height:32px;border:1.5px solid #ddd;border-radius:6px;cursor:pointer;padding:2px;">' +
      '<div style="width:18px;height:18px;border-radius:4px;background:' + esc(t.color) + ';flex-shrink:0;"></div>' +
      '<button data-si="' + i + '" data-f="stdel" style="margin-left:auto;padding:4px 10px;border:1px solid var(--red);border-radius:6px;background:none;color:var(--red);cursor:pointer;font-size:12px;font-weight:600;">✕</button>' +
    '</div>';
  }).join('');
  el.querySelectorAll('[data-f="stl"]').forEach(function(inp)   { inp.oninput = function()  { scoreSettings.thresholds[+this.dataset.si].label = this.value; }; });
  el.querySelectorAll('[data-f="stmin"]').forEach(function(inp) { inp.oninput = function()  { scoreSettings.thresholds[+this.dataset.si].min   = +this.value; }; });
  el.querySelectorAll('[data-f="stmax"]').forEach(function(inp) { inp.oninput = function()  { scoreSettings.thresholds[+this.dataset.si].max   = +this.value; }; });
  el.querySelectorAll('[data-f="stc"]').forEach(function(inp)   { inp.onchange = function() { scoreSettings.thresholds[+this.dataset.si].color = this.value; renderScoreThresholds(); }; });
  el.querySelectorAll('[data-f="stdel"]').forEach(function(btn) { btn.onclick  = function() { scoreSettings.thresholds.splice(+this.dataset.si, 1); renderScoreThresholds(); }; });
}

function renderScoreSectionWeights() {
  var el = document.getElementById('scoreSectionWeightsList');
  if (!el) return;
  el.innerHTML = (scoreSettings.sectionWeights || []).map(function(s, i) {
    return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:#f8f9fb;border:1px solid ' + (s.included !== false ? '#e8eaed' : '#f3f4f6') + ';border-radius:8px;opacity:' + (s.included !== false ? '1' : '0.5') + ';">' +
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:160px;">' +
        '<input type="checkbox" ' + (s.included !== false ? 'checked' : '') + ' data-si="' + i + '" data-f="swincl" style="width:16px;height:16px;accent-color:var(--secondary);">' +
        '<span style="font-size:13px;font-weight:600;">' + esc(s.label || s.id) + '</span>' +
      '</label>' +
      '<span style="font-size:12px;color:#888;">Weight</span>' +
      '<input type="number" value="' + (s.weight || 0) + '" min="0" max="100" data-si="' + i + '" data-f="sww" ' + (s.included === false ? 'disabled' : '') + ' style="width:72px;padding:7px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:13px;text-align:center;">' +
    '</div>';
  }).join('');
  el.querySelectorAll('[data-f="swincl"]').forEach(function(chk) {
    chk.onchange = function() {
      var i = +this.dataset.si;
      scoreSettings.sectionWeights[i].included = this.checked;
      renderScoreSectionWeights();
    };
  });
  el.querySelectorAll('[data-f="sww"]').forEach(function(inp) {
    inp.oninput = function() { scoreSettings.sectionWeights[+this.dataset.si].weight = +this.value; };
  });
}

function renderConditionScores() {
  var el = document.getElementById('scoreConditionsList');
  if (!el) return;
  var cs = scoreSettings.conditionScores || { good: 100, fair: 65, attention: 20 };
  var items = [
    { key: 'good',      label: 'Good',            color: '#22c55e' },
    { key: 'fair',      label: 'Fair',            color: '#f59e0b' },
    { key: 'attention', label: 'Needs Attention', color: '#ef4444' },
  ];
  el.innerHTML = items.map(function(item) {
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f8f9fb;border:1px solid #e8eaed;border-radius:8px;">' +
      '<div style="width:12px;height:12px;border-radius:50%;background:' + item.color + ';flex-shrink:0;"></div>' +
      '<span style="font-size:13px;font-weight:600;min-width:150px;">' + item.label + '</span>' +
      '<span style="font-size:12px;color:#888;">Points</span>' +
      '<input type="number" value="' + (cs[item.key] !== undefined ? cs[item.key] : 0) + '" min="0" max="100" data-key="' + item.key + '" class="cs-inp" style="width:72px;padding:7px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:13px;text-align:center;">' +
      '<span style="font-size:12px;color:#888;">out of 100</span>' +
    '</div>';
  }).join('');
  el.querySelectorAll('.cs-inp').forEach(function(inp) {
    inp.oninput = function() {
      if (!scoreSettings.conditionScores) scoreSettings.conditionScores = {};
      scoreSettings.conditionScores[this.dataset.key] = +this.value;
    };
  });
}

window.renderScoreSettings = renderScoreSettings;
window.hookScoreSettingsSave = hookScoreSettingsSave;
