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

// One-time migration: the dot fill's defaults changed (frequency 1 -> 9,
// size 16% -> 5%) — same reasoning as the cubeSize migration above.
const DOT_DEFAULTS_RESET_MIGRATION_KEY = 'iconMosaic.dotDefaultsResetV1';
if (!localStorage.getItem(DOT_DEFAULTS_RESET_MIGRATION_KEY)) {
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'dotFrequency');
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'dotSize');
  localStorage.setItem(DOT_DEFAULTS_RESET_MIGRATION_KEY, '1');
}

// One-time migration: the plus fill's default frequency changed 1 -> 11 —
// same reasoning as the cubeSize/dot migrations above.
const PLUS_DEFAULTS_RESET_MIGRATION_KEY = 'iconMosaic.plusDefaultsResetV1';
if (!localStorage.getItem(PLUS_DEFAULTS_RESET_MIGRATION_KEY)) {
  localStorage.removeItem(SLIDER_STORAGE_PREFIX + 'plusFrequency');
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
let pulseWidthValue = restoreNumber('pulseWidth', 6);
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
let flowSpeedPercent = restoreNumber('flowSpeed', 40);

function setFlowSpeedPercent(value) {
  const clamped = Math.max(FLOW_SPEED_MIN, Math.min(FLOW_SPEED_MAX, value));
  flowSpeedPercent = clamped;
  persistNumber('flowSpeed', clamped);
  return clamped;
}

// Cube mode's model size, as a percentage multiplier on top of CUBE_SCALE
// (see renderCubeFrame) — 100 (the default) = CUBE_SCALE unchanged, up to
// 1000 = 10x that. Applies equally to the built-in cube and any uploaded
// custom model, since both go through the same modelView scale step.
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
let lineFrequencyValue = restoreNumber('lineFrequency', 1);

function setLineFrequency(value) {
  const clamped = Math.max(LINE_FREQUENCY_MIN, Math.min(LINE_FREQUENCY_MAX, value));
  lineFrequencyValue = clamped;
  persistNumber('lineFrequency', clamped);
  return clamped;
}

const DOT_FREQUENCY_MIN = 1;
const DOT_FREQUENCY_MAX = 60;
let dotFrequencyValue = restoreNumber('dotFrequency', 9);

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
let plusFrequencyValue = restoreNumber('plusFrequency', 11);

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
let plusSizePercent = restoreNumber('plusSize', 20);

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

// --- Source: rotating WebGL cube (the only mode this app renders) ---------

// --- Rotating cube, rendered with plain WebGL --------------------------

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
  varying vec3 vPosition;
  varying float vFillPattern;
  uniform vec3 uLightDir;
  uniform float uLightIntensity;
  uniform bool uBlueprint;
  uniform vec3 uBlueprintFillColor;
  uniform vec3 uBlueprintFillColorGreen;
  uniform bool uFlowActive;
  uniform float uFlowPulseCenter;
  uniform float uFlowSigma;
  uniform vec3 uFlowColor;
  uniform vec3 uHatchLineColor;
  uniform float uLineFrequency;
  uniform float uDotFrequency;
  uniform float uDotRadius;
  uniform float uPlusFrequency;
  uniform float uPlusArmHalf;
  uniform float uPlusThickness;

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
  void main() {
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
    // Traveling energy-pulse glow along a user-drawn arrow, restricted to
    // green (flagged) parts that some arrow actually touches — a Gaussian
    // band that travels along the arrow over time, driven by a 3D arc-length
    // coordinate (aFlowCoord). Vertices on a green part no arrow was ever
    // drawn on get a negative aFlowCoord (see recomputeModelFlowCoords) so
    // they never light up, rather than defaulting to 0 and falsely flashing
    // whenever the pulse happens to pass near the start of some other part's
    // arrow.
    if (uBlueprint && uFlowActive && vIsGreen > 0.5 && vFlowCoord >= 0.0) {
      float d = vFlowCoord - uFlowPulseCenter;
      float intensity = exp(-(d * d) / (2.0 * uFlowSigma * uFlowSigma));
      color += uFlowColor * intensity;
    }
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

// 24 vertices (4 per face) so each face gets its own flat normal.
// prettier-ignore
const CUBE_POSITIONS = new Float32Array([
  -1,-1, 1,  1,-1, 1,  1, 1, 1, -1, 1, 1, // front
  -1,-1,-1, -1, 1,-1,  1, 1,-1,  1,-1,-1, // back
  -1, 1,-1, -1, 1, 1,  1, 1, 1,  1, 1,-1, // top
  -1,-1,-1,  1,-1,-1,  1,-1, 1, -1,-1, 1, // bottom
   1,-1,-1,  1, 1,-1,  1, 1, 1,  1,-1, 1, // right
  -1,-1,-1, -1,-1, 1, -1, 1, 1, -1, 1,-1, // left
]);

// prettier-ignore
const CUBE_NORMALS = new Float32Array([
   0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
   0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
   0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
   0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
   1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
  -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
]);

// prettier-ignore
const CUBE_INDICES = new Uint16Array([
   0, 1, 2,  0, 2, 3,
   4, 5, 6,  4, 6, 7,
   8, 9,10,  8,10,11,
  12,13,14, 12,14,15,
  16,17,18, 16,18,19,
  20,21,22, 20,22,23,
]);

const cubePositionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_POSITIONS, gl.STATIC_DRAW);

const cubeNormalBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_NORMALS, gl.STATIC_DRAW);

// The built-in cube has no material data, so it feeds the shader flat white
// (brightness * white == the old plain-grayscale look, unchanged) — this is
// what aColor defaults to for anything that isn't a custom model carrying
// real Kd colors from a .mtl file.
const CUBE_COLORS = new Float32Array(24 * 3).fill(1);
const cubeColorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeColorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_COLORS, gl.STATIC_DRAW);

// Same reasoning as CUBE_COLORS: the built-in cube has no material data, so
// it's never green (blueprint mode's green-fill/black-edge treatment only
// ever applies to a loaded custom model's green materials).
const CUBE_IS_GREEN = new Float32Array(24).fill(0);
const cubeIsGreenBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeIsGreenBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_IS_GREEN, gl.STATIC_DRAW);

// Same reasoning as CUBE_IS_GREEN: the built-in cube has no materials, so it
// never gets a fill pattern — only a loaded custom model's "Hatch"/"Dot"/
// "Plus"-named materials do (see materialFillPatternId).
const CUBE_FILL_PATTERN = new Float32Array(24).fill(0);
const cubeFillPatternBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeFillPatternBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_FILL_PATTERN, gl.STATIC_DRAW);

const cubeIndexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, CUBE_INDICES, gl.STATIC_DRAW);

// Two selectable blueprint palettes (see shaderTheme/setShaderTheme above) —
// "dark" is the original navy fill with gray wireframe lines, "light" is a
// pale gray fill with dark navy wireframe lines. Green-material parts (see
// isGreenDominant) ignore both and always get a green fill
// (BLUEPRINT_FILL_COLOR_GREEN) with black edges (BLUEPRINT_LINE_COLOR_GREEN_PART)
// so they read as a distinct, "called out" element regardless of theme.
// Defined here (ahead of CUBE_LINES below, which needs these at load time)
// rather than down near the other uniform lookups.
const BLUEPRINT_THEMES = {
  dark: {
    bg: [0.02, 0.09, 0.2],
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

// triIsGreen (optional) is one boolean per triangle (triIndices.length / 3);
// an edge renders in BLUEPRINT_LINE_COLOR_GREEN_PART (black) if any triangle
// using it is flagged green (see isGreenDominant) — e.g. ngen.mtl's
// EV_charger_body_green / shared_pipe_green parts — otherwise the default
// gray. Omit it (as the built-in cube does, having no material data) for an
// all-default-color wireframe.
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
    const isGreen = !!(triIsGreen && triIsGreen[t]);

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

const CUBE_LINES = buildCreaseEdgeLines(CUBE_POSITIONS, CUBE_INDICES);
const cubeLineBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeLineBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_LINES.positions, gl.STATIC_DRAW);
const cubeLineColorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeLineColorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_LINES.colors, gl.STATIC_DRAW);
const cubeLineVertexCount = CUBE_LINES.positions.length / 3;

// Re-uploads cubeLineColorBuffer/customModelLineColorBuffer from the cached
// per-edge isGreen flags (edge geometry never changes on a theme switch,
// only which color each non-green edge gets) — see setShaderTheme.
function refreshBlueprintLineColors() {
  const lineColor = BLUEPRINT_THEMES[shaderTheme].line;
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeLineColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, buildLineColors(CUBE_LINES.isGreen, lineColor), gl.STATIC_DRAW);
  if (customModelLineIsGreenCache) {
    gl.bindBuffer(gl.ARRAY_BUFFER, customModelLineColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, buildLineColors(customModelLineIsGreenCache, lineColor), gl.STATIC_DRAW);
  }
}

const cubeFlowCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeFlowCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(24), gl.STATIC_DRAW);

const aPosition = gl.getAttribLocation(cubeProgram, 'aPosition');
const aNormal = gl.getAttribLocation(cubeProgram, 'aNormal');
const aColor = gl.getAttribLocation(cubeProgram, 'aColor');
const aIsGreen = gl.getAttribLocation(cubeProgram, 'aIsGreen');
const aFlowCoord = gl.getAttribLocation(cubeProgram, 'aFlowCoord');
const aFillPattern = gl.getAttribLocation(cubeProgram, 'aFillPattern');
const uModelView = gl.getUniformLocation(cubeProgram, 'uModelView');
const uProjection = gl.getUniformLocation(cubeProgram, 'uProjection');
const uLightDir = gl.getUniformLocation(cubeProgram, 'uLightDir');
const uLightIntensity = gl.getUniformLocation(cubeProgram, 'uLightIntensity');
const uBlueprint = gl.getUniformLocation(cubeProgram, 'uBlueprint');
const uBlueprintFillColor = gl.getUniformLocation(cubeProgram, 'uBlueprintFillColor');
const uBlueprintFillColorGreen = gl.getUniformLocation(cubeProgram, 'uBlueprintFillColorGreen');
const uFlowActive = gl.getUniformLocation(cubeProgram, 'uFlowActive');
const uFlowPulseCenter = gl.getUniformLocation(cubeProgram, 'uFlowPulseCenter');
const uFlowSigma = gl.getUniformLocation(cubeProgram, 'uFlowSigma');
const uFlowColor = gl.getUniformLocation(cubeProgram, 'uFlowColor');
const uHatchLineColor = gl.getUniformLocation(cubeProgram, 'uHatchLineColor');
const uLineFrequency = gl.getUniformLocation(cubeProgram, 'uLineFrequency');
const uDotFrequency = gl.getUniformLocation(cubeProgram, 'uDotFrequency');
const uDotRadius = gl.getUniformLocation(cubeProgram, 'uDotRadius');
const uPlusFrequency = gl.getUniformLocation(cubeProgram, 'uPlusFrequency');
const uPlusArmHalf = gl.getUniformLocation(cubeProgram, 'uPlusArmHalf');
const uPlusThickness = gl.getUniformLocation(cubeProgram, 'uPlusThickness');

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
// the size) — applies equally to the built-in cube and any uploaded custom
// model; the "Model size" slider (cubeSizeScale) multiplies on top of this.
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

let cubeRotX = CUBE_ISO_PITCH;
let cubeRotY = CUBE_ISO_YAW;
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

// Tweens the model to a given rotation angle — both the drag rotation
// (cubeRotX/Y) and the ambient parallax tilt (cubeParallaxX/Y and its
// target) ease toward the target/zero respectively. Animated as a fast ease
// (see the tween applied in renderCubeFrame) rather than an instant jump, so
// it reads as a deliberate snap instead of a jarring cut. Used both for
// snapping back to the default framed angle (resetCubeRotation, below —
// shared by the "Reset rotation" button, enabling "Pause hover movement",
// Shift+R, and Space-up) and for rising into the bird's-eye view on
// Space-down (see the keydown/keyup handlers below).
const CUBE_ROT_RESET_MS = 180; // fast — quicker than the modal open duration, barely more than a frame or two of "not instant"
let cubeRotResetStartTime = null;
let cubeRotResetFrom = null; // { rotX, rotY, parX, parY, parTargetX, parTargetY } snapshot taken at tween start
let cubeRotResetTargetX = CUBE_ISO_PITCH;
let cubeRotResetTargetY = CUBE_ISO_YAW;

function tweenCubeRotationTo(targetRotX, targetRotY) {
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

// "Disable rotation" control: click-and-drag rotation is off by default so
// visitors can't accidentally spin the model away from its framed angle.
let rotationDisabled = true;

function updateCubeCursor() {
  canvas.style.cursor = spaceHeld || zKeyHeld || !rotationDisabled ? 'grab' : 'default';
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
// Cmd/Ctrl+Z, which is the flow-arrow undo shortcut below instead.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyZ' || zKeyHeld || event.metaKey || event.ctrlKey) return;
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
  if (zKeyHeld) {
    zDragging = true;
    zLastPointer = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (spaceHeld) {
    panDragging = true;
    panLastPointer = { x: event.clientX, y: event.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (rotationDisabled) return;
  cubeDragging = true;
  cubeLastPointer = { x: event.clientX, y: event.clientY };
  canvas.style.cursor = 'grabbing';
});

window.addEventListener('pointermove', (event) => {
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
  // Keep the model perfectly still while tracing an arrow onto it, or while
  // trying to click one precisely in select mode — ambient parallax tilt
  // shifting the surface under the cursor would make either one hard to do.
  // Also suspended for as long as Space, R, or Z is held (spaceHeld covers
  // both the pre-drag hold and the pan-drag itself, rKeyHeld the same for
  // rotate-drag, zKeyHeld the same for the height drag) so none of them
  // fight the manual pan/rotate/height-adjust; it simply stops updating its
  // target rather than resetting, so it resumes smoothly from wherever it
  // was once the key is released.
  if (modelFlowDrawMode || modelFlowSelectMode || hoverMovementPaused || spaceHeld || rKeyHeld || zKeyHeld) return;
  const nx = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
  const ny = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1));
  cubeParallaxTargetY = nx * CUBE_PARALLAX_MAX_RAD;
  cubeParallaxTargetX = ny * CUBE_PARALLAX_MAX_RAD;
});

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
// No index buffer: each face's vertices are pushed straight into the
// output arrays in triangle order (matching the built-in cube's own
// approach of duplicating vertices per-face so every face can have its
// own normal), so the model draws with drawArrays rather than
// drawElements.

// Corrective rotation applied to the loaded custom model only (not the
// built-in cube) — the imported model's own axes needed a quarter-turn
// around Y to sit the way we want on screen.
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
  let activeColor = [1, 1, 1]; // no usemtl seen yet (or an unrecognized name) == plain white, same as the built-in cube
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

  // Center (X/Z) and floor (Y) the model, then scale to roughly the same
  // [-1, 1] envelope CUBE_POSITIONS uses, so the same CUBE_SCALE/camera
  // distance frame it similarly regardless of what units the source model
  // was modeled in. Y specifically aligns to the *lowest* point (minY)
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
  // 10x the built-in cube's normalized envelope — a custom model's intended
  // physical size relative to the cube, independent of CUBE_SCALE (which
  // still applies equally on top of this to both the cube and custom models).
  // baseScaleMultiplier (default 1, i.e. no-op) lets a specific caller shrink
  // or grow that intended size further — see loadBundledDefaultModel.
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
    return { name, center: [(ox - cx) * scale, (oy - cy) * scale, (oz - cz) * scale], size };
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
const customModelLineBuffer = gl.createBuffer();
const customModelLineColorBuffer = gl.createBuffer();
let customModelVertexCount = 0;
let customModelLineVertexCount = 0;
let customModelReady = false;
let useCustomModel = false;
let cubeModelStatus = ''; // status text shown next to the file picker

const modelStateListeners = [];

// Camera targets: up to 3 named sub-objects from the loaded .obj (see
// `objects` in parseObj's return value) that the "Go to Object N" panel
// buttons ease the framing toward. cameraTargetSlots holds which object name
// (or null) is assigned to each of the 3 slots; cameraTargetActiveIndex is
// which slot is currently driving the camera, or null to fall back to the
// manual pan sliders as before. cameraTargetCurrent is the eased position
// that chases whichever slot is active (renderCubeFrame, each frame) — this
// is the "null object" the camera stays rigidly offset from: rotation
// (drag + hover) and distance never change when it moves.
let customModelObjects = []; // [{name, center:[x,y,z], size:number}], from parseObj
/** @type {(string | null)[]} */
let cameraTargetSlots = [null, null, null];
let cameraTargetActiveIndex = null;
let cameraTargetCurrent = [0, 0, 0];
// Eased extra scale multiplier applied on top of cubeSizeScale while a
// camera target is active (see renderCubeFrame) — chases 1x whenever no
// target is active, and a target's size-derived goal otherwise, using the
// same smoothing as cameraTargetCurrent so zoom and pan settle together.
let cameraTargetZoomCurrent = 1;
const CAMERA_TARGET_SMOOTHING = 0.05;
// Object size (bounding-box diagonal, same normalized units as parseObj's
// `size`) at which camera-target zoom is 1x — 25% of the ~20-unit
// whole-model envelope every model is normalized to (see parseObj's
// `scale`). Smaller targets zoom in past 1x, larger ones zoom out below it.
const CAMERA_TARGET_ZOOM_REFERENCE_SIZE = 5;
const CAMERA_TARGET_ZOOM_MIN = 0.01;
const CAMERA_TARGET_ZOOM_MAX = 5;

function getModelState() {
  return {
    spaceHeld,
    rotationDisabled,
    // Included so schedulePanSync/flushPanSync's notifyModelState() (fired
    // continuously while Space-dragging) keeps the "Model X/Y position"
    // sliders live-in-sync with the drag, not just on the next full reload
    // (getInitialState reads these too, but that's only read once on mount).
    modelOffsetX: modelOffsetXPercent,
    modelOffsetY: modelOffsetYPercent,
    customModelReady,
    useCustomModel,
    cubeModelStatus,
    customModelObjectNames: customModelObjects.map((o) => o.name),
    cameraTargetSlots,
    cameraTargetActiveIndex,
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
  };
}

function setCameraTargetSlot(slotIndex, objectName) {
  cameraTargetSlots = cameraTargetSlots.map((v, i) => (i === slotIndex ? objectName || null : v));
  if (cameraTargetActiveIndex === slotIndex && !objectName) cameraTargetActiveIndex = null;
  notifyModelState();
}

function goToCameraTarget(slotIndex) {
  if (!cameraTargetSlots[slotIndex]) return;
  cameraTargetActiveIndex = slotIndex;
  notifyModelState();
}

// Drops back to the manual pan sliders (getModelViewOffset) instead of a
// camera target driving the offset — see getCurrentCameraOffset.
function resetCameraTarget() {
  cameraTargetActiveIndex = null;
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
// buffers and flips on the "use custom model" toggle. Shared by the file
// picker and drag-and-drop paths (see loadModelFromFiles below).
function applyParsedModel(parsed, objName, mtlName, defaultCameraTargets = [null, null, null]) {
  if (!parsed) {
    customModelReady = false;
    useCustomModel = false;
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
  useCustomModel = true;
  setCubeSizePercent(100); // a freshly loaded model starts at the default size, not whatever the slider was left at
  const triCount = customModelVertexCount / 3;
  cubeModelStatus = parsed.hasMaterials
    ? `${objName} (${triCount} tris, colors from ${mtlName})`
    : `${objName} (${triCount} tris, no materials found)`;
  notifyModelState();
}

// Shared by the file-picker input and drag-and-drop below: given a loose
// list of Files (as either produces), finds the .obj and its .mtl sidecar,
// parses, and uploads. The built-in cube is the default shape — this only
// ever runs in response to the user explicitly picking or dropping files.
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

// Bundled default model (public/models/), shown on startup instead of the
// built-in procedural cube — same parse/apply path as a manual upload, just
// fetched from a static asset instead of picked/dropped by the user. "Show
// default cube" still works afterward since it just flips useCustomModel.
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
      '1-House',
      '2-Business_Facility',
      '3.1-Investor_Energy_Hub_PLANE',
    ]);
    applyDefaultModelFlowPath();
  } catch (err) {
    console.error(err);
  }
}

function setUseCustomModel(checked) {
  useCustomModel = customModelReady && checked;
  notifyModelState();
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
// Baked-in starter arrow for the bundled default model (see
// loadBundledDefaultModel/applyDefaultModelFlowPath below) — captured from a
// hand-drawn path so a fresh page load already has a pulsing arrow instead of
// an empty green mesh, without redrawing it every reload. Same shape
// saveModelFlowPath persists to localStorage (points/touchedObjectIndices/
// enabledObjectIndices), just applied unconditionally on startup instead.
// Empty for now — earlier bundled models had a hand-drawn path baked in
// here, but its points are specific to one model's geometry and scale, so
// they never carry over to a newly swapped-in bundled model. Draw a new one
// via "Draw flow arrow" and it'll persist to localStorage on its own;
// re-bake it here (see saveModelFlowPath) if you want a fresh
// out-of-the-box arrow.
const DEFAULT_MODEL_FLOW_PATH_DATA = [];
const MODEL_FLOW_PULSE_BAND_FRACTION = 0.15; // sigma as a fraction of each path's own normalized (0-1) length
// Sentinel aFlowCoord for a green vertex no arrow reaches (no path enables
// its object) — any negative value works since real arc-length fractions
// are always in [0, 1]; the fragment shader's `vFlowCoord >= 0.0` check is
// what actually keeps these vertices dark, this just has to stay negative.
const MODEL_FLOW_NO_ARROW_COORD = -1;
const MODEL_FLOW_ARROW_COLOR = [1, 1, 1]; // white guide line for finalized, unselected arrows
const MODEL_FLOW_ARROW_SELECTED_COLOR = [0.15, 0.55, 1]; // blue highlight for the currently selected arrow
const MODEL_FLOW_ARROW_DRAG_COLOR = [1, 0, 0]; // red for the not-yet-finalized in-progress drag — turns white once double-clicked to confirm
const MODEL_FLOW_ARROW_HALF_WIDTH_PX = 3; // half-width of the ribbon built in buildArrowRibbonNDC below
const MODEL_FLOW_ARROW_OPACITY = 0.75; // applied to all three ribbon batches (finalized/selected/in-progress) via uLineAlpha
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
// many sigmas past each end of the path, so it fades in/out via the Gaussian
// tail instead of popping straight from invisible to full brightness at the
// loop.
const FLOW_PULSE_PERIOD_BASE_MS = 3000;
const FLOW_PULSE_PAD_SIGMAS = 3;

let modelFlowDrawMode = false;
let modelFlowSelectMode = false;
let modelFlowDrag = null; // { points: [[x,y,z], ...] } object-space, while actively building one new arrow click-by-click
let modelFlowLastClickTime = null; // performance.now() of the last point-dropping click, for double-click-to-finish detection
let modelFlowLastClickPos = null; // { x, y } clientX/Y of that same click
let modelFlowPaths = []; // [{ points: [[x,y,z], ...], cumLen: number[], totalLen }, ...] one entry per finalized arrow
let selectedFlowArrowIndex = null; // index into modelFlowPaths, or null if nothing selected
let modelFlowSelectDownPos = null; // { x, y } clientX/Y at pointerdown, while in select mode — distinguishes a click from a drag
let showModelFlowArrow = false;
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

const MODEL_FLOW_POINT_RADIUS_PX = 12;
const MODEL_FLOW_POINT_COLOR_CENTER = [1, 1, 1]; // white highlight, reads clearly against the red guide ribbon
const MODEL_FLOW_POINT_COLOR_EDGE = [0.55, 0.55, 0.55];
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
// with. Only ever nonzero for camera-target mode now — locking a target to
// screen-center has to counteract whatever the *current* rotation does to
// it, which is exactly what this recomputes every call (rx/ry-dependent).
// Read-only: when a camera target is active, this reads cameraTargetCurrent's
// already-eased position rather than advancing it — only renderCubeFrame's
// own per-frame tick does that, so the ease rate stays tied to render frames
// rather than to how often a caller (e.g. pointermove during arrow-drawing)
// happens to ask for the offset.
function getCurrentCameraOffset(rx, ry, s) {
  const activeTargetName = cameraTargetActiveIndex !== null ? cameraTargetSlots[cameraTargetActiveIndex] : null;
  if (!activeTargetName) return [0, 0];
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
// above, and combining both would fight over the same screen position.
function getObjectSpacePan() {
  const activeTargetName = cameraTargetActiveIndex !== null ? cameraTargetSlots[cameraTargetActiveIndex] : null;
  return activeTargetName ? [0, 0, 0] : getModelViewOffset();
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
// pulse only some of them), then stores its arc length *normalized by that
// path's own totalLen* — a 0-1 fraction rather than an absolute distance —
// so every arrow shares the same pulse timing/width regardless of how many
// arrows exist or how long each one is (see the flowSigma/flowPulseCenter
// math in renderCubeFrame, which is expressed in this same normalized
// space). Non-green vertices and vertices whose object has no eligible path
// at all get a negative sentinel (MODEL_FLOW_NO_ARROW_COORD) rather than 0 —
// see the fragment shader's `vFlowCoord >= 0.0` gate, which is what actually
// keeps the glow off those parts. Defaulting to a real 0 (a valid arc
// position) used to make every arrow-less part flash in sync whenever the
// traveling pulse passed the start of its cycle, since 0 looked exactly like
// "sitting at the start of some arrow".
// Called whenever an arrow is drawn/cleared/reconfigured and once after a
// model (re)loads a restored path.
function recomputeModelFlowCoords() {
  if (!customModelReady || !customModelPositionsCache) return;

  const vertexCount = customModelPositionsCache.length / 3;
  const flowCoords = new Float32Array(vertexCount).fill(MODEL_FLOW_NO_ARROW_COORD);
  if (modelFlowPaths.length > 0) {
    for (let i = 0; i < vertexCount; i++) {
      if (!customModelIsGreenCache[i]) continue;
      const vertexObjectIndex = customModelObjectIndexCache[i];
      const p = [customModelPositionsCache[i * 3], customModelPositionsCache[i * 3 + 1], customModelPositionsCache[i * 3 + 2]];
      let bestFrac = MODEL_FLOW_NO_ARROW_COORD, bestDistSq = Infinity;
      for (const path of modelFlowPaths) {
        if (path.enabledObjectIndices && !path.enabledObjectIndices.includes(vertexObjectIndex)) continue;
        const { arcLen, distSq } = nearestPointOnPath3D(path, p);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestFrac = path.totalLen > 0 ? arcLen / path.totalLen : 0;
        }
      }
      flowCoords[i] = bestFrac;
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelFlowCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flowCoords, gl.STATIC_DRAW);
}

function saveModelFlowPath() {
  if (modelFlowPaths.length > 0) {
    localStorage.setItem(
      MODEL_FLOW_STORAGE_KEY,
      JSON.stringify(modelFlowPaths.map((path) => ({
        points: path.points,
        touchedObjectIndices: path.touchedObjectIndices,
        enabledObjectIndices: path.enabledObjectIndices,
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

// Installs DEFAULT_MODEL_FLOW_PATH_DATA as the current arrow set — used in
// place of clearModelFlowPath() right after the bundled model loads, so
// startup shows a pulsing arrow instead of a blank green mesh. Mirrors the
// shape built by the pointerup handler that finalizes a hand-drawn arrow
// (buildPathMetrics + touched/enabledObjectIndices).
function applyDefaultModelFlowPath() {
  modelFlowPaths = DEFAULT_MODEL_FLOW_PATH_DATA.map((data) => ({
    ...buildPathMetrics(data.points),
    touchedObjectIndices: data.touchedObjectIndices,
    enabledObjectIndices: data.enabledObjectIndices,
  }));
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
// Only once the drag is empty (or there's no drag at all) does undo fall
// back to dropping the most recently finalized arrow.
function undoLastModelFlowArrow() {
  if (modelFlowDrag && modelFlowDrag.points.length > 0) {
    modelFlowDrag.points.pop();
    modelFlowDrag.pointObjectIndices.pop();
    modelFlowDrag.touchedObjects = new Set(modelFlowDrag.pointObjectIndices);
    if (modelFlowDrag.points.length === 0) {
      modelFlowDrag = null;
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

// Suppress the browser's right-click menu while drawing so right-drag reads
// as a rotate gesture instead of popping up a context menu mid-drag.
canvas.addEventListener('contextmenu', (event) => {
  if (modelFlowDrawMode) event.preventDefault();
});

// Finalizes whatever arrow is currently being built click-by-click (see the
// draw-mode pointerdown handler below) into modelFlowPaths, provided it has
// at least the two points needed to form a line; a lone first click with no
// second point (e.g. a stray double-click right at the start) is simply
// dropped instead of producing a degenerate zero-length arrow.
function finalizeModelFlowDrag() {
  if (modelFlowDrag && modelFlowDrag.points.length >= 2) {
    const path = buildPathMetrics(modelFlowDrag.points);
    // Every object a click actually raycasted onto — the pulse applies to
    // all of them by default (see setFlowArrowObjectEnabled for narrowing
    // this down to just some of them after the fact).
    path.touchedObjectIndices = [...modelFlowDrag.touchedObjects];
    path.enabledObjectIndices = [...modelFlowDrag.touchedObjects];
    modelFlowPaths.push(path);
    saveModelFlowPath();
    recomputeModelFlowCoords();
    notifyModelState();
  }
  modelFlowDrag = null;
  modelFlowLastClickTime = null;
  modelFlowLastClickPos = null;
}

canvas.addEventListener('pointerdown', (event) => {
  if (!blueprintEnabled) return;
  if (modelFlowSelectMode) {
    modelFlowSelectDownPos = { x: event.clientX, y: event.clientY };
    event.stopPropagation();
    return;
  }
  if (!modelFlowDrawMode) return;
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
    modelFlowDrag = { points: [hit.point], pointObjectIndices: [hit.objectIndex], touchedObjects: new Set([hit.objectIndex]) };
  } else {
    modelFlowDrag.points.push(hit.point);
    modelFlowDrag.pointObjectIndices.push(hit.objectIndex);
    modelFlowDrag.touchedObjects.add(hit.objectIndex);
  }
  modelFlowLastClickTime = now;
  modelFlowLastClickPos = { x: event.clientX, y: event.clientY };
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
    // its target angle/zero tilt — overrides the normal per-frame parallax
    // easing below until the tween finishes.
    const t = Math.min(1, (performance.now() - cubeRotResetStartTime) / CUBE_ROT_RESET_MS);
    const eased = 1 - (1 - t) ** 3;
    cubeRotX = cubeRotResetFrom.rotX + (cubeRotResetTargetX - cubeRotResetFrom.rotX) * eased;
    cubeRotY = cubeRotResetFrom.rotY + (cubeRotResetTargetY - cubeRotResetFrom.rotY) * eased;
    cubeParallaxTargetX = cubeRotResetFrom.parTargetX * (1 - eased);
    cubeParallaxTargetY = cubeRotResetFrom.parTargetY * (1 - eased);
    cubeParallaxX = cubeRotResetFrom.parX * (1 - eased);
    cubeParallaxY = cubeRotResetFrom.parY * (1 - eased);
    if (t >= 1) {
      cubeRotResetStartTime = null;
      cubeRotResetFrom = null;
    }
  } else {
    cubeParallaxX += (cubeParallaxTargetX - cubeParallaxX) * CUBE_PARALLAX_SMOOTHING;
    cubeParallaxY += (cubeParallaxTargetY - cubeParallaxY) * CUBE_PARALLAX_SMOOTHING;
  }

  const rx = cubeRotX + cubeParallaxX;
  const ry = cubeRotY + cubeParallaxY;

  // Rotation (rx/ry) is untouched by camera-target mode — only the pan
  // offset's source and the extra zoom multiplier change, so drag/hover
  // rotation holds automatically regardless of target.
  let zoomGoal = 1;
  if (cameraTargetActiveIndex !== null && cameraTargetSlots[cameraTargetActiveIndex]) {
    const target = customModelObjects.find((o) => o.name === cameraTargetSlots[cameraTargetActiveIndex]);
    const targetCenter = target ? target.center : [0, 0, 0];
    cameraTargetCurrent[0] += (targetCenter[0] - cameraTargetCurrent[0]) * CAMERA_TARGET_SMOOTHING;
    cameraTargetCurrent[1] += (targetCenter[1] - cameraTargetCurrent[1]) * CAMERA_TARGET_SMOOTHING;
    cameraTargetCurrent[2] += (targetCenter[2] - cameraTargetCurrent[2]) * CAMERA_TARGET_SMOOTHING;
    if (target && target.size > 0) {
      zoomGoal = Math.max(
        CAMERA_TARGET_ZOOM_MIN,
        Math.min(CAMERA_TARGET_ZOOM_MAX, CAMERA_TARGET_ZOOM_REFERENCE_SIZE / target.size)
      );
    }
  }
  // Eases back to 1x on its own whenever no target is active (including
  // right after resetCameraTarget), same as chasing a new target's goal.
  cameraTargetZoomCurrent += (zoomGoal - cameraTargetZoomCurrent) * CAMERA_TARGET_SMOOTHING;
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

  const showCustomModel = useCustomModel && customModelReady;

  gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelPositionBuffer : cubePositionBuffer);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelNormalBuffer : cubeNormalBuffer);
  gl.enableVertexAttribArray(aNormal);
  gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelColorBuffer : cubeColorBuffer);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelIsGreenBuffer : cubeIsGreenBuffer);
  gl.enableVertexAttribArray(aIsGreen);
  gl.vertexAttribPointer(aIsGreen, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelFillPatternBuffer : cubeFillPatternBuffer);
  gl.enableVertexAttribArray(aFillPattern);
  gl.vertexAttribPointer(aFillPattern, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelFlowCoordBuffer : cubeFlowCoordBuffer);
  gl.enableVertexAttribArray(aFlowCoord);
  gl.vertexAttribPointer(aFlowCoord, 1, gl.FLOAT, false, 0, 0);

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
  const flowActive = blueprintEnabled && showCustomModel && modelFlowPaths.length > 0;
  let flowPulseCenter = 0, flowSigma = 0.02;
  if (flowActive) {
    flowSigma = Math.max(0.02, MODEL_FLOW_PULSE_BAND_FRACTION * pulseBandFraction * 4);
    const flowPad = flowSigma * FLOW_PULSE_PAD_SIGMAS;
    // Linear for now (was an eased t^3 ease-in — the pulse noticeably
    // lingered at the start of each loop before accelerating through the
    // rest of the arrow).
    const flowPeriodMs = FLOW_PULSE_PERIOD_BASE_MS * (100 / flowSpeedPercent);
    const pulseProgress = (performance.now() % flowPeriodMs) / flowPeriodMs;
    flowPulseCenter = -flowPad + pulseProgress * (1 + 2 * flowPad);
  }
  gl.uniform1i(uFlowActive, flowActive ? 1 : 0);
  if (flowActive) {
    gl.uniform1f(uFlowPulseCenter, flowPulseCenter);
    gl.uniform1f(uFlowSigma, flowSigma);
    gl.uniform3f(uFlowColor, BLUEPRINT_FLOW_COLOR[0], BLUEPRINT_FLOW_COLOR[1], BLUEPRINT_FLOW_COLOR[2]);
  }

  // In blueprint mode the filled pass is nudged back with polygon offset so
  // the wireframe (drawn without it, right after) sits cleanly on top
  // instead of z-fighting with the coplanar filled faces underneath it.
  if (blueprintEnabled) {
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
  }

  if (showCustomModel) {
    gl.drawArrays(gl.TRIANGLES, 0, customModelVertexCount);
  } else {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);
    gl.drawElements(gl.TRIANGLES, CUBE_INDICES.length, gl.UNSIGNED_SHORT, 0);
  }

  if (blueprintEnabled) {
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.useProgram(lineProgram);
    gl.uniformMatrix4fv(uLineModelView, false, modelView);
    gl.uniformMatrix4fv(uLineProjection, false, cubeProjection);
    gl.uniform1f(uLineAlpha, 1.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelLineBuffer : cubeLineBuffer);
    gl.enableVertexAttribArray(aLinePosition);
    gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelLineColorBuffer : cubeLineColorBuffer);
    gl.enableVertexAttribArray(aLineColor);
    gl.vertexAttribPointer(aLineColor, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, showCustomModel ? customModelLineVertexCount : cubeLineVertexCount);

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
    // "still being drawn" until it's confirmed and turns white like the rest.
    const unselectedPointLists = [];
    let selectedPointList = null;
    if (showModelFlowArrow) {
      modelFlowPaths.forEach((path, i) => {
        if (i === selectedFlowArrowIndex) selectedPointList = path.points;
        else unselectedPointLists.push(path.points);
      });
    }
    const dragPointList = modelFlowDrag && modelFlowDrag.points.length >= 2 ? modelFlowDrag.points : null;

    // Shared by the arrow ribbon below and the pivot orb further down —
    // projects object-space points straight to NDC/clip space on the CPU
    // (see buildArrowRibbonNDC's comment for why: an orthographic
    // projection composed with rotate/scale/translate always has clip.w=1,
    // so this *is* the final NDC position, no perspective divide needed).
    const combined = mat4Multiply(cubeProjection, modelView);

    if (unselectedPointLists.length > 0 || selectedPointList || dragPointList) {
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

      if (dragPointList) {
        const ribbon = buildArrowRibbonNDC([dragPointList], combined, canvas.width, canvas.height, MODEL_FLOW_ARROW_HALF_WIDTH_PX);
        gl.bindBuffer(gl.ARRAY_BUFFER, modelFlowOverlayBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, ribbon, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttrib3f(aLineColor, MODEL_FLOW_ARROW_DRAG_COLOR[0], MODEL_FLOW_ARROW_DRAG_COLOR[1], MODEL_FLOW_ARROW_DRAG_COLOR[2]);
        gl.drawArrays(gl.TRIANGLES, 0, ribbon.length / 3);
      }

      gl.disable(gl.BLEND);
      gl.uniform1f(uLineAlpha, 1.0);
    }

    // Click-point markers for the arrow currently being drawn (see
    // buildPointMarkersNDC above) — only while draw mode is on, so they
    // never linger over a finalized arrow that's no longer editable.
    if (modelFlowDrawMode && modelFlowDrag && modelFlowDrag.points.length > 0) {
      const markers = buildPointMarkersNDC(
        modelFlowDrag.points, combined, canvas.width, canvas.height,
        MODEL_FLOW_POINT_RADIUS_PX, MODEL_FLOW_POINT_COLOR_CENTER, MODEL_FLOW_POINT_COLOR_EDGE,
      );
      gl.uniformMatrix4fv(uLineModelView, false, IDENTITY_MAT4);
      gl.uniformMatrix4fv(uLineProjection, false, IDENTITY_MAT4);
      gl.bindBuffer(gl.ARRAY_BUFFER, modelFlowPointsBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, markers, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aLinePosition);
      gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(aLineColor);
      gl.vertexAttribPointer(aLineColor, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, markers.length / 6);
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
// flips `useCustomModel`/`customModelReady`/`cubeModelStatus`); the rest are
// the setters the panel calls in response to user interaction.
export const controls = {
  getInitialState() {
    return {
      pulseWidth: pulseWidthValue,
      flowSpeed: flowSpeedPercent,
      flowSpeedMin: FLOW_SPEED_MIN,
      flowSpeedMax: FLOW_SPEED_MAX,
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
  setFlowSpeedPercent,
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
  setUseCustomModel,
  loadModelFiles: (files) => loadModelFromFiles(files),
  setModelFlowDraw,
  setModelFlowSelectMode,
  deleteSelectedModelFlowArrow,
  setFlowArrowObjectEnabled,
  clearModelFlow: clearModelFlowPath,
  undoModelFlowArrow: undoLastModelFlowArrow,
  setModelFlowArrowVisible,
  setHoverMovementPaused,
  setRotationDisabled,
  resetRotation: resetCubeRotation,
  setCameraTargetSlot,
  goToCameraTarget,
  resetCameraTarget,
};
