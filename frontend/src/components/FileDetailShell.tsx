"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import { useCanvasFloor } from "./FileDetail/hooks/useCanvasFloor";
import { useInspectorOpen } from "@/hooks/useInspectorOpen";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useShortcuts } from "@/hooks/useShortcuts";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import { FileDetailChrome } from "./FileDetail/FileDetailChrome";
import { useInspectorFit } from "./FileDetail/hooks/useInspectorFit";
import { InspectorPane } from "./InspectorPane";
import { SHEET_SNAP_HALF_FALLBACK } from "@/lib/sheetSnap";
import {
  CollapseSheetContext,
  MobileInspectorSheet,
  SHEET_PEEK_HEIGHT,
  SHEET_STATE_HALF,
  SHEET_STATE_PEEK,
  isSheetExpanded,
  type SheetState,
} from "./MobileInspectorSheet";

interface FileDetailShellProps {
  drive: string;
  folderPath?: string;
  title: string;
  titleNode?: ReactNode;
  chromeControls?: ReactNode;
  canvasFloor?: boolean;
  onBack?: () => void;
  inspector: ReactNode;
  /**
   * Lets the host include items that live in the desktop canvas footer —
   * sections whose structured content needs width that the desktop
   * Inspector cannot provide.
   */
  mobileSheet?: ReactNode;
  sheetPeek?: ReactNode;
  /** What `half` is worth in vaul's units on this page. */
  halfSnap?: number;
  children: ReactNode;
  /**
   * Handed the element that actually scrolls the canvas. The host's own
   * wrapper never scrolls, so a host measuring it would be measuring a box
   * whose height is the whole page.
   */
  onScrollRootChange?: (node: HTMLElement | null) => void;
  resetKey?: string;
}

/**
 * The `Cmd+\` / `Ctrl+\` shortcut is bound here so it survives the pane
 * unmount when collapsed, or the keystroke would only close the pane and
 * never reopen it.
 */
export function FileDetailShell({
  drive,
  folderPath,
  title,
  titleNode,
  chromeControls,
  canvasFloor,
  onBack,
  inspector,
  mobileSheet,
  sheetPeek,
  halfSnap = SHEET_SNAP_HALF_FALLBACK,
  children,
  onScrollRootChange,
  resetKey,
}: FileDetailShellProps): ReactElement {
  const t = useTranslations("inspector");
  const { open, setOpen } = useInspectorOpen(drive);
  const isMobile = useIsMobile();

  // Not on a phone: the player is `position: sticky` under
  // `[data-sheet-snap]`, so a floor would pin 70% of the screen to the
  // top for the whole scroll.
  const floorActive = !!canvasFloor && !isMobile;
  const measureCanvas = useCanvasFloor(floorActive);
  const attachCanvas = useCallback(
    (node: HTMLElement | null) => {
      measureCanvas(node);
      onScrollRootChange?.(node);
    },
    [measureCanvas, onScrollRootChange],
  );

  // Which state, never the snap it resolves to. `half`'s snap moves with
  // the viewport and with the player, so a stored number would name a
  // snap point that is no longer in the list vaul was handed.
  const [sheetState, setSheetState] = useState<SheetState>(SHEET_STATE_PEEK);
  const sheetExpanded = isSheetExpanded(sheetState);
  const attachInspectorFitHost = useInspectorFit();

  useEffect(() => {
    setSheetState(SHEET_STATE_PEEK);
  }, [resetKey]);

  // Without this, resizing across the viewport boundary leaves
  // `useInspectorOpen` reading a stale viewport-derived snapshot when
  // the user has no persisted localStorage value.
  useEffect(() => {
    function handleResize() {
      inspectorOpenStore.notifyViewportChange();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  const collapseSheet = useCallback(() => setSheetState(SHEET_STATE_PEEK), []);

  const shortcuts = useMemo(
    () => [
      {
        key: "ctrl+\\",
        label: t("toggleShortcut"),
        handler: toggle,
        editingOnly: false as const,
      },
    ],
    [toggle, t],
  );
  useShortcuts("file-detail-shell", "Inspector", shortcuts, !isMobile);

  const inspectorOpenOnDesktop = !isMobile && open;
  const handleInspectorButton = useCallback(() => {
    if (isMobile) {
      setSheetState((prev) =>
        isSheetExpanded(prev) ? SHEET_STATE_PEEK : SHEET_STATE_HALF,
      );
    } else toggle();
  }, [isMobile, toggle]);

  return (
    <CollapseSheetContext.Provider value={collapseSheet}>
      <div
        data-testid="file-detail-shell"
        // The player reads this through a stylesheet, never through a
        // prop, to stick to the top of the canvas.
        data-sheet-snap={
          isMobile ? (sheetExpanded ? "expanded" : "peek") : undefined
        }
        className="flex h-full w-full flex-col"
      >
        <FileDetailChrome
          drive={drive}
          folderPath={folderPath}
          title={title}
          titleNode={titleNode}
          onBack={onBack}
          inspector={{
            open: isMobile ? sheetExpanded : open,
            onToggle: handleInspectorButton,
          }}
        >
          {chromeControls}
        </FileDetailChrome>
        <div
          ref={attachInspectorFitHost}
          data-testid="inspector-fit-host"
          className="relative flex min-h-0 flex-1"
        >
          <main
            ref={attachCanvas}
            data-canvas-floor={floorActive ? "true" : undefined}
            className="flex min-w-0 min-h-0 flex-1 flex-col overflow-auto"
            // The sheet rests over the bottom of the page, so the page
            // has to end above it.
            style={
              isMobile
                ? { paddingBottom: SHEET_PEEK_HEIGHT }
                : undefined
            }
          >
            {children}
          </main>
          {inspectorOpenOnDesktop && <InspectorPane>{inspector}</InspectorPane>}
        </div>
        {isMobile && (
          <MobileInspectorSheet
            state={sheetState}
            onStateChange={setSheetState}
            halfSnap={halfSnap}
            peek={sheetPeek}
          >
            {mobileSheet ?? inspector}
          </MobileInspectorSheet>
        )}
      </div>
    </CollapseSheetContext.Provider>
  );
}
