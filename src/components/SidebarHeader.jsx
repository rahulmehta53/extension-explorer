import React from "react";
import {
  IconHome,
  IconCamera,
  IconCode,
  IconSettings,
} from "@tabler/icons-react";

export default function SidebarHeader({
  viewMode,
  setViewMode,
  setShowSettingsModal,
}) {
  return (
    <div className="p-3.5 border-b border-zinc-200 bg-white/95 flex items-center justify-between gap-3 shrink-0 relative">
      {/* Group 1: Primary Views (Left) */}
      <div className="flex items-center gap-1">
        {/* Explorer View Button */}
        <button
          onClick={() => setViewMode("explorer")}
          className={`flex flex-col items-center gap-0.5 cursor-pointer focus:outline-none transition-all duration-200 select-none px-2 py-1.5 rounded-xl ${
            viewMode === "explorer"
              ? "bg-zinc-200/60 text-zinc-900 font-bold"
              : "text-zinc-400 hover:text-zinc-755 hover:bg-zinc-200/20"
          }`}
          title="Explorer HUD"
        >
          <IconHome className="h-6 w-6 shrink-0" />
          <span className="text-[9px] tracking-wider uppercase">
            Explorer
          </span>
        </button>

        {/* Photos Gallery Button */}
        <button
          onClick={() => setViewMode("photos")}
          className={`flex flex-col items-center gap-0.5 cursor-pointer focus:outline-none transition-all duration-200 select-none px-2.5 py-1.5 rounded-xl ${
            viewMode === "photos"
              ? "bg-zinc-200/60 text-zinc-900 font-bold"
              : "text-zinc-400 hover:text-zinc-755 hover:bg-zinc-200/20"
          }`}
          title="Photos Gallery"
        >
          <IconCamera className="h-6 w-6 shrink-0" />
          <span className="text-[9px] tracking-wider uppercase">
            Photos
          </span>
        </button>

        {/* Showcase Lab Button */}
        <button
          onClick={() => setViewMode("showcase")}
          className={`flex flex-col items-center gap-0.5 cursor-pointer focus:outline-none transition-all duration-200 select-none px-2 py-1.5 rounded-xl ${
            viewMode === "showcase"
              ? "bg-zinc-200/60 text-zinc-900 font-bold"
              : "text-zinc-400 hover:text-zinc-755 hover:bg-zinc-200/20"
          }`}
          title="Showcase Lab"
        >
          <IconCode className="h-6 w-6 shrink-0" />
          <span className="text-[9px] tracking-wider uppercase">
            Showcase
          </span>
        </button>
      </div>

      {/* Vertical Divider */}
      <div className="h-9 w-px bg-zinc-200/80 shrink-0"></div>

      {/* Group 2: Utilities & Actions (Right) */}
      <div className="flex items-center gap-4.5">
        {/* Settings Trigger Button */}
        <button
          onClick={() => setShowSettingsModal(true)}
          className="flex flex-col items-center gap-0.5 cursor-pointer focus:outline-none text-zinc-400 hover:text-zinc-755 transition duration-200 select-none"
          title="Settings & Operations"
        >
          <IconSettings className="h-6 w-6 shrink-0" />
          <span className="text-[9px] tracking-wider uppercase">
            Settings
          </span>
        </button>
      </div>
    </div>
  );
}
