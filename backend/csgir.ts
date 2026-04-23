import { Mat4, identityMat4, mulMat4, invertAffine } from "./utils.ts";

export interface FlatLeaf {
  kind: number; // 0=Sphere, 1=Cube, 2=Cylinder, 3=Pyramid, 4=Cone, 5=Torus, 6=Octahedron
  params: [number, number, number, number]; // up to 4 primitive parameters (unused params set to 0)
  inv: Mat4; // world-space inverse matrix for this primitive leaf, used to transform rays into the primitive's local space for evaluation
	color: [number, number, number, number]; // rgba or rgb+pad in normalized 0..1
}

export interface FlatToken {
  kind: number;
  data: number;
}

export type ObjectRefKind = "p" | "t" | "c";

export interface ObjectRef {
	kind: ObjectRefKind;
	index: number;
	raw: string;
}

export type PrimitiveKind = "Sphere" | "Cube" | "Cylinder" | "Pyramid" | "Cone" | "Torus" | "Octahedron";
export type CSGOpKind = "Union" | "Difference" | "Intersection";

export interface PrimitiveIR {
	kind: PrimitiveKind;
	params: number[];
	attrs?: string[];
	color?: number[]; // normalized 0..1 RGB
}

export interface TransformationIR {
	source: ObjectRef;
	matrix: number[];
	attrs?: string[];
	color?: number[];
}

export interface CSGIR {
	op: CSGOpKind;
	left: ObjectRef;
	right: ObjectRef;
	attrs?: string[];
	color?: number[];
}

export interface ParsedIR {
	version: string | null;
	renders: ObjectRef[];
	primitives: PrimitiveIR[];
	transformations: TransformationIR[];
	csg: CSGIR[];
}

const VALID_PRIMITIVES: ReadonlySet<string> = new Set([
	"Sphere", "Cube", "Cylinder", "Pyramid", "Cone", "Torus", "Octahedron"
]);
const VALID_CSG_OPS: ReadonlySet<string> = new Set([
	"Union", "Difference", "Intersection"
]);

const TOKEN_LEAF = 0;
const TOKEN_UNION = 1;
const TOKEN_DIFFERENCE = 2;
const TOKEN_INTERSECTION = 3;

const PRIM_SPHERE = 0;
const PRIM_CUBE = 1;
const PRIM_CYLINDER = 2;
const PRIM_PYRAMID = 3;
const PRIM_CONE = 4;
const PRIM_TORUS = 5;
const PRIM_OCTAHEDRON = 6;
// const MAX_SHADER_STACK_DEPTH = 256;
// const MAX_TOKEN_COUNT = 2048;
// const MAX_LEAF_COUNT = 1024;


function fail(message: string): never {
	throw new Error(`IR parse error: ${message}`);
}

function isWhitespace(ch: string): boolean {
	return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function skipWhitespace(input: string, start: number): number {
	let i = start;
	while (i < input.length && isWhitespace(input[i])) i++;
	return i;
}

function findMatchingBracket(input: string, openIndex: number): number {
	if (input[openIndex] !== "[") fail(`expected '[' at index ${openIndex}`);
	let depth = 0;
	for (let i = openIndex; i < input.length; i++) {
		if (input[i] === "[") depth++;
		else if (input[i] === "]") {
			depth--;
			if (depth === 0) return i;
		}
	}
	fail("unterminated bracketed block");
}

function findMatchingBrace(input: string, openIndex: number): number {
	if (input[openIndex] !== "{") fail(`expected '{' at index ${openIndex}`);
	let depth = 0;
	for (let i = openIndex; i < input.length; i++) {
		if (input[i] === "{") depth++;
		else if (input[i] === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}
	fail("unterminated brace block");
}

function parseBlock(input: string, openIndex: number): { content: string; nextIndex: number } {
	const closeIndex = findMatchingBracket(input, openIndex);
	return {
		content: input.slice(openIndex + 1, closeIndex),
		nextIndex: closeIndex + 1,
	};
}

function parseNumberList(raw: string): number[] {
	const text = raw.trim();
	if (text.length === 0) return [];
	return text.split(",").map((part) => part.trim()).map((part) => {
		if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(part)) {
			fail(`invalid numeric literal '${part}'`);
		}
		const n = Number(part);
		if (!Number.isFinite(n)) fail(`non-finite numeric literal '${part}'`);
		return n;
	});
}

function parseRef(raw: string): ObjectRef {
	const text = raw.trim();
	const match = /^([ptc])\.(\d+)$/.exec(text);
	if (!match) fail(`invalid object reference '${text}'`);
	return {
		kind: match[1] as ObjectRefKind,
		index: Number(match[2]),
		raw: text,
	};
}

function parseEntryBlocks(sectionContent: string): Array<{ head: string; payload: string; attrs?: string }> {
	const entries: Array<{ head: string; payload: string; attrs?: string }> = [];
	let i = 0;

	while (i < sectionContent.length) {
		i = skipWhitespace(sectionContent, i);
		if (i >= sectionContent.length) break;
		if (sectionContent[i] === ",") {
			i++;
			continue;
		}

		const open = sectionContent.indexOf("[", i);
		if (open === -1) fail(`missing '[' for section entry near '${sectionContent.slice(i).trim()}'`);

		const head = sectionContent.slice(i, open).trim();
		if (!head) fail("empty section entry head");

		const close = findMatchingBracket(sectionContent, open);
		const payload = sectionContent.slice(open + 1, close);
		let attrs: string | undefined = undefined;
		let j = close + 1;
		while (j < sectionContent.length && (isWhitespace(sectionContent[j]) || sectionContent[j] === ',')) j++;
		if (j < sectionContent.length && sectionContent[j] === '{') {
			const braceClose = findMatchingBrace(sectionContent, j);
			attrs = sectionContent.slice(j + 1, braceClose).trim();
			j = braceClose + 1;
		}
		entries.push({ head, payload, attrs });

		i = j;
		while (i < sectionContent.length && (isWhitespace(sectionContent[i]) || sectionContent[i] === ",")) i++;
	}

	return entries;
}

function parseRenders(sectionContent: string): ObjectRef[] {
	const trimmed = sectionContent.trim();
	if (!trimmed) return [];
	return trimmed.split(",").map((part) => part.trim()).filter((part) => part.length > 0).map(parseRef);
}

function splitTopLevelItems(s: string): string[] {
	const out: string[] = [];
	let buf = '';
	let depth = 0;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '[') {
			depth++;
			buf += ch;
			continue;
		}
		if (ch === ']') {
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

function validateReference(ref: ObjectRef, ir: Pick<ParsedIR, "primitives" | "transformations" | "csg">): void {
	if (ref.kind === "p" && ref.index >= ir.primitives.length) {
		fail(`reference '${ref.raw}' out of range for Primitives`);
	}
	if (ref.kind === "t" && ref.index >= ir.transformations.length) {
		fail(`reference '${ref.raw}' out of range for Transformations`);
	}
	if (ref.kind === "c" && ref.index >= ir.csg.length) {
		fail(`reference '${ref.raw}' out of range for CSG`);
	}
}

function parseRequiredSection(programBody: string, sectionName: string, cursor: number): { content: string; nextCursor: number;} {
	const start = programBody.indexOf(sectionName, cursor);
	if (start === -1) fail(`missing required section '${sectionName}'`);

	const between = programBody.slice(cursor, start).trim();
	if (between.length > 0) {
		fail(`unexpected tokens before section '${sectionName}': '${between}'`);
	}

	let open = start + sectionName.length;
	open = skipWhitespace(programBody, open);
	if (programBody[open] !== "[") fail(`section '${sectionName}' must be followed by '['`);

	const block = parseBlock(programBody, open);

	return {
		content: block.content,
		nextCursor: block.nextIndex,
	};
}

export function parseIR(irCode: string): ParsedIR {
	const input = irCode.trim();
	if (!input) fail("input is empty");

	let i = skipWhitespace(input, 0);
	if (input[i] !== "[") fail("input must begin with '['");

	const firstBlock = parseBlock(input, i);
	const firstText = firstBlock.content.trim();

	let version: string | null = null;
	let programBody = "";
	let tailIndex = firstBlock.nextIndex;

	if (/^\d+\.\d+\.\d+$/.test(firstText)) {
		version = firstText;
		i = skipWhitespace(input, firstBlock.nextIndex);
		if (input[i] !== "[") fail("expected program block after version block");
		const programBlock = parseBlock(input, i);
		programBody = programBlock.content;
		tailIndex = programBlock.nextIndex;
	} else {
		programBody = firstBlock.content;
	}

	if (input.slice(tailIndex).trim().length > 0) {
		fail("unexpected trailing tokens after program block");
	}

	let cursor = 0;
	const rendersSection = parseRequiredSection(programBody, "Renders", cursor);
	cursor = rendersSection.nextCursor;
	const primitivesSection = parseRequiredSection(programBody, "Primitives", cursor);
	cursor = primitivesSection.nextCursor;
	const transformationsSection = parseRequiredSection(programBody, "Transformations", cursor);
	cursor = transformationsSection.nextCursor;
	const csgSection = parseRequiredSection(programBody, "CSG", cursor);
	cursor = csgSection.nextCursor;

	if (programBody.slice(cursor).trim().length > 0) {
		fail(`unexpected tokens after CSG section: '${programBody.slice(cursor).trim()}'`);
	}

	const renders = parseRenders(rendersSection.content);

	const primitiveEntries = parseEntryBlocks(primitivesSection.content);
	const primitives: PrimitiveIR[] = primitiveEntries.map((entry) => {
		if (!VALID_PRIMITIVES.has(entry.head)) {
			fail(`unsupported primitive '${entry.head}'`);
		}
		const prim: PrimitiveIR = {
			kind: entry.head as PrimitiveKind,
			params: parseNumberList(entry.payload),
		};
		if (entry.attrs) {
			prim.attrs = splitTopLevelItems(entry.attrs);
			// parse Color[...] attribute if present
			for (const a of prim.attrs) {
				const m = /^([A-Za-z_]\w*)\[(.*)\]$/.exec(a);
				if (!m) continue;
				const aname = m[1];
				const aargs = m[2];
				if (aname === 'Color') {
					const nums = parseNumberList(aargs);
					if (nums.length >= 3) {
						// normalize 0..255 -> 0..1 if any value > 1
						let r = nums[0];
						let g = nums[1];
						let b = nums[2];
						if (r > 1 || g > 1 || b > 1) {
							r = r / 255.0; g = g / 255.0; b = b / 255.0;
						}
						prim.color = [r, g, b];
					}
				}
			}
		}
		return prim;
	});

	const transformEntries = parseEntryBlocks(transformationsSection.content);
	const transformations: TransformationIR[] = transformEntries.map((entry) => {
		const source = parseRef(entry.head);
		const matrix = parseNumberList(entry.payload);
		if (matrix.length !== 16) {
			fail(`transformation '${entry.head}' must contain exactly 16 matrix values`);
		}
		const tr: TransformationIR = { source, matrix };
		if (entry.attrs) {
			tr.attrs = splitTopLevelItems(entry.attrs);
			for (const a of tr.attrs) {
				const m = /^([A-Za-z_]\w*)\[(.*)\]$/.exec(a);
				if (!m) continue;
				const aname = m[1];
				const aargs = m[2];
				if (aname === 'Color') {
					const nums = parseNumberList(aargs);
					if (nums.length >= 3) {
						let r = nums[0]; let g = nums[1]; let b = nums[2];
						if (r > 1 || g > 1 || b > 1) { r = r/255.0; g = g/255.0; b = b/255.0; }
						tr.color = [r, g, b];
					}
				}
			}
		}
		return tr;
	});

	const csgEntries = parseEntryBlocks(csgSection.content);
	const csg: CSGIR[] = csgEntries.map((entry) => {
		if (!VALID_CSG_OPS.has(entry.head)) {
			fail(`unsupported CSG op '${entry.head}'`);
		}
		const refs = entry.payload.split(",").map((part) => part.trim()).filter((part) => part.length > 0).map(parseRef);
		if (refs.length !== 2) {
			fail(`CSG op '${entry.head}' must contain exactly 2 object references`);
		}
		const node: CSGIR = { op: entry.head as CSGOpKind, left: refs[0], right: refs[1] };
		if (entry.attrs) {
			node.attrs = splitTopLevelItems(entry.attrs);
			for (const a of node.attrs) {
				const m = /^([A-Za-z_]\w*)\[(.*)\]$/.exec(a);
				if (!m) continue;
				const aname = m[1];
				const aargs = m[2];
				if (aname === 'Color') {
					const nums = parseNumberList(aargs);
					if (nums.length >= 3) {
						let r = nums[0]; let g = nums[1]; let b = nums[2];
						if (r > 1 || g > 1 || b > 1) { r = r/255.0; g = g/255.0; b = b/255.0; }
						node.color = [r, g, b];
					}
				}
			}
		}
		return node;
	});

	const parsed: ParsedIR = {
		version,
		renders,
		primitives,
		transformations,
		csg,
	};

	for (const ref of parsed.renders) validateReference(ref, parsed);
	for (const tr of parsed.transformations) validateReference(tr.source, parsed);
	for (const op of parsed.csg) {
		validateReference(op.left, parsed);
		validateReference(op.right, parsed);
	}

	return parsed;
}



function refToGlobalIndex(ref: ObjectRef, ir: ParsedIR): number {
	if (ref.kind === "p") return ref.index;
	if (ref.kind === "t") return ir.primitives.length + ref.index;
	return ir.primitives.length + ir.transformations.length + ref.index;
}

/**
 * Flattens parsed IR into a form suitable for rendering: a list of primitive leaves with world-space inverse matrices, 
 * and a single RPN token stream encoding the CSG tree.
 * @param ir Parsed IR to flatten into renderable form
 * @returns An object containing the list of flattened leaves, the RPN token stream, and an estimate of the scene radius for camera framing
 * @throws If the IR contains cycles, references out of range, or other structural issues that prevent flattening
 */
export function flattenIR(ir: ParsedIR): { leaves: FlatLeaf[]; tokens: FlatToken[]; sceneRadius: number } {
	const leaves: FlatLeaf[] = [];
	const tokens: FlatToken[] = [];
	let sceneRadius = 0;

	const inPath = new Set<number>();

	function visit(ref: ObjectRef, currentFwd: Mat4, currentInv: Mat4, inheritedColor?: [number, number, number, number] | null): void {
		const globalIndex = refToGlobalIndex(ref, ir);
		if (inPath.has(globalIndex)) {
			throw new Error(`Cycle detected while flattening IR at ${ref.raw}`);
		}
		inPath.add(globalIndex);

		if (ref.kind === "p") {
			const prim = ir.primitives[ref.index];
			let kind = PRIM_SPHERE;
			if (prim.kind === "Cube") kind = PRIM_CUBE;
			else if (prim.kind === "Cylinder") kind = PRIM_CYLINDER;
			else if (prim.kind === "Pyramid") kind = PRIM_PYRAMID;
			else if (prim.kind === "Cone") kind = PRIM_CONE;
			else if (prim.kind === "Torus") kind = PRIM_TORUS;
			else if (prim.kind === "Octahedron") kind = PRIM_OCTAHEDRON;

			const p0 = prim.params[0] ?? 1;
			const p1 = prim.params[1] ?? 1;
			const p2 = prim.params[2] ?? 1;

			const leafIndex = leaves.length;
			// determine leaf color: inheritedColor overrides primitive's declared color
			const primColor: [number, number, number, number] = prim.color ? [prim.color[0], prim.color[1], prim.color[2], 0.0] : null as any;
			const defaultColor: [number, number, number, number] = [0.6, 0.6, 0.6, 0.0];
			const color: [number, number, number, number] = inheritedColor ?? primColor ?? defaultColor;
			leaves.push({ kind, params: [p0, p1, p2, 0], inv: currentInv, color });
			// estimate world-space bounding radius for this primitive using currentFwd
			// forward matrix stores translation in indices 3,7,11
			const cx = currentFwd[3];
			const cy = currentFwd[7];
			const cz = currentFwd[11];
			// approximate max scale from column lengths
			const sx = Math.hypot(currentFwd[0], currentFwd[4], currentFwd[8]);
			const sy = Math.hypot(currentFwd[1], currentFwd[5], currentFwd[9]);
			const sz = Math.hypot(currentFwd[2], currentFwd[6], currentFwd[10]);
			const maxScale = Math.max(sx, sy, sz, 1e-6);
			let primRadius = Math.abs(p0);
			if (kind === PRIM_CUBE) {
				// p0 is size; half-diagonal as radius
				primRadius = 0.5 * Math.sqrt(p0 * p0 * 3);
			} else if (kind === PRIM_CYLINDER) {
				// p0 radius, p1 height
				primRadius = Math.max(p0, 0.5 * p1);
			}
			const worldRadius = primRadius * maxScale;
			const centerDist = Math.hypot(cx, cy, cz);
			sceneRadius = Math.max(sceneRadius, centerDist + worldRadius);
			tokens.push({ kind: TOKEN_LEAF, data: leafIndex });
			inPath.delete(globalIndex);
			return;
		}

		if (ref.kind === "t") {
			// Get the transformation type and apply the necessary matrix operation
			const tr = ir.transformations[ref.index];
			const invThis = invertAffine(tr.matrix);
			const nextInv = mulMat4(invThis, currentInv);
			const nextFwd = mulMat4(currentFwd, tr.matrix as Mat4);
			// pass color from transformation if present, overriding inherited
			const trColor = tr.color ? [tr.color[0], tr.color[1], tr.color[2], 0.0] as [number,number,number,number] : null;
			const nextColor = trColor ?? inheritedColor ?? null;
			visit(tr.source, nextFwd, nextInv, nextColor);
			inPath.delete(globalIndex);
			return;
		}

		const op = ir.csg[ref.index];
		// propagate CSG-level color if present
		const cColor = ir.csg[ref.index].color ? [ir.csg[ref.index].color![0], ir.csg[ref.index].color![1], ir.csg[ref.index].color![2], 0.0] as [number,number,number,number] : null;
		const leftColor = cColor ?? inheritedColor ?? null;
		const rightColor = cColor ?? inheritedColor ?? null;
		visit(op.left, currentFwd, currentInv, leftColor);
		visit(op.right, currentFwd, currentInv, rightColor);
		if (op.op === "Union") tokens.push({ kind: TOKEN_UNION, data: 0 });
		else if (op.op === "Difference") tokens.push({ kind: TOKEN_DIFFERENCE, data: 0 });
		else tokens.push({ kind: TOKEN_INTERSECTION, data: 0 });

		inPath.delete(globalIndex);
	}

	const id = identityMat4();
	for (const root of ir.renders) {
		visit(root, id, id);
	}

	if (ir.renders.length > 1) {
		for (let i = 1; i < ir.renders.length; i++) {
			tokens.push({ kind: TOKEN_UNION, data: 0 });
		}
	}

	return { leaves, tokens, sceneRadius };
}

// function validateRPN(tokens: FlatToken[]): { maxDepth: number; finalDepth: number } {
// 	let depth = 0;
// 	let maxDepth = 0;

// 	for (const token of tokens) {
// 		if (token.kind === TOKEN_LEAF) {
// 			depth += 1;
// 			if (depth > maxDepth) maxDepth = depth;
// 			continue;
// 		}

// 		if (token.kind === TOKEN_UNION || token.kind === TOKEN_DIFFERENCE || token.kind === TOKEN_INTERSECTION) {
// 			if (depth < 2) {
// 				throw new Error("Invalid RPN token stream: binary op requires two operands");
// 			}
// 			depth -= 1;
// 			continue;
// 		}

// 		throw new Error(`Invalid RPN token stream: unknown token kind ${token.kind}`);
// 	}

// 	if (depth !== 1) {
//     onLog?.(`RPN validation failed: final stack depth is ${depth}, expected 1`);
//     throw new Error("Invalid flattened scene: malformed CSG token program");
//   }
//   if (tokens.length > MAX_TOKEN_COUNT) {
//     onLog?.(`Token cap exceeded: ${tokens.length} > ${MAX_TOKEN_COUNT}`);
//     throw new Error("Scene too large: token count exceeds current renderer limit");
//   }
//   if (flattened.leaves.length > MAX_LEAF_COUNT) {
//     onLog?.(`Leaf cap exceeded: ${flattened.leaves.length} > ${MAX_LEAF_COUNT}`);
//     throw new Error("Scene too large: leaf count exceeds current renderer limit");
//   }
//   if (tokenStats.maxDepth > MAX_SHADER_STACK_DEPTH) {
//     onLog?.(`Stack depth cap exceeded: ${tokenStats.maxDepth} > ${MAX_SHADER_STACK_DEPTH}`);
//     throw new Error("Scene too large: CSG nesting exceeds shader stack depth limit");
//   }

//   onLog?.(`Flattened scene: ${flattened.leaves.length} leaves, ${flattened.tokens.length} RPN tokens`);
//   onLog?.(`RPN stack profile: maxDepth=${tokenStats.maxDepth}, finalDepth=${tokenStats.finalDepth}`);
// }