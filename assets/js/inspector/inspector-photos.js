/**
 * inspector-photos.js — Camera capture, compression, thumbnail generation
 * Namespace: window.HIG_INSPECTOR.photos
 */
(function() {
  'use strict';

  var MAX_WIDTH = 1920;
  var JPEG_QUALITY = 0.7;
  var THUMB_SIZE = 200;
  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  var BUCKET = 'inspection-photos';

  /* ═══ CAMERA CAPTURE ═══ */

  /**
   * Open camera and capture a photo.
   * Returns Promise<Blob> — compressed JPEG.
   * Uses getUserMedia if available, falls back to file input.
   */
  function capturePhoto() {
    /* Try native file input with camera (most reliable on mobile) */
    return new Promise(function(resolve, reject) {
      var input = document.getElementById('iwCameraInput');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');
        input.id = 'iwCameraInput';
        input.style.display = 'none';
        document.body.appendChild(input);
      }

      input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) { reject(new Error('No photo selected')); return; }
        compressImage(file).then(resolve).catch(reject);
        input.value = ''; /* reset for next capture */
      };

      input.click();
    });
  }

  /**
   * Pick photo from gallery (no camera capture attribute).
   */
  function pickFromGallery() {
    return new Promise(function(resolve, reject) {
      var input = document.getElementById('iwGalleryInput');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.id = 'iwGalleryInput';
        input.style.display = 'none';
        document.body.appendChild(input);
      }

      input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) { reject(new Error('No photo selected')); return; }
        compressImage(file).then(resolve).catch(reject);
        input.value = '';
      };

      input.click();
    });
  }

  /* ═══ IMAGE COMPRESSION ═══ */

  /**
   * Compress an image file/blob to JPEG with max dimension and quality.
   * Returns Promise<{blob, thumbnail, width, height}>
   */
  function compressImage(fileOrBlob) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(fileOrBlob);

      img.onload = function() {
        URL.revokeObjectURL(url);

        /* Calculate new dimensions */
        var w = img.width;
        var h = img.height;
        if (w > MAX_WIDTH) {
          h = Math.round(h * (MAX_WIDTH / w));
          w = MAX_WIDTH;
        }

        /* Draw to canvas and extract JPEG */
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');

        /* Handle EXIF orientation */
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(function(blob) {
          if (!blob) { reject(new Error('Compression failed')); return; }

          /* Generate thumbnail */
          generateThumbnail(img).then(function(thumbBlob) {
            resolve({
              blob: blob,
              thumbnail: thumbBlob,
              width: w,
              height: h
            });
          });
        }, 'image/jpeg', JPEG_QUALITY);
      };

      img.onerror = function() {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  /** Generate a small thumbnail */
  function generateThumbnail(img) {
    return new Promise(function(resolve) {
      var ratio = Math.min(THUMB_SIZE / img.width, THUMB_SIZE / img.height);
      var w = Math.round(img.width * ratio);
      var h = Math.round(img.height * ratio);

      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      canvas.toBlob(function(blob) {
        resolve(blob);
      }, 'image/jpeg', 0.6);
    });
  }

  /* ═══ SAVE PHOTO ═══ */

  /**
   * Save a captured photo: IndexedDB first, then queue upload.
   * @param {Object} opts — { inspectionId, sectionId, itemId, caption }
   * @param {Object} compressed — { blob, thumbnail, width, height }
   * @returns {Promise<Object>} — the photo record
   */
  function savePhoto(opts, compressed) {
    var photoId = crypto.randomUUID ? crypto.randomUUID() : generateUUID();
    var storagePath = opts.inspectionId + '/' + opts.sectionId + '/' + photoId + '.jpg';

    var record = {
      id: photoId,
      inspection_id: opts.inspectionId,
      section_id: opts.sectionId,
      item_id: opts.itemId || null,
      storage_path: storagePath,
      caption: opts.caption || '',
      annotation: '',
      taken_at: new Date().toISOString(),
      blob: compressed.blob,
      thumbnail: compressed.thumbnail,
      uploaded: false
    };

    var db = window.HIG_INSPECTOR.db;
    return db.savePhoto(record).then(function() {
      /* Queue upload */
      return db.enqueue({
        type: 'photo_upload',
        inspection_id: opts.inspectionId,
        photo_id: photoId,
        storage_path: storagePath,
        timestamp: new Date().toISOString()
      });
    }).then(function() {
      return record;
    });
  }

  /* ═══ UPLOAD TO SUPABASE STORAGE ═══ */

  /** Upload a single photo to Supabase Storage + insert metadata row */
  function uploadPhoto(photoRecord) {
    var storageUrl = SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + photoRecord.storage_path;

    return fetch(storageUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true'
      },
      body: photoRecord.blob
    }).then(function(r) {
      if (!r.ok) throw new Error('Photo upload failed: ' + r.status);

      /* Insert metadata row */
      return window.HIG_INSPECTOR.sync.sbFetch('inspection_photos', {
        method: 'POST',
        upsert: true,
        body: JSON.stringify({
          id: photoRecord.id,
          inspection_record_id: photoRecord.inspection_id,
          section_id: photoRecord.section_id,
          item_id: photoRecord.item_id,
          storage_path: photoRecord.storage_path,
          caption: photoRecord.caption,
          annotation: photoRecord.annotation || '',
          taken_at: photoRecord.taken_at
        })
      });
    }).then(function(r) {
      if (!r.ok) throw new Error('Photo metadata insert failed');
      /* Mark as uploaded in IndexedDB */
      photoRecord.uploaded = true;
      return window.HIG_INSPECTOR.db.savePhoto(photoRecord);
    });
  }

  /** Upload all pending photos for an inspection */
  function uploadPendingPhotos(inspectionId) {
    var db = window.HIG_INSPECTOR.db;
    return db.getInspectionPhotos(inspectionId).then(function(photos) {
      var pending = photos.filter(function(p) { return !p.uploaded; });
      return pending.reduce(function(chain, photo) {
        return chain.then(function() { return uploadPhoto(photo); });
      }, Promise.resolve());
    });
  }

  /** Delete a photo from storage + DB */
  function deletePhoto(photoRecord) {
    var promises = [];

    /* Delete from Supabase Storage if uploaded */
    if (photoRecord.uploaded) {
      var storageUrl = SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + photoRecord.storage_path;
      promises.push(
        fetch(storageUrl, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
          }
        })
      );

      /* Delete metadata row */
      promises.push(
        window.HIG_INSPECTOR.sync.sbFetch('inspection_photos?id=eq.' + photoRecord.id, {
          method: 'DELETE'
        })
      );
    }

    /* Delete from IndexedDB */
    promises.push(window.HIG_INSPECTOR.db.deletePhoto(photoRecord.id));

    return Promise.all(promises);
  }

  /** Get the public URL for a stored photo */
  function getPhotoUrl(storagePath) {
    return SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + storagePath;
  }

  /** Create an object URL for a local blob (for display before upload) */
  function getLocalPhotoUrl(photoRecord) {
    if (photoRecord.blob) {
      return URL.createObjectURL(photoRecord.blob);
    }
    if (photoRecord.thumbnail) {
      return URL.createObjectURL(photoRecord.thumbnail);
    }
    return getPhotoUrl(photoRecord.storage_path);
  }

  /* ═══ UTILITY ═══ */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* ═══ EXPORT ═══ */
  window.HIG_INSPECTOR = window.HIG_INSPECTOR || {};
  window.HIG_INSPECTOR.photos = {
    capturePhoto: capturePhoto,
    pickFromGallery: pickFromGallery,
    compressImage: compressImage,
    savePhoto: savePhoto,
    uploadPhoto: uploadPhoto,
    uploadPendingPhotos: uploadPendingPhotos,
    deletePhoto: deletePhoto,
    getPhotoUrl: getPhotoUrl,
    getLocalPhotoUrl: getLocalPhotoUrl
  };

})();
