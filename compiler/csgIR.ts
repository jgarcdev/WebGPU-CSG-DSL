import { 
	ProgramNode, LetStatementNode, RenderStatementNode, ExpressionNode, IdentifierNode, 
	NumberLiteralNode, CallExpressionNode, BinaryExpressionNode
} from './ast.ts';

const CSGIR_VERSION = "0.0.1";


function matIdentity(): number[] {
	return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

function matMul(a: number[], b: number[]): number[] {
	const out = new Array(16).fill(0);
	for (let r = 0; r < 4; r++) {
		for (let c = 0; c < 4; c++) {
			let s = 0;
			for (let k = 0; k < 4; k++) s += a[r*4 + k] * b[k*4 + c];
			out[r*4 + c] = s;
		}
	}
	return out;
}

function degToRad(d: number) { return d * Math.PI / 180.0; }

function matTranslate(x: number, y: number, z: number): number[] {
	const m = matIdentity();
	m[3] = x;
	m[7] = y;
	m[11] = z;
	return m;
}

function matScale(sx: number, sy: number, sz: number): number[] {
	const m = matIdentity();
	m[0] = sx;
	m[5] = sy;
	m[10] = sz;
	return m;
}

function matRotateX(aDeg: number): number[] {
	const a = degToRad(aDeg);
	const c = Math.cos(a), s = Math.sin(a);
	return [1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1];
}

function matRotateY(aDeg: number): number[] {
	const a = degToRad(aDeg);
	const c = Math.cos(a), s = Math.sin(a);
	return [c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1];
}

function matRotateZ(aDeg: number): number[] {
	const a = degToRad(aDeg);
	const c = Math.cos(a), s = Math.sin(a);
	return [c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1];
}

function fmtNum(n: number): string {
	// trim floating noise, keep reasonable precision
	if (Math.abs(Math.round(n) - n) < 1e-9) return String(Math.round(n));
	return Number(n.toFixed(6)).toString();
}

function evaluateNumericExpression(expr: ExpressionNode): number {
	if (expr.type === 'NumberLiteral') return (expr as NumberLiteralNode).value;
	if (expr.type === 'BinaryExpression') {
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
	throw new Error('Expected numeric expression');
}

export function lowerIR(ast: ProgramNode): string {
	// tables
	const primitives: string[] = [];
	const transformations: string[] = []; // stored as parentRef + '[' + matrix ... + ']'
	const csg: string[] = [];
	const renders: string[] = [];
	const attributes = new Map<string, string[]>();

	const env = new Map<string,string>();

	function exprToRef(expr: ExpressionNode): string {
		if (expr.type === 'Identifier') {
			const name = (expr as IdentifierNode).name;
			const r = env.get(name);
			if (!r) throw new Error(`Lowering: unknown identifier ${name}`);
			return r;
		}
		if (expr.type === 'CallExpression') {
			const call = expr as CallExpressionNode;
			const callee = call.callee.name;
			const isCapitalized = /^[A-Z]/.test(callee);
			const isLower = /^[a-z]/.test(callee);

			if (isCapitalized) {
				// primitives: allow numeric expressions (NumberLiteral or BinaryExpression)
				const args = call.args.map(a => {
					if (a.type === 'NumberLiteral') return (a as NumberLiteralNode).raw;
					if (a.type === 'BinaryExpression') return fmtNum(evaluateNumericExpression(a));
					throw new Error('primitive args must be numeric expressions');
				});
				const entry = `${callee}[${args.join(', ')}]`;
				const idx = primitives.length;
				primitives.push(entry);
				return `p.${idx}`;
			}

			if (isLower) {
				if (callee === 'translate' || callee === 'scale' || callee === 'rotate') {
					// first arg is object
					const parent = call.args[0];
					const parentRef = exprToRef(parent as ExpressionNode);
					// get numeric args (allow expressions)
					const a1 = evaluateNumericExpression(call.args[1]);
					const a2 = evaluateNumericExpression(call.args[2]);
					const a3 = evaluateNumericExpression(call.args[3]);

					let M = matIdentity();
					if (callee === 'translate') M = matTranslate(a1, a2, a3);
					else if (callee === 'scale') M = matScale(a1, a2, a3);
					else if (callee === 'rotate') {
						const rx = matRotateX(a1);
						const ry = matRotateY(a2);
						const rz = matRotateZ(a3);
						// compose: R = ry * rx * rz
						M = matMul(matMul(ry, rx), rz);
					}

					const entries = M.map(fmtNum).join(', ');
					const entry = `${parentRef}[${entries}]`;
					const idx = transformations.length;
					transformations.push(entry);
					return `t.${idx}`;
				}

				if (callee === 'union' || callee === 'difference' || callee === 'intersection') {
					const a0 = exprToRef(call.args[0]);
					const a1 = exprToRef(call.args[1]);
					const type = (callee === 'intersection') ? 'Intersection' : (callee[0].toUpperCase() + callee.slice(1));
					const entry = `${type}[${a0}, ${a1}]`;
					const idx = csg.length;
					csg.push(entry);
					return `c.${idx}`;
				}
				if (callee === 'color') {
					// color(obj, r, g, b) -> attach attribute to obj ref
					const objRef = exprToRef(call.args[0]);
					const r = evaluateNumericExpression(call.args[1]);
					const g = evaluateNumericExpression(call.args[2]);
					const b = evaluateNumericExpression(call.args[3]);
					const attr = `Color[${fmtNum(r)}, ${fmtNum(g)}, ${fmtNum(b)}]`;
					const list = attributes.get(objRef) ?? [];
					list.push(attr);
					attributes.set(objRef, list);
					return objRef;
				}
			}

			throw new Error(`Lowering: unsupported call ${call.callee.name}`);
		}
		throw new Error('Lowering: unexpected expression node');
	}

	for (const stmt of ast.statements) {
		if (stmt.type === 'LetStatement') {
			const s = stmt as LetStatementNode;
			const ref = exprToRef(s.value);
			env.set(s.name.name, ref);
		} else if (stmt.type === 'RenderStatement') {
			const s = stmt as RenderStatementNode;
			const ref = exprToRef(s.argument);
			renders.push(ref);
		} else if (stmt.type === 'ConstBlock') {
			// already handled by earlier semantic pass; ignore in lowering
			continue;
		} else if ((stmt as any).type === 'ExpressionStatement') {
			// top-level expression: lower it for side-effects (primitives, transforms, attributes)
			const expr = (stmt as any).expression as ExpressionNode;
			try {
				exprToRef(expr);
			} catch (e) {
				// ignore lowering errors for top-level expressions
			}
			continue;
		} else {
			throw new Error('Lowering: unexpected statement node');
		}
	}

	// build IR string
	const lines: string[] = [];
	lines.push(`[${CSGIR_VERSION}]`);
	lines.push('[');
	// Renders
	lines.push('\tRenders[' + (renders.map(r => r).join(', ') ) + ']');
	// Primitives (with optional attributes)
	lines.push('\tPrimitives[');
	for (let i = 0; i < primitives.length; i++) {
		const p = primitives[i];
		const ref = `p.${i}`;
		const attrs = attributes.get(ref);
		if (attrs && attrs.length > 0) {
			lines.push('\t\t' + p + ' { ' + attrs.join(', ') + ' }');
		} else {
			lines.push('\t\t' + p);
		}
	}
	lines.push('\t]');
	// Transformations
	lines.push('\tTransformations[');
	for (const t of transformations) lines.push('\t\t' + t);
	lines.push('\t]');
	// CSG
	lines.push('\tCSG[');
	for (const c of csg) lines.push('\t\t' + c);
	lines.push('\t]');
	lines.push(']');

	return lines.join('\n');
}

export default lowerIR;