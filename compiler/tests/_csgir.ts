import { assert, assertStringIncludes } from '@std/assert';
import { lex } from '../lexer.ts';
import { parse } from '../parser.ts';
import { sema } from '../sema.ts';
import { lowerIR } from '../csgIR.ts';


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
