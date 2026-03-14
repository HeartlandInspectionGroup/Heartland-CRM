/**
 * inspector-voice.js — Web Speech API wrapper for voice-to-text
 * Namespace: window.HIG_INSPECTOR.voice
 */
(function() {
  'use strict';

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var isSupported = !!SpeechRecognition;
  var recognition = null;
  var isListening = false;
  var targetTextarea = null;

  /* ═══ INIT ═══ */
  function init() {
    if (!isSupported) {
      /* Hide all voice buttons */
      var btns = document.querySelectorAll('.iw-voice-btn');
      btns.forEach(function(btn) { btn.style.display = 'none'; });
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = function(e) {
      var transcript = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      if (targetTextarea && transcript) {
        /* Append finalized results */
        var lastResult = e.results[e.results.length - 1];
        if (lastResult.isFinal) {
          var current = targetTextarea.value;
          if (current && !current.endsWith(' ') && !current.endsWith('\n')) {
            current += ' ';
          }
          targetTextarea.value = current + transcript.trim();
          /* Trigger input event for auto-save */
          targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    };

    recognition.onend = function() {
      isListening = false;
      updateButtons();
    };

    recognition.onerror = function(e) {
      console.warn('[voice] Recognition error:', e.error);
      isListening = false;
      updateButtons();
    };
  }

  /* ═══ START/STOP ═══ */

  /**
   * Start listening and appending to the given textarea.
   * @param {HTMLTextAreaElement} textarea
   */
  function startListening(textarea) {
    if (!isSupported || !recognition) return;
    targetTextarea = textarea;
    try {
      recognition.start();
      isListening = true;
      updateButtons();
    } catch (e) {
      /* Already started */
    }
  }

  function stopListening() {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (e) { /* not started */ }
    isListening = false;
    updateButtons();
  }

  function toggleListening(textarea) {
    if (isListening) {
      stopListening();
    } else {
      startListening(textarea);
    }
  }

  /* ═══ UI ═══ */
  function updateButtons() {
    var btns = document.querySelectorAll('.iw-voice-btn');
    btns.forEach(function(btn) {
      if (isListening) {
        btn.classList.add('listening');
        btn.title = 'Stop dictation';
      } else {
        btn.classList.remove('listening');
        btn.title = 'Start dictation';
      }
    });
  }

  /* ═══ EXPORT ═══ */
  window.HIG_INSPECTOR = window.HIG_INSPECTOR || {};
  window.HIG_INSPECTOR.voice = {
    init: init,
    isSupported: function() { return isSupported; },
    isListening: function() { return isListening; },
    startListening: startListening,
    stopListening: stopListening,
    toggleListening: toggleListening
  };

})();
