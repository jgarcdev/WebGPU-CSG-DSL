import { ProgramNode, StatementNode, LetStatementNode, RenderStatementNode, ExpressionNode, IdentifierNode, NumberLiteralNode, CallExpressionNode } from './ast.ts';

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

export function lowerIR(ast: ProgramNode): string {
	// tables
	const primitives: string[] = [];
	const transformations: string[] = []; // stored as parentRef + '[' + matrix ... + ']'
	const csg: string[] = [];
	const renders: string[] = [];

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
				// primitives
				const args = call.args.map(a => {
					if (a.type !== 'NumberLiteral') throw new Error('primitive args must be numeric');
					return (a as NumberLiteralNode).raw;
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
					// get numeric args
					const a1 = (call.args[1] as NumberLiteralNode).value;
					const a2 = (call.args[2] as NumberLiteralNode).value;
					const a3 = (call.args[3] as NumberLiteralNode).value;

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
			}

			throw new Error(`Lowering: unsupported call ${call.callee.name}`);
		}
		throw new Error('Lowering: unexpected expression node');
	}

	for (const stmt of ast.statements) {
		if (stmt.type === 'LetStatement') {
			const s = stmt as LetStatementNode;
			const ref = (s.value.type === 'Identifier') ? exprToRef(s.value) : exprToRef(s.value);
			env.set(s.name.name, ref);
		} else if (stmt.type === 'RenderStatement') {
			const s = stmt as RenderStatementNode;
			if (s.argument.type !== 'Identifier') throw new Error('Render expects identifier');
			const ref = exprToRef(s.argument);
			renders.push(ref);
		} else {
			// expression statements ignored for IR
		}
	}

	// build IR string
	const lines: string[] = [];
	lines.push(`[${CSGIR_VERSION}]`);
	lines.push('[');
	// Renders
	lines.push('\tRenders[' + (renders.map(r => r).join(', ') ) + ']');
	// Primitives
	lines.push('\tPrimitives[');
	for (const p of primitives) lines.push('\t\t' + p);
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