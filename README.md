# README

This project allows users to write simple, expressive CSG programs in a browser‑based editor. The DSL is parsed, compiled into an intermediate representation (IR), translated into WGSL shaders, and executed on the GPU to produce real‑time rendered geometry.


## Overview

This project constists of:

- A **DSL** for describing 3D geometry using CSG  
- A **compiler pipeline**: Lexer → Parser → AST → IR → WGSL  
- A **WebGPU backend** that evaluates CSG operations on the GPU  
- A **browser‑based editor** with syntax highlighting and a Compile/Run workflow  

The goal is to provide an interactive, modern environment for experimenting with CSG and GPU programming.


## DSL Design

View the [DSL documentation](docs/DSL.md) for a detailed description of the language syntax and features. Below is a brief overview of the main components.

### Primitives
The core geometric primitives:

```
Sphere(radius)
Cube(size)
Rectangle(width, height, depth)
Cylinder(radius, height)
Cone(radius, height)
Torus(majorRadius, minorRadius)
Octahedron(size)
```

### CSG Operations
The fundamental constructive solid geometry operators:

```
union(a, b)
difference(a, b)
intersection(a, b)
```

### Transformations
Transformations wrap a shape and return a new transformed shape:

```
translate(shape, x, y, z)
rotate(shape, x, y, z)
scale(shape, x, y, z)
```

### Effects
Effects modify the appearance of shapes:

```
color(shape, r, g, b)
```

## Prerequisites

- Deno (recommended) — install from https://deno.land. The project uses Deno tasks and the runtime to bundle and serve the frontend.
- A modern browser with WebGPU support for GPU rendering.

## Quick start

- Start the local server (serves the frontend and bundles `app.ts` on demand):
```bash
deno run start
```

- Open http://localhost:8080 in your browser. The editor opens with the default example `script.csgl`.

- For iterative development with automatic bundling/watch behavior, use:
```bash
deno run watch
```

## Development

- The compiler and backend are implemented in TypeScript and run on Deno. Important files:
	- `server.ts` — simple static server + on-demand bundling of `frontend/app.ts`.
	- `frontend/app.ts` — browser app that drives the editor and WebGPU renderer.
	- `compiler/` — lexer, parser, AST, IR and semantic analysis for the DSL.

- Recommended workflow:
	1. Run `deno run start` and open the app in the browser.
	2. Edit `frontend/*.csgl` example files or `frontend/app.ts`.
	3. Use the in-browser Compile/Run buttons to compile the DSL and render on the GPU.

## Running tests

- The project contains unit tests (Deno style) for the compiler components. Run all tests with:

	```bash
	deno test
	```

	Tests are located under `compiler/tests` and use the Deno standard library assertions.

## Project structure

- `frontend/` — browser UI, examples, styles, and `app.ts`.
- `backend/` — runtime helpers and WebGPU glue code.
- `compiler/` — lexer, parser, AST, IR, semantic analysis, and related tests.
- `shaders/` — WGSL shader files used by the renderer.
- `server.ts` — small Deno server used for local development.

## Examples

- The `frontend` folder includes a few example scene files (`lunarbase.csgl`, `molecules.csgl`, etc.). Open the app, copy and paste an example, then hit Compile → Run.