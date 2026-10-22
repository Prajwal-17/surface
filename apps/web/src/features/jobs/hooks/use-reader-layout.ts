import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  readUiPreferences,
  readerGeometry,
  resizeReaderByKey,
  writeUiPreferences,
} from "@/lib/ui-preferences";

export function useReaderLayout() {
  const ref = useRef<HTMLElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [preferred, setPreferred] = useState(
    () => readUiPreferences().readerWidth,
  );
  const [resizing, setResizing] = useState(false);
  const lastWidth = useRef<number | null>(preferred);
  const geometry = readerGeometry(workspaceWidth, preferred);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWorkspaceWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    lastWidth.current = geometry.width;
    setResizing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !ref.current)
      return;
    const width = readerGeometry(
      workspaceWidth,
      ref.current.getBoundingClientRect().right - event.clientX,
    ).width;
    lastWidth.current = width;
    setPreferred(width);
  }

  function finishResize() {
    setResizing(false);
    if (lastWidth.current !== null)
      writeUiPreferences({ readerWidth: lastWidth.current });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishResize();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const width = resizeReaderByKey(event.key, geometry.width, workspaceWidth);
    if (width === null) return;
    event.preventDefault();
    const next = event.key === "Home" ? null : width;
    setPreferred(next);
    writeUiPreferences({ readerWidth: next });
  }

  return [
    ref,
    {
      ...geometry,
      ready: workspaceWidth > 0,
      resizing,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onKeyDown,
      onLostPointerCapture: finishResize,
    },
  ] as const;
}
