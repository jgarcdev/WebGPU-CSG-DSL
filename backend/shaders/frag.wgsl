struct SceneUniforms {
  resolution: vec2f,
  leafCount: u32,
  tokenCount: u32,
  renderCount: u32,
  showAxes: u32,
  _pad0: u32,
  _pad1: u32,
};

struct LeafNode {
  kind: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  params: vec4f,
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
  let b = vec3f(size * 0.5);
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdfCylinder(p: vec3f, radius: f32, height: f32) -> f32 {
  let d = vec2f(length(p.xz) - radius, abs(p.y) - (height * 0.5));
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}



fn sdfLeaf(idx: u32, p: vec3f) -> f32 {
  let leaf = leaves[idx];
  let lp = applyInv(leaf, p);
  switch leaf.kind {
    case 0u: {
      return sdfSphere(lp, leaf.params.x);
    }
    case 1u: {
      return sdfCube(lp, leaf.params.x);
    }
    case 2u: {
      return sdfCylinder(lp, leaf.params.x, leaf.params.y);
    }
    default: {
      return 1e6;
    }
  }
}

fn sdfScene(p: vec3f) -> f32 {
  var stack: array<f32, 256>;
  var sp: u32 = 0u;

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

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
  let uv = (fragPos.xy / scene.resolution) * 2.0 - vec2f(1.0, 1.0);
  let aspect = scene.resolution.x / max(scene.resolution.y, 1.0);
  let dir = normalize(vec3f(uv.x * aspect, -uv.y, -1.8));

  let ro = vec3f(0.0, 0.0, 5.0);
  var t = 0.0;
  var hit = false;
  var p = ro;

  for (var i = 0; i < 128; i = i + 1) {
    p = ro + dir * t;
    let d = sdfScene(p);
    if (d < 0.001) {
      hit = true;
      break;
    }
    t = t + d;
    if (t > 80.0) {
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
  return vec4f(col, 1.0);
}