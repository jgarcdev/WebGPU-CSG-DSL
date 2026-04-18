import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { lex } from "../../compiler/lexer.ts";
import { parse } from "../../compiler/parser.ts";
import { sema } from "../../compiler/sema.ts";
import { lowerIR } from "../../compiler/csgIR.ts";
import { parseIR } from "../csgir.ts";

Deno.test("parseIR handles compiler-emitted IR", () => {
  const src = `let s = Sphere(1.0);
let c = Cube(2.0);
let moved = translate(s, 1.0, 0.0, 0.0);
let obj = union(moved, c);
Render(obj);`;

  const tokens = lex(src);
  const ast = parse(tokens);
  const { program } = sema(ast);
  const irText = lowerIR(program);

  const ir = parseIR(irText);
  assertEquals(ir.version, "0.0.1");
  assertEquals(ir.primitives.length, 2);
  assertEquals(ir.transformations.length, 1);
  assertEquals(ir.csg.length, 1);
  assertEquals(ir.renders.length, 1);
  assertEquals(ir.renders[0].kind, "c");
  assertEquals(ir.renders[0].index, 0);
});

Deno.test("parseIR rejects malformed transform matrix length", () => {
  const bad = `[0.0.1]
[
  Renders[t.0]
  Primitives[
    Sphere[1.0]
  ]
  Transformations[
    p.0[1, 0, 0]
  ]
  CSG[
  ]
]`;

  const err = assertThrows(() => parseIR(bad), Error);
  assertStringIncludes(err.message, "exactly 16");
});

Deno.test("parseIR rejects out-of-range render refs", () => {
  const bad = `[0.0.1]
[
  Renders[c.9]
  Primitives[
    Sphere[1.0]
  ]
  Transformations[
  ]
  CSG[
  ]
]`;

  const err = assertThrows(() => parseIR(bad), Error);
  assertStringIncludes(err.message, "out of range");
});

Deno.test("parseIR requires all sections", () => {
  const bad = `[0.0.1]
[
  Renders[p.0]
  Primitives[
    Sphere[1.0]
  ]
  CSG[
  ]
]`;

  const err = assertThrows(() => parseIR(bad), Error);
  assertStringIncludes(err.message, "Transformations");
});
