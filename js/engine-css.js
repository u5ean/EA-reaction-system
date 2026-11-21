/* ==========================================================================
   PHASE 1 — CSS @keyframes engine
   --------------------------------------------------------------------------
   JavaScript's only jobs here: create the node, hand it per-element random
   values, and delete it when the animation is over. ALL motion is defined in
   css/styles.css (@keyframes float-css), which DELIBERATELY animates layout
   properties (bottom, margin-left, width, height) so we can observe the cost
   in DevTools (Layout + Paint every frame).
   ========================================================================== */
(function (global) {
  'use strict';
  var kit = global.ReactionKit; // shared helpers from icons.js
  var active = 0;               // how many reactions are currently flying (shown in the stats panel)
  var stage = null;             // the container element reactions are appended to

  /**
   * Create one reaction and start its CSS animation.
   * @param {string} type 'heart' | 'thumb' | 'fire' | 'star'
   */
  function spawn(type) {
    var el = kit.createReactionElement(type);

    // Adding this class is what STARTS the animation (it carries `animation: float-css 3s ...`).
    el.classList.add('reaction--css');

    // Per-element random values passed to CSS through custom properties (CSS variables).
    // Once the animation is running they cannot be changed — that's a limitation of static CSS rules.
    el.style.setProperty('--x', kit.randomSpawnX() + 'px');                       // start position
    var swayPx = kit.rand(14, 42);                                                // sway amplitude
    el.style.setProperty('--sway', (Math.random() < 0.5 ? -swayPx : swayPx) + 'px'); // random initial direction

    // The browser fires `animationend` once, when the 3s animation finishes.
    // { once: true } removes the listener automatically, so nothing leaks.
    el.addEventListener('animationend', function () {
      el.remove();   // take the node out of the DOM (no "zombie" nodes)
      active--;      // update the live counter
    }, { once: true });

    active++;
    stage.appendChild(el); // inserting into the DOM is what makes the browser begin the animation
    return el;
  }

  // Public interface. Both engines expose the same methods so app.js can treat them identically.
  global.CssEngine = {
    name: 'css',
    mount: function (stageEl) { stage = stageEl; },   // tell the engine where to put reactions
    spawn: spawn,
    count: function () { return active; },            // reactions currently in flight

    // Remove everything immediately (used when switching modes, so each test starts clean).
    clear: function () {
      var nodes = stage.querySelectorAll('.reaction--css');
      for (var i = 0; i < nodes.length; i++) nodes[i].remove();
      active = 0;
    },

    // Intentionally a no-op: the spec's speed slider belongs to Phase 2. (Technically possible in
    // CSS via the Web Animations API — el.getAnimations()[0].playbackRate — but plain keyframes can't.)
    setSpeed: function () {}
  };
})(window);
