import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  IconSearch,
  IconPlus,
  IconCode,
  IconPhoto,
  IconChevronRight,
  IconChevronDown,
} from "@tabler/icons-react";
import SidebarHeader from "../components/SidebarHeader";
import ShowcaseLab from "../components/ShowcaseLab";

export default function ShowcasePage({
  viewMode,
  setViewMode,
  setShowSettingsModal,
  selectedShowcaseId,
  setSelectedShowcaseId,
  createShowcaseFromCrop,
  setCreateShowcaseFromCrop,
}) {
  const [componentsList, setComponentsList] = useState([]);
  const [cropsList, setCropsList] = useState([]);
  const [selectedCropId, setSelectedCropId] = useState("");
  const [sidebarTab, setSidebarTab] = useState("polished"); // polished | raw
  const [searchQuery, setSearchQuery] = useState("");
  const [triggerCreateModal, setTriggerCreateModal] = useState(0);
  const [loadingShowcase, setLoadingShowcase] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroup = (groupName) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  // Fetch showcase components index
  const fetchShowcaseIndex = async (selectId = null) => {
    try {
      const res = await fetch("/api/showcase");
      const data = await res.json();
      setComponentsList(data);
      setLoadingShowcase(false);

      if (selectId) {
        setSelectedShowcaseId(selectId);
      } else if (data.length > 0 && !selectedShowcaseId) {
        // Read selectedShowcaseId from URL search param if present, otherwise default to first
        const params = new URLSearchParams(window.location.search);
        const urlShowcaseId = params.get("showcaseId");
        if (urlShowcaseId && data.some(item => item.id === urlShowcaseId)) {
          setSelectedShowcaseId(urlShowcaseId);
        } else {
          setSelectedShowcaseId(data[0].id);
        }
      }
    } catch (err) {
      console.error("[-] Error loading showcase index:", err);
      toast.error("Failed to load Showcase library.");
      setLoadingShowcase(false);
    }
  };

  // Fetch captures from inspirations list
  const fetchCropsIndex = async (selectCropId = null) => {
    try {
      const res = await fetch("/api/inspirations");
      const data = await res.json();
      setCropsList(data);

      if (selectCropId) {
        setSelectedCropId(selectCropId);
      } else if (data.length > 0 && !selectedCropId) {
        setSelectedCropId(data[0].id);
      }
    } catch (err) {
      console.error("[-] Error loading inspirations:", err);
    }
  };

  useEffect(() => {
    fetchShowcaseIndex();
    fetchCropsIndex();
  }, []);

  // Filter showcase lists based on search query
  const filteredComponents = componentsList.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query))
    );
  });

  const groupedComponents = filteredComponents.reduce((acc, item) => {
    const groupName = item.extensionName || "Independent Components";
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(item);
    return acc;
  }, {});

  const filteredCrops = cropsList.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(query) ||
      item.extensionName?.toLowerCase().includes(query) ||
      (item.notes && item.notes.toLowerCase().includes(query))
    );
  });

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* SIDEBAR QUEUE (LEFT PANEL) */}
      <aside className="w-80 flex flex-col border-r border-zinc-200 bg-zinc-100/50 backdrop-blur-md shrink-0">
        <SidebarHeader
          viewMode={viewMode}
          setViewMode={setViewMode}
          setShowSettingsModal={setShowSettingsModal}
        />

        {/* Showcase Sub-Header Controls */}
        <div className="p-4 bg-white border-b border-zinc-200 space-y-3 shrink-0 select-none">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-zinc-800 text-xs tracking-tight uppercase font-mono flex items-center gap-1.5">
              <IconCode className="h-4.5 w-4.5 text-zinc-500" />
              <span>Showcase Lab</span>
            </h3>
            <button
              onClick={() => setTriggerCreateModal((prev) => prev + 1)}
              className="px-2 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 hover:border-zinc-300 text-zinc-650 cursor-pointer transition select-none flex items-center gap-1 text-[10px] font-bold shadow-sm"
            >
              <IconPlus className="h-3 w-3" /> New Component
            </button>
          </div>

          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-zinc-300 focus:bg-white transition"
            />
          </div>

          <div className="flex w-full bg-zinc-100 p-0.5 border border-zinc-200 rounded-xl">
            <button
              onClick={() => setSidebarTab("polished")}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                sidebarTab === "polished"
                  ? "bg-white border border-zinc-200 text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <IconCode className="h-3.5 w-3.5" /> Polished JSX
            </button>
            <button
              onClick={() => setSidebarTab("raw")}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                sidebarTab === "raw"
                  ? "bg-white border border-zinc-200 text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <IconPhoto className="h-3.5 w-3.5" /> Raw Crops
            </button>
          </div>
        </div>

        {/* List Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {loadingShowcase ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <div className="h-5 w-5 border-2 border-zinc-650 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[11px] text-zinc-400 font-mono">
                Loading lists...
              </span>
            </div>
          ) : sidebarTab === "polished" ? (
            /* POLISHED JSX COMPONENTS LIST */
            filteredComponents.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-zinc-250 bg-white/70 rounded-xl space-y-1">
                <span className="text-xl block">📂</span>
                <h4 className="text-xs font-bold text-zinc-700">Empty Library</h4>
                <p className="text-[10px] text-zinc-455 max-w-[200px] mx-auto leading-relaxed">
                  No polished components. Switch to "Raw Crops" to sanitize elements.
                </p>
              </div>
            ) : (
              Object.keys(groupedComponents).map((groupName) => {
                const isCollapsed = collapsedGroups[groupName];
                const items = groupedComponents[groupName];

                return (
                  <div 
                    key={groupName} 
                    className="bg-white/95 border border-zinc-200/75 rounded-xl shadow-sm overflow-hidden select-none transition-all duration-200 hover:border-zinc-300/60"
                  >
                    {/* Collapsible Group Header Accordion */}
                    <div
                      onClick={() => toggleGroup(groupName)}
                      className="flex items-center justify-between px-3.5 py-2.5 bg-zinc-50/70 border-b border-zinc-200/40 text-zinc-650 text-[10px] font-extrabold font-mono tracking-wider uppercase hover:bg-zinc-100/50 cursor-pointer select-none transition-colors duration-200"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <IconChevronRight className="h-3.5 w-3.5 text-zinc-400 transition-transform duration-200" />
                        ) : (
                          <IconChevronDown className="h-3.5 w-3.5 text-zinc-400 transition-transform duration-200" />
                        )}
                        <span className="truncate max-w-[130px]" title={groupName}>
                          {groupName}
                        </span>
                      </div>
                      <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-200/70 text-zinc-550 font-extrabold font-mono border border-zinc-200/30">
                        {items.length}
                      </span>
                    </div>

                    {/* Group Items List */}
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="divide-y divide-zinc-100 overflow-hidden"
                        >
                          {items.map((item) => {
                            const isSelected = item.id === selectedShowcaseId;
                            return (
                              <div
                                key={item.id}
                                onClick={() => setSelectedShowcaseId(item.id)}
                                className={`p-3.5 transition-all duration-200 cursor-pointer relative overflow-hidden select-none ${
                                  isSelected
                                    ? "bg-zinc-900 text-white"
                                    : "bg-transparent text-zinc-700 hover:bg-zinc-50/70"
                                }`}
                              >
                                <div className="space-y-1">
                                  <h4 className={`font-bold text-[11px] leading-tight ${isSelected ? "text-white" : "text-zinc-800"}`}>
                                    {item.title}
                                  </h4>
                                  {item.description && (
                                    <p className={`text-[9.5px] line-clamp-2 leading-relaxed ${isSelected ? "text-zinc-350" : "text-zinc-450"}`}>
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-200/10 text-[9px] font-semibold font-mono">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] tracking-wider uppercase ${
                                    isSelected
                                      ? "bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                                      : "bg-zinc-50 text-zinc-500 border border-zinc-200/60"
                                  }`}>
                                    {item.category}
                                  </span>
                                  {item.fromCropId ? (
                                    <span className={isSelected ? "text-emerald-400 font-bold" : "text-emerald-600 font-bold"}>
                                      Linked Crop
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400">
                                      Custom
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )
          ) : (
            /* RAW CAPTURES QUEUE */
            filteredCrops.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-zinc-250 bg-white/70 rounded-xl space-y-1">
                <span className="text-xl block">📸</span>
                <h4 className="text-xs font-bold text-zinc-700">No Captures</h4>
                <p className="text-[10px] text-zinc-455 max-w-[200px] mx-auto leading-relaxed">
                  Capture sandbox elements to begin building the sanitization queue.
                </p>
              </div>
            ) : (
              filteredCrops.map((item) => {
                const isSelected = item.id === selectedCropId;
                return (
                  <motion.div
                    key={item.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelectedCropId(item.id)}
                    className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group select-none ${
                      isSelected
                        ? "bg-white border-zinc-500 shadow-sm shadow-zinc-200/50"
                        : "bg-transparent border-transparent hover:bg-zinc-150/40 hover:border-zinc-200/40"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-500"></div>
                    )}
                    <div className="space-y-1">
                      <h4 className="font-bold text-xs text-zinc-800 line-clamp-1 group-hover:text-zinc-950 transition">
                        {item.title}
                      </h4>
                      <p className="text-[10px] text-zinc-455 leading-normal">
                        Extension: {item.extensionName}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-100/65 text-[9px] font-medium font-sans">
                      <span className={`px-1.5 py-0.5 rounded border uppercase font-semibold ${
                        item.sanitized
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                          : "bg-zinc-100 text-zinc-550 border-zinc-200"
                      }`}>
                        {item.sanitized ? "Polished" : "Pending"}
                      </span>
                      <span className="text-zinc-400 font-mono">{item.timestamp}</span>
                    </div>
                  </motion.div>
                );
              })
            )
          )}
        </div>
      </aside>

      {/* VIEWER PORT (RIGHT PANEL) */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <ShowcaseLab
          selectedShowcaseId={selectedShowcaseId}
          setSelectedShowcaseId={setSelectedShowcaseId}
          selectedCropId={selectedCropId}
          setSelectedCropId={setSelectedCropId}
          sidebarTab={sidebarTab}
          setSidebarTab={setSidebarTab}
          componentsList={componentsList}
          setComponentsList={setComponentsList}
          cropsList={cropsList}
          setCropsList={setCropsList}
          fetchShowcaseIndex={fetchShowcaseIndex}
          fetchCropsIndex={fetchCropsIndex}
          createShowcaseFromCrop={createShowcaseFromCrop}
          setCreateShowcaseFromCrop={setCreateShowcaseFromCrop}
          triggerCreateModal={triggerCreateModal}
        />
      </main>
    </div>
  );
}
