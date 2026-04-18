struct VSOut {
  @builtin(position) position: vec4f,
};

@vertex
fn main(@builtin(vertex_index) vid: u32) -> VSOut {
  var out: VSOut;
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0,  1.0),
    vec2f( 3.0,  1.0)
  );
  out.position = vec4f(pos[vid], 0.0, 1.0);
  return out;
}