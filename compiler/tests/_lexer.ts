import { assert, assertEquals, assertThrows } from '@std/assert';
import { lex, Token } from '../lexer.ts';
import { LexerError } from '../errors.ts';


function assertTokensEqual(actual: Token[], expected: Token[]) {
  assertEquals(actual.length, expected.length, "Token arrays should have the same length");
  for (let i = 0; i < actual.length; i++) {
    const actualToken = actual[i];
    const expectedToken = expected[i];
    assertEquals(actualToken.type, expectedToken.type, `Token ${i} type should match`);
    assertEquals(actualToken.lexeme, expectedToken.lexeme, `Token ${i} lexeme should match`);
    assertEquals(actualToken.line, expectedToken.line, `Token ${i} line should match`);
    assertEquals(actualToken.column, expectedToken.column, `Token ${i} column should match`);
  }
}



Deno.test("Ignore single-line comments", () => {
  const sourceLine = "// This is a single-line comment\n";
  const tokens = lex(sourceLine);
  assertEquals(tokens.length, 1, "Single-line comment should be ignored");
});

Deno.test("Ignore multi-line comments", () => {
  const sourceLine = "/* This is a multi-line comment */";
  const tokens = lex(sourceLine);
  assertEquals(tokens.length, 0, "Multi-line comment should be ignored");

  const multilineSource = `/* This is a multi-line comment
     that spans multiple lines */`;
  const tokens2 = lex(multilineSource);
  assertEquals(tokens2.length, 0, "Multi-line comment spanning multiple lines should be ignored");
});

Deno.test("Simple variables and operations", () => {
  const sourceLine0 = "let circle = Circle(1);";
  const tokens0 = lex(sourceLine0);
  assert(tokens0.length > 0, "Should produce tokens for valid input");
  assert(tokens0.length == 8, "Should produce 8 tokens for the input");

  const expectedTokens0: Token[] = [
    { type: 'Keyword', lexeme: 'let', line: 1, column: 1 },
    { type: 'Identifier', lexeme: 'circle', line: 1, column: 5 },
    { type: 'Equals', lexeme: '=', line: 1, column: 12 },
    { type: 'Identifier', lexeme: 'Circle', line: 1, column: 14 },
    { type: 'LParen', lexeme: '(', line: 1, column: 20 },
    { type: 'Number', lexeme: '1', line: 1, column: 21 },
    { type: 'RParen', lexeme: ')', line: 1, column: 22 },
    { type: "Semicolon", lexeme: ";", line: 1, column: 23 }
  ];

  assertTokensEqual(tokens0, expectedTokens0);


  const sourceLine1 = "let square = Cylinder(2, 8);";
  const tokens1 = lex(sourceLine1);
  assert(tokens1.length > 0, "Should produce tokens for valid input");

  const expectedTokens1: Token[] = [
    { type: 'Keyword', lexeme: 'let', line: 1, column: 1 },
    { type: 'Identifier', lexeme: 'square', line: 1, column: 5 },
    { type: 'Equals', lexeme: '=', line: 1, column: 12 },
    { type: 'Identifier', lexeme: 'Cylinder', line: 1, column: 14 },
    { type: 'LParen', lexeme: '(', line: 1, column: 22 },
    { type: 'Number', lexeme: '2', line: 1, column: 23 },
    { type: 'Comma', lexeme: ',', line: 1, column: 24 },
    { type: 'Number', lexeme: '8', line: 1, column: 26 },
    { type: 'RParen', lexeme: ')', line: 1, column: 27 },
    { type: "Semicolon", lexeme: ";", line: 1, column: 28 }
  ];

  assertTokensEqual(tokens1, expectedTokens1);


  const sourceLine2 = "let result = union(circle, square);";
  const tokens2 = lex(sourceLine2);
  assert(tokens2.length > 0, "Should produce tokens for valid input");

  const expectedTokens2: Token[] = [
    { type: 'Keyword', lexeme: 'let', line: 1, column: 1 },
    { type: 'Identifier', lexeme: 'result', line: 1, column: 5 },
    { type: 'Equals', lexeme: '=', line: 1, column: 12 },
    { type: 'Identifier', lexeme: 'union', line: 1, column: 14 },
    { type: 'LParen', lexeme: '(', line: 1, column: 19 },
    { type: 'Identifier', lexeme: 'circle', line: 1, column: 20 },
    { type: 'Comma', lexeme: ',', line: 1, column: 26 },
    { type: 'Identifier', lexeme: 'square', line: 1, column: 28 },
    { type: 'RParen', lexeme: ')', line: 1, column: 34 },
    { type: "Semicolon", lexeme: ";", line: 1, column: 35 }
  ];

  assertTokensEqual(tokens2, expectedTokens2);


  const multiLineSource = `let circle = Circle(1.2);
let square = Cylinder(2.2, 8.2);
let result = intersection(circle, square);`;
  const tokens3 = lex(multiLineSource);
  assert(tokens3.length > 0, "Should produce tokens for valid multi-line input");

  const expectedTokens3: Token[] = [
    { type: 'Keyword', lexeme: 'let', line: 1, column: 1 },
    { type: 'Identifier', lexeme: 'circle', line: 1, column: 5 },
    { type: 'Equals', lexeme: '=', line: 1, column: 12 },
    { type: 'Identifier', lexeme: 'Circle', line: 1, column: 14 },
    { type: 'LParen', lexeme: '(', line: 1, column: 20 },
    { type: 'Number', lexeme: '1.2', line: 1, column: 21 },
    { type: 'RParen', lexeme: ')', line: 1, column: 24 },
    { type: "Semicolon", lexeme: ";", line: 1, column: 25 },
    { type: "EOL", lexeme: "\n", line: 1, column: 26 },
    { type: 'Keyword', lexeme: 'let', line: 2, column: 1 },
    { type: 'Identifier', lexeme: 'square', line: 2, column: 5 },
    { type: 'Equals', lexeme: '=', line: 2, column: 12 },
    { type: 'Identifier', lexeme: 'Cylinder', line: 2, column: 14 },
    { type: 'LParen', lexeme: '(', line: 2, column: 22 },
    { type: 'Number', lexeme: '2.2', line: 2, column: 23 },
    { type: 'Comma', lexeme: ',', line: 2, column: 26 },
    { type: 'Number', lexeme: '8.2', line: 2, column: 28 },
    { type: 'RParen', lexeme: ')', line: 2, column: 31 },
    { type: "Semicolon", lexeme: ";", line: 2, column: 32 },
    { type: "EOL", lexeme: "\n", line: 2, column: 33 },
    { type: 'Keyword', lexeme: 'let', line: 3, column: 1 },
    { type: 'Identifier', lexeme: 'result', line: 3, column: 5 },
    { type: 'Equals', lexeme: '=', line: 3, column: 12 },
    { type: 'Identifier', lexeme: 'intersection', line: 3, column: 14 },
    { type: 'LParen', lexeme: '(', line: 3, column: 26 },
    { type: 'Identifier', lexeme: 'circle', line: 3, column: 27 },
    { type: 'Comma', lexeme: ',', line: 3, column: 33 },
    { type: 'Identifier', lexeme: 'square', line: 3, column: 35 },
    { type: 'RParen', lexeme: ')', line: 3, column: 41 },
    { type: "Semicolon", lexeme: ";", line: 3, column: 42 }
  ];

  assertTokensEqual(tokens3, expectedTokens3);
});

Deno.test("Advanced number literals", () => {
  const sourceLine0 = "let sphere = Sphere(0.234444);";
  const tokens0 = lex(sourceLine0);
  assert(tokens0.length > 0, "Should produce tokens for valid input");
  assert(tokens0.length == 8, "Should produce 8 tokens for the input");

  const expectedTokens0: Token[] = [
    { type: 'Keyword', lexeme: 'let', line: 1, column: 1 },
    { type: 'Identifier', lexeme: 'sphere', line: 1, column: 5 },
    { type: 'Equals', lexeme: '=', line: 1, column: 12 },
    { type: 'Identifier', lexeme: 'Sphere', line: 1, column: 14 },
    { type: 'LParen', lexeme: '(', line: 1, column: 20 },
    { type: 'Number', lexeme: '0.234444', line: 1, column: 21 },
    { type: 'RParen', lexeme: ')', line: 1, column: 29 },
    { type: "Semicolon", lexeme: ";", line: 1, column: 30 }
  ];

  assertTokensEqual(tokens0, expectedTokens0);


  const sourceLine1 = "let translated = translate(sphere, -2.4, -4.2, 0.000);";

  const tokens1 = lex(sourceLine1);
  assert(tokens1.length > 0, "Should produce tokens for valid input");
  const expectedTokens1: Token[] = [
    { type: 'Keyword', lexeme: 'let', line: 1, column: 1 },
    { type: 'Identifier', lexeme: 'translated', line: 1, column: 5 },
    { type: 'Equals', lexeme: '=', line: 1, column: 16 },
    { type: 'Identifier', lexeme: 'translate', line: 1, column: 18 },
    { type: 'LParen', lexeme: '(', line: 1, column: 27 },
    { type: 'Identifier', lexeme: 'sphere', line: 1, column: 28 },
    { type: 'Comma', lexeme: ',', line: 1, column: 34 },
    { type: 'Number', lexeme: '-2.4', line: 1, column: 36 },
    { type: 'Comma', lexeme: ',', line: 1, column: 40 },
    { type: 'Number', lexeme: '-4.2', line: 1, column: 42 },
    { type: 'Comma', lexeme: ',', line: 1, column: 46 },
    { type: 'Number', lexeme: '0.000', line: 1, column: 48 },
    { type: 'RParen', lexeme: ')', line: 1, column: 53 },
    { type: "Semicolon", lexeme: ";", line: 1, column: 54 }
  ];

  assertTokensEqual(tokens1, expectedTokens1);
});

Deno.test("Signed number tokenization", () => {
  const src = "let a = Sphere(-.34);\nlet b = Sphere(+.3);\nlet c = Sphere(-0.);\nlet d = Sphere(+0);\nlet e = Sphere(-2);\nlet f = Sphere(+535.);";
  const tokens = lex(src);
  // find the Number tokens in order
  const numbers = tokens.filter(t => t.type === 'Number').map(t => t.lexeme);
  assertEquals(numbers.length, 6);
  assertEquals(numbers[0], '-.34');
  assertEquals(numbers[1], '+.3');
  assertEquals(numbers[2], '-0.');
  assertEquals(numbers[3], '+0');
  assertEquals(numbers[4], '-2');
  assertEquals(numbers[5], '+535.');
});

Deno.test.ignore("Complex 1", () => {

});

Deno.test.ignore("Complex 2", () => {

});


Deno.test("Invalid character error reporting", () => {
  const sourceLine = "let x = 10 @ 20;";
  const error = assertThrows(() => lex(sourceLine), LexerError);
  assertEquals(error.message, "Unexpected character '@' (line 1, column 12)");
});

Deno.test("Unterminated block comment error reporting", () => {
  const sourceLine = "/* This is an unterminated block comment";
  const error = assertThrows(() => lex(sourceLine), LexerError);
  assertEquals(error.message, "Unterminated block comment (line 1, column 1)");
});

Deno.test("Invalid number literal reporting", () => {
  const sourceLine = "let a = Sphere(+.).";
  const error = assertThrows(() => lex(sourceLine), LexerError);
  assertEquals(error.message, "Invalid number literal (line 1, column 16)");
});

Deno.test("Unexpected underscore character", () => {
  const src = "let _a = Sphere(1);";
  const error = assertThrows(() => lex(src), LexerError);
  assertEquals(error.message, "Unexpected character '_' (line 1, column 5)");
});

Deno.test("Invalid number: plus only", () => {
  const src = "let a = Sphere(+)";
  const error = assertThrows(() => lex(src), LexerError);
  assertEquals(error.message, "Invalid number literal (line 1, column 16)");
});

Deno.test("Invalid number: lone dot", () => {
  const src = "let a = Sphere(.);";
  const error = assertThrows(() => lex(src), LexerError);
  assertEquals(error.message, "Invalid number literal (line 1, column 16)");
});

Deno.test("Invalid number: minus dot", () => {
  const src = "let a = Sphere(-.);";
  const error = assertThrows(() => lex(src), LexerError);
  assertEquals(error.message, "Invalid number literal (line 1, column 16)");
});

Deno.test("Invalid Numbers", () => {
	const sourceLine0 = "let m = Sphere(1.2.3);"; // Invalid number literal with multiple dots
	assertThrows(() => lex(sourceLine0), LexerError, "Invalid number literal");

	const sourceLine1 = "let p = Cylinder(1e, 2.);"; // Invalid number literal (non-simple number not allowed)
	assertThrows(() => lex(sourceLine1), LexerError, "Invalid number literal");
});