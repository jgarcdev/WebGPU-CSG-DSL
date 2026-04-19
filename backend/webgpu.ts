import { parseIR, flattenIR, FlatLeaf, FlatToken } from "./csgir.ts";


/**
 * Loads a shader source file as text.
 * @param path Path to the shader source
 * @returns 
 */
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

function createUniformBufferData(width: number, height: number, leafCount: number, tokenCount: number, renderCount: number, showAxes: number, cameraPos: [number, number, number], cameraTarget: [number, number, number], focal: number): ArrayBuffer {
  // Layout (16-byte aligned rows):
  // [0..15] resolution.xy, pad.xy
  // [16..31] leafCount, tokenCount, renderCount, showAxes (u32)
  // [32..47] cameraPos vec4f
  // [48..63] cameraTarget vec4f
  // [64..79] cameraParams vec4f (x=focal)
  const buffer = new ArrayBuffer(80);
  const view = new DataView(buffer);
  view.setFloat32(0, width, true);
  view.setFloat32(4, height, true);
  // bytes 8..15 left as padding
  view.setUint32(16, leafCount, true);
  view.setUint32(20, tokenCount, true);
  view.setUint32(24, renderCount, true);
  view.setUint32(28, showAxes ? 1 : 0, true);
  // cameraPos at offset 32
  view.setFloat32(32, cameraPos[0], true);
  view.setFloat32(36, cameraPos[1], true);
  view.setFloat32(40, cameraPos[2], true);
  view.setFloat32(44, 0.0, true);
  // cameraTarget at offset 48
  view.setFloat32(48, cameraTarget[0], true);
  view.setFloat32(52, cameraTarget[1], true);
  view.setFloat32(56, cameraTarget[2], true);
  view.setFloat32(60, 0.0, true);
  // cameraParams at offset 64
  view.setFloat32(64, focal, true);
  view.setFloat32(68, 0.0, true);
  view.setFloat32(72, 0.0, true);
  view.setFloat32(76, 0.0, true);
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
  // initial camera: position the camera along +Z looking at origin, distance based on sceneRadius
  const sceneRadius = flattened.sceneRadius ?? 5.0;
  const initDistance = Math.max(1.0, sceneRadius * 1.6);
  const cameraPosInit: [number, number, number] = [0.0, 0.0, initDistance];
  const cameraTargetInit: [number, number, number] = [0.0, 0.0, 0.0];
  const focalInit = 1.8;
  const uniformRaw = createUniformBufferData(width, height, flattened.leaves.length, flattened.tokens.length, ir.renders.length, showAxes, cameraPosInit, cameraTargetInit, focalInit);

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

  function renderOnce() {
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

  renderOnce();

  // Controller for live updates without recreating pipeline/buffers
  return {
    setShowAxes(show: boolean) {
      const v = new Uint32Array([show ? 1 : 0]);
      // showAxes is at byte offset 28
      device.queue.writeBuffer(uniformBuffer, 28, v.buffer, 0, 4);
      renderOnce();
    },
    setCamera(pos: [number, number, number], target: [number, number, number], focal: number) {
      const cam = new Float32Array([pos[0], pos[1], pos[2], 0.0]);
      const tgt = new Float32Array([target[0], target[1], target[2], 0.0]);
      const params = new Float32Array([focal, 0.0, 0.0, 0.0]);
      device.queue.writeBuffer(uniformBuffer, 32, cam.buffer, cam.byteOffset, 16);
      device.queue.writeBuffer(uniformBuffer, 48, tgt.buffer, tgt.byteOffset, 16);
      device.queue.writeBuffer(uniformBuffer, 64, params.buffer, params.byteOffset, 16);
      renderOnce();
    }
    , getCamera() {
      return { pos: cameraPosInit, target: cameraTargetInit, focal: focalInit };
    }
  };
}