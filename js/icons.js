/* ==========================================================================
   icons.js — shared helpers used by BOTH engines
   --------------------------------------------------------------------------
   Why this file exists: Phase 1 (CSS) and Phase 2 (GSAP) must animate the
   *identical* DOM node, so the only difference between them is HOW it is
   animated. That makes the performance comparison fair.
   ========================================================================== */
(function (global) {
  'use strict'; // catch silly mistakes (e.g. accidental globals)

  // Namespace required to create SVG elements from JavaScript (HTML elements don't need one).
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // The four reaction types. Each one matches a <symbol id="icon-..."> in index.html.
  var TYPES = ['heart', 'thumb', 'fire', 'star'];

  /**
   * Build one reaction element:
   *   <div class="reaction" data-type="heart" aria-hidden="true">
   *     <svg><use href="#icon-heart"/></svg>
   *   </div>
   * @param {string} type  one of TYPES
   * @returns {HTMLDivElement} a detached element (caller appends it to the stage)
   */
  function createReactionElement(type) {
    var el = document.createElement('div');
    el.className = 'reaction';          // shared look (see styles.css section A)
    el.dataset.type = type;             // CSS uses this to pick the colour (heart=red, etc.)
    el.setAttribute('aria-hidden', 'true'); // decorative: hide from screen readers

    // <svg><use> references the icon defined once in the sprite at the top of index.html.
    // Re-using one symbol keeps the DOM tiny and the artwork resolution-independent.
    var svg = document.createElementNS(SVG_NS, 'svg');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#icon-' + type);
    svg.appendChild(use);
    el.appendChild(svg);
    return el;
  }

  /** Random number in [min, max). Used for sway amount and spawn position. */
  function rand(min, max) { return min + Math.random() * (max - min); }

  /**
   * Pick a random horizontal start position inside the "spawn area":
   * a band centred at the bottom of the viewport (max 360px wide, or 90% of a small screen).
   * @returns {number} x position in px, relative to the viewport's left edge
   */
  function randomSpawnX() {
    var w = Math.min(360, window.innerWidth * 0.9); // band width
    var cx = window.innerWidth / 2;                 // centre of the screen
    return cx + rand(-w / 2, w / 2);                // random point inside the band
  }

  // Expose to the other scripts (classic scripts share state through `window`).
  global.ReactionKit = { TYPES: TYPES, createReactionElement: createReactionElement, rand: rand, randomSpawnX: randomSpawnX };
})(window);
