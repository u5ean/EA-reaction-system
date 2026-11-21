/* ==========================================================================
   app.js — wires the UI to the engines
   Responsibilities: mode switch · buttons · stress test · speed slider ·
   tint · live stats (FPS / active / nodes) · small API for the benchmark.
   ========================================================================== */
(function () {
  'use strict';
  var kit = window.ReactionKit;
  var stage = document.getElementById('stage'); // the full-screen layer where reactions fly

  // Both engines have the same methods (mount/spawn/count/clear/setSpeed) so the app can swap them.
  var engines = { css: window.CssEngine, gsap: window.GsapEngine };
  Object.keys(engines).forEach(function (k) { engines[k].mount(stage); });

  var mode = 'css'; // current engine: 'css' (Phase 1) or 'gsap' (Phase 2)

  // Cache references to every DOM element we touch (cheaper than looking them up repeatedly).
  var el = {
    modeCss: document.getElementById('mode-css'),
    modeGsap: document.getElementById('mode-gsap'),
    send: document.getElementById('btn-send'),
    burst: document.getElementById('btn-burst'),
    speed: document.getElementById('speed'),
    speedOut: document.getElementById('speed-out'),
    speedWrap: document.getElementById('speed-wrap'),
    tintOn: document.getElementById('tint-on'),
    tintColor: document.getElementById('tint-color'),
    fps: document.getElementById('stat-fps'),
    active: document.getElementById('stat-active'),
    nodes: document.getElementById('stat-nodes')
  };

  /** Switch between Phase 1 and Phase 2. Clears the stage so every comparison starts from zero. */
  function setMode(next) {
    if (next === mode) return;
    engines[mode].clear();                                   // remove the old engine's reactions
    mode = next;
    // Update the toggle buttons' pressed state (also drives their highlighted look + accessibility).
    el.modeCss.setAttribute('aria-pressed', String(mode === 'css'));
    el.modeGsap.setAttribute('aria-pressed', String(mode === 'gsap'));
    // The speed slider only works in Phase 2, so grey it out in Phase 1.
    var gsapMode = mode === 'gsap';
    el.speed.disabled = !gsapMode;
    el.speedWrap.classList.toggle('disabled', !gsapMode);
    // Keep the URL in sync (?mode=gsap) so a refresh/bookmark returns to the same mode.
    try { history.replaceState(null, '', '?mode=' + mode); } catch (e) { /* some file:// setups block this; harmless */ }
  }

  /** Spawn one reaction in the current mode. No argument = random type. */
  function spawn(type) {
    engines[mode].spawn(type || kit.TYPES[(Math.random() * kit.TYPES.length) | 0]);
  }

  /**
   * STRESS TEST: spawn n reactions, gapMs apart. With the defaults (60 × 15ms ≈ 0.9s) and a 3s
   * lifespan, all 60 are in the air at once => a repeatable high-concurrency load for profiling.
   * @returns {Promise} resolves when the last one has been spawned
   */
  function burst(n, gapMs) {
    n = n || 60; gapMs = gapMs || 15;
    return new Promise(function (resolve) {
      var i = 0;
      (function tick() {
        spawn();
        if (++i < n) setTimeout(tick, gapMs); else resolve();
      })();
    });
  }

  /* ------------------------------ UI events ------------------------------ */

  // Mode toggle buttons.
  el.modeCss.addEventListener('click', function () { setMode('css'); });
  el.modeGsap.addEventListener('click', function () { setMode('gsap'); });

  // The four emoji buttons: each spawns its own type (data-type="heart" etc.).
  document.querySelectorAll('.emoji-btn').forEach(function (b) {
    b.addEventListener('click', function () { spawn(b.dataset.type); });
  });

  // "Send Reaction": a click spawns one; HOLDING repeats every 55ms (quick way to reach 50+ concurrent).
  var holdTimer = null;
  function stopHold() { clearInterval(holdTimer); holdTimer = null; }
  el.send.addEventListener('pointerdown', function () {
    spawn();                              // immediate reaction on press
    stopHold();                           // safety: never run two timers
    holdTimer = setInterval(spawn, 55);   // keep spawning while held
  });
  // Stop repeating when the pointer is released, leaves the button, is cancelled, or focus is lost.
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(function (ev) { el.send.addEventListener(ev, stopHold); });
  // Keyboard accessibility: Enter or Space spawns one reaction.
  el.send.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); spawn(); }
  });

  // "Stress ×60" button.
  el.burst.addEventListener('click', function () { burst(60, 15); });

  // Speed slider (Phase 2 only): fires continuously while dragging.
  el.speed.addEventListener('input', function () {
    var v = parseFloat(el.speed.value);           // slider value comes in as a string
    el.speedOut.textContent = v.toFixed(1) + '×'; // update the label next to the slider
    engines.gsap.setSpeed(v);                     // retime every reaction currently flying
  });

  /**
   * TINT: when the checkbox is on, every reaction is recoloured to the chosen colour.
   * Works because the icons are vector (fill = currentColor) and the colour comes from one CSS
   * variable on the stage — change it once and every live reaction updates instantly.
   */
  function applyTint() {
    stage.dataset.tint = el.tintOn.checked ? 'on' : 'off'; // CSS rule `.stage[data-tint="on"]` reads this
    stage.style.setProperty('--tint', el.tintColor.value); // the colour from the colour picker
  }
  el.tintOn.addEventListener('change', applyTint);   // checkbox toggled
  el.tintColor.addEventListener('input', applyTint); // picker dragged (updates live)

  /* ------------------------------ live stats ------------------------------ */
  // A requestAnimationFrame loop runs once per rendered frame. Counting frames per 500ms gives FPS.
  var frames = 0, last = performance.now();
  var frameLog = null;          // when the benchmark enables it, stores every frame's duration
  var prev = last;              // timestamp of the previous frame
  function loop(now) {
    frames++;
    if (frameLog) frameLog.push(now - prev); // record frame time for the benchmark (ms)
    prev = now;
    if (now - last >= 500) {                 // refresh the panel twice a second
      el.fps.textContent = Math.round(frames * 1000 / (now - last));
      frames = 0; last = now;
      el.active.textContent = engines[mode].count();  // reactions the engine thinks are flying
      el.nodes.textContent = stage.childElementCount; // real DOM nodes: should return to 0 when idle
    }
    requestAnimationFrame(loop);             // schedule the next frame
  }
  requestAnimationFrame(loop);

  // Start in the mode named in the URL (?mode=css or ?mode=gsap), if any.
  var q = /[?&]mode=(css|gsap)/.exec(location.search);
  if (q) setMode(q[1]);

  /* A small public API: used by bench/bench.js, and handy in the DevTools console, e.g.
       ReactionApp.setMode('gsap'); ReactionApp.burst(60); ReactionApp.stats();            */
  window.ReactionApp = {
    setMode: setMode, spawn: spawn, burst: burst,
    setSpeed: function (v) { el.speed.value = v; el.speed.dispatchEvent(new Event('input')); },
    stats: function () { return { mode: mode, active: engines[mode].count(), nodes: stage.childElementCount }; },
    startFrameLog: function () { frameLog = []; prev = performance.now(); },  // begin recording frame times
    stopFrameLog: function () { var l = frameLog; frameLog = null; return l; } // stop and return them
  };
})();
