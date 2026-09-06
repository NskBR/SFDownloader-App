import { useCallback, useRef, useState } from "react";

export function useDownloadSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastSelectedRef = useRef<string | null>(null);

  const selectAll = useCallback(() => {
    setSelected(new Set(visibleIds));
  }, [visibleIds]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const selectOnly = useCallback((id: string) => {
    lastSelectedRef.current = id;
    setSelected(new Set([id]));
  }, []);

  const handleSelect = useCallback(
    (id: string, event: React.MouseEvent) => {
      setSelected((current) => {
        if (event.shiftKey && lastSelectedRef.current) {
          const anchor = visibleIds.indexOf(lastSelectedRef.current);
          const target = visibleIds.indexOf(id);
          if (anchor !== -1 && target !== -1) {
            const [start, end] = anchor < target ? [anchor, target] : [target, anchor];
            const next = new Set(current);
            for (let index = start; index <= end; index += 1) next.add(visibleIds[index]);
            return next;
          }
        }

        if (event.ctrlKey || event.metaKey) {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          lastSelectedRef.current = id;
          return next;
        }

        lastSelectedRef.current = id;
        return new Set([id]);
      });
    },
    [visibleIds],
  );

  return { selected, setSelected, selectAll, deselectAll, selectOnly, handleSelect };
}
