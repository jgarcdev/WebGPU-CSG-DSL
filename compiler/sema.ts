import { 
	ProgramNode, LetStatementNode, ExpressionNode, IdentifierNode,
	CallExpressionNode, NumberLiteralNode, BinaryExpressionNode
} from "./ast.ts";
import { SemanticError } from "./errors.ts";
import { Warnings } from "./warnings.ts";


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

	// consts map: name -> numeric value
	const consts = new Map<string, number>();

	const defs = new Map<string, { node: LetStatementNode; line: number; column: number }>();
	const deps = new Map<string, Set<string>>();
	const usedCount = new Map<string, number>();
	const renders: { name: string; line: number; column: number }[] = [];
	let hasRender = false;
	const extraRenderIds = new Set<string>();

	function ensureDefined(name: string, line: number, column: number) {
		if (!defs.has(name)) {
			throw new SemanticError(`Variable "${name}" used but not defined`, line, column);
		}
	}

	function analyzeExpression(expr: ExpressionNode, ctxLine: number, ctxCol: number): Set<string> {
		const ids = new Set<string>();

		const collectIds = (e: ExpressionNode) => {
			if (e.type === "Identifier") {
				const name = (e as IdentifierNode).name;
				ensureDefined(name, ctxLine, ctxCol);
				ids.add(name);
				usedCount.set(name, (usedCount.get(name) || 0) + 1);
				return;
			}
			if (e.type === "CallExpression") {
				const call = e as CallExpressionNode;
				for (const a of call.args) collectIds(a);
				return;
			}
			if (e.type === "BinaryExpression") {
				const b = e as BinaryExpressionNode;
				collectIds(b.left);
				collectIds(b.right);
				return;
			}
			// NumberLiteral -> nothing
		};
		if (expr.type === "Identifier") {
			collectIds(expr);
			return ids;
		}

		if (expr.type === "NumberLiteral") {
			return ids;
		}

		if (expr.type === "BinaryExpression") {
			const be = expr as BinaryExpressionNode;
			// collect any identifiers inside (allowed, but then numeric checks elsewhere will fail)
			collectIds(be.left);
			collectIds(be.right);
			return ids;
		}

		if (expr.type === "CallExpression") {
			const call = expr as CallExpressionNode;
			const callee = call.callee.name;

			const isCapitalized = /^[A-Z]/.test(callee);
			const isLower = /^[a-z]/.test(callee);

			// primitives (capitalized)
			if (isCapitalized) {
				if (callee === "Sphere") {
					if (call.args.length !== 1) throw new SemanticError("Sphere expects 1 numeric argument", ctxLine, ctxCol);
					if (!isPureNumeric(call.args[0])) throw new SemanticError("Sphere radius must be a numeric expression", ctxLine, ctxCol);
				} else if (callee === "Cube") {
					if (call.args.length !== 1) throw new SemanticError("Cube expects 1 numeric argument", ctxLine, ctxCol);
					if (!isPureNumeric(call.args[0])) throw new SemanticError("Cube size must be a numeric expression", ctxLine, ctxCol);
				} else if (callee === "Cylinder") {
					if (call.args.length !== 2) throw new SemanticError("Cylinder expects 2 numeric arguments", ctxLine, ctxCol);
					if (!isPureNumeric(call.args[0]) || !isPureNumeric(call.args[1])) throw new SemanticError("Cylinder args must be numeric expressions", ctxLine, ctxCol);
				} else if (callee === "Pyramid") {
					if (call.args.length !== 2) throw new SemanticError("Pyramid expects 2 numeric arguments (baseSize, height)", ctxLine, ctxCol);
					if (!isPureNumeric(call.args[0]) || !isPureNumeric(call.args[1])) throw new SemanticError("Pyramid args must be numeric expressions", ctxLine, ctxCol);
				} else if (callee === "Cone") {
					if (call.args.length !== 2) throw new SemanticError("Cone expects 2 numeric arguments (radius, height)", ctxLine, ctxCol);
					if (!isPureNumeric(call.args[0]) || !isPureNumeric(call.args[1])) throw new SemanticError("Cone args must be numeric expressions", ctxLine, ctxCol);
				} else if (callee === "Torus") {
					if (call.args.length !== 2) throw new SemanticError("Torus expects 2 numeric arguments (majorRadius, minorRadius)", ctxLine, ctxCol);
					if (!isPureNumeric(call.args[0]) || !isPureNumeric(call.args[1])) throw new SemanticError("Torus args must be numeric expressions", ctxLine, ctxCol);
				} else if (callee === "Octahedron") {
					if (call.args.length !== 1) throw new SemanticError("Octahedron expects 1 numeric argument (size)", ctxLine, ctxCol);
					if (!isPureNumeric(call.args[0])) throw new SemanticError("Octahedron size must be a numeric expression", ctxLine, ctxCol);
				} else {
					throw new SemanticError(`Unknown primitive "${callee}"`, ctxLine, ctxCol);
				}
			} else if (isLower) {
				// operations
				if (callee === "translate" || callee === "rotate" || callee === "scale") {
					if (call.args.length !== 4) throw new SemanticError(`${callee} expects 4 arguments`, ctxLine, ctxCol);
					// first arg must be object (Identifier or CallExpression)
					const first = call.args[0];
					if (!(first.type === "Identifier" || first.type === "CallExpression")) throw new SemanticError(`${callee} first arg must be an object`, ctxLine, ctxCol);
					// remaining must be numeric expressions
					for (let i = 1; i < 4; i++) if (!isPureNumeric(call.args[i])) throw new SemanticError(`${callee} transform args must be numeric expressions`, ctxLine, ctxCol);
				} else if (callee === "union" || callee === "difference" || callee === "intersection") {
					if (call.args.length !== 2) throw new SemanticError(`${callee} expects 2 arguments`, ctxLine, ctxCol);
					for (const a of call.args) if (!(a.type === "Identifier" || a.type === "CallExpression")) throw new SemanticError(`${callee} args must be objects`, ctxLine, ctxCol);
				} else if (callee === "color") {
					// color(obj, r, g, b) where r,g,b are 0-255 numeric expressions
					if (call.args.length !== 4) throw new SemanticError("color expects 4 arguments", ctxLine, ctxCol);
					const first = call.args[0];
					if (!(first.type === "Identifier" || first.type === "CallExpression")) throw new SemanticError("color first arg must be an object", ctxLine, ctxCol);
					for (let i = 1; i <= 3; i++) {
						if (!isPureNumeric(call.args[i])) throw new SemanticError("color rgb args must be numeric expressions", ctxLine, ctxCol);
						const val = evaluateNumericExpression(call.args[i]);
						if (val < 0 || val > 255) throw new SemanticError("color rgb values must be between 0 and 255", ctxLine, ctxCol);
					}
				} else {
					throw new SemanticError(`Unknown operation "${callee}"`, ctxLine, ctxCol);
				}
			} else {
				throw new SemanticError(`Invalid callee "${callee}"`, ctxLine, ctxCol);
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

	function evaluateNumericWithConsts(expr: ExpressionNode): number {
		if (expr.type === "NumberLiteral") return (expr as NumberLiteralNode).value;
		if (expr.type === "BinaryExpression") {
			const b = expr as BinaryExpressionNode;
			const l = evaluateNumericWithConsts(b.left);
			const r = evaluateNumericWithConsts(b.right);
			switch (b.operator) {
				case '+': return l + r;
				case '-': return l - r;
				case '*': return l * r;
				case '/': return l / r;
			}
		}
		if (expr.type === "Identifier") {
			const name = (expr as IdentifierNode).name;
			if (!consts.has(name)) throw new SemanticError(`Unknown constant "${name}"`, 0, 0);
			return consts.get(name)!;
		}
		throw new SemanticError("Expected numeric expression", 0, 0);
	}

	function substituteConstsInExpr(expr: ExpressionNode): ExpressionNode {
		if (expr.type === "Identifier") {
			const name = (expr as IdentifierNode).name;
			if (consts.has(name)) {
				const v = consts.get(name)!;
				return { type: "NumberLiteral", raw: String(v), value: v } as NumberLiteralNode;
			}
			return expr;
		}
		if (expr.type === "NumberLiteral") return expr;
		if (expr.type === "BinaryExpression") {
			const b = expr as BinaryExpressionNode;
			const L = substituteConstsInExpr(b.left);
			const R = substituteConstsInExpr(b.right);
			if (L.type === "NumberLiteral" && R.type === "NumberLiteral") {
				const lv = (L as NumberLiteralNode).value;
				const rv = (R as NumberLiteralNode).value;
				switch (b.operator) {
					case '+': return { type: "NumberLiteral", raw: String(lv + rv), value: lv + rv } as NumberLiteralNode;
					case '-': return { type: "NumberLiteral", raw: String(lv - rv), value: lv - rv } as NumberLiteralNode;
					case '*': return { type: "NumberLiteral", raw: String(lv * rv), value: lv * rv } as NumberLiteralNode;
					case '/': return { type: "NumberLiteral", raw: String(lv / rv), value: lv / rv } as NumberLiteralNode;
				}
			}
			return { type: "BinaryExpression", operator: b.operator, left: L, right: R } as BinaryExpressionNode;
		}
		if (expr.type === "CallExpression") {
			const c = expr as CallExpressionNode;
			return { type: "CallExpression", callee: c.callee, args: c.args.map(substituteConstsInExpr) } as CallExpressionNode;
		}
		return expr;
	}

	function isPureNumeric(expr: ExpressionNode): boolean {
		if (expr.type === "NumberLiteral") return true;
		if (expr.type === "BinaryExpression") {
			const b = expr as BinaryExpressionNode;
			return isPureNumeric(b.left) && isPureNumeric(b.right);
		}
		return false;
	}

	function evaluateNumericExpression(expr: ExpressionNode): number {
		if (expr.type === "NumberLiteral") return (expr as NumberLiteralNode).value;
		if (expr.type === "BinaryExpression") {
			const b = expr as BinaryExpressionNode;
			const l = evaluateNumericExpression(b.left);
			const r = evaluateNumericExpression(b.right);
			switch (b.operator) {
				case '+': return l + r;
				case '-': return l - r;
				case '*': return l * r;
				case '/': return l / r;
			}
		}
		throw new SemanticError("Expected numeric expression", 0, 0);
	}

	// process const block first (must be first if present)
	if (program.statements.length > 0 && program.statements[0].type === "ConstBlock") {
		const cb = program.statements[0] as any;
		// process declarations in order
		const reserved = new Set([ "let", "Render", "const", "Sphere", "Cube", "Cylinder", "Pyramid", "Cone", "Torus", "Octahedron", "translate", "rotate", "scale", "union", "difference", "intersection", "color" ]);
		for (const d of cb.decls) {
			const name = d.name;
			if (reserved.has(name)) throw new SemanticError(`Constant name "${name}" is reserved`, 0, 0);
			if (consts.has(name)) throw new SemanticError(`Constant "${name}" redefined`, 0, 0);
			// evaluate value allowing references to earlier consts
			const val = evaluateNumericWithConsts(d.value);
			consts.set(name, val);
		}
	}

	// process statements in order to detect used-before-defined (skip const block)
	for (const stmt of program.statements) {
		if (stmt.type === "ConstBlock") continue;
		if (stmt.type === "LetStatement") {
			const letStmt = stmt as LetStatementNode;
			const name = letStmt.name.name;
			// mark definition (but don't allow usage in its own initializer)
			if (defs.has(name)) {
				// allow shadowing; no-op
			}
			defs.set(name, { node: letStmt, line: 0, column: 0 });
			usedCount.set(name, 0);

			// substitute constants inside the value expression before analyzing
			letStmt.value = substituteConstsInExpr(letStmt.value);
			// analyze value; ensure identifiers used are already defined
			const ids = analyzeExpression(letStmt.value, 0, 0);
			deps.set(name, ids);
		} else if (stmt.type === "RenderStatement") {
			const arg = stmt.argument;
			// also substitute consts in render argument
			stmt.argument = substituteConstsInExpr(arg);
			const arg2 = stmt.argument;
			if (arg2.type === "Identifier") {
				const name = (arg2 as IdentifierNode).name;
				if (!defs.has(name)) throw new SemanticError(`Render refers to undefined variable "${name}"`, 0, 0);
				renders.push({ name, line: 0, column: 0 });
				// count usage
				usedCount.set(name, (usedCount.get(name) || 0) + 1);
				hasRender = true;
			} else if (arg2.type === "CallExpression") {
				// Inline call in Render, analyze its identifiers
				const ids = analyzeExpression(arg2, 0, 0);
				for (const id of ids) {
					usedCount.set(id, (usedCount.get(id) || 0) + 1);
					extraRenderIds.add(id);
				}
				hasRender = true;
				// cannot push a single name here; reachability will consider deps from any referenced names
			} else {
				throw new SemanticError("Render expects an identifier or call expression", 0, 0);
			}
		}
	}

	if (!hasRender) {
		throw new SemanticError("No Render statement found", 0, 0);
	}

	// compute reachability from render arguments
	const reaches = new Set<string>();
	const stack: string[] = [...renders.map(r => r.name), ...Array.from(extraRenderIds)];
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
			warnings.add(`Variable "${name}" is defined but never used`, def.line, def.column);
		} else if (!reaches.has(name)) {
			warnings.add(`Variable "${name}" is used but does not end up in a Render`, def.line, def.column);
		}
	}

	return { program, warnings };
}

export default sema;