# Sniper Improvement Blueprint
_Based on: `component_capture_tdd.md` — SingleFile Architecture Analysis_
_Date: 2026-07-13_

---

## What We Have Today vs. What SingleFile Taught Us

This document maps the gaps between CEN Explorer's current `sniper_injected.js` + `sniper_handler.cjs` pipeline and the high-fidelity extraction techniques described in the SingleFile TDD. Every improvement listed here is actionable and scoped to our existing server-side Playwright architecture — no extension rewrite needed.

---

## Gap Analysis Summary

| Gap | Impact | Effort | Priority |
| :--- | :--- | :--- | :--- |
| 1. Closed Shadow DOM roots silently dropped | High | Medium | P0 |
| 2. adoptedStyleSheets never captured | High | Low | P0 |
| 3. CSS extraction: only computed diff, no rule-set matching | High | Medium | P1 |
| 4. CSS variables baked to resolved values, token context lost | Medium | Low | P1 |
| 5. No Base64 asset inlining for images / fonts | Medium | Medium | P2 |
| 6. Cross-frame sniper uses e.target, not composedPath | Medium | Low | P2 |
| 7. No keep-alive heartbeat during long extraction | Low | Low | P3 |
| 8. HTML output is a fragment, not a standalone document | Low | Low | P3 |

---

## Current Pipeline Summary

```
User click (sniper_injected.js)
  --> extractHighFidelityComponent(target)
        |-- cloneNodeWithShadows()           [open shadow only]
        |-- traverseAndMap()                 [builds node IDs]
        |-- getComputedStyle() diff loop     [CSS via computed diff vs defaults]
        |-- ::before / ::after pseudo capture
        `-- redactAssetsForAI()

  --> _captureElementScreenshot (Playwright binding)
        `-- sniper_handler.cjs
              |-- locator('.cen-snip-target').screenshot()
              |-- fs.writeFileSync(html)
              |-- fs.writeFileSync(cleanHtml)
              `-- inspirations.json DB update
```

---

## Gap 1: Closed Shadow DOM Roots Are Silently Dropped

**Current behavior:**
`cloneNodeWithShadows()` reads `node.shadowRoot`. For shadow trees initialized with `{ mode: 'closed' }`, `shadowRoot` returns `null` — those subtrees are completely skipped.

**What SingleFile does:**
Injects a MAIN world hook at `document_start` that patches `Element.prototype.attachShadow` to intercept and cache every shadow root — including closed ones — in a `WeakMap<Element, ShadowRoot>` on `window.__cenShadowRoots`.

**Proposed fix — add to `server.cjs` page initialization:**

```javascript
await page.addInitScript(() => {
  const shadowRoots = new WeakMap();
  const originalAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function(init) {
    const root = originalAttachShadow.call(this, init);
    shadowRoots.set(this, root);
    return root;
  };
  window.__cenShadowRoots = shadowRoots;
});
```

**Update `cloneNodeWithShadows()` in `sniper_injected.js`:**

```javascript
function getShadowRoot(node) {
  if (node.shadowRoot) return node.shadowRoot;
  if (window.__cenShadowRoots) return window.__cenShadowRoots.get(node);
  return null;
}

function cloneNodeWithShadows(node) {
  const clone = node.cloneNode(false);
  const shadowRoot = getShadowRoot(node);
  if (shadowRoot) {
    const shadowClone = clone.attachShadow({ mode: shadowRoot.mode || 'open' });
    for (let i = 0; i < shadowRoot.childNodes.length; i++) {
      shadowClone.appendChild(cloneNodeWithShadows(shadowRoot.childNodes[i]));
    }
  }
  for (let i = 0; i < node.childNodes.length; i++) {
    clone.appendChild(cloneNodeWithShadows(node.childNodes[i]));
  }
  return clone;
}
```

---

## Gap 2: adoptedStyleSheets Are Never Captured

**Current behavior:**
Our computed diff picks up applied computed values but misses source rules that live exclusively in `adoptedStyleSheets`. Frameworks like Lit, Shoelace, and web component libraries inject all their styles via `CSSStyleSheet.prototype.replaceSync()` — these never appear in `document.styleSheets` and are totally invisible to our current extraction.

**What SingleFile does:**
Patches `CSSStyleSheet.prototype.replace` and `replaceSync` in the MAIN world to push every CSS text string into a global `window.__cenAdoptedStylesheets` array.

**Proposed fix — extend the `page.addInitScript()` block in `server.cjs`:**

```javascript
const adoptedRegistry = [];
const origReplaceSync = CSSStyleSheet.prototype.replaceSync;
const origReplace = CSSStyleSheet.prototype.replace;

CSSStyleSheet.prototype.replaceSync = function(cssText) {
  adoptedRegistry.push(cssText);
  return origReplaceSync.call(this, cssText);
};
CSSStyleSheet.prototype.replace = async function(cssText) {
  adoptedRegistry.push(cssText);
  return origReplace.call(this, cssText);
};
window.__cenAdoptedStylesheets = adoptedRegistry;
```

**Update `extractHighFidelityComponent()` in `sniper_injected.js` — append at the end:**

```javascript
const adopted = (window.__cenAdoptedStylesheets || []).join('\n');
if (adopted) {
  cssContent = `/* adoptedStyleSheets */\n${adopted}\n\n` + cssContent;
}
```

---

## Gap 3: CSS Extraction Is Computed-Diff Only — Rule-Set Matching Missing

**Current behavior:**
We use `getComputedStyle()` diff against tag defaults. This loses structural CSS: pseudo-classes (`:hover`, `:focus`), `@media` responsive rules, `@keyframes` animations, and `@font-face` declarations are all invisible to `getComputedStyle`.

**What SingleFile's TDD proposes:**
Walk every `document.styleSheets` rule and run `element.matches(rule.selectorText)` against the target and all descendants. Include all matching rules plus referenced keyframes and font-faces.

**Proposed new function in `sniper_injected.js`:**

```javascript
function extractRulesetCSS(element) {
  const elements = [element, ...element.querySelectorAll('*')];
  let matched = '';
  const usedAnimations = new Set();

  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = Array.from(sheet.cssRules || []); } catch { continue; }

    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const hits = elements.some(el => {
          try { return el.matches(rule.selectorText); } catch { return false; }
        });
        if (hits) {
          matched += rule.cssText + '\n';
          const anim = rule.style.animationName;
          if (anim && anim !== 'none') usedAnimations.add(anim);
        }
      } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
        let subMatched = '';
        for (const sub of Array.from(rule.cssRules || [])) {
          if (sub instanceof CSSStyleRule) {
            const hits = elements.some(el => {
              try { return el.matches(sub.selectorText); } catch { return false; }
            });
            if (hits) subMatched += sub.cssText + '\n';
          }
        }
        if (subMatched) {
          const cond = rule.conditionText || (rule.media && rule.media.mediaText) || '';
          matched += `@media ${cond} {\n${subMatched}}\n`;
        }
      } else if (rule instanceof CSSKeyframesRule) {
        if (usedAnimations.has(rule.name)) matched += rule.cssText + '\n';
      } else if (rule instanceof CSSFontFaceRule) {
        matched += rule.cssText + '\n';
      }
    }
  }

  return matched;
}
```

**Merge both outputs in `extractHighFidelityComponent()`:**

```javascript
const rulesetCSS = extractRulesetCSS(targetElement);
cssContent = `/* Ruleset CSS (hover states, media, keyframes) */\n${rulesetCSS}\n\n/* Computed Diff CSS */\n${cssContent}`;
```

---

## Gap 4: CSS Variable Resolution Loses Token Context

**Current behavior:**
Our computed diff stores resolved `rgb(...)` values. Correct for rendering, but the semantic token names (`--color-primary`, `--radius-lg`) are gone. The clean HTML file becomes opaque for design analysis and themeing.

**What SingleFile's TDD proposes:**
Pull the raw `:root {}` and `:host {}` variable blocks verbatim alongside the resolved output so both the token map and resolved values are preserved.

**Proposed addition — inside `extractRulesetCSS()`:**

```javascript
// At the start of extractRulesetCSS, collect :root and :host blocks
let tokenBlocks = '';
for (const sheet of Array.from(document.styleSheets)) {
  try {
    for (const rule of Array.from(sheet.cssRules || [])) {
      if (rule instanceof CSSStyleRule) {
        if (rule.selectorText === ':root' || rule.selectorText === ':host') {
          tokenBlocks += `/* CSS Variable Tokens */\n${rule.cssText}\n\n`;
        }
      }
    }
  } catch {}
}
// Prepend token blocks to matched output
return tokenBlocks + matched;
```

---

## Gap 5: No Base64 Asset Inlining

**Current behavior:**
`redactAssetsForAI()` replaces `src` attributes with `[IMAGE]` in clean HTML. But the full-fidelity HTML still references `chrome-extension://` or `https://` URLs that are inaccessible outside the sandbox — live previews in the Showcase lab render broken.

**What SingleFile does:**
Fetches all external URLs via an offscreen document and encodes them as `data:` URIs via `FileReader.readAsDataURL()`.

**Proposed fix — opt-in Node-side inlining in `sniper_handler.cjs`:**

```javascript
const https = require('https');
const http = require('http');

async function fetchAsBase64(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const mime = res.headers['content-type'] || 'application/octet-stream';
        resolve(`data:${mime};base64,${buf.toString('base64')}`);
      });
    }).on('error', () => resolve(null));
  });
}

async function inlineAssetsInHtml(html) {
  const urlPattern = /src=["'](https?:\/\/[^"']+)["']/g;
  const matches = [...html.matchAll(urlPattern)];
  for (const match of matches) {
    const b64 = await fetchAsBase64(match[1]).catch(() => null);
    if (b64) html = html.replace(match[0], `src="${b64}"`);
  }
  return html;
}
```

Gate it with an env flag so it does not slow down every crop:

```javascript
// In captureElementScreenshot, before writeFileSync:
const htmlToWrite = process.env.CEN_INLINE_ASSETS === 'true'
  ? await inlineAssetsInHtml(html)
  : html;
fs.writeFileSync(htmlFilepath, htmlToWrite, 'utf8');
```

---

## Gap 6: Cross-Frame Sniper Uses e.target, Not composedPath

**Current behavior:**
`onMouseOver` and `onClick` read `e.target`. For elements inside Shadow DOM, `e.target` stops at the shadow boundary host element — the actual inner element is never selected.

**What SingleFile's TDD proposes:**
Use `event.composedPath()[0]` — this returns the real deepest element across all shadow boundaries.

**Fix in `sniper_injected.js` — update `onMouseOver`:**

```javascript
function onMouseOver(e) {
  if (!snipMode) return;
  e.stopPropagation();
  if (hoverEl) hoverEl.classList.remove('cen-snip-hover');

  const path = e.composedPath();
  hoverEl = (path && path.length > 0) ? path[0] : e.target;

  if (hoverEl && hoverEl !== document.body && hoverEl !== document.documentElement && hoverEl !== tooltip) {
    hoverEl.classList.add('cen-snip-hover');
    updateTooltip(hoverEl, e);
  } else {
    hoverEl = null;
    hideTooltip();
  }
}
```

**Update `onClick` as well:**

```javascript
async function onClick(e) {
  if (!snipMode) return;
  e.preventDefault();
  e.stopPropagation();

  const path = e.composedPath();
  const target = (path && path.length > 0) ? path[0] : (hoverEl || e.target);
  // ... rest unchanged
}
```

---

## Gap 7: No Keep-Alive During Long Extraction Jobs

**Current behavior:**
For heavy components (many nodes, large inline SVGs), extraction can take 2–5 seconds. No heartbeat exists to confirm progress in the HUD.

**Proposed addition in `sniper_injected.js` onClick handler:**

```javascript
const keepAlive = setInterval(() => {
  console.log('[CEN Sniper] Extraction in progress...');
}, 5000);

try {
  const cropSlug = await window._captureElementScreenshot(styles, styledHtml, cleanStyledHtml);
  clearInterval(keepAlive);
  showNotesHUD(cropSlug, tagName);
} catch (err) {
  clearInterval(keepAlive);
  showToast(`Error: ${err.message}`, true);
}
```

---

## Gap 8: HTML Output Is a Fragment, Not a Standalone Document

**Current behavior:**
`htmlFilepath` stores `<style>...<style>\n<div...>`. Opening this file in a browser causes rendering issues — no charset, no viewport meta, no body container.

**Proposed fix in `sniper_handler.cjs`:**

```javascript
function buildStandaloneHTML(html, sourceUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CEN Component Crop</title>
  <meta name="source-url" content="${sourceUrl || ''}">
  <style>
    body { margin: 0; padding: 20px; background: #0a0a0f; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}
```

Call before writing:

```javascript
fs.writeFileSync(htmlFilepath, buildStandaloneHTML(html, ''), 'utf8');
```

---

## Implementation Sequence

```
Week 1  (high impact, low effort):
  [ ] Gap 6  -- composedPath hover fix         (sniper_injected.js, ~30 min)
  [ ] Gap 8  -- Standalone HTML wrapper        (sniper_handler.cjs, ~20 min)
  [ ] Gap 2  -- adoptedStyleSheets intercept   (server.cjs + sniper_injected.js, ~1 hr)

Week 2  (high impact, medium effort):
  [ ] Gap 1  -- Closed shadow DOM registry     (server.cjs + sniper_injected.js, ~2 hrs)
  [ ] Gap 3  -- extractRulesetCSS()            (sniper_injected.js, ~2 hrs)
  [ ] Gap 4  -- :root token block capture      (extends Gap 3, ~30 min)

Week 3  (optional polish):
  [ ] Gap 5  -- Base64 asset inlining          (sniper_handler.cjs, behind env flag)
  [ ] Gap 7  -- Keep-alive heartbeat log       (~15 min)
```

---

## Files to Modify

| File | Changes |
| :--- | :--- |
| `server/sniper/sniper_injected.js` | composedPath hover, extractRulesetCSS(), adoptedStyleSheets read, getShadowRoot() closed fallback |
| `server/sniper/sniper_handler.cjs` | buildStandaloneHTML(), inlineAssetsInHtml() opt-in, standalone wrap before write |
| `server/server.cjs` | page.addInitScript() — attachShadow patch + adoptedStyleSheets intercept |

---

_Derived from analysis of SingleFile `component_capture_tdd.md` cross-referenced with CEN Explorer v2 sniper source._
