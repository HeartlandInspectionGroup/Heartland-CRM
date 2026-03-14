/**
 * inspector-db.js — IndexedDB wrapper for offline inspection data
 * Namespace: window.HIG_INSPECTOR.db
 */
(function() {
  'use strict';

  var DB_NAME = 'heartland-inspector';
  var DB_VERSION = 1;
  var db = null;

  var STORES = {
    inspections: 'inspections',
    section_data: 'section_data',
    photos: 'photos',
    sync_queue: 'sync_queue',
    section_templates: 'section_templates'
  };

  /* ═══ OPEN DATABASE ═══ */
  function openDB() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function(e) {
        var d = e.target.result;

        /* inspections store — keyed by uuid */
        if (!d.objectStoreNames.contains(STORES.inspections)) {
          d.createObjectStore(STORES.inspections, { keyPath: 'id' });
        }

        /* section_data store — compound key [inspection_id, section_id] */
        if (!d.objectStoreNames.contains(STORES.section_data)) {
          var sd = d.createObjectStore(STORES.section_data, { keyPath: ['inspection_id', 'section_id'] });
          sd.createIndex('by_inspection', 'inspection_id', { unique: false });
        }

        /* photos store — keyed by uuid */
        if (!d.objectStoreNames.contains(STORES.photos)) {
          var ps = d.createObjectStore(STORES.photos, { keyPath: 'id' });
          ps.createIndex('by_inspection', 'inspection_id', { unique: false });
          ps.createIndex('by_section', ['inspection_id', 'section_id'], { unique: false });
        }

        /* sync_queue — auto-incrementing key */
        if (!d.objectStoreNames.contains(STORES.sync_queue)) {
          d.createObjectStore(STORES.sync_queue, { keyPath: 'id', autoIncrement: true });
        }

        /* section_templates — keyed by section id string */
        if (!d.objectStoreNames.contains(STORES.section_templates)) {
          d.createObjectStore(STORES.section_templates, { keyPath: 'id' });
        }
      };

      req.onsuccess = function(e) {
        db = e.target.result;
        resolve(db);
      };

      req.onerror = function(e) {
        reject(e.target.error);
      };
    });
  }

  /* ═══ GENERIC CRUD ═══ */
  function getStore(storeName, mode) {
    return db.transaction(storeName, mode || 'readonly').objectStore(storeName);
  }

  function put(storeName, data) {
    return new Promise(function(resolve, reject) {
      openDB().then(function() {
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var req = store.put(data);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      }).catch(reject);
    });
  }

  function get(storeName, key) {
    return new Promise(function(resolve, reject) {
      openDB().then(function() {
        var store = getStore(storeName);
        var req = store.get(key);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { reject(req.error); };
      }).catch(reject);
    });
  }

  function getAll(storeName) {
    return new Promise(function(resolve, reject) {
      openDB().then(function() {
        var store = getStore(storeName);
        var req = store.getAll();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function() { reject(req.error); };
      }).catch(reject);
    });
  }

  function getAllByIndex(storeName, indexName, key) {
    return new Promise(function(resolve, reject) {
      openDB().then(function() {
        var store = getStore(storeName);
        var idx = store.index(indexName);
        var req = idx.getAll(key);
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function() { reject(req.error); };
      }).catch(reject);
    });
  }

  function remove(storeName, key) {
    return new Promise(function(resolve, reject) {
      openDB().then(function() {
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var req = store.delete(key);
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
      }).catch(reject);
    });
  }

  function clear(storeName) {
    return new Promise(function(resolve, reject) {
      openDB().then(function() {
        var tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      }).catch(reject);
    });
  }

  /* ═══ INSPECTION-SPECIFIC HELPERS ═══ */

  /** Save or update an inspection record locally */
  function saveInspection(record) {
    return put(STORES.inspections, record);
  }

  /** Get one inspection by id */
  function getInspection(id) {
    return get(STORES.inspections, id);
  }

  /** Get all cached inspections */
  function getAllInspections() {
    return getAll(STORES.inspections);
  }

  /** Save section data for an inspection */
  function saveSectionData(inspectionId, sectionId, data) {
    var record = Object.assign({}, data, {
      inspection_id: inspectionId,
      section_id: sectionId,
      last_modified: new Date().toISOString()
    });
    return put(STORES.section_data, record);
  }

  /** Get section data for a specific section */
  function getSectionData(inspectionId, sectionId) {
    return get(STORES.section_data, [inspectionId, sectionId]);
  }

  /** Get all section data for an inspection */
  function getAllSectionData(inspectionId) {
    return getAllByIndex(STORES.section_data, 'by_inspection', inspectionId);
  }

  /** Save a photo record (blob + metadata) */
  function savePhoto(photoRecord) {
    return put(STORES.photos, photoRecord);
  }

  /** Get all photos for a section */
  function getSectionPhotos(inspectionId, sectionId) {
    return getAllByIndex(STORES.photos, 'by_section', [inspectionId, sectionId]);
  }

  /** Get all photos for an inspection */
  function getInspectionPhotos(inspectionId) {
    return getAllByIndex(STORES.photos, 'by_inspection', inspectionId);
  }

  /** Remove a photo */
  function deletePhoto(photoId) {
    return remove(STORES.photos, photoId);
  }

  /* ═══ SYNC QUEUE ═══ */

  /** Add a change to the sync queue */
  function enqueue(change) {
    change.queued_at = new Date().toISOString();
    return put(STORES.sync_queue, change);
  }

  /** Get all pending sync items */
  function getSyncQueue() {
    return getAll(STORES.sync_queue);
  }

  /** Remove a processed sync item */
  function dequeueSyncItem(id) {
    return remove(STORES.sync_queue, id);
  }

  /** Clear entire sync queue */
  function clearSyncQueue() {
    return clear(STORES.sync_queue);
  }

  /* ═══ SECTION TEMPLATES ═══ */

  /** Cache section templates from Supabase */
  function cacheSectionTemplates(templates) {
    var promises = templates.map(function(t) {
      return put(STORES.section_templates, t);
    });
    return Promise.all(promises);
  }

  /** Get cached section templates */
  function getCachedTemplates() {
    return getAll(STORES.section_templates);
  }

  /* ═══ EXPORT ═══ */
  window.HIG_INSPECTOR = window.HIG_INSPECTOR || {};
  window.HIG_INSPECTOR.db = {
    open: openDB,
    STORES: STORES,
    /* Generic */
    put: put,
    get: get,
    getAll: getAll,
    remove: remove,
    clear: clear,
    /* Inspections */
    saveInspection: saveInspection,
    getInspection: getInspection,
    getAllInspections: getAllInspections,
    /* Section data */
    saveSectionData: saveSectionData,
    getSectionData: getSectionData,
    getAllSectionData: getAllSectionData,
    /* Photos */
    savePhoto: savePhoto,
    getSectionPhotos: getSectionPhotos,
    getInspectionPhotos: getInspectionPhotos,
    deletePhoto: deletePhoto,
    /* Sync queue */
    enqueue: enqueue,
    getSyncQueue: getSyncQueue,
    dequeueSyncItem: dequeueSyncItem,
    clearSyncQueue: clearSyncQueue,
    /* Templates */
    cacheSectionTemplates: cacheSectionTemplates,
    getCachedTemplates: getCachedTemplates
  };

})();
