/// <reference lib="dom" />

import { setupCSGLLanguage, MonacoLike } from './monaco/csgl.ts';
import { webgpuMain } from '../backend/webgpu.ts';
import compile from "../compiler/compiler.ts";

const editorHost = document.getElementById('editor-host') as HTMLDivElement;
const btnCompile = document.getElementById('btn-compile') as HTMLButtonElement;
const btnRun = document.getElementById('btn-run') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement | null;
const status = document.getElementById('status') as HTMLSpanElement;
const log = document.getElementById('log') as HTMLDivElement;
const logEntries = document.getElementById('log-entries') as HTMLDivElement | null;
const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const gizmoCanvas = document.getElementById('gizmo') as HTMLCanvasElement | null;
const chkAxes = document.getElementById('chk-axes') as HTMLInputElement | null;
// initialize gizmo visibility from checkbox (works before run)
if (gizmoCanvas && chkAxes) {
  gizmoCanvas.style.display = chkAxes.checked ? 'block' : 'none';
}
// wire checkbox to gizmo and runtime showAxes (if running)
if (chkAxes) {
  chkAxes.addEventListener('change', () => {
    const on = chkAxes.checked;
    if (gizmoCanvas) gizmoCanvas.style.display = on ? 'block' : 'none';
    try {
      if (runtimeController && typeof runtimeController.setShowAxes === 'function') {
        runtimeController.setShowAxes(on);
      }
    } catch (e) {
      appendLog('Failed to update showAxes on runtime', String(e));
    }
    drawGizmo();
  });
}
let ctx: CanvasRenderingContext2D | null = null;
type EditorInstance = any;

let monacoEditor: EditorInstance | null = null;
let monacoNs: any = null; // hold the global `monaco` namespace
let monacoEditorInstance: any = null; // full editor instance
let currentDecorationIds: string[] = [];
let irCode: string | null = null;
let runtimeController: any = null;

function appendLog(...parts: unknown[]) {
  const p = document.createElement('div');
  p.textContent = parts.map((v) => String(v)).join(' ');
  const target = logEntries ?? log;
  target.appendChild(p);
  // keep the scroll anchored to the bottom of the entries container
  if (logEntries) logEntries.scrollTop = logEntries.scrollHeight;
  else log.scrollTop = log.scrollHeight;
}

if (btnClear) {
  btnClear.addEventListener('click', () => {
    try {
      // Clear only the entries so the clear button remains in place
      if (logEntries) logEntries.innerHTML = '';
      else if (log) {
        // If no separated container exists, remove all children except the clear button
        for (let i = log.children.length - 1; i >= 0; i--) {
          const child = log.children[i];
          if (child.id !== 'btn-clear') log.removeChild(child);
        }
      }

      // Try to clear 2D rendering on the canvas
      const ctx2 = canvas.getContext('2d');
      if (ctx2) ctx2.clearRect(0, 0, canvas.width, canvas.height);
      else canvas.width = canvas.width;

      if (status) status.textContent = '';
    } catch (e) {
      appendLog('Failed to clear output pane', String(e));
    }
  });
}

function getSource() {
  if (monacoEditor) return monacoEditor.getValue();
  // fallback: no editor
  return '';
}

btnCompile.addEventListener('click', async () => {
  status.textContent = 'Compiling...';
  try {
    const { ir, warnings } = await compile(getSource());
    appendLog('Compilation successful');
    status.textContent = 'Compilation successful';
    irCode = ir;
    const allWarnings = warnings.all();
    if (allWarnings.length > 0) {
      appendLog(`Compilation completed with ${allWarnings.length} warning(s):`);
      allWarnings.forEach((w, i) => appendLog(`  ${i + 1}. ${w.message} (line ${w.line}, column ${w.column})`));
    } else {
      appendLog('No warnings');
    }

    // Show warnings in Monaco (markers + whole-line decorations) when available
    if (monacoNs && monacoEditorInstance) {
      try {
        const model = monacoEditorInstance.getModel();
        const markers = allWarnings.map((w) => ({
          severity: monacoNs.MarkerSeverity.Warning,
          message: w.message,
          startLineNumber: Math.max(1, w.line || 1),
          startColumn: Math.max(1, w.column || 1),
          endLineNumber: Math.max(1, w.line || 1),
          endColumn: Math.max(1, (w.column || 1) + 1)
        }));

        monacoNs.editor.setModelMarkers(model, 'csgl', markers);

        const newDecs = allWarnings.map((w) => ({
          range: new monacoNs.Range(Math.max(1, w.line || 1), 1, Math.max(1, w.line || 1), 1),
          options: {
            isWholeLine: true,
            className: 'csglLineWarning',
            hoverMessage: { value: `⚠ ${w.message}` }
          }
        }));

        currentDecorationIds = monacoEditorInstance.deltaDecorations(currentDecorationIds, newDecs);
      } catch (e) {
        appendLog('Failed to set Monaco warnings', String(e));
      }
    }
  } catch (err) {
    appendLog('Compilation error::', String(err));
    status.textContent = 'Compilation error';
  }
});

btnRun.addEventListener('click', async () => {
  status.textContent = 'Running';
  try {
    // Default IR is read from default.csgir
    const defaultIR = await fetch('/frontend/default.csgir').then((resp) => {
      if (!resp.ok) throw new Error(`Failed to load default IR: ${resp.statusText}`);
      return resp.text();
    });
    const ir = irCode ? irCode : defaultIR;
    const showAxes = (document.getElementById('chk-axes') as HTMLInputElement)?.checked ?? false;
    const controller = await webgpuMain(canvas, ir, (msg) => appendLog(msg), { showAxes });
    runtimeController = controller;
    // initialize frontend camera state from renderer
    try {
      const cam = controller.getCamera?.();
      if (cam) {
        initCameraFromRenderer(cam.pos, cam.target, cam.focal);
      }
    } catch (e) {
      appendLog('Failed to get initial camera from renderer', String(e));
    }
  } catch (err) {
    status.textContent = 'WebGPU error';
    appendLog('WebGPU failed', String(err));
    // fallback: simple 2D gradient to show output (get 2D context lazily)
    const w = canvas.width = 640;
    const h = canvas.height = 480;
    const ctx2 = ctx ?? canvas.getContext('2d');
    if (!ctx2) {
      appendLog('2D context unavailable for fallback');
      return;
    }
    ctx = ctx2;
    const image = ctx2.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        image.data[i] = (x / w) * 255;
        image.data[i + 1] = (y / h) * 160;
        image.data[i + 2] = 200;
        image.data[i + 3] = 255;
      }
    }
    ctx2.putImageData(image, 0, 0);
  }
});

// // live checkbox handler: update renderer without re-running
// if (chkAxes) {
//   chkAxes.addEventListener('change', () => {
//     const val = chkAxes.checked;
//     try {
//       if (runtimeController && typeof runtimeController.setShowAxes === 'function') {
//         runtimeController.setShowAxes(val);
//       }
//     } catch (e) {
//       appendLog('Failed to update showAxes at runtime', String(e));
//     }
//   });
// }

function waitForRequire(timeout = 3000) {
  return new Promise<void>((resolve, reject) => {
    const start = performance.now();
    function check() {
      if (globalThis.require != null) return resolve();
      if (performance.now() - start > timeout) return reject(new Error('Monaco loader not available'));
      setTimeout(check, 50);
    }
    check();
  });
}

// --- Camera / interaction controller (lightweight, CPU-side) ---
let camPos = { x: 0, y: 0, z: 5 };
let camTarget = { x: 0, y: 0, z: 0 };
let camFocal = 1.8;
let camYaw = 0;
let camPitch = 0;
let camDistance = 5;

function initCameraFromRenderer(posArr: [number, number, number], targetArr: [number, number, number], focal: number) {
  camPos.x = posArr[0]; camPos.y = posArr[1]; camPos.z = posArr[2];
  camTarget.x = targetArr[0]; camTarget.y = targetArr[1]; camTarget.z = targetArr[2];
  camFocal = focal;
  const vx = camPos.x - camTarget.x;
  const vy = camPos.y - camTarget.y;
  const vz = camPos.z - camTarget.z;
  camDistance = Math.max(1e-3, Math.hypot(vx, vy, vz));
  camYaw = Math.atan2(vx, vz);
  camPitch = Math.asin(Math.max(-1, Math.min(1, vy / camDistance)));
  drawGizmo();
}

let cameraScheduled = false;
function scheduleCameraUpdate() {
  if (cameraScheduled) return;
  cameraScheduled = true;
  requestAnimationFrame(() => {
    cameraScheduled = false;
    const tx = camTarget.x;
    const ty = camTarget.y;
    const tz = camTarget.z;
    const x = tx + camDistance * Math.sin(camYaw) * Math.cos(camPitch);
    const y = ty + camDistance * Math.sin(camPitch);
    const z = tz + camDistance * Math.cos(camYaw) * Math.cos(camPitch);
    camPos.x = x; camPos.y = y; camPos.z = z;
    if (runtimeController && typeof runtimeController.setCamera === 'function') {
      runtimeController.setCamera([camPos.x, camPos.y, camPos.z], [camTarget.x, camTarget.y, camTarget.z], camFocal);
    }
    drawGizmo();
  });
}

function updateCameraToRenderer() {
  // schedule a batched update to avoid excessive GPU submissions during pointermove
  scheduleCameraUpdate();
}

// pointer interaction
let dragging = false;
let dragButton: number | null = null;
let lastX = 0;
let lastY = 0;
let pointerId: number | null = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  dragging = true;
  dragButton = e.button;
  pointerId = e.pointerId;
  lastX = e.clientX;
  lastY = e.clientY;
  if (e.button === 0) {
    // left: compute pivot candidate and softly move target toward it
    if (runtimeController && typeof runtimeController.getCamera === 'function') {
      try {
        const cam = runtimeController.getCamera();
        const ndcX = (e.offsetX / canvas.width) * 2 - 1;
        const ndcY = 1 - (e.offsetY / canvas.height) * 2;
        // compute ray dir in world using same logic as shader
        const forward = normalizeVec3([cam.target[0] - cam.pos[0], cam.target[1] - cam.pos[1], cam.target[2] - cam.pos[2]]);
        let upRef = [0,1,0];
        if (Math.abs(dot(forward, upRef)) > 0.999) upRef = [0,0,1];
        const right = normalizeVec3(cross(forward, upRef));
        const up = normalizeVec3(cross(right, forward));
        const aspect = canvas.width / Math.max(canvas.height, 1);
        const sx = ndcX * aspect;
        const sy = ndcY;
        const dir = normalizeVec3([
          right[0]*sx + up[0]*sy + forward[0]*cam.focal,
          right[1]*sx + up[1]*sy + forward[1]*cam.focal,
          right[2]*sx + up[2]*sy + forward[2]*cam.focal,
        ]);
        // pick a point half the current distance along the ray
        const dist = camDistance * 0.5;
        const candidate = [cam.pos[0] + dir[0]*dist, cam.pos[1] + dir[1]*dist, cam.pos[2] + dir[2]*dist];
        // lerp
        camTarget.x = camTarget.x * 0.85 + candidate[0] * 0.15;
        camTarget.y = camTarget.y * 0.85 + candidate[1] * 0.15;
        camTarget.z = camTarget.z * 0.85 + candidate[2] * 0.15;
        updateCameraToRenderer();
      } catch (_) {}
    }
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== pointerId) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (dragButton === 0) {
    // left drag: orbit
    camYaw -= dx * 0.005;
    camPitch -= -dy * 0.005;
    const limit = Math.PI * 0.49;
    camPitch = Math.max(-limit, Math.min(limit, camPitch));
    updateCameraToRenderer();
  } else if (dragButton === 2) {
    // right drag: zoom
    const k = 1.0 + dy * 0.01;
    camDistance = Math.max(0.1, camDistance * k);
    updateCameraToRenderer();
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (e.pointerId === pointerId) {
    dragging = false;
    dragButton = null;
    pointerId = null;
  }
});

canvas.addEventListener('pointercancel', (e) => {
  if (e.pointerId === pointerId) {
    dragging = false;
    dragButton = null;
    pointerId = null;
  }
});

// small math helpers
function dot(a: number[], b: number[]) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a: number[], b: number[]) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function lengthVec3(a: number[]) { return Math.hypot(a[0], a[1], a[2]); }
function normalizeVec3(a: number[]) { const l = Math.max(1e-6, lengthVec3(a)); return [a[0]/l, a[1]/l, a[2]/l]; }

// --- Gizmo drawing (CPU-side lightweight overlay) ---
function drawGizmo() {
  if (!gizmoCanvas) return;
  // respect the checkbox: if axes hidden, clear and bail
  if (chkAxes && !chkAxes.checked) {
    const ctxClear = gizmoCanvas.getContext('2d');
    if (ctxClear) ctxClear.clearRect(0,0,gizmoCanvas.width,gizmoCanvas.height);
    return;
  }
  const ctx = gizmoCanvas.getContext('2d');
  if (!ctx) return;
  const w = gizmoCanvas.width;
  const h = gizmoCanvas.height;
  ctx.clearRect(0,0,w,h);
  // translucent background already via CSS; draw border
  ctx.save();
  ctx.translate(w/2, h/2);
  const size = Math.min(w,h) * 0.36;

  // camera basis
  const cam = { pos: [camPos.x, camPos.y, camPos.z], target: [camTarget.x, camTarget.y, camTarget.z] };
  const forward = normalizeVec3([cam.target[0]-cam.pos[0], cam.target[1]-cam.pos[1], cam.target[2]-cam.pos[2]]);
  let upRef = [0,1,0];
  if (Math.abs(dot(forward, upRef)) > 0.999) upRef = [0,0,1];
  const right = normalizeVec3(cross(forward, upRef));
  const up = normalizeVec3(cross(right, forward));

  // project each world axis into camera-local XY plane
  const axes = [ {v:[1,0,0], color:'#ff6666', label:'X'}, {v:[0,1,0], color:'#66ff66', label:'Y'}, {v:[0,0,1], color:'#6ea0ff', label:'Z'} ];
  for (const a of axes) {
    const vx = dot(right, a.v);
    const vy = dot(up, a.v);
    // draw from center outward
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(vx * size, -vy * size);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    // arrowhead
    ctx.beginPath();
    const tx = vx * size;
    const ty = -vy * size;
    ctx.arc(tx, ty, 6, 0, Math.PI*2);
    ctx.fillStyle = a.color;
    ctx.fill();
    // label
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(a.label, tx + Math.sign(vx||1)*10, ty - Math.sign(vy||1)*10 + 4);
  }

  // center marker
  ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fillStyle='#eee'; ctx.fill();
  ctx.restore();
}

// clicking the gizmo resets the view to a default orientation
if (gizmoCanvas) {
  gizmoCanvas.addEventListener('click', () => {
    // reset target to origin and orbit angles to defaults
    camTarget.x = 0; camTarget.y = 0; camTarget.z = 0;
    camYaw = 0; camPitch = 0;
    // try to keep a reasonable distance: if runtime knows scene radius use it
    try {
      const cam = runtimeController?.getCamera?.();
      if (cam) {
        const pos = cam.pos;
        const dx = pos[0] - 0; const dy = pos[1] - 0; const dz = pos[2] - 0;
        camDistance = Math.max(1.0, Math.hypot(dx, dy, dz));
      } else {
        camDistance = Math.max(1.0, camDistance);
      }
    } catch (_) {
      camDistance = Math.max(1.0, camDistance);
    }
    updateCameraToRenderer();
  });
}

async function initMonacoEditor() {
  try {
    await waitForRequire(5000);
    type RequireLike = ((modules: string[], callback: (...args: unknown[]) => void) => void) & {
      config?: (cfg: { paths: Record<string, string> }) => void;
    };

    const reqRaw = (globalThis as unknown as { require?: unknown }).require;
    if (!reqRaw) return appendLog('Monaco loader not found (require)');
    if (typeof reqRaw !== 'function') return appendLog('Monaco loader found but is not callable');
    const req = reqRaw as RequireLike;
    if (!req.config) return appendLog('Monaco loader missing `config` method');
    req.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.55.1/min/vs' } });
    req(['vs/editor/editor.main'], async () => {
      const monaco = (globalThis as unknown as { monaco?: unknown }).monaco as MonacoLike | undefined;
      if (!monaco) return appendLog('Monaco namespace not available');
      try {
        setupCSGLLanguage(monaco);
      } catch (e) {
        appendLog('Language setup failed', String(e));
      }

      // try to load the workspace script as the initial editor content
      let initial = `// New script.csgl (empty)`;
      try {
        const resp = await fetch('/frontend/script.csgl');
        if (resp.ok) initial = await resp.text();
      } catch (_) {
        appendLog('Could not load /frontend/script.csgl, using fallback');
      }

      monacoEditor = monaco.editor.create(editorHost, {
        value: initial,
        language: 'csgl',
        theme: 'csglTheme',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14
      }) as unknown as EditorInstance;
      // keep references for later decorations/markers
      monacoNs = monaco;
      monacoEditorInstance = monacoEditor;

      appendLog('Monaco ready (CSGL)');
    });
  } catch (err) {
    appendLog('Monaco init error', String(err));
  }
}

initMonacoEditor();