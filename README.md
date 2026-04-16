# README.md

# CSG‑DSL WebGPU Engine  
A functional domain‑specific language (DSL) and GPU‑accelerated backend for Constructive Solid Geometry (CSG) rendering using WebGPU.

This project allows users to write simple, expressive CSG programs in a browser‑based editor. The DSL is parsed, compiled into an intermediate representation (IR), translated into WGSL shaders, and executed on the GPU to produce real‑time rendered geometry.

---

## Overview

This project demonstrates:

- A **DSL** for describing 3D geometry using CSG  
- A **compiler pipeline**: Lexer → Parser → AST → IR → WGSL  
- A **WebGPU backend** that evaluates CSG operations on the GPU  
- A **browser‑based editor** with syntax highlighting and a Compile/Run workflow  

The goal is to provide an interactive, modern environment for experimenting with CSG and GPU programming.

---

## DSL Design

### Primitives
The core geometric primitives:

```
Sphere(radius)
Cube(size)
Rectangle(width, height, depth)
Cylinder(radius, height)
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
translate(x, y, z, shape)
rotate(x, y, z, shape)
scale(x, y, z, shape)
```

---


<!-- TODO: Add more details -->