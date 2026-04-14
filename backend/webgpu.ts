// import computeWGSL from "./shaders/compute.wgsl";
// import vertWGSL from "./shaders/vert.wgsl";
// import fragWGSL from "./shaders/frag.wgsl";



export async function webgpuMain(canvas: HTMLCanvasElement, onLog?: (msg: string) => void) {
  onLog?.('Initializing WebGPU');
  if (!navigator.gpu) {
    onLog?.('WebGPU not supported in this browser');
    throw new Error('WebGPU not supported');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    onLog?.('No suitable GPU adapter found');
    throw new Error('No GPU adapter');
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) {
    onLog?.('Could not acquire WebGPU context from canvas');
    throw new Error('No WebGPU context');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device,
		format
	});

  const GRID_SIZE = 8;

  // Create a buffer with the vertices for a single cell.
  const vertices = new Float32Array([
    -0.8, -0.8,
      0.8, -0.8,
      0.8,  0.8,

    -0.8, -0.8,
      0.8,  0.8,
    -0.8,  0.8,
  ]);
  const vertexBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
      format: "float32x2",
      offset: 0,
      shaderLocation: 0, // Position. Matches @location(0) in the @vertex shader.
    }],
  };

  // Create the shader that will render the cells.
  const cellShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: /* wgsl */ `
      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) cell: vec2f,
      };

      @group(0) @binding(0) var<uniform> grid: vec2f;

      @vertex
      fn vertexMain(@location(0) position: vec2f,
                    @builtin(instance_index) instance: u32) -> VertexOutput {
        let i = f32(instance);
        let cell = vec2f(i % grid.x, floor(i / grid.x));

        let cellOffset = cell / grid * 2;
        let gridPos = (position+1) / grid - 1 + cellOffset;

        var output: VertexOutput;
        output.position = vec4f(gridPos, 0, 1);
        output.cell = cell;
        return output;
      }

      @fragment
      fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
        let c = input.cell / grid;
        return vec4f(c, 1-c.x, 1);
      }
    `
  });

  // Create a pipeline that renders the cell.
  const cellPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: "auto",
    vertex: {
      module: cellShaderModule,
      entryPoint: "vertexMain",
      buffers: [vertexBufferLayout]
    },
    fragment: {
      module: cellShaderModule,
      entryPoint: "fragmentMain",
      targets: [{
        format: format
      }]
    }
  });

  // Create a uniform buffer that describes the grid.
  const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
  const uniformBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

  // Create a bind group to pass the grid uniforms into the pipeline
  const bindGroup = device.createBindGroup({
    label: "Cell renderer bind group",
    layout: cellPipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    }],
  });

  // Clear the canvas with a render pass
  const encoder = device.createCommandEncoder();

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
      storeOp: "store",
    }]
  });

  // Draw the square.
  pass.setPipeline(cellPipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setVertexBuffer(0, vertexBuffer);

  // Draw enough cells to fill the grid
  const instanceCount = GRID_SIZE * GRID_SIZE;
  pass.draw(vertices.length / 2, instanceCount);

  pass.end();

  device.queue.submit([encoder.finish()]);

  onLog?.('WebGPU frame submitted');
}
