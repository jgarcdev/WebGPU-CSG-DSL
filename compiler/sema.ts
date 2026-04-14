import { ProgramNode, StatementNode, LetStatementNode, ExpressionNode, IdentifierNode, CallExpressionNode, NumberLiteralNode } from './ast.ts';
import { SemanticError } from './errors.ts';
import { Warnings } from './warnings.ts';


// Semantic analysis todo:
// - Check existence of at least one Render
// - Check usage of variables
//   - If an unused variable, make a warning
//   - If a variable is used but does not end up in a Render (directly or indirectly), make a warning
//   - If a variable is used but not defined, throw an error
//   - If a variable is used before it is defined, throw an error
// - Check argument typing/usage
//   - Sphere and Cube should have exactly 1 argument, and it should be a number
//   - Cylinder should have exactly 2 arguments, and they should be numbers
//   - union, intersect, and difference should have exactly 2 arguments
//   - Render should have exactly 1 argument, and it should be a variable that ends up in a Render (it can be itself, but it should not be something that does not end up in a Render)
//   - For detailed argument typing and checking, and transformations, see below
// - Check for unknown "primitives" or "operations" (e.g. if someone writes `foo(1)`, it should throw an error because `foo` is not a known operation)
// - Check that primitives start with capital letters and operations start with lowercase; for unknown, ignore and let the above check catch it
// 
// Argument typing
// Sphere, Cube: one argument, positive number
// Cylinder: two arguments, positive numbers
// translate/scale/rotate: three arguments, first is an object, second to fourth are numbers (positive or negative)
// union/intersect/difference: two arguments, both are objects
// Render: one argument, an object




export function sema(program: ProgramNode): { program: ProgramNode, warnings: Warnings } {
	const warnings = new Warnings();

	const defs = new Map<string, { node: LetStatementNode; line: number; column: number }>();
	const deps = new Map<string, Set<string>>();
	const usedCount = new Map<string, number>();
	const renders: { name: string; line: number; column: number }[] = [];

	function ensureDefined(name: string, line: number, column: number) {
		if (!defs.has(name)) {
			throw new SemanticError(`Variable '${name}' used but not defined`, line, column);
		}
	}

	function analyzeExpression(expr: ExpressionNode, ctxLine: number, ctxCol: number): Set<string> {
		const ids = new Set<string>();
		if (expr.type === 'Identifier') {
			const name = (expr as IdentifierNode).name;
			// identifier usage must refer to an existing definition
			ensureDefined(name, ctxLine, ctxCol);
			ids.add(name);
			usedCount.set(name, (usedCount.get(name) || 0) + 1);
			return ids;
		}

		if (expr.type === 'NumberLiteral') {
			return ids;
		}

		if (expr.type === 'CallExpression') {
			const call = expr as CallExpressionNode;
			const callee = call.callee.name;

			const isCapitalized = /^[A-Z]/.test(callee);
			const isLower = /^[a-z]/.test(callee);

			// primitives
			if (isCapitalized) {
				if (callee === 'Sphere') {
					if (call.args.length !== 1) throw new SemanticError("Sphere expects 1 numeric argument", ctxLine, ctxCol);
					const a = call.args[0];
					if (a.type !== 'NumberLiteral') throw new SemanticError('Sphere radius must be a number', ctxLine, ctxCol);
				} else if (callee === 'Cube') {
					if (call.args.length !== 1) throw new SemanticError('Cube expects 1 numeric argument', ctxLine, ctxCol);
					if (call.args[0].type !== 'NumberLiteral') throw new SemanticError('Cube size must be a number', ctxLine, ctxCol);
				} else if (callee === 'Cylinder') {
					if (call.args.length !== 2) throw new SemanticError('Cylinder expects 2 numeric arguments', ctxLine, ctxCol);
					if (call.args[0].type !== 'NumberLiteral' || call.args[1].type !== 'NumberLiteral') throw new SemanticError('Cylinder args must be numbers', ctxLine, ctxCol);
				} else {
					throw new SemanticError(`Unknown primitive '${callee}'`, ctxLine, ctxCol);
				}
			} else if (isLower) {
				// operations
				if (callee === 'translate' || callee === 'rotate' || callee === 'scale') {
					if (call.args.length !== 4) throw new SemanticError(`${callee} expects 4 arguments`, ctxLine, ctxCol);
					// first arg must be object (Identifier or CallExpression)
					const first = call.args[0];
					if (!(first.type === 'Identifier' || first.type === 'CallExpression')) throw new SemanticError(`${callee} first arg must be an object`, ctxLine, ctxCol);
					// remaining must be numbers
					for (let i = 1; i < 4; i++) if (call.args[i].type !== 'NumberLiteral') throw new SemanticError(`${callee} transform args must be numbers`, ctxLine, ctxCol);
				} else if (callee === 'union' || callee === 'difference' || callee === 'intersection') {
					if (call.args.length !== 2) throw new SemanticError(`${callee} expects 2 arguments`, ctxLine, ctxCol);
					for (const a of call.args) if (!(a.type === 'Identifier' || a.type === 'CallExpression')) throw new SemanticError(`${callee} args must be objects`, ctxLine, ctxCol);
				} else {
					throw new SemanticError(`Unknown operation '${callee}'`, ctxLine, ctxCol);
				}
			} else {
				throw new SemanticError(`Invalid callee '${callee}'`, ctxLine, ctxCol);
			}

			// analyze arguments and collect identifier deps
			for (const arg of call.args) {
				const sub = analyzeExpression(arg, ctxLine, ctxCol);
				for (const s of sub) ids.add(s);
			}

			return ids;
		}

		return ids;
	}

	// process statements in order to detect used-before-defined
	for (const stmt of program.statements) {
		if (stmt.type === 'LetStatement') {
			const letStmt = stmt as LetStatementNode;
			const name = letStmt.name.name;
			// mark definition (but don't allow usage in its own initializer)
			if (defs.has(name)) {
				// allow shadowing; no-op
			}
			defs.set(name, { node: letStmt, line: 0, column: 0 });
			usedCount.set(name, 0);

			// analyze value; ensure identifiers used are already defined
			const ids = analyzeExpression(letStmt.value, 0, 0);
			deps.set(name, ids);
		} else if (stmt.type === 'RenderStatement') {
			const arg = stmt.argument;
			if (arg.type !== 'Identifier') {
				throw new SemanticError('Render expects an identifier argument', 0, 0);
			}
			const name = (arg as IdentifierNode).name;
			if (!defs.has(name)) throw new SemanticError(`Render refers to undefined variable '${name}'`, 0, 0);
			renders.push({ name, line: 0, column: 0 });
			// count usage
			usedCount.set(name, (usedCount.get(name) || 0) + 1);
		}
	}

	if (renders.length === 0) {
		throw new SemanticError('No Render statement found', 0, 0);
	}

	// compute reachability from render arguments
	const reaches = new Set<string>();
	const stack: string[] = renders.map(r => r.name);
	while (stack.length > 0) {
		const v = stack.pop()!;
		if (reaches.has(v)) continue;
		reaches.add(v);
		const ds = deps.get(v);
		if (ds) for (const d of ds) stack.push(d);
	}

	// generate warnings
	for (const [name, def] of defs) {
		const count = usedCount.get(name) || 0;
		if (count === 0) {
			warnings.add(`Variable '${name}' is defined but never used`, def.line, def.column);
		} else if (!reaches.has(name)) {
			warnings.add(`Variable '${name}' is used but does not end up in a Render`, def.line, def.column);
		}
	}

	return { program, warnings };
}

export default sema;