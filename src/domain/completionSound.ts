import type { DownloadProgress } from "./download";

/** A completion event may be repeated while a download's final state is refreshed. */
export function completionSoundGate() {
  const completed = new Set<string>();
  return (progress: Pick<DownloadProgress, "id" | "status">): boolean => {
    if (progress.status !== "completed") {
      completed.delete(progress.id);
      return false;
    }
    if (completed.has(progress.id)) return false;
    completed.add(progress.id);
    return true;
  };
}
