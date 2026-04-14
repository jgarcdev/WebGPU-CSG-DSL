import { assertEquals, assertThrows } from '@std/assert';
import { parse } from '../parser.ts';
import { sema } from '../sema.ts';
import { SemanticError } from '../errors.ts';
import lex from "../lexer.ts";


Deno.test('sema: undefined variable in let', () => {
  const src = 'let a = union(b, c);';
  const ast = parse(lex(src));
  assertThrows(() => sema(ast), SemanticError, "used but not defined");
});

Deno.test('sema: used before defined', () => {
  const src = 'let a = b; let b = Sphere(1); Render(a);';
  const ast = parse(lex(src));
  assertThrows(() => sema(ast), SemanticError);
});

Deno.test('sema: unused variable warning', () => {
  const src = 'let a = Sphere(1); let b = Sphere(2); Render(a);';
  const ast = parse(lex(src));
  const { warnings } = sema(ast);
  const all = warnings.all();
  // expect a warning about 'b' being unused
  const found = all.some(w => w.message.includes("'b'"));
  assertEquals(found, true);
});

Deno.test('sema: primitive arity and types', () => {
  assertThrows(() => sema(parse(lex('let a = Sphere(); Render(a);'))), SemanticError);
  assertThrows(() => sema(parse(lex('let a = Sphere(x); Render(a);'))), SemanticError);
  assertThrows(() => sema(parse(lex('let a = Cylinder(1); Render(a);'))), SemanticError);
});

Deno.test('sema: unknown operation', () => {
  assertThrows(() => sema(parse(lex('let a = foo(1); Render(a);'))), SemanticError);
});
