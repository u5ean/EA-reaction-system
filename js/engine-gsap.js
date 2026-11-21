/* ==========================================================================
   PHASE 2 — GSAP engine (compositor-friendly)
   --------------------------------------------------------------------------
   Animates ONLY x, y, scale, opacity. GSAP writes x/y/scale together as one
   `transform: translate3d(...) scale(...)` plus `opacity`. Chrome can move an
   already-painted layer with those two properties, so there is NO Layout and
   NO Paint per frame (compare with Phase 1).
   Note: GSAP itself runs as JavaScript on the main thread each frame.
   ========================================================================== */
(function (global) {
  'use strict';
  var kit = global.ReactionKit;
  var stage = null;
  var timelines = new Set();  // every in-flight timeline — lets us change all their speeds at once
  var speed = 1;              // current speed multiplier (from the slider); new reactions start at this speed
  var DURATION = 3;           // seconds: the required 3-second lifespan
  var START_BOTTOM = 80;      // px above the bottom edge where reactions begin (matches CSS `bottom`)

  /**
   * Create one reaction and build its GSAP timeline.
   * @param {string} type 'heart' | 'thumb' | 'fire' | 'star'
   */
  function spawn(type) {
    var el = kit.createReactionElement(type);
    el.classList.add('reaction--gsap');                   // static styles only (size, will-change)
    el.style.setProperty('--x', kit.randomSpawnX() + 'px'); // start x (static, set once — not animated)
    stage.appendChild(el);

    // Distance to travel so the icon reaches the top edge: viewport height minus start offset minus icon size.
    var travel = window.innerHeight - START_BOTTOM - 56;
    // Random sway amplitude (14–42px), random initial direction (left or right).
    var sway = kit.rand(14, 42) * (Math.random() < 0.5 ? -1 : 1);

    // Initial state. scale 0.5 because the icon is rendered at its LARGEST size (56px) and scaled
    // DOWN, which keeps it sharp. force3D:true makes GSAP use translate3d => guaranteed GPU layer.
    gsap.set(el, { x: 0, y: 0, scale: 0.5, opacity: 1, force3D: true });

    // A timeline groups several tweens so they play, speed up and finish together.
    var tl = gsap.timeline({
      // Runs automatically when the whole timeline finishes: clean up everything.
      onComplete: function () {
        timelines.delete(tl); // stop tracking it
        tl.kill();            // release GSAP's internal references (no memory leak)
        el.remove();          // remove the DOM node (no zombie nodes)
      }
    });

    // 1) ASCENT: move up the full distance at constant speed (ease 'none' = linear), like a rising bubble.
    //    The 0 at the end means "start at time 0 of the timeline".
    tl.to(el, { y: -travel, duration: DURATION, ease: 'none' }, 0);

    // 2) SWAY: side-to-side motion built from three smooth sine tweens that add up to 3s
    //    (right → left → centre), giving roughly two gentle S-curves during the flight.
    var q = DURATION / 4; // one quarter of the lifespan
    tl.to(el, { x:  sway, duration: q,     ease: 'sine.out'   }, 0)       // 0.00s → 0.75s: drift out
      .to(el, { x: -sway, duration: q * 2, ease: 'sine.inOut' }, q)       // 0.75s → 2.25s: swing across
      .to(el, { x:  0,    duration: q,     ease: 'sine.in'    }, q * 3);  // 2.25s → 3.00s: return to centre

    // 3) SCALE UP: 0.5 → 1 over the flight (equals 28px → 56px, same as Phase 1).
    tl.to(el, { scale: 1, duration: DURATION, ease: 'power1.out' }, 0);

    // 4) FADE OUT: during the last 40% (from 1.8s), reaching opacity 0 exactly at the top.
    tl.to(el, { opacity: 0, duration: DURATION * 0.4, ease: 'power1.in' }, DURATION * 0.6);

    tl.timeScale(speed);   // new reactions respect whatever the slider is currently set to
    timelines.add(tl);     // track it so setSpeed() can reach it later
    return el;
  }

  global.GsapEngine = {
    name: 'gsap',
    mount: function (stageEl) { stage = stageEl; },
    spawn: spawn,
    count: function () { return timelines.size; },       // reactions currently in flight

    // Immediately stop and delete everything (used when switching modes).
    clear: function () {
      timelines.forEach(function (tl) { tl.kill(); });   // stop every animation
      timelines.clear();
      var nodes = stage.querySelectorAll('.reaction--gsap');
      for (var i = 0; i < nodes.length; i++) nodes[i].remove();
    },

    /**
     * DYNAMIC MID-AIR SPEED CONTROL.
     * timeScale multiplies playback rate (0.1 = 10× slower, 2 = 2× faster). GSAP keeps each
     * timeline's current position, so there is no jump — only the rate changes, in real time.
     */
    setSpeed: function (v) {
      speed = v;                                          // remember for reactions spawned later
      timelines.forEach(function (tl) { tl.timeScale(v); }); // retime every reaction already flying
    },
    getSpeed: function () { return speed; }
  };
})(window);
