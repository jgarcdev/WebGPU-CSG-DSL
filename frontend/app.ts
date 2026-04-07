/// <reference lib="dom" />

import { setupCSGLLanguage, MonacoLike } from './monaco/myLang.ts';

const editorHost = document.getElementById('editor-host') as HTMLDivElement;
const btnCompile = document.getElementById('btn-compile') as HTMLButtonElement;
const btnRun = document.getElementById('btn-run') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLSpanElement;
const log = document.getElementById('log') as HTMLDivElement;
const canvas = document.getElementById('viewport') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
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
  appendLog('Sending compile request');
  try {
    const resp = await fetch('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: getSource() })
    });
    const data = await resp.json();
    if (data.ok) {
      status.textContent = 'Compiled';
      appendLog('Compile OK');
    } else {
      status.textContent = 'Compile error';
      appendLog('Compile error', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    status.textContent = 'Error';
    appendLog('Compile failed', String(err));
  }
});

btnRun.addEventListener('click', () => {
  status.textContent = 'Running (local preview)';
  // Placeholder renderer: simple gradient to show output
  const w = canvas.width = 640;
  const h = canvas.height = 480;
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      image.data[i] = (x / w) * 255;
      image.data[i + 1] = (y / h) * 160;
      image.data[i + 2] = 200;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  appendLog('Rendered preview (placeholder)');
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