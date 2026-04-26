import { 
	ProgramNode, LetStatementNode, RenderStatementNode, ExpressionNode, IdentifierNode, 
	NumberLiteralNode, CallExpressionNode, BinaryExpressionNode
} from './ast.ts';

const CSGIR_VERSION = "0.1.0";


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
		} else if (stmt.type === 'ExpressionStatement') {
			// top-level expression: lower it for side-effects (primitives, transforms, attributes)
			const expr = stmt.expression as ExpressionNode;
			try {
				exprToRef(expr);
			} catch (_) {
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
	for (let i = 0; i < transformations.length; i++) {
		const t = transformations[i];
		const ref = `t.${i}`;
		const attrsT = attributes.get(ref);
		if (attrsT && attrsT.length > 0) lines.push('\t\t' + t + ' { ' + attrsT.join(', ') + ' }');
		else lines.push('\t\t' + t);
	}
	lines.push('\t]');
	// CSG
	// CSG
	lines.push('\tCSG[');
	for (let i = 0; i < csg.length; i++) {
		const c = csg[i];
		const ref = `c.${i}`;
		const attrsC = attributes.get(ref);
		if (attrsC && attrsC.length > 0) lines.push('\t\t' + c + ' { ' + attrsC.join(', ') + ' }');
		else lines.push('\t\t' + c);
	}
	lines.push('\t]');
	lines.push(']');

	return lines.join('\n');
}



export function optimizeIR(ir: string): string {
	function fail(message: string): never {
		throw new Error(`IR optimize error: ${message}`);
	}

	type RefKind = 'p' | 't' | 'c';
	type Ref = { kind: RefKind; index: number; raw?: string };
	type PrimitiveEntry = { head: string; payload: string; attrs: string[] };
	type TransformEntry = { source: Ref; matrix: number[]; attrs: string[] };
	type CsgEntry = { op: string; left: Ref; right: Ref; attrs: string[] };

	function isWs(ch: string): boolean {
		return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
	}

	function skipWs(input: string, start: number): number {
		let i = start;
		while (i < input.length && isWs(input[i])) i++;
		return i;
	}

	function findMatchingBracket(input: string, openIndex: number): number {
		if (input[openIndex] !== '[') fail(`expected '[' at index ${openIndex}`);
		let depth = 0;
		for (let i = openIndex; i < input.length; i++) {
			if (input[i] === '[') depth++;
			else if (input[i] === ']') {
				depth--;
				if (depth === 0) return i;
			}
		}
		fail('unterminated bracketed block');
	}

	function findMatchingBrace(input: string, openIndex: number): number {
		if (input[openIndex] !== '{') fail(`expected '{' at index ${openIndex}`);
		let depth = 0;
		for (let i = openIndex; i < input.length; i++) {
			if (input[i] === '{') depth++;
			else if (input[i] === '}') {
				depth--;
				if (depth === 0) return i;
			}
		}
		fail('unterminated brace block');
	}

	function parseBlock(input: string, openIndex: number): { content: string; nextIndex: number } {
		const closeIndex = findMatchingBracket(input, openIndex);
		return {
			content: input.slice(openIndex + 1, closeIndex),
			nextIndex: closeIndex + 1,
		};
	}

	function parseRef(raw: string): Ref {
		const text = raw.trim();
		const m = /^([ptc])\.(\d+)$/.exec(text);
		if (!m) fail(`invalid reference '${text}'`);
		return { kind: m[1] as RefKind, index: Number(m[2]), raw: text };
	}

	function refToString(ref: Ref): string {
		return `${ref.kind}.${ref.index}`;
	}

	function parseNumberList(raw: string): number[] {
		const text = raw.trim();
		if (!text) return [];
		return text.split(',').map((x) => x.trim()).filter((x) => x.length > 0).map((x) => {
			const n = Number(x);
			if (!Number.isFinite(n)) fail(`invalid number '${x}'`);
			return n;
		});
	}

	function splitTopLevelItems(s: string): string[] {
		const out: string[] = [];
		let buf = '';
		let depth = 0;
		for (let i = 0; i < s.length; i++) {
			const ch = s[i];
			if (ch === '[' || ch === '{') {
				depth++;
				buf += ch;
				continue;
			}
			if (ch === ']' || ch === '}') {
				depth = Math.max(0, depth - 1);
				buf += ch;
				continue;
			}
			if (ch === ',' && depth === 0) {
				if (buf.trim().length > 0) out.push(buf.trim());
				buf = '';
				continue;
			}
			buf += ch;
		}
		if (buf.trim().length > 0) out.push(buf.trim());
		return out;
	}

	function parseEntryBlocks(sectionContent: string): Array<{ head: string; payload: string; attrs: string[] }> {
		const entries: Array<{ head: string; payload: string; attrs: string[] }> = [];
		let i = 0;

		while (i < sectionContent.length) {
			i = skipWs(sectionContent, i);
			if (i >= sectionContent.length) break;
			if (sectionContent[i] === ',') {
				i++;
				continue;
			}

			const open = sectionContent.indexOf('[', i);
			if (open === -1) fail(`missing '[' for section entry near '${sectionContent.slice(i).trim()}'`);

			const head = sectionContent.slice(i, open).trim();
			if (!head) fail('empty section entry head');

			const close = findMatchingBracket(sectionContent, open);
			const payload = sectionContent.slice(open + 1, close);
			let attrs: string[] = [];
			let j = close + 1;
			while (j < sectionContent.length && (isWs(sectionContent[j]) || sectionContent[j] === ',')) j++;
			if (j < sectionContent.length && sectionContent[j] === '{') {
				const braceClose = findMatchingBrace(sectionContent, j);
				attrs = splitTopLevelItems(sectionContent.slice(j + 1, braceClose).trim());
				j = braceClose + 1;
			}

			entries.push({ head, payload, attrs });

			i = j;
			while (i < sectionContent.length && (isWs(sectionContent[i]) || sectionContent[i] === ',')) i++;
		}

		return entries;
	}

	function parseRequiredSection(programBody: string, sectionName: string, cursor: number): { content: string; nextCursor: number } {
		const start = programBody.indexOf(sectionName, cursor);
		if (start === -1) fail(`missing required section '${sectionName}'`);

		const between = programBody.slice(cursor, start).trim();
		if (between.length > 0) {
			fail(`unexpected tokens before section '${sectionName}': '${between}'`);
		}

		let open = start + sectionName.length;
		open = skipWs(programBody, open);
		if (programBody[open] !== '[') fail(`section '${sectionName}' must be followed by '['`);

		const block = parseBlock(programBody, open);
		return { content: block.content, nextCursor: block.nextIndex };
	}

	function mergeAttrs(outerAttrs: string[], innerAttrs: string[]): string[] {
		if (outerAttrs.length === 0) return innerAttrs.slice();
		if (innerAttrs.length === 0) return outerAttrs.slice();
		return [...outerAttrs, ...innerAttrs];
	}

	function refKey(ref: Ref): string {
		return `${ref.kind}.${ref.index}`;
	}

	const input = ir.trim();
	if (!input) return ir;

	let i = skipWs(input, 0);
	if (input[i] !== '[') return ir;

	const firstBlock = parseBlock(input, i);
	const firstText = firstBlock.content.trim();

	let version: string | null = null;
	let programBody = '';
	let tailIndex = firstBlock.nextIndex;

	if (/^\d+\.\d+\.\d+$/.test(firstText)) {
		version = firstText;
		i = skipWs(input, firstBlock.nextIndex);
		if (input[i] !== '[') fail('expected program block after version block');
		const programBlock = parseBlock(input, i);
		programBody = programBlock.content;
		tailIndex = programBlock.nextIndex;
	} else {
		programBody = firstBlock.content;
	}

	if (input.slice(tailIndex).trim().length > 0) {
		fail('unexpected trailing tokens after program block');
	}

	let cursor = 0;
	const rendersSection = parseRequiredSection(programBody, 'Renders', cursor);
	cursor = rendersSection.nextCursor;
	const primitivesSection = parseRequiredSection(programBody, 'Primitives', cursor);
	cursor = primitivesSection.nextCursor;
	const transformationsSection = parseRequiredSection(programBody, 'Transformations', cursor);
	cursor = transformationsSection.nextCursor;
	const csgSection = parseRequiredSection(programBody, 'CSG', cursor);
	cursor = csgSection.nextCursor;
	if (programBody.slice(cursor).trim().length > 0) {
		fail(`unexpected tokens after CSG section: '${programBody.slice(cursor).trim()}'`);
	}

	const renders: Ref[] = splitTopLevelItems(rendersSection.content).map(parseRef);
	const primitiveEntries = parseEntryBlocks(primitivesSection.content);
	const primitives: PrimitiveEntry[] = primitiveEntries.map((e) => ({ head: e.head, payload: e.payload, attrs: e.attrs }));

	const transformEntries = parseEntryBlocks(transformationsSection.content);
	const oldTransforms: TransformEntry[] = transformEntries.map((e) => ({
		source: parseRef(e.head),
		matrix: parseNumberList(e.payload),
		attrs: e.attrs,
	}));

	for (const t of oldTransforms) {
		if (t.matrix.length !== 16) fail(`transformation '${refToString(t.source)}' must contain exactly 16 matrix values`);
	}

	const csgEntries = parseEntryBlocks(csgSection.content);
	const oldCsg: CsgEntry[] = csgEntries.map((e) => {
		const refs = splitTopLevelItems(e.payload).map(parseRef);
		if (refs.length !== 2) fail(`CSG op '${e.head}' must contain exactly 2 object references`);
		return { op: e.head, left: refs[0], right: refs[1], attrs: e.attrs };
	});

	const newTransforms: TransformEntry[] = [];
	const newCsg: CsgEntry[] = [];
	const transformIntern = new Map<string, number>();
	const csgIntern = new Map<string, number>();
	const refMemo = new Map<string, Ref>();

	function internTransform(entry: TransformEntry): Ref {
		const matrixKey = entry.matrix.map(fmtNum).join(',');
		const key = `${refKey(entry.source)}|${matrixKey}|${entry.attrs.join('||')}`;
		const existing = transformIntern.get(key);
		if (existing !== undefined) return { kind: 't', index: existing };
		const idx = newTransforms.length;
		newTransforms.push(entry);
		transformIntern.set(key, idx);
		return { kind: 't', index: idx };
	}

	function internCsg(entry: CsgEntry): Ref {
		const key = `${entry.op}|${refKey(entry.left)}|${refKey(entry.right)}|${entry.attrs.join('||')}`;
		const existing = csgIntern.get(key);
		if (existing !== undefined) return { kind: 'c', index: existing };
		const idx = newCsg.length;
		newCsg.push(entry);
		csgIntern.set(key, idx);
		return { kind: 'c', index: idx };
	}

	function optimizeRef(ref: Ref): Ref {
		const memoKey = refKey(ref);
		const memoized = refMemo.get(memoKey);
		if (memoized) return memoized;

		if (ref.kind === 'p') {
			const out = { kind: 'p', index: ref.index } as Ref;
			refMemo.set(memoKey, out);
			return out;
		}

		if (ref.kind === 't') {
			const tr = oldTransforms[ref.index];
			if (!tr) fail(`reference '${memoKey}' out of range for Transformations`);
			const sourceOpt = optimizeRef(tr.source);
			let collapsedSource = sourceOpt;
			let collapsedMatrix = tr.matrix.slice();
			let collapsedAttrs = tr.attrs.slice();

			if (sourceOpt.kind === 't') {
				const parent = newTransforms[sourceOpt.index];
				if (!parent) fail(`optimized transformation '${refKey(sourceOpt)}' missing`);
				collapsedSource = parent.source;
				collapsedMatrix = matMul(collapsedMatrix, parent.matrix);
				collapsedAttrs = mergeAttrs(collapsedAttrs, parent.attrs);
			}

			const out = internTransform({
				source: collapsedSource,
				matrix: collapsedMatrix,
				attrs: collapsedAttrs,
			});
			refMemo.set(memoKey, out);
			return out;
		}

		const node = oldCsg[ref.index];
		if (!node) fail(`reference '${memoKey}' out of range for CSG`);
		const left = optimizeRef(node.left);
		const right = optimizeRef(node.right);
		const out = internCsg({ op: node.op, left, right, attrs: node.attrs.slice() });
		refMemo.set(memoKey, out);
		return out;
	}

	const optimizedRenders = renders.map((r) => optimizeRef(r));

	const usedTransforms = new Set<number>();
	const usedCsg = new Set<number>();

	function markUsed(ref: Ref): void {
		if (ref.kind === 't') {
			if (usedTransforms.has(ref.index)) return;
			usedTransforms.add(ref.index);
			const t = newTransforms[ref.index];
			if (!t) fail(`optimized reference '${refToString(ref)}' out of range`);
			markUsed(t.source);
			return;
		}
		if (ref.kind === 'c') {
			if (usedCsg.has(ref.index)) return;
			usedCsg.add(ref.index);
			const c = newCsg[ref.index];
			if (!c) fail(`optimized reference '${refToString(ref)}' out of range`);
			markUsed(c.left);
			markUsed(c.right);
		}
	}

	for (const r of optimizedRenders) markUsed(r);

	const tIndexMap = new Map<number, number>();
	const cIndexMap = new Map<number, number>();
	const compactTransforms: TransformEntry[] = [];
	const compactCsg: CsgEntry[] = [];

	for (let idx = 0; idx < newTransforms.length; idx++) {
		if (!usedTransforms.has(idx)) continue;
		tIndexMap.set(idx, compactTransforms.length);
		compactTransforms.push(newTransforms[idx]);
	}
	for (let idx = 0; idx < newCsg.length; idx++) {
		if (!usedCsg.has(idx)) continue;
		cIndexMap.set(idx, compactCsg.length);
		compactCsg.push(newCsg[idx]);
	}

	function remapRef(ref: Ref): Ref {
		if (ref.kind === 'p') return ref;
		if (ref.kind === 't') {
			const mapped = tIndexMap.get(ref.index);
			if (mapped === undefined) fail(`missing remap for '${refToString(ref)}'`);
			return { kind: 't', index: mapped };
		}
		const mapped = cIndexMap.get(ref.index);
		if (mapped === undefined) fail(`missing remap for '${refToString(ref)}'`);
		return { kind: 'c', index: mapped };
	}

	const finalRenders = optimizedRenders.map(remapRef);
	const finalTransforms = compactTransforms.map((t) => ({ ...t, source: remapRef(t.source) }));
	const finalCsg = compactCsg.map((c) => ({
		op: c.op,
		left: remapRef(c.left),
		right: remapRef(c.right),
		attrs: c.attrs.slice(),
	}));

	const lines: string[] = [];
	if (version) lines.push(`[${version}]`);
	lines.push('[');
	lines.push('\tRenders[' + finalRenders.map(refToString).join(', ') + ']');

	lines.push('\tPrimitives[');
	for (const p of primitives) {
		const attrs = p.attrs.length > 0 ? ` { ${p.attrs.join(', ')} }` : '';
		lines.push(`\t\t${p.head}[${p.payload}]${attrs}`);
	}
	lines.push('\t]');

	lines.push('\tTransformations[');
	for (const t of finalTransforms) {
		const matrix = t.matrix.map(fmtNum).join(', ');
		const attrs = t.attrs.length > 0 ? ` { ${t.attrs.join(', ')} }` : '';
		lines.push(`\t\t${refToString(t.source)}[${matrix}]${attrs}`);
	}
	lines.push('\t]');

	lines.push('\tCSG[');
	for (const c of finalCsg) {
		const attrs = c.attrs.length > 0 ? ` { ${c.attrs.join(', ')} }` : '';
		lines.push(`\t\t${c.op}[${refToString(c.left)}, ${refToString(c.right)}]${attrs}`);
	}
	lines.push('\t]');
	lines.push(']');

	return lines.join('\n');
}