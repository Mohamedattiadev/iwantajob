'use client'

import { useEffect, useRef } from 'react'

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_tint;
uniform float u_dark;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(in vec2 p) {
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0);
  vec3 n = h*h*h*h * vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = r * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.08;

  vec2 q = vec2(fbm(uv + vec2(t, -t)), fbm(uv + vec2(-t, t * 0.7) + 3.1));
  float f = fbm(uv + q * 1.6);

  float aurora = smoothstep(-0.2, 0.9, f);
  float band = smoothstep(0.3, 0.8, f) - smoothstep(0.8, 1.0, f);

  float d = length(uv * vec2(0.7, 1.0));
  float fade = smoothstep(0.95, 0.4, d);

  // ---- DARK PATH: saturated glow over near-black bg ----
  vec3 baseD = u_tint * (0.35 + 0.65 * aurora);
  vec3 hiD = mix(u_tint, vec3(1.0, 0.85, 1.0), 0.4) * band * 1.2;
  vec3 colD = baseD + hiD;
  colD = colD * 0.55 + u_tint * 0.18 * smoothstep(0.9, 0.0, d);
  float alphaD = clamp(0.65 * fade, 0.0, 1.0);

  // ---- LIGHT PATH: pastel tint clouds on white ----
  // Premultiplied-style: output color toward tint, alpha drives visibility
  vec3 pastel = mix(vec3(1.0), u_tint, 0.55);
  vec3 hiL = mix(u_tint, vec3(0.95, 0.8, 1.0), 0.5) * band;
  vec3 colL = pastel + hiL * 0.25;
  float intensityL = clamp(aurora * 0.55 + band * 0.35, 0.0, 1.0);
  float alphaL = clamp(intensityL * fade * 0.55, 0.0, 1.0);

  vec3 col = mix(colL, colD, u_dark);
  float alpha = mix(alphaL, alphaD, u_dark);

  outColor = vec4(col, alpha);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(s))
    gl.deleteShader(s)
    return null
  }
  return s
}

function parseTint(): [number, number, number] {
  if (typeof window === 'undefined') return [0.55, 0.4, 0.95]
  const v = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
  // Expect oklch(...) — fallback to brand purple if unparsable
  const m = v.match(/oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i)
  if (!m) return [0.55, 0.4, 0.95]
  // Crude oklch → rgb-ish tint (good enough for shader bias)
  const L = parseFloat(m[1])
  const C = parseFloat(m[2])
  const H = (parseFloat(m[3]) * Math.PI) / 180
  const a = Math.cos(H) * C
  const b = Math.sin(H) * C
  const r = L + 0.4 * a
  const g = L - 0.2 * a - 0.3 * b
  const bl = L - 0.3 * a + 0.6 * b
  return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, bl))]
}

export function ShaderBackground({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false, alpha: true })
    if (!gl) return

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uTint = gl.getUniformLocation(prog, 'u_tint')
    const uDark = gl.getUniformLocation(prog, 'u_dark')

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const tint = parseTint()
    gl.uniform3f(uTint, tint[0], tint[1], tint[2])

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const SCALE = 0.6
    function resize() {
      const w = canvas!.clientWidth
      const h = canvas!.clientHeight
      const W = Math.max(1, Math.floor(w * SCALE))
      const H = Math.max(1, Math.floor(h * SCALE))
      if (canvas!.width !== W || canvas!.height !== H) {
        canvas!.width = W
        canvas!.height = H
        gl!.viewport(0, 0, W, H)
      }
      gl!.uniform2f(uRes, W, H)
    }

    function isDark() {
      return document.documentElement.classList.contains('dark') ? 1 : 0
    }

    let raf = 0
    let last = 0
    const TARGET_MS = 1000 / 30
    const start = performance.now()
    function frame(now: number) {
      if (!reduced) raf = requestAnimationFrame(frame)
      if (now - last < TARGET_MS) return
      last = now
      resize()
      gl!.uniform1f(uDark, isDark())
      gl!.uniform1f(uTime, (now - start) / 1000)
      gl!.clearColor(0, 0, 0, 0)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(frame)

    // Pause when offscreen OR when the tab is hidden — saves GPU + battery.
    const io = new IntersectionObserver((entries) => {
      const vis = entries[0]?.isIntersecting && !document.hidden
      if (vis && !raf && !reduced) raf = requestAnimationFrame(frame)
      if (!vis && raf) { cancelAnimationFrame(raf); raf = 0 }
    })
    io.observe(canvas)
    const onVis = () => {
      if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0 }
      else if (!document.hidden && !raf && !reduced) raf = requestAnimationFrame(frame)
    }
    document.addEventListener("visibilitychange", onVis)

    const ro = new ResizeObserver(() => {
      if (reduced) {
        resize()
        gl!.uniform1f(uDark, isDark())
        gl!.uniform1f(uTime, 12.3)
        gl!.clear(gl!.COLOR_BUFFER_BIT)
        gl!.drawArrays(gl!.TRIANGLES, 0, 3)
      }
    })
    ro.observe(canvas)

    const mo = new MutationObserver(() => {
      gl!.uniform1f(uDark, isDark())
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      mo.disconnect()
      document.removeEventListener("visibilitychange", onVis)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [])

  return <canvas ref={canvasRef} className={`h-full w-full ${className}`} aria-hidden />
}
