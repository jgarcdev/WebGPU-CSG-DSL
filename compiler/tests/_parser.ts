import { assertEquals, assertThrows } from '@std/assert';
import { lex } from "../lexer.ts";
import { parse } from "../parser.ts";
import * as AST from "../ast.ts";
import { ParserError } from "../errors.ts";


Deno.test("Parse Let Primitives", () => {
	const sourceLine0 = "let sphere = Sphere(1);";
	const tokens0 = lex(sourceLine0);
	const ast0 = parse(tokens0);

	const expectedAST0: AST.ProgramNode = {
		type: 'Program',
		statements: [
			{
				type: 'LetStatement',
				name: { type: 'Identifier', name: 'sphere' },
				value: {
					type: 'CallExpression',
					callee: { type: 'Identifier', name: 'Sphere' },
					args: [
						{ type: 'NumberLiteral', raw: '1', value: 1 }
					]
				}
			}
		]
	};

	assertEquals(ast0, expectedAST0);


	const sourceLine1 = "let cylinder = Cylinder(1., 2.);";
	const tokens1 = lex(sourceLine1);
	const ast1 = parse(tokens1);

	const expectedAST1: AST.ProgramNode = {
		type: 'Program',
		statements: [
			{
				type: 'LetStatement',
				name: { type: 'Identifier', name: 'cylinder' },
				value: {
					type: 'CallExpression',
					callee: { type: 'Identifier', name: 'Cylinder' },
					args: [
						{ type: 'NumberLiteral', raw: '1.', value: 1 },
						{ type: 'NumberLiteral', raw: '2.', value: 2 }
					]
				}
			}
		]
	};

	assertEquals(ast1, expectedAST1);
});

Deno.test("Parse Let Operations", () => {
	const sourceLine0 = "let shape = union(sphere, cylinder);";
	const tokens0 = lex(sourceLine0);
	const ast0 = parse(tokens0);

	const expectedAST0: AST.ProgramNode = {
		type: 'Program',
		statements: [
			{
				type: 'LetStatement',
				name: { type: 'Identifier', name: 'shape' },
				value: {
					type: 'CallExpression',
					callee: { type: 'Identifier', name: 'union' },
					args: [
						{ type: 'Identifier', name: 'sphere' },
						{ type: 'Identifier', name: 'cylinder' }
					]
				}
			}
		]
	};

	assertEquals(ast0, expectedAST0);


	const sourceLine1 = "let rotated = rotate(shape, 0., 45., 0.);";
	const tokens1 = lex(sourceLine1);
	const ast1 = parse(tokens1);

	const expectedAST1: AST.ProgramNode = {
		type: 'Program',
		statements: [
			{
				type: 'LetStatement',
				name: { type: 'Identifier', name: 'rotated' },
				value: {
					type: 'CallExpression',
					callee: { type: 'Identifier', name: 'rotate' },
					args: [
						{ type: 'Identifier', name: 'shape' },
						{ type: 'NumberLiteral', raw: '0.', value: 0 },
						{ type: 'NumberLiteral', raw: '45.', value: 45 },
						{ type: 'NumberLiteral', raw: '0.', value: 0 }
					]
				}
			}
		]
	};

	assertEquals(ast1, expectedAST1);
});

Deno.test("Parse Render Statement", () => {
	const sourceLine = "Render(rotated);";
	const tokens = lex(sourceLine);
	const ast = parse(tokens);

	const expectedAST: AST.ProgramNode = {
		type: 'Program',
		statements: [
			{
				type: 'RenderStatement',
				argument: {
					type: 'Identifier',
					name: 'rotated'
				}
			}
		]
	};

	assertEquals(ast, expectedAST);
});

Deno.test("Nested Expressions", () => {
	const sourceLine0 = "Render(union(sphere, intersection(cylinder, cube)));";
	const tokens0 = lex(sourceLine0);
	const ast0 = parse(tokens0);

	const expectedAST0: AST.ProgramNode = {
		type: 'Program',
		statements: [
			{
				type: 'RenderStatement',
				argument: {
					type: 'CallExpression',
					callee: { type: 'Identifier', name: 'union' },
					args: [
						{ type: 'Identifier', name: 'sphere' },
						{
							type: 'CallExpression',
							callee: { type: 'Identifier', name: 'intersection' },
							args: [
								{ type: 'Identifier', name: 'cylinder' },
								{ type: 'Identifier', name: 'cube' }
							]
						}
					]
				}
			}
		]
	};

	assertEquals(ast0, expectedAST0);


	const sourceLine1 = "let complex = difference(Sphere(4.2), union(Cylinder(1., 2.), translate(Cube(1.), 0., 0., 5.)));";
	const tokens1 = lex(sourceLine1);
	const ast1 = parse(tokens1);

	const expectedAST1: AST.ProgramNode = {
		type: 'Program',
		statements: [
			{
				type: 'LetStatement',
				name: { type: 'Identifier', name: 'complex' },
				value: {
					type: 'CallExpression',
					callee: { type: 'Identifier', name: 'difference' },
					args: [
						{
							type: 'CallExpression',
							callee: { type: 'Identifier', name: 'Sphere' },
							args: [
								{ type: 'NumberLiteral', raw: '4.2', value: 4.2 }
							]
						},
						{
							type: 'CallExpression',
							callee: { type: 'Identifier', name: 'union' },
							args: [
								{
									type: 'CallExpression',
									callee: { type: 'Identifier', name: 'Cylinder' },
									args: [
										{ type: 'NumberLiteral', raw: '1.', value: 1 },
										{ type: 'NumberLiteral', raw: '2.', value: 2 }
									]
								},
								{
									type: 'CallExpression',
									callee: { type: 'Identifier', name: 'translate' },
									args: [
										{
											type: 'CallExpression',
											callee: { type: 'Identifier', name: 'Cube' },
											args: [
												{ type: 'NumberLiteral', raw: '1.', value: 1 }
											]
										},
										{ type: 'NumberLiteral', raw: '0.', value: 0 },
										{ type: 'NumberLiteral', raw: '0.', value: 0 },
										{ type: 'NumberLiteral', raw: '5.', value: 5 }
									]
								}
							]
						}
					]
				}
			}
		]
	};

	assertEquals(ast1, expectedAST1);


	const sourceLine2 = `
let nested = union(
	difference(
		Sphere(3.),
		union(
			Cylinder(1., 2.),
			translate(Cube(1.), 0., 0., 5.)
		)
	),
	intersection(
		Cube(4.),
		translate(Sphere(2.), 5., 0., 0.)
	)
);
`;
	const tokens2 = lex(sourceLine2);
	const ast2 = parse(tokens2);

	const expectedAST2: AST.ProgramNode = {
		type: 'Program',
		statements: [
			{
				type: 'LetStatement',
				name: { type: 'Identifier', name: 'nested' },
				value: {
					type: 'CallExpression',
					callee: { type: 'Identifier', name: 'union' },
					args: [
						{
							type: 'CallExpression',
							callee: { type: 'Identifier', name: 'difference' },
							args: [
								{
									type: 'CallExpression',
									callee: { type: 'Identifier', name: 'Sphere' },
									args: [
										{ type: 'NumberLiteral', raw: '3.', value: 3 }
									]
								},
								{
									type: 'CallExpression',
									callee: { type: 'Identifier', name: 'union' },
									args: [
										{
											type: 'CallExpression',
											callee: { type: 'Identifier', name: 'Cylinder' },
											args: [
												{ type: 'NumberLiteral', raw: '1.', value: 1 },
												{ type: 'NumberLiteral', raw: '2.', value: 2 }
											]
										},
										{
											type: 'CallExpression',
											callee: { type: 'Identifier', name: 'translate' },
											args: [
												{
													type: 'CallExpression',
													callee: { type: 'Identifier', name: 'Cube' },
													args: [
														{ type: 'NumberLiteral', raw: '1.', value: 1 }
													]
												},
												{ type: 'NumberLiteral', raw: '0.', value: 0 },
												{ type: 'NumberLiteral', raw: '0.', value: 0 },
												{ type: 'NumberLiteral', raw: '5.', value: 5 }
											]
										}
									]
								}
							]
						},
						{
							type: 'CallExpression',
							callee: { type: 'Identifier', name: 'intersection' },
							args: [
								{
									type: 'CallExpression',
									callee: { type: 'Identifier', name: 'Cube' },
									args: [
										{ type: 'NumberLiteral', raw: '4.', value: 4 }
									]
								},
								{
									type: 'CallExpression',
									callee: { type: 'Identifier', name: 'translate' },
									args: [
										{
											type: 'CallExpression',
											callee: { type: 'Identifier', name: 'Sphere' },
											args: [
												{ type: 'NumberLiteral', raw: '2.', value: 2 }
											]
										},
										{ type: 'NumberLiteral', raw: '5.', value: 5 },
										{ type: 'NumberLiteral', raw: '0.', value: 0 },
										{ type: 'NumberLiteral', raw: '0.', value: 0 }
									]
								}
							]
						}
					]
				}
			}
		]
	};

	assertEquals(ast2, expectedAST2);
});



Deno.test("Missing Characters", () => {
	const sourceLine0 = "let sphere = Sphere(1;"; // Missing end parenthesis
	const tokens0 = lex(sourceLine0);
	assertThrows(() => parse(tokens0), ParserError, "Expected ')' after call arguments");

	const sourceLine1 = "let t = translate cube, 0., 0., 3);"; // Missing start parenthesis
	const tokens1 = lex(sourceLine1);
	assertThrows(() => parse(tokens1), ParserError, "Expected '(' after function name");

	const sourceLine2 = "let s="; // Missing expression
	const tokens2 = lex(sourceLine2);
	assertThrows(() => parse(tokens2), ParserError, "Expected expression");

	const sourceLine3 = "circle = Circle(1.5);"; // Missing 'let' keyword
	const tokens3 = lex(sourceLine3);
	assertThrows(() => parse(tokens3), ParserError, "Expected expression");

	const sourceLine4 = "let u = union(sphere cylinder);"; // Missing comma between arguments
	const tokens4 = lex(sourceLine4);
	assertThrows(() => parse(tokens4), ParserError, "Missing ',' between call arguments");
});

Deno.test("Unexpected Tokens", () => {
	const sourceLine0 = "let sphere = Sphere(1.) extra;";
	const tokens0 = lex(sourceLine0);
	assertThrows(() => parse(tokens0), ParserError, "Expected end of input after expression");

	const sourceLine1 = "LET sphere = Sphere(1.);"; // 'LET' is not a valid keyword (should be lowercase)
	const tokens1 = lex(sourceLine1);
	assertThrows(() => parse(tokens1), ParserError, "Expected expression");

	const sourceLine2 = "let s = translate((cube, 0., 0., 3);"; // Extra parenthesis before 'cube'
	const tokens2 = lex(sourceLine2);
	assertThrows(() => parse(tokens2), ParserError, "Expected '(' after function name");

	const sourceLine3 = "let n = 2;"
	const tokens3 = lex(sourceLine3);
	assertThrows(() => parse(tokens3), ParserError, "Expected identifier or call expression, got number literal");
});