import { useEffect, useRef, useState } from "react";
import { ArrowBigRightDashIcon, type ArrowBigRightDashIconHandle } from "@/components/ui/arrow-big-right-dash";
import { Button } from "@/components/ui/button";
import { DeleteIcon, type DeleteIconHandle } from "@/components/ui/delete";
import { Field, FieldLabel } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
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
  const [hidden, setHidden] = useState(() => localStorage.getItem(CONTROLS_HIDDEN_KEY) === "1");
  const [state, setState] = useState(() => controls.getInitialState());
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadModelIconPress = useIconPressHandlers<UploadIconHandle>();
  const resetPositionIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const goIconRefs = useRef<(ArrowBigRightDashIconHandle | null)[]>([]);
  const resetViewIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const resetRotationIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const resetSizeIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const deleteArrowIconPress = useIconPressHandlers<DeleteIconHandle>();
  const undoArrowIconPress = useIconPressHandlers<UndoIconHandle>();
  const clearArrowsIconPress = useIconPressHandlers<XIconHandle>();
  const spaceIndicator = useTextSwap(!!state.spaceHeld, TEXT_SWAP_MS);

  useEffect(() => controls.subscribe((patch: object) => setState((s) => ({ ...s, ...patch }))), []);

  useEffect(() => {
    localStorage.setItem(CONTROLS_HIDDEN_KEY, hidden ? "1" : "0");
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
  const flowObjectsPhase = useRevealPhase((state.selectedFlowArrowObjects?.length ?? 0) > 0, MODAL_CLOSE_MS);

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
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-10 -translate-x-1/2">
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
              {spaceIndicator.displayed ? "Release to return to default view" : "Press space for bird's-eye view"}
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
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={!state.useCustomModel}
                  disabled={!state.customModelReady}
                  onCheckedChange={(checked: boolean) => {
                    const useCustomModel = !checked;
                    controls.setUseCustomModel(useCustomModel);
                    setState((s) => ({ ...s, useCustomModel }));
                  }}
                />
                Show default cube
              </Label>
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
                  {[0, 1, 2].map((slotIndex) => (
                    <div className="flex flex-col gap-1.5" key={slotIndex}>
                      <span className="text-muted-foreground text-xs">Target {slotIndex + 1}</span>
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
                          disabled={!state.cameraTargetSlots?.[slotIndex]}
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
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    className="ml-auto"
                    disabled={state.cameraTargetActiveIndex == null}
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
              </Label>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  onClick={() => controls.resetRotation()}
                  onPointerDown={resetRotationIconPress.onPointerDown}
                  onPointerLeave={resetRotationIconPress.onPointerLeave}
                  onPointerUp={resetRotationIconPress.onPointerUp}
                  size="xs"
                  variant="outline"
                >
                  <UndoDotIcon className="size-3" ref={resetRotationIconPress.ref} />
                  Reset rotation
                </Button>
              </div>
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
              <Button
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
                size="xs"
                variant={state.modelFlowDrawMode ? "default" : "outline"}
              >
                Flow Draw Mode
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">A</Kbd>
              </Button>
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={!!state.modelFlowSelectMode}
                  onCheckedChange={(checked: boolean) => controls.setModelFlowSelectMode(checked)}
                />
                Select arrow
              </Label>
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
          </div>
        </div>
      )}
    </>
  );
}
