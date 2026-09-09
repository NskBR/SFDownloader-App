import { ArrowDown, LayoutGrid, List, Magnet, Search } from "lucide-react";
import type { KeyboardEvent, ClipboardEvent } from "react";
import type { DownloadSort, DownloadSortKey, DownloadView } from "../../hooks/useDownloadViewPreferences";
import { CustomSelect } from "../ui/CustomSelect";

interface DownloadsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onInspect: (value: string) => void;
  onPickTorrent: () => void;
  placeholder: string;
  sort: DownloadSort;
  sortOptions: { key: DownloadSortKey; label: string }[];
  onSortChange: (key: DownloadSortKey) => void;
  view: DownloadView;
  onViewChange: (view: DownloadView) => void;
}

const isDownloadSource = (value: string) =>
  /^(https?:\/\/|magnet:\?)/i.test(value) || value.toLowerCase().endsWith(".torrent");

export function DownloadsToolbar({
  search,
  onSearchChange,
  onInspect,
  onPickTorrent,
  placeholder,
  sort,
  sortOptions,
  onSortChange,
  view,
  onViewChange,
}: DownloadsToolbarProps) {
  const inspectSearch = () => {
    const value = search.trim();
    if (isDownloadSource(value)) onInspect(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") inspectSearch();
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const value = event.clipboardData.getData("text").trim();
    if (!isDownloadSource(value)) return;
    event.preventDefault();
    onInspect(value);
  };

  return (
    <header className="flux-header" data-tauri-drag-region>
      <div className="search-container" data-tauri-drag-region>
        <Search />
        <input
          className="search-input"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
        />
      </div>

      <div className="header-right-group" data-tauri-drag-region>
        <button
          type="button"
          className="btn-layout-switcher torrent-file-picker"
          title="Abrir arquivo .torrent"
          aria-label="Abrir arquivo .torrent"
          onClick={onPickTorrent}
        >
          <Magnet size={18} />
        </button>
        <div className="sort-dropdown">
          <CustomSelect
            value={sort.key}
            options={sortOptions.map((option) => ({ value: option.key, label: option.label }))}
            onChange={(value) => onSortChange(value as DownloadSortKey)}
          />
          <button
            type="button"
            className="sort-direction"
            onClick={() => onSortChange(sort.key)}
            title={sort.direction === "asc" ? "Ascending" : "Descending"}
          >
            <ArrowDown
              size={15}
              style={{ transform: sort.direction === "asc" ? "rotate(180deg)" : "none" }}
            />
          </button>
        </div>

        <button
          className={`btn-layout-switcher ${view === "list" ? "active" : ""}`}
          title="List View"
          onClick={() => onViewChange("list")}
        >
          <List size={20} />
        </button>
        <button
          className={`btn-layout-switcher ${view === "grid" ? "active" : ""}`}
          title="Grid View"
          onClick={() => onViewChange("grid")}
        >
          <LayoutGrid size={20} />
        </button>
      </div>
    </header>
  );
}
