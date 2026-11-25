(function() {
  if (window._cenSniperInitialized) {
    return;
  }
  window._cenSniperInitialized = true;

  let snipMode = false;
  let hoverEl = null;
  let tooltip = null;

  // MARK: - Init Styles and Tooltips
  function init() {
    if (window._cenSniperReady) return;
    window._cenSniperReady = true;

    // Add highlight styles to target document
    if (!document.getElementById('cen-sniper-styles')) {
      const style = document.createElement('style');
      style.id = 'cen-sniper-styles';
      style.textContent = `
        .cen-snip-hover {
          outline: 2px solid #10b981 !important;
          outline-offset: -2px !important;
          cursor: crosshair !important;
        }
        #cen-sniper-tooltip {
          position: fixed;
          z-index: 99999999;
          background: rgba(16, 185, 129, 0.95);
          color: white;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: opacity 0.1s ease;
          font-weight: bold;
          border: 1px solid rgba(255,255,255,0.25);
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function createTooltip() {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'cen-sniper-tooltip';
      tooltip.style.opacity = '0';
      document.body.appendChild(tooltip);
    }
  }

  function updateTooltip(el, e) {
    createTooltip();
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const classes = el.className && typeof el.className === 'string'
      ? '.' + Array.from(el.classList).filter(c => c !== 'cen-snip-hover').join('.')
      : '';
    
    const displayTag = `${tag}${classes}`.slice(0, 45) + (`${tag}${classes}`.length > 45 ? '...' : '');
    tooltip.textContent = `${displayTag} (${Math.round(rect.width)}x${Math.round(rect.height)}px)`;
    
    let x = e.clientX + 12;
    let y = e.clientY + 15;
    
    if (x + tooltip.offsetWidth > window.innerWidth) {
      x = window.innerWidth - tooltip.offsetWidth - 10;
    }
    if (y + tooltip.offsetHeight > window.innerHeight) {
      y = e.clientY - tooltip.offsetHeight - 10;
    }
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.style.opacity = '1';
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.style.opacity = '0';
    }
  }

  // MARK: - Hover and Highlight Events
  function onMouseOver(e) {
    if (!snipMode) return;
    e.stopPropagation();
    if (hoverEl) {
      hoverEl.classList.remove('cen-snip-hover');
    }
    // Gap 6: composedPath() pierces shadow DOM — e.target stops at the shadow host boundary
    const path = e.composedPath ? e.composedPath() : [];
    hoverEl = (path.length > 0) ? path[0] : e.target;
    if (hoverEl && hoverEl !== document.body && hoverEl !== document.documentElement && hoverEl !== tooltip) {
      hoverEl.classList.add('cen-snip-hover');
      updateTooltip(hoverEl, e);
    } else {
      hoverEl = null;
      hideTooltip();
    }
  }

  function onMouseMove(e) {
    if (!snipMode || !hoverEl) return;
    updateTooltip(hoverEl, e);
  }

  function onMouseOut(e) {
    if (!snipMode) return;
    if (hoverEl === e.target) {
      if (hoverEl) {
        hoverEl.classList.remove('cen-snip-hover');
      }
      hoverEl = null;
      hideTooltip();
    }
  }

  // MARK: - Element Selector Click Handler
  async function onClick(e) {
    if (!snipMode) return;
    e.preventDefault();
    e.stopPropagation();

    // Gap 6: composedPath() pierces shadow DOM — use deepest real target
    const composedPath = e.composedPath ? e.composedPath() : [];
    const target = (composedPath.length > 0) ? composedPath[0] : (hoverEl || e.target);
    if (!target || target === document.body || target === document.documentElement) return;

    target.classList.remove('cen-snip-hover');
    target.classList.add('cen-snip-target');
    hideTooltip();
    
    toggleSnipMode(false);

    // Get style parameters for inspirations DB
    const styles = getParentStyles(target);

    // Execute High-Fidelity Extraction
    const extraction = extractHighFidelityComponent(target);
    const styledHtml = `<style>\n${extraction.css}</style>\n${extraction.html}`;
    const cleanStyledHtml = `<style>\n${extraction.cleanCss}</style>\n${extraction.cleanHtml}`;

    const tagName = target.tagName.toLowerCase();

    // Gap 7: Keep-alive heartbeat — log during async Playwright roundtrip
    const keepAlive = setInterval(() => {
      console.log('[CEN Sniper] Capture in progress...');
    }, 5000);

    // 1. Capture the element screenshot IMMEDIATELY on click to lock visual state
    try {
      if (window._captureElementScreenshot) {
        const cropSlug = await window._captureElementScreenshot(styles, styledHtml, cleanStyledHtml);
        clearInterval(keepAlive);
        // 2. Display the Notes HUD overlay card
        showNotesHUD(cropSlug, tagName);
      } else {
        clearInterval(keepAlive);
        showToast('Error: Element screenshot binding not found', true);
      }
    } catch (err) {
      clearInterval(keepAlive);
      console.error(err);
      showToast(`Error: ${err.message}`, true);
    }
  }

  // MARK: - Notes HUD Overlay
  //#region Notes HUD Overlay
  function showNotesHUD(cropSlug, tagName) {
    const oldHud = document.getElementById('cen-sniper-notes-hud');
    if (oldHud) oldHud.remove();

    const hud = document.createElement('div');
    hud.id = 'cen-sniper-notes-hud';
    hud.className = 'cen-sniper-toast';
    hud.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999999;
      width: 320px;
      background: rgba(18, 18, 24, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 14px;
      padding: 14px;
      color: #e4e4e7;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      animation: cenHudSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      box-sizing: border-box;
    `;

    if (!document.getElementById('cen-sniper-hud-styles')) {
      const animStyle = document.createElement('style');
      animStyle.id = 'cen-sniper-hud-styles';
      animStyle.textContent = `
        @keyframes cenHudSlideIn {
          from { opacity: 0; transform: translateY(24px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cenHudSlideOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(24px) scale(0.95); }
        }
      `;
      document.head.appendChild(animStyle);
    }

    hud.innerHTML = `
      <div style="font-size: 13px; font-weight: 700; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; select-none: none;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>🎯</span> Captured: ${cropSlug}
        </div>
        <button id="cen-notes-close-btn" style="background: none; border: none; color: #71717a; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px; transition: color 0.2s;" onmouseover="this.style.color='#f4f4f5'" onmouseout="this.style.color='#71717a'">&times;</button>
      </div>
      <textarea 
        id="cen-notes-textarea" 
        placeholder="Add context / design guidelines... (Press Enter to save)" 
        style="
          width: 100%;
          height: 70px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 8px;
          color: #f4f4f5;
          font-size: 12px;
          font-family: inherit;
          resize: none;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.2s;
        "
      ></textarea>
      <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; select-none: none;">
        <span id="cen-timer-status" style="font-size: 10px; color: #71717a; transition: color 0.2s;">Auto-saving in 10s...</span>
        <button 
          id="cen-notes-save-btn" 
          style="
            background: #10b981;
            color: #fff;
            border: none;
            padding: 6px 12px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
          "
        >
          Save
        </button>
      </div>
      <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 2px; background: rgba(255, 255, 255, 0.1); border-bottom-left-radius: 14px; border-bottom-right-radius: 14px; overflow: hidden;">
        <div id="cen-notes-progress-bar" style="width: 100%; height: 100%; background: #10b981; transition: width 0.1s linear;"></div>
      </div>
    `;

    document.body.appendChild(hud);

    const textarea = document.getElementById('cen-notes-textarea');
    const saveBtn = document.getElementById('cen-notes-save-btn');
    const closeBtn = document.getElementById('cen-notes-close-btn');
    const progressBar = document.getElementById('cen-notes-progress-bar');
    const timerStatus = document.getElementById('cen-timer-status');

    textarea.focus();

    let durationLeft = 100;
    let isPaused = false;
    
    const timer = setInterval(() => {
      if (isPaused) return;
      durationLeft -= 1;
      progressBar.style.width = durationLeft + '%';
      
      if (durationLeft <= 0) {
        clearInterval(timer);
        submitNotes();
      }
    }, 100);

    textarea.addEventListener('input', () => {
      if (textarea.value.trim().length > 0) {
        isPaused = true;
        clearInterval(timer);
        progressBar.style.width = '0%';
        timerStatus.textContent = 'Manual save required';
        timerStatus.style.color = '#10b981';
      }
    });

    textarea.addEventListener('focus', () => {
      isPaused = true;
      progressBar.style.background = '#71717a';
    });

    async function submitNotes() {
      clearInterval(timer);
      const text = textarea.value.trim();
      
      hud.style.animation = 'cenHudSlideOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        hud.remove();
      }, 250);

      if (window._saveComponentNotes) {
        try {
          await window._saveComponentNotes(cropSlug, text);
          showToast(`🎯 Notes saved for ${cropSlug}`);
        } catch (err) {
          console.error(err);
          showToast(`✕ Error saving notes: ${err.message}`, true);
        }
      }
    }

    saveBtn.addEventListener('click', submitNotes);
    closeBtn.addEventListener('click', submitNotes);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitNotes();
      }
    });
  }
  //#endregion

  // MARK: - DOM Helper Functions
  function getParentStyles(el) {
    const s = window.getComputedStyle(el);
    return {
      backgroundColor: s.backgroundColor,
      color: s.color,
      borderRadius: s.borderRadius,
      padding: s.padding,
      margin: s.margin,
      boxShadow: s.boxShadow,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      border: s.border,
      display: s.display,
      width: s.width,
      height: s.height
    };
  }

  // Gap 1: Helper to access shadow root including closed-mode roots from registry
  function getShadowRoot(node) {
    // Open shadow root is directly accessible
    if (node.shadowRoot) return node.shadowRoot;
    // Closed shadow root: fall back to the registry populated by page.addInitScript() MAIN hook
    if (window.__cenShadowRoots) return window.__cenShadowRoots.get(node) || null;
    return null;
  }

  // 1. Recursive cloner to replicate nested Shadow DOM trees (including closed roots)
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

  // 2. Traverses and tags both trees with custom identifier attributes
  function traverseAndMap(original, clone, mappings, uniqueAttr, nodeCounter) {
    if (original.nodeType === 1) {
      const id = `node_${nodeCounter.val++}`;
      original.setAttribute(uniqueAttr, id);
      clone.setAttribute(uniqueAttr, id);
      mappings.push({ original, clone, id });
    }
    
    if (original.shadowRoot && clone.shadowRoot) {
      for (let i = 0; i < original.shadowRoot.childNodes.length; i++) {
        traverseAndMap(original.shadowRoot.childNodes[i], clone.shadowRoot.childNodes[i], mappings, uniqueAttr, nodeCounter);
      }
    }
    
    for (let i = 0; i < original.childNodes.length; i++) {
      traverseAndMap(original.childNodes[i], clone.childNodes[i], mappings, uniqueAttr, nodeCounter);
    }
  }

  // 3. Redact large SVGs, base64 images, and vectors to optimize LLM tokens
  function redactAssetsForAI(root) {
    const traverse = (node) => {
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        
        if (tag === 'img' || tag === 'source') {
          if (node.hasAttribute('src')) {
            node.setAttribute('src', '[IMAGE]');
          }
          if (node.hasAttribute('srcset')) {
            node.setAttribute('srcset', '[IMAGE_SET]');
          }
        }
        
        if (tag === 'svg') {
          node.innerHTML = '<!-- SVG PATHS REMOVED FOR TOKEN EFFICIENCY -->';
        }
        
        if (node.shadowRoot) {
          for (let child of node.shadowRoot.childNodes) {
            traverse(child);
          }
        }
      }
      
      for (let child of node.childNodes) {
        traverse(child);
      }
    };
    traverse(root);
  }

  function cleanBase64InCss(css) {
    return css.replace(/url\(['"]?data:[^'"\)]+['"]?\)/g, 'url("[IMAGE_REDACTED]")');
  }

  // MARK: - High-Fidelity Extraction Core
  //#region Extraction Core
  // 4. Main high-fidelity extraction function
  function extractHighFidelityComponent(targetElement) {
    const uniqueAttr = 'data-cen-id';
    const nodeCounter = { val: 0 };
    
    const trackedProperties = [
      'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
      'flexDirection', 'justifyContent', 'alignItems', 'flexWrap', 'flexGrow', 'flexShrink',
      'gridTemplateColumns', 'gridTemplateRows', 'gap', 'rowGap', 'columnGap',
      'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'boxSizing', 'backgroundColor', 'backgroundImage', 'backgroundSize',
      'backgroundPosition', 'backgroundRepeat', 'color', 'opacity',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'textAlign', 'textTransform', 'textDecoration', 'whiteSpace',
      'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
      'borderRadius', 'boxShadow', 'outline', 'transform', 'overflow'
    ];

    const defaultStylesCache = {};
    function getDefaultStyle(tagName) {
      const tag = tagName.toLowerCase();
      if (defaultStylesCache[tag]) return defaultStylesCache[tag];
      try {
        const tempEl = document.createElement(tag);
        document.body.appendChild(tempEl);
        const computed = window.getComputedStyle(tempEl);
        const styles = {};
        for (const prop of trackedProperties) {
          styles[prop] = computed[prop];
        }
        document.body.removeChild(tempEl);
        defaultStylesCache[tag] = styles;
        return styles;
      } catch (e) {
        return {};
      }
    }

    const clonedRoot = cloneNodeWithShadows(targetElement);
    const cleanRoot = cloneNodeWithShadows(targetElement);

    const mappings = [];
    traverseAndMap(targetElement, clonedRoot, mappings, uniqueAttr, nodeCounter);

    let cssContent = '';

    for (const item of mappings) {
      const { original, id } = item;
      if (original.nodeType !== 1) continue;
      
      const tagName = original.tagName.toLowerCase();
      const computed = window.getComputedStyle(original);
      const defaults = getDefaultStyle(tagName);
      
      let styleRules = '';
      for (const prop of trackedProperties) {
        const val = computed[prop];
        if (val && val !== defaults[prop]) {
          const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
          styleRules += `  ${kebabProp}: ${val};\n`;
        }
      }

      if (styleRules) {
        cssContent += `[${uniqueAttr}="${id}"] {\n${styleRules}}\n\n`;
      }

      const beforeComputed = window.getComputedStyle(original, '::before');
      const beforeContent = beforeComputed ? beforeComputed.content : null;
      if (beforeComputed && beforeContent && 
          beforeContent !== 'none' && 
          beforeContent !== 'normal' && 
          beforeContent !== '""' && 
          beforeContent !== '"none"' && 
          beforeContent !== '"normal"') {
        let beforeRules = '';
        for (const prop of trackedProperties) {
          const val = beforeComputed[prop];
          if (val && val !== '') {
            const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            beforeRules += `  ${kebabProp}: ${val};\n`;
          }
        }
        if (beforeRules) {
          cssContent += `[${uniqueAttr}="${id}"]::before {\n  content: ${beforeContent};\n${beforeRules}}\n\n`;
        }
      }

      const afterComputed = window.getComputedStyle(original, '::after');
      const afterContent = afterComputed ? afterComputed.content : null;
      if (afterComputed && afterContent && 
          afterContent !== 'none' && 
          afterContent !== 'normal' && 
          afterContent !== '""' && 
          afterContent !== '"none"' && 
          afterContent !== '"normal"') {
        let afterRules = '';
        for (const prop of trackedProperties) {
          const val = afterComputed[prop];
          if (val && val !== '') {
            const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            afterRules += `  ${kebabProp}: ${val};\n`;
          }
        }
        if (afterRules) {
          cssContent += `[${uniqueAttr}="${id}"]::after {\n  content: ${afterContent};\n${afterRules}}\n\n`;
        }
      }
    }

    for (const item of mappings) {
      if (item.original.nodeType === 1) {
        item.original.removeAttribute(uniqueAttr);
      }
    }

    // Label cleanRoot nodes matching computed CSS structures
    const cleanCounter = { val: 0 };
    function labelNode(node) {
      if (node.nodeType === 1) {
        node.setAttribute(uniqueAttr, `node_${cleanCounter.val++}`);
        const shadowRoot = getShadowRoot(node);
        if (shadowRoot) {
          for (let child of shadowRoot.childNodes) {
            labelNode(child);
          }
        }
      }
      for (let child of node.childNodes) {
        labelNode(child);
      }
    }
    labelNode(cleanRoot);

    redactAssetsForAI(cleanRoot);
    const cleanCssContent = cleanBase64InCss(cssContent);
  //#endregion

  // MARK: - Ruleset CSS Parser (pseudoclasses, @media, @keyframes)
  //#region Ruleset Parser
  // Gap 3+4: Extract rule-set CSS (hover states, @media, @keyframes, :root tokens)
    const rulesetCSS = extractRulesetCSS(targetElement);

    // Gap 2: Append adoptedStyleSheets captured by MAIN world hook
    const adopted = (window.__cenAdoptedStylesheets || []).join('\n');
    const adoptedBlock = adopted ? `/* adoptedStyleSheets */\n${adopted}\n\n` : '';

    const fullCss = `${adoptedBlock}/* Ruleset CSS (hover, @media, @keyframes, :root tokens) */\n${rulesetCSS}\n\n/* Computed Diff CSS */\n${cssContent}`;
    const fullCleanCss = `${adoptedBlock}/* Ruleset CSS */\n${cleanBase64InCss(rulesetCSS)}\n\n/* Computed Diff CSS */\n${cleanCssContent}`;

    return {
      html: clonedRoot.outerHTML,
      css: fullCss,
      cleanHtml: cleanRoot.outerHTML,
      cleanCss: fullCleanCss
    };
  }

  // Gap 3+4: Rule-set CSS extractor — walks document.styleSheets to find matching rules
  // including pseudo-classes, @media, @keyframes, and :root/:host token blocks
  function extractRulesetCSS(element) {
    const elements = [element, ...element.querySelectorAll('*')];
    let tokenBlocks = '';
    let matched = '';
    const usedAnimations = new Set();

    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = Array.from(sheet.cssRules || []);
      } catch (e) {
        // Cross-origin stylesheet — skip
        continue;
      }

      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          // Gap 4: Always extract :root and :host token blocks verbatim
          if (rule.selectorText === ':root' || rule.selectorText === ':host') {
            tokenBlocks += `/* CSS Variable Tokens */\n${rule.cssText}\n\n`;
            continue;
          }

          // Check if this rule matches our component or any of its descendants
          const hits = elements.some(el => {
            try { return el.matches(rule.selectorText); } catch { return false; }
          });

          if (hits) {
            matched += rule.cssText + '\n';
            // Track animation names for keyframe extraction
            const anim = rule.style.animationName;
            if (anim && anim !== 'none' && anim !== '') {
              usedAnimations.add(anim);
            }
          }
        } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
          let subMatched = '';
          try {
            for (const sub of Array.from(rule.cssRules || [])) {
              if (sub instanceof CSSStyleRule) {
                const hits = elements.some(el => {
                  try { return el.matches(sub.selectorText); } catch { return false; }
                });
                if (hits) subMatched += sub.cssText + '\n';
              }
            }
          } catch (e) { /* ignore */ }
          if (subMatched) {
            const cond = rule.conditionText ||
              (rule.media && rule.media.mediaText) || '';
            matched += `@media ${cond} {\n${subMatched}}\n`;
          }
        } else if (rule instanceof CSSKeyframesRule) {
          // Only include keyframes referenced by matched rules
          if (usedAnimations.has(rule.name)) {
            matched += rule.cssText + '\n';
          }
        } else if (rule instanceof CSSFontFaceRule) {
          // Always include @font-face (filter by font-family later if needed)
          matched += rule.cssText + '\n';
        }
      }
    }

    return tokenBlocks + matched;
  }
  //#endregion

  // MARK: - Snip Mode Toggle and Hotkeys
  function showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.className = 'cen-sniper-toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 99999999;
      background: rgba(16, 16, 20, 0.95);
      color: ${isError ? '#f87171' : '#10b981'};
      padding: 14px 22px; border-radius: 12px; font-size: 13px;
      font-family: system-ui, sans-serif; font-weight: 600;
      border: 1px solid ${isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'};
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      animation: toastIn 0.3s ease-out;
    `;
    const style = document.createElement('style');
    style.textContent = '@keyframes toastIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }';
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); style.remove(); }, 3500);
  }

  function toggleSnipMode(force) {
    snipMode = force !== undefined ? force : !snipMode;
    if (snipMode) {
      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('mouseout', onMouseOut, true);
      document.addEventListener('click', onClick, true);
      showToast('🎯 Component Snip Mode Active! Click an element to capture.');
    } else {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseout', onMouseOut, true);
      document.removeEventListener('click', onClick, true);
      if (hoverEl) {
        hoverEl.classList.remove('cen-snip-hover');
        hoverEl = null;
      }
      hideTooltip();
    }
  }

  function registerKeyboardListener() {
    window.addEventListener('keydown', (e) => {
      const isE = e.key === 'e' || e.key === 'E' || e.keyCode === 69;
      if (e.altKey && e.shiftKey && isE) {
        console.log("[🎯 Component Sniper] Trigger keyboard shortcut Alt+Shift+E detected!");
        e.preventDefault();
        e.stopPropagation();
        toggleSnipMode();
      }
    }, true);
    window._toggleCenSnipMode = toggleSnipMode;
    window._cenExtractHighFidelityComponent = extractHighFidelityComponent;
  }

  const originalInit = init;
  init = function() {
    originalInit();
    registerKeyboardListener();
    console.log("[🎯 Component Sniper] Script fully initialized on page:", window.location.href);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
