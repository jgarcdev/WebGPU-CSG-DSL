Backend

This folder contains WebGPU backend/runtime code only. The development HTTP server was moved out of this folder.

Notes:
- Keep WebGPU runtime, shader generation, and GPU-bound code in this folder.
- The development server for serving the frontend and bundling `frontend/app.ts` is available at `dev_server.ts` in the repository root.
