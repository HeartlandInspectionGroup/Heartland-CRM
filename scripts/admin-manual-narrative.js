/**
 * scripts/admin-manual-narrative.js — Manual Narrative Generator (HEA-235)
 * Extracted from admin.html standalone script block (HEA-222).
 * Uses: esc() (global, replaces _mnEsc), getAuthHeaderLocal() (global, replaces _fpGetAuthHeader)
 * Netlify: generate-narrative
 * Cloudinary: direct upload to dmztfzqfm, preset slvlwkcf
 */

var mnUnits = [];
var mnNextId = 0;

function mnToast(msg, type) {
  var el = document.getElementById('mnToast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'mn-toast ' + (type || 'success');
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, 3000);
}

function mnOpenModal() {
  mnUnits = [];
  mnNextId = 0;
  mnAddUnit();
  document.getElementById('mnOverlay').classList.add('active');
}

function mnCloseModal() {
  document.getElementById('mnOverlay').classList.remove('active');
}

function mnAddUnit() {
  mnUnits.push({ id: mnNextId++, photoUrl: null, comment: '', narrative: null, error: null });
  mnRender();
}

function mnRemoveUnit(uid) {
  mnUnits = mnUnits.filter(function(u) { return u.id !== uid; });
  if (!mnUnits.length) mnAddUnit(); else mnRender();
}

function mnUpdateComment(uid, val) {
  var u = mnUnits.find(function(u) { return u.id === uid; });
  if (u) u.comment = val;
}

function mnPickPhoto(uid) {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
  input.onchange = async function() {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var u = mnUnits.find(function(u) { return u.id === uid; });
    if (!u) return;
    try {
      var fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('upload_preset', 'slvlwkcf');
      fd.append('folder', 'heartland/manual/standalone');
      var cRes = await fetch('https://api.cloudinary.com/v1_1/dmztfzqfm/image/upload', { method: 'POST', body: fd });
      if (!cRes.ok) throw new Error('Upload failed');
      var cData = await cRes.json();
      u.photoUrl = cData.secure_url;
      mnRender();
    } catch (err) {
      u.error = 'Photo upload failed: ' + err.message;
      mnRender();
    }
  };
  input.click();
}

function mnRender() {
  var el = document.getElementById('mnUnits');
  if (!el) return;
  var html = '';
  mnUnits.forEach(function(u) {
    html += '<div class="mn-unit" id="mnUnit_' + u.id + '">';
    html += '<button class="mn-unit-remove" onclick="mnRemoveUnit(' + u.id + ')">×</button>';
    html += '<div class="mn-unit-row">';
    // Photo area
    html += '<div class="mn-photo-area" onclick="mnPickPhoto(' + u.id + ')">';
    if (u.photoUrl) {
      html += '<img src="' + esc(u.photoUrl) + '">';
    } else {
      html += '<span class="mn-photo-label">📷 Upload</span>';
    }
    html += '</div>';
    // Comment
    html += '<div class="mn-comment"><textarea placeholder="Optional — describe what you observed..." oninput="mnUpdateComment(' + u.id + ',this.value)">' + esc(u.comment) + '</textarea></div>';
    html += '</div>';
    // Error
    if (u.error) {
      html += '<div class="mn-error">' + esc(u.error) + '</div>';
    }
    // Generated narrative
    if (u.narrative !== null) {
      html += '<div class="mn-result">';
      html += '<textarea id="mnNarr_' + u.id + '">' + esc(u.narrative) + '</textarea>';
      html += '<div class="mn-result-actions">';
      html += '<button class="mn-btn mn-btn--blue" onclick="mnCopyUnit(' + u.id + ')" id="mnCopyBtn_' + u.id + '">Copy</button>';
      html += '<button class="mn-btn mn-btn--red" onclick="mnDiscardUnit(' + u.id + ')">Discard</button>';
      html += '</div></div>';
    }
    html += '</div>';
  });
  el.innerHTML = html;
}

function mnCopyUnit(uid) {
  var ta = document.getElementById('mnNarr_' + uid);
  if (!ta) return;
  var text = ta.value;
  navigator.clipboard.writeText(text).then(function() {
    var btn = document.getElementById('mnCopyBtn_' + uid);
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
    }
  }).catch(function() {
    mnToast('Copy failed — try selecting and copying manually', 'error');
  });
}

function mnDiscardUnit(uid) {
  var u = mnUnits.find(function(u) { return u.id === uid; });
  if (u) { u.narrative = null; u.error = null; }
  mnRender();
}

async function mnGenerateAll() {
  var btn = document.getElementById('mnGenerateBtn');
  var units = mnUnits.filter(function(u) { return u.comment.trim() || u.photoUrl; });
  if (!units.length) { mnToast('Add at least one photo or comment', 'error'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="mn-spinner"></span> Generating...'; }
  // Clear previous results
  units.forEach(function(u) { u.narrative = null; u.error = null; });
  mnRender();

  // Build findings array — one per unit, no id needed for standalone mode
  var findings = units.map(function(u) {
    var finding = { observation: u.comment || '' };
    if (u.photoUrl) finding.photo_urls = [u.photoUrl];
    return finding;
  });

  try {
    var res = await fetch('/.netlify/functions/generate-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaderLocal()) },
      body: JSON.stringify({ findings: findings }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');

    var narratives = data.narratives || {};
    var successCount = 0;
    units.forEach(function(u, idx) {
      var text = narratives[idx] || narratives[String(idx)] || '';
      if (text) {
        u.narrative = text;
        successCount++;
      } else {
        u.error = 'No narrative returned';
      }
    });

    if (successCount) mnToast(successCount + ' narrative(s) generated', 'success');
  } catch (err) {
    units.forEach(function(u) { u.error = 'Generation failed: ' + err.message; });
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Generate All'; }
  mnRender();
}
