import React, { useState, useRef, useEffect } from "react";
import { IconTrash, IconBolt, IconSearch, IconX, IconPin, IconAdjustmentsHorizontal, IconDots, IconCheck } from "@tabler/icons-react";
import SidebarHeader from "./SidebarHeader";

export default function ExtensionsSidebar({
  extensions,
  currentIndex,
  selectExtension,
  handleDeleteExtension,
  loading,
  viewMode,
  setViewMode,
  setShowSettingsModal,
  takeaway = "",
  painPoints = "",
  filterMode,
  setFilterMode,
  sortMode,
  setSortMode,
  groupMode,
  setGroupMode,
  searchQuery,
  setSearchQuery,
}) {
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowFilterDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Load pinned state from localStorage
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const stored = localStorage.getItem("cen_pinned_extensions");
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const togglePin = (id, e) => {
    if (e) e.stopPropagation(); // Avoid triggering selectExtension
    setPinnedIds((prev) => {
      const updated = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      localStorage.setItem("cen_pinned_extensions", JSON.stringify(updated));
      return updated;
    });
  };

  // Track recently opened extensions in localStorage
  React.useEffect(() => {
    if (currentIndex === -1 || !extensions[currentIndex]) return;
    const activeId = extensions[currentIndex].id;
    try {
      const stored = localStorage.getItem("cen_recently_opened");
      let recentList = stored ? JSON.parse(stored) : [];
      recentList = recentList.filter((id) => id !== activeId);
      recentList.unshift(activeId);
      recentList = recentList.slice(0, 10);
      localStorage.setItem("cen_recently_opened", JSON.stringify(recentList));
    } catch (e) {
      console.error("Error saving recently opened:", e);
    }
  }, [currentIndex, extensions]);

  // Memoized filter and sort resolver supporting multiple chained operations
  const filteredAndSorted = React.useMemo(() => {
    let list = [...extensions];

    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (ext) =>
          ext.name.toLowerCase().includes(q) ||
          ext.category.toLowerCase().includes(q) ||
          ext.id.toLowerCase().includes(q) ||
          (ext.author && ext.author.toLowerCase().includes(q))
      );
    }

    // 2. Quick Filters
    if (filterMode === "todo") {
      list = list.filter((ext) => !ext.reviewed);
    } else if (filterMode === "audited") {
      list = list.filter((ext) => ext.reviewed);
    }

    const todoFirst = groupMode === "todo" || groupMode === "both";
    const newestFirst = groupMode === "newest" || groupMode === "both";

    // 3. Combined Sort Algorithm
    list.sort((a, b) => {
      // Tier 0: Pinned First (always float pinned items to absolute top of list)
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned; // pinned (1) before unpinned (0)
      }

      // Tier A: "Todo First" (unreviewed extensions grouped at the top)
      if (todoFirst) {
        const aReviewed = a.reviewed ? 1 : 0;
        const bReviewed = b.reviewed ? 1 : 0;
        if (aReviewed !== bReviewed) {
          return aReviewed - bReviewed; // unreviewed (0) before reviewed (1)
        }
      }

      // Tier B: Primary Sort Mode
      if (sortMode === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortMode === "users") {
        const parseUsers = (txt) => {
          const clean = (txt || "").replace(/[^0-9]/g, "");
          return parseInt(clean, 10) || 0;
        };
        return parseUsers(b.users) - parseUsers(a.users);
      }
      if (sortMode === "rating") {
        return parseFloat(b.rating || 0) - parseFloat(a.rating || 0);
      }
      if (sortMode === "critique") {
        const getCharCount = (ext) => {
          const isActive = extensions[currentIndex] && ext.id === extensions[currentIndex].id;
          if (isActive) {
            const text = (takeaway || "") + " " + (painPoints || "");
            return text.trim().length;
          }
          return ext.critiqueCharCount || 0;
        };
        return getCharCount(b) - getCharCount(a);
      }
      if (sortMode === "wordCount") {
        const getWordCount = (ext) => {
          const isActive = extensions[currentIndex] && ext.id === extensions[currentIndex].id;
          if (isActive) {
            const text = (takeaway || "") + " " + (painPoints || "");
            return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
          }
          return ext.critiqueWordCount || 0;
        };
        return getWordCount(b) - getWordCount(a);
      }
      if (sortMode === "recent") {
        try {
          const stored = localStorage.getItem("cen_recently_opened");
          const recentList = stored ? JSON.parse(stored) : [];
          const idxA = recentList.indexOf(a.id);
          const idxB = recentList.indexOf(b.id);
          if (idxA !== -1 && idxB !== -1) {
            return idxA - idxB;
          }
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
        } catch (e) {}
        return a.name.localeCompare(b.name);
      }

      // Tier C: Ingest Order (Default)
      const idxA = extensions.findIndex((e) => e.id === a.id);
      const idxB = extensions.findIndex((e) => e.id === b.id);

      // Apply "Newest First" (reverses ingest sequence)
      if (newestFirst) {
        return idxB - idxA;
      }
      return idxA - idxB;
    });

    return list;
  }, [extensions, searchQuery, filterMode, sortMode, groupMode, pinnedIds, currentIndex, takeaway, painPoints]);

  return (
    <aside className="w-80 flex flex-col border-r border-zinc-200 bg-zinc-100/50 backdrop-blur-md shrink-0">
      {/* Navigation & Header Actions Row */}
      <SidebarHeader
        viewMode={viewMode}
        setViewMode={setViewMode}
        setShowSettingsModal={setShowSettingsModal}
      />

      {/* Search & Filter Trigger Row */}
      <div className="p-3 border-b border-zinc-200 bg-zinc-50 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search extensions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-[11px] font-medium border border-zinc-250 bg-white rounded-xl focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition placeholder-zinc-400 font-sans"
            />
            <IconSearch className="h-4 w-4 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 focus:outline-none cursor-pointer p-0.5 rounded"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          
          {/* Floating Dropdown Filter Button Wrapper */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`p-1.5 rounded-xl border flex items-center justify-center cursor-pointer transition select-none ${
                showFilterDropdown
                  ? "bg-zinc-200 border-zinc-350 text-zinc-800 shadow-inner"
                  : "bg-white border-zinc-200 text-zinc-500 hover:text-zinc-750 hover:bg-zinc-50 hover:border-zinc-300"
              }`}
              title="Filter & Sort Options"
            >
              <IconAdjustmentsHorizontal className="h-4 w-4 shrink-0" />
            </button>

            {/* Absolute-positioned floating popover menu */}
            {showFilterDropdown && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-zinc-200 rounded-xl shadow-lg py-2.5 z-40 text-[10px] font-sans font-medium">
                {/* Filter Section */}
                <div className="px-3 py-1 text-[8px] tracking-wider uppercase font-bold text-zinc-400 select-none">
                  Filter
                </div>
                <div className="space-y-0.5 mb-1.5">
                  {[
                    { value: "all", label: "All" },
                    { value: "todo", label: "Todo" },
                    { value: "audited", label: "Done" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFilterMode(opt.value)}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 flex items-center gap-2 text-zinc-650 hover:text-zinc-800 transition cursor-pointer select-none"
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {filterMode === opt.value && <IconCheck className="h-3.5 w-3.5 text-blue-600 font-bold" />}
                      </span>
                      <span className={filterMode === opt.value ? "font-bold text-zinc-800" : ""}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-zinc-100 my-1"></div>

                {/* Sort Section */}
                <div className="px-3 py-1 text-[8px] tracking-wider uppercase font-bold text-zinc-400 select-none">
                  Sort
                </div>
                <div className="space-y-0.5 mb-1.5">
                  {[
                    { value: "default", label: "Default" },
                    { value: "name", label: "Name A-Z" },
                    { value: "users", label: "Users" },
                    { value: "rating", label: "Rating" },
                    { value: "critique", label: "Critique Chars" },
                    { value: "wordCount", label: "Critique Words" },
                    { value: "recent", label: "Recent Open" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSortMode(opt.value)}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 flex items-center gap-2 text-zinc-650 hover:text-zinc-800 transition cursor-pointer select-none"
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {sortMode === opt.value && <IconCheck className="h-3.5 w-3.5 text-blue-600 font-bold" />}
                      </span>
                      <span className={sortMode === opt.value ? "font-bold text-zinc-800" : ""}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-zinc-100 my-1"></div>

                {/* Group Section */}
                <div className="px-3 py-1 text-[8px] tracking-wider uppercase font-bold text-zinc-400 select-none">
                  Group
                </div>
                <div className="space-y-0.5">
                  {[
                    { value: "default", label: "None" },
                    { value: "todo", label: "Todo First" },
                    { value: "newest", label: "Newest First" },
                    { value: "both", label: "Combined" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGroupMode(opt.value)}
                      className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 flex items-center gap-2 text-zinc-650 hover:text-zinc-800 transition cursor-pointer select-none"
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {groupMode === opt.value && <IconCheck className="h-3.5 w-3.5 text-blue-600 font-bold" />}
                      </span>
                      <span className={groupMode === opt.value ? "font-bold text-zinc-800" : ""}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* List Items (LinkedIn Job-Listing Style) */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-200/70 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="h-5 w-5 border-2 border-blue-650 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[11px] text-zinc-400 font-mono">
              Loading extensions feed...
            </span>
          </div>
        ) : extensions.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-zinc-250 bg-white/70 rounded-xl m-4 space-y-1">
            <span className="text-xl block">🔌</span>
            <h4 className="text-xs font-bold text-zinc-700">No Extensions</h4>
            <p className="text-[10px] text-zinc-450 max-w-[200px] mx-auto leading-relaxed">
              Add some extensions in Settings to populate your workspace.
            </p>
          </div>
        ) : (
          filteredAndSorted.map((ext) => {
            const originalIndex = extensions.findIndex((e) => e.id === ext.id);
            const isActive = originalIndex === currentIndex;
            const currentTakeaway = isActive ? takeaway : "";
            const currentPainPoints = isActive ? painPoints : "";
            const combinedText = (
              currentTakeaway +
              " " +
              currentPainPoints
            ).trim();
            
            const charCount = isActive ? combinedText.length : ext.critiqueCharCount || 0;
            const wordCount = isActive
              ? (combinedText ? combinedText.split(/\s+/).filter(Boolean).length : 0)
              : ext.critiqueWordCount || 0;

            const CRITIQUE_TARGET_CHARS = 300;
            const progressPercent = Math.min(
              100,
              Math.round((charCount / CRITIQUE_TARGET_CHARS) * 100),
            );

            return (
              <div
                key={ext.id}
                onClick={() => {
                  selectExtension(originalIndex);
                  setActiveMenuId(null);
                }}
                className={`px-4 py-3 cursor-pointer select-none transition-all duration-150 relative border-l-3 group ${
                  isActive
                    ? "bg-blue-50/25 border-l-blue-600"
                    : "bg-white border-l-transparent hover:bg-zinc-50"
                }`}
              >
                {/* Critique Progress Bar on Bottom Border */}
                {charCount > 0 && (
                  <div 
                    className="absolute left-0 right-0 bottom-0 h-[2px] bg-zinc-100/60 z-10"
                    title={`${wordCount} words critique (${progressPercent}% toward 300 char target)`}
                  >
                    <div
                      className={`h-full transition-all duration-350 ${
                        progressPercent === 100
                          ? "bg-emerald-500"
                          : progressPercent >= 50
                            ? "bg-amber-500"
                            : "bg-blue-600"
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}

                <div className="flex justify-between items-center gap-1.5">
                  <h3 className="font-bold text-xs line-clamp-1 group-hover:text-blue-600 transition text-zinc-800 flex-1 pr-6 flex items-center gap-1">
                    {ext.name}
                    {pinnedIds.includes(ext.id) && (
                      <IconPin className="h-3 w-3 text-blue-600 shrink-0 transform rotate-45 fill-blue-50" />
                    )}
                  </h3>
                  
                  {/* Actions Dropdown Toggle (Ellipsis Icon) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(activeMenuId === ext.id ? null : ext.id);
                    }}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded border transition cursor-pointer z-20 ${
                      activeMenuId === ext.id
                        ? "opacity-100 bg-zinc-100 border-zinc-300 text-zinc-700"
                        : "opacity-0 group-hover:opacity-100 bg-zinc-50 border-zinc-200 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                    }`}
                    title="Actions"
                  >
                    <IconDots className="h-3.5 w-3.5" />
                  </button>

                  {/* Actions Dropdown Menu Overlay */}
                  {activeMenuId === ext.id && (
                    <div 
                      className="absolute right-3 top-8 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 w-24 z-30 text-[10px] pointer-events-auto"
                      onClick={(e) => e.stopPropagation()} // Prevent card selection on clicking background
                    >
                      <button
                        onClick={(e) => {
                          togglePin(ext.id, e);
                          setActiveMenuId(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-50 flex items-center gap-1.5 font-semibold text-zinc-700 cursor-pointer"
                      >
                        <IconPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        {pinnedIds.includes(ext.id) ? "Unpin" : "Pin to top"}
                      </button>
                      <button
                        onClick={(e) => {
                          handleDeleteExtension(ext.id, ext.name, e);
                          setActiveMenuId(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-red-50 hover:text-red-650 text-red-600 flex items-center gap-1.5 font-semibold border-t border-zinc-100 cursor-pointer"
                      >
                        <IconTrash className="h-3.5 w-3.5 shrink-0 text-red-400" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline Compact Metadata Row */}
                <div className="flex items-center gap-1 text-[10px] text-zinc-450 mt-1 truncate pr-8">
                  <span className="text-amber-500 font-bold">★</span>
                  <span className="font-semibold text-zinc-650">{ext.rating}</span>
                  <span className="text-zinc-300">·</span>
                  <span className="truncate">{ext.users}</span>
                  <span className="text-zinc-300">·</span>
                  <span className="truncate max-w-[85px] font-mono text-[9px] uppercase font-semibold text-zinc-550">{ext.category}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
