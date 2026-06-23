# Performance Optimization Handoff for Codex
## Amino Arcade (3d-companion) — Screen-Share Lag Fix
**Priority:** URGENT — presentation is tomorrow (2026-06-24), tool lags heavily during Zoom/Google Meet screen share
**Scope:** Frontend only (`3d-companion/frontend/src/`)
**Stack:** React 19 + Vite 8 + Mol* 5.0 + Tailwind 3 + Recharts 3

---

## Root Cause Analysis

The lag during screen sharing is caused by the compounding effect of:
1. **Mol* WebGL rendering** — GPU-intensive 3D molecular viewer must both render AND be captured by screen share software
2. **Continuous animation loop** — a `setInterval` at 70ms (~14fps) spinning the model even when idle
3. **Monolithic class component** — 1281-line `App.jsx` is a single React class component with ~30 state fields. Every `setState` triggers a full render of the entire tree
4. **No memoization** — expensive computations (`computeLensModel`, `contactProximityScore`, `lensMetrics`) recompute on every render
5. **Inline style objects created every render** — the `st()` helper parses CSS strings into objects on every call, preventing React's style identity optimization
6. **Multiple concurrent timers** — `_spin`, `_triT`, `_recT`, `_playT`, `_foldT` all running `setState` independently

---

## Prioritized Changes (P0 = do first)

### P0-1: Add a "Presentation Mode" toggle that kills unnecessary rendering

**File:** `src/App.jsx`
**What:** Add a `presentationMode` state boolean (toggled via keyboard shortcut `P` or a UI button). When active:
- Stop the spin interval (`clearInterval(this._spin)`)
- Reduce Mol* rendering quality (see P0-2)
- Disable all background animations
- Hide non-essential UI panels (terminal, job popup, engine selector)

**Implementation:**
```jsx
// In handleKeyDown:
if (event.key === 'p' || event.key === 'P') {
  this.setState(s => {
    const next = !s.presentationMode;
    if (next) {
      clearInterval(this._spin);
      this._spin = null;
    } else {
      this._spin = setInterval(() => {
        if (this.state.view === "stage" && this.state.spin && !this._drag && !this.hasReal())
          this.setState(s => ({ rot: s.rot + 0.04 }));
      }, 70);
    }
    return { presentationMode: next, spin: !next && s.spin };
  });
}
```

**Why this is P0:** Single toggle that eliminates the largest sources of frame drops. Can be added in <10 min.

---

### P0-2: Reduce Mol* WebGL quality during screen share

**File:** `src/components/MolPlayfield.jsx`
**What:** When presentation mode is active, configure Mol* canvas with reduced settings:

```javascript
// In the load() method, after plugin initialization:
if (this.props.presentationMode) {
  await PluginCommands.Canvas3D.SetSettings(this.plugin, {
    settings: (props) => {
      // Reduce pixel ratio to 1 (instead of devicePixelRatio which may be 2)
      props.pixelScale = 1;
      // Disable anti-aliasing
      if (props.postprocessing) {
        props.postprocessing.antialiasing = { name: 'off', params: {} };
        props.postprocessing.occlusion = { name: 'off', params: {} };
      }
      // Reduce shadow quality
      if (props.renderer) {
        props.renderer.ambientIntensity = 1.0;
        props.renderer.light = [];
      }
      // Stop auto-spin
      if (props.trackball) {
        props.trackball.animate = { name: 'off', params: {} };
      }
    }
  });
}
```

**Pass `presentationMode` as prop** from `App.jsx` to `MolPlayfield`:
```jsx
// In App.jsx render(), the MolPlayfield call:
h(MolPlayfield, {
  ...existingProps,
  presentationMode: st2.presentationMode,
})
```

---

### P0-3: Stop the spin timer when model is loaded / user is interacting

**File:** `src/App.jsx`, line 78
**Current:**
```javascript
this._spin = setInterval(() => {
  if (this.state.view === "stage" && this.state.spin && !this._drag && !this.hasReal())
    this.setState((s) => ({ rot: s.rot + 0.04 }));
}, 70);
```

**Change:** Only run the spin timer when there's no real data loaded AND the view is stage AND no overlays are active. The 70ms interval (14fps) is also too aggressive — increase to 100ms (10fps) for the same visual effect:

```javascript
this._spin = setInterval(() => {
  if (this.state.view === "stage" && this.state.spin && !this._drag
      && !this.hasReal() && !this.state.presentationMode) {
    this.setState((s) => ({ rot: s.rot + 0.04 }));
  }
}, 100); // was 70
```

---

### P1-1: Memoize expensive computations in render()

**File:** `src/App.jsx`, `render()` method (line 967+)

The render method calls these expensive functions on every render:
- `this.arcadeTargets()` — called multiple times per render
- `this.conceptDefs()` — called every render
- `this.frameDataT()` — trigonometric computations every render
- `this.fapeData()` — matrix math every render
- `computeLensModel()` — contact/geometry computation every render
- `this.realFrames()` — array mapping every render
- `this.realPlddt()` — called multiple times
- `this.confidenceSummary()` — full atom parsing every render

**Fix:** Cache results at the top of render and reuse:

```javascript
render() {
  const C = this.C, st2 = this.state;
  
  // Cache expensive calls — only recompute when inputs change
  const tg = this._cachedTargets || (this._cachedTargets = this.arcadeTargets());
  const defs = this._cachedDefs || (this._cachedDefs = this.conceptDefs());
  // ... etc
```

**Better long-term fix:** Convert to functional component with `useMemo`. But that's a major refactor — the caching approach is a quick win.

**Alternative quick approach — add a shouldComponentUpdate:**
```javascript
shouldComponentUpdate(nextProps, nextState) {
  // Skip render if only the spin rotation changed and we're in presentation mode
  if (this.state.presentationMode && 
      nextState.rot !== this.state.rot &&
      Object.keys(nextState).every(k => k === 'rot' || nextState[k] === this.state[k])) {
    return false;
  }
  return true;
}
```

---

### P1-2: Cache the `st()` style helper results

**File:** `src/lib/viewer.js`
**Current:** `st("font-size:12px;color:red;")` parses the string on every call.
**Fix:** Add a WeakMap-style cache:

```javascript
const _styleCache = new Map();
const MAX_CACHE = 500;

function st(str) {
  if (_styleCache.has(str)) return _styleCache.get(str);
  const out = {};
  String(str).split(";").forEach((rule) => {
    const i = rule.indexOf(":");
    if (i < 0) return;
    let k = rule.slice(0, i).trim();
    const v = rule.slice(i + 1).trim();
    if (!k || v === "") return;
    if (!k.startsWith("--")) k = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[k] = v;
  });
  if (_styleCache.size > MAX_CACHE) _styleCache.clear();
  _styleCache.set(str, out);
  return out;
}
```

**Impact:** The render method calls `st()` ~200+ times per render. Caching eliminates all string parsing after the first render.

---

### P1-3: Throttle setState calls from timers

**File:** `src/App.jsx`
**Issue:** Multiple `setInterval` timers call `setState` independently, each triggering a full render. When triangle play, recycle play, and real playback run simultaneously, that's 3+ renders per 400-500ms on top of the spin timer.

**Fix:** Batch timer state updates using `requestAnimationFrame`:

```javascript
_pendingTimerState = null;
_rafId = null;

batchedSetState(updater) {
  if (!this._pendingTimerState) {
    this._pendingTimerState = {};
  }
  const partial = typeof updater === 'function' ? updater(this.state) : updater;
  Object.assign(this._pendingTimerState, partial);
  
  if (!this._rafId) {
    this._rafId = requestAnimationFrame(() => {
      if (this._pendingTimerState) {
        this.setState(this._pendingTimerState);
        this._pendingTimerState = null;
      }
      this._rafId = null;
    });
  }
}
```

Then use `this.batchedSetState()` instead of `this.setState()` in all timer callbacks.

---

### P1-4: Lazy-load Mol* 

**File:** `src/components/MolPlayfield.jsx`
**Current:** Mol* is imported eagerly at the top level. It's a massive library (~2MB).
**Fix:** Already using dynamic `import()` for PluginCommands — extend this to the initial plugin creation:

```javascript
async load({ resetCamera = false, quiet = false } = {}) {
  // ... existing code
  if (!this.plugin) {
    const { PluginContext } = await import("molstar/lib/mol-plugin/context");
    const { DefaultPluginSpec } = await import("molstar/lib/mol-plugin/spec");
    // ... plugin init
  }
}
```

This is partially done already. Verify Mol* isn't in the initial chunk via `vite build --report`.

---

### P2-1: Reduce Recharts overhead

**File:** `src/components/RecycleTimeline.jsx` and any component using Recharts
**Issue:** Recharts SVG charts re-render on every parent render. During live playback, this creates significant overhead.

**Fix:** Wrap Recharts components in `React.memo` with a custom comparator:

```javascript
const MemoizedLineChart = React.memo(({ data, ...props }) => (
  <LineChart data={data} {...props}>
    {/* ... */}
  </LineChart>
), (prev, next) => {
  return prev.data.length === next.data.length && 
         prev.data[prev.data.length - 1] === next.data[next.data.length - 1];
});
```

---

### P2-2: Virtualize the contact map

**File:** `src/components/ContactDeltaMap.jsx`
**Issue:** For a 200-residue protein, the contact map renders 40,000 cells as SVG elements.
**Fix:** Only render visible cells. The existing `visibleContactDeltaCells` function in `contactDeltaView.js` may already do this — verify it's being used in the render path.

---

### P2-3: Add `will-change: transform` to the Mol* container

**File:** `src/App.jsx` or `src/components/MolPlayfield.jsx`
**What:** Add CSS hint to promote the WebGL canvas to its own compositor layer:

```css
.mol-playfield-container {
  will-change: transform;
  contain: strict;
  isolation: isolate;
}
```

This tells the browser to composite the WebGL canvas separately from the rest of the page, reducing the work when screen-sharing captures frames.

---

### P2-4: Add CSS `contain: content` to stable UI panels

**File:** `src/App.css`
**What:** Add containment to panels that don't change during interaction:

```css
/* The lens rail doesn't change during Mol* interaction */
.lens-rail {
  contain: content;
}

/* The header bar */
.arcade-header {
  contain: layout style;
}
```

This prevents the browser from re-laying-out stable panels when the 3D viewport updates.

---

## Quick Win: Presentation Mode CSS Class

Add this to `src/App.css`:

```css
.arcade-shell.presentation-mode .mol-playfield canvas {
  image-rendering: optimizeSpeed;
}

.arcade-shell.presentation-mode [data-testid="fold-terminal"],
.arcade-shell.presentation-mode .engine-selector,
.arcade-shell.presentation-mode .archive-panel {
  display: none !important;
}
```

And in the root div of `render()`:
```javascript
return h("div", {
  className: `arcade-shell${st2.presentationMode ? ' presentation-mode' : ''}`,
  // ... existing style
```

---

## Testing the Fix

1. Run `npm run dev` and open in Chrome
2. Start a Zoom/Meet call with screen share active
3. Toggle presentation mode (press P)
4. Navigate between lenses — should be smooth
5. Rotate the molecule manually — should not lag
6. Check that all interactive features still work (sliders, toggles, lens switching)

**Key metric:** With screen share active, interaction should feel responsive (< 100ms input lag). Currently it's likely 300-500ms+ due to frame drops.

---

## Files Modified (Summary)

| File | Changes |
|---|---|
| `src/App.jsx` | Add `presentationMode` state, keyboard handler (P key), pass prop to MolPlayfield, `shouldComponentUpdate`, cache expensive calls in render, batch timer setState |
| `src/components/MolPlayfield.jsx` | Accept `presentationMode` prop, reduce WebGL quality when active |
| `src/lib/viewer.js` | Add LRU cache to `st()` function |
| `src/App.css` | Add `.presentation-mode` CSS class with containment and quality reduction |

---

## Implementation Order

1. **P0-1 + P0-3** (5 min): Presentation mode toggle + stop spin. Biggest impact for smallest change.
2. **P1-2** (3 min): Cache `st()` results. Eliminates hundreds of string parses per render.
3. **P0-2** (10 min): Mol* quality reduction. Requires testing Mol* API.
4. **P1-1** (10 min): Add `shouldComponentUpdate`. Prevents unnecessary re-renders.
5. **P2-3 + P2-4** (5 min): CSS containment hints. Zero-risk compositor optimization.
6. **P1-3** (15 min): Batched timer setState. Requires careful testing of all timer interactions.
7. **P1-4, P2-1, P2-2** (30 min): Larger refactors. Do after the presentation if time allows.

**Total for P0 fixes: ~20 minutes of work. Should eliminate 60-80% of the lag.**

---

## Commit Strategy

Suggested commits:
1. `perf: add presentation mode toggle (P key) to reduce rendering overhead`
2. `perf: cache st() style helper results with LRU map`
3. `perf: reduce Mol* WebGL quality in presentation mode`
4. `perf: add shouldComponentUpdate to prevent unnecessary re-renders`
5. `perf: add CSS containment hints for stable UI panels`
6. `perf: batch timer setState calls via requestAnimationFrame`

Each commit should be independently deployable and testable.
