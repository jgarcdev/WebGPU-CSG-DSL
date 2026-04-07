# README.md

# CSG‑DSL WebGPU Engine  
A functional domain‑specific language (DSL) and GPU‑accelerated backend for Constructive Solid Geometry (CSG) rendering using WebGPU.

This project allows users to write simple, expressive CSG programs in a browser‑based editor. The DSL is parsed, compiled into an intermediate representation (IR), translated into WGSL shaders, and executed on the GPU to produce real‑time rendered geometry.

---

## Overview

This project demonstrates:

- A **functional DSL** for describing 3D geometry using CSG  
- A **compiler pipeline**: Lexer → Parser → AST → IR → WGSL  
- A **WebGPU backend** that evaluates CSG operations on the GPU  
- A **browser‑based editor** with syntax highlighting and a Compile/Run workflow  

The goal is to provide an interactive, modern environment for experimenting with CSG and GPU programming.

---

## DSL Design

The DSL is **functional**, tree‑structured, and minimal. Every operation is a function call of the form:

```
operation(arg1, arg2, ...)
```

There are no variables, loops, conditionals, or statements. This keeps parsing simple and ensures the language maps cleanly to a CSG tree.

### Primitives
The core geometric primitives:

```
sphere(radius)
cube(size)
cylinder(radius, height)
```

### CSG Operations
The fundamental constructive solid geometry operators:

```
union(a, b)
difference(a, b)
intersection(a, b)
```

All operators may support multiple arguments:

```
union(a, b, c, d)
```

### Transformations
Transformations wrap a shape and return a new transformed shape:

```
translate(x, y, z, shape)
rotate(x, y, z, shape)
scale(x, y, z, shape)
```

### Example Program

```
difference(
    cube(2),
    translate(0.5, 0.5, 0.5,
        sphere(1)
    )
)
```

---

## Language Grammar (EBNF)

```
program       = expression ;
expression    = call ;
call          = IDENT "(" arguments? ")" ;
arguments     = argument ("," argument)* ;
argument      = expression | number | named_argument ;
named_argument = IDENT "=" argument ;
number        = DIGITS ("." DIGITS)? ;
```

This grammar is intentionally small. It avoids operator precedence, infix operators, statements, and blocks.

---

## Compiler Architecture

The compiler consists of the following stages:

### 1. **Lexer**
Converts raw text into tokens:

- identifiers  
- numbers  
- parentheses  
- commas  
- equals signs  

### 2. **Parser**
A recursive‑descent parser builds an **AST** representing the program structure.

### 3. **AST**
The AST is a tree of function calls:

```
Call {
  name: "union",
  args: [ ... ]
}
```

### 4. **Intermediate Representation (IR)**
The IR normalizes the AST into a GPU‑friendly structure:

- flattened transforms  
- simplified CSG trees  
- explicit primitive nodes  
- explicit transformation matrices  

### 5. **WGSL Code Generation**
The IR is translated into WGSL shader code.

Two rendering strategies are possible:

#### A. **SDF Raymarching (recommended for v1)**
- Each primitive becomes a signed distance function  
- CSG ops become min/max combinations  
- A raymarch loop renders the scene  

#### B. **Voxel CSG + Marching Cubes (advanced)**
- GPU voxelizes primitives  
- Performs CSG ops on voxel grids  
- Extracts a mesh  

---

## WebGPU Backend

The backend:

1. Receives the compiled IR  
2. Generates WGSL compute or fragment shaders  
3. Executes them via WebGPU  
4. Returns an image or mesh to the browser  

The rendering pipeline may include:

- compute passes for SDF evaluation  
- render passes for shading  
- uniform buffers for camera + transforms  
- storage buffers for scene data  

---

## Frontend Interface

The frontend provides:

### **In‑browser code editor**
- Monaco Editor
- Syntax highlighting for the DSL
	- Using Monarch
- Auto‑indentation  
- Error markers  

### **Compile button**
Sends DSL text to backend → returns errors or success.

### **Run button**
Executes the compiled program on the GPU → displays output.

### **Output viewport**
- 2D image (raymarched)  
- or 3D mesh viewer (future)  

---

## Project Goals

- Build a complete DSL for CSG  
- Implement a working compiler pipeline  
- Render CSG scenes using WebGPU  
- Provide an interactive browser environment  
- Keep the language minimal, clean, and functional  

---

## Future Extensions

- Variables and `let` bindings  
- User‑defined functions  
- Materials and shading options  
- Live auto‑compile mode  
- Mesh export  
- More primitives (torus, cone, etc.)  
- Boolean simplification in IR  