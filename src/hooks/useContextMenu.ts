import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

export type ContextMenuState<T> = {
  x: number;
  y: number;
  item: T;
};

export function useContextMenu<T>() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState<T> | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const openContextMenu = useCallback((event: ReactMouseEvent, item: T) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, item });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const element = contextMenuRef.current;
    const rect = element.getBoundingClientRect();
    const padding = 8;
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (x + rect.width + padding > window.innerWidth) x = window.innerWidth - rect.width - padding;
    if (y + rect.height + padding > window.innerHeight) y = window.innerHeight - rect.height - padding;
    element.style.left = `${Math.max(padding, x)}px`;
    element.style.top = `${Math.max(padding, y)}px`;
  }, [contextMenu]);

  return { contextMenu, setContextMenu, contextMenuRef, openContextMenu };
}
