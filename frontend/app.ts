/// <reference lib="dom" />

import { setupCSGLLanguage, MonacoLike } from './monaco/csgl.ts';
import { webgpuMain } from '../backend/webgpu.ts';
import compile from "../compiler/compiler.ts";

const editorHost = document.getElementById('editor-host') as HTMLDivElement;
const btnCompile = document.getElementById('btn-compile') as HTMLButtonElement;
const btnRun = document.getElementById('btn-run') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLSpanElement;
const log = document.getElementById('log') as HTMLDivElement;
const canvas = document.querySelector("canvas") as HTMLCanvasElement;
let ctx: CanvasRenderingContext2D | null = null;
type EditorInstance = { getValue(): string };

let monacoEditor: EditorInstance | null = null;

function appendLog(...parts: unknown[]) {
  const p = document.createElement('div');
  p.textContent = parts.map((v) => String(v)).join(' ');
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

function getSource() {
  if (monacoEditor) return monacoEditor.getValue();
  // fallback: no editor
  return '';
}

btnCompile.addEventListener('click', async () => {
  status.textContent = 'Compiling...';
  // This will call the `compile` function, passing in the source code from `getSource()`
  // The function may throw an error if there are compilation issues, which will need to be displayed in the UI (e.g. in the `log` element)
  try {
    const result = await compile(getSource());
    appendLog('Compilation successful');
    status.textContent = 'Compilation successful';
  } catch (err) {
    appendLog('Compilation error', String(err));
    status.textContent = 'Compilation error';
  }
});

btnRun.addEventListener('click', async () => {
  status.textContent = 'Running (WebGPU preview)';
  try {
    await webgpuMain(canvas, (msg) => appendLog(msg));
    appendLog('WebGPU placeholder ran');
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

      appendLog('Monaco ready (CSGL)');
    });
  } catch (err) {
    appendLog('Monaco init error', String(err));
  }
}

initMonacoEditor();