import { ArrowLeftRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ArrowBigRightDashIcon, type ArrowBigRightDashIconHandle } from "@/components/ui/arrow-big-right-dash";
import { Button } from "@/components/ui/button";
import { DeleteIcon, type DeleteIconHandle } from "@/components/ui/delete";
import { Field, FieldLabel } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { MapPinIcon, type MapPinIconHandle } from "@/components/ui/map-pin";
import { Separator } from "@/components/ui/separator";
import { Slider, SliderValue } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { UndoIcon, type UndoIconHandle } from "@/components/ui/undo";
import { UndoDotIcon, type UndoDotIconHandle } from "@/components/ui/undo-dot";
import { UploadIcon, type UploadIconHandle } from "@/components/ui/upload";
import { XIcon, type XIconHandle } from "@/components/ui/x";
import { cn } from "@/lib/utils";
import { controls } from "../main.js";

const CONTROLS_HIDDEN_KEY = "iconMosaic.controlsHidden";

// Content for the bottom-left info card (Figma node 4992:24139), one entry
// per *assigned* Camera Target slot — up to CAMERA_TARGET_SLOT_COUNT (7) in
// main.js, but indexed here by position among whichever of those are
// actually assigned, not by raw slot index, so the card always has exactly
// as many steps as there are targets in use (assign 3, it's Step 1-3;
// assign 5, it's Step 1-5 — see activeTargetPosition's own comment at its
// call site for how a raw slot index gets translated to that). Swaps with
// state.cameraTargetActiveIndex so the card tracks whichever target is
// currently framed (manual 1-7 press, or the /scroll route easing through
// them on scroll). Placeholder copy throughout — only the step number/
// title/text change per target; the icon and layout stay fixed. Steps 4-7
// are generic placeholders (no real content yet, unlike 1-3) since only 3
// of the 7 slots are actually assigned on the current placeholder model.
const CARD_CONTENT = [
  {
    step: "Step 1 · Your Site",
    title: "Every site makes and moves energy",
    text: "Solar panels, a battery, inverter, and EV charger generate live data and available energy for the system to use.",
  },
  {
    step: "Step 2 · Your Network",
    title: "Every site connects to the grid",
    text: "Real-time data flows between sites, batteries, and the grid, so power moves to wherever it's needed most.",
  },
  {
    step: "Step 3 · Your Platform",
    title: "Every site feeds one view",
    text: "A single dashboard aggregates production, storage, and demand across every connected site.",
  },
  {
    step: "Step 4",
    title: "Placeholder step 4",
    text: "Content for this step hasn't been written yet.",
  },
  {
    step: "Step 5",
    title: "Placeholder step 5",
    text: "Content for this step hasn't been written yet.",
  },
  {
    step: "Step 6",
    title: "Placeholder step 6",
    text: "Content for this step hasn't been written yet.",
  },
  {
    step: "Step 7",
    title: "Placeholder step 7",
    text: "Content for this step hasn't been written yet.",
  },
];

type RevealPhase = "closed" | "entering" | "open" | "closing";
const MODAL_CLOSE_MS = 150; // keep in sync with --modal-close-dur in index.css

// Shared open/close lifecycle for anything driven by the --modal-open-dur/
// --modal-close-dur tokens (transitions.dev, 06-modal.md): mount in a
// pre-open state, flip to "open" on the next frame so the enter transition
// actually plays, and on close hold in "closing" for the CSS transition's
// duration before unmounting.
function useRevealPhase(visible: boolean, closeMs: number): RevealPhase {
  const [phase, setPhase] = useState<RevealPhase>(() => (visible ? "open" : "closed"));

  useEffect(() => {
    if (visible) {
      setPhase((p) => (p === "closed" ? "entering" : p === "closing" ? "open" : p));
    } else {
      setPhase((p) => (p === "closed" ? "closed" : "closing"));
    }
  }, [visible]);

  useEffect(() => {
    if (phase !== "entering") return;
    const id = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") return;
    const id = window.setTimeout(() => setPhase("closed"), closeMs);
    return () => window.clearTimeout(id);
  }, [phase, closeMs]);

  return phase;
}

type TextSwapPhase = "rest" | "exit" | "enterStart";
const TEXT_SWAP_MS = 50; // keep in sync with --text-swap-dur in index.css

// Three-phase text/state swap (transitions.dev, 04-text-states-swap.md):
// exit the old value (blur + slide up + fade), swap to the new value while
// invisible and pre-positioned below (no transition), then release on the
// next frame so it eases back to rest. `value` can be any comparable state,
// not just text — the space-bar indicator drives its label AND its color
// off the same delayed `displayed` value so both change together, mid-swap.
function useTextSwap<T>(value: T, exitMs: number): { displayed: T; phase: TextSwapPhase } {
  const [displayed, setDisplayed] = useState(value);
  const [phase, setPhase] = useState<TextSwapPhase>("rest");

  useEffect(() => {
    if (value === displayed) return;
    setPhase("exit");
    const exitTimer = window.setTimeout(() => {
      setDisplayed(value);
      setPhase("enterStart");
    }, exitMs);
    return () => window.clearTimeout(exitTimer);
  }, [value, displayed, exitMs]);

  useEffect(() => {
    if (phase !== "enterStart") return;
    const id = requestAnimationFrame(() => setPhase("rest"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  return { displayed, phase };
}

type TextsRevealPhase = "shown" | "hiding" | "enterStart";
type TextsRevealDirection = "up" | "down";
const TEXTS_REVEAL_HIDE_MS = 200; // keep in sync with .t-stagger.is-hiding's 200ms transition in index.css

// Group text-block reveal (transitions.dev, 18-texts-reveal.md, adapted):
// unlike useTextSwap above (one value swapping in place), this fades a whole
// block of stacked lines out together, swaps to the new step's content while
// hidden, then plays the staggered blurred-rise entrance back in — used by
// the bottom-left info card's step/title/text, which all change together
// whenever the active Camera Target does. Takes the target *index* rather
// than an opaque value (contrast useTextSwap) specifically so it can compare
// old vs. new to derive `direction`: scrolling forward (index increasing)
// travels one way, scrolling backward the other — see the CSS's
// data-direction selectors for what that actually moves. This is a
// deliberate departure from the reference snippet's own "quiet fade, no
// Y-return" exit (which exists there specifically so *dismissing* something
// doesn't read as a reversed reveal) — here the whole point is to tie the
// motion's direction to the scroll gesture that caused it. Starts already
// "shown" (no animate-in on first mount) — same convention as useTextSwap's
// "rest".
function useTextsReveal(
  index: number,
  hideMs: number,
): { displayedIndex: number; phase: TextsRevealPhase; direction: TextsRevealDirection } {
  const [displayedIndex, setDisplayedIndex] = useState(index);
  const [phase, setPhase] = useState<TextsRevealPhase>("shown");
  const [direction, setDirection] = useState<TextsRevealDirection>("down");

  useEffect(() => {
    if (index === displayedIndex) return;
    setDirection(index > displayedIndex ? "down" : "up");
    setPhase("hiding");
    const hideTimer = window.setTimeout(() => {
      setDisplayedIndex(index);
      setPhase("enterStart");
    }, hideMs);
    return () => window.clearTimeout(hideTimer);
  }, [index, displayedIndex, hideMs]);

  useEffect(() => {
    if (phase !== "enterStart") return;
    const id = requestAnimationFrame(() => setPhase("shown"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  return { displayedIndex, phase, direction };
}

interface IconAnimationHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

// The lucide-animated icon components only self-trigger on hover over their
// own (icon-sized) bounding box. Buttons want the whole hit area to trigger
// the icon on press (not hover), so the icon is used in "controlled" mode via
// ref and driven from the button's own pointer down/up/leave instead.
function useIconPressHandlers<T extends IconAnimationHandle>() {
  const ref = useRef<T>(null);
  return {
    ref,
    onPointerDown: () => ref.current?.startAnimation(),
    onPointerLeave: () => ref.current?.stopAnimation(),
    onPointerUp: () => ref.current?.stopAnimation(),
  };
}

export function Panel() {
  // The /scroll route always starts with the control panel hidden — same
  // "ignore the shared preference on load, not just fall back to it"
  // treatment as IS_SCROLL_ROUTE's shaderTheme default in main.js, and for
  // the same reason: CONTROLS_HIDDEN_KEY is shared storage across every
  // route, so a "visible" preference saved elsewhere would otherwise leak in
  // here too. The H key can still show it for the current session (see the
  // persist effect below, which skips writing through to storage on this
  // route so that toggle never leaks back out to other routes either).
  const [hidden, setHidden] = useState(() =>
    controls.getInitialState().isScrollRoute ? true : localStorage.getItem(CONTROLS_HIDDEN_KEY) === "1",
  );
  const [state, setState] = useState(() => controls.getInitialState());
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadModelIconPress = useIconPressHandlers<UploadIconHandle>();
  const resetPositionIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const goIconRefs = useRef<(ArrowBigRightDashIconHandle | null)[]>([]);
  const resetViewIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const setDefaultViewIconPress = useIconPressHandlers<MapPinIconHandle>();
  const goDefaultViewIconRef = useRef<ArrowBigRightDashIconHandle | null>(null);
  const resetRotationIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const resetSizeIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const deleteArrowIconPress = useIconPressHandlers<DeleteIconHandle>();
  const undoArrowIconPress = useIconPressHandlers<UndoIconHandle>();
  const clearArrowsIconPress = useIconPressHandlers<XIconHandle>();
  const spaceIndicator = useTextSwap(!!state.spaceHeld, TEXT_SWAP_MS);
  const photoIndicator = useTextSwap(!!state.photoMode, TEXT_SWAP_MS);
  const videoIndicator = useTextSwap(!!state.videoMode, TEXT_SWAP_MS);
  const [videoCountdown, setVideoCountdown] = useState<number | null>(null);
  const flowDrawIndicator = useTextSwap(!!state.modelFlowDrawMode, TEXT_SWAP_MS);

  useEffect(() => controls.subscribe((patch: object) => setState((s) => ({ ...s, ...patch }))), []);

  // Countdown shown in the video-mode pill while a capture is running — main.js
  // only tells the panel *that* it's recording (state.videoRecording), not a
  // live progress tick, so the countdown is ticked down here from the fixed
  // clip length it does expose (state.videoExportDurationMs). Starts fresh
  // every time a recording begins; clears the moment it ends, whether that's
  // the countdown reaching 0 or main.js flipping videoRecording off first.
  useEffect(() => {
    if (!state.videoRecording) {
      setVideoCountdown(null);
      return;
    }
    setVideoCountdown(Math.round((state.videoExportDurationMs ?? 10000) / 1000));
    const id = window.setInterval(() => {
      setVideoCountdown((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.videoRecording, state.videoExportDurationMs]);

  useEffect(() => {
    // Never persists on the /scroll route — see the forced-hidden default
    // above for why.
    if (state.isScrollRoute) return;
    localStorage.setItem(CONTROLS_HIDDEN_KEY, hidden ? "1" : "0");
  }, [hidden, state.isScrollRoute]);

  useEffect(() => {
    controls.setPanelsHidden(hidden);
  }, [hidden]);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "h") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // don't hijack typing into a slider/text field
      setHidden((h) => !h);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  useEffect(() => {
    // dragenter/dragleave fire repeatedly as the cursor crosses child element
    // boundaries, so a counter (rather than a single boolean) is needed to
    // know when the drag has actually left the window. main.js has its own
    // window-level drop handler that does the actual model loading; this
    // effect only tracks drag state to show the overlay.
    let depth = 0;
    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth += 1;
      setIsDraggingFile(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (isFileDrag(event)) event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDraggingFile(false);
    };
    const onDrop = () => {
      depth = 0;
      setIsDraggingFile(false);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const overlayPhase = useRevealPhase(isDraggingFile, MODAL_CLOSE_MS);
  const panelPhase = useRevealPhase(!hidden, MODAL_CLOSE_MS);
  const cameraTargetsPhase = useRevealPhase((state.customModelObjectNames?.length ?? 0) > 0, MODAL_CLOSE_MS);
  const photoOptionsPhase = useRevealPhase(!!state.photoMode, MODAL_CLOSE_MS);
  const lineWidthSliderPhase = useRevealPhase(!!state.photoUniformLineWidth, MODAL_CLOSE_MS);
  const flowObjectsPhase = useRevealPhase((state.selectedFlowArrowObjects?.length ?? 0) > 0, MODAL_CLOSE_MS);
  // The card's step count should match however many Camera Target slots are
  // actually assigned, not the raw 7-slot capacity — cameraTargetActiveIndex
  // is a raw slot index (e.g. 5, if slots 0/2/5 are the only ones assigned),
  // but the card should read "Step 3" there (the 3rd assigned target), not
  // "Step 6". assignedSlotIndices is cameraTargetSlots (main.js's
  // CAMERA_TARGET_SLOT_COUNT-length array of names/nulls) compacted down to
  // just the assigned ones, in slot order; activeTargetPosition is where the
  // active slot falls in that compacted list — the actual CARD_CONTENT
  // index. -1 (nothing assigned yet, or somehow not found) falls back to 0.
  const assignedSlotIndices = (state.cameraTargetSlots ?? []).reduce<number[]>((acc, name, i) => {
    if (name) acc.push(i);
    return acc;
  }, []);
  const activeTargetPosition = Math.max(0, assignedSlotIndices.indexOf(state.cameraTargetActiveIndex ?? -1));
  const cardContentReveal = useTextsReveal(activeTargetPosition, TEXTS_REVEAL_HIDE_MS);
  const cardContent = CARD_CONTENT[cardContentReveal.displayedIndex] ?? CARD_CONTENT[0];

  return (
    <>
      {overlayPhase !== "closed" && (
        <div
          className={cn(
            "t-overlay-backdrop pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-info/30 backdrop-blur-[1px]",
            overlayPhase === "open" && "is-open",
            overlayPhase === "closing" && "is-closing",
          )}
        >
          <p
            className={cn(
              "t-modal rounded-full border border-white/30 bg-black/50 px-6 py-3 font-semibold text-lg text-white",
              overlayPhase === "open" && "is-open",
              overlayPhase === "closing" && "is-closing",
            )}
          >
            Drop the file to change the model
          </p>
        </div>
      )}

      <div className="pointer-events-none fixed right-4 bottom-4 z-10 flex items-center gap-1.5 text-muted-foreground text-xs">
        <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">H</Kbd>
        hides the panels
      </div>

      {panelPhase !== "closed" && (
        <div className="pointer-events-none fixed top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <svg
            className={cn(
              "t-fade-center size-5 text-white/25",
              panelPhase === "open" && "is-open",
              panelPhase === "closing" && "is-closing",
            )}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </div>
      )}

      {panelPhase !== "closed" && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          <button
            className={cn(
              "t-fade-center pointer-events-auto cursor-pointer overflow-hidden rounded-full border px-3 py-1.5 font-medium text-xs shadow-lg backdrop-blur-sm transition-colors duration-[var(--text-swap-dur)]",
              flowDrawIndicator.displayed
                ? "border-transparent bg-white text-black"
                : "border-input bg-popover/80 text-foreground",
              panelPhase === "open" && "is-open",
              panelPhase === "closing" && "is-closing",
            )}
            onClick={() => {
              const next = !state.modelFlowDrawMode;
              controls.setModelFlowDraw(next);
              // main.js resets position on enable, and disables rotation
              // again on disable — mirror that here too, same as the
              // dedicated "Reset position"/rotation controls do.
              setState((s) => ({
                ...s,
                modelFlowDrawMode: next,
                modelOffsetX: next ? 0 : s.modelOffsetX,
                modelOffsetY: next ? 0 : s.modelOffsetY,
                rotationDisabled: next ? s.rotationDisabled : true,
              }));
            }}
            type="button"
          >
            <span
              className={cn(
                "t-text-swap",
                flowDrawIndicator.phase === "exit" && (state.modelFlowDrawMode ? "is-exit-up" : "is-exit-down"),
                flowDrawIndicator.phase === "enterStart" &&
                  (state.modelFlowDrawMode ? "is-enter-from-bottom" : "is-enter-from-top"),
              )}
            >
              {flowDrawIndicator.displayed ? (
                <>
                  Click to draw, double-click to finish,{" "}
                  <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">A</Kbd> to exit
                </>
              ) : (
                <>
                  Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">A</Kbd> for flow draw mode
                </>
              )}
            </span>
          </button>

          {!state.isScrollRoute && (
          <div className="relative">
            <div
              className={cn(
                "t-fade-center overflow-hidden rounded-full border px-3 py-1.5 font-medium text-xs shadow-lg backdrop-blur-sm transition-colors duration-[var(--text-swap-dur)]",
                photoIndicator.displayed
                  ? "border-transparent bg-white text-black"
                  : "border-input bg-popover/80 text-foreground",
                panelPhase === "open" && "is-open",
                panelPhase === "closing" && "is-closing",
              )}
            >
              <span
                className={cn(
                  "t-text-swap",
                  photoIndicator.phase === "exit" && (state.photoMode ? "is-exit-up" : "is-exit-down"),
                  photoIndicator.phase === "enterStart" &&
                    (state.photoMode ? "is-enter-from-bottom" : "is-enter-from-top"),
                )}
              >
                {photoIndicator.displayed ? (
                  <>
                    Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">⇧P</Kbd> to
                    capture, <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">Esc</Kbd> to exit
                  </>
                ) : (
                  <>
                    Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">P</Kbd> for photo mode
                  </>
                )}
              </span>
            </div>

            {photoOptionsPhase !== "closed" && (
              <div className="pointer-events-none absolute top-1/2 left-full ml-3 -translate-y-1/2">
                <div
                  className={cn(
                    "t-fade-center pointer-events-auto flex w-72 flex-col gap-2 rounded-xl border border-input bg-popover/80 p-6 text-xs shadow-lg backdrop-blur-sm",
                    photoOptionsPhase === "open" && "is-open",
                    photoOptionsPhase === "closing" && "is-closing",
                  )}
                >
                  <Label className="gap-2.5 text-xs">
                    <Switch
                      checked={!!state.photoExport2x}
                      onCheckedChange={(checked: boolean) => {
                        controls.setPhotoExport2x(checked);
                        setState((s) => ({ ...s, photoExport2x: checked }));
                      }}
                    />
                    @2x resolution
                  </Label>
                  <Label className="gap-2.5 text-xs">
                    <Switch
                      checked={!!state.photoUniformLineWidth}
                      onCheckedChange={(checked: boolean) => {
                        controls.setPhotoUniformLineWidth(checked);
                        setState((s) => ({ ...s, photoUniformLineWidth: checked }));
                      }}
                    />
                    Uniform line width
                    <span className="rounded-full bg-info/15 px-1.5 py-0.5 font-semibold text-[10px] text-info leading-none">
                      New
                    </span>
                  </Label>
                  {lineWidthSliderPhase !== "closed" && (
                    <div
                      className={cn(
                        "t-reveal",
                        lineWidthSliderPhase === "open" && "is-open",
                        lineWidthSliderPhase === "closing" && "is-closing",
                      )}
                    >
                      <Field className="pt-1 pb-2">
                        <Slider
                          max={state.photoLineWidthHalfPxMax}
                          min={state.photoLineWidthHalfPxMin}
                          onValueChange={(value: number | readonly number[]) => {
                            const halfWidthPx = value as number;
                            controls.setPhotoLineWidthHalfPx(halfWidthPx);
                            setState((s) => ({ ...s, photoLineWidthHalfPx: halfWidthPx }));
                          }}
                          step={0.1}
                          value={state.photoLineWidthHalfPx}
                        >
                          <div className="mb-3 flex w-full items-center justify-between gap-1">
                            <FieldLabel className="text-xs sm:text-xs">Line width</FieldLabel>
                            <SliderValue className="text-xs text-muted-foreground" />
                          </div>
                        </Slider>
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          {!state.isScrollRoute && (
          <div
            className={cn(
              "t-fade-center overflow-hidden rounded-full border px-3 py-1.5 font-medium text-xs shadow-lg backdrop-blur-sm transition-colors duration-[var(--text-swap-dur)]",
              videoIndicator.displayed
                ? "border-transparent bg-white text-black"
                : "border-input bg-popover/80 text-foreground",
              panelPhase === "open" && "is-open",
              panelPhase === "closing" && "is-closing",
            )}
          >
            <span
              className={cn(
                "t-text-swap",
                videoIndicator.phase === "exit" && (state.videoMode ? "is-exit-up" : "is-exit-down"),
                videoIndicator.phase === "enterStart" &&
                  (state.videoMode ? "is-enter-from-bottom" : "is-enter-from-top"),
              )}
            >
              {videoIndicator.displayed ? (
                state.videoRecording ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="t-record-dot size-1.5 shrink-0 rounded-full bg-destructive" />
                    Recording video… {videoCountdown ?? Math.round((state.videoExportDurationMs ?? 10000) / 1000)}s
                  </span>
                ) : state.pngSequenceExporting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="t-record-dot size-1.5 shrink-0 rounded-full bg-destructive" />
                    Exporting PNG sequence… {Math.round((state.pngSequenceProgress ?? 0) * 100)}%
                  </span>
                ) : (
                  <>
                    Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">Enter</Kbd> to record,{" "}
                    <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">⌘Enter</Kbd> for PNG sequence,{" "}
                    <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">V</Kbd> to exit
                  </>
                )
              ) : (
                <>
                  Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">V</Kbd> for video mode
                </>
              )}
            </span>
          </div>
          )}

          <div
            className={cn(
              "t-fade-center overflow-hidden rounded-full border px-3 py-1.5 font-medium text-xs shadow-lg backdrop-blur-sm transition-colors duration-[var(--text-swap-dur)]",
              spaceIndicator.displayed
                ? "border-transparent bg-white text-black"
                : "border-input bg-popover/80 text-foreground",
              panelPhase === "open" && "is-open",
              panelPhase === "closing" && "is-closing",
            )}
          >
            <span
              className={cn(
                "t-text-swap",
                spaceIndicator.phase === "exit" && (state.spaceHeld ? "is-exit-up" : "is-exit-down"),
                spaceIndicator.phase === "enterStart" &&
                  (state.spaceHeld ? "is-enter-from-bottom" : "is-enter-from-top"),
              )}
            >
              {spaceIndicator.displayed ? (
                "Release to return to default view"
              ) : (
                <>
                  Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">Space</Kbd> for bird's-eye view
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {panelPhase !== "closed" && (
        <div
          className={cn(
            "t-panel t-panel-left fixed top-4 left-4 z-10 max-h-[calc(100vh-2rem)] w-[min(92vw,17rem)] overflow-hidden rounded-[24px] border border-border bg-popover/80 text-popover-foreground text-sm shadow-lg backdrop-blur-sm",
            panelPhase === "open" && "is-open",
            panelPhase === "closing" && "is-closing",
          )}
        >
          <div className="panel-scrollbar flex h-full max-h-[calc(100vh-2rem)] flex-col gap-6 overflow-y-auto p-6">
            <h2 className="font-semibold text-base text-foreground">Model Controls</h2>

            <div className="flex flex-wrap items-center gap-4">
              <input
                ref={fileInputRef}
                accept=".obj,.mtl"
                className="hidden"
                multiple
                onChange={(event) => {
                  controls.loadModelFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
                type="file"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                onPointerDown={loadModelIconPress.onPointerDown}
                onPointerLeave={loadModelIconPress.onPointerLeave}
                onPointerUp={loadModelIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UploadIcon className="size-3" ref={loadModelIconPress.ref} />
                Load model…
              </Button>
              <span className="text-muted-foreground text-xs">or drop .obj/.mtl anywhere</span>
              <span className="text-muted-foreground text-xs">{state.cubeModelStatus}</span>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Model size</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.cubeSize}%</span>
                </div>
                <Slider
                  max={state.cubeSizeMax}
                  min={state.cubeSizeMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setCubeSizePercent(value as number);
                    setState((s) => ({ ...s, cubeSize: clamped }));
                  }}
                  value={state.cubeSize}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Model X position</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{Math.round(state.modelOffsetX)}</span>
                </div>
                <Slider
                  max={state.modelOffsetMax}
                  min={state.modelOffsetMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setModelOffsetXPercent(value as number);
                    setState((s) => ({ ...s, modelOffsetX: clamped }));
                  }}
                  value={state.modelOffsetX}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Model Y position</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{Math.round(state.modelOffsetY)}</span>
                </div>
                <Slider
                  disabled={state.editingDefaultView}
                  max={state.modelOffsetMax}
                  min={state.modelOffsetMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setModelOffsetYPercent(value as number);
                    setState((s) => ({ ...s, modelOffsetY: clamped }));
                  }}
                  value={state.modelOffsetY}
                />
              </Field>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="ml-auto"
                onClick={() => { controls.resetModelPosition(); setState((s) => ({ ...s, modelOffsetX: 0, modelOffsetY: 0 })); }}
                onPointerDown={resetPositionIconPress.onPointerDown}
                onPointerLeave={resetPositionIconPress.onPointerLeave}
                onPointerUp={resetPositionIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UndoDotIcon className="size-3" ref={resetPositionIconPress.ref} />
                Reset position
              </Button>
              <Button
                onClick={() => {
                  const clamped = controls.setCubeSizePercent(100);
                  setState((s) => ({ ...s, cubeSize: clamped }));
                }}
                onPointerDown={resetSizeIconPress.onPointerDown}
                onPointerLeave={resetSizeIconPress.onPointerLeave}
                onPointerUp={resetSizeIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UndoDotIcon className="size-3" ref={resetSizeIconPress.ref} />
                Reset size
              </Button>
            </div>

            {cameraTargetsPhase !== "closed" && (
              <div
                className={cn(
                  "t-reveal",
                  cameraTargetsPhase === "open" && "is-open",
                  cameraTargetsPhase === "closing" && "is-closing",
                )}
              >
              <div className="flex flex-col gap-6">
                <Separator />
                <h2 className="font-semibold text-base text-foreground">Camera Targets</h2>
                <div className="flex flex-col gap-4">
                  {/* Keep in sync with CAMERA_TARGET_SLOT_COUNT in main.js —
                      all 7 slots always render (most just "— none —" until
                      assigned) rather than growing/shrinking with however
                      many are in use, so the keyboard shortcuts (1-7) and
                      this list stay predictable. */}
                  {[0, 1, 2, 3, 4, 5, 6].map((slotIndex) => (
                    <div className="flex flex-col gap-1.5" key={slotIndex}>
                      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        Target {slotIndex + 1}
                        <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">{slotIndex + 1}</Kbd>
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-7 min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 text-xs"
                          onChange={(event) => {
                            const objectName = event.target.value || null;
                            controls.setCameraTargetSlot(slotIndex, objectName);
                            setState((s) => {
                              const cameraTargetSlots = [...s.cameraTargetSlots];
                              cameraTargetSlots[slotIndex] = objectName;
                              return { ...s, cameraTargetSlots };
                            });
                          }}
                          value={state.cameraTargetSlots?.[slotIndex] ?? ""}
                        >
                          <option value="">— none —</option>
                          {(state.customModelObjectNames ?? []).map((name: string) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <Button
                          className="shrink-0 transition-[color,background-color,border-color,box-shadow] duration-150"
                          disabled={!state.cameraTargetSlots?.[slotIndex] || state.editingDefaultView}
                          onClick={() => {
                            controls.goToCameraTarget(slotIndex);
                            setState((s) => ({ ...s, cameraTargetActiveIndex: slotIndex }));
                          }}
                          onPointerDown={() => goIconRefs.current[slotIndex]?.startAnimation()}
                          onPointerLeave={() => goIconRefs.current[slotIndex]?.stopAnimation()}
                          onPointerUp={() => goIconRefs.current[slotIndex]?.stopAnimation()}
                          size="xs"
                          variant={state.cameraTargetActiveIndex === slotIndex ? "default" : "outline"}
                        >
                          Go
                          <ArrowBigRightDashIcon
                            className="size-3"
                            ref={(el) => {
                              goIconRefs.current[slotIndex] = el;
                            }}
                          />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      Default position
                      <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">0</Kbd>
                    </span>
                    {state.editingDefaultView && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Pan and zoom the camera, then click Done to save this as the default.
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        className="min-w-0 flex-1"
                        onClick={() => controls.setEditingDefaultView(!state.editingDefaultView)}
                        onPointerDown={setDefaultViewIconPress.onPointerDown}
                        onPointerLeave={setDefaultViewIconPress.onPointerLeave}
                        onPointerUp={setDefaultViewIconPress.onPointerUp}
                        size="xs"
                        variant={state.editingDefaultView ? "default" : "outline"}
                      >
                        <MapPinIcon className="size-3" ref={setDefaultViewIconPress.ref} />
                        {state.editingDefaultView ? "Done editing" : "Edit default position"}
                      </Button>
                      <Button
                        className="shrink-0"
                        disabled={!state.hasDefaultCameraView || state.editingDefaultView}
                        onClick={() => controls.goToDefaultCameraView()}
                        onPointerDown={() => goDefaultViewIconRef.current?.startAnimation()}
                        onPointerLeave={() => goDefaultViewIconRef.current?.stopAnimation()}
                        onPointerUp={() => goDefaultViewIconRef.current?.stopAnimation()}
                        size="xs"
                        variant="outline"
                      >
                        Go
                        <ArrowBigRightDashIcon className="size-3" ref={goDefaultViewIconRef} />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    className="ml-auto"
                    disabled={state.cameraTargetActiveIndex == null || state.editingDefaultView}
                    onClick={() => {
                      controls.resetCameraTarget();
                      setState((s) => ({ ...s, cameraTargetActiveIndex: null }));
                    }}
                    onPointerDown={resetViewIconPress.onPointerDown}
                    onPointerLeave={resetViewIconPress.onPointerLeave}
                    onPointerUp={resetViewIconPress.onPointerUp}
                    size="xs"
                    variant="outline"
                  >
                    <UndoDotIcon className="size-3" ref={resetViewIconPress.ref} />
                    Reset view
                  </Button>
                </div>
                <Label className="gap-2.5 text-xs">
                  <Switch
                    checked={!!state.showCameraTargetBoxes}
                    onCheckedChange={(checked: boolean) => {
                      controls.setShowCameraTargetBoxes(checked);
                      setState((s) => ({ ...s, showCameraTargetBoxes: checked }));
                    }}
                  />
                  Show target bounding boxes
                </Label>
              </div>
              </div>
            )}

            <Separator />

            <h2 className="font-semibold text-base text-foreground">Shader Controls</h2>

            <div className="flex items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={!state.blueprintEnabled}
                  onCheckedChange={(checked: boolean) => {
                    const enabled = !checked;
                    controls.setBlueprintEnabled(enabled);
                    setState((s) => ({ ...s, blueprintEnabled: enabled }));
                  }}
                />
                Hide blueprint shader
              </Label>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <FieldLabel className="text-xs sm:text-xs">Shader theme</FieldLabel>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      controls.setShaderTheme("dark");
                      setState((s) => ({ ...s, shaderTheme: "dark" }));
                    }}
                    size="xs"
                    variant={state.shaderTheme === "dark" ? "default" : "outline"}
                  >
                    Dark
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      controls.setShaderTheme("light");
                      setState((s) => ({ ...s, shaderTheme: "light" }));
                    }}
                    size="xs"
                    variant={state.shaderTheme === "light" ? "default" : "outline"}
                  >
                    Light
                  </Button>
                </div>
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Line frequency</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.lineFrequency}</span>
                </div>
                <Slider
                  max={state.lineFrequencyMax}
                  min={state.lineFrequencyMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setLineFrequency(value as number);
                    setState((s) => ({ ...s, lineFrequency: clamped }));
                  }}
                  value={state.lineFrequency}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Dot frequency</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.dotFrequency}</span>
                </div>
                <Slider
                  max={state.dotFrequencyMax}
                  min={state.dotFrequencyMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setDotFrequency(value as number);
                    setState((s) => ({ ...s, dotFrequency: clamped }));
                  }}
                  value={state.dotFrequency}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Dot size</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.dotSize}%</span>
                </div>
                <Slider
                  max={state.dotSizeMax}
                  min={state.dotSizeMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setDotSizePercent(value as number);
                    setState((s) => ({ ...s, dotSize: clamped }));
                  }}
                  value={state.dotSize}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Plus frequency</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.plusFrequency}</span>
                </div>
                <Slider
                  max={state.plusFrequencyMax}
                  min={state.plusFrequencyMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setPlusFrequency(value as number);
                    setState((s) => ({ ...s, plusFrequency: clamped }));
                  }}
                  value={state.plusFrequency}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Plus size</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.plusSize}%</span>
                </div>
                <Slider
                  max={state.plusSizeMax}
                  min={state.plusSizeMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setPlusSizePercent(value as number);
                    setState((s) => ({ ...s, plusSize: clamped }));
                  }}
                  value={state.plusSize}
                />
              </Field>
            </div>

            <Separator />

            <h2 className="font-semibold text-base text-foreground">Light controls</h2>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Light azimuth</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.lightAzimuth}°</span>
                </div>
                <Slider
                  max={state.lightAzimuthMax}
                  min={state.lightAzimuthMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const azimuth = value as number;
                    controls.setLightAzimuth(azimuth);
                    setState((s) => ({ ...s, lightAzimuth: azimuth }));
                  }}
                  value={state.lightAzimuth}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Light elevation</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.lightElevation}°</span>
                </div>
                <Slider
                  max={state.lightElevationMax}
                  min={state.lightElevationMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const elevation = value as number;
                    controls.setLightElevation(elevation);
                    setState((s) => ({ ...s, lightElevation: elevation }));
                  }}
                  value={state.lightElevation}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Light intensity</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.lightIntensity}%</span>
                </div>
                <Slider
                  max={state.lightIntensityMax}
                  min={state.lightIntensityMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setLightIntensityPercent(value as number);
                    setState((s) => ({ ...s, lightIntensity: clamped }));
                  }}
                  value={state.lightIntensity}
                />
              </Field>
            </div>

            <Separator />

            <h2 className="font-semibold text-base text-foreground">Interaction Controls</h2>

            <div className="flex items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={!state.hoverMovementPaused}
                  onCheckedChange={(checked: boolean) => {
                    const paused = !checked;
                    controls.setHoverMovementPaused(paused);
                    setState((s) => ({ ...s, hoverMovementPaused: paused }));
                  }}
                />
                Hover
              </Label>
            </div>

            <div className="flex items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={!state.rotationDisabled}
                  onCheckedChange={(checked: boolean) => {
                    const disabled = !checked;
                    controls.setRotationDisabled(disabled);
                    setState((s) => ({ ...s, rotationDisabled: disabled }));
                  }}
                />
                Rotation
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">R</Kbd>
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="ml-auto"
                onClick={() => controls.resetRotation()}
                onPointerDown={resetRotationIconPress.onPointerDown}
                onPointerLeave={resetRotationIconPress.onPointerLeave}
                onPointerUp={resetRotationIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UndoDotIcon className="size-3" ref={resetRotationIconPress.ref} />
                Reset rotation
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">⇧R</Kbd>
              </Button>
            </div>
          </div>
        </div>
      )}

      {panelPhase !== "closed" && (
        <div
          className={cn(
            "t-panel t-panel-right fixed top-4 right-4 z-10 max-h-[calc(100vh-2rem)] w-[min(92vw,13rem)] overflow-hidden rounded-[24px] border border-border bg-popover/80 text-popover-foreground text-sm shadow-lg backdrop-blur-sm",
            panelPhase === "open" && "is-open",
            panelPhase === "closing" && "is-closing",
          )}
        >
          <div className="panel-scrollbar flex h-full max-h-[calc(100vh-2rem)] flex-col gap-6 overflow-y-auto p-6">
            <h2 className="font-semibold text-base text-foreground">Flow Controls</h2>

            <div className="flex flex-wrap items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={state.showModelFlowArrow}
                  onCheckedChange={(checked: boolean) => {
                    controls.setModelFlowArrowVisible(checked);
                    setState((s) => ({ ...s, showModelFlowArrow: checked }));
                  }}
                />
                Show arrows
              </Label>
              <Label className={cn("gap-2.5 text-xs", !state.showModelFlowArrow && "opacity-40")}>
                <Switch
                  checked={state.showModelFlowPoints}
                  disabled={!state.showModelFlowArrow}
                  onCheckedChange={(checked: boolean) => {
                    controls.setModelFlowPointsVisible(checked);
                    setState((s) => ({ ...s, showModelFlowPoints: checked }));
                  }}
                />
                Show points &amp; junctions
              </Label>
              <Label className={cn("gap-2.5 text-xs", !state.showModelFlowArrow && "opacity-40")}>
                <Switch
                  checked={!!state.modelFlowSelectMode}
                  disabled={!state.showModelFlowArrow}
                  onCheckedChange={(checked: boolean) => controls.setModelFlowSelectMode(checked)}
                />
                Select arrow
              </Label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={state.selectedFlowArrowIndex == null}
                onClick={() => controls.deleteSelectedModelFlowArrow()}
                onPointerDown={deleteArrowIconPress.onPointerDown}
                onPointerLeave={deleteArrowIconPress.onPointerLeave}
                onPointerUp={deleteArrowIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <DeleteIcon className="size-3" ref={deleteArrowIconPress.ref} />
                Delete selected
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">Del</Kbd>
              </Button>
              <Button
                disabled={state.selectedFlowArrowIndex == null}
                onClick={() => controls.reverseSelectedFlowArrow()}
                size="xs"
                variant={state.selectedFlowArrowReversed ? "default" : "outline"}
              >
                <ArrowLeftRight className="size-3" />
                Reverse flow
              </Button>
              <Button
                onClick={() => controls.undoModelFlowArrow()}
                onPointerDown={undoArrowIconPress.onPointerDown}
                onPointerLeave={undoArrowIconPress.onPointerLeave}
                onPointerUp={undoArrowIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UndoIcon className="size-3" ref={undoArrowIconPress.ref} />
                Undo last arrow
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">⌘Z</Kbd>
              </Button>
              <Button
                onClick={() => controls.clearModelFlow()}
                onPointerDown={clearArrowsIconPress.onPointerDown}
                onPointerLeave={clearArrowsIconPress.onPointerLeave}
                onPointerUp={clearArrowsIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <XIcon className="size-3" ref={clearArrowsIconPress.ref} />
                Clear arrows
              </Button>
            </div>

            {flowObjectsPhase !== "closed" && (
              <div
                className={cn(
                  "t-reveal",
                  flowObjectsPhase === "open" && "is-open",
                  flowObjectsPhase === "closing" && "is-closing",
                )}
              >
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-xs">
                  Selected arrow affects
                </span>
                {(state.selectedFlowArrowObjects ?? []).map((obj: { index: number; name: string; enabled: boolean }) => (
                  <Label className="gap-2.5 text-xs" key={obj.index}>
                    <Switch
                      checked={obj.enabled}
                      onCheckedChange={(checked: boolean) => {
                        controls.setFlowArrowObjectEnabled(obj.index, checked);
                        setState((s) => ({
                          ...s,
                          selectedFlowArrowObjects: s.selectedFlowArrowObjects.map((o: typeof obj) =>
                            o.index === obj.index ? { ...o, enabled: checked } : o,
                          ),
                        }));
                      }}
                    />
                    {obj.name}
                  </Label>
                ))}
              </div>
              </div>
            )}

            <Field>
              <Slider
                max={30}
                min={1}
                onValueChange={(value: number | readonly number[]) => {
                  const width = value as number;
                  controls.setPulseWidth(width);
                  setState((s) => ({ ...s, pulseWidth: width }));
                }}
                value={state.pulseWidth}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Pulse width</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Field>
              <Slider
                max={state.flowPulseFrequencyMax}
                min={state.flowPulseFrequencyMin}
                onValueChange={(value: number | readonly number[]) => {
                  const frequency = value as number;
                  controls.setFlowPulseFrequency(frequency);
                  setState((s) => ({ ...s, flowPulseFrequency: frequency }));
                }}
                value={state.flowPulseFrequency}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Pulse frequency</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Field>
              <Slider
                max={state.flowSpeedMax}
                min={state.flowSpeedMin}
                onValueChange={(value: number | readonly number[]) => {
                  const speed = value as number;
                  controls.setFlowSpeedPercent(speed);
                  setState((s) => ({ ...s, flowSpeed: speed }));
                }}
                value={state.flowSpeed}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Flow speed</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Field>
              <Slider
                max={state.flowCoreLengthMax}
                min={state.flowCoreLengthMin}
                onValueChange={(value: number | readonly number[]) => {
                  const length = value as number;
                  controls.setFlowCoreLengthPercent(length);
                  setState((s) => ({ ...s, flowCoreLength: length }));
                }}
                value={state.flowCoreLength}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Core length</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Label className="gap-2.5 text-xs">
              <Switch
                checked={state.flowTailVisible}
                onCheckedChange={(checked: boolean) => {
                  controls.setFlowTailVisible(checked);
                  setState((s) => ({ ...s, flowTailVisible: checked }));
                }}
              />
              Show tail
            </Label>

            <Field className={cn(!state.flowTailVisible && "opacity-40")}>
              <Slider
                disabled={!state.flowTailVisible}
                max={state.flowTailLengthMax}
                min={state.flowTailLengthMin}
                onValueChange={(value: number | readonly number[]) => {
                  const length = value as number;
                  controls.setFlowTailLengthPercent(length);
                  setState((s) => ({ ...s, flowTailLength: length }));
                }}
                value={state.flowTailLength}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Tail length</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Field className={cn(!state.flowTailVisible && "opacity-40")}>
              <Slider
                disabled={!state.flowTailVisible}
                max={state.flowTailFalloffMax}
                min={state.flowTailFalloffMin}
                onValueChange={(value: number | readonly number[]) => {
                  const falloff = value as number;
                  controls.setFlowTailFalloff(falloff);
                  setState((s) => ({ ...s, flowTailFalloff: falloff }));
                }}
                value={state.flowTailFalloff}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Tail falloff</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>
          </div>
        </div>
      )}

      {/* Figma: N-GEN / Shuffle Icon Card - Big (node 4992:24139) — a static
          info card. Unlike the panel chrome above, this is always visible
          (not tied to panelPhase — H can't hide it) and sits below the
          control panels on the z-axis (z-0, under their z-10) so a panel
          overlapping it in the corner stacks on top. Bottom-left, 24px off
          both edges per the design handoff. No project token matches these
          NGEN brand colors yet (see BLUEPRINT_THEMES/BLUEPRINT_FILL_COLOR_GREEN
          in main.js for the same palette on the 3D side), so they're literal
          hex here rather than a token.

          .t-stagger lives on this outer row (not just the text column) so
          the icon can be a .t-stagger-line too — same directional
          enter/exit as the text below, even though the icon itself doesn't
          change yet (one SVG for every step for now; per-step icons are a
          follow-up once real assets exist). The green tile itself
          (bg-[#44d62c]) isn't a stagger line, so it stays put — only the
          glyph inside it moves. */}
      <div
        className={cn(
          "t-stagger fixed bottom-6 left-6 z-0 flex w-[727px] max-w-[calc(100vw-3rem)] items-start gap-2 overflow-hidden rounded-[36px] border-[0.5px] border-[#e6eaed] bg-[#f4f6f7] p-3 shadow-lg",
          cardContentReveal.phase === "shown" && "is-shown",
          cardContentReveal.phase === "hiding" && "is-hiding",
          cardContentReveal.phase === "enterStart" && "is-entering",
        )}
        data-direction={cardContentReveal.direction}
      >
        <div className="relative flex size-[200px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-[#44d62c]">
          {/* Downloads/Electrical Services Icon.svg, inlined as-is (46x47
              viewBox, single fill path) — currentColor instead of its
              original hardcoded #041C2C fill so it stays in sync with the
              text-[#041c2c] set here, but the color is otherwise unchanged.
              Centered via the flex parent (not its own absolute+translate)
              specifically so transform stays free for .t-stagger-line's own
              translateY. */}
          <svg
            aria-hidden="true"
            className="t-stagger-line t-stagger-line--1 size-[56px] text-[#041c2c]"
            fill="none"
            viewBox="0 0 46 47"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3.55859 3.55827C3.05304 3.55827 2.62526 3.40271 2.27526 3.0916C1.96415 2.7416 1.80859 2.31382 1.80859 1.80827C1.80859 1.30271 1.96415 0.894377 2.27526 0.583266C2.62526 0.233267 3.05304 0.0582671 3.55859 0.0582671H7.05859C7.56415 0.0582671 7.97248 0.233267 8.28359 0.583266C8.63359 0.894377 8.80859 1.30271 8.80859 1.80827C8.80859 2.31382 8.63359 2.7416 8.28359 3.0916C7.97248 3.40271 7.56415 3.55827 7.05859 3.55827H3.55859ZM5.07526 36.8083L3.79193 43.2249H21.0586V36.8083H5.07526ZM7.23359 12.6583L9.68359 10.2083C10.0336 9.85827 10.4419 9.68327 10.9086 9.68327C11.3753 9.68327 11.7836 9.85827 12.1336 10.2083C12.4836 10.5583 12.6586 10.986 12.6586 11.4916C12.6586 11.9583 12.4836 12.3666 12.1336 12.7166L9.68359 15.1666C9.33359 15.5166 8.92526 15.6916 8.45859 15.6916C7.99193 15.6916 7.58359 15.5166 7.23359 15.1666C6.88359 14.8166 6.70859 14.4083 6.70859 13.9416C6.70859 13.436 6.88359 13.0083 7.23359 12.6583ZM5.77526 33.3083H21.0586V26.8916H7.05859L5.77526 33.3083ZM22.8086 10.5583C20.3586 10.5583 18.2003 9.78049 16.3336 8.22493C14.5058 6.66938 13.2808 4.72493 12.6586 2.3916C12.503 1.92493 12.5419 1.49715 12.7753 1.10826C13.0086 0.680487 13.3586 0.38882 13.8253 0.233264C14.2919 0.077709 14.7197 0.116598 15.1086 0.349933C15.5364 0.583265 15.828 0.933265 15.9836 1.39993C16.3725 3.03327 17.1892 4.39438 18.4336 5.48326C19.678 6.53327 21.1364 7.05827 22.8086 7.05827C24.4808 7.05827 25.9392 6.53327 27.1836 5.48326C28.428 4.39438 29.2447 3.03327 29.6336 1.39993C29.7892 0.933265 30.0614 0.583265 30.4503 0.349933C30.878 0.116598 31.3253 0.077709 31.7919 0.233264C32.2586 0.38882 32.6086 0.680487 32.8419 1.10826C33.0753 1.49715 33.1142 1.92493 32.9586 2.3916C32.3364 4.72493 31.0919 6.66938 29.2253 8.22493C27.3975 9.78049 25.2586 10.5583 22.8086 10.5583ZM21.0586 19.3083V15.8083C21.0586 15.3027 21.2142 14.8944 21.5253 14.5833C21.8753 14.2333 22.303 14.0583 22.8086 14.0583C23.3142 14.0583 23.7225 14.2333 24.0336 14.5833C24.3836 14.8944 24.5586 15.3027 24.5586 15.8083V19.3083C24.5586 19.8138 24.3836 20.2416 24.0336 20.5916C23.7225 20.9027 23.3142 21.0583 22.8086 21.0583C22.303 21.0583 21.8753 20.9027 21.5253 20.5916C21.2142 20.2416 21.0586 19.8138 21.0586 19.3083ZM24.5586 43.2249H41.8253L40.5419 36.8083H24.5586V43.2249ZM24.5586 33.3083H39.8419L38.5586 26.8916H24.5586V33.3083ZM35.9336 15.0499L33.4253 12.5999C33.0753 12.2499 32.9003 11.8416 32.9003 11.3749C32.9003 10.9083 33.0753 10.4999 33.4253 10.1499C33.7753 9.79993 34.1836 9.64438 34.6503 9.68327C35.1169 9.68327 35.5253 9.83882 35.8753 10.1499L38.3836 12.5999C38.7336 12.9499 38.9086 13.3583 38.9086 13.8249C38.9475 14.2916 38.7919 14.6999 38.4419 15.0499C38.0919 15.3999 37.6642 15.5749 37.1586 15.5749C36.6919 15.5749 36.2836 15.3999 35.9336 15.0499ZM42.0586 3.55827H38.5586C38.053 3.55827 37.6253 3.40271 37.2753 3.0916C36.9642 2.7416 36.8086 2.31382 36.8086 1.80827C36.8086 1.30271 36.9642 0.894377 37.2753 0.583266C37.6253 0.233267 38.053 0.0582671 38.5586 0.0582671H42.0586C42.5642 0.0582671 42.9725 0.233267 43.2836 0.583266C43.6336 0.894377 43.8086 1.30271 43.8086 1.80827C43.8086 2.31382 43.6336 2.7416 43.2836 3.0916C42.9725 3.40271 42.5642 3.55827 42.0586 3.55827ZM0.291927 42.5249L3.55859 26.1916C3.75304 25.3749 4.16137 24.7138 4.78359 24.2083C5.40582 23.6638 6.14471 23.3916 7.00026 23.3916H38.6169C39.4725 23.3916 40.2114 23.6638 40.8336 24.2083C41.4558 24.7138 41.8642 25.3749 42.0586 26.1916L45.3253 42.5249C45.5197 43.6138 45.2669 44.586 44.5669 45.4416C43.9058 46.2972 43.0114 46.7249 41.8836 46.7249H3.73359C2.60582 46.7249 1.69193 46.2972 0.991927 45.4416C0.330816 44.586 0.097483 43.6138 0.291927 42.5249Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start justify-between gap-4 self-stretch p-5">
          <p className="t-stagger-line t-stagger-line--2 font-mono font-medium text-[#7c868e] text-[12px] uppercase tracking-[-0.24px]">
            {cardContent.step}
          </p>
          <div className="flex w-full flex-col items-start gap-1.5">
            <p className="t-stagger-line t-stagger-line--3 text-[#041c2c] text-[24px] leading-[1.2] font-medium tracking-[-0.48px]">
              {cardContent.title}
            </p>
            <p className="t-stagger-line t-stagger-line--4 text-[#7c868e] text-[14px] leading-[1.5] font-medium">
              {cardContent.text}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
