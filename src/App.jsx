import React, { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconFileText,
  IconCheck,
  IconAlertTriangle,
  IconRefresh,
} from "@tabler/icons-react";
import ExplorerPage from "./pages/ExplorerPage";
import PhotosPage from "./pages/PhotosPage";
import ShowcasePage from "./pages/ShowcasePage";
import SettingsModal from "./components/SettingsModal";

function App() {
  const [viewMode, setViewMode] = useState("explorer"); // explorer | photos | showcase
  const [extensions, setExtensions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(true);

  // Modal / Settings States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Settings Configuration & Operations
  const [screenshotMode, setScreenshotMode] = useState(
    localStorage.getItem("screenshotMode") || "focused",
  ); // focused | initial | last
  const [editorChoice, setEditorChoice] = useState(
    localStorage.getItem("editorChoice") || "vscode",
  ); // vscode | cursor | windsurf | antigravity | custom
  const [customEditorCommand, setCustomEditorCommand] = useState(
    localStorage.getItem("customEditorCommand") || "code",
  );
  const [activeSettingsTab, setActiveSettingsTab] = useState("general");

  // Scraper / Caching states
  const [newExtensionId, setNewExtensionId] = useState("");
  const [isAddingExtension, setIsAddingExtension] = useState(false);
  const [cachingStatus, setCachingStatus] = useState("idle"); // idle | caching | done | error
  const [batchMode, setBatchMode] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // { current, total, id }
  const [isBatching, setIsBatching] = useState(false);
  const [batchLogs, setBatchLogs] = useState([]);
  const [showConsolePopover, setShowConsolePopover] = useState(false);
  const [batchSummary, setBatchSummary] = useState(null);

  // Showcase state hooks
  const [selectedShowcaseId, setSelectedShowcaseId] = useState("");
  const [createShowcaseFromCrop, setCreateShowcaseFromCrop] = useState(null);

  // Sidebar persistent filters & search query (lifted from ExtensionsSidebar.jsx to prevent unmount reset)
  const [filterMode, setFilterMode] = useState(() => {
    const saved = localStorage.getItem("cen_filter_mode");
    return ["all", "todo", "audited"].includes(saved) ? saved : "all";
  });
  const [sortMode, setSortMode] = useState(() => {
    const saved = localStorage.getItem("cen_sort_mode");
    return ["default", "name", "users", "rating", "critique", "wordCount", "recent"].includes(saved) ? saved : "default";
  });
  const [groupMode, setGroupMode] = useState(() => {
    const saved = localStorage.getItem("cen_group_mode");
    return ["default", "todo", "newest", "both"].includes(saved) ? saved : "default";
  });
  const [searchQuery, setSearchQuery] = useState("");

  const addBatchLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setBatchLogs((prev) => [`[${timestamp}] ${message}`, ...prev]);
  };

  // Scrape and add extension via backend API
  const handleAddExtension = async (e) => {
    if (e) e.preventDefault();
    if (!newExtensionId.trim()) return;

    const matches = newExtensionId.match(/\b[a-p]{32}\b/gi) || [];
    const ids = Array.from(new Set(matches.map((id) => id.toLowerCase())));

    if (ids.length === 0) {
      toast.error("No valid Chrome Extension IDs found in input.");
      return;
    }

    setIsAddingExtension(true);

    if (ids.length > 1) {
      // Background batch execution
      setShowAddModal(false);
      setIsAddingExtension(false);
      setIsBatching(true);
      setBatchLogs([]);
      setBatchSummary(null);
      addBatchLog(
        `Found ${ids.length} extension IDs. Starting background batch import...`,
      );
      toast.info(
        `Starting background batch import of ${ids.length} extensions...`,
      );

      let successes = [];
      let failures = [];
      let skippedCount = 0;

      const currentListRes = await fetch("/api/extensions");
      let currentListData = await currentListRes.json();
      setExtensions(currentListData);
      const initialIds = currentListData.map((e) => e.id);

      const runBatch = async () => {
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          setBatchProgress({ current: i + 1, total: ids.length, id });

          const exists = currentListData.some((ext) => ext.id === id);
          if (exists) {
            skippedCount++;
            addBatchLog(`Skipped ID ${id} (already in feed)`);
            successes.push({
              id,
              name: currentListData.find((e) => e.id === id)?.name || id,
              status: "skipped",
            });
            continue;
          }

          addBatchLog(`Scraping CWS details for ID: ${id}...`);
          try {
            const res = await fetch("/api/add-extension", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              addBatchLog(
                `Successfully scraped & cached: ${data.extension.name}`,
              );
              successes.push({
                id,
                name: data.extension.name,
                status: "imported",
              });

              currentListData = [
                ...currentListData,
                { ...data.extension, cached: true },
              ];
              setExtensions(currentListData);
            } else {
              addBatchLog(
                `Failed scraping ID ${id}: ${data.error || "Server error"}`,
              );
              failures.push({ id, error: data.error || "Server error" });
            }
          } catch (err) {
            addBatchLog(`Network failure scraping ID ${id}`);
            failures.push({ id, error: "Network failure" });
          }
        }

        setIsBatching(false);
        setBatchProgress(null);
        setNewExtensionId("");

        setBatchSummary({ successes, failures, skippedCount });
        setShowSummaryModal(true);
        toast.success(
          `Batch complete! Added ${successes.filter((s) => s.status === "imported").length} extensions, failed ${failures.length}.`,
        );
        addBatchLog(
          `Background batch operation finished. ${successes.length} success, ${failures.length} failed.`,
        );

        const finalRes = await fetch("/api/extensions");
        const finalData = await finalRes.json();
        setExtensions(finalData);

        const newlyAdded = finalData.find((e) => !initialIds.includes(e.id));
        if (newlyAdded) {
          const newIndex = finalData.findIndex((e) => e.id === newlyAdded.id);
          if (newIndex !== -1) {
            selectExtension(newIndex, finalData);
          }
        }
      };

      runBatch();
      return;
    } else {
      // Single extension import
      const id = ids[0];
      toast.info("Scraping Chrome Web Store and caching codebase...");
      try {
        const res = await fetch("/api/add-extension", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          toast.success(data.message || `Added ${data.extension.name}!`);
          setNewExtensionId("");

          const currentListRes = await fetch("/api/extensions");
          const currentListData = await currentListRes.json();
          setExtensions(currentListData);

          const newIndex = currentListData.findIndex(
            (ext) => ext.id === data.extension.id,
          );
          if (newIndex !== -1) {
            selectExtension(newIndex, currentListData);
          }
        } else {
          toast.error(data.error || "Failed to add extension.");
        }
      } catch (err) {
        toast.error("Communication failure with scraping API.");
      }
    }

    setIsAddingExtension(false);
  };

  // Remove an extension from the list and local files
  const handleDeleteExtension = async (id, name, e) => {
    if (e) e.stopPropagation();
    if (
      !confirm(
        `Are you sure you want to remove "${name}" and delete its local cache files?`,
      )
    ) {
      return;
    }

    toast.info(`Removing ${name}...`);
    try {
      const res = await fetch(`/api/extensions/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || `Removed ${name}!`);

        const currentListRes = await fetch("/api/extensions");
        const currentListData = await currentListRes.json();
        setExtensions(currentListData);

        if (currentIndex !== -1 && extensions[currentIndex]?.id === id) {
          setCurrentIndex(-1);
        } else if (currentIndex !== -1) {
          const activeId = extensions[currentIndex].id;
          const newIndex = currentListData.findIndex(
            (ext) => ext.id === activeId,
          );
          setCurrentIndex(newIndex);
        }
      } else {
        toast.error(data.error || "Failed to remove extension.");
      }
    } catch (err) {
      toast.error("Communication failure with delete API.");
    }
  };

  // Retry importing a single failed extension from the batch summary modal
  const handleRetryImport = async (id) => {
    toast.info(`Retrying import for ID: ${id}...`);
    try {
      const res = await fetch("/api/add-extension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Successfully added ${data.extension.name}!`);

        setBatchSummary((prev) => {
          if (!prev) return null;
          const updatedFailures = prev.failures.filter((f) => f.id !== id);
          const updatedSuccesses = [
            ...prev.successes,
            { id, name: data.extension.name, status: "imported" },
          ];
          return {
            ...prev,
            failures: updatedFailures,
            successes: updatedSuccesses,
          };
        });

        const currentListRes = await fetch("/api/extensions");
        const currentListData = await currentListRes.json();
        setExtensions(currentListData);
      } else {
        toast.error(data.error || "Retry failed.");
      }
    } catch (err) {
      toast.error("Retry network failure.");
    }
  };

  // Fetch all extensions from the Express API
  const fetchExtensions = async (selectFirst = false) => {
    try {
      const res = await fetch("/api/extensions");
      const data = await res.json();
      setExtensions(data);

      const params = new URLSearchParams(window.location.search);
      const urlView = params.get("view") || "explorer";
      const urlExtId = params.get("id");
      const urlShowcaseId = params.get("showcaseId");

      setViewMode(urlView);
      if (urlShowcaseId) {
        setSelectedShowcaseId(urlShowcaseId);
      }

      let indexToSelect = -1;
      if (urlExtId && data.length > 0) {
        const matchIdx = data.findIndex((e) => e.id === urlExtId);
        if (matchIdx !== -1) {
          if (currentIndex === -1) {
            indexToSelect = matchIdx;
          }
        }
      }

      if (indexToSelect === -1 && selectFirst && data.length > 0 && currentIndex === -1) {
        indexToSelect = 0;
      }

      if (indexToSelect !== -1) {
        selectExtension(indexToSelect, data, true);
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load extensions from server.");
      setLoading(false);
    }
  };

  // Cache All (Pre-fetch all CRX files)
  const handleCacheAll = async () => {
    setCachingStatus("caching");
    toast.info("Caching feed extensions in background...");

    try {
      const res = await fetch("/api/download-all", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setCachingStatus("done");
        toast.success(
          "Feed cached successfully. All extensions ready for instant loading.",
        );
        fetchExtensions();
      } else {
        setCachingStatus("error");
        toast.error(`Caching failed: ${data.error}`);
      }
    } catch (err) {
      setCachingStatus("error");
      toast.error("Error during download queue cache.");
    }
  };

  useEffect(() => {
    fetchExtensions(true);
  }, []);

  // Sync sidebar options to localStorage
  useEffect(() => {
    localStorage.setItem("cen_filter_mode", filterMode);
  }, [filterMode]);

  useEffect(() => {
    localStorage.setItem("cen_sort_mode", sortMode);
  }, [sortMode]);

  useEffect(() => {
    localStorage.setItem("cen_group_mode", groupMode);
  }, [groupMode]);

  // Sync state to URL search parameters
  useEffect(() => {
    if (loading) return;

    const params = new URLSearchParams();
    params.set("view", viewMode);

    if (viewMode === "explorer") {
      if (currentIndex !== -1 && extensions[currentIndex]) {
        params.set("id", extensions[currentIndex].id);
      }
    } else if (viewMode === "showcase") {
      if (selectedShowcaseId) {
        params.set("showcaseId", selectedShowcaseId);
      }
    }

    const newSearch = params.toString();
    const currentSearch = window.location.search.replace(/^\?/, "");

    if (newSearch !== currentSearch) {
      const newUrl = `${window.location.pathname}?${newSearch}`;
      window.history.replaceState(null, "", newUrl);
    }
  }, [viewMode, currentIndex, extensions, selectedShowcaseId, loading]);

  // Handle browser back/forward buttons (popstate event)
  useEffect(() => {
    const handlePopState = () => {
      if (loading || extensions.length === 0) return;
      const params = new URLSearchParams(window.location.search);
      const urlView = params.get("view") || "explorer";
      const urlExtId = params.get("id");
      const urlShowcaseId = params.get("showcaseId");

      setViewMode(urlView);
      if (urlShowcaseId) {
        setSelectedShowcaseId(urlShowcaseId);
      }

      if (urlView === "explorer" && urlExtId) {
        const matchIdx = extensions.findIndex((e) => e.id === urlExtId);
        if (matchIdx !== -1 && matchIdx !== currentIndex) {
          selectExtension(matchIdx, extensions, true);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [extensions, currentIndex, loading]);

  // Handle active extension selection (bridge triggers view shifting on sidebar clicks)
  const selectExtension = (idx, list = extensions, preserveView = false) => {
    if (idx < 0 || idx >= list.length) return;
    setCurrentIndex(idx);

    if (!preserveView && (viewMode === "photos" || viewMode === "showcase")) {
      setViewMode("explorer");
    }
    toast.info(`Switched to: ${list[idx].name}`);
  };

  const handleUpdateExtension = (id, updatedFields) => {
    setExtensions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updatedFields } : e)),
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 text-zinc-900 font-sans antialiased">
      <Toaster
        position="bottom-right"
        theme="light"
        toastOptions={{ duration: 3000 }}
      />

      {/* RENDER DYNAMIC PAGES */}
      {viewMode === "explorer" && (
        <ExplorerPage
          extensions={extensions}
          currentIndex={currentIndex}
          selectExtension={selectExtension}
          handleDeleteExtension={handleDeleteExtension}
          loading={loading}
          setViewMode={setViewMode}
          setShowSettingsModal={setShowSettingsModal}
          editorChoice={editorChoice}
          customEditorCommand={customEditorCommand}
          screenshotMode={screenshotMode}
          onUpdateExtension={handleUpdateExtension}
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          sortMode={sortMode}
          setSortMode={setSortMode}
          groupMode={groupMode}
          setGroupMode={setGroupMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {viewMode === "photos" && (
        <PhotosPage
          extensions={extensions}
          currentIndex={currentIndex}
          selectExtension={selectExtension}
          handleDeleteExtension={handleDeleteExtension}
          loading={loading}
          setViewMode={setViewMode}
          setShowSettingsModal={setShowSettingsModal}
          setSelectedShowcaseId={setSelectedShowcaseId}
          setCreateShowcaseFromCrop={setCreateShowcaseFromCrop}
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          sortMode={sortMode}
          setSortMode={setSortMode}
          groupMode={groupMode}
          setGroupMode={setGroupMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {viewMode === "showcase" && (
        <ShowcasePage
          viewMode={viewMode}
          setViewMode={setViewMode}
          setShowSettingsModal={setShowSettingsModal}
          selectedShowcaseId={selectedShowcaseId}
          setSelectedShowcaseId={setSelectedShowcaseId}
          createShowcaseFromCrop={createShowcaseFromCrop}
          setCreateShowcaseFromCrop={setCreateShowcaseFromCrop}
        />
      )}

      {/* OVERLAY MODALS */}
      <AnimatePresence>
        {showAddModal && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !isAddingExtension) {
                setShowAddModal(false);
                setNewExtensionId("");
              }
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm p-4 animate-fade-in"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
                <h3 className="font-bold text-sm text-zinc-800 uppercase tracking-tight">
                  Add Extensions to Feed
                </h3>
                <button
                  onClick={() => {
                    if (!isAddingExtension) {
                      setShowAddModal(false);
                      setNewExtensionId("");
                    }
                  }}
                  disabled={isAddingExtension}
                  className="p-1 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 transition disabled:opacity-30 cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-center text-[11px] text-zinc-500 font-semibold">
                  <span>
                    {batchMode
                      ? "BATCH MODE (PASTE MULTIPLE LINKS/IDS)"
                      : "SINGLE MODE (PASTE ID OR URL)"}
                  </span>
                  <button
                    onClick={() => {
                      setBatchMode(!batchMode);
                      setNewExtensionId("");
                    }}
                    disabled={isAddingExtension}
                    type="button"
                    className="text-blue-600 hover:text-blue-800 font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    Switch to {batchMode ? "Single Mode" : "Batch Mode"}
                  </button>
                </div>

                <form onSubmit={handleAddExtension} className="space-y-4">
                  {batchMode ? (
                    <textarea
                      placeholder="Paste Chrome Web Store links, markdown tables, or raw 32-character IDs here... All valid IDs will be automatically extracted."
                      value={newExtensionId}
                      onChange={(e) => setNewExtensionId(e.target.value)}
                      disabled={isAddingExtension}
                      rows="6"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs outline-none focus:border-blue-500 focus:bg-white placeholder-zinc-400 text-zinc-800 disabled:opacity-60 resize-none font-mono leading-relaxed"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm"
                      value={newExtensionId}
                      onChange={(e) => setNewExtensionId(e.target.value)}
                      disabled={isAddingExtension}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs outline-none focus:border-blue-500 focus:bg-white placeholder-zinc-400 text-zinc-800 disabled:opacity-60"
                    />
                  )}

                  {/* Batch Progress HUD */}
                  {batchProgress && (
                    <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-700 flex flex-col gap-2 font-medium">
                      <div className="flex justify-between items-center">
                        <span className="truncate max-w-[280px]">
                          Scraping CWS:{" "}
                          <code className="bg-blue-100/50 px-1 py-0.5 rounded font-mono text-[10px]">
                            {batchProgress.id}
                          </code>
                        </span>
                        <span className="font-bold shrink-0">
                          {batchProgress.current} / {batchProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                          style={{
                            width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        setNewExtensionId("");
                      }}
                      disabled={isAddingExtension}
                      className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isAddingExtension || !newExtensionId.trim()}
                      className="px-5 py-2 rounded-xl bg-blue-650 hover:bg-blue-700 text-white text-xs font-bold transition disabled:opacity-40 select-none flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/10"
                    >
                      {isAddingExtension ? (
                        <>
                          <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Adding...</span>
                        </>
                      ) : (
                        <span>Import Extensions</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHotkeysModal && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowHotkeysModal(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm p-4 animate-fade-in"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
                <h3 className="font-bold text-sm text-zinc-800 uppercase tracking-tight">
                  Keyboard Shortcuts Guide
                </h3>
                <button
                  onClick={() => setShowHotkeysModal(false)}
                  className="p-1 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 transition cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs pb-1 border-b border-zinc-100">
                    <span className="text-zinc-500 font-medium">
                      Pause/Resume countdown:
                    </span>
                    <kbd className="px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-650 font-mono text-[10px] font-bold">
                      Space
                    </kbd>
                  </div>
                  <div className="flex justify-between items-center text-xs pb-1 border-b border-zinc-100">
                    <span className="text-zinc-555 font-medium">
                      Launch Sandbox Browser:
                    </span>
                    <kbd className="px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-650 font-mono text-[10px] font-bold">
                      Ctrl + ↑
                    </kbd>
                  </div>
                  <div className="flex justify-between items-center text-xs pb-1 border-b border-zinc-100">
                    <span className="text-zinc-555 font-medium">
                      Save Critique & Advance:
                    </span>
                    <kbd className="px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-650 font-mono text-[10px] font-bold">
                      Ctrl + Enter
                    </kbd>
                  </div>
                  <div className="flex justify-between items-center text-xs pb-1 border-b border-zinc-100">
                    <span className="text-zinc-555 font-medium">
                      Toggle Component Snip:
                    </span>
                    <kbd className="px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-650 font-mono text-[10px] font-bold">
                      Alt + Shift + E
                    </kbd>
                  </div>
                  <div className="flex justify-between items-center text-xs pb-1 border-b border-zinc-100">
                    <span className="text-zinc-555 font-medium">
                      Toggle Shortcuts Guide:
                    </span>
                    <kbd className="px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-650 font-mono text-[10px] font-bold">
                      Ctrl + ?
                    </kbd>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setShowHotkeysModal(false)}
                    className="w-full py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-750 font-semibold text-xs transition cursor-pointer"
                  >
                    Close Cheatsheet
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSummaryModal && batchSummary && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowSummaryModal(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm p-4 animate-fade-in"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
                <h3 className="font-bold text-sm text-zinc-800 uppercase tracking-tight flex items-center gap-2">
                  <IconFileText className="h-4.5 w-4.5 text-zinc-500" /> Batch Import Report
                </h3>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="p-1 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 transition cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Stats Panel */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-100/60 rounded-2xl">
                    <div className="text-xl font-extrabold text-emerald-600">
                      {
                        batchSummary.successes.filter(
                          (s) => s.status === "imported",
                        ).length
                      }
                    </div>
                    <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mt-0.5">
                      Scraped
                    </div>
                  </div>
                  <div className="p-3.5 bg-zinc-50 border border-zinc-150 rounded-2xl">
                    <div className="text-xl font-extrabold text-zinc-650">
                      {batchSummary.skippedCount}
                    </div>
                    <div className="text-[10px] font-bold text-zinc-455 uppercase tracking-wider mt-0.5">
                      Skipped
                    </div>
                  </div>
                  <div className="p-3.5 bg-red-50 border border-red-100/60 rounded-2xl">
                    <div className="text-xl font-extrabold text-red-600">
                      {batchSummary.failures.length}
                    </div>
                    <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-0.5">
                      Failed
                    </div>
                  </div>
                </div>

                {/* Failures List */}
                {batchSummary.failures.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-red-650 tracking-wide uppercase flex items-center gap-1.5">
                      <IconAlertTriangle className="h-4 w-4 text-red-500" /> Processing Failures ({batchSummary.failures.length})
                    </h4>
                    <div className="border border-red-100 bg-red-50/20 rounded-xl overflow-hidden divide-y divide-red-100/60">
                      {batchSummary.failures.map((fail, i) => (
                        <div
                          key={i}
                          className="p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-mono text-[10px] font-bold text-zinc-800 break-all select-all">
                              {fail.id}
                            </div>
                            <div className="text-red-500 text-[10px]">
                              {fail.error}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRetryImport(fail.id)}
                            className="px-3 py-1.5 bg-white border border-red-200 hover:border-red-500 hover:bg-red-50 text-red-650 rounded-lg text-[10px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-sm shadow-zinc-100/40"
                          >
                            <IconRefresh className="h-3 w-3" /> Retry Import
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Successes List */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-zinc-755 tracking-wide uppercase flex items-center gap-1.5">
                    <IconCheck className="h-4 w-4 text-emerald-555" /> Processed Queue ({batchSummary.successes.length})
                  </h4>
                  <div className="border border-zinc-200/80 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-zinc-100 bg-zinc-50/20">
                    {batchSummary.successes.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-450 italic">
                        No successfully imported items.
                      </div>
                    ) : (
                      batchSummary.successes.map((success, i) => (
                        <div
                          key={i}
                          className="p-3 flex justify-between items-center text-xs"
                        >
                          <span className="font-semibold text-zinc-705 truncate max-w-[280px]">
                            {success.name}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] shrink-0 font-medium">
                            <span className="font-mono text-zinc-400">
                              {success.id.slice(0, 8)}...
                            </span>
                            {success.status === "skipped" ? (
                              <span className="px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-500">
                                Skipped (Duplicate)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-600">
                                Imported
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-zinc-200 bg-zinc-50 flex justify-end">
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-bold transition cursor-pointer select-none"
                >
                  Dismiss Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettingsModal && (
          <SettingsModal
            show={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            screenshotMode={screenshotMode}
            setScreenshotMode={setScreenshotMode}
            editorChoice={editorChoice}
            setEditorChoice={setEditorChoice}
            customEditorCommand={customEditorCommand}
            setCustomEditorCommand={setCustomEditorCommand}
            activeSettingsTab={activeSettingsTab}
            setActiveSettingsTab={setActiveSettingsTab}
            newExtensionId={newExtensionId}
            setNewExtensionId={setNewExtensionId}
            handleAddExtension={handleAddExtension}
            isAddingExtension={isAddingExtension}
            cachingStatus={cachingStatus}
            handleCacheAll={handleCacheAll}
            isBatching={isBatching}
            batchProgress={batchProgress}
            batchLogs={batchLogs}
            showConsolePopover={showConsolePopover}
            setShowConsolePopover={setShowConsolePopover}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
