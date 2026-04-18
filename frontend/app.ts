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
const chkAxes = document.getElementById('chk-axes') as HTMLInputElement | null;
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
    const defaultIR = await fetch('/default.csgir').then((resp) => {
      if (!resp.ok) throw new Error(`Failed to load default IR: ${resp.statusText}`);
      return resp.text();
    });
    const ir = irCode ? irCode : defaultIR;
    const showAxes = (document.getElementById('chk-axes') as HTMLInputElement)?.checked ?? false;
    await webgpuMain(canvas, ir, (msg) => appendLog(msg), { showAxes });
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
        const resp = await fetch('/script.csgl');
        if (resp.ok) initial = await resp.text();
      } catch (_) {
        appendLog('Could not load /script.csgl, using fallback');
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