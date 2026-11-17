import { useEffect, useRef } from 'react'

// Custom WebGL wave (Aura ED494E "Gray Wave with Sparkles" re-interpreted in
// club colors): silky lime filaments flowing diagonally over dark green,
// plus sparse twinkling sparkles. Mouse-reactive (quiet warp + glow).
// Perf discipline: pauses when off-screen (IntersectionObserver), DPR cap 2,
// prefers-reduced-motion renders a single static frame, no external assets.
const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
varying vec2 v_uv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.55; }
  return v;
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / u_res.y;
  vec2 p = uv * vec2(aspect, 1.0);
  vec2 m = (u_mouse - 0.5) * vec2(aspect, 1.0);
  float influence = exp(-length(p - m) * 1.8);

  float t = u_time * 0.12;

  // silky diagonal light threads: layered glowing curves,
  // each = slow sine drift + gentle fbm wobble (NO harsh turbulence)
  float acc = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float base = 0.50 + fi * 0.09;
    float wob = fbm(vec2(p.x * 1.1 + fi * 3.1, t * 0.45 + fi * 1.7)) - 0.5;
    float curve = base
      + wob * 0.30
      + 0.05 * sin(p.x * 1.9 + t * (0.6 + fi * 0.21) + fi * 2.1)
      + influence * 0.10;
    float d = abs(p.y - curve);
    float w = 0.012 + 0.018 * fi;
    float core = exp(-d * d / (w * w));
    float halo = exp(-d * d / (w * w * 11.0)) * 0.16;
    acc += (core + halo) * (0.55 - 0.09 * fi);
  }

  // threads live in a mid diagonal band, fade to section edges
  float env = exp(-pow((p.y - 0.58) * 2.1, 2.0));
  acc *= env;
  acc *= smoothstep(0.0, 0.14, uv.x) * smoothstep(1.0, 0.86, uv.x)
       * smoothstep(0.0, 0.16, uv.y) * smoothstep(1.0, 0.84, uv.y);
  acc += influence * 0.10 * env;

  vec3 lime = vec3(0.839, 0.965, 0.353);
  vec3 green = vec3(0.10, 0.22, 0.13);
  vec3 col = mix(green, lime, clamp(acc, 0.0, 1.0));
  float alpha = clamp(acc * 0.62, 0.0, 1.0);

  // sparse twinkling sparkles on a hash grid
  vec2 gp = uv * u_res / 110.0;
  vec2 gi = floor(gp);
  vec2 gf = fract(gp);
  float h = hash(gi);
  vec2 spos = vec2(hash(gi + 1.3), hash(gi + 7.7));
  float d2 = length(gf - spos);
  float tw = 0.5 + 0.5 * sin(u_time * (0.6 + h * 1.8) + h * 40.0);
  float spark = smoothstep(0.09, 0.0, d2) * step(0.986, h) * tw * 0.9;
  col += lime * spark;
  alpha = clamp(alpha + spark, 0.0, 1.0);

  gl_FragColor = vec4(col * alpha, alpha);
}`

export function WaveBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uMouse = gl.getUniformLocation(prog, 'u_mouse')

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 1, h = 1
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width * dpr))
      h = Math.max(1, Math.round(r.height * dpr))
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    resize()

    let mx = 0.5, my = 0.45, tmx = 0.5, tmy = 0.45
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      tmx = (e.clientX - r.left) / r.width
      tmy = 1 - (e.clientY - r.top) / r.height
    }
    const parent = canvas.parentElement
    parent?.addEventListener('mousemove', onMove)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const start = performance.now()
    let raf = 0
    let io: IntersectionObserver | null = null

    const draw = (now: number) => {
      mx += (tmx - mx) * 0.04
      my += (tmy - my) * 0.04
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.uniform2f(uMouse, mx, my)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const loop = () => {
      draw(performance.now())
      raf = requestAnimationFrame(loop)
    }

    if (reduced) {
      draw(start + 30000)
    } else {
      io = new IntersectionObserver(([en]) => {
        if (en.isIntersecting && !raf) raf = requestAnimationFrame(loop)
        if (!en.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0 }
      }, { rootMargin: '80px' })
      io.observe(canvas)
      raf = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(() => {
      resize()
      if (reduced) draw(performance.now() + 30000)
    })
    ro.observe(canvas)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io?.disconnect()
      ro.disconnect()
      parent?.removeEventListener('mousemove', onMove)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
