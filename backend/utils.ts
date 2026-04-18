export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export function identityMat4(): Mat4 {
	return [
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 1,
	];
}

export function mulMat4(a: Mat4, b: Mat4): Mat4 {
	const out = new Array<number>(16).fill(0);
	for (let r = 0; r < 4; r++) {
		for (let c = 0; c < 4; c++) {
			let s = 0;
			for (let k = 0; k < 4; k++) {
				s += a[r * 4 + k] * b[k * 4 + c];
			}
			out[r * 4 + c] = s;
		}
	}
	return out as Mat4;
}

export function invertAffine(m: number[]): Mat4 {
	if (m.length !== 16) throw new Error("Expected 16 values for matrix inversion");

	const r00 = m[0], r01 = m[1], r02 = m[2];
	const r10 = m[4], r11 = m[5], r12 = m[6];
	const r20 = m[8], r21 = m[9], r22 = m[10];
	const tx = m[3], ty = m[7], tz = m[11];

	const c00 = r11 * r22 - r12 * r21;
	const c01 = -(r10 * r22 - r12 * r20);
	const c02 = r10 * r21 - r11 * r20;
	const c10 = -(r01 * r22 - r02 * r21);
	const c11 = r00 * r22 - r02 * r20;
	const c12 = -(r00 * r21 - r01 * r20);
	const c20 = r01 * r12 - r02 * r11;
	const c21 = -(r00 * r12 - r02 * r10);
	const c22 = r00 * r11 - r01 * r10;

	const det = r00 * c00 + r01 * c01 + r02 * c02;
	if (Math.abs(det) < 1e-10) {
		throw new Error("Encountered non-invertible transform matrix");
	}
	const invDet = 1.0 / det;

	const i00 = c00 * invDet;
	const i01 = c10 * invDet;
	const i02 = c20 * invDet;
	const i10 = c01 * invDet;
	const i11 = c11 * invDet;
	const i12 = c21 * invDet;
	const i20 = c02 * invDet;
	const i21 = c12 * invDet;
	const i22 = c22 * invDet;

	const itx = -(i00 * tx + i01 * ty + i02 * tz);
	const ity = -(i10 * tx + i11 * ty + i12 * tz);
	const itz = -(i20 * tx + i21 * ty + i22 * tz);

	return [
		i00, i01, i02, itx,
		i10, i11, i12, ity,
		i20, i21, i22, itz,
		0, 0, 0, 1,
	];
}