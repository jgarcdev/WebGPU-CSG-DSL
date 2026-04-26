import { assert, assertStringIncludes } from '@std/assert';
import { lex } from '../lexer.ts';
import { parse } from '../parser.ts';
import { sema } from '../sema.ts';
import { lowerIR, optimizeIR } from '../csgIR.ts';
import { parseIR } from '../../backend/csgir.ts';


Deno.test('Lower simple primitive and render', () => {
  const src = `let sphere = Sphere(1.2);
Render(sphere);`;
  const tokens = lex(src);
  const ast = parse(tokens);
  const { program } = sema(ast);
  const ir = lowerIR(program);
  // basic expectations
  assertStringIncludes(ir, 'Primitives[');
  assertStringIncludes(ir, 'Sphere[1.2]');
  assertStringIncludes(ir, 'Renders[p.0]');
});

Deno.test('Lower translate and render', () => {
  const src = `let s = Sphere(1.0);
let t = translate(s, 1.0, 0.0, 0.0);
Render(t);`;
  const tokens = lex(src);
  const ast = parse(tokens);
  const { program } = sema(ast);
  const ir = lowerIR(program);
  assertStringIncludes(ir, 'Transformations[');
  // transformation entry references parent primitive p.0
  assertStringIncludes(ir, 'p.0[');
  // render should reference the transformation index t.0
  assertStringIncludes(ir, 'Renders[t.0]');
});

Deno.test('optimizeIR collapses transform chains per root object', () => {
  const src = `let s = Sphere(1.0);
let c = Cube(1.0);

let s1 = translate(s, 1.0, 0.0, 0.0);
let s2 = rotate(s1, 0.0, 45.0, 0.0);
let s3 = scale(s2, 1.5, 1.5, 1.5);
let s4 = translate(s3, 0.0, 2.0, 0.0);
let s5 = rotate(s4, 10.0, 0.0, 0.0);

let c1 = translate(c, 1.0, 0.0, 0.0);
let c2 = rotate(c1, 0.0, 45.0, 0.0);
let c3 = scale(c2, 2.0, 1.0, 1.0);

Render(s5);
Render(c3);`;

  const tokens = lex(src);
  const ast = parse(tokens);
  const { program } = sema(ast);
  const ir = lowerIR(program);
  const optimized = optimizeIR(ir);
  const parsed = parseIR(optimized);

  assert(parsed.transformations.length === 2);
  assert(parsed.renders.length === 2);
  assert(parsed.renders[0].kind === 't');
  assert(parsed.renders[1].kind === 't');
});

Deno.test('optimizeIR deduplicates identical collapsed transforms', () => {
  const src = `let s = Sphere(1.0);
let a = rotate(translate(s, 1.0, 2.0, 3.0), 0.0, 90.0, 0.0);
let b = rotate(translate(s, 1.0, 2.0, 3.0), 0.0, 90.0, 0.0);
Render(a);
Render(b);`;

  const tokens = lex(src);
  const ast = parse(tokens);
  const { program } = sema(ast);
  const ir = lowerIR(program);
  const optimized = optimizeIR(ir);
  const parsed = parseIR(optimized);

  assert(parsed.transformations.length === 1);
  assert(parsed.renders.length === 2);
  assert(parsed.renders[0].kind === 't');
  assert(parsed.renders[1].kind === 't');
  assert(parsed.renders[0].index === parsed.renders[1].index);
});
