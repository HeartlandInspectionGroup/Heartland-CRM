/**
 * Annotation Engine — shared Fabric.js canvas module
 *
 * PREREQUISITE: Load Fabric.js CDN before this script:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js"></script>
 *   <script src="/shared/annotation-engine.js"></script>
 *
 * Usage:
 *   AnnotationEngine.init(canvasEl, imageUrl)   — mount canvas over photo
 *   AnnotationEngine.setTool('arrow'|'circle'|'rect'|'text')
 *   AnnotationEngine.setColor('#e74c3c'|'#f1c40f'|'#ffffff')
 *   AnnotationEngine.undo()                     — remove last object
 *   AnnotationEngine.clearAll()                 — remove all objects
 *   AnnotationEngine.save(photoId)              — flatten, upload, persist
 *   AnnotationEngine.destroy()                  — tear down canvas
 *
 * Cloudinary: cloud dmztfzqfm, preset slvlwkcf
 */

(function () {
  'use strict';

  var CLOUD = 'dmztfzqfm';
  var PRESET = 'slvlwkcf';

  var canvas = null;
  var currentTool = 'arrow';
  var currentColor = '#e74c3c';
  var isDrawing = false;
  var startX = 0;
  var startY = 0;
  var activeShape = null;
  var objectHistory = [];

  // ── Init ─────────────────────────────────────────────────────────────────

  function init(canvasEl, imageUrl) {
    if (typeof fabric === 'undefined') {
      console.error('AnnotationEngine: Fabric.js not loaded. Add the CDN script before annotation-engine.js.');
      return;
    }

    canvas = new fabric.Canvas(canvasEl, {
      selection: false,
      isDrawingMode: false,
    });

    objectHistory = [];

    return new Promise(function (resolve, reject) {
      fabric.Image.fromURL(imageUrl, function (img) {
        if (!img) { reject(new Error('Failed to load image')); return; }

        // Scale image to fit canvas container
        var containerWidth = canvas.getWidth();
        var containerHeight = canvas.getHeight();
        var scale = Math.min(containerWidth / img.width, containerHeight / img.height);

        canvas.setWidth(img.width * scale);
        canvas.setHeight(img.height * scale);

        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
          scaleX: scale,
          scaleY: scale,
          originX: 'left',
          originY: 'top',
        });

        _bindEvents();
        resolve(canvas);
      }, { crossOrigin: 'anonymous' });
    });
  }

  // ── Tool selection ───────────────────────────────────────────────────────

  function setTool(tool) {
    var valid = ['arrow', 'circle', 'rect', 'text'];
    if (valid.indexOf(tool) === -1) return;
    currentTool = tool;
    if (canvas) canvas.isDrawingMode = false;
  }

  function setColor(color) {
    currentColor = color || '#e74c3c';
  }

  // ── Canvas events ────────────────────────────────────────────────────────

  function _bindEvents() {
    canvas.on('mouse:down', function (opt) {
      if (currentTool === 'text') {
        _placeText(opt.pointer.x, opt.pointer.y);
        return;
      }
      isDrawing = true;
      startX = opt.pointer.x;
      startY = opt.pointer.y;
      activeShape = null;
    });

    canvas.on('mouse:move', function (opt) {
      if (!isDrawing) return;
      var px = opt.pointer.x;
      var py = opt.pointer.y;

      if (activeShape) {
        canvas.remove(activeShape);
      }

      if (currentTool === 'arrow') {
        activeShape = _makeArrow(startX, startY, px, py);
      } else if (currentTool === 'circle') {
        var radius = Math.sqrt(Math.pow(px - startX, 2) + Math.pow(py - startY, 2)) / 2;
        var cx = (startX + px) / 2;
        var cy = (startY + py) / 2;
        activeShape = new fabric.Circle({
          left: cx - radius, top: cy - radius,
          radius: radius,
          fill: 'transparent', stroke: currentColor, strokeWidth: 3,
          selectable: false, evented: false,
        });
      } else if (currentTool === 'rect') {
        activeShape = new fabric.Rect({
          left: Math.min(startX, px), top: Math.min(startY, py),
          width: Math.abs(px - startX), height: Math.abs(py - startY),
          fill: 'transparent', stroke: currentColor, strokeWidth: 3,
          selectable: false, evented: false,
        });
      }

      if (activeShape) {
        canvas.add(activeShape);
        canvas.renderAll();
      }
    });

    canvas.on('mouse:up', function () {
      if (!isDrawing) return;
      isDrawing = false;
      if (activeShape) {
        objectHistory.push(activeShape);
        activeShape = null;
      }
    });
  }

  // ── Shape builders ───────────────────────────────────────────────────────

  function _makeArrow(x1, y1, x2, y2) {
    var headLen = 12;
    var angle = Math.atan2(y2 - y1, x2 - x1);

    var line = new fabric.Line([x1, y1, x2, y2], {
      stroke: currentColor, strokeWidth: 3,
      selectable: false, evented: false,
    });

    var head = new fabric.Triangle({
      left: x2, top: y2,
      width: headLen, height: headLen,
      fill: currentColor,
      angle: (angle * 180 / Math.PI) + 90,
      originX: 'center', originY: 'center',
      selectable: false, evented: false,
    });

    var group = new fabric.Group([line, head], {
      selectable: false, evented: false,
    });

    return group;
  }

  function _placeText(x, y) {
    var text = new fabric.IText('Label', {
      left: x, top: y,
      fontFamily: 'Barlow Condensed, sans-serif',
      fontSize: 18,
      fontWeight: '700',
      fill: currentColor,
      stroke: '#000', strokeWidth: 0.5,
      editable: true,
      selectable: true,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    objectHistory.push(text);
  }

  // ── Undo / Clear ────────────────────────────────────────────────────────

  function undo() {
    if (!canvas || !objectHistory.length) return;
    var last = objectHistory.pop();
    canvas.remove(last);
    canvas.renderAll();
  }

  function clearAll() {
    if (!canvas) return;
    objectHistory.forEach(function (obj) {
      canvas.remove(obj);
    });
    objectHistory = [];
    canvas.renderAll();
  }

  // ── Save — flatten + upload to Cloudinary + persist ──────────────────────

  function save(photoId, authHeaders) {
    if (!canvas) return Promise.reject(new Error('No canvas'));

    // Deselect any active text editing
    canvas.discardActiveObject();
    canvas.renderAll();

    return new Promise(function (resolve, reject) {
      // Flatten canvas to full-size data URL for resize
      var fullDataUrl = canvas.toDataURL({ format: 'jpeg', quality: 1.0 });

      // Resize to max 1200px longest dimension, then export as JPEG 0.75
      var img = new Image();
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        var MAX_DIM = 1200;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w >= h) {
            h = Math.round(h * (MAX_DIM / w));
            w = MAX_DIM;
          } else {
            w = Math.round(w * (MAX_DIM / h));
            h = MAX_DIM;
          }
        }
        var resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = w;
        resizeCanvas.height = h;
        resizeCanvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resizeCanvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Compression failed')); return; }
          _uploadBlob(blob, photoId, authHeaders, resolve, reject);
        }, 'image/jpeg', 0.75);
      };
      img.onerror = function () { reject(new Error('Failed to load canvas image for resize')); };
      img.src = fullDataUrl;
    });
  }

  function _uploadBlob(blob, photoId, authHeaders, resolve, reject) {
      // Upload to Cloudinary
      var fd = new FormData();
      fd.append('file', blob, 'annotated.jpg');
      fd.append('upload_preset', PRESET);
      fd.append('folder', 'heartland/annotations');

      fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/upload', {
        method: 'POST',
        body: fd,
      })
      .then(function (res) {
        if (!res.ok) throw new Error('Cloudinary upload failed');
        return res.json();
      })
      .then(function (cData) {
        var annotatedUrl = cData.secure_url;

        // Save to DB via save-annotated-photo function
        // Use provided auth headers, or fall back to legacy ADMIN_TOKEN
        var hdrs = Object.assign({ 'Content-Type': 'application/json' },
          authHeaders || {});

        return fetch('/.netlify/functions/save-annotated-photo', {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({
            photo_id: photoId,
            annotated_url: annotatedUrl,
          }),
        }).then(function (dbRes) {
          if (!dbRes.ok) return dbRes.json().then(function (d) { throw new Error(d.error || 'Save failed'); });
          return annotatedUrl;
        });
      })
      .then(resolve)
      .catch(reject);
  }

  // ── Destroy ──────────────────────────────────────────────────────────────

  function destroy() {
    if (canvas) {
      canvas.dispose();
      canvas = null;
    }
    objectHistory = [];
    isDrawing = false;
    activeShape = null;
  }

  // ── Expose for tests ─────────────────────────────────────────────────────

  function _getState() {
    return {
      objectHistory: objectHistory,
      currentTool: currentTool,
      currentColor: currentColor,
      canvas: canvas,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  window.AnnotationEngine = {
    init: init,
    setTool: setTool,
    setColor: setColor,
    undo: undo,
    clearAll: clearAll,
    save: save,
    destroy: destroy,
    _getState: _getState,
  };

})();
