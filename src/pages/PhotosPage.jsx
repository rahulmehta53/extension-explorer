import React from "react";
import ExtensionsSidebar from "../components/ExtensionsSidebar";
import PhotosGallery from "../components/PhotosGallery";

export default function PhotosPage({
  extensions,
  currentIndex,
  selectExtension,
  handleDeleteExtension,
  loading,
  setViewMode,
  setShowSettingsModal,
  setSelectedShowcaseId,
  setCreateShowcaseFromCrop,
  filterMode,
  setFilterMode,
  sortMode,
  setSortMode,
  groupMode,
  setGroupMode,
  searchQuery,
  setSearchQuery,
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <ExtensionsSidebar
        extensions={extensions}
        currentIndex={currentIndex}
        selectExtension={selectExtension}
        handleDeleteExtension={handleDeleteExtension}
        loading={loading}
        viewMode="photos"
        setViewMode={setViewMode}
        setShowSettingsModal={setShowSettingsModal}
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
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 bg-zinc-50/20">
          <div className="max-w-7xl mx-auto w-full space-y-6">
            <div className="border-b border-zinc-200 pb-4">
              <h2 className="text-lg font-black text-zinc-900 tracking-tight flex items-center gap-2">
                Photos Vault
              </h2>
              <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                Inspect, filter, search, and catalog layout captures and component designs across all extensions.
              </p>
            </div>
            <PhotosGallery
              onRemakeComponent={(cropInfo) => {
                setCreateShowcaseFromCrop(cropInfo);
                setViewMode("showcase");
              }}
              onViewShowcase={(showcaseId) => {
                setSelectedShowcaseId(showcaseId);
                setViewMode("showcase");
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
