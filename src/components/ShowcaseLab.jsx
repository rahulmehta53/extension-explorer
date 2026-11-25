import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  IconSearch,
  IconPlus,
  IconTrash,
  IconCode,
  IconFolderOpen,
  IconRefresh,
  IconLayoutGrid,
  IconAlertTriangle,
  IconCategory,
  IconCalendar,
  IconDeviceLaptop,
  IconSettings,
  IconCopy,
  IconCheck,
  IconEye,
  IconPhoto,
  IconExternalLink,
} from "@tabler/icons-react";

// Local Error Boundary to isolate rendering exceptions inside user components
class ShowcaseErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(
      "[-] Render crash inside Showcase component:",
      error,
      errorInfo,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-red-50/40 border border-red-200/50 rounded-2xl max-w-md mx-auto space-y-3">
          <IconAlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
          <h4 className="font-bold text-red-950 text-sm">Render Crash</h4>
          <p className="text-xs text-zinc-750 font-mono wrap-break-word">
            {this.state.error?.message || "Unknown rendering exception"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-[10px] font-bold rounded-lg transition cursor-pointer"
          >
            Retry Render
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// MARK: - Component Setup & State Hooks
//#region Component Setup & State Hooks
export default function ShowcaseLab({
  selectedShowcaseId,
  setSelectedShowcaseId,
  selectedCropId,
  setSelectedCropId,
  sidebarTab,
  setSidebarTab,
  componentsList,
  setComponentsList,
  cropsList,
  setCropsList,
  fetchShowcaseIndex,
  fetchCropsIndex,
  createShowcaseFromCrop,
  setCreateShowcaseFromCrop,
  triggerCreateModal,
}) {
  // Code inspection tab: jsx | raw
  const [codeInspectorTab, setCodeInspectorTab] = useState("jsx");
  const [momentumActiveTab, setMomentumActiveTab] = useState("search");

  // New component dialog state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCompName, setNewCompName] = useState("");
  const [newCompCategory, setNewCompCategory] = useState("");
  const [newCompDesc, setNewCompDesc] = useState("");
  const [newCompCropId, setNewCompCropId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newCompExtensionId, setNewCompExtensionId] = useState("");
  const [extensionsList, setExtensionsList] = useState([]);

  // Handle new component modal trigger from parent sidebar
  useEffect(() => {
    if (triggerCreateModal > 0) {
      setNewCompCropId(null);
      setShowCreateModal(true);
    }
  }, [triggerCreateModal]);

  // Load extensions on create modal opening
  useEffect(() => {
    if (showCreateModal) {
      fetch("/api/extensions")
        .then((res) => res.json())
        .then((data) => setExtensionsList(data))
        .catch((err) => console.error("[-] Error fetching extensions for select dropdown:", err));
    } else {
      setNewCompExtensionId("");
    }
  }, [showCreateModal]);

  // Active component details editing state
  const [editingTitle, setEditingTitle] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [editingDesc, setEditingDesc] = useState("");
  const [editingNotes, setEditingNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved"); // saved | saving | error

  // Code inspection content states
  const [activeCodeContent, setActiveCodeContent] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [rawCropCode, setRawCropCode] = useState("");
  const [loadingRawCropCode, setLoadingRawCropCode] = useState(false);

  const [originalHtmlCode, setOriginalHtmlCode] = useState("");
  const [loadingOriginalHtmlCode, setLoadingOriginalHtmlCode] = useState(false);

  // Canvas visual control parameters
  const [canvasBg, setCanvasBg] = useState("Checker");
  const [showCompareOverlay, setShowCompareOverlay] = useState(false);
  const [compareOpacity, setCompareOpacity] = useState(0.4);
  const [showCodePanel, setShowCodePanel] = useState(() => {
    return localStorage.getItem("cen_showcase_code_panel") !== "false";
  });

  // Dynamic React modules glob resolver
  const modules = import.meta.glob("../showcase/**/*.jsx", { eager: true });

  //#endregion

  // MARK: - Lifecycle Sync Effects
  //#region Lifecycle Sync Effects
  // Handle new component modal trigger from parent sidebar
  useEffect(() => {
    if (triggerCreateModal > 0) {
      setNewCompCropId(null);
      setShowCreateModal(true);
    }
  }, [triggerCreateModal]);

  // Fetch component source code on selection shift
  const fetchCodeContent = async (id) => {
    if (!id) return;
    setLoadingCode(true);
    try {
      const res = await fetch(`/api/showcase/code/${id}`);
      const data = await res.json();
      if (data.success) {
        setActiveCodeContent(data.code);
      }
    } catch (err) {
      console.error("[-] Error fetching component code:", err);
    } finally {
      setLoadingCode(false);
    }
  };

  useEffect(() => {
    if (selectedShowcaseId) {
      fetchCodeContent(selectedShowcaseId);
    } else {
      setActiveCodeContent("");
    }
  }, [selectedShowcaseId]);

  // Read-only Code sync loop
  useEffect(() => {
    if (!selectedShowcaseId) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchCodeContent(selectedShowcaseId);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedShowcaseId]);

  // Load raw HTML content for selected raw crop
  const fetchRawCropCodeContent = async (htmlUrl) => {
    if (!htmlUrl) return;
    setLoadingRawCropCode(true);
    try {
      const res = await fetch(htmlUrl);
      const code = await res.text();
      setRawCropCode(code);
    } catch (err) {
      console.error("[-] Error loading raw HTML crop content:", err);
    } finally {
      setLoadingRawCropCode(false);
    }
  };

  useEffect(() => {
    if (sidebarTab === "raw" && selectedCropId) {
      const activeCrop = cropsList.find((c) => c.id === selectedCropId);
      if (activeCrop) {
        fetchRawCropCodeContent(activeCrop.htmlFile);
      }
    }
  }, [selectedCropId, sidebarTab, cropsList]);

  // Load original raw HTML snippet linked to the active polished component
  const activeItem =
    componentsList.find((c) => c.id === selectedShowcaseId) || null;

  useEffect(() => {
    if (activeItem) {
      const linkedCrop = cropsList.find(
        (c) => c.showcaseId === activeItem.id || c.id === activeItem.fromCropId,
      );
      if (linkedCrop) {
        setLoadingOriginalHtmlCode(true);
        fetch(linkedCrop.htmlFile)
          .then((res) => res.text())
          .then((code) => {
            setOriginalHtmlCode(code);
            setLoadingOriginalHtmlCode(false);
          })
          .catch(() => setLoadingOriginalHtmlCode(false));
      } else {
        setOriginalHtmlCode("");
      }
    } else {
      setOriginalHtmlCode("");
    }
  }, [selectedShowcaseId, activeItem, cropsList]);

  // Handle crop remake trigger context
  useEffect(() => {
    if (createShowcaseFromCrop) {
      const sanitizedName = createShowcaseFromCrop.title
        .replace(/[^a-zA-Z0-9]/g, "")
        .replace(/^[0-9]+/, ""); // Strip leading numbers

      setNewCompName(sanitizedName || "CustomComponent");
      setNewCompCategory(createShowcaseFromCrop.category || "General");
      setNewCompDesc(createShowcaseFromCrop.notes || "");
      setNewCompCropId(createShowcaseFromCrop.id);
      setShowCreateModal(true);

      // Clean context state
      setCreateShowcaseFromCrop(null);
    }
  }, [createShowcaseFromCrop, setCreateShowcaseFromCrop]);

  // Sync details input edit values
  useEffect(() => {
    if (activeItem) {
      setEditingTitle(activeItem.title || "");
      setEditingCategory(activeItem.category || "General");
      setEditingDesc(activeItem.description || "");
      setEditingNotes(activeItem.notes || "");
      setSaveStatus("saved");
    }
  }, [selectedShowcaseId, activeItem]);

  // Debounced auto-save metadata
  useEffect(() => {
    if (!activeItem) return;
    const hasChanges =
      editingTitle !== (activeItem.title || "") ||
      editingCategory !== (activeItem.category || "") ||
      editingDesc !== (activeItem.description || "") ||
      editingNotes !== (activeItem.notes || "");

    if (!hasChanges) {
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/showcase/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: activeItem.id,
            title: editingTitle,
            category: editingCategory,
            description: editingDesc,
            notes: editingNotes,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setComponentsList((prev) =>
            prev.map((c) => (c.id === activeItem.id ? data.component : c)),
          );
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      } catch (err) {
        setSaveStatus("error");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [editingTitle, editingCategory, editingDesc, editingNotes, activeItem]);

  //#endregion

  // MARK: - Component CRUD Handlers
  //#region Component CRUD Handlers
  // Create component handler
  const handleCreateComponent = async (e) => {
    e.preventDefault();
    if (!newCompName.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch("/api/showcase/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCompName.trim(),
          category: newCompCategory.trim() || "General",
          description: newCompDesc.trim(),
          fromCropId: newCompCropId,
          extensionId: newCompCropId ? undefined : newCompExtensionId,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Component "${data.component.title}" initialized!`);
        setShowCreateModal(false);
        setNewCompName("");
        setNewCompCategory("");
        setNewCompDesc("");
        setNewCompCropId(null);
        setNewCompExtensionId("");

        // Reload data and select the component
        await fetchShowcaseIndex(data.component.id);
        await fetchCropsIndex();

        // Launch component JSX inside the code editor
        handleOpenInEditor(data.component.id);
      } else {
        toast.error(data.error || "Failed to create component.");
      }
    } catch (err) {
      toast.error("Communication failure with showcase server.");
    } finally {
      setIsCreating(false);
    }
  };

  // Launch editor handler
  const handleOpenInEditor = async (componentId = selectedShowcaseId) => {
    if (!componentId) return;

    const editorChoice = localStorage.getItem("editorChoice") || "vscode";
    const customCommand = localStorage.getItem("customEditorCommand") || "code";

    try {
      const res = await fetch("/api/open-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: componentId,
          editor: editorChoice,
          customCommand,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Editor window launched successfully!");
      } else {
        toast.error(data.error || "Failed to trigger code editor.");
      }
    } catch (err) {
      toast.error("Failed to connect to backend editor API.");
    }
  };

  // Delete component handler
  const handleDeleteComponent = async () => {
    if (!activeItem) return;
    if (
      !confirm(
        `Are you sure you want to delete component "${activeItem.title}"?`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/showcase/${activeItem.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Component deleted successfully.");
        const remaining = componentsList.filter((c) => c.id !== activeItem.id);
        setComponentsList(remaining);
        await fetchCropsIndex();

        if (remaining.length > 0) {
          setSelectedShowcaseId(remaining[0].id);
        } else {
          setSelectedShowcaseId("");
        }
      } else {
        toast.error(data.error || "Failed to delete component file.");
      }
    } catch (err) {
      toast.error("Communication failure with showcase API.");
    }
  };

  // Active crop objects
  const activeCrop =
    cropsList.find((c) => c.id === selectedCropId) ||
    (cropsList.length > 0 ? cropsList[0] : null);

  let resolvedCropId = activeItem?.fromCropId;
  if (activeItem?.id === "MomentumDashboard") {
    if (momentumActiveTab === "focus") {
      resolvedCropId = "insp_1783611563970";
    } else if (momentumActiveTab === "calendar") {
      resolvedCropId = "insp_1783611580057";
    } else {
      resolvedCropId = "insp_1783611519351";
    }
  }

  const linkedCropRef = activeItem
    ? cropsList.find(
        (c) => c.id === resolvedCropId || c.showcaseId === activeItem.id,
      )
    : null;

  // Resolve dynamic React component module
  const componentKey = Object.keys(modules).find((key) =>
    key.endsWith(`/${selectedShowcaseId}.jsx`)
  );
  const DynamicComp = componentKey ? modules[componentKey]?.default : null;

  // Resolve the display path relative to workspace root
  let displayFilePath = `src/showcase/${activeItem?.id}.jsx`;
  if (componentKey) {
    displayFilePath = componentKey.replace(/^\.\.\/showcase\//, "src/showcase/");
  } else if (activeItem) {
    const fallbackSubdir = activeItem.extensionName
      ? activeItem.extensionName.toLowerCase().split(":")[0].replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "")
      : "";
    displayFilePath = fallbackSubdir 
      ? `src/showcase/${fallbackSubdir}/${activeItem.id}.jsx`
      : `src/showcase/${activeItem.id}.jsx`;
  }

  //#endregion

  // MARK: - Canvas Rendering Viewport
  //#region Canvas Rendering Viewport
  return (
    <div className="flex-1 flex h-full overflow-hidden select-none bg-zinc-50/20">
      {/* ACTIVE WORKSPACE WORKAREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {sidebarTab === "polished" ? (
          /* WORKSPACE VIEW: POLISHED JSX EXPERIMENTS */
          <AnimatePresence mode="wait">
            {!activeItem ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4"
              >
                <div className="h-16 w-16 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center shadow-sm">
                  <IconDeviceLaptop className="h-6 w-6 text-zinc-400" />
                </div>
                <div className="max-w-xs space-y-1">
                  <h4 className="font-bold text-zinc-800 text-sm">
                    Select Sandbox Component
                  </h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                    Select a JSX component from the sidebar tab, or open a raw
                    captured element to sanitize it.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={activeItem.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col min-h-0 overflow-y-auto select-text"
              >
                {/* Header HUD */}
                <div className="p-5 border-b border-zinc-200 bg-white sticky top-0 z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm shadow-zinc-100 select-none">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-550 border border-zinc-200 uppercase font-semibold">
                        {editingCategory}
                      </span>
                      <span className="text-[10px] text-zinc-450 font-mono">
                        File: {displayFilePath}
                      </span>
                      {activeItem.fromCropId && (
                        <span className="text-[10px] text-emerald-600 font-mono font-medium flex items-center gap-0.5">
                          <IconPhoto className="h-3.5 w-3.5" /> Linked Crop
                        </span>
                      )}
                    </div>
                    <h3 className="font-extrabold text-base tracking-tight text-zinc-900 leading-tight truncate">
                      {editingTitle}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        const nextVal = !showCodePanel;
                        setShowCodePanel(nextVal);
                        localStorage.setItem(
                          "cen_showcase_code_panel",
                          String(nextVal),
                        );
                      }}
                      className={`px-3 py-2 border rounded-xl text-xs font-semibold shadow transition cursor-pointer select-none flex items-center gap-1.5 ${
                        showCodePanel
                          ? "bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-800"
                          : "border-zinc-200 hover:bg-zinc-550 hover:text-white text-zinc-500"
                      }`}
                      title={
                        showCodePanel
                          ? "Hide source code inspector"
                          : "Show source code inspector"
                      }
                    >
                      <IconCode className="h-4 w-4" />
                      {showCodePanel
                        ? "Code Panel: Shown"
                        : "Code Panel: Hidden"}
                    </button>

                    <button
                      onClick={() => handleOpenInEditor()}
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow transition cursor-pointer select-none flex items-center gap-1.5 border border-zinc-950"
                    >
                      <IconFolderOpen className="h-4 w-4" /> Open in Editor
                    </button>

                    <button
                      onClick={handleDeleteComponent}
                      className="px-3.5 py-2 border border-zinc-200 hover:bg-zinc-50 text-red-655 hover:text-red-700 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1"
                      title="Delete component from database"
                    >
                      <IconTrash className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>

                {/* Split Sandbox Workspace */}
                <div
                  className={`p-6 grid grid-cols-1 gap-6 flex-1 min-h-0 ${showCodePanel ? "lg:grid-cols-12" : "lg:grid-cols-1"}`}
                >
                  {/* LEFT COLUMN: INTERACTIVE PREVIEW & REFERENCE COMPOSITOR */}
                  <div
                    className={`${showCodePanel ? "lg:col-span-6 min-h-[600px]" : "lg:col-span-12 min-h-[780px]"} flex flex-col space-y-6`}
                  >
                    <div
                      className={`border border-zinc-200 rounded-none flex-1 flex flex-col overflow-hidden bg-zinc-950 relative shadow-sm ${showCodePanel ? "min-h-[440px]" : "min-h-[640px]"}`}
                    >
                      {/* Preview Toolbar */}
                      <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 select-none text-zinc-400 shrink-0">
                        <span className="text-[10px] font-bold font-mono tracking-wider uppercase text-zinc-450 flex items-center gap-1.5 shrink-0">
                          <IconEye className="h-3.5 w-3.5 text-zinc-500" />{" "}
                          Interactive Render Preview
                        </span>

                        <div className="flex flex-wrap items-center gap-3 md:justify-end text-[9.5px]">
                          {/* Opacity slider next to comparison triggers */}
                          {showCompareOverlay && linkedCropRef && (
                            <div className="flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800 text-zinc-400">
                              <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-zinc-500">Opacity:</span>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={compareOpacity}
                                onChange={(e) =>
                                  setCompareOpacity(parseFloat(e.target.value))
                                }
                                className="w-16 h-0.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                              />
                              <span className="font-mono text-[9px] w-6 text-right shrink-0">{Math.round(compareOpacity * 100)}%</span>
                            </div>
                          )}

                          {linkedCropRef && (
                            <button
                              onClick={() =>
                                setShowCompareOverlay((prev) => !prev)
                              }
                              className={`px-2.5 py-1 rounded-lg text-[9.5px] font-bold transition flex items-center gap-1 border cursor-pointer select-none ${
                                showCompareOverlay
                                  ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20"
                                  : "bg-zinc-850 hover:bg-zinc-800 hover:text-white border-zinc-850 text-zinc-400"
                              }`}
                              title="Compare with original screenshot crop"
                            >
                              <IconPhoto className="h-3.5 w-3.5" /> Compare original
                            </button>
                          )}

                          {/* Canvas Background theme selector */}
                          <div className="flex items-center bg-zinc-950 p-0.5 border border-zinc-850 rounded-lg shrink-0">
                            {[
                              { id: "grid", label: "Grid" },
                              { id: "dark", label: "Dark" },
                              { id: "light", label: "Light" },
                              { id: "checkerboard", label: "Checker" },
                            ].map((t) => (
                              <button
                                key={t.id}
                                onClick={() => setCanvasBg(t.id)}
                                className={`px-2.5 py-0.5 rounded text-[9.5px] font-semibold transition cursor-pointer select-none ${
                                  canvasBg === t.id
                                    ? "bg-zinc-800 text-white shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-300"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>

                          <button
                            onClick={() => {
                              fetchShowcaseIndex(selectedShowcaseId);
                              toast.success("Preview re-synchronized.");
                            }}
                            className="p-1 rounded hover:bg-zinc-800 hover:text-white transition cursor-pointer text-zinc-400 animate-fade-in"
                            title="Force re-sync files"
                          >
                            <IconRefresh className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Viewport Canvas wrapper with opacity reference compositor */}
                      <div
                        className={`flex-1 p-0 overflow-y-auto flex items-center justify-center relative min-h-0 transition-colors duration-200 ${
                          canvasBg === "grid"
                            ? "bg-zinc-150 pattern-grid"
                            : canvasBg === "dark"
                              ? "bg-zinc-950 border border-zinc-850"
                              : canvasBg === "light"
                                ? "bg-white"
                                : "bg-[url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy5zMy5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIHZpZXdCb3g9IjAgMCA4IDgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZHRoPSI0IiBmaWxsPSIjZjRmNGY1Ii8+CjxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmNGY0ZjUiLz4KPC9zdmc+)] bg-repeat bg-zinc-200"
                        }`}
                      >
                        {/* Live React component */}
                        <div className="w-full relative z-0">
                          <ShowcaseErrorBoundary key={selectedShowcaseId}>
                            {DynamicComp ? (
                              <DynamicComp activeTab={momentumActiveTab} onTabChange={setMomentumActiveTab} />
                            ) : (
                              <div className="p-8 text-center bg-zinc-200/50 border border-zinc-300 border-dashed rounded-2xl text-zinc-550 max-w-sm mx-auto space-y-2 select-none">
                                <span className="text-2xl block animate-bounce font-mono">
                                  🛠️
                                </span>
                                <h5 className="font-bold text-xs">
                                  Waiting for React build...
                                </h5>
                                <p className="text-[10px] text-zinc-450 leading-relaxed font-sans">
                                  Open the component in your editor and save
                                  your first lines of code. Vite will compile
                                  and render it here.
                                </p>
                              </div>
                            )}
                          </ShowcaseErrorBoundary>
                        </div>

                        {/* Pixel-Perfect Overlay screenshot compositor */}
                        {showCompareOverlay && linkedCropRef && (
                          <div
                            className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center p-8 overflow-hidden"
                            style={{ opacity: compareOpacity }}
                          >
                            <img
                              src={linkedCropRef.screenshot}
                              alt="Compare reference"
                              className="max-w-full max-h-full object-contain pointer-events-none mix-blend-difference"
                              style={{
                                width: linkedCropRef.styles?.width || "auto",
                                height: linkedCropRef.styles?.height || "auto",
                              }}
                            />
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {showCodePanel && (
                    <div className="lg:col-span-6 flex flex-col space-y-5 min-h-[450px]">
                      {/* RIGHT COLUMN: DUAL-TAB SOURCE CODE INSPECTOR */}
                      <div className="flex-1 border border-zinc-200 rounded-2xl flex flex-col overflow-hidden bg-zinc-950 font-mono text-[10.5px]">
                        {/* Code Header Tab selector */}
                        <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center select-none text-zinc-400 shrink-0">
                          <div className="flex bg-zinc-950 p-0.5 border border-zinc-800 rounded-lg">
                            <button
                              onClick={() => setCodeInspectorTab("jsx")}
                              className={`px-3 py-1 rounded-md text-[9.5px] font-bold transition cursor-pointer ${
                                codeInspectorTab === "jsx"
                                  ? "bg-zinc-800 text-white"
                                  : "text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              Source JSX
                            </button>
                            {originalHtmlCode && (
                              <button
                                onClick={() => setCodeInspectorTab("raw")}
                                className={`px-3 py-1 rounded-md text-[9.5px] font-bold transition cursor-pointer ${
                                  codeInspectorTab === "raw"
                                    ? "bg-zinc-800 text-white"
                                    : "text-zinc-500 hover:text-zinc-300"
                                }`}
                              >
                                Original HTML
                              </button>
                            )}
                          </div>

                          <button
                            onClick={() => {
                              const targetText =
                                codeInspectorTab === "jsx"
                                  ? activeCodeContent
                                  : originalHtmlCode;
                              navigator.clipboard.writeText(targetText);
                              setCopiedCode(true);
                              toast.success(
                                codeInspectorTab === "jsx"
                                  ? "Source code copied!"
                                  : "Original HTML copied!",
                              );
                              setTimeout(() => setCopiedCode(false), 2000);
                            }}
                            className="flex items-center gap-1.5 hover:text-white text-zinc-450 transition cursor-pointer"
                          >
                            {copiedCode ? (
                              <>
                                <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
                                <span className="text-emerald-500 font-bold font-mono">
                                  Copied
                                </span>
                              </>
                            ) : (
                              <>
                                <IconCopy className="h-3.5 w-3.5" />
                                <span className="font-bold font-mono">
                                  Copy
                                </span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Display Selected Code pane content */}
                        <div className="flex-1 p-4 overflow-y-auto text-zinc-300 select-text leading-relaxed whitespace-pre font-mono">
                          {codeInspectorTab === "jsx" ? (
                            loadingCode ? (
                              <div className="text-zinc-550 italic select-none">
                                Loading source code...
                              </div>
                            ) : activeCodeContent ? (
                              activeCodeContent
                            ) : (
                              <div className="text-zinc-550 italic select-none">
                                No source code loaded.
                              </div>
                            )
                          ) : loadingOriginalHtmlCode ? (
                            <div className="text-zinc-550 italic select-none">
                              Loading original HTML...
                            </div>
                          ) : originalHtmlCode ? (
                            originalHtmlCode
                          ) : (
                            <div className="text-zinc-550 italic select-none">
                              No original HTML snippet found.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Metadata boxes */}
                      <div className="p-4 border border-zinc-200 rounded-2xl bg-zinc-50/20 grid grid-cols-2 gap-3.5 select-none shrink-0">
                        <div className="space-y-1">
                          <label className="text-[9.5px] font-extrabold text-zinc-450 uppercase tracking-wider block font-mono">
                            Title
                          </label>
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-white focus:outline-none focus:border-zinc-300 transition select-text"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9.5px] font-extrabold text-zinc-450 uppercase tracking-wider block font-mono">
                            Category
                          </label>
                          <input
                            type="text"
                            value={editingCategory}
                            onChange={(e) => setEditingCategory(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-white focus:outline-none focus:border-zinc-300 transition select-text"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          /* WORKSPACE VIEW: RAW CAPTURED CROPS */
          <AnimatePresence mode="wait">
            {!activeCrop ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4"
              >
                <div className="h-16 w-16 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center shadow-sm">
                  <IconPhoto className="h-6 w-6 text-zinc-400" />
                </div>
                <div className="max-w-xs space-y-1">
                  <h4 className="font-bold text-zinc-800 text-sm">
                    No Captures Found
                  </h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                    Use the browser element snip helper inside extension sandbox
                    pages to capture raw elements here.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={activeCrop.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col min-h-0 overflow-y-auto select-text"
              >
                {/* Header HUD */}
                <div className="p-5 border-b border-zinc-200 bg-white sticky top-0 z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm shadow-zinc-100 select-none animate-fade-in">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-150 text-zinc-650 border border-zinc-250 uppercase font-semibold">
                        {activeCrop.extensionName}
                      </span>
                      <span className="text-[10px] text-zinc-450 font-mono">
                        Tag: {activeCrop.tagName}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-base tracking-tight text-zinc-900 leading-tight truncate">
                      Raw capture: {activeCrop.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {activeCrop.sanitized && activeCrop.showcaseId ? (
                      <button
                        onClick={() => {
                          setSelectedShowcaseId(activeCrop.showcaseId);
                          setSidebarTab("polished");
                        }}
                        className="px-4 py-2 bg-white border border-zinc-250 hover:bg-zinc-50 text-zinc-700 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer select-none flex items-center gap-1.5"
                      >
                        <IconExternalLink className="h-4 w-4" /> Open Remade JSX
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setNewCompCropId(activeCrop.id);
                          setNewCompName(
                            activeCrop.title
                              .replace(/[^a-zA-Z0-9]/g, "")
                              .replace(/^[0-9]+/, ""),
                          );
                          setNewCompCategory(activeCrop.category || "General");
                          setNewCompDesc(activeCrop.notes || "");
                          setShowCreateModal(true);
                        }}
                        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow transition cursor-pointer select-none flex items-center gap-1.5 border border-zinc-950"
                      >
                        <IconPlus className="h-4 w-4" /> Sanitize & Remake
                      </button>
                    )}
                  </div>
                </div>

                {/* Raw Split panel layouts */}
                <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
                  {/* LEFT COLUMN: ORIGINAL SCREENSHOT & PARAMETERS */}
                  <div className="lg:col-span-6 flex flex-col space-y-6 min-h-[450px]">
                    {/* Visual Capture Box */}
                    <div className="border border-zinc-200 rounded-2xl flex-1 flex flex-col overflow-hidden bg-zinc-900 relative shadow-sm min-h-[300px]">
                      <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 select-none text-zinc-400 text-[10px] font-bold font-mono tracking-wider uppercase flex items-center gap-1.5 shrink-0">
                        <IconPhoto className="h-3.5 w-3.5 text-zinc-500" />{" "}
                        Original Element Screenshot
                      </div>

                      {/* Display Image canvas */}
                      <div
                        className={`flex-1 p-8 overflow-y-auto flex items-center justify-center min-h-0 ${
                          canvasBg === "grid"
                            ? "bg-zinc-150 pattern-grid"
                            : canvasBg === "dark"
                              ? "bg-zinc-950"
                              : canvasBg === "light"
                                ? "bg-white"
                                : "bg-[url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy5zMy5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIHZpZXdCb3g9IjAgMCA4IDgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZHRoPSI0IiBmaWxsPSIjZjRmNGY1Ii8+CjxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmNGY0ZjUiLz4KPC9zdmc+)] bg-repeat bg-zinc-200"
                        }`}
                      >
                        <img
                          src={activeCrop.screenshot}
                          alt={activeCrop.title}
                          className="max-w-full max-h-full object-contain border border-zinc-250/20 shadow-lg rounded"
                        />
                      </div>

                      {/* Background selection */}
                      <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-2 flex items-center justify-between select-none text-[9.5px] text-zinc-400 shrink-0">
                        <span className="font-mono uppercase font-bold text-zinc-550">
                          Canvas background:
                        </span>
                        <div className="flex items-center bg-zinc-950 p-0.5 border border-zinc-850 rounded-xl">
                          {[
                            { id: "grid", label: "Grid" },
                            { id: "dark", label: "Dark" },
                            { id: "light", label: "Light" },
                            { id: "checkerboard", label: "Checker" },
                          ].map((t) => (
                            <button
                              key={t.id}
                              onClick={() => setCanvasBg(t.id)}
                              className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer select-none ${
                                canvasBg === t.id
                                  ? "bg-zinc-800 text-white shadow-sm"
                                  : "text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Original styles parameters list details */}
                    <div className="p-4 border border-zinc-200 rounded-2xl bg-zinc-50/20 space-y-3.5 select-none shrink-0 font-mono text-[10px]">
                      <h4 className="font-bold text-zinc-450 uppercase tracking-wider block font-mono border-b border-zinc-200/60 pb-2">
                        Original Computed Styling Properties
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-zinc-650">
                        <div className="flex justify-between border-b border-zinc-150/40 pb-1">
                          <span className="font-semibold">Width / Height:</span>
                          <span>
                            {activeCrop.styles?.width} ×{" "}
                            {activeCrop.styles?.height}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-150/40 pb-1">
                          <span className="font-semibold">Padding:</span>
                          <span>{activeCrop.styles?.padding}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-150/40 pb-1">
                          <span className="font-semibold">Background:</span>
                          <span
                            className="truncate max-w-[120px]"
                            title={activeCrop.styles?.backgroundColor}
                          >
                            {activeCrop.styles?.backgroundColor}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-150/40 pb-1">
                          <span className="font-semibold">Font Family:</span>
                          <span
                            className="truncate max-w-[120px]"
                            title={activeCrop.styles?.fontFamily}
                          >
                            {activeCrop.styles?.fontFamily}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-150/40 pb-1">
                          <span className="font-semibold">Border Radius:</span>
                          <span>{activeCrop.styles?.borderRadius}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-150/40 pb-1">
                          <span className="font-semibold">Font Size:</span>
                          <span>
                            {activeCrop.styles?.fontSize} /{" "}
                            {activeCrop.styles?.fontWeight}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: RAW HTML FILE VIEWER */}
                  <div className="lg:col-span-6 flex flex-col min-h-[450px]">
                    <div className="flex-1 border border-zinc-200 rounded-2xl flex flex-col overflow-hidden bg-zinc-950 font-mono text-[10.5px]">
                      <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center select-none text-zinc-400 shrink-0">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-450 flex items-center gap-1.5">
                          <IconCode className="h-3.5 w-3.5 text-zinc-500" />{" "}
                          Captured raw outerHTML Code
                        </span>

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(rawCropCode);
                            setCopiedCode(true);
                            toast.success("Raw HTML copied to clipboard!");
                            setTimeout(() => setCopiedCode(false), 2000);
                          }}
                          className="flex items-center gap-1.5 hover:text-white text-zinc-450 transition cursor-pointer"
                        >
                          {copiedCode ? (
                            <>
                              <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-emerald-500 font-bold font-mono">
                                Copied
                              </span>
                            </>
                          ) : (
                            <>
                              <IconCopy className="h-3.5 w-3.5" />
                              <span className="font-bold font-mono">Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex-1 p-4 overflow-y-auto text-zinc-300 select-text leading-relaxed whitespace-pre font-mono">
                        {loadingRawCropCode ? (
                          <div className="text-zinc-550 italic select-none">
                            Loading raw HTML file content...
                          </div>
                        ) : rawCropCode ? (
                          rawCropCode
                        ) : (
                          <div className="text-zinc-550 italic select-none">
                            No HTML snippet file found.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* DIALOG MODAL: CREATE NEW JSX COMPONENT */}
        <AnimatePresence>
          {showCreateModal && (
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setNewCompCropId(null);
                  setShowCreateModal(false);
                }
              }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 select-none"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-2xl p-6 space-y-4"
              >
                <div className="border-b border-zinc-100 pb-3 flex justify-between items-center">
                  <h3 className="font-extrabold text-zinc-800 text-sm flex items-center gap-1.5">
                    <IconCode className="h-4.5 w-4.5 text-zinc-500" />
                    <span>Create JSX Component</span>
                  </h3>
                  <button
                    onClick={() => {
                      setNewCompCropId(null);
                      setShowCreateModal(false);
                    }}
                    className="text-zinc-400 hover:text-zinc-700 text-xs font-bold font-mono cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form
                  onSubmit={handleCreateComponent}
                  className="space-y-4 select-text"
                >
                  {/* Link Warning Banner */}
                  {newCompCropId && (
                    <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl text-[11px] text-emerald-850 font-mono select-none flex items-center gap-1.5">
                      <IconPhoto className="h-4.5 w-4.5 text-emerald-600" />
                      <span>
                        Linking component to raw crop ID: {newCompCropId}
                      </span>
                    </div>
                  )}

                  {/* Name Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block font-mono">
                      Component Name (e.g. SlideToggle)
                    </label>
                    <input
                      type="text"
                      required
                      value={newCompName}
                      onChange={(e) => setNewCompName(e.target.value)}
                      placeholder="Letter characters only, camelcase preferred"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-zinc-300 focus:bg-white transition font-mono"
                    />
                  </div>

                  {/* Category Tag Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block font-mono">
                      Category Tag (e.g. Buttons, Inputs)
                    </label>
                    <input
                      type="text"
                      value={newCompCategory}
                      onChange={(e) => setNewCompCategory(e.target.value)}
                      placeholder="General"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-zinc-300 focus:bg-white transition"
                    />
                  </div>

                  {/* Extension Association Dropdown */}
                  {!newCompCropId && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block font-mono">
                        Associated Extension (Optional)
                      </label>
                      <select
                        value={newCompExtensionId}
                        onChange={(e) => setNewCompExtensionId(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-zinc-300 focus:bg-white transition cursor-pointer"
                      >
                        <option value="">-- None (Independent Component) --</option>
                        {extensionsList.map((ext) => (
                          <option key={ext.id} value={ext.id}>
                            {ext.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Description Details Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block font-mono">
                      Description details
                    </label>
                    <textarea
                      value={newCompDesc}
                      onChange={(e) => setNewCompDesc(e.target.value)}
                      placeholder="A short description of this component's purpose..."
                      rows={2}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-zinc-300 focus:bg-white transition resize-none font-sans leading-relaxed"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="pt-2 flex items-center justify-end gap-2.5 select-none">
                    <button
                      type="button"
                      onClick={() => {
                        setNewCompCropId(null);
                        setShowCreateModal(false);
                      }}
                      className="px-4 py-2 border border-zinc-200 hover:bg-zinc-50 rounded-xl text-xs font-semibold transition cursor-pointer text-zinc-650"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating || !newCompName.trim()}
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow transition cursor-pointer"
                    >
                      {isCreating ? "Initializing..." : "Create & Open Code"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
//#endregion
