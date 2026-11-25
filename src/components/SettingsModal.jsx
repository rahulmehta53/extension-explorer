import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconSettings,
  IconPlus,
  IconDownload,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

/* ─── tiny sub-components ──────────────────────────────────────────────── */

/** A labelled section block in settings content panel */
function Section({ title, children }) {
  return (
    <div className="cen-section">
      <div className="cen-section-header">{title}</div>
      <div className="cen-section-body">{children}</div>
    </div>
  );
}

/** A single option row with layout supporting inline options on the right */
function OptionRow({ label, description, children }) {
  return (
    <div className="cen-option-row">
      <div className="cen-option-left">
        <span className="cen-option-label">{label}</span>
        {description && (
          <span className="cen-option-desc">{description}</span>
        )}
      </div>
      {children && <div className="cen-option-right">{children}</div>}
    </div>
  );
}

/** Inline select buttons grouped into rows separated by vertical dividers */
function InlineSelect({ rows, value, onChange }) {
  // Normalize single-dimension array to a 2D array of a single row
  const normalRows = Array.isArray(rows[0]) ? rows : [rows];

  return (
    <div className="cen-options-list">
      {normalRows.map((row, rIdx) => (
        <div key={rIdx} className="cen-options-row">
          {row.map((opt, i) => (
            <React.Fragment key={opt.value}>
              {i > 0 && <span className="cen-options-divider">|</span>}
              <button
                type="button"
                onClick={() => onChange(opt.value)}
                className={`cen-options-btn ${value === opt.value ? "active" : ""}`}
              >
                {opt.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── nav config ─────────────────────────────────────────────────────────── */
const NAV = [
  { id: "general", label: "General",       Icon: IconSettings },
  { id: "add",     label: "Add Items",     Icon: IconPlus     },
  { id: "cache",   label: "Offline Cache", Icon: IconDownload },
];

export default function SettingsModal({
  show,
  onClose,
  screenshotMode,
  setScreenshotMode,
  editorChoice,
  setEditorChoice,
  customEditorCommand,
  setCustomEditorCommand,
  activeSettingsTab,
  setActiveSettingsTab,
  newExtensionId,
  setNewExtensionId,
  handleAddExtension,
  isAddingExtension,
  cachingStatus,
  handleCacheAll,
  isBatching,
  batchProgress,
  batchLogs,
  showConsolePopover,
  setShowConsolePopover,
}) {
  if (!show) return null;

  const canClose = !isAddingExtension && cachingStatus !== "caching";

  return (
    <>
      {/* ── scoped styles ── */}
      <style>{`
        .cen-overlay {
          position: fixed; inset: 0; z-index: 50;
          display: flex; align-items: center; justify-content: center;
          background: rgba(24,24,27,0.5);
          backdrop-filter: blur(6px);
          padding: 16px;
        }
        .cen-shell {
          width: 100%; max-width: 680px;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.07);
          overflow: hidden;
          display: flex;
          height: 520px;
        }
        /* LEFT NAV */
        .cen-nav {
          width: 192px; min-width: 192px;
          background: #f8f8f7;
          border-right: 1px solid #ebebeb;
          display: flex; flex-direction: column;
          padding: 22px 0 16px;
          overflow-y: auto;
        }
        .cen-nav-heading {
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.08em; color: #a1a1aa;
          text-transform: uppercase;
          padding: 0 16px 12px;
        }
        .cen-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 16px;
          font-size: 13px; font-weight: 500; color: #52525b;
          cursor: pointer;
          transition: background 0.1s, color 0.1s;
          border: none; background: none;
          text-align: left; width: 100%;
          user-select: none;
        }
        .cen-nav-item:hover { background: rgba(0,0,0,0.04); color: #18181b; }
        .cen-nav-item.active { background: rgba(0,0,0,0.06); color: #18181b; font-weight: 600; }
        .cen-nav-item svg { flex-shrink: 0; opacity: 0.5; }
        .cen-nav-item.active svg { opacity: 0.8; }
        .cen-nav-spacer { flex: 1; }
        /* RIGHT CONTENT */
        .cen-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .cen-content-header {
          padding: 22px 24px 14px;
          border-bottom: 1px solid #f0f0f0;
          flex-shrink: 0;
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 12px;
        }
        .cen-content-title { font-size: 16px; font-weight: 700; color: #18181b; line-height: 1.2; }
        .cen-content-desc { font-size: 11.5px; color: #71717a; margin-top: 3px; }
        .cen-close-btn {
          flex-shrink: 0; width: 28px; height: 28px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          border: none; background: none; color: #a1a1aa;
          cursor: pointer; transition: background 0.12s, color 0.12s; margin-top: -2px;
        }
        .cen-close-btn:hover { background: #f4f4f5; color: #3f3f46; }
        .cen-close-btn:disabled { opacity: 0.3; pointer-events: none; }
        .cen-content-body { flex: 1; overflow-y: auto; padding: 8px 0 24px; }
        /* SECTION */
        .cen-section { padding: 0 0 4px; }
        .cen-section-header {
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: #a1a1aa; padding: 14px 24px 6px;
        }
        /* OPTION ROW */
        .cen-option-row {
          display: flex; align-items: center;
          justify-content: space-between;
          gap: 16px; padding: 12px 24px;
          transition: background 0.1s; min-height: 52px;
        }
        .cen-option-left { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .cen-option-label { font-size: 13px; font-weight: 500; color: #27272a; line-height: 1.3; }
        .cen-option-desc { font-size: 11px; color: #71717a; line-height: 1.4; }
        .cen-option-right { flex-shrink: 0; }
        /* INLINE SELECT LIST */
        .cen-options-list {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }
        .cen-options-row {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: flex-end;
        }
        .cen-options-divider {
          color: #d4d4d8;
          font-size: 11px;
          user-select: none;
        }
        .cen-options-btn {
          border: none;
          background: none;
          padding: 0;
          margin: 0;
          font-size: 12px;
          color: #a1a1aa;
          cursor: pointer;
          transition: color 0.12s, font-weight 0.12s;
          font-weight: 500;
        }
        .cen-options-btn:hover {
          color: #52525b;
        }
        .cen-options-btn.active {
          color: #18181b;
          font-weight: 700;
        }
        /* DIVIDER */
        .cen-divider { height: 1px; background: #f4f4f5; margin: 4px 0; }
        /* textarea / input */
        .cen-textarea {
          width: 100%; padding: 10px 12px;
          font-size: 11.5px; font-family: ui-monospace, monospace;
          border: 1px solid #e4e4e7; border-radius: 10px;
          background: #fafafa; resize: none; outline: none;
          transition: border-color 0.15s, background 0.15s;
          line-height: 1.6; color: #27272a;
        }
        .cen-textarea:focus { border-color: #a1a1aa; background: #fff; }
        .cen-textarea:disabled { opacity: 0.5; }
        .cen-input {
          width: 100%; padding: 8px 12px;
          font-size: 11.5px; font-family: ui-monospace, monospace;
          border: 1px solid #e4e4e7; border-radius: 10px;
          background: #fafafa; outline: none;
          transition: border-color 0.15s, background 0.15s; color: #27272a;
        }
        .cen-input:focus { border-color: #a1a1aa; background: #fff; }
        /* primary button */
        .cen-btn-primary {
          padding: 7px 18px; background: #18181b; color: #fff;
          font-size: 12px; font-weight: 600; border-radius: 9px;
          border: none; cursor: pointer; transition: background 0.12s;
        }
        .cen-btn-primary:hover { background: #000; }
        .cen-btn-primary:disabled { opacity: 0.35; pointer-events: none; }
        /* status */
        .cen-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; font-family: ui-monospace, monospace; }
        .cen-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
        /* console */
        .cen-console {
          padding: 10px 12px; border: 1px solid #e4e4e7;
          border-radius: 10px; background: #fafafa;
          font-size: 10.5px; font-family: ui-monospace, monospace;
          max-height: 120px; overflow-y: auto; color: #52525b; line-height: 1.7;
        }
        /* scrollbars */
        .cen-content-body::-webkit-scrollbar,
        .cen-nav::-webkit-scrollbar,
        .cen-console::-webkit-scrollbar { width: 4px; }
        .cen-content-body::-webkit-scrollbar-thumb,
        .cen-nav::-webkit-scrollbar-thumb,
        .cen-console::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 4px; }
        /* custom input expand area */
        .cen-custom-expand { overflow: hidden; padding: 0 24px; }
        .cen-custom-inner { padding: 6px 0 12px; }
        .cen-custom-label { font-size: 10px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; display: block; }
        .cen-custom-hint { font-size: 10px; color: #a1a1aa; margin-top: 5px; line-height: 1.5; }
      `}</style>

      {/* ── overlay ── */}
      <div
        className="cen-overlay"
        onClick={(e) => { if (e.target === e.currentTarget && canClose) onClose(); }}
      >
        <motion.div
          className="cen-shell"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* ── LEFT NAV ── */}
          <nav className="cen-nav">
            <span className="cen-nav-heading">Settings</span>
            {NAV.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`cen-nav-item${activeSettingsTab === id ? " active" : ""}`}
                onClick={() => setActiveSettingsTab(id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
            <div className="cen-nav-spacer" />
          </nav>

          {/* ── RIGHT CONTENT ── */}
          <div className="cen-content">
            <AnimatePresence mode="wait">

              {/* ── GENERAL ── */}
              {activeSettingsTab === "general" && (
                <motion.div key="general" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.13 }} style={{ display: "contents" }}>
                  <div className="cen-content-header">
                    <div>
                      <div className="cen-content-title">General</div>
                      <div className="cen-content-desc">Editor and capture settings</div>
                    </div>
                    <button className="cen-close-btn" onClick={onClose} disabled={!canClose} title="Close settings"><IconX size={15} /></button>
                  </div>
                  <div className="cen-content-body">

                    <Section title="Screenshot Target">
                      <OptionRow
                        label="Screenshot Target"
                        description="Target tab context for sandbox captures"
                      >
                        <InlineSelect
                          rows={[
                            { value: "focused", label: "Focused" },
                            { value: "initial", label: "Initial" },
                            { value: "last",    label: "Last" },
                          ]}
                          value={screenshotMode}
                          onChange={(val) => { setScreenshotMode(val); localStorage.setItem("screenshotMode", val); }}
                        />
                      </OptionRow>
                    </Section>

                    <div className="cen-divider" />

                    <Section title="Workspace Editor">
                      <OptionRow
                        label="Workspace Editor"
                        description="Auditing editor for unpacked codebases"
                      >
                        <InlineSelect
                          rows={[
                            [
                              { value: "vscode",      label: "VS Code" },
                              { value: "cursor",      label: "Cursor" },
                              { value: "windsurf",    label: "Windsurf" },
                            ],
                            [
                              { value: "antigravity", label: "Antigravity" },
                              { value: "custom",      label: "Custom" },
                            ]
                          ]}
                          value={editorChoice}
                          onChange={(val) => { setEditorChoice(val); localStorage.setItem("editorChoice", val); }}
                        />
                      </OptionRow>

                      <AnimatePresence>
                        {editorChoice === "custom" && (
                          <motion.div
                            className="cen-custom-expand"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.16 }}
                          >
                            <div className="cen-custom-inner">
                              <span className="cen-custom-label">Custom executable or PATH command</span>
                              <input
                                className="cen-input"
                                type="text"
                                value={customEditorCommand}
                                onChange={(e) => { setCustomEditorCommand(e.target.value); localStorage.setItem("customEditorCommand", e.target.value); }}
                                placeholder="e.g. cursor, subl, edit"
                              />
                              <span className="cen-custom-hint">Enter the terminal shortcut or executable available in your system PATH.</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Section>

                  </div>
                </motion.div>
              )}

              {/* ── ADD ITEMS ── */}
              {activeSettingsTab === "add" && (
                <motion.div key="add" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.13 }} style={{ display: "contents" }}>
                  <div className="cen-content-header">
                    <div>
                      <div className="cen-content-title">Add Items</div>
                      <div className="cen-content-desc">Import extensions from the Chrome Web Store</div>
                    </div>
                    <button className="cen-close-btn" onClick={onClose} disabled={!canClose} title="Close settings"><IconX size={15} /></button>
                  </div>
                  <div className="cen-content-body">
                    <Section title="Chrome Web Store Import">
                      <div style={{ padding: "4px 24px 0" }}>
                        <p style={{ fontSize: 11.5, color: "#71717a", lineHeight: 1.6, marginBottom: 14 }}>
                          Paste a 32-character CWS ID, a full store URL, or multiple IDs (one per line) for batch import.
                        </p>
                        <form onSubmit={handleAddExtension} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <textarea
                            className="cen-textarea"
                            rows={5}
                            value={newExtensionId}
                            onChange={(e) => setNewExtensionId(e.target.value)}
                            placeholder={"Example ID: nhkmbcjgchggphoccdggidbeadgkkkcd\nOr paste full details URL..."}
                            disabled={isAddingExtension || isBatching}
                          />
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: 10.5, fontFamily: "ui-monospace, monospace", color: "#2563eb" }}>
                              {isAddingExtension && <span>Importing details...</span>}
                              {isBatching && batchProgress && (
                                <span>Batch: {batchProgress.current} / {batchProgress.total}</span>
                              )}
                            </div>
                            <button type="submit" className="cen-btn-primary" disabled={isAddingExtension || isBatching || !newExtensionId.trim()}>
                              {isAddingExtension || isBatching ? "Importing..." : "Add to Feed"}
                            </button>
                          </div>
                        </form>
                      </div>
                    </Section>

                    {(isBatching || batchLogs.length > 0) && (
                      <>
                        <div className="cen-divider" />
                        <Section title="Import Console">
                          <div style={{ padding: "0 24px" }}>
                            <div className="cen-console">
                              {batchLogs.length === 0
                                ? <span style={{ color: "#a1a1aa" }}>Waiting for import logs...</span>
                                : batchLogs.map((log, i) => (
                                  <div key={i} style={{ borderBottom: "1px solid #f0f0f0", paddingBottom: 3, marginBottom: 3 }}>{log}</div>
                                ))
                              }
                            </div>
                          </div>
                        </Section>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── OFFLINE CACHE ── */}
              {activeSettingsTab === "cache" && (
                <motion.div key="cache" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.13 }} style={{ display: "contents" }}>
                  <div className="cen-content-header">
                    <div>
                      <div className="cen-content-title">Offline Cache</div>
                      <div className="cen-content-desc">Download CRX assets locally for instant sandbox boots</div>
                    </div>
                    <button className="cen-close-btn" onClick={onClose} disabled={!canClose} title="Close settings"><IconX size={15} /></button>
                  </div>
                  <div className="cen-content-body">

                    <Section title="CRX Download Queue">
                      <div style={{ padding: "4px 24px 0" }}>
                        <p style={{ fontSize: 11.5, color: "#71717a", lineHeight: 1.6, marginBottom: 16 }}>
                          Download and extract source CRX codebases for all feed extensions. Once cached, sandbox browsers boot instantly without network fetches.
                        </p>
                      </div>

                      <OptionRow label="Queue Status" description="State of background cache runner">
                        <span className="cen-status">
                          <span
                            className="cen-status-dot"
                            style={{
                              background:
                                cachingStatus === "caching" ? "#2563eb" :
                                cachingStatus === "done"    ? "#059669" :
                                cachingStatus === "error"   ? "#dc2626" : "#a1a1aa",
                            }}
                          />
                          {cachingStatus === "caching" && <span style={{ color: "#2563eb" }}>Fetching...</span>}
                          {cachingStatus === "done"    && <span style={{ color: "#059669" }}>Complete</span>}
                          {cachingStatus === "error"   && <span style={{ color: "#dc2626" }}>Failed</span>}
                          {cachingStatus === "idle"    && <span style={{ color: "#71717a" }}>Idle</span>}
                        </span>
                      </OptionRow>
                    </Section>

                    <div className="cen-divider" />

                    <Section title="Actions">
                      <div style={{ padding: "6px 24px" }}>
                        <button
                          className="cen-btn-primary"
                          onClick={handleCacheAll}
                          disabled={cachingStatus === "caching" || isAddingExtension}
                        >
                          {cachingStatus === "caching" ? "Caching..." : "Cache Entire Feed"}
                        </button>
                        <div style={{ fontSize: 10.5, color: "#a1a1aa", marginTop: 8, lineHeight: 1.5 }}>
                          Downloads and extracts all extension CRX archives to local storage. May take several minutes for large feeds.
                        </div>
                      </div>
                    </Section>

                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </>
  );
}
