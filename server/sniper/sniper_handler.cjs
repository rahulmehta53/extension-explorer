// MARK: - Modules & Configuration
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SANDBOX_DATA_DIR = path.resolve(path.join(__dirname, '..', '..', 'sandbox_data'));
const COMPONENTS_DIR = path.resolve(path.join(SANDBOX_DATA_DIR, 'components'));
const INSPIRATIONS_DB_PATH = path.resolve(path.join(SANDBOX_DATA_DIR, 'inspirations.json'));

// Ensure folder structure exists
if (!fs.existsSync(COMPONENTS_DIR)) {
  fs.mkdirSync(COMPONENTS_DIR, { recursive: true });
}

// MARK: - Standalone Wrapper Builder
// Gap 8: Wrap HTML fragments in a proper standalone document so crops are directly openable
function buildStandaloneHTML(html, sourceUrl) {
  const safeUrl = (sourceUrl || '').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CEN Component Crop</title>
  <meta name="source-url" content="${safeUrl}">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #0a0a0f; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

// MARK: - Asset Inliner Helpers
// Gap 5: Optional Node-side Base64 asset inlining (enable via CEN_INLINE_ASSETS=true)
async function fetchAsBase64(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const mime = res.headers['content-type'] || 'application/octet-stream';
          resolve(`data:${mime};base64,${buf.toString('base64')}`);
        });
      }).on('error', () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

async function inlineAssetsInHtml(html) {
  // Replace external http/https src URLs with base64 data URIs
  const urlPattern = /src=["'](https?:\/\/[^"']+)["']/g;
  const matches = [...html.matchAll(urlPattern)];
  for (const match of matches) {
    const b64 = await fetchAsBase64(match[1]).catch(() => null);
    if (b64) html = html.replace(match[0], `src="${b64}"`);
  }
  return html;
}

// MARK: - Database Persistence
// Read database
function getInspirations() {
  if (!fs.existsSync(INSPIRATIONS_DB_PATH)) {
    fs.writeFileSync(INSPIRATIONS_DB_PATH, JSON.stringify([], null, 2), 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(INSPIRATIONS_DB_PATH, 'utf8'));
  } catch (err) {
    console.error('[-] Error reading inspirations.json:', err.message);
    return [];
  }
}

// Write to database
function saveInspirations(data) {
  try {
    fs.writeFileSync(INSPIRATIONS_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[-] Error writing to inspirations.json:', err.message);
  }
}

// MARK: - Consolidated Notes Diary Builder
// Rebuild consolidated markdown diary for an extension
function rebuildExtensionNotesMD(extFolder, extName, extId) {
  const db = getInspirations();
  const extDirPath = path.join(COMPONENTS_DIR, extFolder);
  if (!fs.existsSync(extDirPath)) {
    fs.mkdirSync(extDirPath, { recursive: true });
  }

  const notesFilepath = path.join(extDirPath, 'notes.md');

  // Filter crops belonging to this extension ID
  const matched = db.filter(item => item.extensionId === extId);

  // Sort them ascending (chronologically) so they append in order of capture
  matched.sort((a, b) => {
    return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  let markdownContent = `# Audit Notes: ${extName}\n\n`;
  markdownContent += `This file records design and architecture notes for captured component crops.\n\n`;

  if (matched.length === 0) {
    markdownContent += `*No crops captured yet.*\n`;
  } else {
    matched.forEach(item => {
      markdownContent += `---\n\n`;
      markdownContent += `## ${item.id}\n`;
      markdownContent += `* **Element Tag**: \`${item.tagName}\`\n`;
      markdownContent += `* **Date**: \`${item.timestamp}\`\n\n`;
      markdownContent += `### Notes / Context\n`;
      markdownContent += `${item.notes || 'No description provided.'}\n\n`;
    });
  }

  try {
    fs.writeFileSync(notesFilepath, markdownContent, 'utf8');
    console.log(`[🎯 Component Notes Rebuilt] Updated unified notes.md: ${notesFilepath}`);
  } catch (e) {
    console.error(`[-] Failed to write unified notes.md for ${extFolder}:`, e.message);
  }
}

// Helper to determine the next sequential index for an extension (e.g. crop_1_style)
function getNextCropIndex(db, extId) {
  let maxIdx = 0;
  db.forEach(item => {
    if (item.extensionId === extId) {
      const match = item.id.match(/^crop_([0-9]+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxIdx) maxIdx = num;
      }
    }
  });
  return maxIdx + 1;
}

// MARK: - Path Directory Migrations (Self-Healing)
// Self-healing migration utility to reorganize folders and JSON database links chronologically
function migrateComponentDirectories() {
  const db = getInspirations();
  let mutated = false;

  // Sort database items ascending by date/time (timestamp) so we migrate oldest to newest
  const sortedItems = [...db].sort((a, b) => {
    const tA = a.timestamp || '2026-07-12';
    const tB = b.timestamp || '2026-07-12';
    return tA.localeCompare(tB);
  });

  // Track next index sequentially per extension during migration
  const indexCounters = {};

  sortedItems.forEach(item => {
    const isLegacyId = item.id.startsWith('insp_');
    const isLegacyPath = item.screenshot && (item.screenshot.startsWith('/api/component-file/') && !item.screenshot.includes('/crop_'));
    
    if (isLegacyId || isLegacyPath) {
      const extId = item.extensionId;
      const extName = item.extensionName || 'Custom';
      const tagName = (item.tagName || 'element').toLowerCase();

      if (!indexCounters[extId]) {
        indexCounters[extId] = 1;
      }

      const cropIndex = indexCounters[extId]++;
      const cropSlug = `crop_${cropIndex}_${tagName}`;
      const oldId = item.id;
      
      // Update Item ID
      item.id = cropSlug;

      // Create target directories
      const safeName = extName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
      const extFolder = `${safeName}_${extId}`;
      const extDirPath = path.join(COMPONENTS_DIR, extFolder);
      const cropDirPath = path.join(extDirPath, cropSlug);

      if (!fs.existsSync(cropDirPath)) {
        fs.mkdirSync(cropDirPath, { recursive: true });
      }

      // Locate and move PNG crop
      const oldPngName = oldId.startsWith('insp_') 
        ? `${safeName}_${tagName}_${oldId.replace('insp_', '')}.png`
        : path.basename(item.screenshot || '');
      
      const pngCandidates = [
        path.join(COMPONENTS_DIR, oldPngName),
        path.join(COMPONENTS_DIR, 'png', oldPngName),
        path.join(COMPONENTS_DIR, path.basename(item.screenshot || ''))
      ];

      for (const p of pngCandidates) {
        if (fs.existsSync(p)) {
          fs.renameSync(p, path.join(cropDirPath, `${cropSlug}.png`));
          break;
        }
      }

      // Locate and move HTML file
      const oldHtmlName = oldId.startsWith('insp_')
        ? `${safeName}_${tagName}_${oldId.replace('insp_', '')}.html`
        : path.basename(item.htmlFile || '');

      const htmlCandidates = [
        path.join(COMPONENTS_DIR, 'html', oldHtmlName),
        path.join(COMPONENTS_DIR, oldHtmlName),
        path.join(COMPONENTS_DIR, 'html', path.basename(item.htmlFile || ''))
      ];

      for (const p of htmlCandidates) {
        if (fs.existsSync(p)) {
          fs.renameSync(p, path.join(cropDirPath, `${cropSlug}.html`));
          break;
        }
      }

      // Locate and move Clean HTML file
      if (item.cleanHtmlFile) {
        const oldCleanName = oldId.startsWith('insp_')
          ? `${safeName}_${tagName}_${oldId.replace('insp_', '')}.clean.html`
          : path.basename(item.cleanHtmlFile || '');

        const cleanCandidates = [
          path.join(COMPONENTS_DIR, 'clean', oldCleanName),
          path.join(COMPONENTS_DIR, 'html', oldCleanName),
          path.join(COMPONENTS_DIR, 'clean', path.basename(item.cleanHtmlFile || ''))
        ];

        for (const p of cleanCandidates) {
          if (fs.existsSync(p)) {
            fs.renameSync(p, path.join(cropDirPath, `${cropSlug}.clean.html`));
            break;
          }
        }
      }

      // Update Database Entry Fields
      item.screenshot = `/api/component-asset/${extFolder}/${cropSlug}/${cropSlug}.png`;
      item.htmlFile = `/api/component-asset/${extFolder}/${cropSlug}/${cropSlug}.html`;
      if (item.cleanHtmlFile) {
        item.cleanHtmlFile = `/api/component-asset/${extFolder}/${cropSlug}/${cropSlug}.clean.html`;
      }
      
      mutated = true;
    }
  });

  // Always scrub any lingering subfolder notes.md files and build unified diary
  const uniqueExtensions = new Set();
  db.forEach(item => {
    uniqueExtensions.add(JSON.stringify({
      id: item.extensionId,
      name: item.extensionName
    }));
    
    // Scan and clean crop subfolders
    const safeName = item.extensionName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    const extFolder = `${safeName}_${item.extensionId}`;
    const cropDirPath = path.join(COMPONENTS_DIR, extFolder, item.id);
    const cropNotesFile = path.join(cropDirPath, 'notes.md');
    
    if (fs.existsSync(cropNotesFile)) {
      try {
        fs.unlinkSync(cropNotesFile);
        console.log(`[🗑️ Crop notes.md Deleted] Removed subfolder notes: ${cropNotesFile}`);
      } catch (e) {}
    }
  });

  // Rebuild extension-level unified diaries
  uniqueExtensions.forEach(jsonStr => {
    const { id, name } = JSON.parse(jsonStr);
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    const extFolder = `${safeName}_${id}`;
    rebuildExtensionNotesMD(extFolder, name, id);
  });

  if (mutated) {
    saveInspirations(db);
    console.log('[📦 Migration] Successfully upgraded inspirations.json database to structured layouts.');
  }

  // Remove empty legacy directories
  ['png', 'html', 'clean'].forEach(dir => {
    const legacyPath = path.join(COMPONENTS_DIR, dir);
    if (fs.existsSync(legacyPath)) {
      try {
        const files = fs.readdirSync(legacyPath);
        if (files.length === 0) {
          fs.rmdirSync(legacyPath);
          console.log(`[🗑️ Legacy Clean] Removed empty folder: components/${dir}`);
        }
      } catch (err) {}
    }
  });
}

// Run Migration sequence
migrateComponentDirectories();

// MARK: - Element Screenshot Capture Pipeline
// Perform cropped element screenshot and store details
async function captureElementScreenshot(page, extName, extId, styles, html, cleanHtml, notes) {
  const safeName = extName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const extFolder = `${safeName}_${extId}`;
  
  // Create extension parent directory
  const extDirPath = path.join(COMPONENTS_DIR, extFolder);
  if (!fs.existsSync(extDirPath)) {
    fs.mkdirSync(extDirPath, { recursive: true });
  }

  // Calculate next sequential index
  const db = getInspirations();
  const cropIndex = getNextCropIndex(db, extId);

  // Try to parse tag name
  let tagName = 'element';
  const tagMatch = html.match(/^<([a-z0-9]+)/i);
  if (tagMatch) {
    tagName = tagMatch[1].toLowerCase();
  }

  const cropSlug = `crop_${cropIndex}_${tagName}`;
  
  // Create crop subdirectory
  const cropDirPath = path.join(extDirPath, cropSlug);
  if (!fs.existsSync(cropDirPath)) {
    fs.mkdirSync(cropDirPath, { recursive: true });
  }

  const filepath = path.join(cropDirPath, `${cropSlug}.png`);
  const htmlFilepath = path.join(cropDirPath, `${cropSlug}.html`);
  const cleanHtmlFilepath = path.join(cropDirPath, `${cropSlug}.clean.html`);

  try {
    // 1. Locate the correct frame that contains the target element (supporting iframes & shadow DOMs)
    let targetFrame = page.mainFrame();
    let foundInFrame = false;

    for (const frame of page.frames()) {
      try {
        const count = await frame.locator('.cen-snip-target').count();
        if (count > 0) {
          targetFrame = frame;
          foundInFrame = true;
          break;
        }
      } catch (e) {
        // Ignore frame lookup errors
      }
    }

    // 2. Capture screenshot of the element in that frame
    const locator = targetFrame.locator('.cen-snip-target');

    // Hide all sniper-related UI elements (toasts, tooltips, notes card) to keep screenshot clean
    await targetFrame.evaluate(() => {
      const els = document.querySelectorAll('#cen-sniper-tooltip, #cen-sniper-notes-hud, .cen-sniper-toast, #cen-sniper-toast');
      els.forEach(el => el.style.setProperty('display', 'none', 'important'));
    }).catch(() => {});

    await locator.screenshot({ path: filepath, timeout: 5000 });
    console.log(`[🎯 Component Snipped] Saved component image: ${filepath}`);

    // 3. Write HTML to separate file (wrapped in standalone document — Gap 8)
    const htmlToWrite = process.env.CEN_INLINE_ASSETS === 'true'
      ? buildStandaloneHTML(await inlineAssetsInHtml(html))
      : buildStandaloneHTML(html);
    fs.writeFileSync(htmlFilepath, htmlToWrite, 'utf8');
    console.log(`[+] Component Snipped: Saved component HTML: ${htmlFilepath}`);

    // 4. Write Clean HTML to separate file if provided (also wrapped)
    if (cleanHtml) {
      fs.writeFileSync(cleanHtmlFilepath, buildStandaloneHTML(cleanHtml), 'utf8');
      console.log(`[+] Component Snipped: Saved clean component HTML: ${cleanHtmlFilepath}`);
    }

    // 5. Clean up target class on page in the correct frame
    await targetFrame.evaluate(() => {
      const removeClass = (root) => {
        if (!root) return;
        const el = root.querySelector('.cen-snip-target');
        if (el) el.classList.remove('cen-snip-target');
        
        // Check shadow DOMs
        const all = root.querySelectorAll('*');
        for (let node of all) {
          if (node.shadowRoot) {
            removeClass(node.shadowRoot);
          }
        }
      };
      removeClass(document);
    }).catch(() => {});

    // 6. Save to database
    const entry = {
      id: cropSlug,
      extensionId: extId,
      extensionName: extName,
      tagName: tagName.toUpperCase(),
      screenshot: `/api/component-asset/${extFolder}/${cropSlug}/${cropSlug}.png`,
      htmlFile: `/api/component-asset/${extFolder}/${cropSlug}/${cropSlug}.html`,
      cleanHtmlFile: cleanHtml ? `/api/component-asset/${extFolder}/${cropSlug}/${cropSlug}.clean.html` : undefined,
      styles,
      notes: notes || '',
      category: 'General',
      title: `${extName} ${tagName.toUpperCase()}`,
      timestamp: new Date().toISOString().substring(0, 10)
    };

    db.unshift(entry); // Add to beginning (newest first)
    saveInspirations(db);

    // 7. Update consolidated markdown notes diary at extension root
    rebuildExtensionNotesMD(extFolder, extName, extId);

    return cropSlug;
  } catch (err) {
    console.error('[-] Error capturing element screenshot:', err);
    throw new Error(`Failed to capture element crop: ${err.message}`);
  }
}

// MARK: - API Router Endpoints
//#region API Router Endpoints
// Register API Routes
function registerSniperRoutes(app, getPage, getMeta) {
  // GET: Retrieve all inspirations
  app.get('/api/inspirations', (req, res) => {
    res.json(getInspirations());
  });

  // POST: Update details (notes, category, title)
  app.post('/api/inspirations', (req, res) => {
    const { id, title, category, notes } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing required ID parameter' });
    }

    const db = getInspirations();
    const idx = db.findIndex(item => item.id === id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Inspiration item not found' });
    }

    if (title !== undefined) db[idx].title = title;
    if (category !== undefined) db[idx].category = category;
    
    if (notes !== undefined) {
      db[idx].notes = notes;
      saveInspirations(db);

      // Rebuild unified notes.md for the extension
      const item = db[idx];
      const match = item.screenshot.match(/\/api\/component-asset\/([^\/]+)\/([^\/]+)\//);
      if (match) {
        const extFolder = match[1];
        rebuildExtensionNotesMD(extFolder, item.extensionName, item.extensionId);
      }
    } else {
      saveInspirations(db);
    }

    res.json({ success: true, message: 'Inspiration details updated successfully.', item: db[idx] });
  });

  // POST: Capture and crop element by CSS selector remotely from the dashboard
  app.post('/api/sniper/snip-selector', async (req, res) => {
    const { selector } = req.body;
    if (!selector) {
      return res.status(400).json({ error: 'Missing selector parameter' });
    }

    const page = getPage ? getPage() : null;
    if (!page) {
      return res.status(400).json({ error: 'No active browser sandbox running.' });
    }

    const meta = getMeta ? getMeta() : null;
    const extName = meta ? meta.name : 'Custom';
    const extId = meta ? meta.id : 'custom_snip';

    try {
      // Find the frame containing the selector
      let targetFrame = page.mainFrame();
      let foundInFrame = false;
      
      for (const frame of page.frames()) {
        try {
          const el = await frame.$(selector);
          if (el) {
            targetFrame = frame;
            foundInFrame = true;
            break;
          }
        } catch (e) {
          // Ignore frame lookup errors
        }
      }

      if (!foundInFrame) {
        return res.status(404).json({ error: `CSS Selector "${selector}" not found in any page frame.` });
      }

      // Add temporary class .cen-snip-target to the element
      const locator = targetFrame.locator(selector).first();
      await locator.evaluate((el) => {
        el.classList.add('cen-snip-target');
      });

      // Get styles and HTML content of the target element
      const { styles, html, cleanHtml } = await locator.evaluate((el) => {
        const comp = window.getComputedStyle(el);
        const styles = {
          width: comp.width,
          height: comp.height,
          backgroundColor: comp.backgroundColor,
          color: comp.color,
          borderRadius: comp.borderRadius,
          padding: comp.padding,
          margin: comp.margin,
          boxShadow: comp.boxShadow,
          fontFamily: comp.fontFamily,
          fontSize: comp.fontSize,
          fontWeight: comp.fontWeight,
          display: comp.display
        };
        
        let html = el.outerHTML;
        let cleanHtml = '';
        if (window._cenExtractHighFidelityComponent) {
          const extraction = window._cenExtractHighFidelityComponent(el);
          html = `<style>\n${extraction.css}</style>\n${extraction.html}`;
          cleanHtml = `<style>\n${extraction.cleanCss}</style>\n${extraction.cleanHtml}`;
        }
        
        return { styles, html, cleanHtml };
      });

      const dashboardNotes = `Snipped remotely via Dashboard selector query: "${selector}"`;

      // Run existing screenshot and DB logging workflow
      const filename = await captureElementScreenshot(page, extName, extId, styles, html, cleanHtml, dashboardNotes);
      
      // Clean up target class
      await locator.evaluate((el) => {
        el.classList.remove('cen-snip-target');
      }).catch(() => {});

      // Fetch the updated inspirations database to locate the newly created item
      const db = getInspirations();
      const newItem = db.find(item => item.screenshot && item.screenshot.endsWith(filename));

      res.json({
        success: true,
        message: `Successfully captured selector "${selector}".`,
        item: newItem
      });

    } catch (err) {
      console.error('[-] Error snipping selector:', err.message);
      res.status(500).json({ error: `Failed to capture selector: ${err.message}` });
    }
  });

  // DELETE: Delete an inspiration & its files (image + html + cleanHtml + crop folder)
  app.delete('/api/inspirations/:id', (req, res) => {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Missing required ID parameter' });
    }

    const db = getInspirations();
    const idx = db.findIndex(item => item.id === id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Inspiration item not found' });
    }

    const item = db[idx];

    // Locate the crop directory by parsing the assets path
    const match = item.screenshot.match(/\/api\/component-asset\/([^\/]+)\/([^\/]+)\//);
    if (match) {
      const extFolder = match[1];
      const cropSlug = match[2];
      const cropDirPath = path.join(COMPONENTS_DIR, extFolder, cropSlug);
      
      try {
        if (fs.existsSync(cropDirPath)) {
          fs.rmSync(cropDirPath, { recursive: true, force: true });
          console.log(`[🗑️] Deleted component crop directory: ${cropDirPath}`);
        }
      } catch (err) {
        console.error(`[-] Failed to delete crop folder ${cropDirPath}:`, err.message);
      }

      // Remove the item from database array first so rebuild doesn't include it
      db.splice(idx, 1);
      saveInspirations(db);

      // Rebuild the unified notes.md (since this crop is deleted, it is removed from notes.md)
      rebuildExtensionNotesMD(extFolder, item.extensionName, item.extensionId);
    } else {
      db.splice(idx, 1);
      saveInspirations(db);
    }

    res.json({ success: true, message: 'Inspiration deleted successfully.' });
  });

  // Unified endpoint to serve nested component assets
  app.get('/api/component-asset/:extFolder/:cropSlug/:file', (req, res) => {
    const { extFolder, cropSlug, file } = req.params;
    const filepath = path.join(
      COMPONENTS_DIR,
      path.basename(extFolder),
      path.basename(cropSlug),
      path.basename(file)
    );
    if (fs.existsSync(filepath)) {
      res.sendFile(filepath);
    } else {
      res.status(404).send('Component asset file not found');
    }
  });
}
//#endregion

module.exports = {
  captureElementScreenshot,
  registerSniperRoutes,
  rebuildExtensionNotesMD
};
