// --- Config ---------------------------------------------------------------

// Capped at 2x: beyond that, extra device pixels cost real GPU/CPU time
// (the WebGL canvas's backing store scales with this) for a sharpness
// difference nobody presenting on a laptop/projector/TV can actually
// perceive — only very high-DPR phones/tablets (3x) hit the cap.
const DPR = Math.min(window.devicePixelRatio || 1, 2);

// --- DOM --------------------------------------------------------------

const canvas = document.getElementById('canvas');

// The control panel (src/panel.tsx) is a React/coss-ui component tree that
// owns the panel's own UI state (including show/hide + the H-key shortcut).
// This module stays plain WebGL/canvas code; `controls` (bottom of file) is
// the one bridge the panel calls into and subscribes to.
const SLIDER_STORAGE_PREFIX = 'iconMosaic.slider.';

function restoreNumber(id, fallback) {
  const stored = localStorage.getItem(SLIDER_STORAGE_PREFIX + id);
  return stored !== null ? Number(stored) : fallback;
}

function persistNumber(id, value) {
  localStorage.setItem(SLIDER_STORAGE_PREFIX + id, String(value));
}

// One-time migration: the cubeSize slider's default changed from 1000% to
// 100% — drop any previously persisted 1000% value once so existing
// browsers pick up the new default instead of restoring the old one.
// Anything the user sets afterward still persists normally.
const CUBE_SIZE_RESET_MIGRATION_KEY = 'iconMosaic.cubeSizeDefaultResetV1';
if (!localStorage.getItem(CUBE_SIZE_RESET_MIGRATION_KEY)) {
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'cubeSize');
  localStorage.setItem(CUBE_SIZE_RESET_MIGRATION_KEY, '1');
}

// One-time migration: the dot fill's defaults changed (frequency 1 -> 9 ->
// 4, size 16% -> 5%) — same reasoning as the cubeSize migration above. V2
// (rather than reusing V1) so browsers that already ran V1 still pick up
// the frequency 9 -> 4 change.
const DOT_DEFAULTS_RESET_MIGRATION_KEY = 'iconMosaic.dotDefaultsResetV2';
if (!localStorage.getItem(DOT_DEFAULTS_RESET_MIGRATION_KEY)) {
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'dotFrequency');
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'dotSize');
  localStorage.setItem(DOT_DEFAULTS_RESET_MIGRATION_KEY, '1');
}

// One-time migration: the plus fill's defaults changed (frequency 11 -> 2,
// size 20% -> 5%) — same reasoning as the cubeSize/dot migrations above. A
// new V2 key (rather than reusing V1, which only ever cleared frequency)
// so browsers that already ran V1 still pick up the size default too.
const PLUS_DEFAULTS_RESET_MIGRATION_KEY = 'iconMosaic.plusDefaultsResetV2';
if (!localStorage.getItem(PLUS_DEFAULTS_RESET_MIGRATION_KEY)) {
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'plusFrequency');
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'plusSize');
  localStorage.setItem(PLUS_DEFAULTS_RESET_MIGRATION_KEY, '1');
}

// One-time cleanup: the model's X/Y/Z position used to persist across
// reloads (see modelOffsetXPercent etc.), but that meant a page reload could
// reopen wherever a previous session's camera move/pan happened to leave
// it — position is now always session-only, starting at 0 every load (see
// modelOffsetXPercent's declaration), so any browser with an old persisted
// value just has dead, never-read localStorage entries; drop them once.
const MODEL_OFFSET_RESET_MIGRATION_KEY = 'iconMosaic.modelOffsetDefaultResetV1';
if (!localStorage.getItem(MODEL_OFFSET_RESET_MIGRATION_KEY)) {
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'modelOffsetX');
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'modelOffsetY');
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'modelOffsetZ');
  localStorage.setItem(MODEL_OFFSET_RESET_MIGRATION_KEY, '1');
}

// Width of the model flow's traveling glow pulse (blueprint mode), as a
// fraction of the path's total length — see MODEL_FLOW_PULSE_BAND_FRACTION
// in renderCubeFrame, which multiplies this in.
let pulseWidthValue = restoreNumber('pulseWidth', 1);
let pulseBandFraction = pulseWidthValue / 100;

function setPulseWidth(value) {
  pulseWidthValue = value;
  pulseBandFraction = value / 100;
  persistNumber('pulseWidth', value);
}

// Speed of the flow pulses along a path, as a percentage of
// FLOW_PULSE_PERIOD_BASE_MS's baseline speed — 100% takes
// FLOW_PULSE_PERIOD_BASE_MS to travel the whole path, 200% takes half that
// (twice as fast), 50% takes twice as long (half as fast).
const FLOW_SPEED_MIN = 10;
const FLOW_SPEED_MAX = 200;
let flowSpeedPercent = restoreNumber('flowSpeed', 50);

function setFlowSpeedPercent(value) {
  const clamped = Math.max(FLOW_SPEED_MIN, Math.min(FLOW_SPEED_MAX, value));
  flowSpeedPercent = clamped;
  persistNumber('flowSpeed', clamped);
  return clamped;
}

// Comet pulse shape (see flowPulseIntensity in CUBE_FRAGMENT_SHADER) — core
// and tail length are both percentages of uFlowSigma (the "Pulse width"
// slider's own base scale, same unit its old fixed multiplier constants
// used to be in), so they still shrink/grow together with pulse width. Tail
// falloff is a direct exponent instead — 2 matches a plain Gaussian, higher
// stays near full brightness longer then drops more sharply near the tail's
// end, lower behaves more like a thin exponential streak.
const FLOW_CORE_LENGTH_MIN = 1;
const FLOW_CORE_LENGTH_MAX = 50;
let flowCoreLengthPercent = restoreNumber('flowCoreLength', 1);

function setFlowCoreLengthPercent(value) {
  const clamped = Math.max(FLOW_CORE_LENGTH_MIN, Math.min(FLOW_CORE_LENGTH_MAX, value));
  flowCoreLengthPercent = clamped;
  persistNumber('flowCoreLength', clamped);
  return clamped;
}

const FLOW_TAIL_LENGTH_MIN = 50;
const FLOW_TAIL_LENGTH_MAX = 500;
let flowTailLengthPercent = restoreNumber('flowTailLength', 160);

function setFlowTailLengthPercent(value) {
  const clamped = Math.max(FLOW_TAIL_LENGTH_MIN, Math.min(FLOW_TAIL_LENGTH_MAX, value));
  flowTailLengthPercent = clamped;
  persistNumber('flowTailLength', clamped);
  return clamped;
}

const FLOW_TAIL_FALLOFF_MIN = 1;
const FLOW_TAIL_FALLOFF_MAX = 8;
let flowTailFalloffValue = restoreNumber('flowTailFalloff', 1);

function setFlowTailFalloff(value) {
  const clamped = Math.max(FLOW_TAIL_FALLOFF_MIN, Math.min(FLOW_TAIL_FALLOFF_MAX, value));
  flowTailFalloffValue = clamped;
  persistNumber('flowTailFalloff', clamped);
  return clamped;
}

// How many comet pulses chase each other along the same path at once (see
// MAX_FLOW_PULSES/uFlowPulseCenters in CUBE_FRAGMENT_SHADER and the center
// computation in renderCubeFrame) — evenly spaced around the shared travel
// loop, so raising this reads as current flowing continuously rather than
// one lone pulse looping. Capped at MAX_FLOW_PULSES, the fixed-size uniform
// array the shader loops over.
const FLOW_PULSE_FREQUENCY_MIN = 1;
const FLOW_PULSE_FREQUENCY_MAX = 8;
let flowPulseFrequencyValue = restoreNumber('flowPulseFrequency', 4);

function setFlowPulseFrequency(value) {
  const clamped = Math.max(FLOW_PULSE_FREQUENCY_MIN, Math.min(FLOW_PULSE_FREQUENCY_MAX, Math.round(value)));
  flowPulseFrequencyValue = clamped;
  persistNumber('flowPulseFrequency', clamped);
  return clamped;
}

// Reused every frame in renderCubeFrame rather than reallocated, sized to
// match MAX_FLOW_PULSES in CUBE_FRAGMENT_SHADER (kept equal to
// FLOW_PULSE_FREQUENCY_MAX, the slider's own cap).
const flowPulseCentersScratch = new Float32Array(FLOW_PULSE_FREQUENCY_MAX);

// Glow/bloom controls (see the glow-only render pass + two-pass blur in
// renderCubeFrame). Intensity boosts the glow source's brightness before
// blurring — blurring a small bright dot spreads its energy over a much
// larger area, dimming its peak proportionally, so this compensates to keep
// the bloom actually visible rather than washed out — without touching the
// pulse's own on-model color. Size scales the blur's sample spread (see
// uBloomSpread in BLUR_FRAGMENT_SHADER) — bigger spread reads as a wider,
// softer glow.
const GLOW_INTENSITY_MIN = 100;
const GLOW_INTENSITY_MAX = 1000;
let glowIntensityPercent = restoreNumber('glowIntensity', 400);

function setGlowIntensityPercent(value) {
  const clamped = Math.max(GLOW_INTENSITY_MIN, Math.min(GLOW_INTENSITY_MAX, value));
  glowIntensityPercent = clamped;
  persistNumber('glowIntensity', clamped);
  return clamped;
}

const GLOW_SIZE_MIN = 25;
const GLOW_SIZE_MAX = 400;
let glowSizePercent = restoreNumber('glowSize', 100);

function setGlowSizePercent(value) {
  const clamped = Math.max(GLOW_SIZE_MIN, Math.min(GLOW_SIZE_MAX, value));
  glowSizePercent = clamped;
  persistNumber('glowSize', clamped);
  return clamped;
}

// The loaded model's size, as a percentage multiplier on top of CUBE_SCALE
// (see renderCubeFrame) — 100 (the default) = CUBE_SCALE unchanged, up to
// 1000 = 10x that.
const CUBE_SIZE_MIN = 10;
const CUBE_SIZE_MAX = 1000;
let cubeSizePercent = restoreNumber('cubeSize', 100);
let cubeSizeScale = cubeSizePercent / 100;

// Shared by setCubeSizePercent (the "Model size" slider) and the scroll-to-
// zoom handler below — clamps and applies the scale, without either one's
// own persist/notify timing (the slider wants both immediately; the wheel
// handler batches them — see scheduleWheelZoomSync).
function applyCubeSizePercent(percent) {
  const clamped = Math.max(CUBE_SIZE_MIN, Math.min(CUBE_SIZE_MAX, percent));
  const previousScale = cubeSizeScale;
  cubeSizePercent = clamped;
  cubeSizeScale = clamped / 100;

  // Zoom into the pivot crosshair (screen-center — see getObjectSpacePan)
  // rather than the model's own origin: rescale the manual pan by the same
  // ratio the model just resized by, so whatever object-space point
  // currently sits under the crosshair keeps sitting there instead of
  // drifting as the model grows/shrinks around its own center.
  if (previousScale > 0 && cubeSizeScale !== previousScale) {
    const ratio = cubeSizeScale / previousScale;
    modelOffsetXPercent = clampModelPosition(modelOffsetXPercent * ratio);
    modelOffsetYPercent = clampModelPosition(modelOffsetYPercent * ratio);
    modelOffsetZPercent = clampModelPosition(modelOffsetZPercent * ratio);
  }

  return clamped;
}

function setCubeSizePercent(percent) {
  const clamped = applyCubeSizePercent(percent);
  persistNumber('cubeSize', clamped);
  notifyModelState();
  return clamped;
}

// Blueprint mode's technical-fill patterns (see aFillPattern /
// materialFillPatternId — hatch lines, dots, or plus marks): each pattern
// gets its own frequency (pattern periods per object-space unit, i.e. how
// tightly packed the lines/dots/pluses are on a fill-flagged face) so they
// can be tuned independently rather than sharing one control. Needs to be
// user-adjustable since a custom model's object-space scale (and therefore
// how dense a given frequency reads) varies per model — see parseObj's
// per-model extent normalization.
const LINE_FREQUENCY_MIN = 1;
const LINE_FREQUENCY_MAX = 60;
let lineFrequencyValue = restoreNumber('lineFrequency', 11);

function setLineFrequency(value) {
  const clamped = Math.max(LINE_FREQUENCY_MIN, Math.min(LINE_FREQUENCY_MAX, value));
  lineFrequencyValue = clamped;
  persistNumber('lineFrequency', clamped);
  return clamped;
}

const DOT_FREQUENCY_MIN = 1;
const DOT_FREQUENCY_MAX = 60;
let dotFrequencyValue = restoreNumber('dotFrequency', 4);

function setDotFrequency(value) {
  const clamped = Math.max(DOT_FREQUENCY_MIN, Math.min(DOT_FREQUENCY_MAX, value));
  dotFrequencyValue = clamped;
  persistNumber('dotFrequency', clamped);
  return clamped;
}

// Dot radius, as a percentage of the cell period (see dotsMask) — e.g. 16
// means each dot's radius is 16% of the spacing between dot centers.
const DOT_SIZE_MIN = 5;
const DOT_SIZE_MAX = 45;
let dotSizePercent = restoreNumber('dotSize', 5);

function setDotSizePercent(value) {
  const clamped = Math.max(DOT_SIZE_MIN, Math.min(DOT_SIZE_MAX, value));
  dotSizePercent = clamped;
  persistNumber('dotSize', clamped);
  return clamped;
}

const PLUS_FREQUENCY_MIN = 1;
const PLUS_FREQUENCY_MAX = 60;
let plusFrequencyValue = restoreNumber('plusFrequency', 2);

function setPlusFrequency(value) {
  const clamped = Math.max(PLUS_FREQUENCY_MIN, Math.min(PLUS_FREQUENCY_MAX, value));
  plusFrequencyValue = clamped;
  persistNumber('plusFrequency', clamped);
  return clamped;
}

// Plus arm half-length, as a percentage of the cell period (see plusMask) —
// arm thickness scales proportionally (see PLUS_THICKNESS_RATIO in
// renderCubeFrame) so a single slider keeps the mark reading as a "+"
// rather than needing a separate thickness control.
const PLUS_SIZE_MIN = 5;
const PLUS_SIZE_MAX = 45;
let plusSizePercent = restoreNumber('plusSize', 5);

function setPlusSizePercent(value) {
  const clamped = Math.max(PLUS_SIZE_MIN, Math.min(PLUS_SIZE_MAX, value));
  plusSizePercent = clamped;
  persistNumber('plusSize', clamped);
  return clamped;
}

// Fixed ratio (rather than a third slider) so the mark keeps reading as a
// "+" as its size changes — matches the original hardcoded 0.05/0.2
// thickness/arm-length ratio from before these were user-adjustable.
const PLUS_THICKNESS_RATIO = 0.12;

// Directional light angle, as azimuth (rotation around the vertical Y axis)
// and elevation (above/below the horizontal plane), both in degrees — see
// renderCubeFrame, which converts these to the uLightDir vector each frame.
const LIGHT_AZIMUTH_MIN = 0;
const LIGHT_AZIMUTH_MAX = 360;
const LIGHT_ELEVATION_MIN = -90;
const LIGHT_ELEVATION_MAX = 90;
let lightAzimuthValue = restoreNumber('lightAzimuth', 160);
let lightElevationValue = restoreNumber('lightElevation', 50);

function setLightAzimuth(value) {
  lightAzimuthValue = value;
  persistNumber('lightAzimuth', value);
}

function setLightElevation(value) {
  lightElevationValue = value;
  persistNumber('lightElevation', value);
}

// Scales the directional light's diffuse contribution (see uLightIntensity
// in CUBE_FRAGMENT_SHADER), as a percent — 100 matches the original
// fixed-brightness look, higher pushes lit faces brighter/unlit faces
// darker, lower flattens the shading toward a uniform flat fill.
const LIGHT_INTENSITY_MIN = 0;
const LIGHT_INTENSITY_MAX = 200;
let lightIntensityPercent = restoreNumber('lightIntensity', 100);

function setLightIntensityPercent(value) {
  const clamped = Math.max(LIGHT_INTENSITY_MIN, Math.min(LIGHT_INTENSITY_MAX, value));
  lightIntensityPercent = clamped;
  persistNumber('lightIntensity', clamped);
  return clamped;
}

// Cube mode's "Blueprint mode" checkbox: dims the model to a flat navy fill
// and overlays a crease/boundary-edge wireframe in bright cyan, on a navy
// background — see renderCubeFrame and buildCreaseEdgeLines.
const BLUEPRINT_STORAGE_KEY = 'iconMosaic.blueprint';
const storedBlueprint = localStorage.getItem(BLUEPRINT_STORAGE_KEY);
let blueprintEnabled = storedBlueprint !== null ? storedBlueprint === 'true' : true;

function setBlueprintEnabled(value) {
  blueprintEnabled = value;
  localStorage.setItem(BLUEPRINT_STORAGE_KEY, String(blueprintEnabled));
}

// Blueprint shader theme: which background/fill palette renderCubeFrame uses
// (see BLUEPRINT_THEMES below). Green-material parts and the wireframe line
// color stay the same across themes — only the "paper" the drawing sits on
// changes.
const SHADER_THEME_STORAGE_KEY = 'iconMosaic.shaderTheme';
const storedShaderTheme = localStorage.getItem(SHADER_THEME_STORAGE_KEY);
let shaderTheme = storedShaderTheme === 'light' ? 'light' : 'dark';

function setShaderTheme(value) {
  shaderTheme = value === 'light' ? 'light' : 'dark';
  localStorage.setItem(SHADER_THEME_STORAGE_KEY, shaderTheme);
  refreshBlueprintLineColors();
}

// --- Source: the loaded .obj model, rendered with plain WebGL -------------

// Renders directly into the visible <canvas> (WebGL's own backing store,
// set from `renderScale` — see applyCanvasSize/resize far below — takes the
// place of a fixed on-screen resolution). An earlier version of this file
// rendered into a separate square offscreen canvas and 2D-blitted
// (cover-fit crop) it onto this one every frame; that extra full-frame
// resample was the actual per-frame cost, independent of both scene
// complexity and the WebGL resolution — measuring it (see the FPS/ms
// monitor below) is what surfaced it. Rendering straight into `canvas`
// removes that pass entirely: the browser's own (effectively free,
// hardware-composited) canvas-to-CSS-box scaling does what the manual
// blit used to. The tradeoff is that "cover fit" now has to happen in the
// projection matrix (see updateCubeProjection) instead of a pixel crop,
// since there's no longer a separate square source to crop from.
const gl = canvas.getContext('webgl', { antialias: true });
// Needed for fwidth() in CUBE_FRAGMENT_SHADER's hatch-line anti-aliasing —
// must be enabled before that shader compiles (see below). Universally
// supported (core in WebGL2, a ubiquitous extension in WebGL1) so no
// fallback path if it's somehow missing; the shader would just fail to
// compile, same as any other compile error here.
gl.getExtension('OES_standard_derivatives');

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

const CUBE_VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aColor;
  attribute float aIsGreen;
  attribute float aFlowCoord;
  // The world-space arc length of whichever flow path this vertex was
  // assigned to (aFlowCoord's normalizing masterTotalLen, carried through
  // unnormalized) — lets the fragment shader convert the tail's reach back
  // out of aFlowCoord's per-path-normalized space into an absolute distance,
  // so the tail's real length stays the same regardless of how long the
  // specific arrow is. See recomputeModelFlowCoords/MODEL_FLOW_TAIL_REFERENCE_LENGTH.
  attribute float aFlowPathLen;
  // Which technical-fill pattern (if any) this vertex's face uses: 0 = none,
  // 1 = hatch lines, 2 = dots, 3 = plus marks — see materialFillPatternId,
  // which maps a Blender material name to one of these. A single float
  // (rather than a separate boolean per pattern) keeps this to one
  // attribute/buffer regardless of how many fill patterns exist.
  attribute float aFillPattern;
  uniform mat4 uModelView;
  uniform mat4 uProjection;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vIsGreen;
  varying float vFlowCoord;
  varying float vFlowPathLen;
  varying vec3 vPosition;
  varying float vFillPattern;
  void main() {
    gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
    // Object-space normal (no model rotation applied) so the light stays
    // fixed relative to the model instead of the camera as it's dragged.
    vNormal = aNormal;
    vColor = aColor;
    vIsGreen = aIsGreen;
    vFlowCoord = aFlowCoord;
    vFlowPathLen = aFlowPathLen;
    // Object-space position, same reasoning as vNormal above: the fill
    // pattern it drives (see CUBE_FRAGMENT_SHADER) needs to stay fixed to
    // the model rather than swim as the camera orbits.
    vPosition = aPosition;
    vFillPattern = aFillPattern;
  }
`;

const CUBE_FRAGMENT_SHADER = `
  #extension GL_OES_standard_derivatives : enable
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vIsGreen;
  varying float vFlowCoord;
  varying float vFlowPathLen;
  varying vec3 vPosition;
  varying float vFillPattern;
  uniform vec3 uLightDir;
  uniform float uLightIntensity;
  uniform bool uBlueprint;
  uniform vec3 uBlueprintFillColor;
  uniform vec3 uBlueprintFillColorGreen;
  uniform bool uFlowActive;
  // Fixed-size array rather than a single center so several comet pulses can
  // chase each other along the same path (the "Pulse frequency" slider —
  // see setFlowPulseFrequency) — GLSL ES 1.00 loops need a constant upper
  // bound, so uFlowPulseCount (how many of the MAX_FLOW_PULSES slots are
  // actually in use) is checked with a dynamic break instead.
  const int MAX_FLOW_PULSES = 8;
  uniform float uFlowPulseCenters[MAX_FLOW_PULSES];
  uniform int uFlowPulseCount;
  uniform float uFlowSigma;
  uniform vec3 uFlowColor;
  uniform float uFlowCoreSigmaMult;
  // Absolute world-space tail reach (not a fraction of any one path's own
  // length — see MODEL_FLOW_TAIL_REFERENCE_LENGTH) so the tail's visible
  // length is the same on every arrow regardless of how long it is.
  uniform float uFlowTailWorldSigma;
  uniform float uFlowTailFalloffExponent;
  uniform vec3 uHatchLineColor;
  uniform float uLineFrequency;
  uniform float uDotFrequency;
  uniform float uDotRadius;
  uniform float uPlusFrequency;
  uniform float uPlusArmHalf;
  uniform float uPlusThickness;
  // When true, skip all normal shading and output just the flow pulse's own
  // color/intensity (black everywhere else) — used for a separate low-res
  // render pass (see renderCubeFrame/BLOOM_DOWNSCALE) that gets blurred and
  // added back additively over the real frame, for actual light-bleed bloom
  // instead of the pulse just being a bright patch on the model's own faces.
  uniform bool uGlowOnly;

  // Shared by all three fill patterns below (lines/dots/plus): projects
  // object-space position onto the two axes spanning the face (dropping
  // whichever axis the normal points along), sampled in object space so the
  // pattern stays put on the face as the model rotates instead of swimming
  // (screen-space would be simpler but reads as "wrong" the moment the
  // camera moves) — and so spacing is consistent regardless of which cube
  // face, or which arbitrary custom-model face, is flagged.
  vec2 fillPatternUV(vec3 pos, vec3 normal) {
    vec3 an = abs(normal);
    if (an.x >= an.y && an.x >= an.z) return pos.yz;
    if (an.y >= an.x && an.y >= an.z) return pos.xz;
    return pos.xy;
  }

  // Edge thickness/softness shared by all three patterns, and the shared
  // anti-moire fallback: derived from the screen-space gradient of each
  // pattern's own "distance to feature" value rather than a fixed fraction
  // of the period, so every pattern renders at a constant ~1 device pixel
  // — matching the wireframe overlay (gl.LINES at the default 1px width) —
  // regardless of how the face is scaled/tilted/zoomed. Below
  // MIN_RESOLVED_PERIOD_PX screen pixels per period, the pattern has more
  // than one repeat per pixel — under-sampled, so a crisp per-fragment test
  // aliases into shimmering moire as the surface (or the camera orbiting
  // it) tilts the face toward grazing incidence, where foreshortening keeps
  // shrinking the on-screen period. Standard fix (used for procedural
  // grids/checkers under minification): once the period drops close to or
  // below this, fade to the pattern's flat average coverage instead of
  // trying to resolve individual features the pixel grid can't represent.
  const float FILL_EDGE_HALF_WIDTH_PX = 1.0;
  const float FILL_MIN_RESOLVED_PERIOD_PX = 3.0;
  const float FILL_ALIASED_PERIOD_PX = 1.0;

  // Diagonal hatch lines. Uses the exact gradient length (dFdx/dFdy
  // combined via Pythagoras) rather than fwidth's cheaper
  // abs(dFdx)+abs(dFdy) approximation — fwidth overestimates the gradient
  // except when the line runs exactly along the x or y screen axis, so it
  // was making the line's rendered width (and thus its antialiasing)
  // inconsistent — thinner/rougher-looking — at the diagonal angles most
  // hatch lines actually run at.
  float hatchLinesMask(vec3 pos, vec3 normal) {
    vec2 uv = fillPatternUV(pos, normal);
    float diag = (uv.x + uv.y) * uLineFrequency;
    float gradLen = length(vec2(dFdx(diag), dFdy(diag)));
    float phase = fract(diag);
    float distToLine = min(phase, 1.0 - phase) / max(gradLen, 1e-6);
    float crispLine = 1.0 - smoothstep(0.0, FILL_EDGE_HALF_WIDTH_PX, distToLine);
    float periodPx = 1.0 / max(gradLen, 1e-6);
    float coverage = clamp((2.0 * FILL_EDGE_HALF_WIDTH_PX) / max(periodPx, 1e-3), 0.0, 1.0);
    float resolved = smoothstep(FILL_ALIASED_PERIOD_PX, FILL_MIN_RESOLVED_PERIOD_PX, periodPx);
    return mix(coverage, crispLine, resolved);
  }

  // Small filled circles on a regular grid, one per uDotFrequency cell.
  // uDotRadius is a fraction of the cell period (so dot size scales with
  // spacing, like a real screen-printed dot pattern) rather than a fixed
  // size — user-adjustable via the "Dot size" slider.
  float dotsMask(vec3 pos, vec3 normal) {
    vec2 uv = fillPatternUV(pos, normal) * uDotFrequency;
    vec2 cell = fract(uv) - 0.5;
    float dist = length(cell);
    float gradLen = length(vec2(dFdx(dist), dFdy(dist)));
    float distPx = (dist - uDotRadius) / max(gradLen, 1e-6);
    float crispDot = 1.0 - smoothstep(-FILL_EDGE_HALF_WIDTH_PX, FILL_EDGE_HALF_WIDTH_PX, distPx);
    float periodPx = 1.0 / max(gradLen, 1e-6);
    float flatCoverage = clamp(3.14159265 * uDotRadius * uDotRadius, 0.0, 1.0);
    float resolved = smoothstep(FILL_ALIASED_PERIOD_PX, FILL_MIN_RESOLVED_PERIOD_PX, periodPx);
    return mix(flatCoverage, crispDot, resolved);
  }

  // Small "+" marks on a regular grid, one per uPlusFrequency cell — a
  // union of a horizontal and a vertical bar (a cheap box-distance cross,
  // not an exact Euclidean SDF, but sufficient at the thin scale these
  // render at). uPlusArmHalf/uPlusThickness are fractions of the cell
  // period, same reasoning as uDotRadius above — user-adjustable via the
  // "Plus size" slider (thickness follows arm length at a fixed ratio, see
  // PLUS_THICKNESS_RATIO in renderCubeFrame, so it keeps reading as a "+").
  float plusMask(vec3 pos, vec3 normal) {
    vec2 uv = fillPatternUV(pos, normal) * uPlusFrequency;
    vec2 cell = fract(uv) - 0.5;
    float distH = max(abs(cell.y) - uPlusThickness, abs(cell.x) - uPlusArmHalf);
    float distV = max(abs(cell.x) - uPlusThickness, abs(cell.y) - uPlusArmHalf);
    float dist = min(distH, distV);
    float gradLen = length(vec2(dFdx(dist), dFdy(dist)));
    float distPx = dist / max(gradLen, 1e-6);
    float crispPlus = 1.0 - smoothstep(-FILL_EDGE_HALF_WIDTH_PX, FILL_EDGE_HALF_WIDTH_PX, distPx);
    float periodPx = 1.0 / max(gradLen, 1e-6);
    float flatCoverage = clamp(8.0 * uPlusArmHalf * uPlusThickness - 4.0 * uPlusThickness * uPlusThickness, 0.0, 1.0);
    float resolved = smoothstep(FILL_ALIASED_PERIOD_PX, FILL_MIN_RESOLVED_PERIOD_PX, periodPx);
    return mix(flatCoverage, crispPlus, resolved);
  }
  // Traveling energy-pulse intensity along a user-drawn arrow, restricted to
  // green (flagged) parts that some arrow actually touches — driven by a 3D
  // arc-length coordinate (aFlowCoord). Vertices on a green part no arrow was
  // ever drawn on get a negative aFlowCoord (see recomputeModelFlowCoords) so
  // they never light up, rather than defaulting to 0 and falsely flashing
  // whenever the pulse happens to pass near the start of some other part's
  // arrow. Shared by the normal shaded pass and the glow-only bloom-source
  // pass below.
  //
  // Comet shape rather than a symmetric Gaussian band: d>0 is ahead of the
  // pulse center in the direction of travel (increasing vFlowCoord, same
  // direction uFlowPulseCenter sweeps over time) — the comet's bright head,
  // so it uses a narrow fixed sigma that cuts off sharply just past center.
  // d<0 is behind — already passed, fading — so it uses uFlowTailWorldSigma
  // (user-adjustable "Tail length", converted to an absolute world-space
  // distance via vFlowPathLen so it doesn't grow/shrink with this specific
  // arrow's own length) for its reach, and uFlowTailFalloffExponent
  // ("Tail falloff") for the curve's shape independent of that reach: 2.0
  // matches a plain Gaussian, higher stays near full brightness longer then
  // drops more sharply near the tail's end, lower behaves more like a thin
  // exponential streak. On top of both sits a second, much tighter "hot
  // core" lobe (uFlowCoreSigmaMult, "Core length" — symmetric, since it's
  // narrow enough either side barely reaches past the head/tail junction
  // anyway) adding extra brightness concentrated right at the head, so it
  // reads as a distinct bright point instead of just the front edge of a
  // flat-topped band.
  const float FLOW_COMET_HEAD_SIGMA_MULT = 0.12;
  const float FLOW_COMET_CORE_BOOST = 1.5;
  float flowPulseIntensity() {
    if (!(uBlueprint && uFlowActive && vIsGreen > 0.5 && vFlowCoord >= 0.0)) return 0.0;
    float total = 0.0;
    for (int i = 0; i < MAX_FLOW_PULSES; i++) {
      if (i >= uFlowPulseCount) break;
      float d = vFlowCoord - uFlowPulseCenters[i];
      float base;
      if (d > 0.0) {
        float sigma = uFlowSigma * FLOW_COMET_HEAD_SIGMA_MULT;
        base = exp(-(d * d) / (2.0 * sigma * sigma));
      } else {
        float dArc = abs(d) * vFlowPathLen;
        float tailSigma = max(uFlowTailWorldSigma, 1e-6);
        base = exp(-0.5 * pow(dArc / tailSigma, uFlowTailFalloffExponent));
      }
      float coreSigma = uFlowSigma * uFlowCoreSigmaMult;
      float core = exp(-(d * d) / (2.0 * coreSigma * coreSigma));
      total += base + core * FLOW_COMET_CORE_BOOST;
    }
    return total;
  }

  void main() {
    if (uGlowOnly) {
      // uFlowColor is pre-boosted (see the "Glow intensity" slider in
      // renderCubeFrame) brighter than what's actually drawn on the model, since blurring
      // dims the peak — everything else renders black so the blur only
      // picks up the pulse itself, not the model's own fill/wireframe.
      gl_FragColor = vec4(uFlowColor * flowPulseIntensity(), 1.0);
      return;
    }
    float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0) * uLightIntensity;
    float brightness = 0.2 + diff * 0.8;
    // Blueprint mode: ignore the material/cube color entirely and shade a
    // flat fill instead (navy, or green for green-material parts), dimmed
    // further so the wireframe overlay (drawn in a separate pass) reads as
    // the bright part of the look.
    vec3 base = uBlueprint ? (vIsGreen > 0.5 ? uBlueprintFillColorGreen : uBlueprintFillColor) : vColor;
    // Wider range than the old 0.3-0.6 (barely a 2x spread) so faces at
    // different angles to uLightDir read as clearly distinct shades instead
    // of nearly-uniform navy. Floor raised further (0.12 -> 0.3) so unlit
    // faces stay bright too, not just the lit ones.
    float shade = uBlueprint ? (0.3 + diff * 1.1) : brightness;
    vec3 color = base * shade;
    color += uFlowColor * flowPulseIntensity();
    // Fill-pattern-flagged faces (see aFillPattern / materialFillPatternId)
    // get uHatchLineColor drawn on top of everything above in whichever
    // pattern their material selected, so it reads on top of blueprint
    // fill, shaded-mode lighting, and the flow glow alike.
    int fillPatternId = int(vFillPattern + 0.5);
    float fillMask = 0.0;
    if (fillPatternId == 1) fillMask = hatchLinesMask(vPosition, vNormal);
    else if (fillPatternId == 2) fillMask = dotsMask(vPosition, vNormal);
    else if (fillPatternId == 3) fillMask = plusMask(vPosition, vNormal);
    if (fillPatternId != 0) {
      color = mix(color, uHatchLineColor, fillMask);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

const cubeProgram = gl.createProgram();
gl.attachShader(cubeProgram, compileShader(gl.VERTEX_SHADER, CUBE_VERTEX_SHADER));
gl.attachShader(cubeProgram, compileShader(gl.FRAGMENT_SHADER, CUBE_FRAGMENT_SHADER));
gl.linkProgram(cubeProgram);
if (!gl.getProgramParameter(cubeProgram, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(cubeProgram));
}

// Unlit flat-color line shader, used to draw the wireframe overlay in
// blueprint mode. Shares uModelView/uProjection semantics with the cube
// program but has no lighting — each edge vertex carries its own color
// (aLineColor) instead, so green-material edges can render green while
// everything else stays the default blueprint accent color (see
// buildCreaseEdgeLines). Also doubles as the shader for the drawn flow-arrow
// overlay itself (see renderCubeFrame) — that path is just a small ad hoc
// buffer bound to the same attributes.
const LINE_VERTEX_SHADER = `
  attribute vec3 aLinePosition;
  attribute vec3 aLineColor;
  uniform mat4 uLineModelView;
  uniform mat4 uLineProjection;
  varying vec3 vLineColor;
  void main() {
    gl_Position = uLineProjection * uLineModelView * vec4(aLinePosition, 1.0);
    vLineColor = aLineColor;
  }
`;

// Flat, unlit — the flow pulse only shows on the fill (see CUBE_FRAGMENT_SHADER),
// so the wireframe/edge lines never carry it regardless of green-flagged status.
// uLineAlpha defaults to 1 (fully opaque, e.g. the model wireframe) — the
// flow-arrow ribbons (see renderCubeFrame) lower it and enable gl.BLEND
// around their draw calls to render at partial opacity over the scene.
const LINE_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec3 vLineColor;
  uniform float uLineAlpha;
  void main() {
    gl_FragColor = vec4(vLineColor, uLineAlpha);
  }
`;

const lineProgram = gl.createProgram();
gl.attachShader(lineProgram, compileShader(gl.VERTEX_SHADER, LINE_VERTEX_SHADER));
gl.attachShader(lineProgram, compileShader(gl.FRAGMENT_SHADER, LINE_FRAGMENT_SHADER));
gl.linkProgram(lineProgram);
if (!gl.getProgramParameter(lineProgram, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(lineProgram));
}

// Two selectable blueprint palettes (see shaderTheme/setShaderTheme above) —
// "dark" is the original navy fill with gray wireframe lines, "light" is a
// pale gray fill with dark navy wireframe lines. Green-material parts (see
// isGreenDominant) ignore both and always get a green fill
// (BLUEPRINT_FILL_COLOR_GREEN) with black edges (BLUEPRINT_LINE_COLOR_GREEN_PART)
// so they read as a distinct, "called out" element regardless of theme.
const BLUEPRINT_THEMES = {
  dark: {
    bg: [4 / 255, 28 / 255, 44 / 255], // #041C2C
    fill: [4 / 255, 28 / 255, 44 / 255], // #041C2C
    line: [124 / 255, 134 / 255, 142 / 255], // #7C868E
  },
  light: {
    bg: [244 / 255, 246 / 255, 247 / 255], // #F4F6F7
    fill: [244 / 255, 246 / 255, 247 / 255], // #F4F6F7
    line: [4 / 255, 28 / 255, 44 / 255], // #041C2C
  },
};
const BLUEPRINT_FILL_COLOR_GREEN = [68 / 255, 214 / 255, 44 / 255]; // #44D62C
const BLUEPRINT_LINE_COLOR_GREEN_PART = [0, 0, 0];
// Bright additive glow color for the traveling flow pulse — added on top of
// whatever's underneath, so it reads as a light passing through rather than
// a color swap.
const BLUEPRINT_FLOW_COLOR = [225 / 255, 248 / 255, 221 / 255];

// Builds a blueprint wireframe's edge list from a flat position array and a
// flat triangle index list (three indices per triangle) — but only keeps
// "significant" edges: boundary edges (used by exactly one triangle) and
// creases (used by 2+ triangles whose face normals diverge past
// CREASE_ANGLE_DOT_THRESHOLD). Coplanar/smooth interior edges are dropped —
// notably this is what keeps a fan-triangulated quad's diagonal split out of
// the wireframe (its two triangles share the same plane, so that edge never
// qualifies). Necessary for dense meshes too: a literal "every triangle
// edge" wireframe on a 500k+-triangle mesh would overflow a 16-bit index
// buffer and render as solid haze rather than a clean line drawing.
const CREASE_ANGLE_DOT_THRESHOLD = Math.cos((25 * Math.PI) / 180);

// triIsGreen is one boolean per triangle (triIndices.length / 3); an edge
// renders in BLUEPRINT_LINE_COLOR_GREEN_PART (black) if any triangle using it
// is flagged green (see isGreenDominant) — e.g. ngen.mtl's
// EV_charger_body_green / shared_pipe_green parts — otherwise the default
// gray.
function buildCreaseEdgeLines(flatPositions, triIndices, triIsGreen) {
  const vertexCount = flatPositions.length / 3;
  const edgeMap = new Map();
  const triCount = triIndices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const ia = triIndices[t * 3], ib = triIndices[t * 3 + 1], ic = triIndices[t * 3 + 2];
    const ax = flatPositions[ia * 3], ay = flatPositions[ia * 3 + 1], az = flatPositions[ia * 3 + 2];
    const bx = flatPositions[ib * 3], by = flatPositions[ib * 3 + 1], bz = flatPositions[ib * 3 + 2];
    const cx = flatPositions[ic * 3], cy = flatPositions[ic * 3 + 1], cz = flatPositions[ic * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const isGreen = !!triIsGreen[t];

    const edges = [[ia, ib], [ib, ic], [ic, ia]];
    for (const [i0, i1] of edges) {
      const key = i0 < i1 ? i0 * vertexCount + i1 : i1 * vertexCount + i0;
      const existing = edgeMap.get(key);
      if (!existing) {
        edgeMap.set(key, { i0, i1, nx, ny, nz, minDot: 1, count: 1, isGreen });
      } else {
        const dot = existing.nx * nx + existing.ny * ny + existing.nz * nz;
        if (dot < existing.minDot) existing.minDot = dot;
        existing.count++;
        if (isGreen) existing.isGreen = true;
      }
    }
  }

  const lines = [];
  const lineIsGreen = [];
  for (const { i0, i1, count, minDot, isGreen } of edgeMap.values()) {
    if (count === 1 || minDot < CREASE_ANGLE_DOT_THRESHOLD) {
      lines.push(
        flatPositions[i0 * 3], flatPositions[i0 * 3 + 1], flatPositions[i0 * 3 + 2],
        flatPositions[i1 * 3], flatPositions[i1 * 3 + 1], flatPositions[i1 * 3 + 2],
      );
      lineIsGreen.push(isGreen);
    }
  }
  return {
    positions: new Float32Array(lines),
    isGreen: lineIsGreen,
    colors: buildLineColors(lineIsGreen, BLUEPRINT_THEMES[shaderTheme].line),
  };
}

// Per-vertex color buffer for a buildCreaseEdgeLines result — green-flagged
// edges always render in BLUEPRINT_LINE_COLOR_GREEN_PART (black) regardless
// of theme, everything else gets the current theme's line color. Split out
// from buildCreaseEdgeLines so switching shaderTheme can recolor the existing
// edge geometry (see setShaderTheme) without re-deriving creases/boundaries.
function buildLineColors(lineIsGreen, lineColor) {
  const colors = new Float32Array(lineIsGreen.length * 6);
  for (let i = 0; i < lineIsGreen.length; i++) {
    const c = lineIsGreen[i] ? BLUEPRINT_LINE_COLOR_GREEN_PART : lineColor;
    const o = i * 6;
    colors[o] = c[0]; colors[o + 1] = c[1]; colors[o + 2] = c[2];
    colors[o + 3] = c[0]; colors[o + 4] = c[1]; colors[o + 5] = c[2];
  }
  return colors;
}

// Re-uploads customModelLineColorBuffer from the cached per-edge isGreen
// flags (edge geometry never changes on a theme switch, only which color
// each non-green edge gets) — see setShaderTheme.
function refreshBlueprintLineColors() {
  const lineColor = BLUEPRINT_THEMES[shaderTheme].line;
  if (customModelLineIsGreenCache) {
    gl.bindBuffer(gl.ARRAY_BUFFER, customModelLineColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildLineColors(customModelLineIsGreenCache, lineColor), gl.STATIC_DRAW);
  }
}

const aPosition = gl.getAttribLocation(cubeProgram, 'aPosition');
const aNormal = gl.getAttribLocation(cubeProgram, 'aNormal');
const aColor = gl.getAttribLocation(cubeProgram, 'aColor');
const aIsGreen = gl.getAttribLocation(cubeProgram, 'aIsGreen');
const aFlowCoord = gl.getAttribLocation(cubeProgram, 'aFlowCoord');
const aFlowPathLen = gl.getAttribLocation(cubeProgram, 'aFlowPathLen');
const aFillPattern = gl.getAttribLocation(cubeProgram, 'aFillPattern');
const uModelView = gl.getUniformLocation(cubeProgram, 'uModelView');
const uProjection = gl.getUniformLocation(cubeProgram, 'uProjection');
const uLightDir = gl.getUniformLocation(cubeProgram, 'uLightDir');
const uLightIntensity = gl.getUniformLocation(cubeProgram, 'uLightIntensity');
const uBlueprint = gl.getUniformLocation(cubeProgram, 'uBlueprint');
const uBlueprintFillColor = gl.getUniformLocation(cubeProgram, 'uBlueprintFillColor');
const uBlueprintFillColorGreen = gl.getUniformLocation(cubeProgram, 'uBlueprintFillColorGreen');
const uFlowActive = gl.getUniformLocation(cubeProgram, 'uFlowActive');
const uFlowPulseCenters = gl.getUniformLocation(cubeProgram, 'uFlowPulseCenters[0]');
const uFlowPulseCount = gl.getUniformLocation(cubeProgram, 'uFlowPulseCount');
const uFlowSigma = gl.getUniformLocation(cubeProgram, 'uFlowSigma');
const uFlowColor = gl.getUniformLocation(cubeProgram, 'uFlowColor');
const uFlowCoreSigmaMult = gl.getUniformLocation(cubeProgram, 'uFlowCoreSigmaMult');
const uFlowTailWorldSigma = gl.getUniformLocation(cubeProgram, 'uFlowTailWorldSigma');
const uFlowTailFalloffExponent = gl.getUniformLocation(cubeProgram, 'uFlowTailFalloffExponent');
const uHatchLineColor = gl.getUniformLocation(cubeProgram, 'uHatchLineColor');
const uLineFrequency = gl.getUniformLocation(cubeProgram, 'uLineFrequency');
const uDotFrequency = gl.getUniformLocation(cubeProgram, 'uDotFrequency');
const uDotRadius = gl.getUniformLocation(cubeProgram, 'uDotRadius');
const uPlusFrequency = gl.getUniformLocation(cubeProgram, 'uPlusFrequency');
const uPlusArmHalf = gl.getUniformLocation(cubeProgram, 'uPlusArmHalf');
const uPlusThickness = gl.getUniformLocation(cubeProgram, 'uPlusThickness');
const uGlowOnly = gl.getUniformLocation(cubeProgram, 'uGlowOnly');

const aLinePosition = gl.getAttribLocation(lineProgram, 'aLinePosition');
const aLineColor = gl.getAttribLocation(lineProgram, 'aLineColor');
const uLineModelView = gl.getUniformLocation(lineProgram, 'uLineModelView');
const uLineProjection = gl.getUniformLocation(lineProgram, 'uLineProjection');
const uLineAlpha = gl.getUniformLocation(lineProgram, 'uLineAlpha');

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0, 0, 0, 1);

// Minimal column-major mat4 helpers (matches WebGL's native matrix layout).
function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

// True isometric is an orthographic (parallel-projection) view — no
// perspective foreshortening, unlike mat4Perspective above.
function mat4Ortho(left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1,
  ]);
}

function mat4RotateX(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  // prettier-ignore
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}

function mat4RotateY(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  // prettier-ignore
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}

function mat4Translate(x, y, z) {
  // prettier-ignore
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
}

function mat4Scale(s) {
  // prettier-ignore
  return new Float32Array([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]);
}

// prettier-ignore
const IDENTITY_MAT4 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

// Orthographic frustum half-size chosen to match how big the cube read
// under the old 45°-fov perspective projection at the same camera distance
// (distance * tan(fovy/2)), so switching to isometric didn't also change
// the cube's apparent size on screen. This is the reference half-size for
// a square viewport; updateCubeProjection derives the actual per-axis
// half-extents (cubeProjectionHalfX/Y) from it below.
const CUBE_ORTHO_HALF_SIZE = (5 * Math.tan(Math.PI / 8)) / 10;
let cubeProjectionHalfX = CUBE_ORTHO_HALF_SIZE;
let cubeProjectionHalfY = CUBE_ORTHO_HALF_SIZE;
let cubeProjection = mat4Ortho(-cubeProjectionHalfX, cubeProjectionHalfX, -cubeProjectionHalfY, cubeProjectionHalfY, 0.1, 100);

// Replicates the "cover fit" a 2D-crop blit used to give for free: the
// shorter display axis keeps the full reference half-size (nothing is
// ever clipped on that axis), while the longer axis's half-extent shrinks
// in proportion to the aspect ratio, so panning/framing looks identical to
// the old square-render-then-crop pipeline without an extra pixel crop —
// see raycastGreenMesh below, which must read back these exact half-extents
// (not the fixed reference one) to unproject a pointer position correctly.
function updateCubeProjection(aspect) {
  if (aspect >= 1) {
    cubeProjectionHalfX = CUBE_ORTHO_HALF_SIZE;
    cubeProjectionHalfY = CUBE_ORTHO_HALF_SIZE / aspect;
  } else {
    cubeProjectionHalfY = CUBE_ORTHO_HALF_SIZE;
    cubeProjectionHalfX = CUBE_ORTHO_HALF_SIZE * aspect;
  }
  cubeProjection = mat4Ortho(-cubeProjectionHalfX, cubeProjectionHalfX, -cubeProjectionHalfY, cubeProjectionHalfY, 0.1, 100);
}

// 10% of the original size (which was itself "300% smaller", i.e. a third
// the size); the "Model size" slider (cubeSizeScale) multiplies on top of
// this.
const CUBE_SCALE = (1 / 3) * 0.1;

// Model's on-canvas X/Y position, as a slider value from -300 to 300 applied
// as an object-space translate *inside* rotation in renderCubeFrame (i.e.
// before rotation, so it's rigid with the model — see getObjectSpacePan for
// why). MODEL_POSITION_RANGE converts that value into view-space units
// (divided by 100, so ±100 — a third of the slider's travel — is where the
// offset just carries the model past the ortho frustum's edge, i.e.
// CUBE_ORTHO_HALF_SIZE plus roughly the default-size model's own
// half-extent); the rest of the range up to ±300 keeps panning it well
// off-canvas. Deliberately session-only (not persisted/restored via
// localStorage like the other sliders) — always starts at 0,0 on a fresh
// page load rather than reopening wherever a previous session's camera
// move/pan happened to leave it.
const MODEL_POSITION_MIN = -300;
const MODEL_POSITION_MAX = 300;
const MODEL_POSITION_RANGE = CUBE_ORTHO_HALF_SIZE * 1.2;
let modelOffsetXPercent = 0;
let modelOffsetYPercent = 0;
// Third pan axis, same range/units/session-only persistence as X/Y — unused
// by the default isometric view (there's no "Model Z position" slider), but
// driven by vertical drag while the bird's-eye camera (Space held — see the
// Space keydown handler) is active, since at a 90° top-down pitch it's this
// axis, not Y, that reads as forward/back movement across the ground plane
// on screen.
let modelOffsetZPercent = 0;

function clampModelPosition(percent) {
  return Math.max(MODEL_POSITION_MIN, Math.min(MODEL_POSITION_MAX, percent));
}

function setModelOffsetXPercent(percent) {
  const clamped = clampModelPosition(percent);
  modelOffsetXPercent = clamped;
  return clamped;
}

function setModelOffsetYPercent(percent) {
  const clamped = clampModelPosition(percent);
  modelOffsetYPercent = clamped;
  return clamped;
}

function setModelOffsetZPercent(percent) {
  const clamped = clampModelPosition(percent);
  modelOffsetZPercent = clamped;
  return clamped;
}

function resetModelPosition() {
  setModelOffsetXPercent(0);
  setModelOffsetYPercent(0);
  setModelOffsetZPercent(0);
}

// Shared by renderCubeFrame and raycastGreenMesh's unprojection so the two
// stay in sync — the raycast has to undo the exact same view-space
// translate the render pass applies, or drawing on a panned model would hit
// the wrong spot.
function getModelViewOffset() {
  return [
    (modelOffsetXPercent / 100) * MODEL_POSITION_RANGE,
    (modelOffsetYPercent / 100) * MODEL_POSITION_RANGE,
    (modelOffsetZPercent / 100) * MODEL_POSITION_RANGE,
  ];
}

// Camera depth in view space — how far back the "camera" sits from the
// model along Z. Kept as its own mutable seam (rather than inlined into the
// translate call) so future scripted movement-through-the-model can drive it
// per frame. Because this translate is applied *after* rotation in
// renderCubeFrame's modelView build (see below), changing it can never
// affect cubeRotX/Y or the hover parallax (cubeParallaxX/Y) — rotation stays
// live no matter where the camera currently sits.
let cameraOffsetZ = -5;

// Classic isometric angles: 45° yaw so all three visible faces read as
// equally foreshortened, and a ~35.264° (arctan(1/sqrt(2))) downward pitch
// — the "magic angle" where a cube's edges project at exactly 30° from
// horizontal, which is what makes an isometric view look isometric rather
// than just "some 3/4 angle." Positive because mat4RotateX at a positive
// theta rotates the model's +Y (top face) normal toward +Z, i.e. toward the
// camera — so the camera ends up above the object looking down onto its top
// face, rather than seeing the underside from below.
const CUBE_ISO_YAW = Math.PI / 4;
const CUBE_ISO_PITCH = Math.atan(1 / Math.SQRT2);

// Bird's-eye camera: straight down (90° pitch) with yaw reset to 0, used
// while Space is held (see the Space keydown/keyup handlers below) so the
// user can fly over and navigate the scene from directly above. Yaw is
// zeroed (not left at whatever it currently is) specifically so the ground
// plane isn't left sitting at a diagonal — with no yaw, object-space X and Z
// map cleanly onto screen-horizontal and screen-vertical, which is what lets
// the Space-drag pan below move along X/Z (ground-plane, "left/right" and
// "up/down through the scene") instead of the default view's X/Y.
const CUBE_BIRDSEYE_YAW = 0;
const CUBE_BIRDSEYE_PITCH = Math.PI / 2;

// Starts in the bird's-eye pose (rather than straight at CUBE_ISO_PITCH/
// YAW) so the bundled model's very first visible frame, once it's actually
// loaded, reads as a deliberate top-down opening shot rather than already
// sitting at its resting angle; loadBundledDefaultModel eases this into the
// actual resting rotation once the model's ready (see its
// tweenCubeRotationTo call, MODEL_LOAD_ROTATION_INTRO_MS).
let cubeRotX = CUBE_BIRDSEYE_PITCH;
let cubeRotY = CUBE_BIRDSEYE_YAW;
let cubeDragging = false;
let cubeLastPointer = null;

// Space-to-fly: holding Space rises into a bird's-eye view (see
// tweenCubeRotationTo/CUBE_BIRDSEYE_PITCH below) and dragging moves the
// model on the ground plane (modelOffsetXPercent/ZPercent — X has its own
// "Model X position" slider, Z has none since it's bird's-eye-only) instead
// of rotating it, regardless of whether click-drag rotation is enabled.
// Takes priority over rotation-drag while held (see the pointerdown handler
// below).
let spaceHeld = false;
let panDragging = false;
let panLastPointer = null;
// Held-Z drag (see zKeyHeld below): independent of Space/bird's-eye —
// vertical drag alone adjusts object-space Y (height), same up-is-positive
// convention as the "Model Y position" slider.
let zDragging = false;
let zLastPointer = null;
// Plain (no-modifier) drag while editingDefaultView is active (see
// setEditingDefaultView) — rotation-drag is locked in that mode anyway, so
// the ordinary drag gesture pans instead of doing nothing, without needing
// Space held — same X/Z ground-plane mapping panDragging (Space-drag) uses,
// deliberately never Y: height is locked while editing the default position
// (see the Z keydown handler and the panel's "Model Y position" slider,
// both gated on editingDefaultView too), so there's exactly one axis pair
// this mode can ever touch.
let editPanDragging = false;
let editPanLastPointer = null;
let zKeyHeld = false; // declared up here (not by the Z keydown/keyup handlers further below) since updateCubeCursor, defined next, reads it immediately
let panSyncRAF = null; // see schedulePanSync below

// setModelOffsetXPercent/YPercent/ZPercent trigger a full panel re-render on
// every call — fine for the sliders (one call per user action), but calling
// them on every single pointermove while panning made the drag visibly
// janky, since a pointer can fire many move events per rendered frame.
// Panning instead mutates the raw percent variables directly (cheap) and
// batches the panel notify to once per animation frame via this, with
// pointerup doing one final synchronous flush so the panel never lags
// behind once the drag actually stops.
function schedulePanSync() {
  if (panSyncRAF !== null) return;
  panSyncRAF = requestAnimationFrame(() => {
    panSyncRAF = null;
    notifyModelState();
  });
}
function flushPanSync() {
  if (panSyncRAF !== null) {
    cancelAnimationFrame(panSyncRAF);
    panSyncRAF = null;
  }
  notifyModelState();
}

// Ambient parallax tilt: a small extra rotation, layered on top of
// cubeRotX/Y, that follows the cursor's position anywhere on the page.
// cubeParallaxTargetX/Y track the cursor instantly; cubeParallaxX/Y ease
// toward that target a little each frame (see renderCubeFrame) so the tilt
// reads as a soft parallax drift rather than snapping straight to the mouse.
// Suspended while dragging so the two rotation sources don't fight.
const CUBE_PARALLAX_MAX_RAD = 0.2;
const CUBE_PARALLAX_SMOOTHING = 0.1;
let cubeParallaxTargetX = 0;
let cubeParallaxTargetY = 0;
let cubeParallaxX = 0;
let cubeParallaxY = 0;
// Whether a real cursor reading has ever come in — see
// updateParallaxTargetFromPointer, which kicks off a one-time slow reveal
// (CUBE_PARALLAX_INIT_REVEAL_MS, see advanceParallax below) toward it the
// first time only, rather than easing there via the normal fast
// CUBE_PARALLAX_SMOOTHING from the placeholder 0 the variables above start
// at — that read as an unexplained jump; an instant snap (tried first) read
// as an equally unexplained pop. A slower, deliberate reveal is the middle
// ground: still clearly *arriving* rather than popping in, but slow enough
// not to read as chasing the cursor the way the original per-frame ease did.
let cubeParallaxRegistered = false;
const CUBE_PARALLAX_INIT_REVEAL_MS = 2500;
let cubeParallaxInitRevealStartTime = null;
let cubeParallaxInitRevealFromX = 0;
let cubeParallaxInitRevealFromY = 0;

// Tweens the model to a given rotation angle — both the drag rotation
// (cubeRotX/Y) and the ambient parallax tilt (cubeParallaxX/Y and its
// target) ease toward the target/zero respectively. Animated as a fast ease
// (see the tween applied in renderCubeFrame) rather than an instant jump, so
// it reads as a deliberate snap instead of a jarring cut. Used both for
// snapping back to the default framed angle (resetCubeRotation, below —
// shared by the "Reset rotation" button, enabling "Pause hover movement",
// Shift+R, and Space-up) and for rising into the bird's-eye view on
// Space-down (see the keydown/keyup handlers below).
// Ease-out cubic — starts fast, decelerates into the target with no
// overshoot. The default for every fast (180ms) reset-style tween (Reset
// rotation, Space bird's-eye rise/return, the "Go to default" button),
// where the deceleration itself is what reads as "arriving."
const EASE_OUT_CUBIC = (t) => 1 - (1 - t) ** 3;

// General CSS-style cubic-bezier easing: the curve's control points are
// (0,0), (x1,y1), (x2,y2), (1,1), with t treated as the *time* axis (x) and
// the return value as the eased *progress* (y). x(u) has no closed-form
// inverse, so this solves for the bezier parameter u where x(u) == t via
// Newton-Raphson — a handful of iterations converges well past visible
// precision for a monotonic-in-x curve (x1/x2 within [0,1], as any real
// easing curve's are) — then evaluates y(u).
function cubicBezierEasing(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (u) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u) => ((ay * u + by) * u + cy) * u;
  const sampleDerivX = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(u) - t;
      const d = sampleDerivX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= dx / d;
    }
    return sampleY(u);
  };
}

// cubic-bezier(0.85, 0, 0.15, 1) — a steep, symmetric ease-in-out: it holds
// near 0 and near 1 longer than a plain quad ease-in-out would, then sweeps
// through the middle sharply, giving loadBundledDefaultModel's bird's-eye-in
// intro a more deliberate pause-then-snap character over its duration.
const EASE_INTRO_BEZIER = cubicBezierEasing(0.85, 0, 0.15, 1);

const CUBE_ROT_RESET_MS = 180; // fast — quicker than the modal open duration, barely more than a frame or two of "not instant"
let cubeRotResetStartTime = null;
let cubeRotResetFrom = null; // { rotX, rotY, parX, parY, parTargetX, parTargetY } snapshot taken at tween start
let cubeRotResetTargetX = CUBE_ISO_PITCH;
let cubeRotResetTargetY = CUBE_ISO_YAW;
// This tween's duration, in ms — defaults to CUBE_ROT_RESET_MS's fast snap
// for every existing caller (Reset rotation, Space bird's-eye rise/return,
// the "Go to default" button); loadBundledDefaultModel's initial bird's-eye
// -> resting-rotation intro is the one caller that passes something slower.
let cubeRotResetDurationMs = CUBE_ROT_RESET_MS;
// This tween's easing curve — see EASE_OUT_CUBIC/EASE_INTRO_BEZIER above.
let cubeRotResetEasing = EASE_OUT_CUBIC;
// Whether this tween also drives cubeParallaxX/Y itself (decaying the
// snapshot back toward zero, same as the base rotation easing toward its
// target — see renderCubeFrame) instead of leaving them to the normal
// per-frame hover easing. True for every existing fast (180ms) reset-style
// tween, where a live hover fighting a snap this quick would just look like
// jitter. False for loadBundledDefaultModel's slow 2s intro specifically —
// long enough that suppressing hover for its whole duration would read as
// hover simply not working yet, so that one leaves parallax on the normal
// path and just lets the two motions run concurrently.
let cubeRotResetSuppressParallax = true;

function tweenCubeRotationTo(targetRotX, targetRotY, durationMs = CUBE_ROT_RESET_MS, suppressParallax = true, easing = EASE_OUT_CUBIC) {
  cubeRotResetFrom = {
    rotX: cubeRotX,
    rotY: cubeRotY,
    parX: cubeParallaxX,
    parY: cubeParallaxY,
    parTargetX: cubeParallaxTargetX,
    parTargetY: cubeParallaxTargetY,
  };
  cubeRotResetTargetX = targetRotX;
  cubeRotResetTargetY = targetRotY;
  cubeRotResetSuppressParallax = suppressParallax;
  cubeRotResetDurationMs = durationMs;
  cubeRotResetEasing = easing;
  cubeRotResetStartTime = performance.now();
}

function resetCubeRotation() {
  tweenCubeRotationTo(CUBE_ISO_PITCH, CUBE_ISO_YAW);
}

// "Pause hover movement" control: freezes the ambient parallax tilt so the
// model holds still regardless of cursor position, snapping back to the
// default framed angle (via resetCubeRotation above) rather than staying
// wherever it was when paused.
let hoverMovementPaused = false;

function setHoverMovementPaused(value) {
  hoverMovementPaused = value;
  if (value) resetCubeRotation();
}

// "Photo mode": entered/left with the P key (see the keydown handler below)
// to compose a clean shot before exporting — while active, ambient hover
// parallax is locked out (same guard list as hoverMovementPaused/
// editingDefaultView, see updateParallaxTargetFromPointer) and the
// orientation is snapped to the default isometric angle via
// resetCubeRotation, same as enabling "Pause hover movement" does. Unlike
// hoverMovementPaused, this doesn't otherwise restrict drag-rotation/zoom/
// pan — it only fixes the *starting* orientation and freezes hover, so
// there's nothing to undo on exit.
let photoMode = false;

function setPhotoMode(value) {
  value = !!value;
  if (value === photoMode) return;
  photoMode = value;
  if (value) resetCubeRotation();
  notifyModelState(); // drives the panel's bottom-center photo-mode indicator, same as spaceHeld
}

// "Disable rotation" control: click-and-drag rotation is off by default so
// visitors can't accidentally spin the model away from its framed angle.
let rotationDisabled = true;
// "Edit default position" mode (the panel button toggles this via
// setEditingDefaultView, defined further down alongside defaultCameraView)
// — while active, the user can only pan X/Z (plain drag — see
// editPanDragging — or the "Model X position" slider) and zoom (scroll/
// "Model size" slider) the free camera. Everything else that could move the
// view is locked: rotation dragging (see the pointerdown handler), height/Y
// (see the Z keydown handler and the panel's "Model Y position" slider —
// defaultCameraView.offsetY just carries through whatever it already was,
// since nothing in this mode can ever change it), and Camera Targets (see
// the Digit1/2/3 handler and the panel's target "Go" buttons). There's no
// target object to auto-frame here the way Camera Targets have, so this is
// the only way to define what "the default position" actually is: park the
// free camera by hand, then capture it. Declared here (rather than next to
// setEditingDefaultView) specifically so it's initialized before
// updateCubeCursor's own top-level call just below,
// which reads it.
let editingDefaultView = false;

function updateCubeCursor() {
  canvas.style.cursor = spaceHeld || zKeyHeld || editingDefaultView || !rotationDisabled ? 'grab' : 'default';
}

function setRotationDisabled(value) {
  rotationDisabled = value;
  if (!cubeDragging) updateCubeCursor();
}

updateCubeCursor();

// Held Space rises into a bird's-eye view (straight-down pitch, zero yaw —
// see CUBE_BIRDSEYE_PITCH/YAW) to fly over and navigate the scene, same
// spirit as the space-pan idiom in Figma/Photoshop but repurposed for a
// top-down look instead of a same-angle pan. Guarded against
// inputs/textareas/selects so it doesn't fight typing a value into a slider
// or the model-name select, and preventDefault stops the page from
// scrolling (there's normally nothing to scroll, but also stops Space from
// re-clicking whatever button last had focus).
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || spaceHeld) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  spaceHeld = true;
  tweenCubeRotationTo(CUBE_BIRDSEYE_PITCH, CUBE_BIRDSEYE_YAW);
  if (!cubeDragging) updateCubeCursor();
  notifyModelState(); // panel's "Press space to move" indicator flips to "Release to enter rotation mode"
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space') return;
  spaceHeld = false;
  resetCubeRotation(); // back down to the default framed angle, same fast ease as the rise on Space-down
  if (!panDragging) updateCubeCursor();
  notifyModelState();
});
// Dropping focus (e.g. alt-tabbing away) mid-hold never fires a matching
// keyup — without this, spaceHeld/panDragging could get stuck on, and the
// camera could get stranded up in the bird's-eye view.
window.addEventListener('blur', () => {
  const wasSpaceHeld = spaceHeld;
  spaceHeld = false;
  if (panDragging) {
    panDragging = false;
    flushPanSync();
  }
  if (wasSpaceHeld) {
    resetCubeRotation();
    notifyModelState();
  }
  updateCubeCursor();
});

// Held R is a quick, temporary "enable rotation" shortcut — click-drag
// rotation turns on for as long as it's held and back off the moment it's
// released, regardless of whatever the panel's "Disable rotation" switch is
// set to. Unlike Space, it never resets rotation on its own — pressing or
// releasing R always leaves the model at whatever angle it was already at.
// rKeyHeld (separate from rotationDisabled itself) exists purely to ignore
// keyboard auto-repeat's duplicate keydown events while held.
let rKeyHeld = false;
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyR') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  // Shift+R is a one-shot "reset orientation to default" shortcut,
  // independent of the plain-R hold-to-rotate gesture below.
  if (event.shiftKey) {
    event.preventDefault();
    resetCubeRotation();
    return;
  }
  if (rKeyHeld) return;
  rKeyHeld = true;
  setRotationDisabled(false);
  notifyModelState();
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'KeyR' || !rKeyHeld) return;
  rKeyHeld = false;
  setRotationDisabled(true);
  // Unlike Space, releasing R does NOT reset rotation — whatever angle the
  // user left it at while rotating should stick.
  notifyModelState();
});
// Same reasoning as the Space blur handler above — alt-tabbing away mid-hold
// never fires a matching keyup.
window.addEventListener('blur', () => {
  if (!rKeyHeld) return;
  rKeyHeld = false;
  setRotationDisabled(true);
  notifyModelState();
});

// Held Z is its own drag gesture, independent of Space/bird's-eye: click and drag
// while it's held adjusts object-space Y (height) directly — see
// zDragging's pointerdown/pointermove/pointerup handling below. Excludes
// Cmd/Ctrl+Z, which is the flow-arrow undo shortcut below instead. Also
// excluded while editingDefaultView is active — height is locked while
// editing the default position (see editPanDragging's comment).
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyZ' || zKeyHeld || event.metaKey || event.ctrlKey || editingDefaultView) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  zKeyHeld = true;
  if (!zDragging) updateCubeCursor();
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'KeyZ') return;
  zKeyHeld = false;
  if (!zDragging) updateCubeCursor();
});
window.addEventListener('blur', () => {
  zKeyHeld = false;
  if (!zDragging) updateCubeCursor();
});

// Cmd+Z (Mac) / Ctrl+Z (Windows/Linux) undoes the most recently finalized
// flow arrow — same action as the panel's "Undo last arrow" button, just
// without needing draw mode active first (matches that button, which is
// always clickable). preventDefault stops the browser's own undo from also
// firing (e.g. undoing an accidental text selection).
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyZ' || !(event.metaKey || event.ctrlKey) || event.shiftKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  undoLastModelFlowArrow();
});

// Delete/Backspace removes whichever flow arrow is currently selected (see
// setModelFlowSelectMode/the select-mode click handler) — same action as the
// panel's "Delete selected" button. A no-op (deleteSelectedModelFlowArrow
// itself just returns) when nothing's selected, so this never fights
// Backspace's normal job of erasing text in a focused field — the
// input/textarea/select guard below covers that anyway.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Delete' && event.code !== 'Backspace') return;
  if (selectedFlowArrowIndex === null) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  deleteSelectedModelFlowArrow();
});

// A is a plain toggle (unlike Space/R/Z's hold gestures) for the "Draw flow
// arrow" mode — press to enter, press again to leave. setModelFlowDraw
// already handles the enter/leave side effects (resetting position/rotation,
// dropping an in-progress arrow) and notifies the panel, same as its Switch.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyA' || event.repeat) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  setModelFlowDraw(!modelFlowDrawMode);
});

// P is the same kind of plain toggle as A above, for photo mode (see
// setPhotoMode/photoMode's own comment).
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyP' || event.repeat) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  setPhotoMode(!photoMode);
});

// Enter captures the photo while photo mode is active — a no-op otherwise,
// so it never fights the browser's/panel's own default Enter behavior (e.g.
// submitting a focused form control, which the input/textarea/select guard
// below also excludes explicitly).
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Enter' || !photoMode || event.repeat) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  event.preventDefault();
  capturePhoto();
});

// 1/2/3 jump straight to Camera Target 1/2/3 (see goToCameraTarget), same
// shortcut as each target's own "Go" button in the panel. Ignored while
// editingDefaultView is active — see setEditingDefaultView — since jumping
// to a target would take over centering entirely, out from under an
// in-progress pan/zoom edit.
const CAMERA_TARGET_DIGIT_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2 };
window.addEventListener('keydown', (event) => {
  const slotIndex = CAMERA_TARGET_DIGIT_KEYS[event.code];
  if (slotIndex === undefined || event.repeat) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (!cameraTargetSlots[slotIndex] || editingDefaultView) return; // nothing assigned to this slot yet
  event.preventDefault();
  goToCameraTarget(slotIndex);
});

// 0 jumps to the baked-in default view (see goToDefaultCameraView), same
// shortcut pattern as 1/2/3 above for the Camera Targets. goToDefaultCameraView
// itself already no-ops while editingDefaultView is active, but the guard is
// mirrored here too so the key doesn't even preventDefault for nothing.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Digit0' || event.repeat) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (!defaultCameraView || editingDefaultView) return; // nothing saved yet
  event.preventDefault();
  goToDefaultCameraView();
});

// Scroll-to-zoom: the mouse wheel (or trackpad scroll) zooms the camera in
// and out, reusing the exact same underlying scale as the "Model size"
// slider (see applyCubeSizePercent) — so it zooms into the pivot crosshair
// for free, the same way that slider already does, and the slider stays
// live-in-sync with whatever the wheel does. Exponential rather than linear
// (each wheel "notch" scales by a fixed *ratio*, not a fixed amount) so it
// feels consistent whether zoomed way in or way out, across
// CUBE_SIZE_MIN..CUBE_SIZE_MAX's wide range. Bound to the canvas
// specifically (not window) so scrolling the side panels' own overflowing
// content doesn't also zoom the 3D view underneath them.
const CUBE_WHEEL_ZOOM_SPEED = 0.0018; // tuned so one typical mouse-wheel notch (~100 deltaY) feels like one comfortable zoom step
let wheelZoomSyncRAF = null;
function scheduleWheelZoomSync() {
  if (wheelZoomSyncRAF !== null) return;
  wheelZoomSyncRAF = requestAnimationFrame(() => {
    wheelZoomSyncRAF = null;
    persistNumber('cubeSize', cubeSizePercent);
    notifyModelState();
  });
}
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * CUBE_WHEEL_ZOOM_SPEED);
    applyCubeSizePercent(cubeSizePercent * factor);
    scheduleWheelZoomSync();
  },
  { passive: false },
);

canvas.addEventListener('pointerdown', (event) => {
  if (modelFlowSelectMode) return;
  if (zKeyHeld) {
    zDragging = true;
    zLastPointer = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  // Checked before the draw-mode branch below (same relative order as
  // outside draw mode) so a space-held left-click pans instead of being
  // swallowed as "reserved for tracing an arrow" — the draw-mode
  // pointerdown handler further down skips placing a point for the same
  // reason, via its own spaceHeld check.
  if (spaceHeld) {
    panDragging = true;
    panLastPointer = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  // See editPanDragging's own comment — takes priority over the plain
  // rotation-drag path below (which editingDefaultView locks anyway) so an
  // ordinary drag pans immediately, with no modifier key needed.
  if (editingDefaultView) {
    editPanDragging = true;
    editPanLastPointer = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (modelFlowDrawMode) {
    // Left button is reserved for tracing an arrow (see the draw-mode
    // pointerdown handler below); right button still rotates the model so a
    // drawing session isn't stuck at whatever angle it started at.
    if (event.button !== 2) return;
    cubeDragging = true;
    cubeLastPointer = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  // editingDefaultView never reaches here — it returns via editPanDragging
  // above — but rotationDisabled still gates the plain case as normal.
  if (rotationDisabled) return;
  cubeDragging = true;
  cubeLastPointer = { x: event.clientX, y: event.clientY };
  canvas.style.cursor = 'grabbing';
});

window.addEventListener('pointermove', (event) => {
  if (editPanDragging) {
    // Horizontal -> X, vertical -> Z — same ground-plane mapping panDragging
    // (Space-drag) uses; see editPanDragging's own comment for why Y never
    // moves here.
    const dxPix = event.clientX - editPanLastPointer.x;
    const dyPix = event.clientY - editPanLastPointer.y;
    editPanLastPointer = { x: event.clientX, y: event.clientY };
    const percentPerPixelX = ((cubeProjectionHalfX * 2) / window.innerWidth) * (100 / MODEL_POSITION_RANGE);
    const percentPerPixelY = ((cubeProjectionHalfY * 2) / window.innerHeight) * (100 / MODEL_POSITION_RANGE);
    modelOffsetXPercent = clampModelPosition(modelOffsetXPercent + dxPix * percentPerPixelX);
    modelOffsetZPercent = clampModelPosition(modelOffsetZPercent + dyPix * percentPerPixelY);
    schedulePanSync();
    return;
  }
  if (zDragging) {
    // Vertical-only: dragging up subtracts a negative dyPix, raising Y,
    // same up-is-positive convention as the "Model Y position" slider.
    const dyPix = event.clientY - zLastPointer.y;
    zLastPointer = { x: event.clientX, y: event.clientY };
    const percentPerPixelY = ((cubeProjectionHalfY * 2) / window.innerHeight) * (100 / MODEL_POSITION_RANGE);
    modelOffsetYPercent = clampModelPosition(modelOffsetYPercent - dyPix * percentPerPixelY);
    schedulePanSync();
    return;
  }
  if (panDragging) {
    // 1:1 with the cursor: convert the pixel delta to view-space units via
    // the ortho frustum's actual on-screen size, then to the same percent
    // scale setModelOffsetXPercent/ZPercent (and MODEL_POSITION_RANGE) use.
    // This only ever runs while the bird's-eye camera is active (Space
    // held — see the keydown handler above), looking straight down with
    // zero yaw, so screen-horizontal drag maps to object-space X and
    // screen-vertical drag maps to object-space Z (the ground plane's other
    // axis) rather than Y, which at a 90° pitch would move things in depth,
    // not across the screen — Y is only reachable via the separate held-Z
    // drag above. Dragging right adds to X the same way it always has;
    // dragging down adds to Z to make the ground follow the cursor instead
    // of the camera.
    const dxPix = event.clientX - panLastPointer.x;
    const dyPix = event.clientY - panLastPointer.y;
    panLastPointer = { x: event.clientX, y: event.clientY };
    const percentPerPixelX = ((cubeProjectionHalfX * 2) / window.innerWidth) * (100 / MODEL_POSITION_RANGE);
    const percentPerPixelY = ((cubeProjectionHalfY * 2) / window.innerHeight) * (100 / MODEL_POSITION_RANGE);
    modelOffsetXPercent = clampModelPosition(modelOffsetXPercent + dxPix * percentPerPixelX);
    modelOffsetZPercent = clampModelPosition(modelOffsetZPercent + dyPix * percentPerPixelY);
    schedulePanSync();
    return;
  }
  if (cubeDragging) {
    cubeRotY += (event.clientX - cubeLastPointer.x) * 0.01;
    cubeRotX += (event.clientY - cubeLastPointer.y) * 0.01;
    cubeLastPointer = { x: event.clientX, y: event.clientY };
    return;
  }
  updateParallaxTargetFromPointer(event);
});

// Keep the model perfectly still while tracing an arrow onto it, or while
// trying to click one precisely in select mode — ambient parallax tilt
// shifting the surface under the cursor would make either one hard to do.
// Also suspended for as long as Space, R, or Z is held (spaceHeld covers
// both the pre-drag hold and the pan-drag itself, rKeyHeld the same for
// rotate-drag, zKeyHeld the same for the height drag) so none of them
// fight the manual pan/rotate/height-adjust; it simply stops updating its
// target rather than resetting, so it resumes smoothly from wherever it
// was once the key is released. Shared by the 'pointermove' listener above
// (every subsequent update) and the 'pointerenter' one below (a first
// reading as early as possible after load — see its own comment for why).
//
// JS has no way to read the cursor's position without at least one pointer
// event since load. 'pointerenter' (below) covers the cursor actually
// crossing into the window right around load, but not the more common case
// this was actually reported for: the cursor already sitting motionless
// somewhere inside the viewport *through* a reload, which fires neither
// 'pointerenter' (it never crossed a boundary — it was already inside) nor
// 'pointermove' (it never moved) until the user eventually nudges it (a
// CSS-:hover-based probe was tried to get around this with zero movement
// required at all — confirmed impossible: browsers reset their
// pointer-tracking state on every navigation, so nothing survives a real
// reload without at least one genuine post-load pointer event, apparently
// deliberately — see git history for the probe and how it was ruled out).
// "Ever registered" — set true the first time this runs at all, regardless
// of which listener — covers the motionless-cursor case: the very first
// real reading kicks off a slow reveal (advanceParallax,
// CUBE_PARALLAX_INIT_REVEAL_MS) toward it instead of either snapping
// straight there (read as an unexplained pop) or easing there at the
// normal fast CUBE_PARALLAX_SMOOTHING rate (the original swoop this was
// built to avoid) — every update after this first one still eases normally.
function updateParallaxTargetFromPointer(event) {
  // editingDefaultView locks hover parallax the same way the others here
  // do — see setEditingDefaultView: while parking the free camera for the
  // baked-in default, ambient tilt drifting the view around while the user
  // is trying to pan/zoom precisely would fight the exact composition
  // they're lining up. photoMode locks it too, so the orientation stays at
  // the fixed default isometric angle setPhotoMode snapped to — see its own
  // comment.
  if (modelFlowDrawMode || modelFlowSelectMode || hoverMovementPaused || spaceHeld || rKeyHeld || zKeyHeld || editingDefaultView || photoMode) return;
  const nx = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
  const ny = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1));
  cubeParallaxTargetY = nx * CUBE_PARALLAX_MAX_RAD;
  cubeParallaxTargetX = ny * CUBE_PARALLAX_MAX_RAD;
  if (!cubeParallaxRegistered) {
    cubeParallaxRegistered = true;
    cubeParallaxInitRevealFromX = cubeParallaxX;
    cubeParallaxInitRevealFromY = cubeParallaxY;
    cubeParallaxInitRevealStartTime = performance.now();
  }
}

// Advances cubeParallaxX/Y by one frame — the one-time slow reveal (see
// cubeParallaxRegistered's comment) while it's running, otherwise the
// normal fast per-frame ease toward cubeParallaxTargetX/Y. Shared by both
// call sites in renderCubeFrame (the plain per-frame path, and the one
// nested inside an active rotation tween when it isn't suppressing
// parallax) so the reveal plays out identically regardless of whether the
// load intro's rotation tween happens to still be running at the same time.
function advanceParallax() {
  // editingDefaultView freezes the tilt exactly where it already is,
  // instantly — not just the target (see updateParallaxTargetFromPointer's
  // own gate), so there's no residual settling left to finish converging
  // toward whatever the target already was the moment edit mode started.
  if (editingDefaultView) return;
  if (cubeParallaxInitRevealStartTime !== null) {
    const t = Math.min(1, (performance.now() - cubeParallaxInitRevealStartTime) / CUBE_PARALLAX_INIT_REVEAL_MS);
    const eased = EASE_OUT_CUBIC(t);
    cubeParallaxX = cubeParallaxInitRevealFromX + (cubeParallaxTargetX - cubeParallaxInitRevealFromX) * eased;
    cubeParallaxY = cubeParallaxInitRevealFromY + (cubeParallaxTargetY - cubeParallaxInitRevealFromY) * eased;
    if (t >= 1) cubeParallaxInitRevealStartTime = null;
  } else {
    cubeParallaxX += (cubeParallaxTargetX - cubeParallaxX) * CUBE_PARALLAX_SMOOTHING;
    cubeParallaxY += (cubeParallaxTargetY - cubeParallaxY) * CUBE_PARALLAX_SMOOTHING;
  }
}

// Fires without requiring movement whenever the cursor actually crosses
// into the window around load time, which — unlike the cursor already
// resting inside the viewport through a reload (nothing can detect that
// with zero movement; browsers reset their pointer-tracking state on every
// navigation, specifically so a freshly loaded page can't otherwise infer
// anything about the cursor before the user has interacted with *it* — a
// CSS-:hover-based probe was tried and confirmed unable to get around this,
// verified with Playwright: same technique instantly detects hover via
// page.setContent (no navigation), but never fires at all after a real
// page.goto navigation, even 300ms later, with no post-load pointer event)
// — a browser will often deliver 'pointerenter' within the first frame or
// two, before the intro's own rotation has moved far enough for the snap
// above to be worth avoiding in the first place.
window.addEventListener('pointerenter', updateParallaxTargetFromPointer);

window.addEventListener('pointerup', () => {
  cubeDragging = false;
  if (panDragging) {
    panDragging = false;
    flushPanSync();
  }
  if (zDragging) {
    zDragging = false;
    flushPanSync();
  }
  if (editPanDragging) {
    editPanDragging = false;
    flushPanSync();
  }
  updateCubeCursor();
});

// --- Custom model upload (cube mode's "Use custom model" option) -------
//
// Parses a Blender-exported Wavefront .obj (Export > Wavefront (.obj),
// with "Triangulate Faces" on — n-gons still fan-triangulate fine, but
// tris keep the geometry exact) plus its companion .mtl (Blender writes
// one alongside by default, referenced by the .obj's own `mtllib` line).
// Only positions/normals/material-diffuse-color are used: the shader is
// flat per-vertex diffuse lighting with no texture sampling, so vt (UV)
// lines are read past but never stored. If the file has no vn lines
// (normals not exported), a flat face normal is computed per triangle via
// cross product instead — same visual result for a low-poly/flat-shaded
// model, just without needing the OBJ to supply it.
//
// No index buffer: each face's vertices are pushed straight into the output
// arrays in triangle order, duplicating vertices per-face so every face can
// have its own flat normal, so the model draws with drawArrays rather than
// drawElements.

// Corrective rotation applied to the loaded model — its own axes needed a
// quarter-turn around Y to sit the way we want on screen.
const CUSTOM_MODEL_ROTATE_Y_RAD = -Math.PI / 2;

// Reads a .mtl's `newmtl <name>` / `Kd r g b` pairs into a name -> [r,g,b]
// map. Ka/Ks/textures etc. aren't read — the shader only has room for one
// flat diffuse color per face.
function parseMtl(text) {
  const materials = {};
  let current = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('newmtl ')) {
      current = trimmed.slice(7).trim();
      materials[current] = [1, 1, 1];
    } else if (trimmed.startsWith('Kd ') && current) {
      const parts = trimmed.split(/\s+/);
      materials[current] = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
    }
  }
  return materials;
}

function parseObj(text, materials, baseScaleMultiplier = 1) {
  const positions = [];
  const normals = [];
  const outPositions = [];
  const outNormals = [];
  const outColors = [];
  const outIsGreen = []; // one entry per emitted vertex — blueprint mode's green-fill flag
  const outObjectName = []; // one entry per emitted vertex — the `o`/`g` name active when it was emitted; resolved to an index into `objects` below (see outObjectIndex)
  const outFillPattern = []; // one entry per emitted vertex — 0/1/2/3 fill-pattern id (see materialFillPatternId)
  const outTriVertIdx = []; // one entry per emitted vertex, the original `v` index it came from — used only for crease-edge detection below
  const outTriIsGreen = []; // one entry per emitted triangle — feeds the wireframe's green-edge coloring
  let activeColor = [1, 1, 1]; // no usemtl seen yet (or an unrecognized name) == plain white
  let activeIsGreen = false;
  let activeFillPattern = 0;

  // Per-object (raw, pre-transform) bounding boxes, tracked purely so camera
  // targets (see cameraTargetSlots below) can later be assigned to a named
  // part of the file — unrelated to geometry/material parsing. objectOrder
  // preserves first-appearance order for the panel's object picker.
  //
  // `o` is the authoritative object boundary; `g` is tracked only as a
  // fallback for files with no `o` lines at all. Exporters (Blender
  // included) commonly emit multiple `g` lines *within* a single object —
  // one per material slot it uses — so once any `o` line has been seen,
  // later `g` lines are ignored rather than treated as new objects; otherwise
  // one real object fragments into several wrongly-centered camera targets,
  // sometimes even colliding on the same name.
  let activeObjectName = null;
  let sawObjectLine = false;
  const objectBounds = new Map();
  const objectOrder = [];
  function touchObjectBounds(x, y, z) {
    const name = activeObjectName || 'Object 1';
    let b = objectBounds.get(name);
    if (!b) {
      b = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
      objectBounds.set(name, b);
      objectOrder.push(name);
    }
    if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
    if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
  }

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed[0] === 'v' && trimmed[1] === ' ') {
      const parts = trimmed.split(/\s+/);
      positions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (trimmed.startsWith('vn ')) {
      const parts = trimmed.split(/\s+/);
      normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (trimmed[0] === 'o' && trimmed[1] === ' ') {
      sawObjectLine = true;
      activeObjectName = trimmed.slice(2).trim() || activeObjectName;
    } else if (trimmed[0] === 'g' && trimmed[1] === ' ' && !sawObjectLine) {
      activeObjectName = trimmed.slice(2).trim() || activeObjectName;
    } else if (trimmed.startsWith('usemtl ')) {
      const materialName = trimmed.slice(7).trim();
      activeColor = materials[materialName] || [1, 1, 1];
      activeIsGreen = isGreenDominant(activeColor[0] * 255, activeColor[1] * 255, activeColor[2] * 255);
      activeFillPattern = materialFillPatternId(materialName);
    } else if (trimmed[0] === 'f' && trimmed[1] === ' ') {
      const faceVerts = trimmed.split(/\s+/).slice(1).map((part) => {
        const [vStr, , vnStr] = part.split('/'); // v[/vt][/vn]
        const vRaw = parseInt(vStr, 10);
        const vIdx = vRaw > 0 ? vRaw - 1 : positions.length + vRaw;
        let vnIdx = null;
        if (vnStr) {
          const vnRaw = parseInt(vnStr, 10);
          vnIdx = vnRaw > 0 ? vnRaw - 1 : normals.length + vnRaw;
        }
        return { vIdx, vnIdx };
      });
      // Fan triangulation: works for tris as-is, and for any convex n-gon.
      for (let i = 1; i < faceVerts.length - 1; i++) {
        const tri = [faceVerts[0], faceVerts[i], faceVerts[i + 1]];
        const p = tri.map((t) => positions[t.vIdx]);
        let n = tri.map((t) => (t.vnIdx !== null ? normals[t.vnIdx] : null));
        if (n.some((v) => !v)) {
          const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
          const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const len = Math.hypot(nx, ny, nz) || 1;
          nx /= len; ny /= len; nz /= len;
          n = [[nx, ny, nz], [nx, ny, nz], [nx, ny, nz]];
        }
        outTriIsGreen.push(activeIsGreen);
        for (let k = 0; k < 3; k++) {
          outPositions.push(p[k][0], p[k][1], p[k][2]);
          outNormals.push(n[k][0], n[k][1], n[k][2]);
          outColors.push(activeColor[0], activeColor[1], activeColor[2]);
          outIsGreen.push(activeIsGreen ? 1 : 0);
          outObjectName.push(activeObjectName || 'Object 1');
          outFillPattern.push(activeFillPattern);
          outTriVertIdx.push(tri[k].vIdx);
          touchObjectBounds(p[k][0], p[k][1], p[k][2]);
        }
      }
    }
  }

  if (outPositions.length === 0) return null;

  // Fixed corrective rotation (imported model's own axes don't match the
  // orientation we want on screen) — applied to both positions and normals
  // before centering so the post-rotation bounding box (and thus scale) is
  // computed from the final orientation.
  const ry = CUSTOM_MODEL_ROTATE_Y_RAD;
  if (ry !== 0) {
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    for (let i = 0; i < outPositions.length; i += 3) {
      const x = outPositions[i], z = outPositions[i + 2];
      outPositions[i] = x * cosY + z * sinY;
      outPositions[i + 2] = -x * sinY + z * cosY;
      const nx = outNormals[i], nz = outNormals[i + 2];
      outNormals[i] = nx * cosY + nz * sinY;
      outNormals[i + 2] = -nx * sinY + nz * cosY;
    }
  }

  // Center (X/Z) and floor (Y) the model, then scale to roughly a [-1, 1]
  // envelope, so the same CUBE_SCALE/camera distance frame it similarly
  // regardless of what units the source model was modeled in. Y specifically
  // aligns to the *lowest* point (minY)
  // rather than the bounding box's vertical midpoint like X/Z — Blender's
  // OBJ exporter already converts its Z-up scenes to this format's Y-up, so
  // a model built with its ground plane at Blender height 0 should still
  // have its ground at object-space Y=0 after import, not floating at
  // -extentY/2 with the scene's vertical *center* at 0. Everything derived
  // from cy below (per-object centroids, the wireframe's dedupedTransformed
  // copy) automatically inherits this floor-relative convention too, and
  // it's what the flow-pulse pivot's floor guide (see
  // CUSTOM_MODEL_ROTATE_Y_RAD) assumes Y=0 means.
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < outPositions.length; i += 3) {
    const x = outPositions[i], y = outPositions[i + 1], z = outPositions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cy = minY, cz = (minZ + maxZ) / 2;
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  // 10x the [-1, 1] envelope described above, i.e. the model's intended
  // physical size, independent of CUBE_SCALE (which still applies on top of
  // this). baseScaleMultiplier (default 1, i.e. no-op) lets a specific
  // caller shrink or grow that intended size further — see
  // loadBundledDefaultModel.
  const scale = (2 / extent) * 10 * baseScaleMultiplier;
  for (let i = 0; i < outPositions.length; i += 3) {
    outPositions[i] = (outPositions[i] - cx) * scale;
    outPositions[i + 1] = (outPositions[i + 1] - cy) * scale;
    outPositions[i + 2] = (outPositions[i + 2] - cz) * scale;
  }

  // Per-object camera-target centroids (see cameraTargetSlots), in the same
  // final coordinate space outPositions ends up in — each object's raw
  // bounding-box center run through the identical rotate/center/scale steps
  // above (affine transforms commute with taking a center point, so this is
  // equivalent to transforming all of that object's vertices and re-deriving
  // its bounding box, just without the extra pass).
  //
  // `size` (bounding-box diagonal length) is computed the same way, but
  // needs no rotation step at all: a Y-axis rotation preserves vector
  // lengths, so the pre-rotation diagonal only needs the uniform `scale`
  // applied to land in the final coordinate space. Used by camera-target
  // zoom (see renderCubeFrame) to frame smaller objects closer and larger
  // ones farther back.
  const objects = objectOrder.map((name) => {
    const b = objectBounds.get(name);
    let ox = (b.minX + b.maxX) / 2, oy = (b.minY + b.maxY) / 2, oz = (b.minZ + b.maxZ) / 2;
    if (ry !== 0) {
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const rotX = ox * cosY + oz * sinY;
      const rotZ = -ox * sinY + oz * cosY;
      ox = rotX; oz = rotZ;
    }
    const size = Math.hypot(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) * scale;
    // Rotation-aware axis-aligned bounding box, in the same final coordinate
    // space as `center` above — feeds the camera-target bounding-box overlay
    // (see showCameraTargetBoxes). Re-derived from all 4 raw X/Z corners
    // (Y is untouched by a Y-axis rotation) rather than just rotating
    // min/max, since rotating an AABB's corners individually and re-taking
    // their min/max is the only way to get a true AABB in the rotated frame.
    let bMinX = Infinity, bMaxX = -Infinity, bMinZ = Infinity, bMaxZ = -Infinity;
    for (const rawX of [b.minX, b.maxX]) {
      for (const rawZ of [b.minZ, b.maxZ]) {
        let rx8 = rawX, rz8 = rawZ;
        if (ry !== 0) {
          const cosY = Math.cos(ry), sinY = Math.sin(ry);
          rx8 = rawX * cosY + rawZ * sinY;
          rz8 = -rawX * sinY + rawZ * cosY;
        }
        if (rx8 < bMinX) bMinX = rx8; if (rx8 > bMaxX) bMaxX = rx8;
        if (rz8 < bMinZ) bMinZ = rz8; if (rz8 > bMaxZ) bMaxZ = rz8;
      }
    }
    const bounds = {
      minX: (bMinX - cx) * scale, maxX: (bMaxX - cx) * scale,
      minY: (b.minY - cy) * scale, maxY: (b.maxY - cy) * scale,
      minZ: (bMinZ - cz) * scale, maxZ: (bMaxZ - cz) * scale,
    };
    return { name, center: [(ox - cx) * scale, (oy - cy) * scale, (oz - cz) * scale], size, bounds };
  });

  // Per-vertex index into `objects` above — lets flow arrows (see
  // recomputeModelFlowCoords/setFlowArrowObjectEnabled) tell which named
  // object a given green vertex belongs to, so one arrow drawn across
  // several objects can have its pulse restricted to just some of them.
  const objectIndexByName = new Map(objectOrder.map((name, i) => [name, i]));
  const outObjectIndex = outObjectName.map((name) => objectIndexByName.get(name));

  // Blueprint-mode wireframe: crease/boundary edges only (see
  // buildCreaseEdgeLines) — a literal every-edge wireframe on a mesh this
  // dense would overflow a 16-bit index buffer and render as solid haze.
  // buildCreaseEdgeLines needs a position array indexed by the same vIdx
  // values outTriVertIdx uses — that's the deduped `positions` list (one
  // entry per `v` line), NOT outPositions (which is duplicated per-triangle
  // and therefore indexed differently) — so rebuild a transformed copy of
  // `positions` here, applying the identical rotate/center/scale steps
  // above (same cx/cy/cz/scale/ry, since triangulating doesn't change the
  // bounding box) rather than transforming outPositions a second time.
  const dedupedTransformed = new Float32Array(positions.length * 3);
  for (let i = 0; i < positions.length; i++) {
    let [x, y, z] = positions[i];
    if (ry !== 0) {
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const rx = x * cosY + z * sinY;
      const rz = -x * sinY + z * cosY;
      x = rx; z = rz;
    }
    dedupedTransformed[i * 3] = (x - cx) * scale;
    dedupedTransformed[i * 3 + 1] = (y - cy) * scale;
    dedupedTransformed[i * 3 + 2] = (z - cz) * scale;
  }
  const lineData = buildCreaseEdgeLines(dedupedTransformed, new Uint32Array(outTriVertIdx), outTriIsGreen);

  return {
    positions: new Float32Array(outPositions),
    normals: new Float32Array(outNormals),
    colors: new Float32Array(outColors),
    isGreen: new Float32Array(outIsGreen),
    objectIndex: new Float32Array(outObjectIndex),
    fillPattern: new Float32Array(outFillPattern),
    linePositions: lineData.positions,
    lineColors: lineData.colors,
    lineIsGreen: lineData.isGreen,
    hasMaterials: Object.keys(materials).length > 0,
    objects,
  };
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const customModelPositionBuffer = gl.createBuffer();
const customModelNormalBuffer = gl.createBuffer();
const customModelColorBuffer = gl.createBuffer();
const customModelIsGreenBuffer = gl.createBuffer();
const customModelFillPatternBuffer = gl.createBuffer();
const customModelFlowCoordBuffer = gl.createBuffer();
const customModelFlowPathLenBuffer = gl.createBuffer();
const customModelLineBuffer = gl.createBuffer();
const customModelLineColorBuffer = gl.createBuffer();
let customModelVertexCount = 0;
let customModelLineVertexCount = 0;
let customModelReady = false;
let cubeModelStatus = ''; // status text shown next to the file picker

const modelStateListeners = [];

// Camera targets: up to 3 named sub-objects from the loaded .obj (see
// `objects` in parseObj's return value) that the "Go to Object N" panel
// buttons ease the framing toward. cameraTargetSlots holds which object name
// (or null) is assigned to each of the 3 slots; cameraTargetActiveIndex is
// which slot is currently driving the camera, or null to fall back to the
// manual pan sliders as before. cameraTargetCurrent is the spring-driven
// position that chases whichever slot is active (renderCubeFrame, each
// frame) — this is the "null object" the camera stays rigidly offset from:
// rotation (drag + hover) and distance never change when it moves.
let customModelObjects = []; // [{name, center:[x,y,z], size:number, bounds:{minX,maxX,minY,maxY,minZ,maxZ}}], from parseObj
/** @type {(string | null)[]} */
let cameraTargetSlots = [null, null, null];
let cameraTargetActiveIndex = null;
let cameraTargetCurrent = [0, 0, 0];

// A 4th, freeform baked-in camera pan+zoom alongside the 3 named Camera
// Targets above — captures modelOffsetXPercent/Y/Z (the manual pan) and
// cubeSizePercent (zoom) only, deliberately never rotation: "going to
// default" always leaves rotation exactly where it already is, same as
// going to a Camera Target (see goToCameraTarget's own comment on that).
// Set via "edit default position" mode (see editingDefaultView below) —
// unlike a Camera Target's auto-framing, there's no target object to frame
// here, so the only way to define this one is to let the user manually park
// the free camera wherever they want and capture that directly. Starts at
// BAKED_DEFAULT_CAMERA_VIEW (below) and, like cameraTargetActiveIndex,
// deliberately session-only from there — re-editing it via "Edit default
// position" updates this in memory for the rest of the session but is never
// persisted, so a reload always lands back on the baked-in value rather than
// whatever was last edited.
let defaultCameraView = null; // { offsetX, offsetY, offsetZ, sizePercent } | null

// Ships with the app so a fresh load lands on a deliberately composed
// default view instead of the plain centered/100% whole-scene one — same
// "hand-set once, then baked into source" idea as DEFAULT_MODEL_FLOW_PATH_DATA
// above, captured via `copy(localStorage.getItem('iconMosaic.defaultCameraView'))`
// in the console after using "Edit default position" back when this was
// still localStorage-persisted.
const BAKED_DEFAULT_CAMERA_VIEW = { offsetX: -5.17360464543138, offsetY: 0, offsetZ: 20.631551421416827, sizePercent: 17.345816691087055 };

// Applies a saved view's pan+zoom (never rotation — see the comment above
// defaultCameraView's declaration). Shared by goToDefaultCameraView,
// setEditingDefaultView (jumping to the existing default on entering edit
// mode), and loadBundledDefaultModel.
function applyDefaultCameraViewPanZoom(view) {
  setCubeSizePercent(view.sizePercent);
  modelOffsetXPercent = view.offsetX;
  modelOffsetYPercent = view.offsetY;
  modelOffsetZPercent = view.offsetZ;
  notifyModelState();
}

// Instantly settles the camera-target spring at its rest state (centered,
// 1x zoom, zero velocity) instead of letting it decay there over the next
// several frames as it normally would (see renderCubeFrame's stepSpring
// calls). cameraTargetZoomCurrent is multiplied into the final scale
// unconditionally (see `s` in renderCubeFrame), not just while a target is
// active, so without this a target's leftover fit-zoom would still be
// fading back toward 1x for a beat after the default view's own zoom is
// set, producing a brief double-zoom instead of a clean cut straight to
// it. Also needed for pan now that the default view sets that too (see
// applyDefaultCameraViewPanZoom) — getObjectSpacePan suppresses manual pan
// entirely until the spring reports at-rest, so without this the new pan
// wouldn't actually show up on screen until the leftover spring finished
// decaying on its own, same class of bug goToCameraTarget's own seeding
// fixes for the reverse direction.
function settleCameraTargetSpring() {
  cameraTargetCurrent = [0, 0, 0];
  cameraTargetZoomCurrent = 1;
  cameraTargetVelocity = [0, 0, 0];
  cameraTargetZoomVelocity = 0;
  cameraTargetSpringLastTime = null;
  cameraTargetAtRest = true;
}

// Drops any active camera target (which would otherwise keep overriding
// centering/zoom every frame) and jumps to the saved default pan/zoom — a
// no-op if none has ever been saved. Bound to the "Go" button and the 0 key
// (see the Digit0 keydown handler above) — disabled/ignored while
// editingDefaultView is active (see setEditingDefaultView) since jumping
// mid-edit would just discard whatever pan/zoom is being worked out back to
// the last saved value.
function goToDefaultCameraView() {
  if (!defaultCameraView || editingDefaultView) return;
  if (cameraTargetActiveIndex !== null) resetCameraTarget();
  settleCameraTargetSpring();
  applyDefaultCameraViewPanZoom(defaultCameraView);
}

function setEditingDefaultView(enabled) {
  enabled = !!enabled;
  if (enabled === editingDefaultView) return;
  editingDefaultView = enabled;
  if (!cubeDragging && !editPanDragging) updateCubeCursor();
  if (enabled) {
    // Start from the existing default (if any) rather than wherever the
    // camera happens to already be, so this refines it in place instead of
    // setting a brand new value from an arbitrary starting point.
    if (cameraTargetActiveIndex !== null) resetCameraTarget();
    settleCameraTargetSpring();
    if (defaultCameraView) applyDefaultCameraViewPanZoom(defaultCameraView);
  } else {
    defaultCameraView = {
      offsetX: modelOffsetXPercent,
      offsetY: modelOffsetYPercent,
      offsetZ: modelOffsetZPercent,
      sizePercent: cubeSizePercent,
    };
  }
  notifyModelState();
}

// Master visibility switch for the light-blue bounding-box overlay drawn
// around every object currently assigned to a camera-target slot (see
// CAMERA_TARGET_BOX_* below and its draw call in renderCubeFrame) —
// independent of blueprint mode and of which slot (if any) is actively
// driving the camera, so it's useful purely for checking which objects are
// wired up as targets.
let showCameraTargetBoxes = false;
// Extra scale multiplier applied on top of cubeSizeScale while a camera
// target is active (see renderCubeFrame) — springs to 1x whenever no target
// is active, and to an exact "frame to fit" goal otherwise (see
// CAMERA_TARGET_VERTICAL_SAFE_ZONE), on the same spring as
// cameraTargetCurrent so zoom and pan move together.
let cameraTargetZoomCurrent = 1;
// Damped-spring simulation driving cameraTargetCurrent/cameraTargetZoomCurrent
// toward whatever the active target's goal position/zoom is this frame (see
// renderCubeFrame) — a real position+velocity integration (semi-implicit
// Euler) rather than a fixed-duration tween, so the goal can keep moving
// (switching targets mid-flight, a resize changing the frame-to-fit zoom)
// without a visible restart: the spring just keeps pulling from wherever it
// currently is, carrying its existing velocity. cameraTargetVelocity/
// cameraTargetZoomVelocity are the per-axis object-space velocities;
// cameraTargetSpringLastTime is the performance.now() of the previous
// step, used to compute dt (null right after a reset, so the first step
// after that doesn't take a giant dt).
let cameraTargetVelocity = [0, 0, 0];
let cameraTargetZoomVelocity = 0;
let cameraTargetSpringLastTime = null;
// Whether the spring is currently close enough to rest (position, zoom, AND
// velocity all near their at-rest goal) that it's safe to hand screen
// centering back to the manual pan sliders — see getObjectSpacePan, which
// needs a real "settled" signal instead of a tween-end event now that the
// spring has no fixed end time.
let cameraTargetAtRest = true;
// Stiffness (pull toward the goal) and damping (velocity drag) of the
// spring, in the standard critically-damped-at
// `damping = 2 * sqrt(stiffness)` parameterization — 2*sqrt(15) ≈ 7.75, so
// damping: 9 sits slightly past critical (ratio ~1.16): a slow, deliberate
// arrival with no overshoot/bounce, rather than the snappier springy feel
// of an underdamped ratio (< 1). Lower stiffness for an even slower move
// (keep damping ≈ 1.16 * 2 * sqrt(stiffness) to hold the same ratio and
// stay overshoot-free); raise damping alone for a more sluggish, "through
// honey" settle at the same speed.
const CAMERA_TARGET_SPRING_STIFFNESS = 15;
const CAMERA_TARGET_SPRING_DAMPING = 9;
// Zoom's own, softer spring (same ~1.16 damping ratio as position's, just
// lower stiffness) — position and zoom used to share the position spring
// above outright, but the targets in this scene sit far apart in
// object-space while zoom's goal is usually a much smaller relative change,
// so with identical time-constants zoom visibly finished while position
// still had real distance left to cover. Slowing zoom down instead of
// speeding position up keeps position's existing pacing untouched.
const CAMERA_TARGET_ZOOM_SPRING_STIFFNESS = 4;
const CAMERA_TARGET_ZOOM_SPRING_DAMPING = 4.65; // 1.1619 * 2*sqrt(4), same ratio as CAMERA_TARGET_SPRING_DAMPING/STIFFNESS
// Clamps the per-step dt fed into the spring integration (seconds) — caps
// how far a single step can move after e.g. a backgrounded-tab stall, so
// the simulation can't blow up from an enormous one-off dt.
const CAMERA_TARGET_SPRING_MAX_DT = 0.05;
// Below these position/velocity/zoom thresholds the spring is considered
// settled (see cameraTargetAtRest) — object-space units are on the same
// ~20-unit whole-model scale as parseObj's normalization, so 0.01 is
// visually imperceptible.
const CAMERA_TARGET_SPRING_REST_EPSILON = 0.01;
// Fraction of the viewport height left empty above AND below a framed
// camera target (so the object itself occupies the middle 1 - 2 * this
// fraction of the screen) — see renderCubeFrame's zoomGoal calculation,
// which projects the target's own rotated bounding box through the
// current rx/ry and solves for the scale that hits this fill exactly.
// Recomputed every frame, so the object stays framed to this fraction
// continuously as it's rotated, unlike a fixed reference-size heuristic.
const CAMERA_TARGET_VERTICAL_SAFE_ZONE = 0.25;
const CAMERA_TARGET_ZOOM_MIN = 0.01;
const CAMERA_TARGET_ZOOM_MAX = 5;

function getModelState() {
  return {
    spaceHeld,
    photoMode,
    rotationDisabled,
    // Included so schedulePanSync/flushPanSync's notifyModelState() (fired
    // continuously while Space-dragging) keeps the "Model X/Y position"
    // sliders live-in-sync with the drag, not just on the next full reload
    // (getInitialState reads these too, but that's only read once on mount).
    modelOffsetX: modelOffsetXPercent,
    modelOffsetY: modelOffsetYPercent,
    customModelReady,
    cubeModelStatus,
    customModelObjectNames: customModelObjects.map((o) => o.name),
    cameraTargetSlots,
    cameraTargetActiveIndex,
    showCameraTargetBoxes,
    hasDefaultCameraView: !!defaultCameraView,
    editingDefaultView,
    modelFlowArrowCount: modelFlowPaths.length,
    selectedFlowArrowIndex,
    modelFlowDrawMode,
    modelFlowSelectMode,
    // Included (not just in getInitialState) so entering draw mode — which
    // force-enables this (see setModelFlowDraw) — keeps the panel's "Show
    // flow arrows" switch in sync even when toggled via the A-key shortcut
    // rather than the panel's own button.
    showModelFlowArrow,
    // Per-object pulse toggles for whichever arrow is selected — one entry
    // per object that arrow's drag actually touched, [] if nothing's
    // selected or the selected arrow only ever touched one object (nothing
    // to choose between).
    selectedFlowArrowObjects: (() => {
      const path = selectedFlowArrowIndex !== null ? modelFlowPaths[selectedFlowArrowIndex] : null;
      if (!path || path.touchedObjectIndices.length <= 1) return [];
      return path.touchedObjectIndices.map((idx) => ({
        index: idx,
        name: customModelObjects[idx]?.name ?? `Object ${idx + 1}`,
        enabled: path.enabledObjectIndices.includes(idx),
      }));
    })(),
    // Drives the "Reverse flow" button's active/inactive look (see
    // reverseSelectedFlowArrow) — false whenever nothing's selected.
    selectedFlowArrowReversed: !!(selectedFlowArrowIndex !== null && modelFlowPaths[selectedFlowArrowIndex]?.reversed),
  };
}

function setCameraTargetSlot(slotIndex, objectName) {
  cameraTargetSlots = cameraTargetSlots.map((v, i) => (i === slotIndex ? objectName || null : v));
  if (cameraTargetActiveIndex === slotIndex && !objectName) {
    cameraTargetActiveIndex = null;
  }
  notifyModelState();
}

function goToCameraTarget(slotIndex) {
  if (!cameraTargetSlots[slotIndex]) return;
  // Coming from manual-pan mode (no target active — e.g. the default view):
  // seed the spring at the object-space point the manual pan is currently
  // centering on screen (same formula as pivotObj in renderCubeFrame),
  // rather than leaving it wherever it was last settled to rest (usually
  // [0,0,0]). Otherwise the manual pan — suppressed the instant a target
  // activates, see getObjectSpacePan — vanishes in a single frame while the
  // spring separately eases from the wrong starting point, which reads as
  // an instant jump with no transition at all. Switching directly between
  // two already-active targets skips this: cameraTargetCurrent already
  // holds the live in-flight position, which is the correct start as-is.
  if (cameraTargetActiveIndex === null) {
    const [panX, panY, panZ] = getObjectSpacePan();
    // Must match the actual render scale `s` (see pivotObj/getCurrentCameraOffset
    // in renderCubeFrame) exactly, not just cubeSizeScale — CUBE_SCALE is a
    // ~0.033 base multiplier baked into every object-space distance, so
    // omitting it here understated the seed by ~30x, which rendered as a
    // wrong-magnitude jump on the very first camera-target frame before the
    // spring corrected course. cameraTargetZoomCurrent is 1 at this point
    // (we're coming from rest in manual-pan mode), included anyway to stay
    // exactly in sync with `s` if that ever weren't the case.
    const s = CUBE_SCALE * cubeSizeScale * cameraTargetZoomCurrent;
    cameraTargetCurrent = s > 0 ? [-panX / s, -panY / s, -panZ / s] : [0, 0, 0];
    cameraTargetVelocity = [0, 0, 0];
    cameraTargetSpringLastTime = null;
  }
  cameraTargetActiveIndex = slotIndex;
  notifyModelState();
}

// Drops back to the manual pan sliders (getModelViewOffset) instead of a
// camera target driving the offset — see getCurrentCameraOffset.
function resetCameraTarget() {
  cameraTargetActiveIndex = null;
  notifyModelState();
}

function setShowCameraTargetBoxes(enabled) {
  showCameraTargetBoxes = !!enabled;
  notifyModelState();
}

function notifyModelState() {
  const state = getModelState();
  modelStateListeners.forEach((listener) => listener(state));
}

// JS-side copies kept around (not just uploaded to the GPU) so the flow
// arrow-drawing tool can raycast against the green triangles and recompute
// each vertex's arc-length-along-the-drawn-path coordinate whenever the
// arrow changes — see raycastGreenMesh/recomputeModelFlowCoords below.
let customModelPositionsCache = null;
let customModelIsGreenCache = null;
let customModelObjectIndexCache = null; // one entry per vertex — see parseObj's outObjectIndex
let customModelLinePositionsCache = null;
let customModelLineIsGreenCache = null; // one entry per line-position pair — see buildLineColors
let greenTriPositionsCache = null; // Float32Array, only the triangles flagged green, for cheap raycasting
let greenTriObjectIndexCache = null; // one entry per green triangle, parallel to greenTriPositionsCache — which object each hit belongs to

// Uploads an already-parsed model (see parseObj) to the custom-model GPU
// buffers and flips customModelReady on so renderCubeFrame starts drawing
// it. Shared by the file picker and drag-and-drop paths (see
// loadModelFromFiles below).
function applyParsedModel(parsed, objName, mtlName, defaultCameraTargets = [null, null, null]) {
  if (!parsed) {
    customModelReady = false;
    cubeModelStatus = `Couldn't find any faces in ${objName}`;
    notifyModelState();
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelNormalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.normals, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.colors, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelIsGreenBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.isGreen, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelFillPatternBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.fillPattern, gl.STATIC_DRAW);
  customModelVertexCount = parsed.positions.length / 3;

  gl.bindBuffer(gl.ARRAY_BUFFER, customModelLineBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.linePositions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelLineColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.lineColors, gl.STATIC_DRAW);
  customModelLineVertexCount = parsed.linePositions.length / 3;

  customModelPositionsCache = parsed.positions;
  customModelIsGreenCache = parsed.isGreen;
  customModelObjectIndexCache = parsed.objectIndex;
  customModelLinePositionsCache = parsed.linePositions;
  customModelLineIsGreenCache = parsed.lineIsGreen;

  // A newly loaded model's object names/centroids have nothing to do with
  // whatever the previous model's camera-target assignments pointed at —
  // defaultCameraTargets (only ever passed by loadBundledDefaultModel, since
  // it's the only caller that knows its model's object names up front) seeds
  // fresh slots instead of leaving them empty.
  customModelObjects = parsed.objects;
  cameraTargetSlots = [...defaultCameraTargets];
  cameraTargetActiveIndex = null;
  cameraTargetCurrent = [0, 0, 0];
  cameraTargetZoomCurrent = 1;
  // Zero out the spring so renderCubeFrame doesn't carry the old model's
  // velocity into a move toward the new model's origin next frame.
  cameraTargetVelocity = [0, 0, 0];
  cameraTargetZoomVelocity = 0;
  cameraTargetSpringLastTime = null;
  cameraTargetAtRest = true;

  const greenTris = [];
  const greenTriObjectIndex = [];
  for (let i = 0; i < parsed.isGreen.length; i += 3) {
    if (parsed.isGreen[i]) {
      const o = i * 3;
      for (let k = 0; k < 9; k++) greenTris.push(parsed.positions[o + k]);
      greenTriObjectIndex.push(parsed.objectIndex[i]);
    }
  }
  greenTriPositionsCache = new Float32Array(greenTris);
  greenTriObjectIndexCache = greenTriObjectIndex;

  // Any existing arrow's coordinates belonged to the *previous* model and no
  // longer mean anything — callers decide whether to drop it (a genuinely
  // different upload) or try to restore a persisted one (the routine
  // bundled-model auto-load); see the two applyParsedModel call sites below,
  // which call clearModelFlowPath() or restoreModelFlowPath() accordingly.

  customModelReady = true;
  setCubeSizePercent(100); // a freshly loaded model starts at the default size, not whatever the slider was left at
  const triCount = customModelVertexCount / 3;
  cubeModelStatus = parsed.hasMaterials
    ? `${objName} (${triCount} tris, colors from ${mtlName})`
    : `${objName} (${triCount} tris, no materials found)`;
  notifyModelState();
}

// Shared by the file-picker input and drag-and-drop below: given a loose
// list of Files (as either produces), finds the .obj and its .mtl sidecar,
// parses, and uploads, replacing whatever model (bundled default or a
// previous upload) was showing. Only ever runs in response to the user
// explicitly picking or dropping files.
async function loadModelFromFiles(files) {
  const objFile = files.find((f) => /\.obj$/i.test(f.name));
  if (!objFile) return;
  // Blender's .obj references its sidecar via `mtllib <name>.mtl` — if
  // multiple other files were provided, prefer the one matching that name;
  // with only one other file provided, just assume that's the intended .mtl.
  const mtlCandidates = files.filter((f) => /\.mtl$/i.test(f.name));

  let materials = {};
  try {
    const objText = await readFileText(objFile);
    const mtllibMatch = objText.match(/^mtllib\s+(.+)$/m);
    const mtlFile = mtllibMatch
      ? mtlCandidates.find((f) => f.name === mtllibMatch[1].trim()) || mtlCandidates[0]
      : mtlCandidates[0];
    if (mtlFile) materials = parseMtl(await readFileText(mtlFile));

    const parsed = parseObj(objText, materials);
    applyParsedModel(parsed, objFile.name, mtlFile && mtlFile.name);
    clearModelFlowPath(); // a newly loaded model invalidates any previously drawn arrow
  } catch (err) {
    console.error(err);
    cubeModelStatus = `Couldn't read ${objFile.name}`;
    notifyModelState();
  }
}

// Duration of the opening bird's-eye -> resting-rotation tween below — much
// slower than CUBE_ROT_RESET_MS's snappy 180ms since this is a deliberate
// one-time cinematic drop into place on load, not a quick UI-driven reset.
const MODEL_LOAD_ROTATION_INTRO_MS = 3000;

// Bundled default model (public/models/), shown on startup — same
// parse/apply path as a manual upload, just fetched from a static asset
// instead of picked/dropped by the user.
async function loadBundledDefaultModel() {
  try {
    const [objText, mtlText] = await Promise.all([
      fetch('/models/ngen_assets.obj').then((r) => r.text()),
      fetch('/models/ngen_assets.mtl').then((r) => r.text()),
    ]);
    const materials = parseMtl(mtlText);
    // On top of parseObj's usual extent normalization — 8x, independent of
    // the "Model size" slider, which still starts at its usual 100%.
    const parsed = parseObj(objText, materials, 8);
    // The file's three top-level scene groups, one per Camera Target slot —
    // jumping between them is how the user navigates the bundle's separate
    // scenes rather than a single shared layout.
    applyParsedModel(parsed, 'ngen_assets.obj', 'ngen_assets.mtl', [
      '1-For_Home',
      '2-For_Business',
      '3-For_Investors',
    ]);
    // Always lands on BAKED_DEFAULT_CAMERA_VIEW rather than whichever Camera
    // Target the user had active last session — both that and
    // defaultCameraView's own in-session edits are deliberately session-only
    // (see their declarations), always starting fresh at the baked-in
    // default view on load instead of persisting across a reload.
    // cameraTargetCurrent starts at [0,0,0] regardless, so the spring would
    // ease into a target's centroid/zoom from center on load rather than
    // snapping there, if one ever were active this early.
    //
    // Pan/zoom is applied instantly, same as before; rotation always eases
    // to the same fixed CUBE_ISO_PITCH/YAW baseline (defaultCameraView never
    // carries rotation — see its own declaration comment; Camera Targets
    // never did either), as a single bird's-eye -> resting-rotation tween —
    // cubeRotX/Y start pinned to the bird's-eye pose (see their declaration)
    // for exactly this: so the model's first look, once it's actually
    // loaded, is dropping down into place rather than just appearing already
    // framed.
    defaultCameraView = BAKED_DEFAULT_CAMERA_VIEW;
    applyDefaultCameraViewPanZoom(defaultCameraView);
    // suppressParallax: false — keep ambient hover tilt live through the
    // whole drop instead of freezing it (see cubeRotResetSuppressParallax).
    tweenCubeRotationTo(CUBE_ISO_PITCH, CUBE_ISO_YAW, MODEL_LOAD_ROTATION_INTRO_MS, false, EASE_INTRO_BEZIER);
    if (!restoreModelFlowPath()) applyDefaultModelFlowPath();
  } catch (err) {
    console.error(err);
  }
}

// Drag-and-drop a .obj (+ optional .mtl) anywhere on the page as an
// alternative to the file picker — same loadModelFromFiles path either way.
window.addEventListener('dragover', (event) => {
  event.preventDefault();
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length) loadModelFromFiles(files);
});

// --- 3D flow arrows: draw one or more paths on the model's green parts, pulse follows each ---
//
// A Gaussian glow band travels along each user-drawn path, looping over
// FLOW_PULSE_PERIOD_BASE_MS (scaled by the user-adjustable flowSpeedPercent)
// in sync across all of them. Each "path" is drawn
// directly on the model's surface (via raycasting into the green triangles
// under the cursor), and each vertex's position along its nearest path is
// computed once (in object space) rather than per-frame. Supports any number
// of arrows — e.g. separate branches of a green run that don't share a
// single line — by giving every green vertex a flow coordinate normalized to
// *its own nearest arrow's* length (0-1) rather than an absolute arc length,
// so one shared pulse phase/width animates every arrow in sync regardless of
// how many there are or how long each one is (see recomputeModelFlowCoords).

const MODEL_FLOW_STORAGE_KEY = 'iconMosaic.modelFlowPath';
// Baked-in starter arrows for the bundled default model (see
// loadBundledDefaultModel/applyDefaultModelFlowPath below) — when non-empty,
// captured from a hand-drawn path (via
// `copy(localStorage.getItem('iconMosaic.modelFlowPath'))` in the console)
// so a fresh browser with nothing in localStorage yet still gets a pulsing
// flow instead of an empty green mesh. Same shape saveModelFlowPath persists
// to localStorage (points/touchedObjectIndices/enabledObjectIndices/
// sourceOffset/masterTotalLen — the latter two carry over branch/junction
// timing, see buildModelFlowPathsFromData), just applied unconditionally on
// startup instead. Specific to the bundled model's geometry/scale — re-capture
// and replace if the model ever changes again.
const DEFAULT_MODEL_FLOW_PATH_DATA = [{"points":[[-33.67333602905275,0.6334688513144009,-5.099300492059335],[-33.673336029052734,0.6339370829337714,-5.179315505773158],[-33.673336029052734,0.10385314082481045,-5.178646390804898],[-34.33642197886703,0.09333333373069763,-5.17300515430707],[-34.336034799862055,0.09333333373069763,-6.6424453440926]],"touchedObjectIndices":[500],"enabledObjectIndices":[500],"sourceOffset":0,"masterTotalLen":2.742734374529774},{"points":[[-34.833863038597045,0.09333333373069763,-4.990590645997877],[-33.68693837931779,0.09333333373069763,-4.9914932159016985],[-33.67333602905275,0.4826526655058707,-4.993658371678258]],"touchedObjectIndices":[469],"enabledObjectIndices":[469],"sourceOffset":0,"masterTotalLen":1.536487915533214},{"points":[[-33.78354617495815,0.2800000011920787,-4.123070418601841],[-33.67767859420686,0.2800000011920787,-4.124411198391016],[-33.67333602905274,0.6302302259155255,-4.124307431025137],[-33.67333602905274,0.6295758712951454,-4.878244125480762]],"touchedObjectIndices":[452],"enabledObjectIndices":[452],"sourceOffset":0,"masterTotalLen":1.2100702102757512},{"points":[[-33.32420476002098,1.2577114491708272,-5.285326013957132],[-33.32296006593586,1.2583338584281734,-4.995782500557958],[-33.657797496354306,1.090916293413585,-4.994099790208907],[-33.669162634621344,1.0733935068405174,-4.986517049287329],[-33.67333221435546,0.7885513701981637,-4.994376147461708]],"touchedObjectIndices":[455],"enabledObjectIndices":[455],"sourceOffset":0,"masterTotalLen":0.9711104332982854}];
const MODEL_FLOW_PULSE_BAND_FRACTION = 0.15; // sigma as a fraction of each path's own normalized (0-1) length
// Fixed reference length (world units) the tail's reach is computed against
// instead of each arrow's own masterTotalLen, so the "Tail length" slider
// produces the same absolute tail distance on every arrow regardless of how
// long that specific arrow is drawn. Chosen to roughly match the previous
// look on a mid-length arrow; tune directly if tails read too long/short.
const MODEL_FLOW_TAIL_REFERENCE_LENGTH = 3;
// Sentinel aFlowCoord for a green vertex no arrow reaches (no path enables
// its object) — any negative value works since real arc-length fractions
// are always in [0, 1]; the fragment shader's `vFlowCoord >= 0.0` check is
// what actually keeps these vertices dark, this just has to stay negative.
const MODEL_FLOW_NO_ARROW_COORD = -1;
const MODEL_FLOW_ARROW_COLOR = [0.2, 0.45, 0.95]; // blue guide line for finalized, unselected arrows
const MODEL_FLOW_ARROW_SELECTED_COLOR = [1, 0.55, 0.1]; // orange highlight for the currently selected arrow/branch — distinct from the plain finished-arrow blue above
const MODEL_FLOW_ARROW_DRAG_COLOR = [1, 0, 0]; // red for the not-yet-finalized in-progress drag — turns blue once double-clicked to confirm
const MODEL_FLOW_ARROW_HALF_WIDTH_PX = 3; // half-width of the ribbon built in buildArrowRibbonNDC below
const MODEL_FLOW_ARROW_OPACITY = 0.75; // applied to all three ribbon batches (finalized/selected/in-progress) via uLineAlpha
// Rubber-band cursor preview (see modelFlowHoverClientPos): a dashed line
// from the last placed point out to wherever the cursor currently raycasts,
// previewing the segment a click would add before it's actually placed.
// Same red as the in-progress drag ribbon, dashed instead of solid so it
// reads as "not yet real" even at a glance.
const MODEL_FLOW_HOVER_LINE_HALF_WIDTH_PX = MODEL_FLOW_ARROW_HALF_WIDTH_PX * 0.75;
const MODEL_FLOW_HOVER_DASH_LENGTH_PX = 8;
const MODEL_FLOW_HOVER_DASH_GAP_PX = 6;
// Furthest an object-space click can land from an arrow's polyline and still
// count as selecting it (see nearestPointOnPath3D) — beyond this, a click in
// select mode is treated as clicking empty space and clears the selection.
const MODEL_FLOW_SELECT_MAX_DIST = 0.2;
// Furthest a pointerdown->pointerup pair can drift (screen pixels) and still
// count as a click rather than a drag, while in select mode.
const MODEL_FLOW_SELECT_CLICK_MAX_DRIFT_PX = 6;
// Draw mode drops one arrow point per click, chaining point 1 -> point 2 ->
// point 3 etc.; a double-click (two clicks landing within this many ms, this
// close together on screen) finalizes the arrow at whatever point the first
// of that pair already added, rather than starting yet another segment.
const MODEL_FLOW_DRAW_DOUBLE_CLICK_MAX_MS = 400;
const MODEL_FLOW_DRAW_DOUBLE_CLICK_MAX_DRIFT_PX = 6;
// The traveling glow pulse loops over this period (scaled by the
// user-adjustable flowSpeedPercent — see setFlowSpeedPercent) and pads this
// many (base) sigmas past each end of the path, so it fades in/out via the
// comet's tail falloff instead of popping straight from invisible to full
// brightness at the loop. Sized with enough margin past the tail's own sigma
// (see FLOW_COMET_TAIL_SIGMA_MULT in the fragment shader) that its falloff
// is fully negligible by the time the pulse wraps — re-tune this alongside
// that constant, since a shorter/steeper tail needs proportionally less pad,
// and too little pad here pops visibly at the loop.
const FLOW_PULSE_PERIOD_BASE_MS = 3000;
const FLOW_PULSE_PAD_SIGMAS = 13;

let modelFlowDrawMode = false;
// cubeSizePercent at the moment draw mode was entered (see setModelFlowDraw)
// — while set, renderCubeFrame's camera-target "frame to fit" zoom goal uses
// this frozen value instead of the live cubeSizeScale, so scroll-to-zoom
// (which otherwise only feeds cubeSizeScale, exactly the term the frame-to-
// fit goal is built to cancel out — see zoomGoal's denominator) actually
// changes the on-screen size while tracing an arrow, instead of the spring
// yanking it straight back to the target's fitted framing every frame. Reset
// to null (and cubeSizePercent restored to this value) on leaving draw mode.
let drawModeZoomBaselinePercent = null;
let modelFlowSelectMode = false;
// While actively building one new (possibly multi-branch) arrow
// click-by-click, object-space: { points, pointObjectIndices, touchedObjects,
// startingJunction, completedBranches, pendingJunctions } — see
// finalizeModelFlowDrag/the draw-mode pointerdown handler for the
// shift+click-junction state machine.
let modelFlowDrag = null;
let modelFlowLastClickTime = null; // performance.now() of the last point-dropping click, for double-click-to-finish detection
let modelFlowLastClickPos = null; // { x, y } clientX/Y of that same click
// [{ points: [[x,y,z], ...], cumLen: number[], totalLen, sourceOffset,
// masterTotalLen }, ...] one entry per finalized branch (a single-branch
// arrow is just one entry; a branching one is several, sharing a junction
// point — see sourceOffset/masterTotalLen in finalizeModelFlowDrag).
let modelFlowPaths = [];
let selectedFlowArrowIndex = null; // index into modelFlowPaths, or null if nothing selected
let modelFlowSelectDownPos = null; // { x, y } clientX/Y at pointerdown, while in select mode — distinguishes a click from a drag
let showModelFlowArrow = false;
// Independent of showModelFlowArrow — lets the click-point/junction dots
// (see the draw-mode render block) be hidden on their own while the
// in-progress drag ribbon stays visible, or vice versa.
let showModelFlowPoints = true;
const modelFlowOverlayBuffer = gl.createBuffer(); // small, rebuilt-on-demand buffer for drawing the arrow guide ribbon

// Pivot indicator: a small yellow orb marking exactly what point drag/hover
// rotation and the "Model size" zoom pivot around (see getObjectSpacePan) —
// its object-space location moves with pan/camera-target, but (being the
// pivot) always projects to the same fixed on-screen point. Built the same
// way as the flow-arrow ribbon above (a flat NDC-space triangle list,
// projected on the CPU via the same projection*modelView `combined` matrix,
// so it respects the model's depth buffer instead of always drawing on
// top), just a small radial-gradient disc instead of a ribbon — that
// gradient (bright center fading to a darker gold edge) is what reads as a
// lit sphere rather than a flat dot, without needing an actual 3D mesh or a
// dedicated shader.
const PIVOT_ORB_RADIUS_PX = 5;
const PIVOT_ORB_SEGMENTS = 20;
const PIVOT_ORB_COLOR_CENTER = [1, 0.95, 0.55]; // bright yellow highlight
const PIVOT_ORB_COLOR_EDGE = [0.72, 0.52, 0.04]; // darker gold, fakes falloff toward the sphere's silhouette
const pivotOrbBuffer = gl.createBuffer();

// centerNDC is [x, y, z] already in NDC/clip space (see its call site —
// projected via `combined`, same as buildArrowRibbonNDC's ribbon points).
// Returns interleaved [x, y, z, r, g, b] vertices (unlike the ribbon's
// position-only buffer) since each vertex needs its own color for the
// center-to-edge gradient rather than one flat gl.vertexAttrib3f color.
// Factored out of buildPivotOrbNDC so buildPointMarkersNDC below (the
// flow-draw click-point dots) can reuse the same radial-gradient-disc
// geometry with its own radius/colors instead of the pivot's fixed gold.
// Returns a plain array (not yet a typed Float32Array) so multi-point
// callers can concatenate several discs cheaply before making one.
function buildOrbVertsNDC(centerNDC, canvasWidth, canvasHeight, radiusPx, colorCenter, colorEdge) {
  const halfW = canvasWidth / 2, halfH = canvasHeight / 2;
  const rx = radiusPx / halfW, ry = radiusPx / halfH;
  const [cx, cy, cz] = centerNDC;
  const verts = [];
  for (let i = 0; i < PIVOT_ORB_SEGMENTS; i++) {
    const a0 = (i / PIVOT_ORB_SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / PIVOT_ORB_SEGMENTS) * Math.PI * 2;
    verts.push(
      cx, cy, cz, ...colorCenter,
      cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, cz, ...colorEdge,
      cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, cz, ...colorEdge,
    );
  }
  return verts;
}

function buildPivotOrbNDC(centerNDC, canvasWidth, canvasHeight, radiusPx) {
  return new Float32Array(buildOrbVertsNDC(centerNDC, canvasWidth, canvasHeight, radiusPx, PIVOT_ORB_COLOR_CENTER, PIVOT_ORB_COLOR_EDGE));
}

// One small disc per placed point of the in-progress flow-arrow drag (see
// the draw-mode pointerdown handler), so a click's exact landing spot stays
// visible while the arrow is still being built — not just the ribbon
// connecting them. pointsObjectSpace/combined follow buildArrowRibbonNDC's
// convention: object-space points projected to NDC on the CPU via the same
// projection*modelView matrix used for the rest of the overlay.
function buildPointMarkersNDC(pointsObjectSpace, combined, canvasWidth, canvasHeight, radiusPx, colorCenter, colorEdge) {
  const verts = [];
  for (const p of pointsObjectSpace) {
    const px = combined[0] * p[0] + combined[4] * p[1] + combined[8] * p[2] + combined[12];
    const py = combined[1] * p[0] + combined[5] * p[1] + combined[9] * p[2] + combined[13];
    const pz = combined[2] * p[0] + combined[6] * p[1] + combined[10] * p[2] + combined[14];
    verts.push(...buildOrbVertsNDC([px, py, pz], canvasWidth, canvasHeight, radiusPx, colorCenter, colorEdge));
  }
  return new Float32Array(verts);
}

// Shared by every point/junction dot batch below (drag-in-progress and
// finalized alike) — builds the marker geometry and immediately draws it
// through modelFlowPointsBuffer. Assumes the caller already set up
// uLineModelView/uLineProjection (IDENTITY_MAT4) and enabled
// aLinePosition/aLineColor once for the whole stretch of batches.
function drawPointMarkerBatch(points, combined, radiusPx, colorCenter, colorEdge) {
  if (points.length === 0) return;
  const markers = buildPointMarkersNDC(points, combined, canvas.width, canvas.height, radiusPx, colorCenter, colorEdge);
  gl.bindBuffer(gl.ARRAY_BUFFER, modelFlowPointsBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, markers, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(aLineColor, 3, gl.FLOAT, false, 24, 12);
  gl.drawArrays(gl.TRIANGLES, 0, markers.length / 6);
}

const MODEL_FLOW_POINT_RADIUS_PX = 12;
const MODEL_FLOW_POINT_COLOR_CENTER = [1, 1, 1]; // white highlight, reads clearly against the red guide ribbon
const MODEL_FLOW_POINT_COLOR_EDGE = [0.55, 0.55, 0.55];
// Junction points (see shift+click in the draw-mode pointerdown handler)
// render as their own, slightly larger dots instead of a plain white click
// point — red while still waiting on their second branch (see
// pendingJunctions), yellow once that branch is double-click finished (see
// closedJunctions) — so it's obvious at a glance which splits still need
// closing out before the whole arrow can finalize.
const MODEL_FLOW_JUNCTION_RADIUS_PX = MODEL_FLOW_POINT_RADIUS_PX * 1.35;
const MODEL_FLOW_JUNCTION_UNFINISHED_COLOR_CENTER = [1, 0.35, 0.3];
const MODEL_FLOW_JUNCTION_UNFINISHED_COLOR_EDGE = [0.7, 0.1, 0.05];
const MODEL_FLOW_JUNCTION_CLOSED_COLOR_CENTER = [1, 0.92, 0.3];
const MODEL_FLOW_JUNCTION_CLOSED_COLOR_EDGE = [0.75, 0.6, 0.05];
// The arrow's one true source/origin point (see sourceOffset === 0 in
// finalizeModelFlowDrag — the very first point of the very first branch,
// where the pulse actually starts) — an orange dot, distinct from the plain
// white points and red/yellow junctions.
const MODEL_FLOW_ORIGIN_RADIUS_PX = MODEL_FLOW_JUNCTION_RADIUS_PX;
const MODEL_FLOW_ORIGIN_COLOR_CENTER = [1, 0.55, 0.1];
const MODEL_FLOW_ORIGIN_COLOR_EDGE = [0.65, 0.3, 0.02];
// A finalized branch's own last point (where its arrowhead points) — its
// finishing point for the flow, per branch (a branching arrow has more than
// one). Blue, matching MODEL_FLOW_ARROW_COLOR's finished-arrow blue. Only
// meaningful once finalized (see the finished-arrows marker section) — an
// in-progress branch's last point can still be extended further, so it
// isn't a real "finish" yet.
const MODEL_FLOW_ENDPOINT_RADIUS_PX = MODEL_FLOW_JUNCTION_RADIUS_PX;
const MODEL_FLOW_ENDPOINT_COLOR_CENTER = [0.3, 0.55, 1];
const MODEL_FLOW_ENDPOINT_COLOR_EDGE = [0.1, 0.25, 0.7];
// Shared by all three marker draws below (plain click points, unfinished
// junctions, closed junctions) — each just re-uploads its own data into it
// right before its own draw call, so one buffer covers all of them.
const modelFlowPointsBuffer = gl.createBuffer();

// Floor guide: a dashed yellow line straight down (object-space Y=0 is the
// floor — see CUSTOM_MODEL_ROTATE_Y_RAD) from the pivot orb to the floor
// directly beneath/above it, showing how high off the ground the current
// pivot sits. Same color family as the orb; a plain flat color (not the
// orb's radial gradient) since a thin dashed line doesn't read as 3D shaded
// either way.
const PIVOT_FLOOR_LINE_COLOR = [1, 0.85, 0.15];
const PIVOT_FLOOR_LINE_HALF_WIDTH_PX = 1.25;
const PIVOT_FLOOR_DASH_LENGTH_PX = 6;
const PIVOT_FLOOR_DASH_GAP_PX = 5;
const pivotFloorLineBuffer = gl.createBuffer();

// Camera-target bounding-box overlay (see showCameraTargetBoxes): a light
// blue box drawn around every object currently assigned to one of the 3
// camera-target slots, rendered as real 3D geometry (uLineModelView/
// uLineProjection set to the actual modelView/cubeProjection, not the
// NDC-space identity trick the flow-arrow ribbon/pivot orb use above) so it
// sits correctly in the scene's depth buffer — occluded by the model like
// any other object instead of always drawing on top. Faces render at very
// low opacity (a volume tint) with the 12 edges drawn a second time, in the
// same buffer's line-mode counterpart, at a stronger opacity so the box's
// shape stays legible.
const CAMERA_TARGET_BOX_COLOR = [0.55, 0.78, 1]; // light blue
const CAMERA_TARGET_BOX_FILL_OPACITY = 0.1;
const CAMERA_TARGET_BOX_EDGE_OPACITY = 0.45;
const cameraTargetBoxFillBuffer = gl.createBuffer();
const cameraTargetBoxEdgeBuffer = gl.createBuffer();

// Builds the 6-face (12-triangle) fill geometry and 12-edge line geometry
// for one object's axis-aligned bounds (see parseObj's per-object `bounds`).
// Winding isn't meaningful here — the app never enables gl.CULL_FACE — so
// face vertex order just needs to trace out a simple quad, not a
// consistent outward normal.
function buildBoxGeometry(bounds) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const p000 = [minX, minY, minZ], p100 = [maxX, minY, minZ];
  const p110 = [maxX, maxY, minZ], p010 = [minX, maxY, minZ];
  const p001 = [minX, minY, maxZ], p101 = [maxX, minY, maxZ];
  const p111 = [maxX, maxY, maxZ], p011 = [minX, maxY, maxZ];
  const quads = [
    [p000, p100, p101, p001], // bottom
    [p010, p011, p111, p110], // top
    [p000, p010, p110, p100], // front
    [p001, p101, p111, p011], // back
    [p000, p001, p011, p010], // left
    [p100, p110, p111, p101], // right
  ];
  const fill = [];
  for (const [a, b, c, d] of quads) {
    fill.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const edgePairs = [
    [p000, p100], [p100, p101], [p101, p001], [p001, p000], // bottom
    [p010, p011], [p011, p111], [p111, p110], [p110, p010], // top
    [p000, p010], [p100, p110], [p101, p111], [p001, p011], // verticals
  ];
  const edges = [];
  for (const [a, b] of edgePairs) edges.push(...a, ...b);
  return { fill: new Float32Array(fill), edges: new Float32Array(edges) };
}

// Dashes a straight object-space segment (pointA -> pointB) at a constant
// on-screen pixel dash/gap length regardless of zoom — same CPU-side
// projection + constant-pixel-width-ribbon technique as buildArrowRibbonNDC,
// simplified to a single already-straight segment (no per-point joints or
// arrowhead) and split into dash/gap steps along its own length instead of
// one continuous ribbon.
function buildDashedLineNDC(pointA, pointB, combined, canvasWidth, canvasHeight, halfWidthPx, dashPx, gapPx) {
  const halfW = canvasWidth / 2, halfH = canvasHeight / 2;
  const project = (p) => [
    combined[0] * p[0] + combined[4] * p[1] + combined[8] * p[2] + combined[12],
    combined[1] * p[0] + combined[5] * p[1] + combined[9] * p[2] + combined[13],
    combined[2] * p[0] + combined[6] * p[1] + combined[10] * p[2] + combined[14],
  ];
  const a = project(pointA), b = project(pointB);
  let dxPix = (b[0] - a[0]) * halfW, dyPix = (b[1] - a[1]) * halfH;
  const lenPix = Math.hypot(dxPix, dyPix) || 1;
  dxPix /= lenPix; dyPix /= lenPix;
  const nx = (-dyPix * halfWidthPx) / halfW, ny = (dxPix * halfWidthPx) / halfH;
  const verts = [];
  const stepPix = dashPx + gapPx;
  const steps = Math.ceil(lenPix / stepPix);
  for (let i = 0; i < steps; i++) {
    const startPix = i * stepPix;
    if (startPix >= lenPix) break;
    const endPix = Math.min(startPix + dashPx, lenPix);
    const t0 = startPix / lenPix, t1 = endPix / lenPix;
    const p0x = a[0] + (b[0] - a[0]) * t0, p0y = a[1] + (b[1] - a[1]) * t0, p0z = a[2] + (b[2] - a[2]) * t0;
    const p1x = a[0] + (b[0] - a[0]) * t1, p1y = a[1] + (b[1] - a[1]) * t1, p1z = a[2] + (b[2] - a[2]) * t1;
    verts.push(
      p0x - nx, p0y - ny, p0z,  p1x - nx, p1y - ny, p1z,  p0x + nx, p0y + ny, p0z,
      p0x + nx, p0y + ny, p0z,  p1x - nx, p1y - ny, p1z,  p1x + nx, p1y + ny, p1z,
    );
  }
  return new Float32Array(verts);
}

// Builds every drawn arrow as one combined ribbon of triangles with a
// constant on-screen pixel width, rather than gl.LINES — WebGL's line width
// is clamped to ~1px on most browsers/GPUs (the "width" argument to
// gl.lineWidth is widely ignored), so a hairline strip can never be made to
// look bigger; a ribbon is the only reliable way. Does the projection on the
// CPU instead of in the vertex shader: `combined` (projection * modelView)
// is exactly what the shader would apply, and since both factors are built
// from rotate/scale/translate and an orthographic projection — each with an
// implicit [0,0,0,1] last row — clip.w is always 1, so the projected xyz IS
// the NDC position with no perspective divide needed. That lets the offset
// below be computed directly in NDC/pixel space instead of guessing an
// object-space width that would look wrong at every zoom level. Per-segment
// quads (no mitered joints), and each arrow's segments are kept separate
// (no bridging quad between one arrow's last point and the next arrow's
// first) — fine for thin guide lines, and not worth the extra complexity for
// what's just a visual marker. Each path also gets a filled triangular
// arrowhead at its endpoint, pointing along the final segment's direction,
// so the arrow's direction of travel (start -> end) is visible at a glance
// instead of just an undirected line.
const MODEL_FLOW_ARROWHEAD_LENGTH_FACTOR = 4; // arrowhead tip-to-base length, as a multiple of halfWidthPx
const MODEL_FLOW_ARROWHEAD_HALF_WIDTH_FACTOR = 2.2; // arrowhead base half-width, as a multiple of halfWidthPx
// Triangle-fan resolution for the rounded start cap below — high enough
// that the semicircle reads as smooth rather than faceted at the ribbon's
// on-screen size (a few px radius), without pushing per-arrow vertex count
// up meaningfully.
const MODEL_FLOW_ARROW_CAP_SEGMENTS = 10;

// The ribbon quad below starts with a flat perpendicular edge at each
// path's first point (a plain "butt" cap) — fine for the far end, which
// already reads as pointed thanks to the arrowhead, but the near end read
// as a hard square-off. Fans a halfWidthPx semicircle of triangles around
// the first point instead, swept from the first segment's a1 side, back
// through the reverse-of-travel direction, to its a0 side — i.e. bulging
// away from the path rather than into it, so it just rounds off the
// existing quad's start edge instead of extending the ribbon's length.
function addRoundStartCap(verts, a, b, halfW, halfH, halfWidthPx) {
  let dxPix = (b[0] - a[0]) * halfW, dyPix = (b[1] - a[1]) * halfH;
  const lenPix = Math.hypot(dxPix, dyPix) || 1;
  dxPix /= lenPix; dyPix /= lenPix;
  const perpPixX = -dyPix * halfWidthPx, perpPixY = dxPix * halfWidthPx;
  const backPixX = -dxPix * halfWidthPx, backPixY = -dyPix * halfWidthPx;
  for (let k = 0; k < MODEL_FLOW_ARROW_CAP_SEGMENTS; k++) {
    const theta1 = (Math.PI * k) / MODEL_FLOW_ARROW_CAP_SEGMENTS;
    const theta2 = (Math.PI * (k + 1)) / MODEL_FLOW_ARROW_CAP_SEGMENTS;
    const p1x = perpPixX * Math.cos(theta1) + backPixX * Math.sin(theta1);
    const p1y = perpPixY * Math.cos(theta1) + backPixY * Math.sin(theta1);
    const p2x = perpPixX * Math.cos(theta2) + backPixX * Math.sin(theta2);
    const p2y = perpPixY * Math.cos(theta2) + backPixY * Math.sin(theta2);
    verts.push(
      a[0], a[1], a[2],
      a[0] + p1x / halfW, a[1] + p1y / halfH, a[2],
      a[0] + p2x / halfW, a[1] + p2y / halfH, a[2],
    );
  }
}

function buildArrowRibbonNDC(pathsPoints, combined, canvasWidth, canvasHeight, halfWidthPx) {
  const halfW = canvasWidth / 2, halfH = canvasHeight / 2;
  const arrowLengthPx = halfWidthPx * MODEL_FLOW_ARROWHEAD_LENGTH_FACTOR;
  const arrowHalfWidthPx = halfWidthPx * MODEL_FLOW_ARROWHEAD_HALF_WIDTH_FACTOR;
  const verts = [];
  for (const points of pathsPoints) {
    const ndcPoints = points.map((p) => [
      combined[0] * p[0] + combined[4] * p[1] + combined[8] * p[2] + combined[12],
      combined[1] * p[0] + combined[5] * p[1] + combined[9] * p[2] + combined[13],
      combined[2] * p[0] + combined[6] * p[1] + combined[10] * p[2] + combined[14],
    ]);
    if (ndcPoints.length >= 2) {
      addRoundStartCap(verts, ndcPoints[0], ndcPoints[1], halfW, halfH, halfWidthPx);
    }
    for (let i = 0; i < ndcPoints.length - 1; i++) {
      const a = ndcPoints[i], b = ndcPoints[i + 1];
      // Direction converted to actual pixels (NDC axes scaled independently
      // by the canvas's own half-width/half-height) so the perpendicular
      // offset reads as an isotropic pixel width even when the canvas isn't
      // square.
      let dxPix = (b[0] - a[0]) * halfW, dyPix = (b[1] - a[1]) * halfH;
      const lenPix = Math.hypot(dxPix, dyPix) || 1;
      dxPix /= lenPix; dyPix /= lenPix;
      const nx = (-dyPix * halfWidthPx) / halfW, ny = (dxPix * halfWidthPx) / halfH;
      const a0x = a[0] - nx, a0y = a[1] - ny;
      const a1x = a[0] + nx, a1y = a[1] + ny;
      const b0x = b[0] - nx, b0y = b[1] - ny;
      const b1x = b[0] + nx, b1y = b[1] + ny;
      verts.push(
        a0x, a0y, a[2],  b0x, b0y, b[2],  a1x, a1y, a[2],
        a1x, a1y, a[2],  b0x, b0y, b[2],  b1x, b1y, b[2],
      );

      // Arrowhead on the final segment only, built from the same
      // direction/perpendicular the ribbon quad above just used.
      if (i === ndcPoints.length - 2) {
        const backX = (dxPix * arrowLengthPx) / halfW, backY = (dyPix * arrowLengthPx) / halfH;
        const baseCx = b[0] - backX, baseCy = b[1] - backY;
        const wingX = (-dyPix * arrowHalfWidthPx) / halfW, wingY = (dxPix * arrowHalfWidthPx) / halfH;
        verts.push(
          b[0], b[1], b[2],
          baseCx - wingX, baseCy - wingY, b[2],
          baseCx + wingX, baseCy + wingY, b[2],
        );
      }
    }
  }
  return new Float32Array(verts);
}

// Rotates a vec3 the same way mat4RotateX/mat4RotateY would (see those
// functions) — used here to build the inverse camera transform for
// unprojecting a screen point into the model's object space.
function rotateXVec3(v, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function rotateYVec3(v, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

// Advances one axis of the camera-target spring by dt seconds
// (semi-implicit/symplectic Euler: velocity updates from the current
// position first, then position updates from the *new* velocity — more
// stable than naive Euler for a stiff spring at typical frame dt's).
// Returns [newPosition, newVelocity]. stiffness/damping default to
// CAMERA_TARGET_SPRING_STIFFNESS/DAMPING (position's spring) — the zoom
// call in renderCubeFrame passes CAMERA_TARGET_ZOOM_SPRING_STIFFNESS/DAMPING
// instead, its own softer spring (see those constants' comment).
function stepSpring(position, velocity, goal, dt, stiffness = CAMERA_TARGET_SPRING_STIFFNESS, damping = CAMERA_TARGET_SPRING_DAMPING) {
  const accel = stiffness * (goal - position) - damping * velocity;
  const newVelocity = velocity + accel * dt;
  const newPosition = position + newVelocity * dt;
  return [newPosition, newVelocity];
}

// Inverse of renderCubeFrame's modelView build (translate(ox,oy,oz) *
// rotateX(rx) * rotateY(ry) * translate(panX,panY,panZ) * scale(s)) applied
// to a single view-space point, undone in reverse order: un-translate(o),
// un-rotateX, un-rotateY, un-translate(pan), un-scale. The manual-pan
// translate sits *inside* the rotation (undone before un-scaling, after the
// rotations) rather than outside it — see getObjectSpacePan below for why.
function unprojectViewPointToObject(pv, rx, ry, s, ox, oy, oz, panX, panY, panZ) {
  const untranslated = [pv[0] - ox, pv[1] - oy, pv[2] - oz]; // inverse of mat4Translate(ox, oy, oz)
  const unrotatedX = rotateXVec3(untranslated, -rx);
  const unrotatedY = rotateYVec3(unrotatedX, -ry);
  const unpanned = [unrotatedY[0] - panX, unrotatedY[1] - panY, unrotatedY[2] - panZ]; // inverse of mat4Translate(panX, panY, panZ)
  return [unpanned[0] / s, unpanned[1] / s, unpanned[2] / s];
}

// Forward counterpart of unprojectViewPointToObject: scale, rotateY,
// rotateX (pre-translate) — used to find where an object-space point (e.g. a
// camera-target centroid) lands in view space, so renderCubeFrame can pan to
// center it regardless of the model's current rotation. Camera-target mode
// never combines with the manual object-space pan (see getObjectSpacePan),
// so this deliberately has no pan term of its own.
function projectObjectPointToView(p, rx, ry, s) {
  const scaled = [p[0] * s, p[1] * s, p[2] * s];
  const afterY = rotateYVec3(scaled, ry);
  return rotateXVec3(afterY, rx);
}

// Shared by renderCubeFrame and raycastGreenMesh so raycasting always
// unprojects through the exact same view-space offset the render pass drew
// with. Only ever nonzero for camera-target mode now (including while the
// spring is still settling back out of one, so a deactivated target eases
// back to screen-center instead of snapping) — locking a target to
// screen-center has to counteract whatever the *current* rotation does to
// it, which is exactly what this recomputes every call (rx/ry-dependent).
// Read-only: when a camera target is active, this reads cameraTargetCurrent's
// already-stepped position rather than advancing it — only renderCubeFrame's
// own per-frame tick does that (see the spring step in renderCubeFrame), so
// the motion stays tied to render frames rather than to how often a caller
// (e.g. pointermove during arrow-drawing) happens to ask for the offset.
function getCurrentCameraOffset(rx, ry, s) {
  const viewPoint = projectObjectPointToView(cameraTargetCurrent, rx, ry, s);
  return [-viewPoint[0], -viewPoint[1]];
}

// The manual "Model X/Y position" pan, plus the Z axis Space-drag alone
// drives (slider- or Space-drag-driven; see getModelViewOffset) — unlike
// getCurrentCameraOffset above, this is applied
// *inside* rotation (see renderCubeFrame/unprojectViewPointToObject), so it's
// rigid with the model instead of counteracting rotation: rotating (drag or
// hover) always pivots around the model's true center regardless of how far
// it's been panned, rather than the pivot itself drifting to wherever a
// post-rotation pan translate happened to place it. Suppressed while a
// camera target is active — that mode already owns centering via the offset
// above, and combining both would fight over the same screen position. Also
// suppressed until the spring settles back to rest (cameraTargetAtRest) so
// manual pan doesn't cut back in until the camera has actually finished
// easing back to screen-center, instead of jumping in partway through.
function getObjectSpacePan() {
  // While actively drawing, Space-drag panning (see the draw-mode
  // pointerdown/pointermove handling) needs to actually move the model even
  // with a camera target active — normally camera-target mode owns
  // centering outright and never combines with manual pan (see
  // getCurrentCameraOffset/projectObjectPointToView's own no-pan-term
  // comments), which is fine everywhere else, but would make Space-drag
  // panning silently do nothing during a drawing session started from a
  // target. The target's own outer offset (getCurrentCameraOffset) still
  // applies on top of this regardless, so panning moves you relative to
  // wherever the target's currently centered rather than replacing it.
  const targetOwnsCentering = !modelFlowDrawMode && (cameraTargetActiveIndex !== null || !cameraTargetAtRest);
  return targetOwnsCentering ? [0, 0, 0] : getModelViewOffset();
}

// Möller–Trumbore ray-triangle intersection. tris is a flat Float32Array of
// vertex triples (9 floats per triangle); offset picks which triangle.
// Returns the ray parameter t (distance along dir, dir need not be unit
// length) or null if the ray misses this triangle or hits behind the origin.
function rayTriangleIntersect(origin, dir, tris, offset) {
  const EPS = 1e-9;
  const ax = tris[offset], ay = tris[offset + 1], az = tris[offset + 2];
  const bx = tris[offset + 3], by = tris[offset + 4], bz = tris[offset + 5];
  const cx = tris[offset + 6], cy = tris[offset + 7], cz = tris[offset + 8];
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dir[1] * e2z - dir[2] * e2y;
  const py = dir[2] * e2x - dir[0] * e2z;
  const pz = dir[0] * e2y - dir[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < EPS) return null;
  const invDet = 1 / det;
  const tx = origin[0] - ax, ty = origin[1] - ay, tz = origin[2] - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * invDet;
  if (v < 0 || u + v > 1) return null;
  const tHit = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  return tHit > EPS ? tHit : null;
}

// Casts a ray from a screen point (clientX/clientY, as from a pointer event)
// through the orthographic camera into object space, and returns the
// nearest hit { point, objectIndex } on a green triangle, or null if it
// misses the green mesh entirely (drawing is deliberately restricted to
// green parts, since that's the only place the flow pulse can ever show).
// objectIndex (see parseObj's outObjectIndex/greenTriObjectIndexCache) lets
// the arrow-drawing tool track which named object(s) an arrow was actually
// drawn over, for per-arrow object filtering (setFlowArrowObjectEnabled).
function raycastGreenMesh(clientX, clientY) {
  if (!greenTriPositionsCache || greenTriPositionsCache.length === 0) return null;

  // CSS-space rect: with rendering now going straight into `canvas` (no
  // separate offscreen source/crop to map through — see updateCubeProjection
  // above), a pointer position converts to NDC directly, independent of
  // DPR or the canvas's actual backing-store resolution (renderScale).
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2; // canvas Y is down, NDC Y is up

  // s must match renderCubeFrame's exactly (including the eased camera-target
  // zoom multiplier) or raycasting drifts out of sync with what's on screen.
  const rx = cubeRotX + cubeParallaxX, ry = cubeRotY + cubeParallaxY, s = CUBE_SCALE * cubeSizeScale * cameraTargetZoomCurrent;
  const [ox, oy] = getCurrentCameraOffset(rx, ry, s);
  const [panX, panY, panZ] = getObjectSpacePan();
  const originView = [ndcX * cubeProjectionHalfX, ndcY * cubeProjectionHalfY, -0.1];
  const farView = [originView[0], originView[1], -50];
  const originObj = unprojectViewPointToObject(originView, rx, ry, s, ox, oy, cameraOffsetZ, panX, panY, panZ);
  const farObj = unprojectViewPointToObject(farView, rx, ry, s, ox, oy, cameraOffsetZ, panX, panY, panZ);
  const dir = [farObj[0] - originObj[0], farObj[1] - originObj[1], farObj[2] - originObj[2]];

  let bestT = Infinity, bestPoint = null, bestObjectIndex = -1;
  const tris = greenTriPositionsCache;
  for (let i = 0; i < tris.length; i += 9) {
    const t = rayTriangleIntersect(originObj, dir, tris, i);
    if (t !== null && t < bestT) {
      bestT = t;
      bestPoint = [originObj[0] + dir[0] * t, originObj[1] + dir[1] * t, originObj[2] + dir[2] * t];
      bestObjectIndex = greenTriObjectIndexCache[i / 9];
    }
  }
  return bestPoint ? { point: bestPoint, objectIndex: bestObjectIndex } : null;
}

// Nearest point on a 3D polyline to `point` — the 3D analogue of the 2D
// projectOntoPath used for image mode's flow cells. Returns both the arc
// length along the path and the squared distance to that nearest point, so
// callers juggling multiple candidate paths (see recomputeModelFlowCoords)
// can tell which path `point` actually sits closest to.
function nearestPointOnPath3D(path, point) {
  const { points, cumLen } = path;
  let bestDistSq = Infinity, bestArcLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const segLenSq = abx * abx + aby * aby + abz * abz || 1;
    const apx = point[0] - a[0], apy = point[1] - a[1], apz = point[2] - a[2];
    let t = (apx * abx + apy * aby + apz * abz) / segLenSq;
    t = Math.max(0, Math.min(1, t));
    const projx = a[0] + abx * t, projy = a[1] + aby * t, projz = a[2] + abz * t;
    const dx = point[0] - projx, dy = point[1] - projy, dz = point[2] - projz;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestArcLen = cumLen[i] + Math.sqrt(segLenSq) * t;
    }
  }
  return { arcLen: bestArcLen, distSq: bestDistSq };
}

// Raw (un-fudged) arc length of a polyline — unlike buildPathMetrics'
// totalLen, this doesn't floor a genuinely-zero length up to 1 (that floor
// exists purely so totalLen can be safely used as a division denominator
// elsewhere; a junction's sourceOffset below is a plain additive distance,
// where a floored zero would silently overcount).
function pathArcLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return len;
}

function buildPathMetrics(points) {
  const cumLen = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cumLen.push(cumLen[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return { points, cumLen, totalLen: cumLen[cumLen.length - 1] || 1 };
}

// Recomputes every green vertex's flow coordinate and re-uploads the fill's
// flow-coord buffer (the wireframe never carries the pulse, so it has no
// flow-coord buffer of its own). Each vertex is assigned to whichever of
// modelFlowPaths it's actually nearest to (see nearestPointOnPath3D) among
// those whose enabledObjectIndices includes the vertex's own object (see
// setFlowArrowObjectEnabled — lets one arrow drawn across several objects
// pulse only some of them), then stores its arc length *from that arrow's
// true source, normalized by masterTotalLen* — a 0-1 fraction rather than an
// absolute distance — so every arrow shares the same pulse timing/width
// regardless of how many arrows exist or how long each one is (see the
// flowSigma/flowPulseCenter math in renderCubeFrame, which is expressed in
// this same normalized space). sourceOffset/masterTotalLen (see
// finalizeModelFlowDrag) are what let a branching arrow's pulse actually
// travel from its one true source, through a junction, before splitting —
// each branch measures from the same source rather than restarting at 0 the
// moment it's nearest, which would make every branch light up from its own
// start at the very beginning of the cycle regardless of how far that
// branch actually sits from the source. Non-green vertices and vertices
// whose object has no eligible path at all get a negative sentinel
// (MODEL_FLOW_NO_ARROW_COORD) rather than 0 — see the fragment shader's
// `vFlowCoord >= 0.0` gate, which is what actually keeps the glow off those
// parts. Defaulting to a real 0 (a valid arc position) used to make every
// arrow-less part flash in sync whenever the traveling pulse passed the
// start of its cycle, since 0 looked exactly like "sitting at the start of
// some arrow".
// Called whenever an arrow is drawn/cleared/reconfigured and once after a
// model (re)loads a restored path.
function recomputeModelFlowCoords() {
  if (!customModelReady || !customModelPositionsCache) return;

  const vertexCount = customModelPositionsCache.length / 3;
  const flowCoords = new Float32Array(vertexCount).fill(MODEL_FLOW_NO_ARROW_COORD);
  // Parallel buffer: each vertex's chosen path's own masterTotalLen, carried
  // through unnormalized (see aFlowPathLen) so the fragment shader can undo
  // flowCoords' per-path normalization and measure the tail in absolute
  // world-space distance instead of a fraction of that one path's length.
  const flowPathLens = new Float32Array(vertexCount).fill(1);
  if (modelFlowPaths.length > 0) {
    for (let i = 0; i < vertexCount; i++) {
      if (!customModelIsGreenCache[i]) continue;
      const vertexObjectIndex = customModelObjectIndexCache[i];
      const p = [customModelPositionsCache[i * 3], customModelPositionsCache[i * 3 + 1], customModelPositionsCache[i * 3 + 2]];
      let bestFrac = MODEL_FLOW_NO_ARROW_COORD, bestDistSq = Infinity, bestMasterTotalLen = 1;
      for (const path of modelFlowPaths) {
        if (path.enabledObjectIndices && !path.enabledObjectIndices.includes(vertexObjectIndex)) continue;
        const { arcLen, distSq } = nearestPointOnPath3D(path, p);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          const masterTotalLen = path.masterTotalLen || path.totalLen;
          bestFrac = masterTotalLen > 0 ? ((path.sourceOffset || 0) + arcLen) / masterTotalLen : 0;
          bestMasterTotalLen = masterTotalLen || 1;
        }
      }
      flowCoords[i] = bestFrac;
      flowPathLens[i] = bestMasterTotalLen;
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelFlowCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flowCoords, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelFlowPathLenBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flowPathLens, gl.STATIC_DRAW);
}

function saveModelFlowPath() {
  if (modelFlowPaths.length > 0) {
    localStorage.setItem(
      MODEL_FLOW_STORAGE_KEY,
      JSON.stringify(modelFlowPaths.map((path) => ({
        points: path.points,
        touchedObjectIndices: path.touchedObjectIndices,
        enabledObjectIndices: path.enabledObjectIndices,
        sourceOffset: path.sourceOffset,
        masterTotalLen: path.masterTotalLen,
      }))),
    );
  } else {
    localStorage.removeItem(MODEL_FLOW_STORAGE_KEY);
  }
}

function clearModelFlowPath() {
  modelFlowPaths = [];
  modelFlowDrag = null;
  selectedFlowArrowIndex = null;
  saveModelFlowPath();
  recomputeModelFlowCoords();
  notifyModelState();
}

// Shared by restoreModelFlowPath and applyDefaultModelFlowPath below: turns
// saveModelFlowPath's serialized shape (points/touchedObjectIndices/
// enabledObjectIndices/sourceOffset/masterTotalLen) back into real
// modelFlowPaths entries, preserving each entry's own sourceOffset/
// masterTotalLen instead of resetting them — so a multi-branch (junction)
// arrow keeps its branches' pulse timing relative to their true shared
// source rather than every branch restarting at 0.
function buildModelFlowPathsFromData(dataArray) {
  return dataArray.map((data) => {
    const metrics = buildPathMetrics(data.points);
    return {
      ...metrics,
      touchedObjectIndices: data.touchedObjectIndices,
      enabledObjectIndices: data.enabledObjectIndices,
      sourceOffset: data.sourceOffset || 0,
      masterTotalLen: data.masterTotalLen || metrics.totalLen,
      reversed: false,
    };
  });
}

// Restores whatever arrow set saveModelFlowPath last persisted for the
// bundled model, exactly as drawn — called by loadBundledDefaultModel
// *before* it falls back to applyDefaultModelFlowPath, so a locally-drawn
// arrow survives a reload instead of always being replaced by the (often
// empty) baked-in default. Returns whether it actually found and applied
// something.
function restoreModelFlowPath() {
  const raw = localStorage.getItem(MODEL_FLOW_STORAGE_KEY);
  if (!raw) return false;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!Array.isArray(saved) || saved.length === 0) return false;
  modelFlowPaths = buildModelFlowPathsFromData(saved);
  modelFlowDrag = null;
  selectedFlowArrowIndex = null;
  recomputeModelFlowCoords();
  notifyModelState();
  return true;
}

// Installs DEFAULT_MODEL_FLOW_PATH_DATA as the current arrow set — used in
// place of clearModelFlowPath() right after the bundled model loads, so
// startup shows a pulsing arrow instead of a blank green mesh.
function applyDefaultModelFlowPath() {
  modelFlowPaths = buildModelFlowPathsFromData(DEFAULT_MODEL_FLOW_PATH_DATA);
  modelFlowDrag = null;
  selectedFlowArrowIndex = null;
  saveModelFlowPath();
  recomputeModelFlowCoords();
  notifyModelState();
}

// While an arrow is mid-drag (points placed click-by-click, not yet
// finalized — see the draw-mode pointerdown handler), undo drops just the
// last placed point instead of the whole arrow, so a stray click can be
// walked back one step at a time without losing everything drawn so far.
// Two ways this can hand a junction back to pendingJunctions rather than
// losing it (see hasOpenJunction — only one junction can be open at a time,
// so undo re-opening one is also what allows a fresh shift+click again):
//  - popping the point that's still awaiting its explicitly-resumed branch
//    (shift-clicked but never resumed yet) drops it out of pendingJunctions
//    directly;
//  - popping the current branch down to nothing when it's itself that
//    explicitly-resumed branch (isResumedFromPending — started at the
//    junction, never got any point past that seed) re-queues that same
//    junction instead of silently discarding it.
// A third case — undoing away the *automatic continuation* a shift+click
// creates (isResumedFromPending false but startingJunction set) — removes
// the junction from pendingJunctions instead of re-adding it: that branch
// never popped it off in the first place (see the pointerdown handler), so
// undoing it away means undoing the split itself, not offering it for
// another resume.
// Once the current branch empties out with no junction of its own to
// restore, undo walks back into the previous branch this session already
// closed off (see completedBranches/closeCurrentBranchIntoCompleted),
// reopening it for further undo. Only once there's neither a current branch
// nor any completed one left this session does undo fall back to dropping
// the most recently finalized arrow.
function undoLastModelFlowArrow() {
  if (modelFlowDrag && modelFlowDrag.points.length > 0) {
    const poppedPoint = modelFlowDrag.points.pop();
    modelFlowDrag.pointObjectIndices.pop();
    modelFlowDrag.touchedObjects = new Set(modelFlowDrag.pointObjectIndices);
    const pendingIndex = modelFlowDrag.pendingJunctions.findIndex((j) => j.point === poppedPoint);
    if (pendingIndex !== -1) modelFlowDrag.pendingJunctions.splice(pendingIndex, 1);
    // Undoing back down to just the junction's own seed point un-commits the
    // resumed branch — it turns red again (see the pointerdown handler's
    // "grew past the seed" check, which is what turned it yellow).
    if (modelFlowDrag.points.length === 1 && modelFlowDrag.isResumedFromPending && modelFlowDrag.startingJunction) {
      const closedIndex = modelFlowDrag.closedJunctions.indexOf(modelFlowDrag.startingJunction);
      if (closedIndex !== -1) modelFlowDrag.closedJunctions.splice(closedIndex, 1);
    }
    if (modelFlowDrag.points.length === 0) {
      if (modelFlowDrag.startingJunction) {
        if (modelFlowDrag.isResumedFromPending) {
          // This now-empty branch was the explicitly-resumed one (started at
          // the junction, undone away before it grew any further) — put the
          // junction back rather than dropping it.
          modelFlowDrag.pendingJunctions.push(modelFlowDrag.startingJunction);
        } else {
          // This now-empty branch was the automatic continuation a
          // shift+click creates alongside its junction (see the pointerdown
          // handler) — that junction is still sitting in pendingJunctions
          // from that same click, so undoing this branch away undoes the
          // split itself: remove it again instead of duplicating it.
          const idx = modelFlowDrag.pendingJunctions.indexOf(modelFlowDrag.startingJunction);
          if (idx !== -1) modelFlowDrag.pendingJunctions.splice(idx, 1);
        }
      }
      if (modelFlowDrag.completedBranches.length > 0) {
        const prev = modelFlowDrag.completedBranches.pop();
        modelFlowDrag.points = prev.points;
        modelFlowDrag.pointObjectIndices = prev.pointObjectIndices;
        modelFlowDrag.touchedObjects = prev.touchedObjects;
        modelFlowDrag.startingJunction = prev.startingJunction;
        modelFlowDrag.isResumedFromPending = prev.isResumedFromPending;
        modelFlowDrag.branchSourceOffset = prev.sourceOffset;
        if (prev.startingJunction && prev.isResumedFromPending) {
          modelFlowDrag.pendingJunctions.push(prev.startingJunction);
          // Un-completing this branch reopens the junction it closed — back
          // to red (see closedJunctions' rendering) until it's redrawn.
          const closedIndex = modelFlowDrag.closedJunctions.indexOf(prev.startingJunction);
          if (closedIndex !== -1) modelFlowDrag.closedJunctions.splice(closedIndex, 1);
        }
      } else {
        modelFlowDrag = null;
      }
      modelFlowLastClickTime = null;
      modelFlowLastClickPos = null;
    }
    notifyModelState();
    return;
  }
  if (modelFlowPaths.length === 0) return;
  modelFlowPaths.pop();
  // The removed arrow was always the last index — if that's what was
  // selected, the selection no longer points at anything; earlier indices
  // are unaffected and stay valid.
  if (selectedFlowArrowIndex === modelFlowPaths.length) selectedFlowArrowIndex = null;
  saveModelFlowPath();
  recomputeModelFlowCoords();
  notifyModelState();
}

// Drops whichever arrow is currently selected (see setModelFlowSelectMode /
// the select-mode click handler below).
function deleteSelectedModelFlowArrow() {
  if (selectedFlowArrowIndex === null) return;
  modelFlowPaths.splice(selectedFlowArrowIndex, 1);
  selectedFlowArrowIndex = null;
  saveModelFlowPath();
  recomputeModelFlowCoords();
  notifyModelState();
}

// Flips which end of the currently-selected branch the flow travels toward
// — reversing the points array (and rebuilding cumLen/totalLen from it) is
// all that's needed: buildArrowRibbonNDC always draws its arrowhead at the
// *last* point, so it now points the other way automatically, and
// recomputeModelFlowCoords's arc length is now measured from the opposite
// end too. sourceOffset/masterTotalLen are deliberately left untouched —
// they still anchor this branch's timing to the same physical distance
// range from the arrow's true source (see finalizeModelFlowDrag), just with
// the two ends' timing swapped, which is what makes the reversed branch
// still meet its junction (if any) as part of the same pulse cycle rather
// than running on its own unrelated schedule.
function reverseSelectedFlowArrow() {
  if (selectedFlowArrowIndex === null) return;
  const path = modelFlowPaths[selectedFlowArrowIndex];
  if (!path) return;
  path.points.reverse();
  const metrics = buildPathMetrics(path.points);
  path.cumLen = metrics.cumLen;
  path.totalLen = metrics.totalLen;
  path.reversed = !path.reversed;
  saveModelFlowPath();
  recomputeModelFlowCoords();
  notifyModelState();
}

// Toggles whether the currently-selected arrow's pulse applies to one of the
// objects it was drawn over — lets one arrow spanning several objects (e.g.
// its screen-space path crosses from one green part onto an adjacent one)
// pulse only some of them. objectIndex must be one of that arrow's own
// touchedObjectIndices (see finalizeModelFlowDrag below); the
// panel only ever offers those as choices.
function setFlowArrowObjectEnabled(objectIndex, enabled) {
  if (selectedFlowArrowIndex === null) return;
  const path = modelFlowPaths[selectedFlowArrowIndex];
  if (!path) return;
  const has = path.enabledObjectIndices.includes(objectIndex);
  if (enabled && !has) path.enabledObjectIndices.push(objectIndex);
  else if (!enabled && has) path.enabledObjectIndices = path.enabledObjectIndices.filter((i) => i !== objectIndex);
  saveModelFlowPath();
  recomputeModelFlowCoords();
  notifyModelState();
}

function setModelFlowDraw(value) {
  modelFlowDrawMode = value;
  // Drawing and selecting are mutually exclusive — both interpret a canvas
  // click differently (start a new arrow vs. pick an existing one), so
  // enabling one turns off the other.
  if (value) {
    modelFlowSelectMode = false;
    selectedFlowArrowIndex = null;
    // Otherwise a new arrow could be traced without ever seeing the ones
    // already drawn (e.g. right after loading a model with "Show flow
    // arrows" still off) — drawing needs them visible to trace against.
    showModelFlowArrow = true;
    // Start every drawing session from a clean, centered, default-angle
    // view — same as holding Space does — since panned off-center or held
    // at a leftover angle makes tracing a path accurately onto the green
    // surface harder than it needs to be.
    resetModelPosition();
    resetCubeRotation();
    // Freezes the camera-target frame-to-fit zoom goal at today's "Model
    // size" (see drawModeZoomBaselinePercent/zoomGoal in renderCubeFrame) so
    // scroll-to-zoom actually moves the view instead of being cancelled out
    // frame-to-frame.
    drawModeZoomBaselinePercent = cubeSizePercent;
  } else {
    // Leaving draw mode snaps back to the framed default angle and locks
    // rotation again, same as a fresh page load. Also drop any arrow that
    // was still being built click-by-click and never got double-clicked to
    // finish — otherwise it'd sit around, invisible (not yet in
    // modelFlowPaths), until a later drawing session picked it back up.
    modelFlowDrag = null;
    modelFlowLastClickTime = null;
    modelFlowLastClickPos = null;
    // Mirrors the force-on above — draw mode is what turned this on, so
    // leaving it turns it back off rather than leaving arrows on-screen
    // after the user's done drawing.
    showModelFlowArrow = false;
    resetCubeRotation();
    setRotationDisabled(true);
    // Restores whatever zoom was in effect right before draw mode started
    // (undoing any scroll-to-zoom from mid-session) and lets the
    // camera-target frame-to-fit goal track cubeSizeScale live again.
    if (drawModeZoomBaselinePercent !== null) {
      setCubeSizePercent(drawModeZoomBaselinePercent);
      drawModeZoomBaselinePercent = null;
    }
  }
  notifyModelState();
}

// See setModelFlowDraw above re: mutual exclusivity with draw mode.
function setModelFlowSelectMode(value) {
  modelFlowSelectMode = value;
  if (value) {
    modelFlowDrawMode = false;
  } else {
    selectedFlowArrowIndex = null;
  }
  notifyModelState();
}

function setModelFlowArrowVisible(value) {
  showModelFlowArrow = value;
}

function setModelFlowPointsVisible(value) {
  showModelFlowPoints = value;
}

// Suppress the browser's right-click menu while drawing so right-drag reads
// as a rotate gesture instead of popping up a context menu mid-drag.
canvas.addEventListener('contextmenu', (event) => {
  if (modelFlowDrawMode) event.preventDefault();
});

// Pushes the current branch onto completedBranches, provided it has the 2+
// points needed to form a real line — a lone point (e.g. a junction that
// was itself the very first click ever) is simply dropped instead of
// producing a degenerate zero-length branch. Shared by finalizeModelFlowDrag
// (a real double-click finish) and the shift+click handler below (which
// closes off the current branch immediately, right at the new junction,
// rather than waiting for a double-click — see its own comment for why).
function closeCurrentBranchIntoCompleted(drag) {
  if (drag.points.length < 2) return;
  drag.completedBranches.push({
    points: drag.points,
    pointObjectIndices: drag.pointObjectIndices,
    touchedObjects: drag.touchedObjects,
    startingJunction: drag.startingJunction,
    isResumedFromPending: drag.isResumedFromPending,
    sourceOffset: drag.branchSourceOffset,
  });
}

// Double-click-to-finish (see the draw-mode pointerdown handler below):
// closes off whichever branch is currently being built click-by-click (see
// closeCurrentBranchIntoCompleted). If a shift-clicked junction is still
// waiting on its second (explicitly resumed) branch — see hasOpenJunction,
// an arrow can have any number of junctions but only one open/uncommitted at
// a time — drawing resumes from it instead of finishing for good. Only once
// every junction from this session is closed does the whole session's
// branches all become real, independent entries in modelFlowPaths — a
// branch simply sharing its start point with whatever it split from is what
// reads as the flow splitting in two there, so no other code
// (buildPathMetrics/recomputeModelFlowCoords/buildArrowRibbonNDC/rendering/
// save-load) needs to know branching exists at all.
function finalizeModelFlowDrag() {
  if (!modelFlowDrag) return;
  closeCurrentBranchIntoCompleted(modelFlowDrag);
  if (modelFlowDrag.pendingJunctions.length > 0) {
    const junction = modelFlowDrag.pendingJunctions.pop();
    modelFlowDrag.points = [junction.point];
    modelFlowDrag.pointObjectIndices = [junction.objectIndex];
    modelFlowDrag.touchedObjects = new Set([junction.objectIndex]);
    modelFlowDrag.startingJunction = junction;
    modelFlowDrag.isResumedFromPending = true;
    modelFlowDrag.branchSourceOffset = junction.sourceOffset;
    // Otherwise the click that resumes the new branch (right where the
    // finishing double-click just landed) could itself read as another
    // double-click and immediately re-finish a 1-point branch.
    modelFlowLastClickTime = null;
    modelFlowLastClickPos = null;
    notifyModelState();
    return;
  }
  // Every branch's flow coordinate is measured from the one true source (see
  // sourceOffset/branchSourceOffset above), not restarted at 0 per branch —
  // so the pulse only actually reaches a junction, and splits into its
  // branches, once it's traveled the real distance there. masterTotalLen
  // (shared by every branch from this arrow) is set by whichever branch
  // reaches farthest from the source, so a full 0-1 pulse cycle corresponds
  // to the flow crossing the arrow's single longest source-to-end distance;
  // shorter branches simply go dark once the pulse passes their own (nearer)
  // endpoint, which is exactly what a "finishing point" means with more than
  // one of them.
  let masterTotalLen = 0;
  for (const branch of modelFlowDrag.completedBranches) {
    masterTotalLen = Math.max(masterTotalLen, branch.sourceOffset + pathArcLength(branch.points));
  }
  for (const branch of modelFlowDrag.completedBranches) {
    const path = buildPathMetrics(branch.points);
    // Every object a click actually raycasted onto — the pulse applies to
    // all of them by default (see setFlowArrowObjectEnabled for narrowing
    // this down to just some of them after the fact).
    path.touchedObjectIndices = [...branch.touchedObjects];
    path.enabledObjectIndices = [...branch.touchedObjects];
    path.sourceOffset = branch.sourceOffset;
    path.masterTotalLen = masterTotalLen || 1;
    path.reversed = false; // see reverseSelectedFlowArrow
    modelFlowPaths.push(path);
  }
  if (modelFlowDrag.completedBranches.length > 0) {
    saveModelFlowPath();
    recomputeModelFlowCoords();
  }
  modelFlowDrag = null;
  modelFlowLastClickTime = null;
  modelFlowLastClickPos = null;
  notifyModelState();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!blueprintEnabled) return;
  if (modelFlowSelectMode) {
    modelFlowSelectDownPos = { x: event.clientX, y: event.clientY };
    event.stopPropagation();
    return;
  }
  if (!modelFlowDrawMode) return;
  if (spaceHeld) return; // panning instead (see the other pointerdown handler's spaceHeld check)
  if (event.button !== 0) return; // right button rotates instead (see the other pointerdown handler)
  const hit = raycastGreenMesh(event.clientX, event.clientY);
  if (!hit) return;
  event.stopPropagation();
  const now = performance.now();
  // A second click landing quickly and in nearly the same screen spot as the
  // previous one is read as "double-click to finish here" rather than
  // "add another point" — the point it's finishing at was already added by
  // the first click of that pair, so this one only finalizes.
  if (
    modelFlowDrag &&
    modelFlowLastClickTime !== null &&
    now - modelFlowLastClickTime <= MODEL_FLOW_DRAW_DOUBLE_CLICK_MAX_MS &&
    Math.hypot(event.clientX - modelFlowLastClickPos.x, event.clientY - modelFlowLastClickPos.y) <= MODEL_FLOW_DRAW_DOUBLE_CLICK_MAX_DRIFT_PX
  ) {
    finalizeModelFlowDrag();
    return;
  }
  if (!modelFlowDrag) {
    modelFlowDrag = {
      points: [hit.point],
      pointObjectIndices: [hit.objectIndex],
      touchedObjects: new Set([hit.objectIndex]),
      // Which junction (if any) this current branch starts at — null for the
      // session's very first branch (see isResumedFromPending for the two
      // ways a branch can end up starting at one). Carried onto
      // completedBranches (see closeCurrentBranchIntoCompleted) so undo can
      // restore it if the user un-draws all the way back past it.
      startingJunction: null,
      // Whether startingJunction (if set) came from explicitly resuming a
      // queued split (popped off pendingJunctions in finalizeModelFlowDrag —
      // "Branch 3"/"Branch 4" in a junction-then-junction diagram) versus
      // being the automatic continuation created the instant its junction
      // was shift-clicked (see the shift+click handling below — "Branch
      // 2" in that same diagram: it still starts at a junction, but was
      // never actually popped off pendingJunctions). Matters for exactly two
      // things: only a resumed branch growing past its seed closes its
      // junction (see the "grew past the seed" check below — the automatic
      // continuation isn't the side that resolves the split), and undo needs
      // to know whether to push the junction back onto pendingJunctions or
      // just remove it again (see undoLastModelFlowArrow).
      isResumedFromPending: false,
      // Cumulative arc length from the whole arrow's true source (the very
      // first point of its first branch) to this branch's own start point —
      // 0 for the first branch, or a junction's own sourceOffset when
      // starting at one (see finalizeModelFlowDrag/the shift+click handling
      // below). Lets every branch's flow coordinate be measured from the one
      // true source rather than restarting at 0, so the traveling pulse only
      // reaches a junction (and splits into its branches) once it's actually
      // traveled there — see masterTotalLen in
      // finalizeModelFlowDrag/recomputeModelFlowCoords.
      branchSourceOffset: 0,
      // Branches already closed off this session (see
      // closeCurrentBranchIntoCompleted) but not yet pushed to
      // modelFlowPaths — held back until every junction closes (see
      // finalizeModelFlowDrag/pendingJunctions).
      completedBranches: [],
      // At most one entry at a time — only one junction can be open
      // (awaiting its second, explicitly-resumed branch) at once, so each
      // one still only ever splits two ways — but the session can work
      // through any number of them sequentially, since a new shift+click is
      // allowed again as soon as the previous one closes (see
      // hasOpenJunction below). Kept as an array (rather than a single
      // nullable field) since finalizeModelFlowDrag/undoLastModelFlowArrow
      // already just push/pop/splice it either way.
      pendingJunctions: [],
      // Every junction from this session whose explicitly-resumed branch has
      // since grown past its seed point (see the "grew past the seed" check
      // below) — rendered as a yellow dot instead of pendingJunctions' red.
      // Purely a display concern.
      closedJunctions: [],
    };
  } else {
    modelFlowDrag.points.push(hit.point);
    modelFlowDrag.pointObjectIndices.push(hit.objectIndex);
    modelFlowDrag.touchedObjects.add(hit.objectIndex);
    // The current branch just grew past its junction seed point (i.e. this
    // is the resumed branch's first real point, not just the auto-seeded
    // junction itself) — the junction is committed to now, so it turns
    // yellow immediately rather than waiting for this branch to be
    // double-click finished (see closedJunctions' rendering). Scoped to
    // isResumedFromPending: the automatic continuation created alongside a
    // brand-new junction (see below) also starts at 1 point and would
    // otherwise trip this same check the moment it gets its own next click —
    // but that's not the side that resolves the split, its sibling branch is.
    if (modelFlowDrag.isResumedFromPending && modelFlowDrag.startingJunction && modelFlowDrag.points.length === 2 && !modelFlowDrag.closedJunctions.includes(modelFlowDrag.startingJunction)) {
      modelFlowDrag.closedJunctions.push(modelFlowDrag.startingJunction);
    }
  }
  // Shift+click makes the just-placed point a junction — and, unlike a plain
  // click, closes off the branch here immediately (see
  // closeCurrentBranchIntoCompleted) rather than letting it keep going
  // through the junction: a branch is only ever the stretch between one
  // junction (or the true source) and wherever it next ends, whether that's
  // an arrowhead or another junction — never a through-line straddling one.
  // A fresh branch then starts right away at this same point (the
  // "automatic continuation" — whatever's clicked next), while the junction
  // itself is queued in pendingJunctions for its second, explicitly-resumed
  // branch once the continuation is eventually finished (see
  // finalizeModelFlowDrag). Only allowed while no other junction from this
  // session is still open (pending, or resumed but not yet grown past its
  // seed point) — once one closes (turns yellow), a fresh shift+click can
  // open the next one, so one arrow can carry any number of splits, just
  // never two unresolved at once.
  const hasOpenJunction =
    modelFlowDrag.pendingJunctions.length > 0 ||
    (modelFlowDrag.startingJunction && !modelFlowDrag.closedJunctions.includes(modelFlowDrag.startingJunction));
  if (event.shiftKey && !hasOpenJunction) {
    // sourceOffset: how far the true source is from *this* point — the
    // current branch's own offset plus the arc length walked within this
    // branch so far (points already includes the just-placed point above).
    const sourceOffset = modelFlowDrag.branchSourceOffset + pathArcLength(modelFlowDrag.points);
    const junction = { point: hit.point, objectIndex: hit.objectIndex, sourceOffset };
    closeCurrentBranchIntoCompleted(modelFlowDrag);
    modelFlowDrag.points = [junction.point];
    modelFlowDrag.pointObjectIndices = [junction.objectIndex];
    modelFlowDrag.touchedObjects = new Set([junction.objectIndex]);
    modelFlowDrag.startingJunction = junction;
    modelFlowDrag.isResumedFromPending = false;
    modelFlowDrag.branchSourceOffset = junction.sourceOffset;
    modelFlowDrag.pendingJunctions.push(junction);
  }
  modelFlowLastClickTime = now;
  modelFlowLastClickPos = { x: event.clientX, y: event.clientY };
});

// Rubber-band preview: while a branch is mid-drag, renderCubeFrame draws a
// dashed line from the last placed point out to wherever the cursor
// currently raycasts onto the green mesh — showing where the next click
// would land before it's actually confirmed. raycastGreenMesh linearly
// scans every green triangle, so it's deliberately NOT run per mousemove
// event (which can fire far faster than the display refreshes) — this just
// records the latest client position cheaply, and renderCubeFrame raycasts
// it at most once per rendered frame, see modelFlowHoverClientPos below.
let modelFlowHoverClientPos = null;
canvas.addEventListener('pointermove', (event) => {
  modelFlowHoverClientPos = modelFlowDrawMode && modelFlowDrag ? { x: event.clientX, y: event.clientY } : null;
});
canvas.addEventListener('pointerleave', () => {
  modelFlowHoverClientPos = null;
});
window.addEventListener('pointerup', (event) => {
  if (modelFlowSelectDownPos) {
    const dx = event.clientX - modelFlowSelectDownPos.x, dy = event.clientY - modelFlowSelectDownPos.y;
    modelFlowSelectDownPos = null;
    // A drag beyond the click threshold isn't a selection attempt (e.g. the
    // pointer merely slipped while clicking) — leave whatever was selected
    // alone rather than guessing.
    if (Math.hypot(dx, dy) > MODEL_FLOW_SELECT_CLICK_MAX_DRIFT_PX) return;
    const hit = raycastGreenMesh(event.clientX, event.clientY);
    let newIndex = null;
    let bestDistSq = Infinity;
    if (hit) {
      modelFlowPaths.forEach((path, i) => {
        const { distSq } = nearestPointOnPath3D(path, hit.point);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          newIndex = i;
        }
      });
      // Too far from every arrow — treat as clicking empty space, not a
      // selection of "whatever happened to be nearest."
      if (bestDistSq > MODEL_FLOW_SELECT_MAX_DIST * MODEL_FLOW_SELECT_MAX_DIST) newIndex = null;
    }
    selectedFlowArrowIndex = newIndex;
    notifyModelState();
  }
  // Arrow points are now dropped on click (pointerdown) and finalized on
  // double-click, both handled in the pointerdown listener above — pointerup
  // has nothing left to do for draw mode itself.
});

// Bottom-right axis gizmo: a small always-visible indicator of which way
// object-space X/Y/Z currently point on screen, so panning/rotating (drag,
// hover parallax, R, Space's bird's-eye view, camera targets — anything
// that changes rx/ry) doesn't leave the user guessing which axis is which.
// A separate plain-2D canvas (see #axis-gizmo in index.html) rather than
// squeezing a scissored sub-viewport into the main WebGL canvas — much
// simpler to get text labels and line styling right, and precedented by
// #perf-history just above doing the same thing for the FPS sparkline.
// Reuses rotateXVec3/rotateYVec3 (see unprojectViewPointToObject above) with
// the exact same rotation order renderCubeFrame's modelView applies
// (Y then X) so the gizmo's orientation always matches the model's.
const axisGizmoCanvas = document.getElementById('axis-gizmo');
const axisGizmoCtx = axisGizmoCanvas.getContext('2d');
const AXIS_GIZMO_DPR = Math.max(1, window.devicePixelRatio || 1);
axisGizmoCanvas.width = axisGizmoCanvas.clientWidth * AXIS_GIZMO_DPR || axisGizmoCanvas.width;
axisGizmoCanvas.height = axisGizmoCanvas.clientHeight * AXIS_GIZMO_DPR || axisGizmoCanvas.height;
const AXIS_GIZMO_RADIUS = (axisGizmoCanvas.width / 2) * 0.68; // leaves room for the end labels within the canvas
const AXIS_GIZMO_LINE_WIDTH = 2 * AXIS_GIZMO_DPR;
const AXIS_GIZMO_FONT = `${11 * AXIS_GIZMO_DPR}px ui-monospace, monospace`;
// Standard red/green/blue = X/Y/Z convention (Blender, Three.js editor,
// etc.) — worth keeping even though this app uses green/red for unrelated
// things elsewhere (flow parts, arrow guides), since it's what anyone
// who's used a 3D tool before will already recognize at a glance.
const AXIS_GIZMO_AXES = [
  { dir: [1, 0, 0], label: 'X', color: '229, 57, 53' },
  { dir: [0, 1, 0], label: 'Y', color: '67, 160, 71' },
  { dir: [0, 0, 1], label: 'Z', color: '30, 136, 229' },
];

function drawAxisGizmo(rx, ry) {
  const w = axisGizmoCanvas.width, h = axisGizmoCanvas.height;
  const cx = w / 2, cy = h / 2;
  axisGizmoCtx.clearRect(0, 0, w, h);

  // Each axis contributes a near (behind, -dir) and far (in front, +dir)
  // tip; painter's-algorithm sorted back-to-front by rotated depth (index 2)
  // so nearer tips draw over farther ones, same cheap trick
  // buildPivotOrbNDC's caller relies on for the real 3D scene's depth buffer
  // — there's no actual depth buffer here since this is a flat 2D canvas.
  const tips = [];
  for (const axis of AXIS_GIZMO_AXES) {
    const rotated = rotateXVec3(rotateYVec3(axis.dir, ry), rx);
    tips.push({ ...axis, rotated, sign: 1 });
    tips.push({ ...axis, rotated: rotated.map((v) => -v), sign: -1 });
  }
  tips.sort((a, b) => a.rotated[2] - b.rotated[2]);

  for (const tip of tips) {
    const tx = cx + tip.rotated[0] * AXIS_GIZMO_RADIUS;
    const ty = cy - tip.rotated[1] * AXIS_GIZMO_RADIUS; // canvas Y is down, object-space Y is up
    const alpha = tip.sign > 0 ? 1 : 0.35; // the -X/-Y/-Z tips read as faint stubs, not full axes
    axisGizmoCtx.strokeStyle = `rgba(${tip.color}, ${alpha})`;
    axisGizmoCtx.lineWidth = AXIS_GIZMO_LINE_WIDTH;
    axisGizmoCtx.lineCap = 'round';
    axisGizmoCtx.beginPath();
    axisGizmoCtx.moveTo(cx, cy);
    axisGizmoCtx.lineTo(tx, ty);
    axisGizmoCtx.stroke();

    if (tip.sign > 0) {
      axisGizmoCtx.fillStyle = `rgba(${tip.color}, 1)`;
      axisGizmoCtx.beginPath();
      axisGizmoCtx.arc(tx, ty, 2.5 * AXIS_GIZMO_DPR, 0, Math.PI * 2);
      axisGizmoCtx.fill();
      axisGizmoCtx.font = AXIS_GIZMO_FONT;
      axisGizmoCtx.textAlign = 'center';
      axisGizmoCtx.textBaseline = 'middle';
      const lx = cx + tip.rotated[0] * (AXIS_GIZMO_RADIUS + 11 * AXIS_GIZMO_DPR);
      const ly = cy - tip.rotated[1] * (AXIS_GIZMO_RADIUS + 11 * AXIS_GIZMO_DPR);
      axisGizmoCtx.fillText(tip.label, lx, ly);
    }
  }
}

// Real bloom for the flow pulse (see uGlowOnly in CUBE_FRAGMENT_SHADER):
// render just the pulse's own color/intensity — nothing else — to a small
// offscreen texture (BLOOM_DOWNSCALE below full resolution, cheap to blur),
// blur it in two separable passes (horizontal then vertical, ping-ponging
// between two more render targets), then composite the result additively
// over the finished frame. Unlike the earlier in-shader "wider Gaussian"
// approximation, this actually bleeds light across the model's silhouette
// rather than just widening the lit patch on the pulse's own faces.
const BLOOM_DOWNSCALE = 4;

// Creates an RGBA render target (texture + the framebuffer that renders into
// it) at the given size, with its own depth renderbuffer attached — the
// glow-only pass (see below) needs real depth testing too, so a pulse on a
// part of the model that's actually hidden behind another part doesn't
// still bleed bloom through it. LINEAR filtering lets the blur shader's
// bilinear sampling do half its work for free (see BLUR_FRAGMENT_SHADER's
// 5-tap offsets, which rely on it). CLAMP_TO_EDGE avoids wrap-around
// bleeding at the downsampled texture's edges.
function createRenderTarget(width, height) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width, height };
}

// Recreated lazily whenever the canvas's backing-store size changes (see
// ensureBloomTargets, called each frame from renderCubeFrame) rather than
// tied into resize()/applyCanvasSize directly, since renderScale (dynamic
// resolution scaling) changes canvas.width/height independently of a real
// window resize.
let bloomSource = null; // the glow-only pass renders here, at 1/BLOOM_DOWNSCALE resolution
let bloomBlurA = null; // horizontal blur pass output / vertical blur pass input
let bloomBlurB = null; // vertical blur pass output — this is what gets composited back
let bloomWidth = 0;
let bloomHeight = 0;

function ensureBloomTargets() {
  const w = Math.max(1, Math.round(canvas.width / BLOOM_DOWNSCALE));
  const h = Math.max(1, Math.round(canvas.height / BLOOM_DOWNSCALE));
  if (w === bloomWidth && h === bloomHeight && bloomSource) return;
  bloomWidth = w;
  bloomHeight = h;
  bloomSource = createRenderTarget(w, h);
  bloomBlurA = createRenderTarget(w, h);
  bloomBlurB = createRenderTarget(w, h);
}

// Fullscreen-triangle vertex shader shared by the blur and composite passes
// below — a single triangle that overshoots the [-1,1] clip-space square on
// two sides is the standard trick to cover the viewport with no seam down
// the middle (unlike two triangles sharing a diagonal edge).
const POST_VERTEX_SHADER = `
  attribute vec2 aPostPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPostPosition * 0.5 + 0.5;
    gl_Position = vec4(aPostPosition, 0.0, 1.0);
  }
`;

// Separable Gaussian blur, one direction per draw call (uDirection is (1,0)
// for the horizontal pass, (0,1) for the vertical one) — the classic 5-tap
// linear-sampled approximation (weights/offsets from the well-known
// "efficient Gaussian blur with linear sampling" technique), which gets a
// 9-tap-wide blur out of 5 texture reads by landing each sample between two
// texels and letting the GPU's bilinear filtering blend them. Also doubles
// as the final composite copy (see renderCubeFrame): with uDirection at
// (0,0) every offset collapses to zero and the weights still sum to 1, so
// it passes the texture through unblurred.
const BLUR_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uTexelSize;
  uniform vec2 uDirection;
  // "Glow size" — scales how far apart the taps sample, widening/narrowing
  // the blur's spread. Harmless for the composite pass too: that one always
  // passes direction (0,0), so the offsets collapse to zero regardless.
  uniform float uBloomSpread;
  void main() {
    vec2 off1 = uDirection * uTexelSize * uBloomSpread * 1.3846153846;
    vec2 off2 = uDirection * uTexelSize * uBloomSpread * 3.2307692308;
    vec4 sum = texture2D(uTexture, vUv) * 0.2270270270;
    sum += texture2D(uTexture, vUv + off1) * 0.3162162162;
    sum += texture2D(uTexture, vUv - off1) * 0.3162162162;
    sum += texture2D(uTexture, vUv + off2) * 0.0702702703;
    sum += texture2D(uTexture, vUv - off2) * 0.0702702703;
    gl_FragColor = sum;
  }
`;

const postProgram = gl.createProgram();
gl.attachShader(postProgram, compileShader(gl.VERTEX_SHADER, POST_VERTEX_SHADER));
gl.attachShader(postProgram, compileShader(gl.FRAGMENT_SHADER, BLUR_FRAGMENT_SHADER));
// Pinned to an attribute index (7) well past cubeProgram/lineProgram's own
// handful of attributes (0-5ish, implementation-assigned) — vertex attrib
// enable/pointer state lives per-index, not per-program, so if this instead
// happened to land on the same index as e.g. cubeProgram's aPosition,
// binding it here would silently corrupt the main scene's own attribute
// once rendering switches back to cubeProgram after the blur passes. Must
// be called before linking for it to take effect.
gl.bindAttribLocation(postProgram, 7, 'aPostPosition');
gl.linkProgram(postProgram);
if (!gl.getProgramParameter(postProgram, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(postProgram));
}
const aPostPosition = gl.getAttribLocation(postProgram, 'aPostPosition');
const uPostTexture = gl.getUniformLocation(postProgram, 'uTexture');
const uPostTexelSize = gl.getUniformLocation(postProgram, 'uTexelSize');
const uPostDirection = gl.getUniformLocation(postProgram, 'uDirection');
const uPostBloomSpread = gl.getUniformLocation(postProgram, 'uBloomSpread');

// Single overscanned triangle covering clip space — see POST_VERTEX_SHADER.
const POST_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);
const postTriangleBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, postTriangleBuffer);
gl.bufferData(gl.ARRAY_BUFFER, POST_TRIANGLE, gl.STATIC_DRAW);

// One blur pass: binds `target`'s framebuffer, samples `source`'s texture,
// blurring along `direction` ((1,0) or (0,1); (0,0) for an unblurred copy —
// see BLUR_FRAGMENT_SHADER). Assumes postProgram is already the active
// program and the vertex attrib/buffer are already bound (see their one-time
// setup just above and in renderCubeFrame's composite call) — every caller
// this frame shares that same state, so there's no point rebinding per call.
function drawPostPass(source, target, direction) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
  gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
  gl.bindTexture(gl.TEXTURE_2D, source.texture);
  gl.uniform1i(uPostTexture, 0);
  gl.uniform2f(uPostTexelSize, 1 / source.width, 1 / source.height);
  gl.uniform2f(uPostDirection, direction[0], direction[1]);
  gl.uniform1f(uPostBloomSpread, glowSizePercent / 100);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function renderCubeFrame() {
  gl.viewport(0, 0, canvas.width, canvas.height);
  if (blueprintEnabled) {
    const bg = BLUEPRINT_THEMES[shaderTheme].bg;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
  } else {
    gl.clearColor(0, 0, 0, 1);
  }
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (cubeRotResetStartTime !== null) {
    // Fast ease-out cubic from the snapshot taken in tweenCubeRotationTo to
    // its target angle — cubeRotResetSuppressParallax additionally decays
    // the tilt itself back to zero over the same curve (overriding the
    // normal per-frame parallax easing below) for the fast reset-style
    // tweens; the slow load intro leaves it false so live hover keeps
    // running via the normal path underneath the rotation tween instead of
    // going dead for its whole 2s.
    const t = Math.min(1, (performance.now() - cubeRotResetStartTime) / cubeRotResetDurationMs);
    const eased = cubeRotResetEasing(t);
    cubeRotX = cubeRotResetFrom.rotX + (cubeRotResetTargetX - cubeRotResetFrom.rotX) * eased;
    cubeRotY = cubeRotResetFrom.rotY + (cubeRotResetTargetY - cubeRotResetFrom.rotY) * eased;
    if (cubeRotResetSuppressParallax) {
      cubeParallaxTargetX = cubeRotResetFrom.parTargetX * (1 - eased);
      cubeParallaxTargetY = cubeRotResetFrom.parTargetY * (1 - eased);
      cubeParallaxX = cubeRotResetFrom.parX * (1 - eased);
      cubeParallaxY = cubeRotResetFrom.parY * (1 - eased);
    } else {
      advanceParallax();
    }
    if (t >= 1) {
      cubeRotResetStartTime = null;
      cubeRotResetFrom = null;
    }
  } else {
    advanceParallax();
  }

  const rx = cubeRotX + cubeParallaxX;
  const ry = cubeRotY + cubeParallaxY;

  // Rotation (rx/ry) is untouched by camera-target mode — only the pan
  // offset's source and the extra zoom multiplier change, so drag/hover
  // rotation holds automatically regardless of target.
  const activeTargetName = cameraTargetActiveIndex !== null ? cameraTargetSlots[cameraTargetActiveIndex] : null;
  const activeTarget = activeTargetName ? customModelObjects.find((o) => o.name === activeTargetName) : null;
  const goalCenter = activeTarget ? activeTarget.center : [0, 0, 0];
  let zoomGoal = 1;
  if (activeTarget && activeTarget.bounds) {
    // "Frame to fit" zoom, using the target's bounding box projected
    // through the fixed isometric resting rotation (CUBE_ISO_PITCH/
    // CUBE_ISO_YAW) rather than the scene's *current* rx/ry — this is
    // the "initial state" rotation every target starts from, so the
    // fit reflects the object's actual (rotated, isometric) silhouette
    // instead of a flat/unrotated one, while still being a fixed
    // per-object value that doesn't chase hover/drag rotation while a
    // target is active. Still reactive to the "Model size" slider and
    // window resize (cubeSizeScale/cubeProjectionHalfY), just not to
    // rotation. Being orthographic, on-screen size depends only on this
    // projected extent and the uniform scale below, never on distance
    // from the camera, so solving for the exact
    // CAMERA_TARGET_VERTICAL_SAFE_ZONE fill fraction is exact.
    const { minX, maxX, minY, maxY, minZ, maxZ } = activeTarget.bounds;
    const [ccx, ccy, ccz] = activeTarget.center;
    let minProjY = Infinity, maxProjY = -Infinity;
    for (const x of [minX, maxX]) {
      for (const y of [minY, maxY]) {
        for (const z of [minZ, maxZ]) {
          const afterY = rotateYVec3([x - ccx, y - ccy, z - ccz], CUBE_ISO_YAW);
          const afterX = rotateXVec3(afterY, CUBE_ISO_PITCH);
          if (afterX[1] < minProjY) minProjY = afterX[1];
          if (afterX[1] > maxProjY) maxProjY = afterX[1];
        }
      }
    }
    const projectedHeight = maxProjY - minProjY;
    if (projectedHeight > 1e-6) {
      const fillFraction = 1 - 2 * CAMERA_TARGET_VERTICAL_SAFE_ZONE;
      // Normally divides by the *live* cubeSizeScale so the "Model size"
      // slider can't change the on-screen framing (it cancels out against
      // the same term in `s` below). While draw mode is active, divides by
      // the frozen drawModeZoomBaselinePercent instead (see
      // setModelFlowDraw) so that cancellation doesn't also eat scroll-to-
      // zoom, which drives cubeSizeScale through the exact same path.
      const zoomGoalSizeScale = drawModeZoomBaselinePercent !== null
        ? drawModeZoomBaselinePercent / 100
        : cubeSizeScale;
      zoomGoal = Math.max(
        CAMERA_TARGET_ZOOM_MIN,
        Math.min(
          CAMERA_TARGET_ZOOM_MAX,
          (fillFraction * 2 * cubeProjectionHalfY) / (projectedHeight * CUBE_SCALE * zoomGoalSizeScale)
        )
      );
    }
  }
  // Step the damped spring toward this frame's goal (see stepSpring above).
  // Unlike a tween, there's nothing to "restart" when the goal changes —
  // switching targets mid-flight, or a resize nudging the frame-to-fit
  // zoom, just becomes a new goal the spring keeps pulling toward from
  // wherever it already is, carrying whatever velocity it already had.
  const now = performance.now();
  const dt = cameraTargetSpringLastTime === null
    ? 0
    : Math.min(CAMERA_TARGET_SPRING_MAX_DT, (now - cameraTargetSpringLastTime) / 1000);
  cameraTargetSpringLastTime = now;
  const nextPos = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    [nextPos[i], cameraTargetVelocity[i]] = stepSpring(cameraTargetCurrent[i], cameraTargetVelocity[i], goalCenter[i], dt);
  }
  cameraTargetCurrent = nextPos;
  [cameraTargetZoomCurrent, cameraTargetZoomVelocity] = stepSpring(
    cameraTargetZoomCurrent, cameraTargetZoomVelocity, zoomGoal, dt,
    CAMERA_TARGET_ZOOM_SPRING_STIFFNESS, CAMERA_TARGET_ZOOM_SPRING_DAMPING,
  );
  // "At rest" (see getObjectSpacePan) only when there's no active target AND
  // the spring has actually settled at the origin/1x — not merely whenever
  // cameraTargetActiveIndex is null, since the spring is still moving for a
  // beat after a target's deactivated.
  cameraTargetAtRest = !activeTargetName
    && Math.hypot(...cameraTargetCurrent) < CAMERA_TARGET_SPRING_REST_EPSILON
    && Math.hypot(...cameraTargetVelocity) < CAMERA_TARGET_SPRING_REST_EPSILON
    && Math.abs(cameraTargetZoomCurrent - 1) < CAMERA_TARGET_SPRING_REST_EPSILON
    && Math.abs(cameraTargetZoomVelocity) < CAMERA_TARGET_SPRING_REST_EPSILON;
  const s = CUBE_SCALE * cubeSizeScale * cameraTargetZoomCurrent;
  const [offsetX, offsetY] = getCurrentCameraOffset(rx, ry, s);
  const [panX, panY, panZ] = getObjectSpacePan();

  let modelView = mat4Translate(offsetX, offsetY, cameraOffsetZ);
  modelView = mat4Multiply(modelView, mat4RotateX(rx));
  modelView = mat4Multiply(modelView, mat4RotateY(ry));
  modelView = mat4Multiply(modelView, mat4Translate(panX, panY, panZ));
  modelView = mat4Multiply(modelView, mat4Scale(s));

  gl.useProgram(cubeProgram);
  gl.uniformMatrix4fv(uModelView, false, modelView);
  gl.uniformMatrix4fv(uProjection, false, cubeProjection);
  const azRad = (lightAzimuthValue * Math.PI) / 180;
  const elRad = (lightElevationValue * Math.PI) / 180;
  gl.uniform3f(uLightDir, Math.cos(elRad) * Math.cos(azRad), Math.sin(elRad), Math.cos(elRad) * Math.sin(azRad));
  gl.uniform1f(uLightIntensity, lightIntensityPercent / 100);
  gl.uniform1i(uBlueprint, blueprintEnabled ? 1 : 0);
  const blueprintFillColor = BLUEPRINT_THEMES[shaderTheme].fill;
  gl.uniform3f(uBlueprintFillColor, blueprintFillColor[0], blueprintFillColor[1], blueprintFillColor[2]);
  gl.uniform3f(uBlueprintFillColorGreen, BLUEPRINT_FILL_COLOR_GREEN[0], BLUEPRINT_FILL_COLOR_GREEN[1], BLUEPRINT_FILL_COLOR_GREEN[2]);
  const blueprintLineColor = BLUEPRINT_THEMES[shaderTheme].line;
  gl.uniform3f(uHatchLineColor, blueprintLineColor[0], blueprintLineColor[1], blueprintLineColor[2]);
  gl.uniform1f(uLineFrequency, lineFrequencyValue);
  gl.uniform1f(uDotFrequency, dotFrequencyValue);
  gl.uniform1f(uDotRadius, dotSizePercent / 100);
  gl.uniform1f(uPlusFrequency, plusFrequencyValue);
  const plusArmHalf = plusSizePercent / 100;
  gl.uniform1f(uPlusArmHalf, plusArmHalf);
  gl.uniform1f(uPlusThickness, plusArmHalf * PLUS_THICKNESS_RATIO);

  gl.bindBuffer(gl.ARRAY_BUFFER, customModelPositionBuffer);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, customModelNormalBuffer);
  gl.enableVertexAttribArray(aNormal);
  gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, customModelColorBuffer);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, customModelIsGreenBuffer);
  gl.enableVertexAttribArray(aIsGreen);
  gl.vertexAttribPointer(aIsGreen, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, customModelFillPatternBuffer);
  gl.enableVertexAttribArray(aFillPattern);
  gl.vertexAttribPointer(aFillPattern, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, customModelFlowCoordBuffer);
  gl.enableVertexAttribArray(aFlowCoord);
  gl.vertexAttribPointer(aFlowCoord, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, customModelFlowPathLenBuffer);
  gl.enableVertexAttribArray(aFlowPathLen);
  gl.vertexAttribPointer(aFlowPathLen, 1, gl.FLOAT, false, 0, 0);

  // Traveling flow pulse: same Gaussian-band-over-time math as the image
  // mode's flow (see renderLoop's pulseLinear/pulseProgress/pulseSigma), just
  // parameterized by each vertex's normalized (0-1) position along its
  // nearest arrow instead of grid cells or an absolute arc length — so this
  // one shared pulse phase/width animates every arrow in modelFlowPaths in
  // sync, regardless of how many there are or how long each one is (see
  // recomputeModelFlowCoords). Reuses pulseBandFraction (the shared "Pulse
  // width" slider) so one control governs both modes' pulse widths. Speed is
  // user-adjustable via flowSpeedPercent (the "Flow speed" slider). Computed
  // once here and reused for both the face pass (cubeProgram, below) and the
  // line pass (lineProgram, further down) rather than reading anything back
  // from the GPU.
  const flowActive = blueprintEnabled && customModelReady && modelFlowPaths.length > 0;
  let flowSigma = 0.02;
  const flowPulseCentersArray = flowPulseCentersScratch;
  const flowPulseCount = Math.min(FLOW_PULSE_FREQUENCY_MAX, Math.max(1, Math.round(flowPulseFrequencyValue)));
  if (flowActive) {
    flowSigma = Math.max(0.02, MODEL_FLOW_PULSE_BAND_FRACTION * pulseBandFraction * 4);
    const flowPad = flowSigma * FLOW_PULSE_PAD_SIGMAS;
    const flowRange = 1 + 2 * flowPad;
    // Linear for now (was an eased t^3 ease-in — the pulse noticeably
    // lingered at the start of each loop before accelerating through the
    // rest of the arrow).
    const flowPeriodMs = FLOW_PULSE_PERIOD_BASE_MS * (100 / flowSpeedPercent);
    const pulseProgress = (performance.now() % flowPeriodMs) / flowPeriodMs;
    const basePulseCenter = -flowPad + pulseProgress * flowRange;
    // Extra pulses (see the "Pulse frequency" slider) trail the primary one
    // at even offsets around the same travel loop, each wrapped back into
    // [-flowPad, 1+flowPad) so they fade in/out at the loop's ends just like
    // the primary pulse instead of popping when an offset center wanders
    // past a boundary.
    const spacing = flowRange / flowPulseCount;
    for (let i = 0; i < flowPulseCount; i++) {
      const shifted = basePulseCenter - i * spacing + flowPad;
      const wrapped = ((shifted % flowRange) + flowRange) % flowRange;
      flowPulseCentersArray[i] = wrapped - flowPad;
    }
  }
  gl.uniform1i(uFlowActive, flowActive ? 1 : 0);
  if (flowActive) {
    gl.uniform1fv(uFlowPulseCenters, flowPulseCentersArray);
    gl.uniform1i(uFlowPulseCount, flowPulseCount);
    gl.uniform1f(uFlowSigma, flowSigma);
    gl.uniform3f(uFlowColor, BLUEPRINT_FLOW_COLOR[0], BLUEPRINT_FLOW_COLOR[1], BLUEPRINT_FLOW_COLOR[2]);
    gl.uniform1f(uFlowCoreSigmaMult, flowCoreLengthPercent / 100);
    // Absolute world-space tail reach — MODEL_FLOW_TAIL_REFERENCE_LENGTH
    // stands in for "this specific arrow's own length" (see
    // aFlowPathLen/vFlowPathLen) so every arrow's tail covers the same real
    // distance instead of a distance proportional to its own length.
    gl.uniform1f(uFlowTailWorldSigma, flowSigma * (flowTailLengthPercent / 100) * MODEL_FLOW_TAIL_REFERENCE_LENGTH);
    gl.uniform1f(uFlowTailFalloffExponent, flowTailFalloffValue);
  }

  // Real bloom for the flow pulse (see uGlowOnly/BLOOM_DOWNSCALE above):
  // render the pulse-only glow to a small offscreen target, blur it, and
  // leave the result in bloomBlurB for the composite draw at the end of
  // this function. Reuses the same attribs/modelView/projection already
  // bound above — just a framebuffer/viewport/uniform swap around one extra
  // draw call of the same geometry. Skipped entirely when there's no pulse.
  if (flowActive) {
    ensureBloomTargets();
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomSource.framebuffer);
    gl.viewport(0, 0, bloomSource.width, bloomSource.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(uGlowOnly, 1);
    const glowIntensity = glowIntensityPercent / 100;
    gl.uniform3f(
      uFlowColor,
      BLUEPRINT_FLOW_COLOR[0] * glowIntensity,
      BLUEPRINT_FLOW_COLOR[1] * glowIntensity,
      BLUEPRINT_FLOW_COLOR[2] * glowIntensity,
    );
    gl.drawArrays(gl.TRIANGLES, 0, customModelVertexCount);
    gl.uniform1i(uGlowOnly, 0);
    gl.uniform3f(uFlowColor, BLUEPRINT_FLOW_COLOR[0], BLUEPRINT_FLOW_COLOR[1], BLUEPRINT_FLOW_COLOR[2]);

    gl.useProgram(postProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, postTriangleBuffer);
    gl.enableVertexAttribArray(aPostPosition);
    gl.vertexAttribPointer(aPostPosition, 2, gl.FLOAT, false, 0, 0);
    // Depth-testing a fullscreen blur pass against whatever the (unrelated)
    // target's depth buffer happens to hold makes no sense — off for both
    // blur passes, restored before returning to the real scene render.
    gl.disable(gl.DEPTH_TEST);
    drawPostPass(bloomSource, bloomBlurA, [1, 0]);
    drawPostPass(bloomBlurA, bloomBlurB, [0, 1]);
    gl.enable(gl.DEPTH_TEST);

    gl.useProgram(cubeProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // In blueprint mode the filled pass is nudged back with polygon offset so
  // the wireframe (drawn without it, right after) sits cleanly on top
  // instead of z-fighting with the coplanar filled faces underneath it.
  if (blueprintEnabled) {
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
  }

  // customModelVertexCount is 0 until a model's actually loaded (see
  // customModelReady/applyParsedModel), so this is a no-op draw call rather
  // than needing an explicit readiness guard — nothing renders until then.
  gl.drawArrays(gl.TRIANGLES, 0, customModelVertexCount);

  // Camera-target bounding-box overlay (see showCameraTargetBoxes/
  // buildBoxGeometry above) — independent of blueprint mode, since it's a
  // camera-target diagnostic rather than a wireframe-mode feature. Real 3D
  // geometry (actual modelView/cubeProjection), drawn right after the
  // opaque fill pass so its depth test correctly hides the far side behind
  // whatever the model itself already occludes.
  if (showCameraTargetBoxes && customModelReady) {
    const targetNames = [...new Set(cameraTargetSlots.filter(Boolean))];
    if (targetNames.length > 0) {
      gl.useProgram(lineProgram);
      gl.uniformMatrix4fv(uLineModelView, false, modelView);
      gl.uniformMatrix4fv(uLineProjection, false, cubeProjection);
      gl.enableVertexAttribArray(aLinePosition);
      gl.disableVertexAttribArray(aLineColor);
      gl.vertexAttrib3f(aLineColor, CAMERA_TARGET_BOX_COLOR[0], CAMERA_TARGET_BOX_COLOR[1], CAMERA_TARGET_BOX_COLOR[2]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      // Faces skip the depth write (translucent box shouldn't occlude
      // anything drawn after it) while depth *testing* stays on, so the box
      // still correctly disappears behind opaque model geometry.
      gl.depthMask(false);
      for (const name of targetNames) {
        const obj = customModelObjects.find((o) => o.name === name);
        if (!obj || !obj.bounds) continue;
        const { fill, edges } = buildBoxGeometry(obj.bounds);

        gl.bindBuffer(gl.ARRAY_BUFFER, cameraTargetBoxFillBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, fill, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);
        gl.uniform1f(uLineAlpha, CAMERA_TARGET_BOX_FILL_OPACITY);
        gl.drawArrays(gl.TRIANGLES, 0, fill.length / 3);

        gl.bindBuffer(gl.ARRAY_BUFFER, cameraTargetBoxEdgeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, edges, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);
        gl.uniform1f(uLineAlpha, CAMERA_TARGET_BOX_EDGE_OPACITY);
        gl.drawArrays(gl.LINES, 0, edges.length / 3);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1f(uLineAlpha, 1.0);
    }
  }

  if (blueprintEnabled) {
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.useProgram(lineProgram);
    gl.uniformMatrix4fv(uLineModelView, false, modelView);
    gl.uniformMatrix4fv(uLineProjection, false, cubeProjection);
    gl.uniform1f(uLineAlpha, 1.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, customModelLineBuffer);
    gl.enableVertexAttribArray(aLinePosition);
    gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, customModelLineColorBuffer);
    gl.enableVertexAttribArray(aLineColor);
    gl.vertexAttribPointer(aLineColor, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, customModelLineVertexCount);

    // Draw every finalized arrow, plus the in-progress drag (if any), as a
    // bold guide ribbon (with an arrowhead marking its direction) on top, so
    // the user can see/verify what they've traced so far while still being
    // able to add more arrows — built in NDC space (see buildArrowRibbonNDC)
    // so its width reads as constant pixels regardless of zoom, which a
    // plain gl.LINES strip can't do. Needs its own identity model/
    // projection: the ribbon's vertices are already fully projected on the
    // CPU, so the shader must not reproject them. The selected arrow (see
    // setModelFlowSelectMode) is drawn as a separate batch in an amber
    // highlight color so it's obviously distinct before deleting it. The
    // in-progress drag (not yet double-clicked to finish — see
    // finalizeModelFlowDrag) is also its own batch, in gray, so it reads as
    // "still being drawn" until it's confirmed and turns blue like the rest.
    const unselectedPointLists = [];
    let selectedPointList = null;
    // Every finalized arrow's true source point (sourceOffset === 0 — the
    // very first point of the very first branch, see finalizeModelFlowDrag)
    // — collected here (where the actual path objects, not just their
    // .points arrays, are in scope) for the black origin dot below.
    const finishedOriginPoints = [];
    if (showModelFlowArrow) {
      modelFlowPaths.forEach((path, i) => {
        if (i === selectedFlowArrowIndex) selectedPointList = path.points;
        else unselectedPointLists.push(path.points);
        if (path.sourceOffset === 0) finishedOriginPoints.push(path.points[0]);
      });
    }
    // Every branch from this drawing session that isn't in modelFlowPaths
    // yet — branches already double-click-finished but still waiting on a
    // pending junction (see completedBranches/finalizeModelFlowDrag), plus
    // whichever branch is currently being clicked out — all rendered as one
    // batch so a multi-branch arrow reads as a single in-progress unit. Tied
    // to showModelFlowArrow same as finalized arrows below, so "Show arrows"
    // is a single master visibility switch rather than only hiding the ones
    // already finished.
    const dragPointLists = modelFlowDrag && showModelFlowArrow
      ? [
          ...modelFlowDrag.completedBranches.map((b) => b.points),
          ...(modelFlowDrag.points.length >= 2 ? [modelFlowDrag.points] : []),
        ]
      : [];

    // Shared by the arrow ribbon below and the pivot orb further down —
    // projects object-space points straight to NDC/clip space on the CPU
    // (see buildArrowRibbonNDC's comment for why: an orthographic
    // projection composed with rotate/scale/translate always has clip.w=1,
    // so this *is* the final NDC position, no perspective divide needed).
    const combined = mat4Multiply(cubeProjection, modelView);

    if (unselectedPointLists.length > 0 || selectedPointList || dragPointLists.length > 0) {
      gl.uniformMatrix4fv(uLineModelView, false, IDENTITY_MAT4);
      gl.uniformMatrix4fv(uLineProjection, false, IDENTITY_MAT4);
      gl.enableVertexAttribArray(aLinePosition);
      gl.disableVertexAttribArray(aLineColor);
      // All three arrow ribbons render at partial opacity (see
      // MODEL_FLOW_ARROW_OPACITY) rather than the wireframe/orb's full 1.0,
      // so blending needs to be on for just this stretch of draw calls.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(uLineAlpha, MODEL_FLOW_ARROW_OPACITY);

      if (unselectedPointLists.length > 0) {
        const ribbon = buildArrowRibbonNDC(unselectedPointLists, combined, canvas.width, canvas.height, MODEL_FLOW_ARROW_HALF_WIDTH_PX);
        gl.bindBuffer(gl.ARRAY_BUFFER, modelFlowOverlayBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, ribbon, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttrib3f(aLineColor, MODEL_FLOW_ARROW_COLOR[0], MODEL_FLOW_ARROW_COLOR[1], MODEL_FLOW_ARROW_COLOR[2]);
        gl.drawArrays(gl.TRIANGLES, 0, ribbon.length / 3);
      }

      if (selectedPointList) {
        const ribbon = buildArrowRibbonNDC([selectedPointList], combined, canvas.width, canvas.height, MODEL_FLOW_ARROW_HALF_WIDTH_PX);
        gl.bindBuffer(gl.ARRAY_BUFFER, modelFlowOverlayBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, ribbon, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttrib3f(aLineColor, MODEL_FLOW_ARROW_SELECTED_COLOR[0], MODEL_FLOW_ARROW_SELECTED_COLOR[1], MODEL_FLOW_ARROW_SELECTED_COLOR[2]);
        gl.drawArrays(gl.TRIANGLES, 0, ribbon.length / 3);
      }

      if (dragPointLists.length > 0) {
        const ribbon = buildArrowRibbonNDC(dragPointLists, combined, canvas.width, canvas.height, MODEL_FLOW_ARROW_HALF_WIDTH_PX);
        gl.bindBuffer(gl.ARRAY_BUFFER, modelFlowOverlayBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, ribbon, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttrib3f(aLineColor, MODEL_FLOW_ARROW_DRAG_COLOR[0], MODEL_FLOW_ARROW_DRAG_COLOR[1], MODEL_FLOW_ARROW_DRAG_COLOR[2]);
        gl.drawArrays(gl.TRIANGLES, 0, ribbon.length / 3);
      }

      gl.disable(gl.BLEND);
      gl.uniform1f(uLineAlpha, 1.0);
    }

    // Rubber-band preview: a dashed line from the last placed point out to
    // wherever the cursor currently raycasts (see modelFlowHoverClientPos —
    // raycast here, at most once per rendered frame, rather than per raw
    // mousemove event), previewing the segment a click would add next. Not
    // folded into the ribbon block above since it needs to show from the
    // very first point placed — before dragPointLists has the 2 points it
    // requires for an actual ribbon segment to exist yet.
    const hoverHit = showModelFlowArrow && modelFlowDrawMode && modelFlowDrag && modelFlowDrag.points.length > 0 && modelFlowHoverClientPos
      ? raycastGreenMesh(modelFlowHoverClientPos.x, modelFlowHoverClientPos.y)
      : null;
    if (hoverHit) {
      const lastPoint = modelFlowDrag.points[modelFlowDrag.points.length - 1];
      const dashes = buildDashedLineNDC(
        lastPoint, hoverHit.point, combined, canvas.width, canvas.height,
        MODEL_FLOW_HOVER_LINE_HALF_WIDTH_PX, MODEL_FLOW_HOVER_DASH_LENGTH_PX, MODEL_FLOW_HOVER_DASH_GAP_PX,
      );
      gl.uniformMatrix4fv(uLineModelView, false, IDENTITY_MAT4);
      gl.uniformMatrix4fv(uLineProjection, false, IDENTITY_MAT4);
      gl.enableVertexAttribArray(aLinePosition);
      gl.disableVertexAttribArray(aLineColor);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(uLineAlpha, MODEL_FLOW_ARROW_OPACITY);
      gl.bindBuffer(gl.ARRAY_BUFFER, modelFlowOverlayBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, dashes, gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);
      gl.vertexAttrib3f(aLineColor, MODEL_FLOW_ARROW_DRAG_COLOR[0], MODEL_FLOW_ARROW_DRAG_COLOR[1], MODEL_FLOW_ARROW_DRAG_COLOR[2]);
      gl.drawArrays(gl.TRIANGLES, 0, dashes.length / 3);
      gl.disable(gl.BLEND);
      gl.uniform1f(uLineAlpha, 1.0);
    }

    // Point/junction dots — gated on showModelFlowPoints alone (independent
    // of "Show arrows"/showModelFlowArrow, which only covers the
    // ribbon/finalized-arrow lines themselves), covering two disjoint sets:
    // finalized arrows (below) and whichever branch is still being drawn
    // (further below, also requires draw mode). Shared uLineModelView/
    // uLineProjection/attrib setup, since both sections use the same
    // identity-projection NDC-marker technique.
    if (showModelFlowPoints && (unselectedPointLists.length > 0 || selectedPointList || (modelFlowDrawMode && modelFlowDrag && modelFlowDrag.points.length > 0))) {
      gl.uniformMatrix4fv(uLineModelView, false, IDENTITY_MAT4);
      gl.uniformMatrix4fv(uLineProjection, false, IDENTITY_MAT4);
      gl.enableVertexAttribArray(aLinePosition);
      gl.enableVertexAttribArray(aLineColor);

      // Finalized arrows: a point is inferred to be a (necessarily already
      // closed) junction purely by appearing in more than one path's own
      // points array — the exact same point object is shared across a
      // session's branches when one resumes from another (see
      // finalizeModelFlowDrag) — so no extra bookkeeping survives
      // finalizing an arrow, this is just reference-counting it back out.
      // Priority when a point qualifies as more than one (e.g. a junction
      // shift-clicked right before the branch it's on was itself finished
      // there): origin > junction > endpoint > plain.
      const finishedPathsPoints = selectedPointList ? [...unselectedPointLists, selectedPointList] : unselectedPointLists;
      if (finishedPathsPoints.length > 0) {
        const originRefs = new Set(finishedOriginPoints);
        const endpointRefs = new Set(finishedPathsPoints.map((points) => points[points.length - 1]));
        const refCounts = new Map();
        for (const points of finishedPathsPoints) {
          for (const p of points) {
            if (originRefs.has(p)) continue; // origin gets its own orange dot below, takes priority over the rest
            refCounts.set(p, (refCounts.get(p) || 0) + 1);
          }
        }
        const finishedPlainPoints = [];
        const finishedJunctionPoints = [];
        const finishedEndpointPoints = [];
        for (const [p, count] of refCounts) {
          if (count >= 2) finishedJunctionPoints.push(p);
          else if (endpointRefs.has(p)) finishedEndpointPoints.push(p);
          else finishedPlainPoints.push(p);
        }
        drawPointMarkerBatch(finishedPlainPoints, combined, MODEL_FLOW_POINT_RADIUS_PX, MODEL_FLOW_POINT_COLOR_CENTER, MODEL_FLOW_POINT_COLOR_EDGE);
        drawPointMarkerBatch(finishedJunctionPoints, combined, MODEL_FLOW_JUNCTION_RADIUS_PX, MODEL_FLOW_JUNCTION_CLOSED_COLOR_CENTER, MODEL_FLOW_JUNCTION_CLOSED_COLOR_EDGE);
        drawPointMarkerBatch(finishedEndpointPoints, combined, MODEL_FLOW_ENDPOINT_RADIUS_PX, MODEL_FLOW_ENDPOINT_COLOR_CENTER, MODEL_FLOW_ENDPOINT_COLOR_EDGE);
        drawPointMarkerBatch(finishedOriginPoints, combined, MODEL_FLOW_ORIGIN_RADIUS_PX, MODEL_FLOW_ORIGIN_COLOR_CENTER, MODEL_FLOW_ORIGIN_COLOR_EDGE);
      }

      // The arrow currently being drawn (see the draw-mode pointerdown
      // handler) — every point from every branch in this session, not just
      // the current one, so a closed-off junction's point stays visibly
      // marked while its sibling branch is being drawn. Only while draw
      // mode is on, so these never linger once nothing's actually mid-drag.
      if (modelFlowDrawMode && modelFlowDrag && modelFlowDrag.points.length > 0) {
        const unfinishedJunctionPoints = [
          ...modelFlowDrag.pendingJunctions.map((j) => j.point),
          // Still unfinished the moment it's resumed (popped off
          // pendingJunctions) and until the branch drawn from it actually
          // completes — see closedJunctions in finalizeModelFlowDrag.
          ...(modelFlowDrag.startingJunction && !modelFlowDrag.closedJunctions.includes(modelFlowDrag.startingJunction)
            ? [modelFlowDrag.startingJunction.point]
            : []),
        ];
        const closedJunctionPoints = modelFlowDrag.closedJunctions.map((j) => j.point);
        const junctionPointRefs = new Set([...unfinishedJunctionPoints, ...closedJunctionPoints]);

        // The session's one true source point: the very first point of the
        // very first branch (the one branch — current or already completed
        // — whose own startingJunction is null, i.e. it never resumed from
        // anywhere). Excluded below like the junctions, for its own black dot.
        const dragOriginBranch = modelFlowDrag.startingJunction === null
          ? modelFlowDrag
          : modelFlowDrag.completedBranches.find((b) => b.startingJunction === null);
        const dragOriginPoint = dragOriginBranch ? dragOriginBranch.points[0] : null;

        // Plain click points exclude junctions and the origin — those get
        // their own red/yellow/black dot below instead of a generic white one.
        const allDragPoints = modelFlowDrag.completedBranches
          .flatMap((b) => b.points)
          .concat(modelFlowDrag.points)
          .filter((p) => !junctionPointRefs.has(p) && p !== dragOriginPoint);

        drawPointMarkerBatch(allDragPoints, combined, MODEL_FLOW_POINT_RADIUS_PX, MODEL_FLOW_POINT_COLOR_CENTER, MODEL_FLOW_POINT_COLOR_EDGE);
        drawPointMarkerBatch(unfinishedJunctionPoints, combined, MODEL_FLOW_JUNCTION_RADIUS_PX, MODEL_FLOW_JUNCTION_UNFINISHED_COLOR_CENTER, MODEL_FLOW_JUNCTION_UNFINISHED_COLOR_EDGE);
        drawPointMarkerBatch(closedJunctionPoints, combined, MODEL_FLOW_JUNCTION_RADIUS_PX, MODEL_FLOW_JUNCTION_CLOSED_COLOR_CENTER, MODEL_FLOW_JUNCTION_CLOSED_COLOR_EDGE);
        drawPointMarkerBatch(dragOriginPoint ? [dragOriginPoint] : [], combined, MODEL_FLOW_ORIGIN_RADIUS_PX, MODEL_FLOW_ORIGIN_COLOR_CENTER, MODEL_FLOW_ORIGIN_COLOR_EDGE);
      }
    }

    // Pivot orb + floor guide (see buildPivotOrbNDC/buildDashedLineNDC
    // above): object-space location of the point drag/hover rotation and
    // zoom pivot around — the model's own center offset by the inverse of
    // the current pan (see getObjectSpacePan's comment for why that's the
    // pivot), or the active camera target's centroid when one's selected,
    // since that's what camera-target mode locks to screen-center instead.
    {
      const activeTargetName = cameraTargetActiveIndex !== null ? cameraTargetSlots[cameraTargetActiveIndex] : null;
      const pivotObj = activeTargetName ? cameraTargetCurrent : [-panX / s, -panY / s, -panZ / s];
      gl.uniformMatrix4fv(uLineModelView, false, IDENTITY_MAT4);
      gl.uniformMatrix4fv(uLineProjection, false, IDENTITY_MAT4);

      // Dashed line down to the floor (object-space Y=0), skipped once the
      // pivot's basically already on it — a near-zero-length dashed line is
      // just visual noise.
      if (Math.abs(pivotObj[1]) > 1e-4) {
        const floorObj = [pivotObj[0], 0, pivotObj[2]];
        const dashes = buildDashedLineNDC(
          pivotObj, floorObj, combined, canvas.width, canvas.height,
          PIVOT_FLOOR_LINE_HALF_WIDTH_PX, PIVOT_FLOOR_DASH_LENGTH_PX, PIVOT_FLOOR_DASH_GAP_PX,
        );
        gl.bindBuffer(gl.ARRAY_BUFFER, pivotFloorLineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, dashes, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aLinePosition);
        gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);
        gl.disableVertexAttribArray(aLineColor);
        gl.vertexAttrib3f(aLineColor, PIVOT_FLOOR_LINE_COLOR[0], PIVOT_FLOOR_LINE_COLOR[1], PIVOT_FLOOR_LINE_COLOR[2]);
        gl.drawArrays(gl.TRIANGLES, 0, dashes.length / 3);
      }

      const cx = combined[0] * pivotObj[0] + combined[4] * pivotObj[1] + combined[8] * pivotObj[2] + combined[12];
      const cy = combined[1] * pivotObj[0] + combined[5] * pivotObj[1] + combined[9] * pivotObj[2] + combined[13];
      const cz = combined[2] * pivotObj[0] + combined[6] * pivotObj[1] + combined[10] * pivotObj[2] + combined[14];
      const orb = buildPivotOrbNDC([cx, cy, cz], canvas.width, canvas.height, PIVOT_ORB_RADIUS_PX);
      gl.bindBuffer(gl.ARRAY_BUFFER, pivotOrbBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, orb, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aLinePosition);
      gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(aLineColor);
      gl.vertexAttribPointer(aLineColor, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, orb.length / 6);
    }
  }

  // Composite the blurred flow-pulse bloom (see the glow-only render+blur
  // pass above) additively over the finished frame — last thing drawn
  // before the (separate, 2D-canvas) axis gizmo, so it sits on top of the
  // fill/wireframe/arrow overlays/pivot orb alike.
  if (flowActive) {
    gl.useProgram(postProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, postTriangleBuffer);
    gl.enableVertexAttribArray(aPostPosition);
    gl.vertexAttribPointer(aPostPosition, 2, gl.FLOAT, false, 0, 0);
    // A fullscreen additive pass has no business depth-testing against
    // whatever the real scene left in the depth buffer — every pixel of the
    // bloom should add, regardless of what's nearest there.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawPostPass(bloomBlurB, null, [0, 0]); // direction (0,0): unblurred copy (see BLUR_FRAGMENT_SHADER)
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }

  drawAxisGizmo(rx, ry);
}

// Dynamic resolution scaling: canvas's WebGL backing store renders at up to
// full native resolution (sharpest) by default, but the frame-time monitor
// (see updateDynamicRenderScale, driven from recordAndDisplayFrameTiming
// below) steps `renderScale` down when sustained frame time runs over the
// 60fps budget, and back up once there's sustained recovery — so quality
// only ever drops when the hardware genuinely can't keep up, never
// preemptively, and recovers automatically once it can again. Applied
// uniformly to both dimensions (see applyCanvasSize/resize) so it can never
// distort the aspect ratio updateCubeProjection is relying on.
const RENDER_SCALE_MIN = 0.5;
// Safety ceiling on the larger backing-store axis (e.g. a very large
// display at full DPR) — re-renders every frame, so an unbounded backing
// store costs real GPU time regardless of scene complexity. Scales both
// dimensions by the same factor when hit (see resize), so it can't distort
// aspect ratio the way clamping each axis independently would.
const CANVAS_MAX_DIMENSION = 4096;
let renderScale = 1;
let canvasBaseWidth = 0;
let canvasBaseHeight = 0;

function applyCanvasSize() {
  canvas.width = Math.max(1, Math.round(canvasBaseWidth * renderScale));
  canvas.height = Math.max(1, Math.round(canvasBaseHeight * renderScale));
}

// Photo mode export (see photoMode/capturePhoto): the larger axis of the
// exported PNG, in pixels — the other axis follows from the current
// viewport's own aspect ratio (window.innerWidth/innerHeight), so the photo
// frames identically to whatever's on screen, just at a fixed high
// resolution instead of whatever DPR/renderScale the live canvas happens to
// be running at.
const PHOTO_EXPORT_MAX_DIMENSION = 3840;

// Temporarily renders one frame at PHOTO_EXPORT_MAX_DIMENSION resolution and
// downloads it as a PNG, then restores the live backing-store size. Resizing
// `canvas.width`/`height` (rather than adding a separate offscreen canvas)
// keeps this on the exact same draw path — gl.viewport in renderCubeFrame
// reads canvas.width/height directly — and since the target keeps the
// current window's aspect ratio, cubeProjectionHalfX/Y (set for that same
// aspect by the last resize()) are already correct with no need to
// recompute them.
//
// canvas.toBlob snapshots the drawing buffer synchronously at the moment
// it's called (the actual PNG encode happens async, off that snapshot) —
// gl was created without preserveDrawingBuffer, so this only works because
// the resize-back below runs after that synchronous snapshot, not before.
function capturePhoto() {
  const aspect = window.innerWidth / window.innerHeight;
  canvas.width = aspect >= 1 ? PHOTO_EXPORT_MAX_DIMENSION : Math.round(PHOTO_EXPORT_MAX_DIMENSION * aspect);
  canvas.height = aspect >= 1 ? Math.round(PHOTO_EXPORT_MAX_DIMENSION / aspect) : PHOTO_EXPORT_MAX_DIMENSION;
  renderCubeFrame();

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bluprint-model-${Date.now()}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');

  // Back to the live resolution immediately, so nothing looks broken on the
  // next composite — see the function comment above for why this is safe to
  // do before the async encode above has actually finished.
  applyCanvasSize();
  renderCubeFrame();
}

function resize() {
  const rawWidth = Math.round(window.innerWidth * DPR);
  const rawHeight = Math.round(window.innerHeight * DPR);
  const capScale = Math.min(1, CANVAS_MAX_DIMENSION / Math.max(rawWidth, rawHeight));
  canvasBaseWidth = Math.round(rawWidth * capScale);
  canvasBaseHeight = Math.round(rawHeight * capScale);
  applyCanvasSize();
  // Aspect comes from the CSS/display size, not the (possibly capped or
  // render-scaled) backing store — capScale and renderScale both apply
  // uniformly to width and height, so the backing store's aspect always
  // matches this regardless of either one.
  updateCubeProjection(window.innerWidth / window.innerHeight);
}

// A pixel counts as "mainly green" if that channel is dominant by a clear
// margin — avoids flagging grays/whites where channels are close. Used to
// detect green materials on the loaded model (see parseObj) and to shade
// blueprint mode's green-flagged parts.
const GREEN_DOMINANCE_MARGIN = 20;

function isGreenDominant(r, g, b) {
  return g - r > GREEN_DOMINANCE_MARGIN && g - b > GREEN_DOMINANCE_MARGIN;
}

// Maps a material name to one of the shader's technical-fill patterns (see
// aFillPattern / fillPatternUV) by name rather than by color, so it doesn't
// collide with GREEN_DOMINANCE_MARGIN or any other color-based rule — in
// Blender, assign the target face(s) a material named "Hatch", "Dot"
// (or "Dots"), or "Plus" (or "Cross") — case-insensitive, and tolerant of
// Blender's ".001"-style de-dupe suffixes — and it'll come through here as
// pattern 1, 2, or 3 respectively; anything else is 0 (no fill pattern).
// Each has its own frequency (and, for dots/plus, size) control, but all
// three share the same fill color — see uHatchLineColor.
function materialFillPatternId(name) {
  // Blender appends ".001", ".002", etc. to de-duplicate material names when
  // appending/merging scenes that each define their own "Hatch"/"Dot"/"Plus"
  // material — strip that suffix before matching so e.g. a merged file's
  // "Hatch.003" still resolves the same as a plain "Hatch".
  const trimmed = name.trim().toLowerCase().replace(/\.\d{3}$/, '');
  if (trimmed === 'hatch') return 1;
  if (trimmed === 'dot' || trimmed === 'dots') return 2;
  if (trimmed === 'plus' || trimmed === 'cross') return 3;
  return 0;
}

// FPS/frame-time overlay (top-center, see #perf-monitor in index.html).
// Written straight to the DOM via textContent rather than through the React
// panel/state, since that updates every frame — funneling it through React
// state would mean a full component re-render 60 times a second for a
// display the panel itself has no other reason to know about.
const perfMonitorEl = document.getElementById('perf-monitor-text');
const PERF_DISPLAY_UPDATE_MS = 250; // readable refresh rate; measurement itself is still per-frame
let perfLastFrameTime = performance.now();
let perfFrameCount = 0;
let perfFrameTimeSum = 0;
let perfLastDisplayUpdate = perfLastFrameTime;

// Rolling FPS sparkline (last 10s) — one point per display update, so a
// dropped-frame stretch shows up as a visible dip instead of getting
// smoothed away by the running min/max text above it.
const perfHistoryCanvas = document.getElementById('perf-history');
const perfHistoryCtx = perfHistoryCanvas.getContext('2d');
const PERF_HISTORY_WINDOW_MS = 10000;
const PERF_HISTORY_DPR = Math.max(1, window.devicePixelRatio || 1);
perfHistoryCanvas.width = perfHistoryCanvas.clientWidth * PERF_HISTORY_DPR || perfHistoryCanvas.width;
perfHistoryCanvas.height = perfHistoryCanvas.clientHeight * PERF_HISTORY_DPR || perfHistoryCanvas.height;
let perfHistory = []; // { time, fps }[], oldest first

function drawPerfHistory() {
  const w = perfHistoryCanvas.width;
  const h = perfHistoryCanvas.height;
  perfHistoryCtx.clearRect(0, 0, w, h);
  if (perfHistory.length < 2) return;

  const now = perfHistory[perfHistory.length - 1].time;
  const windowStart = now - PERF_HISTORY_WINDOW_MS;
  // Ceiling follows the session's peak (at least the 60fps target) so the
  // chart stays meaningful on both capped-60 and high-refresh displays,
  // while a fixed floor of 0 keeps drop severity visually comparable.
  const ceiling = Math.max(60, perfMaxFps === -Infinity ? 60 : perfMaxFps);
  const x = (t) => ((t - windowStart) / PERF_HISTORY_WINDOW_MS) * w;
  const y = (fps) => h - (Math.min(fps, ceiling) / ceiling) * h;

  // 60fps target reference line.
  perfHistoryCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  perfHistoryCtx.lineWidth = 1;
  perfHistoryCtx.setLineDash([2 * PERF_HISTORY_DPR, 2 * PERF_HISTORY_DPR]);
  perfHistoryCtx.beginPath();
  const targetY = Math.round(y(60)) + 0.5;
  perfHistoryCtx.moveTo(0, targetY);
  perfHistoryCtx.lineTo(w, targetY);
  perfHistoryCtx.stroke();
  perfHistoryCtx.setLineDash([]);

  // Filled area under the line, tinted red wherever a point drops below
  // the target — the fill (not just the line) is what makes a brief dip
  // readable at a glance in a 140x32 sparkline.
  perfHistoryCtx.beginPath();
  perfHistoryCtx.moveTo(x(perfHistory[0].time), h);
  for (const point of perfHistory) perfHistoryCtx.lineTo(x(point.time), y(point.fps));
  perfHistoryCtx.lineTo(x(perfHistory[perfHistory.length - 1].time), h);
  perfHistoryCtx.closePath();
  perfHistoryCtx.fillStyle = 'rgba(120, 220, 255, 0.18)';
  perfHistoryCtx.fill();

  perfHistoryCtx.lineWidth = 1.5 * PERF_HISTORY_DPR;
  perfHistoryCtx.lineJoin = 'round';
  perfHistoryCtx.beginPath();
  perfHistory.forEach((point, i) => {
    const px = x(point.time);
    const py = y(point.fps);
    if (i === 0) perfHistoryCtx.moveTo(px, py);
    else perfHistoryCtx.lineTo(px, py);
  });
  perfHistoryCtx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
  perfHistoryCtx.stroke();

  // Mark every below-target sample with a dot (not just runs of them) so a
  // single dropped frame is still visible in a sparkline this dense.
  perfHistoryCtx.fillStyle = 'rgba(255, 90, 90, 0.9)';
  for (const point of perfHistory) {
    if (point.fps >= 60) continue;
    perfHistoryCtx.beginPath();
    perfHistoryCtx.arc(x(point.time), y(point.fps), 1.5 * PERF_HISTORY_DPR, 0, Math.PI * 2);
    perfHistoryCtx.fill();
  }
}
// Session-long min/max (since page load), shown next to each current
// reading so a viewer can see the actual observed range, not just the
// instantaneous value — e.g. a brief stall during a model upload shows up
// as a low FPS / high ms bound that persists rather than disappearing on
// the next display refresh.
let perfMinFps = Infinity;
let perfMaxFps = -Infinity;
let perfMinMs = Infinity;
let perfMaxMs = -Infinity;

// Drives renderScale (see applyCanvasSize/resize above): steps
// resolution down after a sustained run of over-budget display windows,
// steps it back up after a longer sustained run of meeting-or-beating the
// 60fps target (recovering more cautiously than it drops — a longer
// sustained window, not a stricter frame-time margin — so it doesn't flap
// between two resolutions right at the boundary). Recovery deliberately
// checks against the plain target rather than requiring comfortable
// headroom below it: a lower render scale is calibrated to land right
// around 60fps by design, so it rarely runs meaningfully *faster* than
// target — requiring that (as an earlier version of this logic did) meant
// recovery almost never fired once scale had dropped. The first few
// windows after load are ignored — first paint/shader compile is a
// one-off cost, not a sign the hardware can't sustain 60fps once warmed up.
const TARGET_FRAME_MS = 1000 / 60;
const RENDER_SCALE_STEP = 0.1;
const RENDER_SCALE_DOWN_WINDOWS = 2; // ~500ms over budget before dropping resolution
const RENDER_SCALE_UP_WINDOWS = 8; // ~2s at/under target before restoring it
const RENDER_SCALE_WARMUP_WINDOWS = 4; // ~1s ignored after load
let perfWindowCount = 0;
let overBudgetWindows = 0;
let underBudgetWindows = 0;

function updateDynamicRenderScale(avgFrameMs) {
  perfWindowCount++;
  if (perfWindowCount <= RENDER_SCALE_WARMUP_WINDOWS) return;

  if (avgFrameMs > TARGET_FRAME_MS * 1.15) {
    overBudgetWindows++;
    underBudgetWindows = 0;
  } else if (avgFrameMs < TARGET_FRAME_MS) {
    underBudgetWindows++;
    overBudgetWindows = 0;
  } else {
    overBudgetWindows = 0;
    underBudgetWindows = 0;
  }

  if (overBudgetWindows >= RENDER_SCALE_DOWN_WINDOWS && renderScale > RENDER_SCALE_MIN) {
    renderScale = Math.max(RENDER_SCALE_MIN, renderScale - RENDER_SCALE_STEP);
    applyCanvasSize();
    overBudgetWindows = 0;
  } else if (underBudgetWindows >= RENDER_SCALE_UP_WINDOWS && renderScale < 1) {
    renderScale = Math.min(1, renderScale + RENDER_SCALE_STEP);
    applyCanvasSize();
    underBudgetWindows = 0;
  }
}

function recordAndDisplayFrameTiming(now) {
  // The initial call below (`renderLoop()`, ahead of the rAF-driven ones)
  // passes no timestamp — fall back to performance.now() so that first
  // frame doesn't compute a NaN delta.
  now = now ?? performance.now();
  const frameMs = now - perfLastFrameTime;
  perfLastFrameTime = now;
  perfFrameCount++;
  perfFrameTimeSum += frameMs;

  if (now - perfLastDisplayUpdate >= PERF_DISPLAY_UPDATE_MS) {
    const avgFrameMs = perfFrameTimeSum / perfFrameCount;
    const fps = 1000 / avgFrameMs;
    perfMinFps = Math.min(perfMinFps, fps);
    perfMaxFps = Math.max(perfMaxFps, fps);
    perfMinMs = Math.min(perfMinMs, avgFrameMs);
    perfMaxMs = Math.max(perfMaxMs, avgFrameMs);
    updateDynamicRenderScale(avgFrameMs);
    perfMonitorEl.textContent =
      `${Math.round(renderScale * 100)}% res\n` +
      `${avgFrameMs.toFixed(1)} ms (${perfMinMs.toFixed(1)}–${perfMaxMs.toFixed(1)})\n` +
      `${fps.toFixed(0)} FPS (${perfMinFps.toFixed(0)}–${perfMaxFps.toFixed(0)})`;

    perfHistory.push({ time: now, fps });
    const historyStart = now - PERF_HISTORY_WINDOW_MS;
    while (perfHistory.length > 0 && perfHistory[0].time < historyStart) perfHistory.shift();
    drawPerfHistory();

    perfLastDisplayUpdate = now;
    perfFrameCount = 0;
    perfFrameTimeSum = 0;
  }
}

function renderLoop(now) {
  renderCubeFrame();
  recordAndDisplayFrameTiming(now);
  requestAnimationFrame(renderLoop);
}

// --- Init -----------------------------------------------------------------

window.addEventListener('resize', resize);
resize();
renderLoop();
loadBundledDefaultModel();

// --- React control panel bridge --------------------------------------------
//
// The one seam between this module (plain WebGL/canvas state) and the
// control panel (src/panel.tsx, a React/coss-ui component tree that owns its
// own UI state). `getInitialState` seeds the panel on mount; `subscribe`
// delivers changes this module makes on its own (a model finishing upload
// flips `customModelReady`/`cubeModelStatus`); the rest are the setters the
// panel calls in response to user interaction.
export const controls = {
  getInitialState() {
    return {
      pulseWidth: pulseWidthValue,
      flowPulseFrequency: flowPulseFrequencyValue,
      flowPulseFrequencyMin: FLOW_PULSE_FREQUENCY_MIN,
      flowPulseFrequencyMax: FLOW_PULSE_FREQUENCY_MAX,
      flowSpeed: flowSpeedPercent,
      flowSpeedMin: FLOW_SPEED_MIN,
      flowSpeedMax: FLOW_SPEED_MAX,
      flowCoreLength: flowCoreLengthPercent,
      flowCoreLengthMin: FLOW_CORE_LENGTH_MIN,
      flowCoreLengthMax: FLOW_CORE_LENGTH_MAX,
      flowTailLength: flowTailLengthPercent,
      flowTailLengthMin: FLOW_TAIL_LENGTH_MIN,
      flowTailLengthMax: FLOW_TAIL_LENGTH_MAX,
      flowTailFalloff: flowTailFalloffValue,
      flowTailFalloffMin: FLOW_TAIL_FALLOFF_MIN,
      flowTailFalloffMax: FLOW_TAIL_FALLOFF_MAX,
      glowIntensity: glowIntensityPercent,
      glowIntensityMin: GLOW_INTENSITY_MIN,
      glowIntensityMax: GLOW_INTENSITY_MAX,
      glowSize: glowSizePercent,
      glowSizeMin: GLOW_SIZE_MIN,
      glowSizeMax: GLOW_SIZE_MAX,
      cubeSize: cubeSizePercent,
      cubeSizeMin: CUBE_SIZE_MIN,
      cubeSizeMax: CUBE_SIZE_MAX,
      modelOffsetX: modelOffsetXPercent,
      modelOffsetY: modelOffsetYPercent,
      modelOffsetMin: MODEL_POSITION_MIN,
      modelOffsetMax: MODEL_POSITION_MAX,
      lightAzimuth: lightAzimuthValue,
      lightElevation: lightElevationValue,
      lightAzimuthMin: LIGHT_AZIMUTH_MIN,
      lightAzimuthMax: LIGHT_AZIMUTH_MAX,
      lightElevationMin: LIGHT_ELEVATION_MIN,
      lightElevationMax: LIGHT_ELEVATION_MAX,
      lightIntensity: lightIntensityPercent,
      lightIntensityMin: LIGHT_INTENSITY_MIN,
      lightIntensityMax: LIGHT_INTENSITY_MAX,
      blueprintEnabled,
      shaderTheme,
      lineFrequency: lineFrequencyValue,
      lineFrequencyMin: LINE_FREQUENCY_MIN,
      lineFrequencyMax: LINE_FREQUENCY_MAX,
      dotFrequency: dotFrequencyValue,
      dotFrequencyMin: DOT_FREQUENCY_MIN,
      dotFrequencyMax: DOT_FREQUENCY_MAX,
      dotSize: dotSizePercent,
      dotSizeMin: DOT_SIZE_MIN,
      dotSizeMax: DOT_SIZE_MAX,
      plusFrequency: plusFrequencyValue,
      plusFrequencyMin: PLUS_FREQUENCY_MIN,
      plusFrequencyMax: PLUS_FREQUENCY_MAX,
      plusSize: plusSizePercent,
      plusSizeMin: PLUS_SIZE_MIN,
      plusSizeMax: PLUS_SIZE_MAX,
      hoverMovementPaused,
      rotationDisabled,
      showModelFlowPoints,
      ...getModelState(),
    };
  },
  subscribe(listener) {
    modelStateListeners.push(listener);
    return () => {
      const i = modelStateListeners.indexOf(listener);
      if (i !== -1) modelStateListeners.splice(i, 1);
    };
  },
  setPulseWidth,
  setFlowPulseFrequency,
  setFlowSpeedPercent,
  setFlowCoreLengthPercent,
  setFlowTailLengthPercent,
  setFlowTailFalloff,
  setGlowIntensityPercent,
  setGlowSizePercent,
  setCubeSizePercent,
  setModelOffsetXPercent,
  setModelOffsetYPercent,
  resetModelPosition,
  setLightAzimuth,
  setLightElevation,
  setLightIntensityPercent,
  setBlueprintEnabled,
  setShaderTheme,
  setLineFrequency,
  setDotFrequency,
  setDotSizePercent,
  setPlusFrequency,
  setPlusSizePercent,
  loadModelFiles: (files) => loadModelFromFiles(files),
  setModelFlowDraw,
  setModelFlowSelectMode,
  deleteSelectedModelFlowArrow,
  reverseSelectedFlowArrow,
  setFlowArrowObjectEnabled,
  clearModelFlow: clearModelFlowPath,
  undoModelFlowArrow: undoLastModelFlowArrow,
  setModelFlowArrowVisible,
  setModelFlowPointsVisible,
  setHoverMovementPaused,
  setRotationDisabled,
  resetRotation: resetCubeRotation,
  setCameraTargetSlot,
  goToCameraTarget,
  resetCameraTarget,
  setShowCameraTargetBoxes,
  setEditingDefaultView,
  goToDefaultCameraView,
};
