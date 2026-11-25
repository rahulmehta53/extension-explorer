import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  IconCopy,
  IconCheck,
  IconTrash,
  IconSearch,
  IconCode,
  IconPalette,
  IconCalendar,
  IconMaximize,
  IconGridPattern,
  IconLayoutList,
  IconCategory,
  IconExternalLink,
  IconFilter,
  IconCamera,
  IconTarget,
  IconSelect,
  IconPlus
} from "@tabler/icons-react";

export default function PhotosGallery({ onRemakeComponent, onViewShowcase }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all"); // all | component | screenshot
  const [selectedExtension, setSelectedExtension] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest"); // newest | oldest
  const [layoutMode, setLayoutMode] = useState("bento"); // bento | standard

  // Detail Modal & HTML lazy loading
  const [selectedItem, setSelectedItem] = useState(null);
  const [loadedHtml, setLoadedHtml] = useState({}); // { [id]: htmlContent }
  const [fetchingHtmlId, setFetchingHtmlId] = useState(null);

  // Edit / Details tracking
  const [editingNotes, setEditingNotes] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState("saved"); // saved | saving | error

  // Copy tracking states
  const [copiedId, setCopiedId] = useState(null);
  const [activeTabs, setActiveTabs] = useState({}); // { [id]: 'styles' | 'html' }

  // Load datasets globally and merge
  const fetchData = async () => {
    try {
      const [inspRes, scrRes, notesRes] = await Promise.all([
        fetch("/api/inspirations"),
        fetch("/api/all-screenshots"),
        fetch("/api/screenshot-notes")
      ]);
      
      const inspirations = await inspRes.json();
      const screenshots = await scrRes.json();
      const screenshotNotes = await notesRes.json();

      // Normalize page screenshots to match inspiration structure
      const normalizedScreenshots = screenshots.map(scr => ({
        ...scr,
        notes: screenshotNotes[scr.filename] || "",
        isScreenshot: true,
        type: "screenshot"
      }));

      const normalizedInspirations = inspirations.map(insp => ({
        ...insp,
        isScreenshot: false,
        type: "component"
      }));

      // Combine and apply initial sort (newest first based on timestamp parsed from IDs)
      const combined = [...normalizedInspirations, ...normalizedScreenshots];
      setItems(combined);
      setLoading(false);
    } catch (err) {
      console.error("[-] Error loading Photos assets:", err);
      toast.error("Failed to load captures.");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Poll for dynamic captures while tab is active
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchData();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Sync edits when modal item changes
  useEffect(() => {
    if (selectedItem) {
      setEditingNotes(selectedItem.notes || "");
      setEditingTitle(selectedItem.title || "");
      setEditingCategory(selectedItem.category || "General");
      setNoteSaveStatus("saved");
    }
  }, [selectedItem]);

  // Debounced auto-save for capture notes
  useEffect(() => {
    if (!selectedItem) return;
    if (editingNotes === selectedItem.notes && editingTitle === selectedItem.title && editingCategory === selectedItem.category) {
      return;
    }

    setNoteSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        if (selectedItem.isScreenshot) {
          // Save page screenshot notes
          const res = await fetch("/api/screenshot-notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: selectedItem.filename, notes: editingNotes })
          });
          const data = await res.json();
          if (data.success) {
            setNoteSaveStatus("saved");
            // Update local state item
            setItems(prev => prev.map(item => item.id === selectedItem.id ? { ...item, notes: editingNotes } : item));
          } else {
            setNoteSaveStatus("error");
          }
        } else {
          // Save component crop details (notes, category, title)
          const res = await fetch("/api/inspirations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: selectedItem.id,
              title: editingTitle,
              category: editingCategory,
              notes: editingNotes
            })
          });
          const data = await res.json();
          if (data.success) {
            setNoteSaveStatus("saved");
            setItems(prev => prev.map(item => item.id === selectedItem.id ? {
              ...item,
              notes: editingNotes,
              title: editingTitle,
              category: editingCategory
            } : item));
          } else {
            setNoteSaveStatus("error");
          }
        }
      } catch (err) {
        setNoteSaveStatus("error");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [editingNotes, editingTitle, editingCategory, selectedItem]);

  // Fetch HTML content dynamically from server
  const loadHtmlContent = async (item) => {
    if (!item || !item.htmlFile) return "";
    if (loadedHtml[item.id] !== undefined) return loadedHtml[item.id];

    setFetchingHtmlId(item.id);
    try {
      const res = await fetch(item.htmlFile);
      if (res.ok) {
        const text = await res.text();
        setLoadedHtml(prev => ({ ...prev, [item.id]: text }));
        setFetchingHtmlId(null);
        return text;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("[-] Error loading HTML:", err);
      toast.error("Failed to load HTML source.");
      setFetchingHtmlId(null);
      return "<!-- Error loading HTML markup from server -->";
    }
  };

  const handleCopyText = async (textOrItem, type, id) => {
    let textToCopy = "";
    if (type === "html" && typeof textOrItem === "object") {
      textToCopy = await loadHtmlContent(textOrItem);
    } else {
      textToCopy = textOrItem;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(`${type}_${id}`);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success(`${type.toUpperCase()} copied to clipboard!`);
    } catch (err) {
      toast.error("Clipboard copy failed.");
    }
  };

  // Delete Capture Asset (supports both screenshot deletions and inspiration component deletions)
  const handleDeleteItem = async (item, e) => {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to delete this captured asset?`)) return;

    try {
      let res;
      if (item.isScreenshot) {
        res = await fetch(`/api/screenshots/${item.filename}`, { method: "DELETE" });
      } else {
        res = await fetch(`/api/inspirations/${item.id}`, { method: "DELETE" });
      }

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Capture deleted successfully!");
        setItems(prev => prev.filter(i => i.id !== item.id));
        if (selectedItem?.id === item.id) setSelectedItem(null);
      } else {
        toast.error(data.error || "Failed to delete capture.");
      }
    } catch (err) {
      toast.error("Communication failure with deleting API.");
    }
  };

  // Filters & Sorting calculations
  const uniqueExtensions = ["all", ...new Set(items.map(item => item.extensionName).filter(Boolean))];
  const uniqueCategories = ["all", ...new Set(items.map(item => item.category).filter(Boolean))];

  const filteredItems = items
    .filter(item => {
      // 1. Text Search Query
      const matchSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.extensionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.notes.toLowerCase().includes(searchQuery.toLowerCase());
      
      // 2. Asset Type Filter (all | component | screenshot)
      const matchType =
        assetTypeFilter === "all" ||
        (assetTypeFilter === "component" && !item.isScreenshot) ||
        (assetTypeFilter === "screenshot" && item.isScreenshot);
      
      // 3. Extension Filter
      const matchExtension =
        selectedExtension === "all" || item.extensionName === selectedExtension;

      return matchSearch && matchType && matchExtension;
    })
    .sort((a, b) => {
      // 4. Timestamp Sorting
      const tsA = parseInt(a.id.replace("insp_", "").replace("scr_", ""), 10) || 0;
      const tsB = parseInt(b.id.replace("insp_", "").replace("scr_", ""), 10) || 0;
      return sortOrder === "newest" ? tsB - tsA : tsA - tsB;
    });

  return (
    <div className="space-y-5">
      {/* Search, Filters, and Controls Panel */}
      <div className="p-4 bg-white border border-zinc-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm shadow-zinc-100/40 select-none">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search captures, notes, or extensions..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-zinc-300 focus:bg-white transition"
            />
          </div>

          {/* Extension selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <IconFilter className="h-4 w-4 text-zinc-400" />
            <select
              value={selectedExtension}
              onChange={(e) => setSelectedExtension(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:bg-white text-zinc-700 font-semibold cursor-pointer max-w-[150px]"
            >
              <option value="all">All Extensions</option>
              {uniqueExtensions.filter(ext => ext !== "all").map(ext => (
                <option key={ext} value={ext}>{ext}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filters and sorting actions */}
        <div className="flex items-center gap-4 shrink-0 flex-wrap">
          {/* Type Filter Buttons */}
          <div className="flex items-center bg-zinc-150/45 p-0.5 border border-zinc-200/50 rounded-xl">
            {[
              { id: "all", label: "All Assets" },
              { id: "component", label: "Crops", icon: IconTarget },
              { id: "screenshot", label: "Screenshots", icon: IconCamera }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setAssetTypeFilter(tab.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none transition ${
                  assetTypeFilter === tab.id
                    ? "bg-white text-zinc-800 shadow-sm border border-zinc-200/40"
                    : "text-zinc-400 hover:text-zinc-750"
                }`}
              >
                {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Sort Menu */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:bg-white text-zinc-700 font-semibold cursor-pointer"
          >
            <option value="newest">Newest Captured</option>
            <option value="oldest">Oldest Captured</option>
          </select>

          {/* Layout Switcher */}
          <div className="flex items-center bg-zinc-150/45 p-0.5 border border-zinc-200/50 rounded-xl">
            <button
              onClick={() => setLayoutMode("bento")}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                layoutMode === "bento" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-400 hover:text-zinc-750"
              }`}
              title="Bento Grid Layout"
            >
              <IconGridPattern className="h-4 w-4" />
            </button>
            <button
              onClick={() => setLayoutMode("standard")}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                layoutMode === "standard" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-400 hover:text-zinc-750"
              }`}
              title="Standard Grid Layout"
            >
              <IconLayoutList className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 bg-white border border-zinc-200 rounded-2xl">
          <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-zinc-455 font-mono">Loading capture vault...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-zinc-200 bg-white rounded-2xl space-y-2">
          <div className="text-2xl">📁</div>
          <h3 className="font-bold text-zinc-700 text-sm">No Assets Found</h3>
          <p className="text-xs text-zinc-405 max-w-sm mx-auto">
            Try adjusting your search criteria, selecting another extension, or capturing crops/screenshots inside sandbox tabs.
          </p>
        </div>
      ) : (
        /* Image Bento Grid / Layout columns */
        <div
          className={
            layoutMode === "bento"
              ? "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4"
              : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          }
        >
          <AnimatePresence>
            {filteredItems.map(item => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ y: -3 }}
                onClick={() => setSelectedItem(item)}
                className={`break-inside-avoid bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 flex flex-col group select-none relative ${
                  layoutMode === "standard" ? "h-[340px]" : "mb-4"
                }`}
              >
                {/* Visual Image Preview */}
                <div className="relative bg-zinc-950 flex items-center justify-center min-h-[140px] flex-1 overflow-hidden">
                  <img
                    src={item.screenshot}
                    alt={item.title}
                    className={`w-full object-contain ${
                      layoutMode === "standard" ? "h-44" : "max-h-96"
                    }`}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center">
                    <span className="px-3.5 py-1.5 rounded-xl bg-white text-xs font-bold text-zinc-900 border border-zinc-200 shadow-md transform translate-y-2 group-hover:translate-y-0 transition duration-200 flex items-center gap-1">
                      <IconMaximize className="h-3.5 w-3.5" /> Inspect Detail
                    </span>
                  </div>

                  {/* Asset Type badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      item.isScreenshot
                        ? "bg-blue-900/80 backdrop-blur-sm text-blue-200 border border-blue-800"
                        : "bg-emerald-900/80 backdrop-blur-sm text-emerald-200 border border-emerald-800"
                    }`}>
                      {item.isScreenshot ? "Screenshot" : "Component"}
                    </span>
                    {!item.isScreenshot && (
                      <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        item.sanitized
                          ? "bg-emerald-900/85 backdrop-blur-sm text-emerald-100 border border-emerald-800"
                          : "bg-zinc-800/85 backdrop-blur-sm text-zinc-300 border border-zinc-700"
                      }`}>
                        {item.sanitized ? "Sanitized" : "Raw Crop"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content info card */}
                <div className="p-4 space-y-2.5 bg-white border-t border-zinc-100 shrink-0">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                      {item.extensionName}
                    </span>
                    <h4 className="font-bold text-zinc-800 text-xs truncate" title={item.title}>
                      {item.title}
                    </h4>
                  </div>

                  {/* Comments Preview */}
                  {item.notes ? (
                    <p className="text-[10.5px] text-zinc-500 leading-normal line-clamp-2 italic border-l-2 border-zinc-200 pl-2">
                      "{item.notes}"
                    </p>
                  ) : (
                    <span className="text-[10px] text-zinc-400 italic block">No comments saved.</span>
                  )}

                  {/* Card Footer tags */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-zinc-100 text-[9px] text-zinc-400 select-text">
                    <span className="font-mono flex items-center gap-1">
                      <IconCalendar className="h-3 w-3" /> {item.timestamp}
                    </span>
                    {!item.isScreenshot && item.category && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200/60 font-semibold uppercase">
                        {item.category}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* DETAIL INSPECTOR MODAL */}
      <AnimatePresence>
        {selectedItem && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedItem(null);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 md:p-8 select-none"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-6xl h-[90vh] bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 flex flex-col md:flex-row relative"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute top-4 right-4 z-50 p-2 rounded-xl bg-black/60 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer hover:bg-black"
                title="Close overlay"
              >
                ✕
              </button>

              {/* Left Column: Full-size Visual image */}
              <div className="flex-1 bg-zinc-950 p-6 flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-zinc-850">
                <img
                  src={selectedItem.screenshot}
                  alt={selectedItem.title}
                  className="max-w-full max-h-full object-contain rounded-xl"
                />
              </div>

              {/* Right Column: Interactive details and code panel */}
              <div className="w-full md:w-96 lg:w-[420px] bg-white h-full p-6 flex flex-col justify-between shrink-0 select-text">
                <div className="space-y-5 flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
                  {/* Top info and metadata */}
                  <div className="border-b border-zinc-100 pb-3.5 space-y-1">
                    <span className={`inline-block text-[8px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      selectedItem.isScreenshot
                        ? "bg-blue-50 text-blue-700 border border-blue-150"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-150"
                    }`}>
                      {selectedItem.isScreenshot ? "Screenshot" : "Component Snip"}
                    </span>
                    <h3 className="font-bold text-zinc-900 text-base leading-tight">
                      {selectedItem.title}
                    </h3>
                    <span className="text-[10px] text-zinc-450 font-mono font-medium block">
                      Extension: {selectedItem.extensionName}
                    </span>
                  </div>

                  {/* Input fields to edit Title & Category (only for crops) */}
                  {!selectedItem.isScreenshot && (
                    <div className="grid grid-cols-2 gap-3.5 select-none">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                          Capture Title
                        </label>
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-zinc-300 focus:bg-white transition"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                          Category Tag
                        </label>
                        <input
                          type="text"
                          value={editingCategory}
                          onChange={(e) => setEditingCategory(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-zinc-300 focus:bg-white transition"
                        />
                      </div>
                    </div>
                  )}

                  {/* Notes / Critique comments editor */}
                  <div className="flex-1 flex flex-col space-y-1.5 min-h-[100px]">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Critique Comments & Notes
                    </label>
                    <textarea
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder="Enter layout details, padding highlights, visual aesthetics remarks, or redesign plans..."
                      className="w-full flex-1 p-3 text-xs rounded-xl border border-zinc-200 bg-zinc-50/50 focus:outline-none focus:border-zinc-300 focus:bg-white transition font-mono resize-none leading-relaxed"
                    />
                  </div>

                  {/* Styles / HTML Inspector Tabs (Only for component crops) */}
                  {!selectedItem.isScreenshot && (
                    <div className="border border-zinc-200 rounded-xl overflow-hidden flex flex-col h-44 shrink-0 font-mono text-[10px]">
                      {/* Tabs selector */}
                      <div className="flex bg-zinc-50 border-b border-zinc-200 select-none">
                        {[
                          { id: "styles", label: "CSS Styles", icon: IconPalette },
                          { id: "html", label: "HTML Markup", icon: IconCode }
                        ].map(t => {
                          const tabId = selectedItem.id;
                          const activeTab = activeTabs[tabId] || "styles";
                          const isSelected = activeTab === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => setActiveTabs(prev => ({ ...prev, [tabId]: t.id }))}
                              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-bold cursor-pointer select-none transition ${
                                isSelected ? "bg-white text-zinc-800 border-r border-zinc-200/50" : "text-zinc-400 hover:text-zinc-700"
                              }`}
                            >
                              <t.icon className="h-3.5 w-3.5" />
                              <span>{t.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Tab Content Box */}
                      <div className="flex-1 p-3 bg-zinc-50/20 overflow-y-auto select-text">
                        {(activeTabs[selectedItem.id] || "styles") === "styles" ? (
                          <div className="space-y-1.5">
                            {selectedItem.styles ? (
                              Object.entries(selectedItem.styles).map(([k, v]) => (
                                <div key={k} className="flex justify-between border-b border-zinc-100 pb-0.5">
                                  <span className="text-zinc-450">{k}:</span>
                                  <span className="text-zinc-800 font-bold">{v}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-zinc-400 italic">No computed styles available.</span>
                            )}
                          </div>
                        ) : (
                          <div className="whitespace-pre overflow-x-auto text-zinc-650 leading-relaxed">
                            {fetchingHtmlId === selectedItem.id ? (
                              <span className="text-zinc-400 italic">Fetching HTML from server...</span>
                            ) : loadedHtml[selectedItem.id] ? (
                              loadedHtml[selectedItem.id]
                            ) : (
                              <button
                                onClick={async () => {
                                  const text = await loadHtmlContent(selectedItem);
                                }}
                                className="px-2.5 py-1 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-750 font-bold transition text-[9px]"
                              >
                                Retrieve HTML Markup
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Copy actions footer */}
                      <div className="bg-zinc-50 border-t border-zinc-200 px-3 py-1.5 flex justify-between select-none">
                        <button
                          onClick={() => {
                            const active = activeTabs[selectedItem.id] || "styles";
                            if (active === "styles") {
                              const cssText = Object.entries(selectedItem.styles || {})
                                .map(([k, v]) => `${k}: ${v};`)
                                .join("\n");
                              handleCopyText(cssText, "styles", selectedItem.id);
                            } else {
                              handleCopyText(selectedItem, "html", selectedItem.id);
                            }
                          }}
                          className="flex items-center gap-1 hover:text-zinc-800 text-zinc-500 text-[9px] font-bold cursor-pointer"
                        >
                          {copiedId === `styles_${selectedItem.id}` || copiedId === `html_${selectedItem.id}` ? (
                            <>
                              <IconCheck className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-600">Copied!</span>
                            </>
                          ) : (
                            <>
                              <IconCopy className="h-3 w-3" />
                              <span>Copy Code</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer Controls */}
                <div className="pt-4 border-t border-zinc-100 mt-4 flex items-center justify-between select-none">
                  {/* Status Indicator */}
                  <div className="flex items-center gap-1.5 text-[9px] font-extrabold font-mono">
                    {noteSaveStatus === "saving" && (
                      <span className="text-zinc-500 animate-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-zinc-450 rounded-full inline-block animate-ping"></span>
                        Saving...
                      </span>
                    )}
                    {noteSaveStatus === "saved" && (
                      <span className="text-emerald-650 flex items-center gap-1 animate-fade-in">
                        ✓ Saved
                      </span>
                    )}
                    {noteSaveStatus === "error" && (
                      <span className="text-red-650 flex items-center gap-1">
                        ✕ Sync Error
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!selectedItem.isScreenshot && (
                      selectedItem.sanitized && selectedItem.showcaseId ? (
                        <button
                          onClick={() => {
                            setSelectedItem(null);
                            onViewShowcase(selectedItem.showcaseId);
                          }}
                          className="px-3.5 py-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                        >
                          <IconCode className="h-3.5 w-3.5" /> View Showcase
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedItem(null);
                            onRemakeComponent({
                              id: selectedItem.id,
                              title: selectedItem.title,
                              category: selectedItem.category,
                              notes: selectedItem.notes
                            });
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-bold transition flex items-center gap-1 cursor-pointer border border-zinc-950"
                        >
                          <IconPlus className="h-3.5 w-3.5" /> Remake Component
                        </button>
                      )
                    )}
                    <button
                      onClick={(e) => handleDeleteItem(selectedItem, e)}
                      className="px-3.5 py-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-red-650 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <IconTrash className="h-3.5 w-3.5" /> Delete Capture
                    </button>
                    <button
                      onClick={() => setSelectedItem(null)}
                      className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-[10px] font-bold transition cursor-pointer"
                    >
                      Dismiss Overlay
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
