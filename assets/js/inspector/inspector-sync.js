/**
 * inspector-sync.js — Online/offline sync engine
 * Namespace: window.HIG_INSPECTOR.sync
 *
 * Handles: auto-save to IndexedDB, debounced queue, batch upload to Supabase,
 * Background Sync API registration, conflict resolution (server wins for status).
 */
(function() {
  'use strict';

  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  var db;
  var isOnline = navigator.onLine;
  var isSyncing = false;
  var syncDebounceTimer = null;
  var SYNC_DEBOUNCE_MS = 2000;

  /* ═══ ONLINE/OFFLINE DETECTION ═══ */
  function initConnectivity() {
    window.addEventListener('online', function() {
      isOnline = true;
      updateIndicator();
      processQueue();
    });
    window.addEventListener('offline', function() {
      isOnline = false;
      updateIndicator();
    });
    /* Listen for service worker trigger */
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'trigger-sync') {
          processQueue();
        }
      });
    }
  }

  function updateIndicator() {
    var el = document.getElementById('syncIndicator');
    if (!el) return;
    if (isSyncing) {
      el.className = 'iw-sync-indicator syncing';
      el.title = 'Syncing...';
    } else if (isOnline) {
      el.className = 'iw-sync-indicator online';
      el.title = 'Online';
    } else {
      el.className = 'iw-sync-indicator offline';
      el.title = 'Offline — changes saved locally';
    }
  }

  /* ═══ SUPABASE REST HELPER ═══ */
  function sbFetch(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    headers['apikey'] = SUPABASE_ANON_KEY;
    headers['Authorization'] = 'Bearer ' + SUPABASE_ANON_KEY;
    if (!headers['Content-Type'] && opts.method && opts.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    if (opts.upsert) {
      headers['Prefer'] = 'resolution=merge-duplicates';
    }
    opts.headers = headers;
    return fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  }

  /* ═══ AUTO-SAVE (to IndexedDB + enqueue) ═══ */

  /** Check if inspection ID is a demo */
  function isDemoId(inspectionId) {
    return typeof inspectionId === 'string' && inspectionId.startsWith('demo-');
  }

  /**
   * Save section data locally and queue for sync.
   * Called on every field change.
   * Demo inspections: IndexedDB only, no sync queue.
   */
  function autoSave(inspectionId, sectionId, data) {
    db = window.HIG_INSPECTOR.db;
    return db.saveSectionData(inspectionId, sectionId, data).then(function() {
      if (isDemoId(inspectionId)) return;
      return db.enqueue({
        type: 'section_update',
        inspection_id: inspectionId,
        section_id: sectionId,
        data: data,
        timestamp: new Date().toISOString()
      });
    }).then(function() {
      if (!isDemoId(inspectionId)) debouncedSync();
    });
  }

  /** Save inspection status change (demo: local only) */
  function saveStatusChange(inspectionId, status) {
    if (isDemoId(inspectionId)) return Promise.resolve();
    db = window.HIG_INSPECTOR.db;
    return db.getInspection(inspectionId).then(function(rec) {
      if (rec) {
        rec.status = status;
        return db.saveInspection(rec);
      }
    }).then(function() {
      return db.enqueue({
        type: 'status_change',
        inspection_id: inspectionId,
        status: status,
        timestamp: new Date().toISOString()
      });
    }).then(function() {
      debouncedSync();
    });
  }

  /** Save agreement data (demo: skip entirely) */
  function saveAgreement(inspectionId, agreementData) {
    if (isDemoId(inspectionId)) return Promise.resolve();
    db = window.HIG_INSPECTOR.db;
    return db.enqueue({
      type: 'agreement',
      inspection_id: inspectionId,
      data: agreementData,
      timestamp: new Date().toISOString()
    }).then(function() {
      debouncedSync();
    });
  }

  /* ═══ DEBOUNCED SYNC ═══ */
  function debouncedSync() {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(function() {
      if (isOnline) processQueue();
    }, SYNC_DEBOUNCE_MS);
  }

  /* ═══ PROCESS SYNC QUEUE ═══ */
  function processQueue() {
    if (isSyncing || !isOnline) return Promise.resolve();
    db = window.HIG_INSPECTOR.db;
    isSyncing = true;
    updateIndicator();

    return db.getSyncQueue().then(function(items) {
      if (!items.length) {
        isSyncing = false;
        updateIndicator();
        return;
      }

      /* Group changes by inspection */
      var grouped = {};
      items.forEach(function(item) {
        var key = item.inspection_id;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });

      var promises = Object.keys(grouped).map(function(inspectionId) {
        return syncInspectionBatch(inspectionId, grouped[inspectionId]);
      });

      return Promise.all(promises).then(function() {
        /* Remove processed items */
        var removePromises = items.map(function(item) {
          return db.dequeueSyncItem(item.id);
        });
        return Promise.all(removePromises);
      });
    }).then(function() {
      isSyncing = false;
      updateIndicator();
      document.dispatchEvent(new CustomEvent('inspection-synced'));
    }).catch(function(err) {
      console.error('[sync] Queue processing failed:', err);
      isSyncing = false;
      updateIndicator();
    });
  }

  /** Send batched changes for one inspection to the server */
  function syncInspectionBatch(inspectionId, changes) {
    /* Process each change type */
    var promises = [];

    changes.forEach(function(change) {
      if (change.type === 'section_update') {
        promises.push(syncSectionData(inspectionId, change.section_id, change.data));
      } else if (change.type === 'status_change') {
        promises.push(syncStatusChange(inspectionId, change.status));
      } else if (change.type === 'agreement') {
        promises.push(syncAgreement(inspectionId, change.data));
      }
    });

    return Promise.all(promises);
  }

  /** Upsert section data to Supabase */
  function syncSectionData(inspectionId, sectionId, data) {
    var payload = {
      inspection_record_id: inspectionId,
      section_id: sectionId,
      status: data.status || 'in_progress',
      skip_reason: data.skip_reason || '',
      items: JSON.stringify(data.items || []),
      general_comment: data.general_comment || '',
      flagged: data.flagged || false,
      last_modified: new Date().toISOString()
    };

    return sbFetch('inspection_section_data', {
      method: 'POST',
      upsert: true,
      body: JSON.stringify(payload)
    }).then(function(r) {
      if (!r.ok) throw new Error('Section sync failed: ' + r.status);
    });
  }

  /** Update inspection status in Supabase */
  function syncStatusChange(inspectionId, status) {
    var payload = { status: status };
    if (status === 'in_progress' && !payload.started_at) {
      payload.started_at = new Date().toISOString();
    }
    if (status === 'submitted' || status === 'review') {
      payload.completed_at = new Date().toISOString();
    }

    return sbFetch('inspection_records?id=eq.' + inspectionId, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }).then(function(r) {
      if (!r.ok) throw new Error('Status sync failed: ' + r.status);
    });
  }

  /** Upsert agreement to Supabase */
  function syncAgreement(inspectionId, data) {
    var payload = Object.assign({}, data, { inspection_record_id: inspectionId });
    return sbFetch('inspection_agreements', {
      method: 'POST',
      upsert: true,
      body: JSON.stringify(payload)
    }).then(function(r) {
      if (!r.ok) throw new Error('Agreement sync failed: ' + r.status);
    });
  }

  /* ═══ FETCH FROM SERVER ═══ */

  /** Load today's inspections from Supabase */
  function fetchTodayInspections(inspectorId) {
    var today = new Date().toISOString().split('T')[0];
    var query = 'inspection_records?inspector_id=eq.' + inspectorId +
      '&inspection_date=eq.' + today +
      '&select=*,clients(name,email,phone)' +
      '&order=inspection_date.asc';

    return sbFetch(query).then(function(r) {
      if (!r.ok) throw new Error('Fetch inspections failed');
      return r.json();
    }).then(function(records) {
      /* Cache locally */
      db = window.HIG_INSPECTOR.db;
      var promises = records.map(function(rec) {
        return db.saveInspection(rec);
      });
      return Promise.all(promises).then(function() { return records; });
    }).catch(function(err) {
      console.warn('[sync] Fetch failed, using cached:', err);
      db = window.HIG_INSPECTOR.db;
      return db.getAllInspections();
    });
  }

  /** Load section data for an inspection from Supabase */
  function fetchSectionData(inspectionId) {
    var query = 'inspection_section_data?inspection_record_id=eq.' + inspectionId + '&select=*';
    return sbFetch(query).then(function(r) {
      if (!r.ok) throw new Error('Fetch section data failed');
      return r.json();
    }).then(function(rows) {
      db = window.HIG_INSPECTOR.db;
      var promises = rows.map(function(row) {
        return db.saveSectionData(row.inspection_record_id, row.section_id, row);
      });
      return Promise.all(promises).then(function() { return rows; });
    }).catch(function(err) {
      console.warn('[sync] Section data fetch failed, using cached:', err);
      db = window.HIG_INSPECTOR.db;
      return db.getAllSectionData(inspectionId);
    });
  }

  /** Load photos metadata for an inspection */
  function fetchPhotos(inspectionId) {
    var query = 'inspection_photos?inspection_record_id=eq.' + inspectionId + '&select=*';
    return sbFetch(query).then(function(r) {
      if (!r.ok) throw new Error('Fetch photos failed');
      return r.json();
    });
  }

  /** Register for Background Sync if available */
  function registerBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(function(reg) {
        return reg.sync.register('inspection-sync');
      }).catch(function(err) {
        console.warn('[sync] Background sync registration failed:', err);
      });
    }
  }

  /* ═══ INIT ═══ */
  function init() {
    initConnectivity();
    updateIndicator();
    registerBackgroundSync();
  }

  /* ═══ EXPORT ═══ */
  window.HIG_INSPECTOR = window.HIG_INSPECTOR || {};
  window.HIG_INSPECTOR.sync = {
    init: init,
    autoSave: autoSave,
    saveStatusChange: saveStatusChange,
    saveAgreement: saveAgreement,
    processQueue: processQueue,
    fetchTodayInspections: fetchTodayInspections,
    fetchSectionData: fetchSectionData,
    fetchPhotos: fetchPhotos,
    sbFetch: sbFetch,
    isOnline: function() { return isOnline; }
  };

})();
