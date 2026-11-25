// MARK: - Setup & Core Configuration
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec, execSync } = require('child_process');
const { chromium } = require('playwright');
const { registerSniperRoutes, captureElementScreenshot, rebuildExtensionNotesMD } = require('./sniper/sniper_handler.cjs');


const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/extensions', express.static(path.join(__dirname, '..', 'sandbox_data', 'extensions')));

// Register Component Sniper API routes
registerSniperRoutes(app, () => activeSandboxPage, () => activeExtensionMeta);

// MARK: - Database Helpers
// Load extension database dynamically from extensions.json
function getExtensionsDB() {
  const dbPath = path.join(__dirname, '..', 'extensions.json');
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (err) {
    console.error('[-] Error reading extensions.json:', err.message);
    return [];
  }
}

// Helper to sanitize extension names to folder names
function getSanitizedFolder(name, id) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return `${cleanName}_${id}`;
}

// Helper to download files following redirects
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          request(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: Status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    };
    request(url);
  });
}

// Ensure sandbox data folder exists
const SANDBOX_DATA_DIR = path.resolve(path.join(__dirname, '..', 'sandbox_data'));
if (!fs.existsSync(SANDBOX_DATA_DIR)) fs.mkdirSync(SANDBOX_DATA_DIR);

// Ensure temp downloads folder exists inside sandbox_data
const TEMP_DIR = path.resolve(path.join(SANDBOX_DATA_DIR, 'temp'));
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// Ensure metadata folder exists inside sandbox_data
const METADATA_DIR = path.resolve(path.join(SANDBOX_DATA_DIR, 'metadata'));
if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });

// Helper to resolve metadata file path by ID and optional name (human-readable slug_[id].json format)
function getMetadataPath(id, name) {
  if (name) {
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return path.join(METADATA_DIR, `${safeName}_${id}.json`);
  }
  try {
    const files = fs.readdirSync(METADATA_DIR);
    const filename = files.find(f => f.endsWith(`_${id}.json`));
    if (filename) {
      return path.join(METADATA_DIR, filename);
    }
  } catch (e) { }
  // Fallback to name-less ID if no matching file exists yet
  return path.join(METADATA_DIR, `${id}.json`);
}

// Run automated shallow/deep database migration on startup & self-healing file rename to [safeName]_[id].json
function migrateDatabaseToShallowDeep() {
  const dbPath = path.join(__dirname, '..', 'extensions.json');
  try {
    if (!fs.existsSync(dbPath)) return;
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    let modified = false;

    // Self-healing rename: check for any old [id].json format files and rename them to [safeName]_[id].json
    db.forEach(ext => {
      const oldPath = path.join(METADATA_DIR, `${ext.id}.json`);
      if (fs.existsSync(oldPath)) {
        const safeName = ext.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        const newPath = path.join(METADATA_DIR, `${safeName}_${ext.id}.json`);

        if (!fs.existsSync(newPath)) {
          fs.renameSync(oldPath, newPath);
          console.log(`[+] Migrated metadata file: ${ext.id}.json -> ${safeName}_${ext.id}.json`);
        } else {
          // If the new formatted file already exists, delete the old duplicate to clean up
          fs.unlinkSync(oldPath);
        }
      }
    });

    const migratedDb = db.map(ext => {
      // Check if reviews is present in extensions.json
      if (ext.reviews !== undefined) {
        const metadataPath = getMetadataPath(ext.id, ext.name);

        let metadata = {};
        if (fs.existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          } catch (e) {
            metadata = {};
          }
        }

        // Save deep reviews and description, leaving other keys intact
        metadata.id = ext.id;
        metadata.name = ext.name;
        metadata.reviews = ext.reviews;
        metadata.description = ext.description || metadata.description || "";

        // Populate default values for specs if not present
        if (!metadata.version) metadata.version = "Unknown";
        if (!metadata.size) metadata.size = "Unknown";
        if (!metadata.updated) metadata.updated = "Unknown";
        if (!metadata.language) metadata.language = "English";
        if (!metadata.featured) metadata.featured = false;
        if (!metadata.relatedExtensions) metadata.relatedExtensions = [];

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

        // Delete reviews to shrink extensions.json
        delete ext.reviews;
        modified = true;
      }
      return ext;
    });

    if (modified) {
      fs.writeFileSync(dbPath, JSON.stringify(migratedDb, null, 2), 'utf8');
      console.log('[+] Migration complete: Extracted reviews to separate metadata JSON files.');
    }
  } catch (err) {
    console.error('[-] Error during database migration:', err.message);
  }
}
migrateDatabaseToShallowDeep();

// Download and unpack function
async function downloadAndExtract(id, name) {
  const folderName = getSanitizedFolder(name, id);
  const targetDir = path.resolve(path.join(SANDBOX_DATA_DIR, 'extensions', folderName));
  const tempCrx = path.resolve(path.join(TEMP_DIR, `temp_${id}.crx`));
  const tempZip = path.resolve(path.join(TEMP_DIR, `temp_${id}.zip`));

  // Check if already extracted and valid
  const manifestPath = path.join(targetDir, 'manifest.json');
  if (fs.existsSync(targetDir) && fs.existsSync(manifestPath)) {
    return { targetDir, alreadyCached: true };
  }

  // Clean incomplete folders
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=114.0.0.0&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;

  await downloadFile(downloadUrl, tempCrx);

  const buffer = fs.readFileSync(tempCrx);
  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
  const zipOffset = buffer.indexOf(zipHeader);
  if (zipOffset === -1) {
    throw new Error('Could not locate ZIP header in CRX file.');
  }
  fs.writeFileSync(tempZip, buffer.subarray(zipOffset));

  execSync(`tar -xf "${tempZip}" -C "${targetDir}"`);

  if (fs.existsSync(tempCrx)) fs.unlinkSync(tempCrx);
  if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);

  return { targetDir, alreadyCached: false };
}

// MARK: - Extension Management APIs
//#region Extension Management APIs
// GET API: Extensions DB
app.get('/api/extensions', (req, res) => {
  // Add a quick check to see if each extension is cached
  const result = getExtensionsDB().map(ext => {
    const folderName = getSanitizedFolder(ext.name, ext.id);
    const targetDir = path.join(SANDBOX_DATA_DIR, 'extensions', folderName);
    const manifestPath = path.join(targetDir, 'manifest.json');

    const critiqueCharCount = ext.critiqueCharCount || 0;
    const critiqueWordCount = ext.critiqueWordCount || 0;

    return {
      ...ext,
      cached: fs.existsSync(targetDir) && fs.existsSync(manifestPath),
      critiqueCharCount,
      critiqueWordCount
    };
  });
  res.json(result);
});

// POST API: Download and Extract CRX codebase on-demand
app.post('/api/extensions/:id/download', async (req, res) => {
  const { id } = req.params;
  const db = getExtensionsDB();
  const ext = db.find(e => e.id === id);
  if (!ext) {
    return res.status(404).json({ error: "Extension not found in database" });
  }

  try {
    console.log(`[+] Manual trigger download/extract for ${ext.name}...`);
    const result = await downloadAndExtract(ext.id, ext.name);
    res.json({ success: true, alreadyCached: result.alreadyCached });
  } catch (err) {
    console.error('[-] Manual download/extract failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET API: Retrieve deep metadata for a specific extension on-demand
app.get('/api/extensions/:id/metadata', (req, res) => {
  const { id } = req.params;
  console.log(`[DEBUG SERVER] GET /api/extensions/${id}/metadata requested.`);
  if (!id) {
    console.log(`[DEBUG SERVER] Error: Missing ID parameter.`);
    return res.status(400).json({ error: "Missing extension ID" });
  }

  const metadataPath = getMetadataPath(id);
  console.log(`[DEBUG SERVER] Metadata file path resolved: ${metadataPath}`);
  if (fs.existsSync(metadataPath)) {
    console.log(`[DEBUG SERVER] Metadata file found.`);
    try {
      const data = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      console.log(`[DEBUG SERVER] Loaded and parsed metadata for ${data.name}. Reviews count: ${data.reviews ? data.reviews.length : 0}`);
      return res.json(data);
    } catch (e) {
      console.error(`[DEBUG SERVER] Error reading metadata file for ${id}:`, e.message);
    }
  } else {
    console.log(`[DEBUG SERVER] Warning: Metadata file NOT found at: ${metadataPath}`);
  }

  // Fallback to empty details if metadata file not found/corrupted
  res.json({
    id,
    reviews: [],
    description: "",
    version: "Unknown",
    size: "Unknown",
    updated: "Unknown",
    language: "English",
    featured: false,
    relatedExtensions: []
  });
});

// DELETE API: Remove Extension from database and disk cache
app.delete('/api/extensions/:id', (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "Missing extension ID" });
  }

  const dbPath = path.join(__dirname, '..', 'extensions.json');
  const db = getExtensionsDB();
  const extIndex = db.findIndex(e => e.id === id);

  if (extIndex === -1) {
    return res.status(404).json({ error: "Extension not found in database" });
  }

  const ext = db[extIndex];

  try {
    // 1. Remove from database
    db.splice(extIndex, 1);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log(`[+] Removed ${ext.name} from extensions.json`);

    // 2. Clean up local extracted files and metadata JSON in sandbox_data
    const folderName = getSanitizedFolder(ext.name, ext.id);
    const targetDir = path.resolve(path.join(SANDBOX_DATA_DIR, 'extensions', folderName));
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      console.log(`[+] Cleaned up disk folder: ${targetDir}`);
    }

    const metadataPath = path.resolve(path.join(METADATA_DIR, `${id}.json`));
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
      console.log(`[+] Cleaned up metadata file: ${metadataPath}`);
    }

    res.json({ success: true, message: `Extension "${ext.name}" successfully removed.` });
  } catch (error) {
    console.error('[-] Error removing extension:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST API: Download/Unpack All Extensions in background
app.post('/api/download-all', async (req, res) => {
  console.log('[+] Starting pre-download queue for all extensions...');

  try {
    const extensionsFolder = path.join(SANDBOX_DATA_DIR, 'extensions');
    if (!fs.existsSync(extensionsFolder)) fs.mkdirSync(extensionsFolder);

    const downloads = getExtensionsDB().map(async (ext) => {
      try {
        const { alreadyCached } = await downloadAndExtract(ext.id, ext.name);
        console.log(`[+] Pre-fetched ${ext.name}: ${alreadyCached ? 'Already Cached' : 'Downloaded and Unpacked'}`);
        return { id: ext.id, success: true, cached: alreadyCached };
      } catch (e) {
        console.error(`[-] Failed pre-fetching ${ext.name}:`, e.message);
        return { id: ext.id, success: false, error: e.message };
      }
    });

    const results = await Promise.all(downloads);
    res.json({ success: true, message: "Queue pre-fetching complete.", results });
  } catch (error) {
    console.error('[-] Error in download-all queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Launch Extension in Sandbox
let activePlaywrightContexts = {};
let activeExtensionMeta = null; // Track current extension name/id for screenshots
let activeSandboxPage = null;   // Track active Playwright page for remote screenshot

// Reusable profile directory path to speed up Playwright boot times
const REUSABLE_PROFILE_DIR = path.resolve(path.join(SANDBOX_DATA_DIR, 'chrome_profile'));

// Ensure screenshots folder exists
const SCREENSHOTS_DIR = path.resolve(path.join(SANDBOX_DATA_DIR, 'screenshots'));
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR);
const CWS_SCREENSHOTS_DIR = path.resolve(path.join(SCREENSHOTS_DIR, 'cws'));
if (!fs.existsSync(CWS_SCREENSHOTS_DIR)) fs.mkdirSync(CWS_SCREENSHOTS_DIR, { recursive: true });

// Ensure components folder exists
const COMPONENTS_DIR = path.resolve(path.join(SANDBOX_DATA_DIR, 'components'));
if (!fs.existsSync(COMPONENTS_DIR)) fs.mkdirSync(COMPONENTS_DIR);

// Define path to screenshot notes database
const SCREENSHOT_NOTES_PATH = path.resolve(path.join(SANDBOX_DATA_DIR, 'screenshot_notes.json'));

// Get the currently active/focused page inside the Playwright browser context
async function getActivePage(context) {
  const pages = context.pages();
  if (pages.length === 0) return null;
  if (pages.length === 1) return pages[0];

  // Try to find the page with document.hasFocus()
  for (const page of pages) {
    try {
      const isFocused = await page.evaluate(() => document.hasFocus());
      if (isFocused) return page;
    } catch (e) {
      // Ignore errors for closed/unresponsive pages
    }
  }

  // Fallback: search for visible tab
  for (const page of pages) {
    try {
      const visibility = await page.evaluate(() => document.visibilityState);
      if (visibility === 'visible') return page;
    } catch (e) {
      // Ignore
    }
  }

  // Fallback: return the last page in the array (most recently created)
  return pages[pages.length - 1];
}

// Perform screenshot on a specific page
async function takeScreenshotOfPage(page, extName) {
  const safeName = extName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  const timestamp = Date.now();
  const filename = `${safeName}_${timestamp}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`[📸] Screenshot saved: ${filepath}`);
  return { filename, filepath };
}

// Inject screenshot listener and keyboard listener into a page
async function injectScreenshotListener(page, extName) {
  try {
    // Expose Node function to trigger screenshots
    await page.exposeFunction('_captureScreenshot', async () => {
      const { filename } = await takeScreenshotOfPage(page, extName);
      return filename;
    });
  } catch (err) {
    // exposeFunction error can be ignored if already registered
  }

  try {
    // Add init script to run on page load and navigation
    await page.addInitScript(() => {
      document.addEventListener('keydown', async (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'S') {
          e.preventDefault();
          e.stopPropagation();
          try {
            const filename = await window._captureScreenshot();

            // Toast notification block
            const toast = document.createElement('div');
            toast.textContent = `📸 Screenshot saved: ${filename}`;
            toast.style.cssText = `
              position: fixed; bottom: 24px; right: 24px; z-index: 999999;
              background: rgba(16, 16, 20, 0.92); color: #00e6c3;
              padding: 14px 22px; border-radius: 12px; font-size: 14px;
              font-family: system-ui, sans-serif; font-weight: 600;
              border: 1px solid rgba(0, 230, 195, 0.3);
              box-shadow: 0 8px 24px rgba(0,0,0,0.5);
              backdrop-filter: blur(8px);
              animation: toastIn 0.3s ease-out;
            `;
            const style = document.createElement('style');
            style.textContent = '@keyframes toastIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }';
            document.head.appendChild(style);
            document.body.appendChild(toast);
            setTimeout(() => { toast.remove(); style.remove(); }, 2500);
          } catch (err) {
            console.error('Screenshot keypress execution failed:', err);
          }
        }
      });
    });
  } catch (err) {
    // Ignore script injection failures
  }
}

// Inject sniper listener and element highlighter script into a page
async function injectSniperListener(page, extName, extId) {
  try {
    await page.exposeFunction('_captureElementScreenshot', async (styles, html, cleanHtml, notes) => {
      return await captureElementScreenshot(page, extName, extId, styles, html, cleanHtml, notes);
    });
  } catch (err) {
    // exposeFunction error can be ignored if already registered
  }

  try {
    await page.exposeFunction('_saveComponentNotes', async (cropSlug, notesText) => {
      const inspirationsPath = path.join(SANDBOX_DATA_DIR, 'inspirations.json');
      if (fs.existsSync(inspirationsPath)) {
        try {
          const inspirations = JSON.parse(fs.readFileSync(inspirationsPath, 'utf8'));
          const idx = inspirations.findIndex(item => item.id === cropSlug);
          if (idx !== -1) {
            inspirations[idx].notes = notesText;
            fs.writeFileSync(inspirationsPath, JSON.stringify(inspirations, null, 2), 'utf8');
            console.log(`[+] Component Notes Saved: Saved notes for ${cropSlug} via Page Binding`);

            // Rebuild unified notes diary
            const item = inspirations[idx];
            const match = item.screenshot.match(/\/api\/component-asset\/([^\/]+)\/([^\/]+)\//);
            if (match) {
              const extFolder = match[1];
              rebuildExtensionNotesMD(extFolder, item.extensionName, item.extensionId);
            }
          }
        } catch (e) {
          console.error('[-] Error saving notes via Page Binding:', e.message);
        }
      }
      return { success: true };
    });
  } catch (err) {
    // ignore duplicate registration
  }

  // --- MAIN WORLD HOOKS (Gap 1 + Gap 2) ---
  // Must run before page scripts so we intercept attachShadow and CSSStyleSheet
  // for closed shadow roots and adoptedStyleSheets (Lit, Shoelace, etc.)
  try {
    await page.addInitScript(() => {
      // --- Gap 1: Closed Shadow DOM Registry ---
      if (!window.__cenShadowRootsPatched) {
        window.__cenShadowRootsPatched = true;
        const shadowRoots = new Map();
        const originalAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(init) {
          const root = originalAttachShadow.call(this, init);
          shadowRoots.set(this, root); // Caches closed roots too
          return root;
        };
        window.__cenShadowRoots = shadowRoots;
      }

      // --- Gap 2: adoptedStyleSheets Intercept ---
      if (!window.__cenAdoptedPatchApplied) {
        window.__cenAdoptedPatchApplied = true;
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
      }
    });
    console.log('[+] CEN MAIN world hooks injected (closed shadow DOM + adoptedStyleSheets)');
  } catch (err) {
    console.warn('[-] Failed to inject MAIN world hooks:', err.message);
  }

  const injectScript = async () => {
    try {
      const sniperScriptPath = path.join(__dirname, 'sniper', 'sniper_injected.js');
      if (fs.existsSync(sniperScriptPath)) {
        const content = fs.readFileSync(sniperScriptPath, 'utf8');
        await page.evaluate(content).catch(() => { });
      }
    } catch (err) {
      // ignore eval failures
    }
  };

  try {
    const sniperScriptPath = path.join(__dirname, 'sniper', 'sniper_injected.js');
    if (fs.existsSync(sniperScriptPath)) {
      const content = fs.readFileSync(sniperScriptPath, 'utf8');
      await page.addInitScript({ content });
    }

    // Attach listeners to re-evaluate on loading
    page.on('domcontentloaded', injectScript);
    page.on('load', injectScript);

    // Inject immediately in case page is already navigated
    await injectScript();
  } catch (err) {
    console.error('[-] Error injecting sniper script:', err.message);
  }
}


//#endregion

// MARK: - Playwright Sandbox Control
//#region Playwright Sandbox Control
app.post('/api/launch', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing extension ID" });
  }

  const ext = getExtensionsDB().find(e => e.id === id);
  if (!ext) {
    return res.status(404).json({ error: "Extension not found in database" });
  }

  try {
    const { targetDir } = await downloadAndExtract(ext.id, ext.name);

    // Parse manifest to find entry points (popup or options page)
    const manifestPath = path.join(targetDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const popupPath = manifest.action?.default_popup || manifest.browser_action?.default_popup;
    const optionsPath = manifest.options_page || manifest.options_ui?.page;
    // Check for new tab override (chrome_url_overrides.newtab)
    const newtabPath = manifest.chrome_url_overrides?.newtab;

    console.log('[+] Booting Playwright context using reusable profile...');

    // Close existing context if open to release the profile lock
    if (activePlaywrightContexts['current']) {
      try {
        await activePlaywrightContexts['current'].close();
      } catch (e) {
        // ignore
      }
    }

    // Determine layout profile based on CLI flags
    const isSingle1080 = process.argv.includes('--single') || process.argv.includes('--1080');

    const config = isSingle1080 ? {
      windowSize: '1145,1080',
      windowPosition: '775,0',
      viewport: { width: 1145, height: 540 }
    } : {
      windowSize: '1145,1440',
      windowPosition: '2295,0',
      viewport: { width: 1145, height: 720 }
    };

    console.log(`[+] Screen mode: ${isSingle1080 ? 'Single 1080p Monitor' : 'Dual Monitor / Ultrawide'}`);
    console.log(`[+] Configured window-size=${config.windowSize}, window-position=${config.windowPosition}`);

    const context = await chromium.launchPersistentContext(REUSABLE_PROFILE_DIR, {
      headless: false,
      viewport: config.viewport,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        `--disable-extensions-except=${targetDir}`,
        `--load-extension=${targetDir}`,
        `--window-size=${config.windowSize}`,
        `--window-position=${config.windowPosition}`,
        '--disable-blink-features=AutomationControlled',
      ],
    });

    activePlaywrightContexts['current'] = context;
    activeExtensionMeta = { id: ext.id, name: ext.name };

    // Dynamically retrieve extension ID inside Playwright context
    let browserExtensionId = '';
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
      browserExtensionId = workers[0].url().split('/')[2];
    } else {
      await new Promise(resolve => setTimeout(resolve, 600));
      const freshWorkers = context.serviceWorkers();
      if (freshWorkers.length > 0) {
        browserExtensionId = freshWorkers[0].url().split('/')[2];
      } else {
        const bgPages = context.backgroundPages();
        if (bgPages.length > 0) {
          browserExtensionId = bgPages[0].url().split('/')[2];
        }
      }
    }

    // Listen to newly opened tabs and inject shortcut hooks
    context.on('page', async (newPage) => {
      console.log(`[+] Playwright tab opened: ${newPage.url()}`);
      activeSandboxPage = newPage;
      try {
        await injectScreenshotListener(newPage, ext.name);
        await injectSniperListener(newPage, ext.name, ext.id);
      } catch (err) {
        console.error('[-] Error injecting page listener:', err.message);
      }
    });

    const page = await context.newPage();
    activeSandboxPage = page;
    await injectScreenshotListener(page, ext.name);
    await injectSniperListener(page, ext.name, ext.id);

    let launchedUrl = 'https://example.com';
    if (browserExtensionId && newtabPath) {
      // Prioritize new tab override if it exists
      launchedUrl = `chrome-extension://${browserExtensionId}/${newtabPath}`;
      console.log(`[+] Launching new tab override: ${launchedUrl}`);
      await page.goto(launchedUrl);
    } else if (browserExtensionId && popupPath) {
      launchedUrl = `chrome-extension://${browserExtensionId}/${popupPath}`;
      console.log(`[+] Launching popup: ${launchedUrl}`);
      await page.goto(launchedUrl);
    } else if (browserExtensionId && optionsPath) {
      launchedUrl = `chrome-extension://${browserExtensionId}/${optionsPath}`;
      console.log(`[+] Launching options page: ${launchedUrl}`);
      await page.goto(launchedUrl);
    } else {
      console.log('[+] No default popup/options page found. Opening standard tab.');
      await page.goto(launchedUrl);
    }

    // Clear context map on manual browser closure
    context.on('close', () => {
      delete activePlaywrightContexts['current'];
      activeExtensionMeta = null;
      activeSandboxPage = null;
    });

    res.json({ success: true, message: `Extension ${ext.name} launched in sandbox.`, launchedUrl });
  } catch (error) {
    console.error('[-] Error launching extension:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST API: Remote Screenshot from Dashboard Button
app.post('/api/screenshot', async (req, res) => {
  const context = activePlaywrightContexts['current'];
  if (!context || !activeExtensionMeta) {
    return res.status(400).json({ error: "No active sandbox running. Launch an extension first." });
  }

  const { mode } = req.body; // 'focused' | 'initial' | 'last'
  try {
    const pages = context.pages();
    if (pages.length === 0) {
      return res.status(400).json({ error: "No active pages found in browser context." });
    }

    let page;
    if (mode === 'initial') {
      page = pages[0];
    } else if (mode === 'last') {
      page = pages[pages.length - 1];
    } else {
      // Default 'focused' resolving
      page = await getActivePage(context);
      if (!page) {
        page = pages[pages.length - 1] || pages[0]; // fallback to last or initial
      }
    }

    const { filename, filepath } = await takeScreenshotOfPage(page, activeExtensionMeta.name);
    res.json({ success: true, filename, filepath });
  } catch (error) {
    console.error('[-] Screenshot error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST API: Remote Snip Toggle from Dashboard Button
app.post('/api/toggle-snip', async (req, res) => {
  const context = activePlaywrightContexts['current'];
  if (!context || !activeExtensionMeta) {
    return res.status(400).json({ error: "No active sandbox running. Launch an extension first." });
  }

  try {
    const page = await getActivePage(context);
    if (!page) {
      return res.status(400).json({ error: "No active page found in browser context." });
    }

    const success = await page.evaluate(() => {
      if (typeof window._toggleCenSnipMode === 'function') {
        window._toggleCenSnipMode(true);
        return true;
      }
      return false;
    });

    if (success) {
      res.json({ success: true, message: "Component Snip Mode activated remotely." });
    } else {
      res.status(500).json({ error: "Sniper highlighter script not loaded or active in this tab." });
    }
  } catch (error) {
    console.error('[-] Remote snip error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST API: Open Extracted Extension Code in VS Code
app.post('/api/open-code', (req, res) => {
  const { id, editor, customCommand } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing extension ID" });
  }

  const ext = getExtensionsDB().find(e => e.id === id);
  if (!ext) {
    return res.status(404).json({ error: "Extension not found in database" });
  }

  const folderName = getSanFolderLocal(ext.name, ext.id);
  const targetDir = path.resolve(path.join(SANDBOX_DATA_DIR, 'extensions', folderName));

  if (!fs.existsSync(targetDir)) {
    return res.status(400).json({ error: "Extension folder not found. Please launch it first to extract it." });
  }

  // Resolve which command/editor to execute
  let command = 'code';
  let editorName = 'VS Code';

  if (editor === 'cursor') {
    command = 'cursor';
    editorName = 'Cursor';
  } else if (editor === 'windsurf') {
    command = 'windsurf';
    editorName = 'Windsurf';
  } else if (editor === 'antigravity') {
    command = 'antigravity-ide';  // it's antigravity-ide from mid-may 2026
    editorName = 'Antigravity IDE';
  } else if (editor === 'custom' && customCommand) {
    command = customCommand;
    editorName = customCommand;
  }

  console.log(`[+] Launching ${editorName} for: ${targetDir}`);
  // Run with double quotes around command first
  exec(`"${command}" "${targetDir}"`, (error) => {
    if (error) {
      // Fallback to running directly if quotes around command failed or if command includes parameters
      exec(`${command} "${targetDir}"`, (fallbackError) => {
        if (fallbackError) {
          console.error(`[-] Failed to open in ${editorName}:`, fallbackError.message);
          return res.status(500).json({ error: `Could not open in ${editorName}. Make sure it is installed and in your PATH.` });
        }
        res.json({ success: true, message: `${editorName} window successfully launched.` });
      });
      return;
    }
    res.json({ success: true, message: `${editorName} window successfully launched.` });
  });
});

// Ensure src/showcase directory exists
const SHOWCASE_DIR = path.resolve(path.join(__dirname, '..', 'src', 'showcase'));
const SHOWCASE_DB_PATH = path.resolve(path.join(SHOWCASE_DIR, 'index.json'));

if (!fs.existsSync(SHOWCASE_DIR)) {
  fs.mkdirSync(SHOWCASE_DIR, { recursive: true });
}
if (!fs.existsSync(SHOWCASE_DB_PATH)) {
  fs.writeFileSync(SHOWCASE_DB_PATH, JSON.stringify([], null, 2), 'utf8');
}

//#endregion

// MARK: - Component Showcase Library
//#region Component Showcase Library
// Helper to recursively find showcase component files
function resolveShowcasePath(id) {
  const findFile = (dir) => {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const found = findFile(fullPath);
        if (found) return found;
      } else if (file === `${id}.jsx`) {
        return fullPath;
      }
    }
    return null;
  };
  return findFile(SHOWCASE_DIR) || path.join(SHOWCASE_DIR, `${id}.jsx`);
}

const INSPIRATIONS_DB_PATH = path.resolve(path.join(SANDBOX_DATA_DIR, 'inspirations.json'));

function getInspirationsDirect() {
  if (!fs.existsSync(INSPIRATIONS_DB_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(INSPIRATIONS_DB_PATH, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveInspirationsDirect(data) {
  try {
    fs.writeFileSync(INSPIRATIONS_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[-] Error writing to inspirations.json in server.cjs:', err.message);
  }
}

// Helper to get showcase DB
function getShowcaseDB() {
  try {
    return JSON.parse(fs.readFileSync(SHOWCASE_DB_PATH, 'utf8'));
  } catch (err) {
    console.error('[-] Error reading showcase index.json:', err.message);
    return [];
  }
}

// Helper to save showcase DB
function saveShowcaseDB(data) {
  try {
    fs.writeFileSync(SHOWCASE_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[-] Error writing showcase index.json:', err.message);
  }
}

// GET API: Retrieve all showcase items
app.get('/api/showcase', (req, res) => {
  const db = getShowcaseDB();
  const inspirations = getInspirationsDirect();
  let modified = false;

  const updatedDb = db.map(item => {
    if (item.fromCropId && (!item.extensionId || !item.extensionName)) {
      const match = inspirations.find(c => c.id === item.fromCropId);
      if (match) {
        item.extensionId = match.extensionId || null;
        item.extensionName = match.extensionName || null;
        modified = true;
      }
    }
    return item;
  });

  if (modified) {
    saveShowcaseDB(updatedDb);
  }

  res.json(updatedDb);
});

// POST API: Create new showcase component
app.post('/api/showcase/create', (req, res) => {
  const { name, category, description, fromCropId, extensionId } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Missing component name" });
  }

  // Sanitize name to CamelCase or standard variable name
  const cleanId = name.replace(/[^a-zA-Z0-9]/g, '');
  if (!cleanId) {
    return res.status(400).json({ error: "Invalid component name" });
  }

  const db = getShowcaseDB();
  if (db.some(c => c.id === cleanId)) {
    return res.status(400).json({ error: `Component with ID ${cleanId} already exists.` });
  }

  let extId = extensionId || null;
  let extName = null;

  if (fromCropId) {
    const inspirations = getInspirationsDirect();
    const cropIdx = inspirations.findIndex(crop => crop.id === fromCropId);
    if (cropIdx !== -1) {
      extId = inspirations[cropIdx].extensionId || null;
      extName = inspirations[cropIdx].extensionName || null;
    }
  } else if (extId) {
    const extensions = getExtensionsDB();
    const ext = extensions.find(e => e.id === extId);
    if (ext) {
      extName = ext.name;
    }
  }

  let subDirName = '';
  if (extName) {
    subDirName = extName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  }

  const targetSubdir = subDirName ? path.join(SHOWCASE_DIR, subDirName) : SHOWCASE_DIR;
  if (!fs.existsSync(targetSubdir)) {
    fs.mkdirSync(targetSubdir, { recursive: true });
  }

  const componentPath = path.join(targetSubdir, `${cleanId}.jsx`);

  // React component boilerplate
  const boilerplate = `import React from "react";
import { motion } from "framer-motion";

export default function ${cleanId}() {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-4 max-w-sm mx-auto">
      <h3 className="text-sm font-bold text-zinc-800">${name}</h3>
      <p className="text-xs text-zinc-500 text-center">
        This is your new custom showcase component. Open it in your editor to start building!
      </p>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow transition cursor-pointer select-none"
      >
        Interactive Action
      </motion.button>
    </div>
  );
}
`;

  try {
    fs.writeFileSync(componentPath, boilerplate, 'utf8');
    console.log(`[+] Created custom component file: ${componentPath}`);

    if (fromCropId) {
      const inspirations = getInspirationsDirect();
      const cropIdx = inspirations.findIndex(crop => crop.id === fromCropId);
      if (cropIdx !== -1) {
        inspirations[cropIdx].showcaseId = cleanId;
        saveInspirationsDirect(inspirations);
        console.log(`[+] Linked crop ${fromCropId} to showcase component ${cleanId}`);
      }
    }

    const newEntry = {
      id: cleanId,
      title: name,
      category: category || "General",
      description: description || "",
      timestamp: new Date().toISOString().substring(0, 10),
      notes: "",
      fromCropId: fromCropId || null,
      extensionId: extId,
      extensionName: extName
    };

    db.unshift(newEntry);
    saveShowcaseDB(db);

    res.json({ success: true, component: newEntry });
  } catch (error) {
    console.error('[-] Error creating showcase component:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST API: Update showcase component metadata
app.post('/api/showcase/update', (req, res) => {
  const { id, title, category, description, notes } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing component ID" });
  }

  const db = getShowcaseDB();
  const idx = db.findIndex(c => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Component not found in database" });
  }

  try {
    if (title !== undefined) db[idx].title = title;
    if (category !== undefined) db[idx].category = category;
    if (description !== undefined) db[idx].description = description;
    if (notes !== undefined) db[idx].notes = notes;

    saveShowcaseDB(db);
    res.json({ success: true, component: db[idx] });
  } catch (error) {
    console.error('[-] Error updating showcase component:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE API: Remove a showcase component
app.delete('/api/showcase/:id', (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "Missing component ID" });
  }

  const db = getShowcaseDB();
  const idx = db.findIndex(c => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Component not found in database" });
  }

  const componentPath = resolveShowcasePath(id);

  try {
    if (fs.existsSync(componentPath)) {
      fs.unlinkSync(componentPath);
      console.log(`[DELETE] Deleted component file: ${componentPath}`);
    }

    // Reset sanitized status of linked crop
    const targetComp = db[idx];
    const cropId = targetComp.fromCropId;
    if (cropId) {
      const inspirations = getInspirationsDirect();
      const cropIdx = inspirations.findIndex(crop => crop.id === cropId);
      if (cropIdx !== -1) {
        delete inspirations[cropIdx].sanitized;
        delete inspirations[cropIdx].showcaseId;
        saveInspirationsDirect(inspirations);
        console.log(`[+] Unlinked crop ${cropId} from showcase component ${id}`);
      }
    } else {
      // Fallback: search and clear any crop that matches this showcaseId
      const inspirations = getInspirationsDirect();
      let modified = false;
      inspirations.forEach(crop => {
        if (crop.showcaseId === id) {
          delete crop.sanitized;
          delete crop.showcaseId;
          modified = true;
        }
      });
      if (modified) {
        saveInspirationsDirect(inspirations);
        console.log(`[+] Unlinked all matching crops from showcase component ${id}`);
      }
    }

    db.splice(idx, 1);
    saveShowcaseDB(db);

    res.json({ success: true, message: `Component "${id}" successfully removed.` });
  } catch (error) {
    console.error('[-] Error deleting showcase component:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET API: Retrieve showcase component JSX source code
app.get('/api/showcase/code/:id', (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "Missing component ID" });
  }

  const targetFile = resolveShowcasePath(id);
  if (!fs.existsSync(targetFile)) {
    return res.status(404).json({ error: "Component file not found." });
  }

  try {
    const code = fs.readFileSync(targetFile, 'utf8');
    res.json({ success: true, code });
  } catch (error) {
    console.error('[-] Error reading showcase component code:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST API: Open Showcase Component Code in Editor
app.post('/api/open-showcase', (req, res) => {
  const { id, editor, customCommand } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing component ID" });
  }

  const targetFile = resolveShowcasePath(id);
  if (!fs.existsSync(targetFile)) {
    return res.status(404).json({ error: "Component file not found." });
  }

  let command = 'code';
  let editorName = 'VS Code';

  if (editor === 'cursor') {
    command = 'cursor';
    editorName = 'Cursor';
  } else if (editor === 'windsurf') {
    command = 'windsurf';
    editorName = 'Windsurf';
  } else if (editor === 'antigravity') {
    command = 'antigravity-ide';
    editorName = 'Antigravity IDE';
  } else if (editor === 'custom' && customCommand) {
    command = customCommand;
    editorName = customCommand;
  }

  console.log(`[+] Launching ${editorName} for: ${targetFile}`);
  exec(`"${command}" "${targetFile}"`, (error) => {
    if (error) {
      exec(`${command} "${targetFile}"`, (fallbackError) => {
        if (fallbackError) {
          console.error(`[-] Failed to open showcase in ${editorName}:`, fallbackError.message);
          return res.status(500).json({ error: `Could not open in ${editorName}.` });
        }
        res.json({ success: true, message: `${editorName} launched successfully.` });
      });
      return;
    }
    res.json({ success: true, message: `${editorName} launched successfully.` });
  });
});

//#endregion

// MARK: - Audit Takeaways Log
//#region Audit Takeaways Log
// Helper for local folder resolver inside open-code endpoint
function getSanFolderLocal(name, id) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return `${cleanName}_${id}`;
}

// Helper to rebuild takeaways.md based on active extensions database entries
function rebuildTakeawaysMD() {
  const dbPath = path.join(__dirname, '..', 'extensions.json');
  let db = [];
  try {
    db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (e) {
    console.error('[-] Error reading database for takeaways rebuild:', e.message);
    return;
  }

  const logFile = path.join(__dirname, '..', '.docs', 'takeaways.md');
  let content = `# CEN Explorer v2: Audit Takeaways Log\n\n`;
  content += `This log acts as a persistent database of extension design audits, monetization critiques, and architectural takeaways.\n\n---\n`;

  const reviewedExtensions = db.filter(e => e.reviewed);

  if (reviewedExtensions.length === 0) {
    content += `\n*No extensions reviewed yet. Complete your first critique inside the dashboard to generate audit logs!*\n`;
  } else {
    reviewedExtensions.forEach(ext => {
      const metadataPath = getMetadataPath(ext.id, ext.name);
      let takeaway = "";
      let painPoints = "";
      let userRating = 0;

      if (fs.existsSync(metadataPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          takeaway = meta.takeaway || "";
          painPoints = meta.painPoints || "";
          userRating = meta.userRating || 0;
        } catch (e) { }
      }

      content += `\n## Extension: ${ext.name} (${ext.id})\n`;
      content += `- **Category:** ${ext.category || 'N/A'}\n`;
      content += `- **User Rating/Sentiment:** ${userRating || ext.rating || 'N/A'}/5\n`;
      if (painPoints) {
        content += `- **Critical Pain Points:** ${painPoints}\n`;
      }
      content += `\n### Audit Notes & Takeaways\n\n${takeaway || '*No audit notes entered yet.*'}\n`;
      if (ext.timestamp) {
        content += `\n- **Last Updated:** ${ext.timestamp}\n`;
      }
      content += `\n---\n`;
    });
  }

  try {
    fs.writeFileSync(logFile, content, 'utf8');
    console.log(`[+] Rebuilt takeaways.md with ${reviewedExtensions.length} entries`);
  } catch (err) {
    console.error('[-] Error writing takeaways.md file:', err.message);
  }
}

// POST API: Save Log Takeaway
app.post('/api/log', (req, res) => {
  const { id, rating, takeaway, painPoints } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing required extension ID parameter" });
  }

  const dbPath = path.join(__dirname, '..', 'extensions.json');
  const db = getExtensionsDB();
  const extIndex = db.findIndex(e => e.id === id);

  if (extIndex === -1) {
    return res.status(404).json({ error: "Extension not found in database" });
  }

  try {
    // Update shallow database properties
    db[extIndex].reviewed = true;
    db[extIndex].timestamp = new Date().toISOString().substring(0, 10);

    // Compute stats
    const totalText = (takeaway || "") + " " + (painPoints || "");
    db[extIndex].critiqueCharCount = totalText.length;
    db[extIndex].critiqueWordCount = totalText.trim().split(/\s+/).filter(Boolean).length;

    // Delete any legacy fields if present in shallow DB
    delete db[extIndex].takeaway;
    delete db[extIndex].painPoints;
    delete db[extIndex].userRating;
    delete db[extIndex].screenshot;
    delete db[extIndex].screenshots;
    delete db[extIndex].tags;
    delete db[extIndex].author;
    delete db[extIndex].description;

    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log(`[+] Saved critique flags for ${db[extIndex].name} to extensions.json`);

    // Save deep critique details to separate metadata JSON file
    const metadataPath = getMetadataPath(id, db[extIndex].name);
    let metadata = {};
    if (fs.existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } catch (e) {
        metadata = {};
      }
    }

    metadata.id = id;
    metadata.name = db[extIndex].name;
    metadata.userRating = rating !== undefined ? rating : metadata.userRating || 5;
    metadata.painPoints = painPoints !== undefined ? painPoints : metadata.painPoints || "";
    metadata.takeaway = takeaway !== undefined ? takeaway : metadata.takeaway || "";

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    console.log(`[+] Saved deep critique text for ${db[extIndex].name} to metadata JSON file`);

    // Sync to takeaways.md
    rebuildTakeawaysMD();

    res.json({
      success: true,
      message: "Takeaway successfully saved to metadata and takeaways.md",
      extension: db[extIndex]
    });
  } catch (error) {
    console.error('[-] Error saving takeaway:', error);
    res.status(500).json({ error: error.message });
  }
});

//#endregion

// MARK: - Screenshot & Gallery Management
//#region Screenshot & Gallery Management
// Helper to read screenshot notes
function getScreenshotNotes() {
  if (!fs.existsSync(SCREENSHOT_NOTES_PATH)) {
    fs.writeFileSync(SCREENSHOT_NOTES_PATH, JSON.stringify({}, null, 2), 'utf8');
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(SCREENSHOT_NOTES_PATH, 'utf8'));
  } catch (err) {
    console.error('[-] Error reading screenshot_notes.json:', err.message);
    return {};
  }
}

// Helper to save screenshot notes
function saveScreenshotNotes(data) {
  try {
    fs.writeFileSync(SCREENSHOT_NOTES_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[-] Error writing to screenshot_notes.json:', err.message);
  }
}

// GET API: List screenshots and component sniper crops for a specific extension
app.get('/api/screenshots/:id', (req, res) => {
  const { id } = req.params;
  const ext = getExtensionsDB().find(e => e.id === id);
  if (!ext) return res.json([]);

  const safeName = ext.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  try {
    const matchedScreenshots = [];
    if (fs.existsSync(SCREENSHOTS_DIR)) {
      const files = fs.readdirSync(SCREENSHOTS_DIR);
      const matched = files.filter(file => file.startsWith(safeName) && file.endsWith('.png'));
      matchedScreenshots.push(...matched.map(file => `/api/screenshot-file/${file}`));
    }

    const matchedCws = [];
    if (fs.existsSync(CWS_SCREENSHOTS_DIR)) {
      const files = fs.readdirSync(CWS_SCREENSHOTS_DIR);
      const matched = files.filter(file => file.startsWith(safeName) && file.endsWith('.png'));
      matchedCws.push(...matched.map(file => `/api/screenshot-file/cws/${file}`));
    }

    const matchedComponents = [];
    const inspirationsPath = path.join(SANDBOX_DATA_DIR, 'inspirations.json');
    if (fs.existsSync(inspirationsPath)) {
      try {
        const inspirations = JSON.parse(fs.readFileSync(inspirationsPath, 'utf8'));
        const matched = inspirations.filter(item => item.extensionId === id);
        matchedComponents.push(...matched.map(item => item.screenshot));
      } catch (err) {
        console.error('[-] Error reading inspirations in screenshots API:', err);
      }
    }

    // Combine them and sort:
    // 1. User captures & Element Crops are sorted descending by timestamp (newest first).
    // 2. Chrome Web Store reference screenshots are placed at the end, sorted ascending by slide index.
    const combined = [...matchedScreenshots, ...matchedCws, ...matchedComponents];
    combined.sort((a, b) => {
      const isCwsA = a.includes('/cws/');
      const isCwsB = b.includes('/cws/');

      if (isCwsA && !isCwsB) return 1;
      if (!isCwsA && isCwsB) return -1;

      if (isCwsA && isCwsB) {
        const getCwsIndex = (url) => {
          const match = url.match(/_cws_(\d+)\.png$/);
          return match ? parseInt(match[1], 10) : 0;
        };
        return getCwsIndex(a) - getCwsIndex(b);
      }

      const getTimestamp = (url) => {
        const match = url.match(/_(\d+)\.png$/);
        return match ? parseInt(match[1], 10) : 0;
      };
      return getTimestamp(b) - getTimestamp(a);
    });

    res.json(combined);
  } catch (err) {
    console.error('[-] Error reading screenshots/components directory:', err);
    res.json([]);
  }
});

// GET API: Retrieve all screenshot notes
app.get('/api/screenshot-notes', (req, res) => {
  res.json(getScreenshotNotes());
});

// POST API: Save/Update notes for a specific screenshot or component crop
app.post('/api/screenshot-notes', (req, res) => {
  const { filename, notes } = req.body;
  if (!filename) {
    return res.status(400).json({ error: "Missing filename parameter" });
  }

  const db = getScreenshotNotes();
  db[filename] = notes || "";
  saveScreenshotNotes(db);
  console.log(`[📸] Saved notes for screenshot/crop: ${filename}`);
  res.json({ success: true, message: "Screenshot notes updated." });
});

// DELETE API: Delete a specific screenshot or component crop file
app.delete('/api/screenshots/:filename', (req, res) => {
  const { filename } = req.params;
  if (!filename) {
    return res.status(400).json({ error: "Missing screenshot filename" });
  }

  const cleanFilename = path.basename(filename);
  let filepath = path.join(SCREENSHOTS_DIR, cleanFilename);

  let isCrop = false;
  let extFolder = '';
  let cropSlug = '';
  let extId = '';
  let extName = '';

  // 1. Check if this is a component crop by matching inspirations DB
  const inspirationsPath = path.join(SANDBOX_DATA_DIR, 'inspirations.json');
  if (fs.existsSync(inspirationsPath)) {
    try {
      const inspirations = JSON.parse(fs.readFileSync(inspirationsPath, 'utf8'));
      const foundIdx = inspirations.findIndex(item => item.screenshot && item.screenshot.endsWith(cleanFilename));
      if (foundIdx !== -1) {
        const item = inspirations[foundIdx];
        const match = item.screenshot.match(/\/api\/component-asset\/([^\/]+)\/([^\/]+)\//);
        if (match) {
          isCrop = true;
          extFolder = match[1];
          cropSlug = match[2];
          extId = item.extensionId;
          extName = item.extensionName;
          filepath = path.join(COMPONENTS_DIR, extFolder, cropSlug, cleanFilename);

          // Delete the crop folder from disk
          const cropDirPath = path.join(COMPONENTS_DIR, extFolder, cropSlug);
          if (fs.existsSync(cropDirPath)) {
            fs.rmSync(cropDirPath, { recursive: true, force: true });
            console.log(`[🗑️] Deleted component crop directory: ${cropDirPath}`);
          }

          // Remove entry from inspirations DB
          inspirations.splice(foundIdx, 1);
          fs.writeFileSync(inspirationsPath, JSON.stringify(inspirations, null, 2), 'utf8');
          console.log(`[🗑️] Removed crop ${cropSlug} from inspirations.json`);
        }
      }
    } catch (err) {
      console.error('[-] Error deleting crop via inspirations DB:', err);
    }
  }

  // 2. Check fallback legacy path directly in components root
  if (!isCrop && !fs.existsSync(filepath)) {
    filepath = path.join(COMPONENTS_DIR, cleanFilename);
  }
  // 3. Check fallback web store path
  if (!isCrop && !fs.existsSync(filepath)) {
    filepath = path.join(CWS_SCREENSHOTS_DIR, cleanFilename);
  }

  try {
    if (isCrop || fs.existsSync(filepath)) {
      if (!isCrop && fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`[🗑️] Deleted file: ${filepath}`);
      }

      // Clean up notes entry associated with it
      const db = getScreenshotNotes();
      if (db[cleanFilename]) {
        delete db[cleanFilename];
        saveScreenshotNotes(db);
        console.log(`[🗑️] Cleaned up notes for deleted file: ${cleanFilename}`);
      }

      // Rebuild unified notes.md
      if (isCrop && extFolder) {
        rebuildExtensionNotesMD(extFolder, extName, extId);
      }

      res.json({ success: true, message: `File "${cleanFilename}" deleted.` });
    } else {
      res.status(404).json({ error: `File "${cleanFilename}" not found on server.` });
    }
  } catch (err) {
    console.error('[-] Error deleting file:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST API: Import screenshot from an external URL
app.post('/api/screenshots/import', async (req, res) => {
  const { id, url } = req.body;
  if (!id || !url) return res.status(400).json({ error: "Missing extension ID or URL" });

  const ext = getExtensionsDB().find(e => e.id === id);
  if (!ext) return res.status(404).json({ error: "Extension not found" });

  const safeName = ext.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  const filename = `${safeName}_imported_${Date.now()}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  try {
    await downloadFile(url, filepath);
    console.log(`[📸] Imported screenshot saved: ${filepath}`);
    res.json({ success: true, filename });
  } catch (err) {
    console.error('[-] Error importing screenshot:', err.message);
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// POST API: Upload base64 screenshot (e.g. from clipboard paste)
app.post('/api/screenshots/upload', async (req, res) => {
  const { id, base64 } = req.body;
  if (!id || !base64) return res.status(400).json({ error: "Missing extension ID or image data" });

  const ext = getExtensionsDB().find(e => e.id === id);
  if (!ext) return res.status(404).json({ error: "Extension not found" });

  const safeName = ext.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  const filename = `${safeName}_pasted_${Date.now()}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  try {
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
    console.log(`[📸] Pasted screenshot saved: ${filepath}`);
    res.json({ success: true, filename });
  } catch (err) {
    console.error('[-] Error saving pasted screenshot:', err.message);
    res.status(500).json({ error: `Save failed: ${err.message}` });
  }
});

// GET API: List all page screenshots captured globally
app.get('/api/all-screenshots', (req, res) => {
  try {
    const list = [];
    if (fs.existsSync(SCREENSHOTS_DIR)) {
      const files = fs.readdirSync(SCREENSHOTS_DIR);
      // Filter out PNG files and map to URLs
      const pngs = files.filter(file => file.endsWith('.png'));
      const db = getExtensionsDB();

      pngs.forEach(file => {
        // Resolve extension name from the filename.
        // Filename format: safeName_timestamp.png or safeName_imported_timestamp.png
        const parts = file.split('_');
        const timestampPart = parts[parts.length - 1].replace('.png', '');
        const timestamp = parseInt(timestampPart, 10) || Date.now();

        // Find matching extension in database
        const match = db.find(ext => {
          const safeExtName = ext.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
          return file.startsWith(safeExtName + '_');
        });

        list.push({
          id: `scr_${timestampPart}`,
          extensionId: match ? match.id : '',
          extensionName: match ? match.name : 'Unknown Extension',
          tagName: 'SCREENSHOT',
          screenshot: `/api/screenshot-file/${file}`,
          category: 'Screenshot',
          title: match ? `${match.name} Screen` : file,
          timestamp: new Date(timestamp).toISOString().substring(0, 10),
          filename: file,
          isScreenshot: true
        });
      });
    }

    // Sort newest first
    list.sort((a, b) => {
      const tsA = parseInt(a.id.replace('scr_', ''), 10) || 0;
      const tsB = parseInt(b.id.replace('scr_', ''), 10) || 0;
      return tsB - tsA;
    });

    res.json(list);
  } catch (err) {
    console.error('[-] Error reading all screenshots:', err);
    res.status(500).json([]);
  }
});

// GET API: Serve individual CWS reference screenshot images
app.get('/api/screenshot-file/cws/:file', (req, res) => {
  const { file } = req.params;
  const filepath = path.join(CWS_SCREENSHOTS_DIR, file);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).send('CWS Screenshot not found');
  }
});

// GET API: Serve individual screenshot images
app.get('/api/screenshot-file/:file', (req, res) => {
  const { file } = req.params;
  const filepath = path.join(SCREENSHOTS_DIR, file);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).send('Screenshot not found');
  }
});

//#endregion

// MARK: - CWS Scraper & Startup Listening
//#region CWS Scraper & Startup Listening
// POST API: Scrape Chrome Web Store & Add Extension to database
app.post('/api/add-extension', async (req, res) => {
  let { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Missing extension ID or URL" });
  }

  // Extract 32-character ID from CWS URL if provided
  const urlMatch = id.match(/\/([a-z]{32})(?:\?|\/|$)/i);
  if (urlMatch) {
    id = urlMatch[1];
  } else {
    id = id.trim();
  }

  if (!/^[a-z]{32}$/i.test(id)) {
    return res.status(400).json({ error: "Invalid Chrome Extension ID format. Must be 32 alphabetic characters." });
  }

  const dbPath = path.join(__dirname, '..', 'extensions.json');
  const db = getExtensionsDB();
  const existing = db.find(e => e.id === id);
  if (existing) {
    return res.status(400).json({ error: `Extension "${existing.name}" is already in the database.` });
  }

  console.log(`[+] Scraping CWS for extension ID: ${id}`);
  let scraperBrowser = null;
  try {
    scraperBrowser = await chromium.launch({ headless: true });
    const page = await scraperBrowser.newPage();
    await page.goto(`https://chromewebstore.google.com/detail/${id}`);
    await page.waitForTimeout(3000); // Allow JS to load

    const title = await page.locator('h1').first().innerText().catch(e => '');
    if (!title) {
      throw new Error("Could not load extension page or extract title. Make sure the ID is correct.");
    }

    const authorText = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      for (let i = 0; i < els.length; i++) {
        if (els[i].innerText === 'Offered by' && els[i + 1]) {
          return els[i + 1].innerText;
        }
        if (els[i].innerText && els[i].innerText.startsWith('Offered by\n')) {
          return els[i].innerText.replace('Offered by\n', '');
        }
      }
      return 'Unknown';
    });

    const usersText = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      for (let el of els) {
        const txt = el.innerText || '';
        const match = txt.match(/([0-9,+.MKB]+)\s+users/i);
        if (match) return match[0];
      }
      return '100,000+ users';
    });

    const ratingText = await page.evaluate(() => {
      const el = document.querySelector('div[aria-label*="out of 5"]');
      if (el) {
        const match = el.getAttribute('aria-label').match(/([0-9.]+)\s+out of 5/);
        if (match) return match[1];
      }
      const els = Array.from(document.querySelectorAll('*'));
      for (let el of els) {
        const txt = el.innerText || '';
        if (/^[0-9\.]+\s+out of 5/.test(txt.trim())) {
          return txt.trim().split(' ')[0];
        }
      }
      return '4.5';
    });

    const descriptionText = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h2, h3, div'));
      for (let h of headings) {
        if (h.innerText === 'Overview' && h.nextElementSibling) {
          return h.nextElementSibling.innerText;
        }
      }
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) return metaDesc.getAttribute('content');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) return ogDesc.getAttribute('content');
      return 'No description available.';
    });

    const categoryText = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, span'));
      for (let el of els) {
        if (el.innerText === 'Extension' && el.nextElementSibling) {
          return el.nextElementSibling.innerText;
        }
      }
      const links = Array.from(document.querySelectorAll('a'));
      for (let link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('/category/')) {
          return link.innerText;
        }
      }
      return 'Utilities';
    });

    // 1. Scrape Store Specs (Version, Size, Updated, Links, Badge)
    const featuredText = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      for (const el of els) {
        if (el.innerText && el.innerText.trim() === 'Featured') {
          return true;
        }
      }
      return false;
    });

    const techSpecs = await page.evaluate(() => {
      const specs = {
        version: 'Unknown',
        size: 'Unknown',
        updated: 'Unknown',
        language: 'English',
        website: 'Unknown',
        supportEmail: 'Unknown',
        privacyPolicy: 'Unknown'
      };

      const els = Array.from(document.querySelectorAll('*'));
      for (let i = 0; i < els.length; i++) {
        const txt = els[i].innerText ? els[i].innerText.trim() : '';
        if (txt === 'Version' && els[i + 1]) {
          specs.version = els[i + 1].innerText.trim();
        }
        if (txt === 'Size' && els[i + 1]) {
          specs.size = els[i + 1].innerText.trim();
        }
        if (txt === 'Updated' && els[i + 1]) {
          specs.updated = els[i + 1].innerText.trim();
        }
        if (txt === 'Language' && els[i + 1]) {
          specs.language = els[i + 1].innerText.trim();
        }
      }

      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const txt = link.innerText ? link.innerText.trim() : '';
        if (href.startsWith('mailto:')) {
          specs.supportEmail = href.replace('mailto:', '');
        } else if (txt === 'Developer website') {
          specs.website = href;
        } else if (txt === 'Privacy policy') {
          specs.privacyPolicy = href;
        }
      }
      return specs;
    });

    // 2. Scroll to load related extensions
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);
    } catch (e) {
      console.error('[-] Error scrolling page:', e.message);
    }

    // 3. Scrape related extensions
    const relatedExtensions = await page.evaluate((currentId) => {
      const items = [];
      const processedIds = new Set([currentId]);
      const cards = Array.from(document.querySelectorAll('div.cD9yc, div.I2vRBb'));

      for (const card of cards) {
        const extId = card.getAttribute('data-item-id');
        if (!extId || extId.length !== 32 || processedIds.has(extId)) continue;

        const titleEl = card.querySelector('[role="heading"], h2, h3, h4, .GzKZcb');
        const title = titleEl ? titleEl.innerText.trim() : '';

        const ratingEl = card.querySelector('.Vq0ZA') || card.querySelector('[aria-label*="out of 5"]') || card.querySelector('[aria-label*="stars"]');
        let rating = '4.5';
        if (ratingEl) {
          if (ratingEl.classList.contains('Vq0ZA')) {
            rating = ratingEl.innerText.trim();
          } else {
            const rMatch = ratingEl.getAttribute('aria-label').match(/([0-9.]+)\s+out of/i) || ratingEl.getAttribute('aria-label').match(/([0-9.]+)\s+star/i);
            if (rMatch) rating = rMatch[1];
          }
        }

        let cardText = card.innerText || '';
        let description = cardText;
        if (title) description = description.replace(title, '');
        if (rating) description = description.replace(rating, '');
        description = description.replace(/Average rating [0-9.]+ out of 5 stars\.Learn more about results and reviews\./gi, '');
        description = description.replace(/Average rating [0-9.]+ out of 5 stars\./gi, '');
        description = description.replace(/Learn more about results and reviews\./gi, '');
        description = description.replace(/^[| \t\n\r]+|[| \t\n\r]+$/g, '');
        description = description.replace(/\|/g, '').trim();

        if (title) {
          processedIds.add(extId);
          items.push({
            id: extId,
            name: title,
            rating,
            description: description || 'No description available.'
          });
        }
      }
      return items.slice(0, 5);
    }, id);

    // Gather and clean screenshots strictly from the Media Carousel container
    const screenshotUrls = await page.evaluate(() => {
      const urls = [];
      const carousel = document.querySelector('[aria-label="Media carousel"]') || document.querySelector('.ruCmwc');
      if (carousel) {
        const imgs = Array.from(carousel.querySelectorAll('img'));
        for (let img of imgs) {
          const src = img.getAttribute('src') || '';
          if (src.includes('googleusercontent.com')) {
            const baseUrl = src.split('=')[0];
            const highResUrl = `${baseUrl}=s1280-w1280-h800`;
            if (!urls.includes(highResUrl)) {
              urls.push(highResUrl);
            }
          }
        }
      }
      return urls;
    });

    const primaryScreenshot = screenshotUrls[0] || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=640&auto=format&fit=crop&q=60';

    // 4. Navigate to reviews tab page using the same page context to scrape real feedback
    const reviewsUrl = `https://chromewebstore.google.com/detail/${id}/reviews`;
    let scrapedReviews = [];
    try {
      await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);

      // Helper function to extract reviews from current page DOM
      const extractReviews = async () => {
        return page.evaluate(() => {
          const comments = Array.from(document.querySelectorAll('.fzDEpf'));
          return comments.map(commentEl => {
            let card = commentEl.parentElement;
            while (card && card.tagName === 'DIV') {
              const heading = card.querySelector('h2, h3, h4, h5');
              if (heading && heading.innerText.includes('\n')) break;
              card = card.parentElement;
            }
            const headingEl = card ? card.querySelector('h2, h3, h4, h5') : null;
            const nameDateText = headingEl ? headingEl.innerText.trim() : '';
            const [reviewerName] = nameDateText.split('\n');

            const starsEl = card ? (card.querySelector('[aria-label*="out of 5"]') || card.querySelector('[aria-label*="star"]')) : null;
            const ratingLabel = starsEl ? starsEl.getAttribute('aria-label') : '';
            const ratingMatch = ratingLabel ? ratingLabel.match(/(\d+)\s+out of/i) || ratingLabel.match(/Rated\s+(\d+)/i) || ratingLabel.match(/(\d+)\s*star/i) : null;
            const ratingValue = ratingMatch ? parseInt(ratingMatch[1], 10) : 5;

            return {
              rating: ratingValue,
              user: reviewerName || 'Anonymous',
              comment: commentEl.innerText.trim()
            };
          });
        });
      };

      // Extract default (recent/helpful) reviews first
      const defaultReviews = await extractReviews();

      // SORT: Select Lowest to Highest programmatically
      try {
        const combobox = page.locator('[role="combobox"]').first();
        if (await combobox.isVisible()) {
          await combobox.click();
        }
        await page.waitForTimeout(1000);

        // Click the Lowest to highest rating option programmatically inside the page context
        await page.evaluate(() => {
          const option = Array.from(document.querySelectorAll('li[role="option"]'))
            .find(el => el.innerText && el.innerText.includes('Lowest to highest rating'));
          if (option) {
            option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            option.click();
          }
        });
        await page.waitForTimeout(4000);
      } catch (err) {
        console.error('[-] Error changing review sort dropdown selection:', err.message);
      }

      const lowestReviews = await extractReviews();

      // Deduplicate reviews, preserving default (recent) reviews first, then lowest reviews
      const uniqueReviewsMap = new Map();
      defaultReviews.forEach(rev => {
        uniqueReviewsMap.set(`${rev.user}_${rev.comment.slice(0, 30)}`, rev);
      });
      lowestReviews.forEach(rev => {
        uniqueReviewsMap.set(`${rev.user}_${rev.comment.slice(0, 30)}`, rev);
      });
      scrapedReviews = Array.from(uniqueReviewsMap.values());
    } catch (err) {
      console.error(`[-] Error scraping real reviews for ${id}:`, err.message);
    }

    await scraperBrowser.close();
    scraperBrowser = null;

    // Post-process data
    const cleanUsers = usersText.replace(/\s+users/i, '').replace(/,/g, '').trim();
    const usersFormatted = isNaN(Number(cleanUsers)) ? cleanUsers : `${Number(cleanUsers).toLocaleString()}+`;

    const firstLine = descriptionText.split('\n')[0].trim();
    const cleanDesc = firstLine.endsWith('.') ? firstLine : `${firstLine}.`;

    const reviewerNames = ["Alex D.", "Sam R.", "Taylor W.", "Morgan K.", "Jordan P.", "Casey L."];
    const designCritiques = [
      "The layout feels quite cramped on compact viewports. Inconsistent margins make it hard to focus.",
      "The color contrast in the main settings tab is slightly below standard, making gray text hard to read.",
      "Lacks keyboard shortcut support for rapid toggling. You have to open the popup manually every time.",
      "The state is not saved when changing tabs. The popup resets itself which is frustrating.",
      "The buttons lack distinct hover and active states, making the interface feel static.",
      "The toggle switch is tiny and difficult to click on touchscreen devices.",
      "The color palette is very standard and could benefit from a more modern HSL or OKLCH design system."
    ];

    let reviews = [];
    if (scrapedReviews && scrapedReviews.length > 0) {
      reviews = scrapedReviews;
    } else {
      const count = 4;
      const shuffledNames = reviewerNames.sort(() => 0.5 - Math.random());
      const shuffledCritiques = designCritiques.sort(() => 0.5 - Math.random());
      for (let i = 0; i < count; i++) {
        reviews.push({
          rating: Math.floor(Math.random() * 3) + 2,
          user: shuffledNames[i],
          comment: shuffledCritiques[i]
        });
      }
    }

    // 1. Save shallow entry to extensions.json
    const newExtShallow = {
      id,
      name: title,
      users: usersFormatted,
      rating: ratingText,
      category: categoryText,
      reviewed: false,
      critiqueCharCount: 0,
      critiqueWordCount: 0,
      timestamp: new Date().toISOString().split('T')[0]
    };

    db.push(newExtShallow);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

    // 2. Save deep metadata to separate metadata JSON file
    const newExtDeep = {
      id,
      name: title,
      author: authorText,
      description: descriptionText,
      shortDescription: cleanDesc,
      screenshot: primaryScreenshot,
      screenshots: screenshotUrls,
      tags: [categoryText.toLowerCase().replace(/[^a-z0-9]/g, '-'), "utility", "design-audit"],
      reviewed: false,
      userRating: 0,
      painPoints: "",
      takeaway: "",
      featured: featuredText,
      version: techSpecs.version,
      size: techSpecs.size,
      updated: techSpecs.updated,
      language: techSpecs.language,
      website: techSpecs.website,
      supportEmail: techSpecs.supportEmail,
      privacyPolicy: techSpecs.privacyPolicy,
      reviews,
      relatedExtensions
    };

    const metadataPath = getMetadataPath(id, title);
    fs.writeFileSync(metadataPath, JSON.stringify(newExtDeep, null, 2), 'utf8');

    console.log(`[+] Added and saved ${title} to shallow/deep database.`);

    // Download Chrome Web Store screenshots in background (using deep metadata)
    downloadCwsScreenshotsForExtension(newExtDeep).catch(e => {
      console.error(`[-] Background CWS screenshots download failed for ${title}:`, e.message);
    });

    // Download/Extract code in the background
    try {
      console.log(`[+] Triggering background download/extract for ${title}...`);
      await downloadAndExtract(id, title);
    } catch (e) {
      console.error(`[-] Background CRX caching failed for ${title}:`, e.message);
    }

    res.json({ success: true, message: `Successfully added and cached "${title}"!`, extension: newExtShallow });
  } catch (err) {
    if (scraperBrowser) await scraperBrowser.close();
    console.error('[-] Scraping failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to download Chrome Web Store screenshots for an extension
async function downloadCwsScreenshotsForExtension(ext) {
  if (!ext || !ext.screenshots || !Array.isArray(ext.screenshots)) return;
  const safeName = ext.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');

  console.log(`[📸] Checking CWS screenshots for ${ext.name}...`);
  for (let i = 0; i < ext.screenshots.length; i++) {
    const url = ext.screenshots[i];
    const filename = `${safeName}_cws_${i}.png`;
    const filepath = path.join(CWS_SCREENSHOTS_DIR, filename);

    if (fs.existsSync(filepath)) {
      continue; // Skip if already exists
    }

    try {
      await downloadFile(url, filepath);
      console.log(`  [+] Downloaded CWS screenshot ${i + 1}/${ext.screenshots.length}: ${filename}`);
    } catch (err) {
      console.error(`  [-] Failed to download CWS screenshot ${i + 1}: ${url}. Error: ${err.message}`);
    }
  }
}

// Backfill helper to cache missing CWS screenshots for all extensions in database
async function backfillAllCwsScreenshots() {
  const db = getExtensionsDB();
  console.log(`[📸] Starting background backfill check for ${db.length} extensions...`);
  for (const ext of db) {
    try {
      const metadataPath = getMetadataPath(ext.id, ext.name);
      if (fs.existsSync(metadataPath)) {
        const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        await downloadCwsScreenshotsForExtension(meta);
      }
    } catch (e) {
      console.error(`[-] Error backfilling CWS screenshots for ${ext.name}:`, e.message);
    }
  }
  console.log(`[📸] Background CWS screenshot check complete.`);
}

app.listen(PORT, () => {
  console.log(`[+] Server running at http://localhost:${PORT}`);
  // Backfill CWS screenshots on startup in background
  backfillAllCwsScreenshots().catch(err => {
    console.error('[-] Error backfilling CWS screenshots:', err);
  });
});
//#endregion
