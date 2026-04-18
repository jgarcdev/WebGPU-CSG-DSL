import { parseIR, flattenIR, FlatLeaf, FlatToken } from "./csgir.ts";


async function loadShaderSource(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load shader ${path}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function createLeafBufferData(leaves: FlatLeaf[]): ArrayBuffer {
  const stride = 96;
  const buffer = new ArrayBuffer(stride * leaves.length);
  const view = new DataView(buffer);

  for (let i = 0; i < leaves.length; i++) {
    const base = i * stride;
    const leaf = leaves[i];
    view.setUint32(base + 0, leaf.kind, true);
    view.setUint32(base + 4, 0, true);
    view.setUint32(base + 8, 0, true);
    view.setUint32(base + 12, 0, true);
    view.setFloat32(base + 16, leaf.params[0], true);
    view.setFloat32(base + 20, leaf.params[1], true);
    view.setFloat32(base + 24, leaf.params[2], true);
    view.setFloat32(base + 28, leaf.params[3], true);
    for (let j = 0; j < 16; j++) {
      view.setFloat32(base + 32 + j * 4, leaf.inv[j], true);
    }
  }

  return buffer;
}

function createTokenBufferData(tokens: FlatToken[]): ArrayBuffer {
  const stride = 16;
  const buffer = new ArrayBuffer(stride * tokens.length);
  const view = new DataView(buffer);

  for (let i = 0; i < tokens.length; i++) {
    const base = i * stride;
    view.setUint32(base + 0, tokens[i].kind, true);
    view.setUint32(base + 4, tokens[i].data, true);
    view.setUint32(base + 8, 0, true);
    view.setUint32(base + 12, 0, true);
  }

  return buffer;
}

function createUniformBufferData(width: number, height: number, leafCount: number, tokenCount: number, renderCount: number, showAxes: number): ArrayBuffer {
  // Layout: vec2f (8) + 3*u32 (12) + showAxes u32 (4) = 24 bytes, pad to 48
  const buffer = new ArrayBuffer(48);
  const view = new DataView(buffer);
  view.setFloat32(0, width, true);
  view.setFloat32(4, height, true);
  view.setUint32(8, leafCount, true);
  view.setUint32(12, tokenCount, true);
  view.setUint32(16, renderCount, true);
  view.setUint32(20, showAxes ? 1 : 0, true);
  return buffer;
}

export async function webgpuMain(canvas: HTMLCanvasElement, irCode: string, onLog?: (msg: string) => void, options?: { showAxes?: boolean }) {
  onLog?.("Received IR code:\n" + irCode);

  onLog?.("Initializing WebGPU");
  if (!navigator.gpu) {
    onLog?.("WebGPU not supported in this browser");
    throw new Error("WebGPU not supported");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    onLog?.("No suitable GPU adapter found");
    throw new Error("No GPU adapter");
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) {
    onLog?.("Could not acquire WebGPU context from canvas");
    throw new Error("No WebGPU context");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  const width = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 640));
  const height = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || 480));
  canvas.width = width;
  canvas.height = height;
  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });

  const ir = parseIR(irCode);
  onLog?.(`Parsed IR v${ir.version ?? "unknown"}: ${ir.primitives.length} primitives, ${ir.transformations.length} transformations, ${ir.csg.length} csg ops, ${ir.renders.length} render target(s)`);
  if (ir.renders.length === 0) {
    throw new Error("IR parsed successfully but includes no render targets");
  }

  const flattened = flattenIR(ir);
  if (flattened.leaves.length === 0 || flattened.tokens.length === 0) {
    throw new Error("Could not flatten IR into a renderable scene");
  }
  // validateRPN(flattened.tokens);

  const leafRaw = createLeafBufferData(flattened.leaves);
  const tokenRaw = createTokenBufferData(flattened.tokens);
  const showAxes = options?.showAxes ? 1 : 0;
  const uniformRaw = createUniformBufferData(width, height, flattened.leaves.length, flattened.tokens.length, ir.renders.length, showAxes);

  const leafBuffer = device.createBuffer({
    size: leafRaw.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(leafBuffer, 0, leafRaw);

  const tokenBuffer = device.createBuffer({
    size: tokenRaw.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tokenBuffer, 0, tokenRaw);

  const uniformBuffer = device.createBuffer({
    size: uniformRaw.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformRaw);

  const vertWGSL = await loadShaderSource("/backend/shaders/vert.wgsl");
  const fragWGSL = await loadShaderSource("/backend/shaders/frag.wgsl");

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: vertWGSL }),
      entryPoint: "main",
    },
    fragment: {
      module: device.createShaderModule({ code: fragWGSL }),
      entryPoint: "main",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: leafBuffer } },
      { binding: 2, resource: { buffer: tokenBuffer } },
    ],
  });

  const encoder = device.createCommandEncoder();
  const view = context!.getCurrentTexture()!.createView();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0.04, g: 0.06, b: 0.1, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1, 0, 0);
  pass.end();
  device.queue.submit([encoder.finish()]);
  onLog?.("WebGPU render completed");
}