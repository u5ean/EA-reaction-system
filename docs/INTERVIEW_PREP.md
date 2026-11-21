# Interview prep — know these cold

## 30-second pitch
"I built the same floating-reactions effect twice. Phase 1 animates `bottom`, `margin-left`, `width`, `height` with CSS keyframes, which forces
Layout and Paint every frame. Phase 2 uses GSAP to animate only `x`, `y`, `scale`, `opacity`, which Chrome composites on the GPU with no per-frame
Layout/Paint. Under 6× CPU throttle with 60 reactions, Paint dropped from ~6,900 events to ~190, Layout more than halved, and FPS went from ~48 to ~56."

## The rendering pipeline (draw this on paper)
`JS → Style → Layout → Paint → (Layerize) → Composite`
- **Style**: which CSS rules apply. **Layout**: size/position of boxes (geometry). **Paint**: draw pixels into layers (raster). **Composite**: GPU stacks layers, applying transform/opacity.
- Changing `width/height/top/bottom/left/margin/font-size` → starts at Layout (most expensive; also re-paints).
- Changing `color/background/box-shadow` → starts at Paint.
- Changing `transform/opacity` (on a promoted layer) → Composite only (cheapest).

## Likely questions
1. **Why is animating `left` slower than `x`?** `left` changes geometry → Layout + Paint every frame, and the damaged region is repainted. `x` is a `transform: translate3d`, applied to an already-rasterised layer by the compositor.
2. **What does the green in Paint Flashing mean?** Regions repainted that frame. Phase 1: the whole path is green. Phase 2: nearly nothing.
3. **What does `will-change` do? Any downside?** Hints Chrome to promote the element to its own compositor layer ahead of time. Each layer costs GPU memory; don't put it on everything (60 small layers is fine, 6,000 isn't).
4. **Is GSAP running on the GPU thread?** No — *be accurate here*. GSAP is JS on the main thread writing inline transforms each frame (that's why Script time rose). Because only transform/opacity change, Chrome skips Layout and Paint and just composites. A pure-CSS `transform` keyframe animation would run on the compositor thread and survive main-thread jank — GSAP trades that for runtime control.
5. **Why scale from 0.5 → 1 instead of 1 → 2?** A promoted layer is rasterised at its initial size; scaling a small raster *up* blurs. I render at the largest size (56px) and scale down, so it stays crisp. SVG also re-rasterises cleanly.
6. **How does the slider work?** I keep a `Set` of in-flight timelines; `input` event calls `tl.timeScale(v)` on each, and new spawns read the stored speed. `timeScale` preserves the playhead, so no jump.
7. **How do you avoid memory leaks / zombie nodes?** CSS: `animationend` listener with `{once:true}` → `el.remove()`. GSAP: timeline `onComplete` → `timelines.delete`, `tl.kill()`, `el.remove()`. The "Nodes in DOM" counter returns to 0. `clear()` kills timelines on mode switch.
8. **Why SVG over PNG sequences?** Resolution independent, tiny, re-tintable with `currentColor`/CSS variables at runtime (Tint control), no @2x/@3x variants, no per-theme asset multiplication.
9. **What would you do with 500 concurrent reactions?** Pool and reuse nodes, cap concurrency, or switch to a single `<canvas>`/WebGL layer so we don't have one DOM node + layer per reaction; use `IntersectionObserver`/off-screen culling.
10. **Where did AI help / what did you verify yourself?** Be honest: say what you scaffolded, then be ready to walk through `engine-gsap.js` line by line (the timeline: ascent `ease:'none'`, sway as three sine tweens totalling 3 s, scale, fade at 60% → 100%).

## Things you can demo live
- Toggle modes, click **Stress ×60**, watch Paint Flashing (Rendering tab) — green wall vs clean.
- Drag Speed to 0.1× mid-flight; tick **Tint** and change colour during flight.
- Console: `ReactionApp.stats()` → `{active, nodes}` — show it returning to 0.

## Weak spots to own up to (shows maturity)
- Headless benchmark ≠ real device; re-run on your own machine before the interview and quote your numbers.
- Recalc Style is still non-zero in Phase 2 (inline style writes each frame).
- CSS mode can't do the speed slider by design (static rules); WAAPI (`element.animate`) would be the middle ground.
