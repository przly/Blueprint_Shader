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

// Cube mode's model size, as a percentage multiplier on top of CUBE_SCALE
// (see renderCubeFrame) — 100 (the default) = CUBE_SCALE unchanged, up to
// 1000 = 10x that. Applies equally to the built-in cube and any uploaded
// custom model, since both go through the same modelView scale step.
const CUBE_SIZE_MIN = 10;
const CUBE_SIZE_MAX = 1000;
let cubeSizePercent = restoreNumber('cubeSize', 100);
let cubeSizeScale = cubeSizePercent / 100;

function setCubeSizePercent(percent) {
  const clamped = Math.max(CUBE_SIZE_MIN, Math.min(CUBE_SIZE_MAX, percent));
  cubeSizePercent = clamped;
  cubeSizeScale = clamped / 100;
  persistNumber('cubeSize', clamped);
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
let dotFrequencyValue = restoreNumber('dotFrequency', 1);

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
let dotSizePercent = restoreNumber('dotSize', 16);

function setDotSizePercent(value) {
  const clamped = Math.max(DOT_SIZE_MIN, Math.min(DOT_SIZE_MAX, value));
  dotSizePercent = clamped;
  persistNumber('dotSize', clamped);
  return clamped;
}

const PLUS_FREQUENCY_MIN = 1;
const PLUS_FREQUENCY_MAX = 60;
let plusFrequencyValue = restoreNumber('plusFrequency', 1);

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
let lightAzimuthValue = restoreNumber('lightAzimuth', 170);
let lightElevationValue = restoreNumber('lightElevation', 30);

function setLightAzimuth(value) {
  lightAzimuthValue = value;
  persistNumber('lightAzimuth', value);
}

function setLightElevation(value) {
  lightElevationValue = value;
  persistNumber('lightElevation', value);
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
    float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
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
    // green (flagged) parts — a Gaussian band that travels along the arrow
    // over time, driven by a 3D arc-length coordinate (aFlowCoord).
    if (uBlueprint && uFlowActive && vIsGreen > 0.5) {
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
  attribute float aLineIsGreen;
  attribute float aLineFlowCoord;
  uniform mat4 uLineModelView;
  uniform mat4 uLineProjection;
  varying vec3 vLineColor;
  varying float vLineIsGreen;
  varying float vLineFlowCoord;
  void main() {
    gl_Position = uLineProjection * uLineModelView * vec4(aLinePosition, 1.0);
    vLineColor = aLineColor;
    vLineIsGreen = aLineIsGreen;
    vLineFlowCoord = aLineFlowCoord;
  }
`;

const LINE_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec3 vLineColor;
  varying float vLineIsGreen;
  varying float vLineFlowCoord;
  uniform bool uFlowActive;
  uniform float uFlowPulseCenter;
  uniform float uFlowSigma;
  uniform vec3 uFlowColor;
  void main() {
    vec3 color = vLineColor;
    if (uFlowActive && vLineIsGreen > 0.5) {
      float d = vLineFlowCoord - uFlowPulseCenter;
      float intensity = exp(-(d * d) / (2.0 * uFlowSigma * uFlowSigma));
      color += uFlowColor * intensity;
    }
    gl_FragColor = vec4(color, 1.0);
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

// Blueprint palette: fill uses a dark navy background, default wireframe
// lines use a mid gray. Green-material parts (see isGreenDominant) instead
// get a green fill (BLUEPRINT_FILL_COLOR_GREEN) with black edges
// (BLUEPRINT_LINE_COLOR_GREEN_PART) so they read as a distinct, "called out"
// element rather than blending into the rest of the drawing. Defined here
// (ahead of CUBE_LINES below, which needs these at load time) rather than
// down near the other uniform lookups.
const BLUEPRINT_BG_COLOR = [0.02, 0.09, 0.2];
const BLUEPRINT_FILL_COLOR = [4 / 255, 28 / 255, 44 / 255]; // #041C2C
const BLUEPRINT_LINE_COLOR = [124 / 255, 134 / 255, 142 / 255]; // #7C868E
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
  const colors = [];
  const isGreenFlags = [];
  for (const { i0, i1, count, minDot, isGreen } of edgeMap.values()) {
    if (count === 1 || minDot < CREASE_ANGLE_DOT_THRESHOLD) {
      lines.push(
        flatPositions[i0 * 3], flatPositions[i0 * 3 + 1], flatPositions[i0 * 3 + 2],
        flatPositions[i1 * 3], flatPositions[i1 * 3 + 1], flatPositions[i1 * 3 + 2],
      );
      const c = isGreen ? BLUEPRINT_LINE_COLOR_GREEN_PART : BLUEPRINT_LINE_COLOR;
      colors.push(c[0], c[1], c[2], c[0], c[1], c[2]);
      isGreenFlags.push(isGreen ? 1 : 0, isGreen ? 1 : 0);
    }
  }
  return { positions: new Float32Array(lines), colors: new Float32Array(colors), isGreen: new Float32Array(isGreenFlags) };
}

const CUBE_LINES = buildCreaseEdgeLines(CUBE_POSITIONS, CUBE_INDICES);
const cubeLineBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeLineBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_LINES.positions, gl.STATIC_DRAW);
const cubeLineColorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeLineColorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_LINES.colors, gl.STATIC_DRAW);
const cubeLineIsGreenBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeLineIsGreenBuffer);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_LINES.isGreen, gl.STATIC_DRAW);
// The built-in cube has no flow path, so its flow-coord buffer is just
// zero-filled — bound purely so the shared line shader's attribute layout
// stays consistent regardless of which model is showing.
const cubeLineFlowCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeLineFlowCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(CUBE_LINES.positions.length / 3), gl.STATIC_DRAW);
const cubeLineVertexCount = CUBE_LINES.positions.length / 3;
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
const aLineIsGreen = gl.getAttribLocation(lineProgram, 'aLineIsGreen');
const aLineFlowCoord = gl.getAttribLocation(lineProgram, 'aLineFlowCoord');
const uLineModelView = gl.getUniformLocation(lineProgram, 'uLineModelView');
const uLineProjection = gl.getUniformLocation(lineProgram, 'uLineProjection');
const uLineFlowActive = gl.getUniformLocation(lineProgram, 'uFlowActive');
const uLineFlowPulseCenter = gl.getUniformLocation(lineProgram, 'uFlowPulseCenter');
const uLineFlowSigma = gl.getUniformLocation(lineProgram, 'uFlowSigma');
const uLineFlowColor = gl.getUniformLocation(lineProgram, 'uFlowColor');

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
// as a view-space translate in renderCubeFrame (i.e. after rotation, so
// panning always moves the model along screen axes regardless of its
// current rotation). MODEL_POSITION_RANGE converts that value into
// view-space units (divided by 100, so ±100 — a third of the slider's
// travel — is where the offset just carries the model past the ortho
// frustum's edge, i.e. CUBE_ORTHO_HALF_SIZE plus roughly the default-size
// model's own half-extent); the rest of the range up to ±300 keeps panning
// it well off-canvas.
const MODEL_POSITION_MIN = -300;
const MODEL_POSITION_MAX = 300;
const MODEL_POSITION_RANGE = CUBE_ORTHO_HALF_SIZE * 1.2;
let modelOffsetXPercent = restoreNumber('modelOffsetX', 0);
let modelOffsetYPercent = restoreNumber('modelOffsetY', 0);

function setModelOffsetXPercent(percent) {
  const clamped = Math.max(MODEL_POSITION_MIN, Math.min(MODEL_POSITION_MAX, percent));
  modelOffsetXPercent = clamped;
  persistNumber('modelOffsetX', clamped);
  return clamped;
}

function setModelOffsetYPercent(percent) {
  const clamped = Math.max(MODEL_POSITION_MIN, Math.min(MODEL_POSITION_MAX, percent));
  modelOffsetYPercent = clamped;
  persistNumber('modelOffsetY', clamped);
  return clamped;
}

function resetModelPosition() {
  setModelOffsetXPercent(0);
  setModelOffsetYPercent(0);
}

// Shared by renderCubeFrame and raycastGreenMesh's unprojection so the two
// stay in sync — the raycast has to undo the exact same view-space
// translate the render pass applies, or drawing on a panned model would hit
// the wrong spot.
function getModelViewOffset() {
  return [(modelOffsetXPercent / 100) * MODEL_POSITION_RANGE, (modelOffsetYPercent / 100) * MODEL_POSITION_RANGE];
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

let cubeRotX = CUBE_ISO_PITCH;
let cubeRotY = CUBE_ISO_YAW;
let cubeDragging = false;
let cubeLastPointer = null;

// Ambient parallax tilt: a small extra rotation, layered on top of
// cubeRotX/Y, that follows the cursor's position anywhere on the page.
// cubeParallaxTargetX/Y track the cursor instantly; cubeParallaxX/Y ease
// toward that target a little each frame (see renderCubeFrame) so the tilt
// reads as a soft parallax drift rather than snapping straight to the mouse.
// Suspended while dragging so the two rotation sources don't fight.
const CUBE_PARALLAX_MAX_RAD = 0.1;
const CUBE_PARALLAX_SMOOTHING = 0.08;
let cubeParallaxTargetX = 0;
let cubeParallaxTargetY = 0;
let cubeParallaxX = 0;
let cubeParallaxY = 0;

// Snaps the model back to its default framed angle — both the drag rotation
// (cubeRotX/Y) and the ambient parallax tilt (cubeParallaxX/Y and its target,
// so it doesn't ease back toward wherever the cursor currently is). Shared by
// the "Reset rotation" button and by enabling "Pause hover movement" below.
function resetCubeRotation() {
  cubeRotX = CUBE_ISO_PITCH;
  cubeRotY = CUBE_ISO_YAW;
  cubeParallaxTargetX = 0;
  cubeParallaxTargetY = 0;
  cubeParallaxX = 0;
  cubeParallaxY = 0;
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
  canvas.style.cursor = rotationDisabled ? 'default' : 'grab';
}

function setRotationDisabled(value) {
  rotationDisabled = value;
  if (!cubeDragging) updateCubeCursor();
}

updateCubeCursor();

canvas.addEventListener('pointerdown', (event) => {
  if (modelFlowDrawMode || rotationDisabled) return;
  cubeDragging = true;
  cubeLastPointer = { x: event.clientX, y: event.clientY };
  canvas.style.cursor = 'grabbing';
});

window.addEventListener('pointermove', (event) => {
  if (cubeDragging) {
    cubeRotY += (event.clientX - cubeLastPointer.x) * 0.01;
    cubeRotX += (event.clientY - cubeLastPointer.y) * 0.01;
    cubeLastPointer = { x: event.clientX, y: event.clientY };
    return;
  }
  // Keep the model perfectly still while tracing an arrow onto it — ambient
  // parallax tilt shifting the surface under the cursor mid-draw would make
  // it hard to trace a precise path.
  if (modelFlowDrawMode || hoverMovementPaused) return;
  const nx = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
  const ny = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1));
  cubeParallaxTargetY = nx * CUBE_PARALLAX_MAX_RAD;
  cubeParallaxTargetX = ny * CUBE_PARALLAX_MAX_RAD;
});

window.addEventListener('pointerup', () => {
  cubeDragging = false;
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

function parseObj(text, materials) {
  const positions = [];
  const normals = [];
  const outPositions = [];
  const outNormals = [];
  const outColors = [];
  const outIsGreen = []; // one entry per emitted vertex — blueprint mode's green-fill flag
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

  // Center and scale to roughly the same [-1, 1] envelope CUBE_POSITIONS
  // uses, so the same CUBE_SCALE/camera distance frame it similarly
  // regardless of what units the source model was modeled in.
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < outPositions.length; i += 3) {
    const x = outPositions[i], y = outPositions[i + 1], z = outPositions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  // 10x the built-in cube's normalized envelope — a custom model's intended
  // physical size relative to the cube, independent of CUBE_SCALE (which
  // still applies equally on top of this to both the cube and custom models).
  const scale = (2 / extent) * 10;
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
  const objects = objectOrder.map((name) => {
    const b = objectBounds.get(name);
    let ox = (b.minX + b.maxX) / 2, oy = (b.minY + b.maxY) / 2, oz = (b.minZ + b.maxZ) / 2;
    if (ry !== 0) {
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const rotX = ox * cosY + oz * sinY;
      const rotZ = -ox * sinY + oz * cosY;
      ox = rotX; oz = rotZ;
    }
    return { name, center: [(ox - cx) * scale, (oy - cy) * scale, (oz - cz) * scale] };
  });

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
const customModelLineIsGreenBuffer = gl.createBuffer();
const customModelLineFlowCoordBuffer = gl.createBuffer();
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
let customModelObjects = []; // [{name, center:[x,y,z]}], from parseObj
/** @type {(string | null)[]} */
let cameraTargetSlots = [null, null, null];
let cameraTargetActiveIndex = null;
let cameraTargetCurrent = [0, 0, 0];
const CAMERA_TARGET_SMOOTHING = 0.05;

function getModelState() {
  return {
    customModelReady,
    useCustomModel,
    cubeModelStatus,
    customModelObjectNames: customModelObjects.map((o) => o.name),
    cameraTargetSlots,
    cameraTargetActiveIndex,
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
let customModelLinePositionsCache = null;
let customModelLineIsGreenCache = null;
let greenTriPositionsCache = null; // Float32Array, only the triangles flagged green, for cheap raycasting

// Uploads an already-parsed model (see parseObj) to the custom-model GPU
// buffers and flips on the "use custom model" toggle. Shared by the file
// picker and drag-and-drop paths (see loadModelFromFiles below).
function applyParsedModel(parsed, objName, mtlName) {
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
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelLineIsGreenBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, parsed.lineIsGreen, gl.STATIC_DRAW);
  customModelLineVertexCount = parsed.linePositions.length / 3;

  customModelPositionsCache = parsed.positions;
  customModelIsGreenCache = parsed.isGreen;
  customModelLinePositionsCache = parsed.linePositions;
  customModelLineIsGreenCache = parsed.lineIsGreen;

  // A newly loaded model's object names/centroids have nothing to do with
  // whatever the previous model's camera-target assignments pointed at.
  customModelObjects = parsed.objects;
  cameraTargetSlots = [null, null, null];
  cameraTargetActiveIndex = null;
  cameraTargetCurrent = [0, 0, 0];

  const greenTris = [];
  for (let i = 0; i < parsed.isGreen.length; i += 3) {
    if (parsed.isGreen[i]) {
      const o = i * 3;
      for (let k = 0; k < 9; k++) greenTris.push(parsed.positions[o + k]);
    }
  }
  greenTriPositionsCache = new Float32Array(greenTris);

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

// --- 3D flow arrow: draw a path on the model's green parts, pulse follows it ---
//
// A Gaussian glow band travels along a user-drawn path, looping over
// FLOW_PULSE_PERIOD_MS. The "path" is drawn directly on the model's surface
// (via raycasting into the green triangles under the cursor), and each
// vertex's position along it is computed once (in object space) rather than
// per-frame. Deliberately a single path — this model only has one or two
// contiguous green parts, so one arrow covers it.

const MODEL_FLOW_STORAGE_KEY = 'iconMosaic.modelFlowPath';
const MODEL_FLOW_MIN_POINT_SPACING = 0.03; // object-space units — only record a new drag sample once the hit point has moved this far
const MODEL_FLOW_PULSE_BAND_FRACTION = 0.15; // sigma as a fraction of the path's total length
const MODEL_FLOW_ARROW_COLOR = [1, 1, 1]; // bright white guide line for the drawn/dragged arrow overlay
// The traveling glow pulse loops over this period and pads this many sigmas
// past each end of the path, so it fades in/out via the Gaussian tail
// instead of popping straight from invisible to full brightness at the loop.
const FLOW_PULSE_PERIOD_MS = 3000;
const FLOW_PULSE_PAD_SIGMAS = 3;

let modelFlowDrawMode = false;
let modelFlowDrag = null; // { points: [[x,y,z], ...] } object-space, while actively dragging
let modelFlowPath = null; // { points: [[x,y,z], ...], cumLen: number[], totalLen } once finalized
let showModelFlowArrow = true;
const modelFlowOverlayBuffer = gl.createBuffer(); // small, rebuilt-on-demand buffer for drawing the arrow guide line itself

// Rotates a vec3 the same way mat4RotateX/mat4RotateY would (see those
// functions) — used here to build the inverse camera transform for
// unprojecting a screen point into the model's object space.
function rotateXVec3(v, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function rotateYVec3(v, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c];
}

// Inverse of renderCubeFrame's modelView build (translate * rotateX(rx) *
// rotateY(ry) * scale(s)) applied to a single view-space point, undone in
// reverse order: un-translate, un-rotateX, un-rotateY, un-scale.
function unprojectViewPointToObject(pv, rx, ry, s, ox, oy, oz) {
  const untranslated = [pv[0] - ox, pv[1] - oy, pv[2] - oz]; // inverse of mat4Translate(ox, oy, oz)
  const unrotatedX = rotateXVec3(untranslated, -rx);
  const unrotatedY = rotateYVec3(unrotatedX, -ry);
  return [unrotatedY[0] / s, unrotatedY[1] / s, unrotatedY[2] / s];
}

// Forward counterpart of unprojectViewPointToObject: scale, rotateY,
// rotateX (pre-translate) — used to find where an object-space point (e.g. a
// camera-target centroid) lands in view space, so renderCubeFrame can pan to
// center it regardless of the model's current rotation.
function projectObjectPointToView(p, rx, ry, s) {
  const scaled = [p[0] * s, p[1] * s, p[2] * s];
  const afterY = rotateYVec3(scaled, ry);
  return rotateXVec3(afterY, rx);
}

// Shared by renderCubeFrame and raycastGreenMesh so raycasting always
// unprojects through the exact same view-space offset the render pass drew
// with — same reason getModelViewOffset above is shared, just extended to
// cover camera-target mode too. Read-only: when a camera target is active,
// this reads cameraTargetCurrent's already-eased position rather than
// advancing it — only renderCubeFrame's own per-frame tick does that, so the
// ease rate stays tied to render frames rather than to how often a caller
// (e.g. pointermove during arrow-drawing) happens to ask for the offset.
function getCurrentCameraOffset(rx, ry, s) {
  const activeTargetName = cameraTargetActiveIndex !== null ? cameraTargetSlots[cameraTargetActiveIndex] : null;
  if (!activeTargetName) return getModelViewOffset();
  const viewPoint = projectObjectPointToView(cameraTargetCurrent, rx, ry, s);
  return [-viewPoint[0], -viewPoint[1]];
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
// nearest hit point on a green triangle, or null if it misses the green
// mesh entirely (drawing is deliberately restricted to green parts, since
// that's the only place the flow pulse can ever show).
function raycastGreenMesh(clientX, clientY) {
  if (!greenTriPositionsCache || greenTriPositionsCache.length === 0) return null;

  // CSS-space rect: with rendering now going straight into `canvas` (no
  // separate offscreen source/crop to map through — see updateCubeProjection
  // above), a pointer position converts to NDC directly, independent of
  // DPR or the canvas's actual backing-store resolution (renderScale).
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2; // canvas Y is down, NDC Y is up

  const rx = cubeRotX + cubeParallaxX, ry = cubeRotY + cubeParallaxY, s = CUBE_SCALE * cubeSizeScale;
  const [ox, oy] = getCurrentCameraOffset(rx, ry, s);
  const originView = [ndcX * cubeProjectionHalfX, ndcY * cubeProjectionHalfY, -0.1];
  const farView = [originView[0], originView[1], -50];
  const originObj = unprojectViewPointToObject(originView, rx, ry, s, ox, oy, cameraOffsetZ);
  const farObj = unprojectViewPointToObject(farView, rx, ry, s, ox, oy, cameraOffsetZ);
  const dir = [farObj[0] - originObj[0], farObj[1] - originObj[1], farObj[2] - originObj[2]];

  let bestT = Infinity, bestPoint = null;
  const tris = greenTriPositionsCache;
  for (let i = 0; i < tris.length; i += 9) {
    const t = rayTriangleIntersect(originObj, dir, tris, i);
    if (t !== null && t < bestT) {
      bestT = t;
      bestPoint = [originObj[0] + dir[0] * t, originObj[1] + dir[1] * t, originObj[2] + dir[2] * t];
    }
  }
  return bestPoint;
}

// Nearest point on a 3D polyline to `point`, returned as arc length along
// the path — the 3D analogue of the 2D projectOntoPath used for image
// mode's flow cells.
function projectOntoPath3D(path, point) {
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
  return bestArcLen;
}

function buildPathMetrics(points) {
  const cumLen = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cumLen.push(cumLen[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return { points, cumLen, totalLen: cumLen[cumLen.length - 1] || 1 };
}

// Recomputes every green vertex's (and green edge vertex's) arc-length
// position along modelFlowPath and re-uploads the flow-coord buffers.
// Non-green vertices get 0 — harmless since the shaders gate the glow
// behind isGreen anyway. Called whenever the arrow is drawn/cleared and
// once after a model (re)loads a restored path.
function recomputeModelFlowCoords() {
  if (!customModelReady || !customModelPositionsCache) return;

  const vertexCount = customModelPositionsCache.length / 3;
  const flowCoords = new Float32Array(vertexCount);
  if (modelFlowPath) {
    for (let i = 0; i < vertexCount; i++) {
      if (!customModelIsGreenCache[i]) continue;
      const p = [customModelPositionsCache[i * 3], customModelPositionsCache[i * 3 + 1], customModelPositionsCache[i * 3 + 2]];
      flowCoords[i] = projectOntoPath3D(modelFlowPath, p);
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelFlowCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flowCoords, gl.STATIC_DRAW);

  const lineVertexCount = customModelLinePositionsCache.length / 3;
  const lineFlowCoords = new Float32Array(lineVertexCount);
  if (modelFlowPath) {
    for (let i = 0; i < lineVertexCount; i++) {
      if (!customModelLineIsGreenCache[i]) continue;
      const p = [customModelLinePositionsCache[i * 3], customModelLinePositionsCache[i * 3 + 1], customModelLinePositionsCache[i * 3 + 2]];
      lineFlowCoords[i] = projectOntoPath3D(modelFlowPath, p);
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, customModelLineFlowCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, lineFlowCoords, gl.STATIC_DRAW);
}

function saveModelFlowPath() {
  if (modelFlowPath) {
    localStorage.setItem(MODEL_FLOW_STORAGE_KEY, JSON.stringify(modelFlowPath.points));
  } else {
    localStorage.removeItem(MODEL_FLOW_STORAGE_KEY);
  }
}

function clearModelFlowPath() {
  modelFlowPath = null;
  modelFlowDrag = null;
  saveModelFlowPath();
  recomputeModelFlowCoords();
}

function setModelFlowDraw(value) {
  modelFlowDrawMode = value;
}

function setModelFlowArrowVisible(value) {
  showModelFlowArrow = value;
}

canvas.addEventListener('pointerdown', (event) => {
  if (!blueprintEnabled || !modelFlowDrawMode) return;
  const hit = raycastGreenMesh(event.clientX, event.clientY);
  if (!hit) return;
  modelFlowDrag = { points: [hit] };
  event.stopPropagation();
});

window.addEventListener('pointermove', (event) => {
  if (!modelFlowDrag) return;
  const hit = raycastGreenMesh(event.clientX, event.clientY);
  if (!hit) return;
  const last = modelFlowDrag.points[modelFlowDrag.points.length - 1];
  if (Math.hypot(hit[0] - last[0], hit[1] - last[1], hit[2] - last[2]) >= MODEL_FLOW_MIN_POINT_SPACING) {
    modelFlowDrag.points.push(hit);
  }
});

window.addEventListener('pointerup', () => {
  if (!modelFlowDrag) return;
  if (modelFlowDrag.points.length >= 2) {
    modelFlowPath = buildPathMetrics(modelFlowDrag.points);
    saveModelFlowPath();
    recomputeModelFlowCoords();
  }
  modelFlowDrag = null;
});

function renderCubeFrame() {
  gl.viewport(0, 0, canvas.width, canvas.height);
  if (blueprintEnabled) {
    gl.clearColor(BLUEPRINT_BG_COLOR[0], BLUEPRINT_BG_COLOR[1], BLUEPRINT_BG_COLOR[2], 1);
  } else {
    gl.clearColor(0, 0, 0, 1);
  }
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  cubeParallaxX += (cubeParallaxTargetX - cubeParallaxX) * CUBE_PARALLAX_SMOOTHING;
  cubeParallaxY += (cubeParallaxTargetY - cubeParallaxY) * CUBE_PARALLAX_SMOOTHING;

  const rx = cubeRotX + cubeParallaxX;
  const ry = cubeRotY + cubeParallaxY;
  const s = CUBE_SCALE * cubeSizeScale;

  // Rotation/distance (rx/ry/s) are untouched by camera-target mode — only
  // the pan offset's source changes, so drag/hover rotation and the "same
  // orientation and distance to every object" requirement hold automatically.
  if (cameraTargetActiveIndex !== null && cameraTargetSlots[cameraTargetActiveIndex]) {
    const target = customModelObjects.find((o) => o.name === cameraTargetSlots[cameraTargetActiveIndex]);
    const targetCenter = target ? target.center : [0, 0, 0];
    cameraTargetCurrent[0] += (targetCenter[0] - cameraTargetCurrent[0]) * CAMERA_TARGET_SMOOTHING;
    cameraTargetCurrent[1] += (targetCenter[1] - cameraTargetCurrent[1]) * CAMERA_TARGET_SMOOTHING;
    cameraTargetCurrent[2] += (targetCenter[2] - cameraTargetCurrent[2]) * CAMERA_TARGET_SMOOTHING;
  }
  const [offsetX, offsetY] = getCurrentCameraOffset(rx, ry, s);

  let modelView = mat4Translate(offsetX, offsetY, cameraOffsetZ);
  modelView = mat4Multiply(modelView, mat4RotateX(rx));
  modelView = mat4Multiply(modelView, mat4RotateY(ry));
  modelView = mat4Multiply(modelView, mat4Scale(s));

  gl.useProgram(cubeProgram);
  gl.uniformMatrix4fv(uModelView, false, modelView);
  gl.uniformMatrix4fv(uProjection, false, cubeProjection);
  const azRad = (lightAzimuthValue * Math.PI) / 180;
  const elRad = (lightElevationValue * Math.PI) / 180;
  gl.uniform3f(uLightDir, Math.cos(elRad) * Math.cos(azRad), Math.sin(elRad), Math.cos(elRad) * Math.sin(azRad));
  gl.uniform1i(uBlueprint, blueprintEnabled ? 1 : 0);
  gl.uniform3f(uBlueprintFillColor, BLUEPRINT_FILL_COLOR[0], BLUEPRINT_FILL_COLOR[1], BLUEPRINT_FILL_COLOR[2]);
  gl.uniform3f(uBlueprintFillColorGreen, BLUEPRINT_FILL_COLOR_GREEN[0], BLUEPRINT_FILL_COLOR_GREEN[1], BLUEPRINT_FILL_COLOR_GREEN[2]);
  gl.uniform3f(uHatchLineColor, BLUEPRINT_LINE_COLOR[0], BLUEPRINT_LINE_COLOR[1], BLUEPRINT_LINE_COLOR[2]);
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
  // mode's flow (see renderLoop's pulseLinear/pulseProgress/pulseSigma),
  // just parameterized by arc length along modelFlowPath instead of grid
  // cells. Reuses pulseBandFraction (the shared "Pulse width" slider) so one
  // control governs both modes' pulse widths. Computed once here and reused
  // for both the face pass (cubeProgram, below) and the line pass
  // (lineProgram, further down) rather than reading anything back from the GPU.
  const flowActive = blueprintEnabled && showCustomModel && !!modelFlowPath;
  let flowPulseCenter = 0, flowSigma = 0.02;
  if (flowActive) {
    const pathLen = modelFlowPath.totalLen;
    flowSigma = Math.max(0.02, pathLen * MODEL_FLOW_PULSE_BAND_FRACTION * pulseBandFraction * 4);
    const flowPad = flowSigma * FLOW_PULSE_PAD_SIGMAS;
    const pulseLinear = (performance.now() % FLOW_PULSE_PERIOD_MS) / FLOW_PULSE_PERIOD_MS;
    const pulseProgress = pulseLinear * pulseLinear * pulseLinear;
    flowPulseCenter = -flowPad + pulseProgress * (pathLen + 2 * flowPad);
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
    gl.uniform1i(uLineFlowActive, flowActive ? 1 : 0);
    if (flowActive) {
      gl.uniform1f(uLineFlowPulseCenter, flowPulseCenter);
      gl.uniform1f(uLineFlowSigma, flowSigma);
      gl.uniform3f(uLineFlowColor, BLUEPRINT_FLOW_COLOR[0], BLUEPRINT_FLOW_COLOR[1], BLUEPRINT_FLOW_COLOR[2]);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelLineBuffer : cubeLineBuffer);
    gl.enableVertexAttribArray(aLinePosition);
    gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelLineColorBuffer : cubeLineColorBuffer);
    gl.enableVertexAttribArray(aLineColor);
    gl.vertexAttribPointer(aLineColor, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelLineIsGreenBuffer : cubeLineIsGreenBuffer);
    gl.enableVertexAttribArray(aLineIsGreen);
    gl.vertexAttribPointer(aLineIsGreen, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, showCustomModel ? customModelLineFlowCoordBuffer : cubeLineFlowCoordBuffer);
    gl.enableVertexAttribArray(aLineFlowCoord);
    gl.vertexAttribPointer(aLineFlowCoord, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, showCustomModel ? customModelLineVertexCount : cubeLineVertexCount);

    // Draw the drawn arrow itself (or the in-progress drag) as a bright
    // guide line on top, so the user can see/verify what they traced.
    const overlayPath = modelFlowDrag || (showModelFlowArrow ? modelFlowPath : null);
    if (overlayPath && overlayPath.points.length >= 2) {
      const flat = new Float32Array(overlayPath.points.length * 3);
      overlayPath.points.forEach((p, i) => {
        flat[i * 3] = p[0]; flat[i * 3 + 1] = p[1]; flat[i * 3 + 2] = p[2];
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, modelFlowOverlayBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, flat, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aLinePosition);
      gl.vertexAttribPointer(aLinePosition, 3, gl.FLOAT, false, 0, 0);

      gl.disableVertexAttribArray(aLineColor);
      gl.vertexAttrib3f(aLineColor, MODEL_FLOW_ARROW_COLOR[0], MODEL_FLOW_ARROW_COLOR[1], MODEL_FLOW_ARROW_COLOR[2]);
      gl.disableVertexAttribArray(aLineIsGreen);
      gl.vertexAttrib1f(aLineIsGreen, 0);
      gl.disableVertexAttribArray(aLineFlowCoord);
      gl.vertexAttrib1f(aLineFlowCoord, 0);
      gl.uniform1i(uLineFlowActive, 0);

      gl.drawArrays(gl.LINE_STRIP, 0, overlayPath.points.length);
    }
  }
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
// (or "Dots"), or "Plus" (or "Cross") — case-insensitive — and it'll come
// through here as pattern 1, 2, or 3 respectively; anything else is 0 (no
// fill pattern). Each has its own frequency (and, for dots/plus, size)
// control, but all three share the same fill color — see uHatchLineColor.
function materialFillPatternId(name) {
  const trimmed = name.trim().toLowerCase();
  if (trimmed === 'hatch') return 1;
  if (trimmed === 'dot' || trimmed === 'dots') return 2;
  if (trimmed === 'plus' || trimmed === 'cross') return 3;
  return 0;
}

// FPS/frame-time overlay (top-right, see #perf-monitor in index.html).
// Written straight to the DOM via textContent rather than through the React
// panel/state, since that updates every frame — funneling it through React
// state would mean a full component re-render 60 times a second for a
// display the panel itself has no other reason to know about.
const perfMonitorEl = document.getElementById('perf-monitor');
const PERF_DISPLAY_UPDATE_MS = 250; // readable refresh rate; measurement itself is still per-frame
let perfLastFrameTime = performance.now();
let perfFrameCount = 0;
let perfFrameTimeSum = 0;
let perfLastDisplayUpdate = perfLastFrameTime;
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
      `${fps.toFixed(0)} FPS (${perfMinFps.toFixed(0)}–${perfMaxFps.toFixed(0)})\n` +
      `${avgFrameMs.toFixed(1)} ms (${perfMinMs.toFixed(1)}–${perfMaxMs.toFixed(1)})\n` +
      `${Math.round(renderScale * 100)}% res`;
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
      blueprintEnabled,
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
      showModelFlowArrow,
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
  setCubeSizePercent,
  setModelOffsetXPercent,
  setModelOffsetYPercent,
  resetModelPosition,
  setLightAzimuth,
  setLightElevation,
  setBlueprintEnabled,
  setLineFrequency,
  setDotFrequency,
  setDotSizePercent,
  setPlusFrequency,
  setPlusSizePercent,
  setUseCustomModel,
  loadModelFiles: (files) => loadModelFromFiles(files),
  setModelFlowDraw,
  clearModelFlow: clearModelFlowPath,
  setModelFlowArrowVisible,
  setHoverMovementPaused,
  setRotationDisabled,
  resetRotation: resetCubeRotation,
  setCameraTargetSlot,
  goToCameraTarget,
};
