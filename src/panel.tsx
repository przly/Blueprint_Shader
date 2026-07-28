import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider, SliderValue } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { controls } from "../main.js";

const CONTROLS_HIDDEN_KEY = "iconMosaic.controlsHidden";

type OverlayPhase = "closed" | "entering" | "open" | "closing";
const OVERLAY_CLOSE_MS = 150; // keep in sync with --modal-close-dur in index.css

export function Panel() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(CONTROLS_HIDDEN_KEY) === "1");
  const [state, setState] = useState(() => controls.getInitialState());
  const [modelFlowDraw, setModelFlowDraw] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("closed");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Drives the t-modal/t-overlay-backdrop lifecycle (transitions.dev, 06-modal.md):
  // mount in a pre-open state, flip to "open" on the next frame so the enter
  // transition actually plays, and on close hold in "closing" for the CSS
  // transition's duration before unmounting.
  useEffect(() => {
    if (isDraggingFile) {
      setOverlayPhase((p) => (p === "closed" ? "entering" : p === "closing" ? "open" : p));
    } else {
      setOverlayPhase((p) => (p === "closed" ? "closed" : "closing"));
    }
  }, [isDraggingFile]);

  useEffect(() => {
    if (overlayPhase !== "entering") return;
    const id = requestAnimationFrame(() => setOverlayPhase("open"));
    return () => cancelAnimationFrame(id);
  }, [overlayPhase]);

  useEffect(() => {
    if (overlayPhase !== "closing") return;
    const id = window.setTimeout(() => setOverlayPhase("closed"), OVERLAY_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [overlayPhase]);

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

      <Button
        aria-label="Toggle controls"
        aria-pressed={hidden}
        className="fixed top-4 left-4 z-10 bg-popover/80 backdrop-blur-sm"
        onClick={() => setHidden((h) => !h)}
        size="icon-sm"
        title="Toggle controls (H)"
        variant="outline"
      >
        <Menu />
      </Button>

      {!hidden && (
        <div className="fixed top-14 left-4 z-10 max-h-[calc(100vh-4.5rem)] w-[min(92vw,28rem)] overflow-hidden rounded-[24px] border border-border bg-popover/80 text-popover-foreground text-sm shadow-lg backdrop-blur-sm">
          <div className="panel-scrollbar flex h-full max-h-[calc(100vh-4.5rem)] flex-col gap-6 overflow-y-auto p-6">
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
              <Button onClick={() => fileInputRef.current?.click()} size="xs" variant="outline">
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
              <Field className="flex-1">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs">Hatch frequency</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.hatchFrequency}</span>
                </div>
                <Slider
                  max={state.hatchFrequencyMax}
                  min={state.hatchFrequencyMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setHatchFrequency(value as number);
                    setState((s) => ({ ...s, hatchFrequency: clamped }));
                  }}
                  value={state.hatchFrequency}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs">Model size</FieldLabel>
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
              <Field className="flex-1">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs">Model X position</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.modelOffsetX}</span>
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
              <Field className="flex-1">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs">Model Y position</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.modelOffsetY}</span>
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

            <div className="flex items-center gap-4">
              <Button
                className="ml-auto"
                onClick={() => { controls.resetModelPosition(); setState((s) => ({ ...s, modelOffsetX: 0, modelOffsetY: 0 })); }}
                size="xs"
                variant="outline"
              >
                Reset position
              </Button>
            </div>

            <Separator />

            <h2 className="font-semibold text-base text-foreground">Light controls</h2>

            <div className="flex items-center gap-4">
              <Field className="flex-1">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs">Light azimuth</FieldLabel>
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
              <Field className="flex-1">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs">Light elevation</FieldLabel>
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
                <Button onClick={() => controls.resetRotation()} size="xs" variant="outline">
                  Reset rotation
                </Button>
                <Button
                  onClick={() => {
                    const clamped = controls.setCubeSizePercent(100);
                    setState((s) => ({ ...s, cubeSize: clamped }));
                  }}
                  size="xs"
                  variant="outline"
                >
                  Reset size
                </Button>
              </div>
            </div>

            <Separator />

            <h2 className="font-semibold text-base text-foreground">Flow Controls</h2>

            <div className="flex items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={modelFlowDraw}
                  onCheckedChange={(checked: boolean) => {
                    controls.setModelFlowDraw(checked);
                    setModelFlowDraw(checked);
                  }}
                />
                Draw flow arrow
              </Label>
              <Button onClick={() => controls.clearModelFlow()} size="xs" variant="outline">
                Clear arrow
              </Button>
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
                <div className="mb-2 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs">Pulse width</FieldLabel>
                  <SliderValue className="text-muted-foreground text-xs" />
                </div>
              </Slider>
            </Field>
          </div>
        </div>
      )}
    </>
  );
}
