Frontend

This folder contains the browser UI for the CSG‑DSL editor and preview.

Files:
- `index.html` — Main single-page editor UI.
- `styles.css` — Basic styles for the editor and output.
- `app.ts` — Frontend TypeScript source. The Deno server will bundle this to `app.js` on the fly.

Run (development):
- Use `deno task start` to run the development server `dev_server.ts` at the repository root which serves and bundles the frontend.

Notes:
- The current frontend is a minimal scaffold. The editor now integrates the Monaco Editor via CDN for a richer editing experience.
	- Monaco is loaded from `https://unpkg.com/monaco-editor@0.55.1/min/vs/loader.js`.
	- `frontend/app.ts` initializes Monaco and the Compile/Run toolbar.