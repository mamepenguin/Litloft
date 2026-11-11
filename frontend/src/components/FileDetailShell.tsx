"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import { useCanvasFloor } from "./FileDetail/hooks/useCanvasFloor";
import { useFind } from "./FileDetail/find/FindContext";
import { useInspectorOpen } from "@/hooks/useInspectorOpen";
import { useInspectorForm } from "@/hooks/useInspectorForm";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useShortcutsContext } from "./ShortcutsProvider";
import { canTakeFindShortcut } from "@/lib/findShortcut";
import { orderContexts } from "@/lib/shortcuts";
import { inspectorOpenStore } from "@/lib/inspectorOpenStore";
import {
  inspectorFormStore,
  type InspectorForm,
} from "@/lib/inspectorFormStore";
import { STACKED_PLAYER_SHARE } from "@/lib/layoutSizes";
import { FileDetailChrome } from "./FileDetail/FileDetailChrome";
import { useInspectorFit } from "./FileDetail/hooks/useInspectorFit";
import { useRegisterLowerInspector } from "./FileDetail/lowerInspector";
import { InspectorPane } from "./InspectorPane";
import { SHEET_SNAP_HALF_FALLBACK } from "@/lib/sheetSnap";
import {
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
  fileId?: string;
  chromeControls?: ReactNode;
  canvasFloor?: boolean;
  onBack?: () => void;
  inspector: ReactNode;
  /** A video, an audio file or a `.loft`: the only kinds that stack. */
  isPlayerFile?: boolean;
  /**
   * Sets the form this file page measured for the components above the
   * shell. The skeleton and the document layout do not: they predict
   * nothing, and a form they measured would outlive them.
   */
  publishesForm?: boolean;
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
  findEnabled?: boolean;
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
  fileId,
  chromeControls,
  canvasFloor,
  onBack,
  inspector,
  isPlayerFile = false,
  publishesForm = false,
  mobileSheet,
  sheetPeek,
  halfSnap = SHEET_SNAP_HALF_FALLBACK,
  children,
  onScrollRootChange,
  resetKey,
  findEnabled = false,
}: FileDetailShellProps): ReactElement {
  const t = useTranslations("inspector");
  const tFind = useTranslations("find");
  const { open, setOpen } = useInspectorOpen(drive, isPlayerFile);
  const isMobile = useIsMobile();
  const find = useFind();
  const { stack } = useShortcutsContext();

  // Not on a phone: the player is `position: sticky` under
  // `[data-sheet-snap]`, so a floor would pin 70% of the screen to the
  // top for the whole scroll.
  const floorActive = !!canvasFloor && !isMobile;
  const measureCanvas = useCanvasFloor(floorActive);
  const canvasRef = useRef<HTMLElement | null>(null);
  const fitHostRef = useRef<HTMLDivElement | null>(null);
  const attachCanvas = useCallback(
    (node: HTMLElement | null) => {
      canvasRef.current = node;
      measureCanvas(node);
      onScrollRootChange?.(node);
    },
    [measureCanvas, onScrollRootChange],
  );

  // Which state, never the snap it resolves to. `half`'s snap moves with
  // the viewport and with the player, so a stored number would name a
  // snap point that is no longer in the list vaul was handed.
  const [sheetState, setSheetState] = useState<SheetState>(SHEET_STATE_PEEK);
  const [inspectorOverride, setInspectorOverride] = useState<boolean | null>(null);
  const [sheetOverride, setSheetOverride] = useState<SheetState | null>(null);
  const [layoutTouched, setLayoutTouched] = useState(false);
  const rememberedInspector = useRef(open);
  const rememberedSheet = useRef(sheetState);
  const previousFindOpen = useRef(false);
  const restoreScroll = useRef<number | null>(null);
  const scrollRestorePending = useRef(false);
  const sheetExpanded = isSheetExpanded(sheetOverride ?? sheetState);
  const desktopInspectorOpen = inspectorOverride ?? open;
  const { form: fitForm, stacked: stackedLayout } = useInspectorForm(fileId);
  const inspectorOpenRef = useRef(desktopInspectorOpen);
  inspectorOpenRef.current = desktopInspectorOpen;
  const handleMeasuredForm = useCallback(
    (measured: Exclude<InspectorForm, "absent"> | null) => {
      if (!publishesForm || !fileId || measured === null) return;
      inspectorFormStore.publish(
        fileId,
        isMobile ? "phone" : measured,
        inspectorOpenRef.current,
      );
    },
    [publishesForm, fileId, isMobile],
  );
  const attachFitHost = useInspectorFit({
    isMobile,
    isPlayerFile,
    onMeasure: handleMeasuredForm,
  });
  const attachInspectorFitHost = useCallback(
    (node: HTMLDivElement | null) => {
      fitHostRef.current = node;
      attachFitHost(node);
    },
    [attachFitHost],
  );

  // The form is the shell's to publish; the open state is a separate fact
  // about the same file, so it is written without touching the form.
  useEffect(() => {
    if (!publishesForm || !fileId || fitForm === "absent") return;
    inspectorFormStore.publish(fileId, fitForm, desktopInspectorOpen);
  }, [publishesForm, fileId, fitForm, desktopInspectorOpen]);

  // Held only while this shell's file is the one the store names, so the
  // next file's measurement — made in its own commit — is never wiped.
  useEffect(() => {
    if (!publishesForm || !fileId) return;
    return () => inspectorFormStore.reset(fileId);
  }, [publishesForm, fileId]);

  /**
   * Half the row, less the bars that share the canvas with the player. Read
   * rather than summed in CSS: the find bar grows a message row and the
   * action row is an addon slot, so neither has a height to write down.
   */
  useLayoutEffect(() => {
    const host = fitHostRef.current;
    const canvas = canvasRef.current;
    if (!host) return;
    if (!stackedLayout || !canvas || host.clientHeight === 0) {
      host.style.removeProperty("--fit-player-h");
      return;
    }
    const findBar = canvas.querySelector<HTMLElement>(
      '[data-testid="find-bar"]',
    );
    const actions = canvas.querySelector<HTMLElement>("[data-preview-actions]");
    const mediaHost = canvas.querySelector<HTMLElement>(".media-detail-host");
    const style = mediaHost ? getComputedStyle(mediaHost) : null;
    const padding = style
      ? (Number.parseFloat(style.paddingTop) || 0) +
        (Number.parseFloat(style.paddingBottom) || 0)
      : 0;
    const chrome =
      (findBar?.offsetHeight ?? 0) + (actions?.offsetHeight ?? 0) + padding;
    const room = host.clientHeight * STACKED_PLAYER_SHARE - chrome;
    host.style.setProperty("--fit-player-h", `${Math.max(0, room)}px`);
  });

  useEffect(() => {
    setSheetState(SHEET_STATE_PEEK);
  }, [resetKey]);

  // The bar borrows the inspector and the sheet without writing either
  // preference: it remembers what it replaced and hands it back on close.
  useEffect(() => {
    if (find.open === previousFindOpen.current) return;
    previousFindOpen.current = find.open;
    if (find.open) {
      // Find's override turns the stacked layout on when the stored state
      // had it closed; the canvas content it displaces comes back on close.
      if (!desktopInspectorOpen && fitForm === "stacked") {
        restoreScroll.current = canvasRef.current?.scrollTop ?? null;
      }
      rememberedInspector.current = open;
      rememberedSheet.current = sheetState;
      setLayoutTouched(false);
      setInspectorOverride(isMobile ? null : true);
      setSheetOverride(
        isMobile
          ? isSheetExpanded(sheetState)
            ? sheetState
            : SHEET_STATE_HALF
          : null,
      );
      return;
    }
    if (restoreScroll.current !== null) scrollRestorePending.current = true;
    if (!layoutTouched) setSheetState(rememberedSheet.current);
    setInspectorOverride(null);
    setSheetOverride(null);
    setLayoutTouched(false);
  }, [
    find.open,
    isMobile,
    open,
    sheetState,
    layoutTouched,
    desktopInspectorOpen,
    fitForm,
  ]);

  // A passive effect: the content the stacked layout displaced is put back
  // by the commit that publishes the new open state, which is after this
  // shell's own.
  useEffect(() => {
    if (!scrollRestorePending.current) return;
    if (fitForm === "stacked" && desktopInspectorOpen) return;
    scrollRestorePending.current = false;
    const remembered = restoreScroll.current;
    restoreScroll.current = null;
    const canvas = canvasRef.current;
    if (canvas && remembered !== null) canvas.scrollTop = remembered;
  }, [fitForm, desktopInspectorOpen]);

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

  const toggle = useCallback(
    () => setOpen(!desktopInspectorOpen),
    [desktopInspectorOpen, setOpen],
  );

  const stackRef = useRef(stack);
  stackRef.current = stack;
  const canTakeFind = useCallback(() => {
    if (!canTakeFindShortcut()) return false;
    return orderContexts(stackRef.current).some(
      (context) => context.id === "file-detail-find",
    );
  }, []);

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

  const findShortcuts = useMemo(
    () => [
      {
        key: "ctrl+f",
        label: tFind("shortcutLabel"),
        handler: () => {
          find.openFindByShortcut();
        },
        when: canTakeFind,
      },
    ],
    [canTakeFind, find, tFind],
  );
  useShortcuts(
    "file-detail-find",
    "Find",
    findShortcuts,
    findEnabled && !isMobile,
  );

  const inspectorOpenOnDesktop = !isMobile && desktopInspectorOpen;
  const handleInspectorButton = useCallback(() => {
    if (find.open) {
      setLayoutTouched(true);
      if (isMobile) setSheetOverride(null);
      else setInspectorOverride(null);
    }
    if (isMobile) {
      setSheetState((prev) =>
        isSheetExpanded(prev) ? SHEET_STATE_PEEK : SHEET_STATE_HALF,
      );
    } else toggle();
  }, [find.open, isMobile, toggle]);

  const lowerInspector = useCallback(() => {
    if (!isMobile) return;
    if (find.open) {
      setLayoutTouched(true);
      setSheetOverride(null);
    }
    setSheetState((prev) =>
      isSheetExpanded(prev) ? SHEET_STATE_PEEK : prev,
    );
  }, [find.open, isMobile]);
  useRegisterLowerInspector(lowerInspector);

  const handleSheetStateChange = useCallback(
    (next: SheetState) => {
      if (find.open) {
        setLayoutTouched(true);
        setSheetOverride(null);
      }
      setSheetState(next);
    },
    [find.open],
  );

  return (
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
        fileId={fileId}
        onBack={onBack}
        inspector={{
          open: isMobile ? sheetExpanded : desktopInspectorOpen,
          onToggle: handleInspectorButton,
          stacked: fitForm === "stacked",
        }}
      >
        {chromeControls}
      </FileDetailChrome>
      <div
        ref={attachInspectorFitHost}
        data-testid="inspector-fit-host"
        // The form and the open state are what the stylesheet turns into
        // a column; neither is a prop of the pane or the player.
        data-inspector-open={
          !isMobile && desktopInspectorOpen ? "true" : undefined
        }
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
          state={sheetOverride ?? sheetState}
          onStateChange={handleSheetStateChange}
          halfSnap={halfSnap}
          peek={sheetPeek}
        >
          {mobileSheet ?? inspector}
        </MobileInspectorSheet>
      )}
    </div>
  );
}
