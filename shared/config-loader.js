/**
 * shared/config-loader.js
 * Loads HEARTLAND_CONFIG from Supabase once, fires 'heartland-config-ready' event.
 * Include after config.js on any page that needs live pricing/schedule config.
 * Safe to include multiple times — only fetches once.
 */
(function() {
  if (window._hcConfigLoading || window.HEARTLAND_CONFIG) {
    // Already loaded or loading — fire event if already ready
    if (window.HEARTLAND_CONFIG) {
      window.dispatchEvent(new Event('heartland-config-ready'));
    }
    return;
  }
  window._hcConfigLoading = true;

  fetch(window.SUPABASE_URL + '/rest/v1/config_json?select=config&limit=1', {
    headers: {
      'apikey': window.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY
    }
  })
  .then(function(r) { return r.json(); })
  .then(function(rows) {
    window.HEARTLAND_CONFIG = (rows && rows[0] && rows[0].config) ? rows[0].config : {};
    window._hcConfigLoading = false;
    window.dispatchEvent(new Event('heartland-config-ready'));
  })
  .catch(function(err) {
    console.warn('[config-loader] Failed to load HEARTLAND_CONFIG:', err);
    window.HEARTLAND_CONFIG = window.HEARTLAND_CONFIG || {};
    window._hcConfigLoading = false;
    window.dispatchEvent(new Event('heartland-config-ready'));
  });
})();
