import { assertEquals, assertThrows } from "@std/assert";
import { parse } from "../parser.ts";
import { sema } from "../sema.ts";
import { SemanticError } from "../errors.ts";
import lex from "../lexer.ts";


Deno.test("sema: undefined variable in let", () => {
  const src = "let a = union(b, c);";
  const ast = parse(lex(src));
  assertThrows(() => sema(ast), SemanticError, "used but not defined");
});

Deno.test("sema: used before defined", () => {
  const src = "let a = b; let b = Sphere(1); Render(a);";
  const ast = parse(lex(src));
  assertThrows(() => sema(ast), SemanticError);
});

Deno.test("sema: unused variable warning", () => {
  const src = "let a = Sphere(1); let b = Sphere(2); Render(a);";
  const ast = parse(lex(src));
  const { warnings } = sema(ast);
  const all = warnings.all();
  // expect a warning about 'b' being unused
  const found = all.some(w => w.message.includes("'b'"));
  assertEquals(found, true);
});

Deno.test("sema: primitive arity and types", () => {
  assertThrows(() => sema(parse(lex("let a = Sphere(); Render(a);"))), SemanticError);
  assertThrows(() => sema(parse(lex("let a = Sphere(x); Render(a);"))), SemanticError);
  assertThrows(() => sema(parse(lex("let a = Cylinder(1); Render(a);"))), SemanticError);
});

Deno.test("sema: unknown operation", () => {
  assertThrows(() => sema(parse(lex("let a = foo(1); Render(a);"))), SemanticError);
});

Deno.test("sema: Render accepts nested call", () => {
  const src = "Render(Sphere(0.2));";
  const ast = parse(lex(src));
  // should not throw
  const { warnings } = sema(ast);
  // no warnings since nothing defined
  assertEquals(warnings.isEmpty(), true);
});

Deno.test("sema: numeric expressions allowed in numeric args", () => {
  const src = "let a = Sphere(2 * 0.2); Render(a);";
  const ast = parse(lex(src));
  // should not throw
  const { warnings } = sema(ast);
  assertEquals(warnings.isEmpty(), true);
});

Deno.test("sema: new primitives supported", () => {
  const src = "let p = Pyramid(2, 3); let c = Cone(1,2); let t = Torus(3,0.5); let o = Octahedron(1); Render(p);";
  const ast = parse(lex(src));
  const { warnings } = sema(ast);
  assertEquals(warnings.isEmpty(), false); // other objects may be unused but no errors expected
});

Deno.test("sema: color effect argument ranges", () => {
  const srcGood = "let a = Sphere(1); let b = color(a, 255, 128, 0); Render(b);";
  const srcBad = "let a = Sphere(1); let b = color(a, 300, 0, 0); Render(b);";
  // good should not throw
  sema(parse(lex(srcGood)));
  // bad should throw
  assertThrows(() => sema(parse(lex(srcBad))), SemanticError);
});

Deno.test("const: basic substitution and numeric expr", () => {
  const src = "const { NUM = 2.3; } let a = Sphere(NUM * 2); Render(a);";
  const ast = parse(lex(src));
  const { warnings } = sema(ast);
  // should not throw and no errors; warnings may exist for unused if any
  assertEquals(warnings.isEmpty(), true);
});

Deno.test("const: references previous constants", () => {
  const src = "const { A = 2; B = A * 3; } let s = Sphere(B); Render(s);";
  const ast = parse(lex(src));
  const { warnings } = sema(ast);
  assertEquals(warnings.isEmpty(), true);
});

Deno.test("const: must be first", () => {
  const src = "let a = Sphere(1); const { X = 1; }";
  const tokens = lex(src);
  assertThrows(() => parse(tokens), Error);
});

Deno.test("const: reserved name error", () => {
  const src = "const { Sphere = 1; }";
  const ast = parse(lex(src));
  assertThrows(() => sema(ast), Error);
});