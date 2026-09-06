import { useState } from "react";

export type DownloadSortKey = "status" | "size" | "date" | "queue";
export type DownloadSort = { key: DownloadSortKey; direction: "asc" | "desc" };
export type DownloadView = "list" | "grid";

const SORT_PREF_KEY = "sf-downloader.sort_preference";
const VIEW_PREF_KEY = "sf-downloader.view_preference";

const loadSort = (): DownloadSort => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SORT_PREF_KEY) ?? "");
    if (parsed && ["status", "size", "date", "queue"].includes(parsed.key)) {
      return {
        key: parsed.key as DownloadSortKey,
        direction: parsed.direction === "asc" ? "asc" : "desc",
      };
    }
  } catch {}
  return { key: "date", direction: "desc" };
};

const loadView = (): DownloadView => {
  try {
    const saved = localStorage.getItem(VIEW_PREF_KEY);
    if (saved === "list" || saved === "grid") return saved;
  } catch {}
  return "list";
};

export function useDownloadViewPreferences() {
  const [view, setView] = useState<DownloadView>(loadView);
  const [sort, setSort] = useState<DownloadSort>(loadSort);

  const changeSort = (key: DownloadSortKey) => {
    setSort((current) => {
      const next: DownloadSort = {
        key,
        direction:
          current.key === key
            ? current.direction === "asc"
              ? "desc"
              : "asc"
            : key === "queue"
              ? "asc"
              : "desc",
      };
      try {
        localStorage.setItem(SORT_PREF_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const changeView = (nextView: DownloadView) => {
    setView(nextView);
    try {
      localStorage.setItem(VIEW_PREF_KEY, nextView);
    } catch {}
  };

  return { view, sort, changeSort, changeView };
}
