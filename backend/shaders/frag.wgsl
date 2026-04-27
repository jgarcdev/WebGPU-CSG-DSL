struct SceneUniforms {
  resolution: vec2f,
  _pad0: vec2f,
  leafCount: u32,
  tokenCount: u32,
  renderCount: u32,
  showAxes: u32,
  cameraPos: vec4f,
  cameraTarget: vec4f,
  cameraParams: vec4f,
};

struct LeafNode {
  kind: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  params: vec4f,
  color: vec4f,
  inv0: vec4f,
  inv1: vec4f,
  inv2: vec4f,
  inv3: vec4f,
};

struct TokenNode {
  kind: u32,
  data: u32,
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var<storage, read> leaves: array<LeafNode>;
@group(0) @binding(2) var<storage, read> tokens: array<TokenNode>;

fn applyInv(leaf: LeafNode, p: vec3f) -> vec3f {
  let v = vec4f(p, 1.0);
  return vec3f(
    dot(leaf.inv0, v),
    dot(leaf.inv1, v),
    dot(leaf.inv2, v)
  );
}


// SDF primitives
// https://iquilezles.org/articles/distfunctions/#:~:text=Intro,Euclidean%2C%20L2-norm).


fn sdfSphere(p: vec3f, radius: f32) -> f32 {
  return length(p) - radius;
}

fn sdfCube(p: vec3f, size: f32) -> f32 {
  let d = abs(p) - vec3f(size * 0.5);

  let insideDist = min(max(d.x, max(d.y, d.z)), 0.0);
  let outsideDist = length(max(d, vec3f(0.0)));

  return outsideDist + insideDist;
}

fn sdfCylinder(p: vec3f, radius: f32, height: f32) -> f32 {
  let inOutRadius = length(p.xz) - radius;
  let inOutHeight = abs(p.y) - (height * 0.5);

  let d = vec2f(inOutRadius, inOutHeight);

  let insideDist = min(max(d.x, d.y), 0.0);
  let outsideDist = length(max(d, vec2f(0.0)));

  return insideDist + outsideDist;
}

fn sdfPyramid(p: vec3f, base: f32, h: f32) -> f32 {
  let m2 = h * h + base * base;
  var xz: vec2f = abs(p.xz);
  xz = select(xz, xz.yx, xz[1] > xz[0]);
  xz = xz - vec2f(base);

  let q = vec3f(xz[1], h * p.y - base * xz[0], h * xz[0] + base * p.y);
  let s = max(-q.x, 0.);
  let t = clamp((q.y - base * xz[1]) / (m2 + 0.25), 0., 1.);

  let a = m2 * (q.x + s) * (q.x + s) + q.y * q.y;
  let b = m2 * (q.x + base * t) * (q.x + base * t) + (q.y - m2 * t) * (q.y - m2 * t);

  let d2 = min(a, b) * step(min(q.y, -q.x * m2 - q.y * base), 0.);
  return sqrt((d2 + q.z * q.z) / m2) * sign(max(q.z, -p.y));
}

fn sdfCone(p: vec3f, radius: f32, height: f32) -> f32 {
  let sincos = vec2f(sin(radius), cos(radius));
  let q = height * vec2f(sincos.x / sincos.y, -1.);
  let w = vec2f(length(p.xz), p.y - height); // doing `- height` places the base at the x-z plane
  let a = w - q * clamp(dot(w,q) / dot(q,q), 0., 1.);
  let b = w - q * vec2f(clamp(w.x / q.x, 0., 1.), 1.);
  let k = sign(q.y);
  let d = min(dot(a, a), dot(b, b));
  let s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
  return sqrt(d) * sign(s);
}

fn sdfTorus(p: vec3f, radius1: f32, radius2: f32) -> f32 {
  let q = vec2f(length(p.xz) - radius1, p.y);
  return length(q) - radius2;
}

fn sdfOctahedron(p: vec3f, size: f32) -> f32 {
  let q = abs(p);
  return (q.x + q.y + q.z - size) * 0.57735027;
}



fn sdfLeaf(idx: u32, p: vec3f) -> f32 {
  let leaf = leaves[idx];
  let lp = applyInv(leaf, p);
  let marchScale = max(leaf.params.w, 0.0);
  switch leaf.kind {
    case 0u: {
      return sdfSphere(lp, leaf.params.x) * marchScale;
    }
    case 1u: {
      return sdfCube(lp, leaf.params.x) * marchScale;
    }
    case 2u: {
      return sdfCylinder(lp, leaf.params.x, leaf.params.y) * marchScale;
    }
    case 3u: {
      return sdfPyramid(lp, leaf.params.x, leaf.params.y) * marchScale;
    }
    case 4u: {
      return sdfCone(lp, leaf.params.x, leaf.params.y) * marchScale;
    }
    case 5u: {
      return sdfTorus(lp, leaf.params.x, leaf.params.y) * marchScale;
    }
    case 6u: {
      return sdfOctahedron(lp, leaf.params.x) * marchScale;
    }
    default: {
      return 1e6;
    }
  }
}

fn sdfScene(p: vec3f) -> f32 {
  var stack: array<f32, 128>;
  var sp: u32 = 0u;

  // Go through the "program"
  for (var i: u32 = 0u; i < scene.tokenCount; i = i + 1u) {
    let tok = tokens[i];
    if (tok.kind == 0u) {
      if (tok.data >= scene.leafCount || sp >= 256u) {
        return 1e6;
      }
      stack[sp] = sdfLeaf(tok.data, p);
      sp = sp + 1u;
      continue;
    }

    if (sp < 2u) {
      return 1e6;
    }
    let b = stack[sp - 1u];
    let a = stack[sp - 2u];
    sp = sp - 2u;

    var v = min(a, b);
    if (tok.kind == 2u) {
      v = max(a, -b);
    } else if (tok.kind == 3u) {
      v = max(a, b);
    }

    stack[sp] = v;
    sp = sp + 1u;
  }

  if (sp == 0u) {
    return 1e6;
  }
  return stack[sp - 1u];
}

fn estimateNormal(p: vec3f) -> vec3f {
  let e = 0.001;
  let x = sdfScene(p + vec3f(e, 0.0, 0.0)) - sdfScene(p - vec3f(e, 0.0, 0.0));
  let y = sdfScene(p + vec3f(0.0, e, 0.0)) - sdfScene(p - vec3f(0.0, e, 0.0));
  let z = sdfScene(p + vec3f(0.0, 0.0, e)) - sdfScene(p - vec3f(0.0, 0.0, e));
  return normalize(vec3f(x, y, z));
}

fn overlayAxesAt(p: vec3f) -> vec3f {
  if (scene.showAxes == 0u) {
    return vec3f(0.0);
  }
  // kept for backward-compat but not used by ray overlay; small fallback
  return vec3f(0.0);
}

fn axisOverlayRay(ro: vec3f, dir: vec3f) -> vec4f {
  if (scene.showAxes == 0u) {
    return vec4f(0.0);
  }
  // camera focal used in dir construction in main (approx)
  let focal = 1.8;
  let resY = max(scene.resolution.y, 1.0);
  var outCol = vec3f(0.0);
  var outA = 0.0;

  // axis definitions: (dir, color)
  let axesDir = array<vec3f, 3>(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
  let axesCol = array<vec3f, 3>(vec3f(1.0, 0.25, 0.25), vec3f(0.25, 1.0, 0.25), vec3f(0.35, 0.45, 1.0));
  let maxRange = 1000.0;

  for (var i: i32 = 0; i < 3; i = i + 1) {
    let a = axesDir[i];
    let u = dir - a * dot(dir, a);
    let v = ro - a * dot(ro, a);
    let denom = dot(u, u);
    if (denom < 1e-6) { continue; }
    let tClose = -dot(u, v) / denom;
    if (tClose <= 0.0) { continue; }
    let pt = ro + dir * tClose;
    let s = dot(pt, a);
    if (abs(s) > maxRange) { continue; }
    let closest = pt - a * s;
    let dist = length(closest);

    // approximate world units per pixel at distance tClose
    let tanHalfFov = 1.0 / focal;
    let worldHalfHeight = tClose * tanHalfFov;
    let worldPerPixel = (worldHalfHeight * 2.0) / resY;
    let pixelWidth = 1.5; // target width in pixels
    let thickness = max(0.0005, worldPerPixel * pixelWidth);

    let alpha = 1.0 - smoothstep(0.0, thickness, dist);
    if (alpha <= 0.0) { continue; }

    // ticks: if point close to integer along axis, boost alpha and color
    let frac = abs(s - round(s));
    if (frac < 0.08) {
      outCol = mix(outCol, axesCol[i] * 1.2, alpha);
      outA = max(outA, alpha);
    } else {
      outCol = mix(outCol, axesCol[i], alpha);
      outA = max(outA, alpha * 0.9);
    }
  }

  return vec4f(outCol, outA);
}

fn getLeafColorAtPoint(p: vec3f) -> vec3f {
  var bestIdx: u32 = 0u;
  var bestDist: f32 = 1e9;
  for (var i: u32 = 0u; i < scene.leafCount; i = i + 1u) {
    let d = abs(sdfLeaf(i, p));
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  let leaf = leaves[bestIdx];
  return vec3f(leaf.color.x, leaf.color.y, leaf.color.z);
}

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
  let uv = (fragPos.xy / scene.resolution) * 2.0 - vec2f(1.0, 1.0);
  let aspect = scene.resolution.x / max(scene.resolution.y, 1.0);

  let ro = scene.cameraPos.xyz;
  let camTarget = scene.cameraTarget.xyz;
  let focal = scene.cameraParams.x;

  var forward = normalize(camTarget - ro);
  var upRef = vec3f(0.0, 1.0, 0.0);
  if (abs(dot(forward, upRef)) > 0.999) {
    upRef = vec3f(0.0, 0.0, 1.0);
  }
  let right = normalize(cross(forward, upRef));
  let up = normalize(cross(right, forward));

  // screen coordinates: uv.x left-right, uv.y up-down
  let sx = uv.x * aspect;
  let sy = -uv.y;
  let dir = normalize(right * sx + up * sy + forward * focal);
  var t = 0.0;
  var hit = false;
  var p = ro;

  for (var i = 0; i < 64; i = i + 1) {
    p = ro + dir * t;
    let d = sdfScene(p);
    if (d < 0.001) {
      hit = true;
      break;
    }
    t = t + d;
    if (t > 60.0) {
      break;
    }
  }
  // compute axis overlay along ray
  let axisOverlay = axisOverlayRay(ro, dir);
  if (!hit) {
    let sky = 0.35 + 0.45 * (1.0 - max(0.0, uv.y * 0.5 + 0.5));
    let bg = vec3f(0.08, 0.12, 0.2) * sky;
    if (axisOverlay.w > 0.0) {
      return vec4f(axisOverlay.xyz, 1.0);
    }
    return vec4f(bg, 1.0);
  }

  let n = estimateNormal(p);
  let l = normalize(vec3f(0.45, 0.85, -0.25));
  let diff = max(dot(n, l), 0.0);
  let rim = pow(max(1.0 - max(dot(n, -dir), 0.0), 0.0), 2.0);
  var col = vec3f(0.85, 0.9, 1.0) * (0.12 + 0.88 * diff) + vec3f(0.15, 0.2, 0.3) * rim * 0.25;
  if (axisOverlay.w > 0.0) {
    col = mix(col, axisOverlay.xyz, axisOverlay.w);
  }
  // Blend with closest leaf color at hit point (leaf colors are normalized floats)
  if (scene.leafCount > 0u) {
    let leafCol = getLeafColorAtPoint(p);
    col = mix(col, leafCol, 0.9);
  }
  return vec4f(col, 1.0);
}