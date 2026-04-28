import { extname } from "@std/path";

function contentTypeFor(path: string) {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "application/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".wasm": return "application/wasm";
    default: return "application/octet-stream";
  }
}

async function serveFileUrl(fileUrl: URL, requestPath: string) {
  try {
    const data = await Deno.readFile(fileUrl);
    return new Response(data, { headers: { "content-type": contentTypeFor(requestPath) } });
  } catch (_err) {
    console.error("serveFileUrl: could not read", String(fileUrl), "for", requestPath);
    return new Response("Not found", { status: 404 });
  }
}

async function bundleAppTs() {
  const appUrl = new URL("./frontend/app.ts", import.meta.url).href;
  // Use Deno.bundle with `entrypoints` to create an in-memory bundle
  const result = await Deno.bundle({ 
    entrypoints: [appUrl],
    write: false,
    // sourcemap: "inline"
  });
  // Prefer outputFiles when available (array of OutputFile)
  if (result && Array.isArray(result.outputFiles)) {
    const files: Array<Deno.bundle.OutputFile> = result.outputFiles;
    // find the JS module output (prefer .js bundle)
    const candidate = files.find(f => typeof f.path === "string" && (f.path.endsWith(".js") || f.path.includes("bundle")) ) ?? files[0];
    if (candidate) {
      if (typeof candidate.contents === "string") return candidate.contents;
      if (typeof candidate.text === "function") return candidate.text();
    }
  }
  // Fallback: if result has a `code` property, return it
  if (result && typeof (result as any).code === "string") return (result as any).code;
  return "";
}

console.log("Starting server on http://localhost:8080");
Deno.serve({ port: 8080 }, async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname === '/' ? "/index.html" : url.pathname;

  // ensure root explicitly serves index.html (avoids subtle platform routing issues)
  if (url.pathname === '/') {
    return await serveFileUrl(new URL("./frontend/index.html", import.meta.url), "/index.html");
  }

  if (pathname === "/app.js") {
    try {
      const js = await bundleAppTs();
      return new Response(js, { headers: { "content-type": "application/javascript; charset=utf-8" } });
    } catch (err) {
      return new Response("// bundle error\nconsole.error(" + JSON.stringify(String(err)) + ");", { headers: { "content-type": "application/javascript; charset=utf-8" }, status: 500 });
    }
  }

  // Serve static frontend files from ./frontend, fall back to project root
  if (pathname.startsWith('/')) {
    try {
      const fileUrl2 = new URL(`.${pathname}`, import.meta.url);
      const resp2 = await serveFileUrl(fileUrl2, pathname);
      if (resp2.status !== 404) return resp2;
    } catch (_) {
      _;
    }
  }

  return new Response("Not found", { status: 404 });
});