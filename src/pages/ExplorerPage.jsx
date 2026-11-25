import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useHotkeys } from "react-hotkeys-hook";
import SimpleMDE from "react-simplemde-editor";
import "easymde/dist/easymde.min.css";
import {
  IconPlayerPlay,
  IconBrandVscode,
  IconCamera,
  IconExternalLink,
  IconCopy,
  IconCheck,
  IconClock,
  IconFileText,
  IconBolt,
  IconPlus,
  IconClipboard,
  IconSparkle,
  IconMessageCircle,
  IconChevronDown,
  IconX,
  IconInfoCircle,
  IconDownload,
} from "@tabler/icons-react";
import ExtensionsSidebar from "../components/ExtensionsSidebar";

export default function ExplorerPage({
  extensions,
  currentIndex,
  selectExtension,
  handleDeleteExtension,
  loading,
  setViewMode,
  setShowSettingsModal,
  editorChoice,
  customEditorCommand,
  screenshotMode,
  onUpdateExtension,
  filterMode,
  setFilterMode,
  sortMode,
  setSortMode,
  groupMode,
  setGroupMode,
  searchQuery,
  setSearchQuery,
}) {
  // Timer State
  const [timerSeconds, setTimerSeconds] = useState(180);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerIntervalRef = useRef(null);
  const initialValuesRef = useRef({ id: "", takeaway: "", painPoints: "", rating: 5 });

  // Active Extension details
  const [screenshots, setScreenshots] = useState([]);
  const [copiedId, setCopiedId] = useState(false);
  const [screenshotFilter, setScreenshotFilter] = useState("all"); // 'all' | 'crop' | 'user' | 'cws'

  const filteredScreenshots = React.useMemo(() => {
    return screenshots.filter((url) => {
      const isCrop = url.includes("/api/component-file/") || url.includes("/api/component-asset/");
      const isCws = url.includes("/api/screenshot-file/cws/");
      if (screenshotFilter === "crop") return isCrop;
      if (screenshotFilter === "cws") return isCws;
      if (screenshotFilter === "user") return !isCrop && !isCws;
      return true;
    });
  }, [screenshots, screenshotFilter]);

  // Form State
  const [rating, setRating] = useState(5);
  const [painPoints, setPainPoints] = useState("");
  const [takeaway, setTakeaway] = useState("");
  const [logsHistory, setLogsHistory] = useState([]);

  // UI States
  const [showManual, setShowManual] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
  const [isSnipping, setIsSnipping] = useState(false);
  const [showSelectorInput, setShowSelectorInput] = useState(false);
  const [customSelector, setCustomSelector] = useState("");
  const [isSnippingSelector, setIsSnippingSelector] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [showUrlPopover, setShowUrlPopover] = useState(false);
  const [isImportingImage, setIsImportingImage] = useState(false);
  const [screenshotNotes, setScreenshotNotes] = useState({});
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [activeNoteText, setActiveNoteText] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState("saved"); // saved | saving | error
  const [saveStatus, setSaveStatus] = useState("saved"); // saving | saved | error
  const [isDownloadingCodebase, setIsDownloadingCodebase] = useState(false);
  
  // Store specifications drawer and metadata details states
  const [activeExtMetadata, setActiveExtMetadata] = useState(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [showSpecsDrawer, setShowSpecsDrawer] = useState(false);
  
  // Review sorting state (persisted in localStorage across sessions and extensions)
  const [reviewSortMode, setReviewSortMode] = useState(() => {
    return localStorage.getItem("cen_review_sort_mode") || "default";
  });

  useEffect(() => {
    localStorage.setItem("cen_review_sort_mode", reviewSortMode);
  }, [reviewSortMode]);

  const mdeOptions = React.useMemo(() => {
    return {
      autofocus: false,
      spellChecker: false,
      placeholder:
        "Write your free-form critique notes (headings, bullets, code snippets, etc.) here. Everything auto-saves live to your markdown notes!",
      status: false,
      minHeight: "180px",
      toolbar: [
        "bold",
        "italic",
        "heading",
        "|",
        "quote",
        "unordered-list",
        "ordered-list",
        "|",
        "link",
        "code",
        "side-by-side",
        "fullscreen",
      ],
    };
  }, []);

  const activeExt = currentIndex !== -1 ? extensions[currentIndex] : null;

  // Memoized sorted reviews for rendering (reads from lazy loaded metadata)
  const sortedReviews = React.useMemo(() => {
    if (!activeExtMetadata || !activeExtMetadata.reviews) return [];
    const reviewsCopy = [...activeExtMetadata.reviews];
    if (reviewSortMode === "lowest") {
      return reviewsCopy.sort((a, b) => a.rating - b.rating);
    }
    if (reviewSortMode === "highest") {
      return reviewsCopy.sort((a, b) => b.rating - a.rating);
    }
    return reviewsCopy; // default scraped order
  }, [activeExtMetadata, reviewSortMode]);

  // Fetch screenshots for active extension
  const fetchScreenshots = async (id) => {
    try {
      const res = await fetch(`/api/screenshots/${id}`);
      const data = await res.json();
      setScreenshots(data);
    } catch (err) {
      console.error("Error loading screenshots:", err);
    }
  };

  // Fetch screenshot notes database
  const fetchScreenshotNotes = async () => {
    try {
      const res = await fetch("/api/screenshot-notes");
      const data = await res.json();
      setScreenshotNotes(data);
    } catch (err) {
      console.error("Error loading screenshot notes:", err);
    }
  };

  useEffect(() => {
    fetchScreenshotNotes();
  }, []);

  // Fetch CWS deep metadata on-demand
  const fetchMetadata = async (id) => {
    setLoadingMetadata(true);
    console.log(`[DEBUG FRONTEND] Fetching metadata for ID: ${id}`);
    try {
      const res = await fetch(`/api/extensions/${id}/metadata`);
      console.log(`[DEBUG FRONTEND] Metadata HTTP Status: ${res.status}`);
      const data = await res.json();
      console.log(`[DEBUG FRONTEND] Metadata Data Received:`, data);
      setActiveExtMetadata(data);
    } catch (err) {
      console.error("Error loading metadata:", err);
      setActiveExtMetadata(null);
    } finally {
      setLoadingMetadata(false);
    }
  };

  // Poll screenshots and fetch metadata on active extension load
  useEffect(() => {
    if (currentIndex === -1 || !activeExt) {
      setActiveExtMetadata(null);
      setTakeaway("");
      setPainPoints("");
      setRating(5);
      initialValuesRef.current = { id: "", takeaway: "", painPoints: "", rating: 5 };
      return;
    }
    const activeId = activeExt.id;

    // Reset critique states immediately on card switch to prevent race conditions
    setTakeaway("");
    setPainPoints("");
    setRating(5);
    initialValuesRef.current = { id: activeId, takeaway: "", painPoints: "", rating: 5 };

    fetchScreenshots(activeId);
    fetchMetadata(activeId);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchScreenshots(activeId);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentIndex, activeExt]);

  // Timer Countdown Logic
  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            setIsTimerRunning(false);
            toast.warning("Timer completed. Finish your design analysis.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }

    return () => clearInterval(timerIntervalRef.current);
  }, [isTimerRunning]);

  // Helper function to save log to backend API
  const saveLogToBackend = async (id, r, pp, tw) => {
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          rating: r,
          painPoints: pp,
          takeaway: tw,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onUpdateExtension(id, {
          reviewed: true,
          userRating: r,
          painPoints: pp,
          takeaway: tw,
          critiqueCharCount: ((tw || "") + " " + (pp || "")).trim().length,
          critiqueWordCount: ((tw || "") + " " + (pp || "")).trim().split(/\s+/).filter(Boolean).length,
        });
      }
    } catch (err) {
      console.error("Failed to auto-save in background:", err);
    }
  };

  // Ref tracking index shifts to trigger auto-save of previous extension card
  const prevIndexRef = useRef(currentIndex);

  useEffect(() => {
    const prevIdx = prevIndexRef.current;
    if (prevIdx !== currentIndex && prevIdx !== -1 && extensions[prevIdx]) {
      const prevExt = extensions[prevIdx];
      const hasChanges =
        initialValuesRef.current.id === prevExt.id && (
          takeaway !== initialValuesRef.current.takeaway ||
          painPoints !== initialValuesRef.current.painPoints ||
          rating !== initialValuesRef.current.rating
        );

      if (hasChanges && (takeaway.trim() !== "" || painPoints.trim() !== "")) {
        saveLogToBackend(prevExt.id, rating, painPoints, takeaway);
      }
    }
    prevIndexRef.current = currentIndex;
  }, [currentIndex, extensions]);

  // Load active extension's values from lazy-loaded metadata when it completes fetching
  useEffect(() => {
    if (activeExtMetadata) {
      let initialTakeaway = activeExtMetadata.takeaway || "";
      if (!initialTakeaway && activeExtMetadata.painPoints) {
        initialTakeaway = `### Critical Pain Points\n- ${activeExtMetadata.painPoints}\n\n### Design & Redesign Takeaways\n- *(Add takeaways here)*`;
      }
      
      const r = activeExtMetadata.userRating !== undefined
        ? activeExtMetadata.userRating
        : activeExtMetadata.rating !== undefined
          ? Math.round(Number(activeExtMetadata.rating))
          : 5;
      const pp = activeExtMetadata.painPoints || "";
      const tw = initialTakeaway;

      setRating(r);
      setPainPoints(pp);
      setTakeaway(tw);

      // Save initial values to ref for changes comparison
      initialValuesRef.current = { id: activeExtMetadata.id, takeaway: tw, painPoints: pp, rating: r };
      
      setTimerSeconds(180);
      setIsTimerRunning(true);
    }
  }, [activeExtMetadata]);

  // Critique Auto-Save debounced loop
  useEffect(() => {
    if (currentIndex === -1 || !activeExt) return;
    const ext = activeExt;

    // Only save if the values are actually different from what we loaded initially
    const hasChanges =
      initialValuesRef.current.id === ext.id && (
        takeaway !== initialValuesRef.current.takeaway ||
        painPoints !== initialValuesRef.current.painPoints ||
        rating !== initialValuesRef.current.rating
      );

    if (!hasChanges) {
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("saving");

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: ext.id,
            rating,
            painPoints,
            takeaway,
          }),
        });
        const data = await res.json();
        if (data.success) {
          onUpdateExtension(ext.id, {
            reviewed: true,
            critiqueCharCount: ((takeaway || "") + " " + (painPoints || "")).trim().length,
            critiqueWordCount: ((takeaway || "") + " " + (painPoints || "")).trim().split(/\s+/).filter(Boolean).length,
          });
          // Update the ref so we don't trigger repeated saves for same content
          initialValuesRef.current = { id: ext.id, takeaway, painPoints, rating };
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      } catch (err) {
        setSaveStatus("error");
      }
    }, 1200); // 1.2-second debounce for comfortable typing

    return () => clearTimeout(timer);
  }, [rating, painPoints, takeaway, currentIndex, activeExt]);

  // Sync active slide filename with notes text input when changing slides in lightbox
  useEffect(() => {
    if (lightboxIndex !== -1 && filteredScreenshots[lightboxIndex]) {
      const filename = filteredScreenshots[lightboxIndex].split("/").pop();
      setActiveNoteText(screenshotNotes[filename] || "");
    } else {
      setActiveNoteText("");
    }
  }, [lightboxIndex, filteredScreenshots, screenshotNotes]);

  // Debounced auto-save logic for screenshot/crop notes
  useEffect(() => {
    if (lightboxIndex === -1 || !filteredScreenshots[lightboxIndex]) return;
    const filename = filteredScreenshots[lightboxIndex].split("/").pop();
    const currentNote = screenshotNotes[filename] || "";

    if (activeNoteText === currentNote) {
      setNoteSaveStatus("saved");
      return;
    }

    setNoteSaveStatus("saving");

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/screenshot-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, notes: activeNoteText }),
        });
        const data = await res.json();
        if (data.success) {
          setScreenshotNotes((prev) => ({
            ...prev,
            [filename]: activeNoteText,
          }));
          setNoteSaveStatus("saved");
        } else {
          setNoteSaveStatus("error");
        }
      } catch (err) {
        setNoteSaveStatus("error");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [activeNoteText, lightboxIndex, filteredScreenshots]);

  // Keyboard Shortcuts via react-hotkeys-hook
  useHotkeys(
    "space",
    (e) => {
      e.preventDefault();
      if (currentIndex !== -1) {
        setIsTimerRunning((prev) => !prev);
        toast.info(isTimerRunning ? "Timer Paused" : "Timer Resumed");
      }
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    "ctrl+up",
    (e) => {
      e.preventDefault();
      if (currentIndex !== -1 && !isLaunching) {
        handleLaunch();
      }
    },
    { enableOnFormTags: true },
  );

  useHotkeys(
    "ctrl+enter",
    (e) => {
      e.preventDefault();
      if (currentIndex !== -1 && takeaway.trim() !== "") {
        handleSaveLog();
      }
    },
    { enableOnFormTags: true },
  );

  // Lightbox Keyboard Navigation
  useHotkeys(
    "left",
    (e) => {
      e.preventDefault();
      if (lightboxIndex > 0) {
        setLightboxIndex((prev) => prev - 1);
      }
    },
    { enabled: lightboxIndex !== -1, enableOnFormTags: false },
  );

  useHotkeys(
    "right",
    (e) => {
      e.preventDefault();
      if (lightboxIndex !== -1 && lightboxIndex < filteredScreenshots.length - 1) {
        setLightboxIndex((prev) => prev + 1);
      }
    },
    { enabled: lightboxIndex !== -1, enableOnFormTags: false },
  );

  useHotkeys(
    "esc",
    (e) => {
      e.preventDefault();
      setLightboxIndex(-1);
    },
    { enabled: lightboxIndex !== -1, enableOnFormTags: true },
  );

  // Manual save trigger function
  const handleSaveLog = async () => {
    if (currentIndex === -1 || !activeExt) return;
    const ext = activeExt;

    if (!takeaway.trim()) {
      toast.error("Takeaway notes cannot be empty.");
      return;
    }

    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ext.id,
          rating,
          painPoints,
          takeaway,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Logged analysis for ${ext.name}!`);

        setLogsHistory((prev) => [
          {
            name: ext.name,
            rating,
            takeaway,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev,
        ]);

        onUpdateExtension(ext.id, {
          reviewed: true,
          userRating: rating,
          painPoints: painPoints,
          takeaway: takeaway,
          critiqueCharCount: (
            (takeaway || "") +
            " " +
            (painPoints || "")
          ).trim().length,
          critiqueWordCount: (
            (takeaway || "") +
            " " +
            (painPoints || "")
          )
            .trim()
            .split(/\s+/)
            .filter(Boolean).length,
        });
      } else {
        toast.error(`Save failed: ${data.error}`);
      }
    } catch (err) {
      toast.error("Failed to connect to logging server API.");
    }
  };

  // Download and unpack CRX codebase manually
  const handleDownloadCodebase = async () => {
    if (currentIndex === -1 || !activeExt) return;
    const ext = activeExt;
    setIsDownloadingCodebase(true);
    toast.info(`Downloading and extracting codebase for ${ext.name}...`);

    try {
      const res = await fetch(`/api/extensions/${ext.id}/download`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Successfully cached ${ext.name} codebase!`);
        onUpdateExtension(ext.id, { cached: true });
      } else {
        toast.error(data.error || "Failed to download codebase.");
      }
    } catch (err) {
      toast.error("Failed to connect to download server API.");
    } finally {
      setIsDownloadingCodebase(false);
    }
  };

  // Launch Extension in Sandbox
  const handleLaunch = async () => {
    if (currentIndex === -1 || !activeExt) return;
    const ext = activeExt;
    setIsLaunching(true);
    toast.info(`Launching sandbox for ${ext.name}...`);

    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ext.id }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(
          `Sandbox active. Loaded: ${data.launchedUrl || ext.name}`
        );
        setIsTimerRunning(true);
      } else {
        toast.error(`Launch failed: ${data.error}`);
      }
    } catch (err) {
      toast.error("Communication failure with launch server.");
    } finally {
      setIsLaunching(false);
    }
  };

  // Trigger Remote Screenshot
  const handleScreenshot = async () => {
    if (currentIndex === -1 || !activeExt) return;
    setIsTakingScreenshot(true);
    toast.info("Capturing sandbox screenshot...");

    try {
      const res = await fetch("/api/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: screenshotMode }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Saved screenshot: ${data.filename}`);
        fetchScreenshots(activeExt.id);
      } else {
        toast.error(`Screenshot failed: ${data.error}`);
      }
    } catch (err) {
      toast.error("Error communicating with screenshot service.");
    } finally {
      setIsTakingScreenshot(false);
    }
  };

  // Trigger Remote Snip Mode inside sandbox
  const handleToggleSnip = async () => {
    if (currentIndex === -1) return;
    setIsSnipping(true);
    toast.info("Activating Component Snip Mode...");

    try {
      const res = await fetch("/api/toggle-snip", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        toast.success(
          "Snip Mode Active. Hover & select a component in the sandbox browser."
        );
      } else {
        toast.error(`Snip Mode activation failed: ${data.error}`);
      }
    } catch (err) {
      toast.error("Error communicating with sniper service.");
    } finally {
      setIsSnipping(false);
    }
  };

  // Snip elements remotely by CSS selector (DevTools clipboard integration)
  const handleSnipSelector = async (e) => {
    e.preventDefault();
    if (currentIndex === -1) return;
    if (!customSelector.trim()) {
      toast.warning("Please enter a valid CSS selector");
      return;
    }
    
    setIsSnippingSelector(true);
    const loadingToast = toast.loading(`Snipping element matching "${customSelector}"...`);

    try {
      const res = await fetch("/api/sniper/snip-selector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selector: customSelector.trim() }),
      });
      const data = await res.json();

      toast.dismiss(loadingToast);
      if (res.ok && data.success) {
        toast.success(`Successfully captured selector: "${customSelector}"`);
        setCustomSelector("");
        setShowSelectorInput(false);
      } else {
        toast.error(data.error || "Failed to capture selector");
      }
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error("Error communicating with sniper service.");
    } finally {
      setIsSnippingSelector(false);
    }
  };

  // Delete an individual screenshot file from disk & state list
  const handleDeleteScreenshot = async (url, e) => {
    e.stopPropagation();
    const filename = url.split("/").pop();

    try {
      const res = await fetch(`/api/screenshots/${filename}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Screenshot deleted successfully!");
        setScreenshots((prev) => prev.filter((item) => item !== url));
      } else {
        toast.error(data.error || "Failed to delete screenshot file.");
      }
    } catch (err) {
      toast.error("Communication failure with delete screenshot API.");
    }
  };

  // Open in selected IDE editor
  const handleOpenCode = async () => {
    if (currentIndex === -1 || !activeExt) return;
    const ext = activeExt;
    const editorLabels = {
      vscode: "VS Code",
      cursor: "Cursor",
      windsurf: "Windsurf",
      antigravity: "Antigravity IDE",
      custom: customEditorCommand,
    };

    toast.info(`Opening code directory in ${editorLabels[editorChoice]}...`);

    try {
      const res = await fetch("/api/open-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ext.id,
          editor: editorChoice,
          customCommand: customEditorCommand,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`${editorLabels[editorChoice]} successfully opened!`);
      } else {
        toast.error(`Failed: ${data.error}`);
      }
    } catch (err) {
      toast.error("Failed to connect to editor server API.");
    }
  };

  // Import screenshot image from an external URL
  const handleImportUrl = async (e) => {
    if (e) e.preventDefault();
    if (!importUrl.trim() || currentIndex === -1 || !activeExt) return;

    const ext = activeExt;
    setIsImportingImage(true);
    toast.info("Importing image from URL...");

    try {
      const res = await fetch("/api/screenshots/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ext.id, url: importUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Image imported successfully!");
        setImportUrl("");
        setShowUrlPopover(false);
        fetchScreenshots(ext.id);
      } else {
        toast.error(data.error || "Failed to import image.");
      }
    } catch (err) {
      toast.error("Failed to connect to image import API.");
    } finally {
      setIsImportingImage(false);
    }
  };

  // Import image binary from clipboard using read() API
  const handlePasteFromClipboard = async () => {
    if (currentIndex === -1 || !activeExt) return;
    const ext = activeExt;

    try {
      const items = await navigator.clipboard.read();
      let imageBlob = null;

      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          imageBlob = await item.getType(imageType);
          break;
        }
      }

      if (!imageBlob) {
        toast.warning("No image found in your clipboard!");
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        toast.info("Uploading clipboard image...");

        try {
          const res = await fetch("/api/screenshots/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: ext.id, base64 }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            toast.success("Clipboard image saved!");
            fetchScreenshots(ext.id);
          } else {
            toast.error(data.error || "Failed to save clipboard image.");
          }
        } catch (err) {
          toast.error("Failed to upload clipboard image.");
        }
      };
      reader.readAsDataURL(imageBlob);
    } catch (err) {
      toast.error(
        "Clipboard access denied. Focus on the screen and press Ctrl+V."
      );
    }
  };

  // Paste handler bound to Screenshots panel for standard clipboard paste event
  const handlePaste = async (e) => {
    if (currentIndex === -1 || !activeExt) return;
    const ext = activeExt;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target.result;
          toast.info("Uploading clipboard image...");

          try {
            const res = await fetch("/api/screenshots/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: ext.id, base64 }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              toast.success("Clipboard image saved!");
              fetchScreenshots(ext.id);
            } else {
              toast.error(data.error || "Failed to save clipboard image.");
            }
          } catch (err) {
            toast.error("Failed to upload clipboard image.");
          }
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  // Helper formatting for seconds to MM:SS
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <ExtensionsSidebar
        extensions={extensions}
        currentIndex={currentIndex}
        selectExtension={selectExtension}
        handleDeleteExtension={handleDeleteExtension}
        loading={loading}
        viewMode="explorer"
        setViewMode={setViewMode}
        setShowSettingsModal={setShowSettingsModal}
        takeaway={takeaway}
        painPoints={painPoints}
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        sortMode={sortMode}
        setSortMode={setSortMode}
        groupMode={groupMode}
        setGroupMode={setGroupMode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <AnimatePresence mode="wait">
          {currentIndex === -1 ? (
            /* EMPTY VIEW */
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center shadow-sm shadow-zinc-100">
                <IconFileText className="h-6 w-6 text-zinc-400" />
              </div>
              <div className="max-w-xs">
                <h2 className="text-sm font-bold mb-1 text-zinc-800">
                  Begin Audit Queue
                </h2>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Select an extension from the sidebar feed to load reviews, launch the sandbox, and draft takeaways.
                </p>
              </div>
            </motion.div>
          ) : (
            /* ACTIVE VIEWER */
            <motion.div
              key={activeExt.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
            >
              {/* STICKY HEADER PANEL */}
              <div className="p-5 border-b border-zinc-200 bg-white/95 sticky top-0 z-30 backdrop-blur-md flex flex-col lg:flex-row justify-between gap-6 shadow-sm shadow-zinc-150/40 shrink-0">
                {/* Left Side: Metadata & Description */}
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex items-center flex-wrap gap-2.5">
                    <h2 className="text-lg font-bold tracking-tight text-zinc-900 leading-none">
                      {activeExt.name}
                    </h2>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200 font-semibold uppercase whitespace-nowrap">
                      {activeExt.category}
                    </span>

                    {/* Tracing Help Popover */}
                    <div className="relative group flex items-center">
                      <button
                        className="h-4.5 w-4.5 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 flex items-center justify-center text-[10px] font-bold font-mono transition cursor-pointer select-none focus:outline-none"
                        title="View UI Inspector manual guide"
                      >
                        ?
                      </button>
                      <div className="absolute left-0 top-full mt-2 w-[420px] max-h-[350px] overflow-y-auto bg-white rounded-xl shadow-2xl border border-zinc-200 p-4.5 z-50 text-xs text-zinc-655 space-y-4 leading-relaxed font-mono opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition duration-200 shadow-zinc-355/50">
                        <div className="space-y-1">
                          <p className="font-bold text-zinc-800">
                            🔍 How to trace where a button click event is coded:
                          </p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Launch the Sandbox page browser window.</li>
                            <li>Right click the target visual button ➔ select **Inspect**.</li>
                            <li>In DevTools, switch to the **Event Listeners** tab in the sidebar layout.</li>
                            <li>Find the `click` row ➔ expand it ➔ click on the Javascript filename/link (e.g. `popup.js:142`).</li>
                            <li>Clicking this link jumps to the exact script file and line number in the Sources tab!</li>
                          </ol>
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-zinc-800">
                            📂 How to inspect files locally in VS Code:
                          </p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Click the **VS Code** button to open the extracted source files folder in your editor.</li>
                            <li>Press `Ctrl + Shift + F` to search globally for specific CSS classes (e.g. `button-boost`) or text labels (e.g. `"Volume boosted"`).</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400">
                      by <span className="text-zinc-700 font-semibold">{activeExt.author}</span>
                    </span>
                  </div>

                  <p className="text-xs text-zinc-550 leading-relaxed max-w-2xl">
                    {activeExt.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 pt-1">
                    <div className="flex items-center gap-1">
                      <span className="text-amber-500">★</span>
                      <span className="font-semibold text-zinc-800">
                        {activeExt.rating} Rating
                      </span>
                    </div>
                    <span className="text-zinc-300">|</span>
                    <div className="flex items-center gap-1">
                      <span>👥 {activeExt.users} users</span>
                    </div>
                    <span className="text-zinc-300">|</span>
                    <div className="flex items-center gap-1 bg-zinc-100/80 px-2 py-1 rounded border border-zinc-200">
                      <span className="text-[10px] text-zinc-655 font-mono select-all font-semibold">
                        ID: {activeExt.id}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(activeExt.id);
                          setCopiedId(true);
                          toast.success("Copied extension ID to clipboard!");
                          setTimeout(() => setCopiedId(false), 2000);
                        }}
                        className="ml-1 text-zinc-550 hover:text-zinc-800 transition"
                      >
                        {copiedId ? (
                          <IconCheck className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <IconCopy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <a
                        href={`https://chromewebstore.google.com/detail/${activeExt.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1.5 text-zinc-550 hover:text-zinc-800 transition"
                        title="View on Chrome Web Store"
                      >
                        <IconExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <span className="text-zinc-300 ml-1.5 cursor-default">|</span>
                      <a
                        href={`https://www.crx4chrome.com/extensions/${activeExt.id}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1.5 text-[9px] uppercase tracking-wider font-bold text-zinc-550 hover:text-zinc-800 transition-colors"
                        title="View version history on CRX4Chrome"
                      >
                        CRX4Chrome
                      </a>
                    </div>
                    
                    {/* Store Specs Button */}
                    <button
                      onClick={() => setShowSpecsDrawer(true)}
                      className="inline-flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200 text-zinc-655 hover:text-zinc-850 px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer select-none"
                      title="View Chrome Web Store technical specifications and related extensions"
                    >
                      <IconInfoCircle className="h-3.5 w-3.5 text-zinc-500" />
                      Store Specs
                    </button>
                  </div>
                </div>

                {/* Right Side: Sandbox Actions & Timer */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0 justify-end">
                  {/* Timer Display */}
                  <div
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-2xl border transition duration-200 select-none cursor-pointer ${
                      timerSeconds === 0
                        ? "bg-red-50 border-red-200 text-red-650"
                        : timerSeconds <= 30
                          ? "bg-amber-50 border-amber-200 text-amber-650 animate-pulse"
                          : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                    }`}
                    title="Click to Pause / Resume Countdown (Space)"
                  >
                    <IconClock className="h-4.5 w-4.5" />
                    <span className="font-mono font-bold text-xs">
                      {formatTime(timerSeconds)}
                    </span>
                  </div>

                  {/* Sandbox Actions or Download option */}
                  {!activeExt.cached ? (
                    <button
                      onClick={handleDownloadCodebase}
                      disabled={isDownloadingCodebase}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow transition duration-200 select-none disabled:opacity-75 disabled:cursor-not-allowed shrink-0"
                    >
                      <IconDownload className="h-4 w-4 shrink-0" />
                      <span>
                        {isDownloadingCodebase ? "Extracting..." : "Download Codebase"}
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-4 bg-zinc-50 border border-zinc-200/60 p-2 rounded-2xl shrink-0">
                      {/* Launch Sandbox Button */}
                      <button
                        onClick={handleLaunch}
                        disabled={isLaunching}
                        className="flex flex-col items-center gap-0.5 text-blue-600 hover:text-blue-700 transition cursor-pointer select-none focus:outline-none disabled:opacity-50 shrink-0"
                        title={
                          isLaunching
                            ? "Launching sandbox..."
                            : "Launch extension in sandbox browser"
                        }
                      >
                        <IconPlayerPlay className="h-6 w-6 shrink-0" />
                        <span className="text-[9px] font-bold tracking-wider uppercase">
                          {isLaunching ? "Launching" : "Launch"}
                        </span>
                      </button>

                      {/* Vertical Divider */}
                      <div className="h-8 w-px bg-zinc-200 shrink-0"></div>

                      {/* Screen Actions Group */}
                      <div className="flex items-center gap-4">
                        {/* Screenshot Button */}
                        <button
                          onClick={handleScreenshot}
                          disabled={isTakingScreenshot}
                          className="flex flex-col items-center gap-0.5 text-zinc-400 hover:text-zinc-800 transition cursor-pointer select-none focus:outline-none disabled:opacity-50"
                          title="Remote capture running browser (Ctrl+Shift+S inside sandbox)"
                        >
                          <IconCamera className="h-6 w-6 shrink-0" />
                          <span className="text-[9px] font-bold tracking-wider uppercase">
                            {isTakingScreenshot ? "Capturing" : "Screenshot"}
                          </span>
                        </button>

                        {/* Snip & Selector Split Container */}
                        <div className="relative flex items-center shrink-0">
                          {/* Visual Snip Button */}
                          <button
                            onClick={handleToggleSnip}
                            disabled={isSnipping}
                            className="flex flex-col items-center gap-0.5 text-zinc-400 hover:text-zinc-800 transition cursor-pointer select-none focus:outline-none disabled:opacity-50 pr-1.5 border-r border-zinc-200/60"
                            title="Activate highlighter to snip a component (Ctrl+Shift+E inside sandbox)"
                          >
                            <IconSparkle className="h-6 w-6 shrink-0" />
                            <span className="text-[9px] font-bold tracking-wider uppercase">
                              {isSnipping ? "Snipping" : "Snip"}
                            </span>
                          </button>
                          
                          {/* Selector Snip Popover Trigger */}
                          <button
                            onClick={() => setShowSelectorInput(prev => !prev)}
                            className={`pl-1.5 flex flex-col items-center gap-0.5 transition cursor-pointer select-none focus:outline-none ${
                              showSelectorInput ? "text-zinc-800" : "text-zinc-400 hover:text-zinc-800"
                            }`}
                            title="Snip by custom CSS Selector"
                          >
                            <IconChevronDown className="h-6 w-6 shrink-0" />
                            <span className="text-[9px] font-bold tracking-wider uppercase">
                              Selector
                            </span>
                          </button>

                          {/* Selector Input Popover */}
                          <AnimatePresence>
                            {showSelectorInput && (
                              <>
                                {/* Backdrop dismisser */}
                                <div
                                  className="fixed inset-0 z-40 cursor-default"
                                  onClick={() => setShowSelectorInput(false)}
                                />
                                
                                {/* Input Box Card */}
                                <motion.form
                                  onSubmit={handleSnipSelector}
                                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute right-0 top-12 w-64 bg-white border border-zinc-200 rounded-xl shadow-xl p-3.5 z-50 text-left flex flex-col gap-2.5"
                                >
                                  {/* Caret pointer */}
                                  <div className="absolute top-[-5px] right-3.5 w-2.5 h-2.5 bg-white border-t border-l border-zinc-200 rotate-45 z-40" />

                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-455 font-mono">
                                      Snip by CSS Selector
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setShowSelectorInput(false)}
                                      className="p-1 hover:bg-zinc-100 rounded-md transition text-zinc-400 hover:text-zinc-600 cursor-pointer"
                                    >
                                      <IconX className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={customSelector}
                                      onChange={(e) => setCustomSelector(e.target.value)}
                                      placeholder="e.g. .search-form or #header"
                                      className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg bg-zinc-50 text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:bg-white transition"
                                      autoFocus
                                      disabled={isSnippingSelector}
                                    />
                                    <button
                                      type="submit"
                                      disabled={isSnippingSelector}
                                      className="px-2.5 py-1.5 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-95 disabled:opacity-50 transition rounded-lg shadow cursor-pointer shrink-0"
                                    >
                                      {isSnippingSelector ? "..." : "Snip"}
                                    </button>
                                  </div>
                                  <p className="text-[9px] text-zinc-400 leading-normal">
                                    Copy any selector from Chrome Developer Tools Elements panel and paste it here.
                                  </p>
                                </motion.form>
                              </>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Editor Launcher Button */}
                        <button
                          onClick={handleOpenCode}
                          className="flex flex-col items-center gap-0.5 text-zinc-400 hover:text-zinc-800 transition cursor-pointer select-none focus:outline-none"
                          title={`Open unpacked extension directory in ${
                            editorChoice === "vscode"
                              ? "VS Code"
                              : editorChoice === "cursor"
                                ? "Cursor"
                                : editorChoice === "windsurf"
                                  ? "Windsurf"
                                  : editorChoice === "antigravity"
                                    ? "Antigravity IDE"
                                    : customEditorCommand
                          }`}
                        >
                          <IconBrandVscode className="h-6 w-6 shrink-0" />
                          <span className="text-[9px] font-bold tracking-wider uppercase">
                            {editorChoice === "vscode"
                              ? "VS Code"
                              : editorChoice === "cursor"
                                ? "Cursor"
                                : editorChoice === "windsurf"
                                  ? "Windsurf"
                                  : editorChoice === "antigravity"
                                    ? "Antigravity"
                                    : "Open Code"}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* DETAILED CONTENT CONTAINER */}
              <div className="p-6 space-y-6">
                {/* CAPTURED SCREENSHOTS PANEL */}
                <div className="space-y-3" onPaste={handlePaste}>
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-2 relative">
                    <div className="flex items-center gap-4 flex-wrap">
                      <h4 className="font-bold text-xs text-zinc-700 tracking-wide uppercase flex items-center gap-1.5">
                        <IconCamera className="h-4.5 w-4.5 text-zinc-550" /> Captured Screenshots
                      </h4>
                      
                      {/* Filter Switcher Button Group */}
                      {screenshots.length > 0 && (
                        <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 text-[10px] font-semibold text-zinc-500 shadow-sm shrink-0">
                          <button
                            type="button"
                            onClick={() => setScreenshotFilter("all")}
                            className={`px-2 py-0.5 rounded-md transition-all duration-150 cursor-pointer ${
                              screenshotFilter === "all"
                                ? "bg-white text-zinc-955 shadow-sm border border-zinc-200/50 font-bold"
                                : "hover:text-zinc-800"
                            }`}
                          >
                            All ({screenshots.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setScreenshotFilter("user")}
                            className={`px-2 py-0.5 rounded-md transition-all duration-150 cursor-pointer ${
                              screenshotFilter === "user"
                                ? "bg-white text-zinc-955 shadow-sm border border-zinc-200/50 font-bold"
                                : "hover:text-zinc-800"
                            }`}
                          >
                            Sandbox ({screenshots.filter(url => !url.includes("/api/component-file/") && !url.includes("/api/component-asset/") && !url.includes("/api/screenshot-file/cws/")).length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setScreenshotFilter("crop")}
                            className={`px-2 py-0.5 rounded-md transition-all duration-150 cursor-pointer ${
                              screenshotFilter === "crop"
                                ? "bg-white text-zinc-955 shadow-sm border border-zinc-200/50 font-bold"
                                : "hover:text-zinc-800"
                            }`}
                          >
                            Components ({screenshots.filter(url => url.includes("/api/component-file/") || url.includes("/api/component-asset/")).length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setScreenshotFilter("cws")}
                            className={`px-2 py-0.5 rounded-md transition-all duration-150 cursor-pointer ${
                              screenshotFilter === "cws"
                                ? "bg-white text-zinc-955 shadow-sm border border-zinc-200/50 font-bold"
                                : "hover:text-zinc-800"
                            }`}
                          >
                            Web Store ({screenshots.filter(url => url.includes("/api/screenshot-file/cws/")).length})
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Split button controls & absolute dropdown popover */}
                    <div className="flex items-center gap-1.5 relative">
                      {/* URL Import split button (Left) */}
                      <div className="flex items-center bg-zinc-100 border border-zinc-200 rounded-lg p-0.5 shadow-sm">
                        <button
                          onClick={() => setShowUrlPopover(!showUrlPopover)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors duration-200 cursor-pointer select-none ${
                            showUrlPopover
                              ? "bg-white text-zinc-900 shadow-sm border border-zinc-200/60"
                              : "text-zinc-500 hover:text-zinc-800"
                          }`}
                          title="Add image from URL"
                        >
                          <IconPlus className="h-3.5 w-3.5" />
                          <span>URL</span>
                        </button>

                        {/* Paste Clipboard split button (Right) */}
                        <button
                          onClick={handlePasteFromClipboard}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-800 hover:bg-white/50 transition-colors duration-200 cursor-pointer select-none"
                          title="Import image from clipboard binary"
                        >
                          <IconClipboard className="h-3.5 w-3.5 text-zinc-500" />
                          <span>Paste</span>
                        </button>
                      </div>

                      {/* URL Popover Dropdown Card (Anchored below split button) */}
                      {showUrlPopover && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-zinc-200 p-3.5 z-40 space-y-3 animate-fade-in">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block">
                              Screenshot URL
                            </label>
                            <input
                              type="text"
                              value={importUrl}
                              onChange={(e) => setImportUrl(e.target.value)}
                              placeholder="https://example.com/screenshot.png"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50/50 focus:outline-none focus:border-zinc-300 focus:bg-white transition"
                              disabled={isImportingImage}
                            />
                          </div>
                          <div className="flex justify-end gap-2 text-[10px] font-bold">
                            <button
                              onClick={() => {
                                setImportUrl("");
                                setShowUrlPopover(false);
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-550 hover:bg-zinc-50 transition cursor-pointer"
                              disabled={isImportingImage}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleImportUrl}
                              disabled={isImportingImage || !importUrl.trim()}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-40 cursor-pointer"
                            >
                              {isImportingImage ? "Importing..." : "Submit"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {filteredScreenshots.length === 0 ? (
                    <div className="p-6 border border-dashed border-zinc-200 rounded-xl text-center text-xs text-zinc-400">
                      {screenshots.length === 0
                        ? "No screenshots captured yet. Launch the sandbox and click the Screenshot button to save design views."
                        : "No screenshots match the selected filter."}
                    </div>
                  ) : (
                    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-250">
                      {filteredScreenshots.map((url, index) => {
                        const filename = url.split("/").pop();
                        const isCrop = url.includes("/api/component-file/") || url.includes("/api/component-asset/");
                        const isCws = url.includes("/api/screenshot-file/cws/");
                        const note = screenshotNotes[filename];

                        return (
                          <motion.div
                            key={index}
                            whileHover={{ scale: 1.01 }}
                            className="w-[30rem] shrink-0 rounded-xl border border-zinc-200 overflow-hidden bg-zinc-950 relative group shadow-sm flex items-center justify-center"
                          >
                            <img
                              src={url}
                              alt={`Captured design layout ${index + 1}`}
                              className="w-full h-60 object-contain"
                            />

                            {/* Asset Type Badge */}
                            <div className="absolute top-2 left-2 pointer-events-none">
                              <span
                                className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                  isCrop
                                    ? "bg-emerald-900/80 backdrop-blur-sm text-emerald-200 border border-emerald-800"
                                    : isCws
                                      ? "bg-purple-900/80 backdrop-blur-sm text-purple-200 border border-purple-800"
                                      : "bg-blue-900/80 backdrop-blur-sm text-blue-200 border border-blue-800"
                                }`}
                              >
                                {isCrop ? "Component Crop" : isCws ? "Web Store Reference" : "Screenshot"}
                              </span>
                            </div>

                            {/* Note Preview Bar */}
                            {note && (
                              <div className="absolute bottom-2 left-2 right-2 bg-zinc-900/85 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-300 line-clamp-1 pointer-events-none">
                                {note}
                              </div>
                            )}

                            {/* Actions Overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-2 p-4">
                              <button
                                onClick={() => setLightboxIndex(index)}
                                className="px-3.5 py-2 rounded-xl bg-white text-xs font-bold text-zinc-900 border border-zinc-200 hover:bg-zinc-50 shadow-md transition cursor-pointer"
                              >
                                Show Overlay
                              </button>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-705 text-xs font-bold text-white border border-zinc-700 shadow-md transition"
                              >
                                View Full
                              </a>
                              <button
                                onClick={(e) => {
                                  if (confirm("Are you sure you want to delete this screenshot?")) {
                                    handleDeleteScreenshot(url, e);
                                  }
                                }}
                                className="px-3.5 py-2 rounded-xl bg-red-650 hover:bg-red-700 text-xs font-bold text-white shadow-md transition cursor-pointer"
                                title="Delete Screenshot"
                              >
                                Delete
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* CRITICAL SENTIMENT REVIEWS (COMPACT GRID) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                    <h4 className="font-bold text-xs text-zinc-700 tracking-wide uppercase flex items-center gap-1.5">
                      <IconMessageCircle className="h-4.5 w-4.5 text-zinc-550" /> User Reviews & Sentiment Analysis
                      {sortedReviews.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-555 font-mono font-semibold">
                          {sortedReviews.length}
                        </span>
                      )}
                    </h4>

                    {sortedReviews.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 mr-1 select-none">Sort</span>
                        <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50/50">
                          <button
                            type="button"
                            onClick={() => setReviewSortMode("default")}
                            className={`px-2 py-0.5 rounded-md font-medium text-[10px] transition cursor-pointer select-none ${
                              reviewSortMode === "default"
                                ? "bg-white text-zinc-800 shadow-sm border border-zinc-200/40"
                                : "text-zinc-500 hover:text-zinc-800"
                            }`}
                          >
                            Default
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewSortMode("lowest")}
                            className={`px-2 py-0.5 rounded-md font-medium text-[10px] transition cursor-pointer select-none ${
                              reviewSortMode === "lowest"
                                ? "bg-white text-zinc-800 shadow-sm border border-zinc-200/40"
                                : "text-zinc-500 hover:text-zinc-800"
                            }`}
                          >
                            Lowest
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewSortMode("highest")}
                            className={`px-2 py-0.5 rounded-md font-medium text-[10px] transition cursor-pointer select-none ${
                              reviewSortMode === "highest"
                                ? "bg-white text-zinc-800 shadow-sm border border-zinc-200/40"
                                : "text-zinc-500 hover:text-zinc-800"
                            }`}
                          >
                            Highest
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="max-h-[300px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {sortedReviews.map((rev, index) => {
                        const isCritical = rev.rating <= 3;
                        return (
                          <div
                            key={index}
                            className={`p-2.5 rounded-lg border text-[11px] leading-relaxed flex flex-col justify-between ${
                              isCritical
                                ? "bg-red-50/20 border-red-100/60"
                                : "bg-zinc-50/25 border-zinc-200/50"
                            }`}
                          >
                            <p className="text-zinc-650 italic mb-1.5 select-text">
                              "{rev.comment}"
                            </p>
                            <div className="flex justify-between items-center pt-1 border-t border-zinc-100/50 shrink-0 text-[10px]">
                              <span className="font-semibold text-zinc-550 truncate max-w-[80px]">
                                {rev.user}
                              </span>
                              <span className="font-mono text-amber-500 font-bold shrink-0">
                                {"★".repeat(rev.rating)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* DESIGN TAKEAWAY LOGGING PANEL */}
                <div className="p-6 rounded-2xl bg-zinc-50/30 border border-zinc-200 space-y-4">
                  {/* Unified Compact Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200/80">
                    <div className="flex items-center gap-2">
                      <IconFileText className="h-4.5 w-4.5 text-blue-650" />
                      <span className="font-bold text-sm text-zinc-800 uppercase tracking-tight">
                        Live Critique & Notes
                      </span>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {/* Save Status Badge */}
                      <div className="flex items-center shrink-0">
                        {saveStatus === "saving" && (
                          <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>{" "}
                            Saving...
                          </span>
                        )}
                        {saveStatus === "saved" && (
                          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 animate-fade-in">
                            ✓ Saved
                          </span>
                        )}
                        {saveStatus === "error" && (
                          <span className="text-[10px] text-red-600 font-semibold flex items-center gap-1">
                            ✕ Sync Error
                          </span>
                        )}
                      </div>

                      {/* Star Picker */}
                      <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-4 select-none">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">
                          Rating
                        </span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => {
                                setRating(star);
                              }}
                              className="text-base hover:scale-110 focus:outline-none transition cursor-pointer select-none"
                              title={`Rate ${star} Stars`}
                            >
                              <span
                                className={
                                  star <= rating
                                    ? "text-amber-500 font-bold"
                                    : "text-zinc-250 hover:text-amber-300"
                                }
                              >
                                ★
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Save Button */}
                      <button
                        onClick={handleSaveLog}
                        disabled={!takeaway.trim()}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-40 disabled:pointer-events-none transition text-xs flex items-center gap-1 shadow-sm shadow-blue-500/5 cursor-pointer shrink-0"
                        title="Force manual write to takeaways.md"
                      >
                        <IconCheck className="h-3.5 w-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>

                  {/* Markdown Editor directly below header */}
                  <div className="relative critique-editor-container select-text">
                    <SimpleMDE
                      value={takeaway}
                      onChange={setTakeaway}
                      options={mdeOptions}
                    />
                  </div>

                  {/* Subtle info label in footer */}
                  <div className="text-[10px] text-zinc-400 italic">
                    Logs synced dynamically to{" "}
                    <code className="text-zinc-550 font-mono font-medium">
                      .docs/takeaways.md
                    </code>
                  </div>
                </div>

                {/* LOCAL HISTORY LOG PREVIEW */}
                {logsHistory.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-xs text-zinc-400 tracking-wider uppercase">
                      Recent logs this session
                    </h4>
                    <div className="space-y-2">
                      {logsHistory.map((log, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/20 text-xs space-y-1.5"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-zinc-750">
                              {log.name}
                            </span>
                            <span className="text-zinc-400 text-[10px] font-mono">
                              {log.timestamp}
                            </span>
                          </div>
                          <p className="text-zinc-650 leading-relaxed">
                            {log.takeaway}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* LIGHTBOX OVERLAY MODAL */}
      <AnimatePresence>
        {lightboxIndex !== -1 && filteredScreenshots[lightboxIndex] && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setLightboxIndex(-1);
            }}
            className="fixed inset-0 bg-black/95 z-50 flex overflow-hidden"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-screen h-screen bg-zinc-950 flex relative"
            >
              {/* Left Side: Large Image Viewer */}
              <div className="flex-1 h-full bg-zinc-950 flex items-center justify-center relative p-12 select-none group">
                {/* Close Button (Top Left) */}
                <button
                  onClick={() => setLightboxIndex(-1)}
                  className="absolute top-6 left-6 z-50 w-10 h-10 rounded-xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer shadow-lg shadow-black/20 focus:outline-none"
                  title="Close Overlay (Esc)"
                >
                  <IconX className="w-5 h-5" />
                </button>

                <img
                  src={filteredScreenshots[lightboxIndex]}
                  alt="Full-size capture view"
                  className="max-w-full max-h-full object-contain"
                />

                {/* Left Navigation Arrow */}
                {lightboxIndex > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) => prev - 1);
                    }}
                    className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 border border-zinc-800 text-white flex items-center justify-center transition cursor-pointer"
                    title="Previous Image (Left Arrow Key)"
                  >
                    <span className="text-xl font-bold font-mono">←</span>
                  </button>
                )}

                {/* Right Navigation Arrow */}
                {lightboxIndex < filteredScreenshots.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) => prev + 1);
                    }}
                    className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 border border-zinc-800 text-white flex items-center justify-center transition cursor-pointer"
                    title="Next Image (Right Arrow Key)"
                  >
                    <span className="text-xl font-bold font-mono">→</span>
                  </button>
                )}

                {/* Counter Badge */}
                <div className="absolute bottom-6 left-6 bg-black/60 px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-400 font-mono">
                  {lightboxIndex + 1} / {filteredScreenshots.length}
                </div>
              </div>

              {/* Right Side: Notes and Info sidebar */}
              <div className="w-96 md:w-[400px] h-full p-6 bg-white flex flex-col justify-between border-l border-zinc-200 shadow-2xl z-10">
                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                  {/* Header info */}
                  <div className="border-b border-zinc-100 pb-3">
                    <span
                      className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider mb-2 ${
                        filteredScreenshots[lightboxIndex].includes(
                          "/api/component-file/"
                        ) || filteredScreenshots[lightboxIndex].includes(
                          "/api/component-asset/"
                        )
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-150"
                          : filteredScreenshots[lightboxIndex].includes(
                              "/api/screenshot-file/cws/"
                            )
                            ? "bg-purple-50 text-purple-700 border border-purple-150"
                            : "bg-blue-50 text-blue-700 border border-blue-150"
                      }`}
                    >
                      {filteredScreenshots[lightboxIndex].includes(
                        "/api/component-file/"
                      ) || filteredScreenshots[lightboxIndex].includes(
                        "/api/component-asset/"
                      )
                        ? "Component Snippet"
                        : filteredScreenshots[lightboxIndex].includes(
                            "/api/screenshot-file/cws/"
                          )
                          ? "Web Store Reference"
                          : "Sandbox Screenshot"}
                    </span>
                    <h3
                      className="font-bold text-sm text-zinc-800 truncate"
                      title={filteredScreenshots[lightboxIndex].split("/").pop()}
                    >
                      {filteredScreenshots[lightboxIndex].split("/").pop()}
                    </h3>
                  </div>

                  {/* Notes Textarea Section */}
                  <div className="flex-1 flex flex-col space-y-1.5 min-h-0">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Critique Notes & Takeaways
                    </label>
                    <textarea
                      value={activeNoteText}
                      onChange={(e) => setActiveNoteText(e.target.value)}
                      placeholder="Add layout observations, typography choices, padding critique or UI highlights for this image..."
                      className="w-full flex-1 p-3 text-xs rounded-xl border border-zinc-200 bg-zinc-50/30 focus:outline-none focus:border-zinc-300 focus:bg-white transition resize-none font-mono"
                    />
                  </div>
                </div>

                {/* Footer and Auto-save details */}
                <div className="pt-4 border-t border-zinc-100 mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    {noteSaveStatus === "saving" && (
                      <span className="text-zinc-550 flex items-center gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block animate-ping"></span>
                        Saving...
                      </span>
                    )}
                    {noteSaveStatus === "saved" && (
                      <span className="text-emerald-600 flex items-center gap-1">
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
                    <button
                      onClick={async () => {
                        const url = filteredScreenshots[lightboxIndex];
                        if (
                          confirm(
                            "Are you sure you want to delete this screenshot?"
                          )
                        ) {
                          setLightboxIndex(-1);
                          const mockEvent = { stopPropagation: () => {} };
                          await handleDeleteScreenshot(url, mockEvent);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-red-650 text-[10px] font-bold transition cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setLightboxIndex(-1)}
                      className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-bold transition cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CWS Store Specs Slide-over Drawer */}
      <AnimatePresence>
        {showSpecsDrawer && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSpecsDrawer(false)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
            />

            {/* Drawer container */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed top-0 right-0 z-50 w-full sm:w-[480px] h-full bg-white shadow-2xl border-l border-zinc-200 flex flex-col font-sans"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-4 border-b border-zinc-200 bg-zinc-50/50 shrink-0">
                <div className="flex items-center gap-2">
                  <IconInfoCircle className="h-4.5 w-4.5 text-zinc-600" />
                  <span className="font-bold text-xs text-zinc-800 uppercase tracking-tight">
                    Store Specifications
                  </span>
                </div>
                <button
                  onClick={() => setShowSpecsDrawer(false)}
                  className="p-1 rounded-lg hover:bg-zinc-250 transition cursor-pointer select-none"
                >
                  <IconX className="h-4.5 w-4.5 text-zinc-500" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {loadingMetadata ? (
                  <div className="h-48 flex flex-col items-center justify-center text-zinc-400 gap-2">
                    <div className="h-5 w-5 border-2 border-zinc-300 border-t-zinc-655 rounded-full animate-spin"></div>
                    <span className="text-xs font-medium">Loading store details...</span>
                  </div>
                ) : activeExtMetadata ? (
                  <>
                    {/* Header Summary */}
                    <div className="space-y-2">
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="text-base font-bold text-zinc-900 leading-tight">
                          {activeExtMetadata.name || activeExt.name}
                        </h3>
                        {activeExtMetadata.featured && (
                          <span className="text-[9px] px-2 py-0.5 font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full select-none">
                            Featured
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">
                        by <span className="font-semibold text-zinc-700">{activeExt.author}</span>
                      </p>
                    </div>

                    {/* Specifications Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-0.5">
                        <span className="text-[9px] uppercase font-bold text-zinc-450 block tracking-wider">Version</span>
                        <span className="text-xs font-semibold text-zinc-800 font-mono">{activeExtMetadata.version || "Unknown"}</span>
                      </div>
                      <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-0.5">
                        <span className="text-[9px] uppercase font-bold text-zinc-450 block tracking-wider">Size</span>
                        <span className="text-xs font-semibold text-zinc-800 font-mono">{activeExtMetadata.size || "Unknown"}</span>
                      </div>
                      <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-0.5">
                        <span className="text-[9px] uppercase font-bold text-zinc-450 block tracking-wider">Last Updated</span>
                        <span className="text-xs font-semibold text-zinc-800">{activeExtMetadata.updated || "Unknown"}</span>
                      </div>
                      <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-0.5">
                        <span className="text-[9px] uppercase font-bold text-zinc-450 block tracking-wider">Language</span>
                        <span className="text-xs font-semibold text-zinc-800">{activeExtMetadata.language || "English"}</span>
                      </div>
                    </div>

                    {/* Developer Info Links */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Developer Contacts</h4>
                      <div className="space-y-1.5">
                        {activeExtMetadata.website && activeExtMetadata.website !== "Unknown" && (
                          <a
                            href={activeExtMetadata.website}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-55/40 text-xs font-medium text-zinc-700 transition"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                            Developer Website
                            <IconExternalLink className="h-3.5 w-3.5 ml-auto text-zinc-450" />
                          </a>
                        )}
                        {activeExtMetadata.supportEmail && activeExtMetadata.supportEmail !== "Unknown" && (
                          <a
                            href={`mailto:${activeExtMetadata.supportEmail}`}
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-55/40 text-xs font-medium text-zinc-700 transition"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                            Support Email
                            <span className="ml-auto text-[10px] font-mono text-zinc-500">{activeExtMetadata.supportEmail}</span>
                          </a>
                        )}
                        {activeExtMetadata.privacyPolicy && activeExtMetadata.privacyPolicy !== "Unknown" && (
                          <a
                            href={activeExtMetadata.privacyPolicy}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-55/40 text-xs font-medium text-zinc-700 transition"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                            Privacy Policy
                            <IconExternalLink className="h-3.5 w-3.5 ml-auto text-zinc-450" />
                          </a>
                        )}
                        {(!activeExtMetadata.website || activeExtMetadata.website === "Unknown") &&
                         (!activeExtMetadata.supportEmail || activeExtMetadata.supportEmail === "Unknown") &&
                         (!activeExtMetadata.privacyPolicy || activeExtMetadata.privacyPolicy === "Unknown") && (
                          <p className="text-xs text-zinc-400 italic">No developer contact links scraped.</p>
                        )}
                      </div>
                    </div>

                    {/* Full Description / Overview */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">CWS Overview</h4>
                      <div className="p-3 bg-zinc-50/50 border border-zinc-200 rounded-xl text-xs text-zinc-600 leading-relaxed font-sans max-h-[160px] overflow-y-auto whitespace-pre-wrap select-text">
                        {activeExtMetadata.description || activeExt.description || "No overview details available."}
                      </div>
                    </div>

                    {/* Related Extensions */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Related Extensions</h4>
                      <div className="space-y-2.5">
                        {activeExtMetadata.relatedExtensions && activeExtMetadata.relatedExtensions.length > 0 ? (
                          activeExtMetadata.relatedExtensions.map((rel, idx) => (
                            <a
                              key={idx}
                              href={`https://chromewebstore.google.com/detail/${rel.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block p-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-800 truncate pr-2">{rel.name}</span>
                                <span className="text-[10px] font-bold text-amber-500 font-mono flex items-center shrink-0">
                                  ★ {rel.rating}
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-500 leading-normal line-clamp-2">
                                {rel.description}
                              </p>
                            </a>
                          ))
                        ) : (
                          <p className="text-xs text-zinc-400 italic">No related extensions found.</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-zinc-400">
                    <span className="text-xs italic">Store details unavailable for this extension.</span>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
