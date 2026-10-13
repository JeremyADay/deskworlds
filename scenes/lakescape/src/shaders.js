// Everything is drawn flat, as a painting in layers: the valley and the lake as one backdrop,
// the yard's furniture over it, then the pane of glass in front of the lot.
// Scene coordinates are window heights: x runs 0..uAspect, y runs 0 (sill) to 1 (top).
// Yard layers write premultiplied colour.
import { RAIL_TOP, RAIL_BOTTOM, SHORE, NEAR_SHORE, PROFILE, FLASH, DISPLAY_GAMMA, EXPOSURE } from './storm.js';
import { PALM, DIGITS, FRAME } from './glass.js';
import { BULB_GAP } from './yard.js';

const f = v => Number(v).toFixed(5);
const vec3 = v => `vec3(${v.map(f).join(', ')})`;

export const COMMON = /* glsl */ `
uniform float uTime, uAspect, uAmb, uGust, uSmoke, uHoliday, uMoonLit, uEmber, uRain, uSway;
uniform vec2 uPit, uRes;
const float RAIL_TOP = ${f(RAIL_TOP)}, RAIL_BOTTOM = ${f(RAIL_BOTTOM)}, SHORE = ${f(SHORE)}, NEAR_SHORE = ${f(NEAR_SHORE)};
const float BULB_GAP = ${f(BULB_GAP)}, PI = 3.14159265;
// A hash that keeps its precision for coordinates in the thousands.
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 h31(float p) { vec3 q = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787)); q += dot(q, q.yzx + 19.19); return fract(vec3((q.x + q.y) * q.z, (q.x + q.z) * q.y, (q.y + q.z) * q.x)); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p, int octaves) { float v = 0.0, a = 0.5;
  for (int i = 0; i < octaves; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v; }
// The cabin's own light, spilling from the window: strongest straight ahead and near the ground.
float reach(vec2 p) { return 0.38 * exp(-pow((p.x / uAspect - 0.5) * 1.5, 2.0)) * smoothstep(0.6, 0.0, p.y); }
float pitLight(vec2 p) { return exp(-length((p - uPit) * vec2(1.0, 1.6)) * 7.0) * uEmber; }
// The string of patio lights: hung from the post tops, sagging between them, lifted and
// pushed along by the gusts. Bulb k hangs under the wire and swings.
const float POST_AT = 0.27;
float spanSag(float x) { float s = fract((x / uAspect - POST_AT) * 3.0); return 4.0 * s * (1.0 - s); }
vec2 wireAt(float x) {
  float sag = spanSag(x);
  return vec2(x + uGust * 0.010 * sag, RAIL_TOP + 0.0380 - 0.0300 * sag + sin(uTime * 3.0 + x * 3.8) * 0.0015 * abs(uGust) * sag);
}
float bulbSwing(float k) { return (uGust * 0.5 + sin(uTime * 4.3 + k * 2.4) * 0.22 * abs(uGust)) * (0.35 + 0.65 * spanSag((k + 0.5) * BULB_GAP)); }
// The clips went on by hand: no two bulbs are quite the same distance apart, or as bright.
float bulbX(float k) { return (k + 0.5 + (h21(vec2(k, 9.0)) - 0.5) * 0.34) * BULB_GAP; }
vec2 bulbAt(float k) { float s = bulbSwing(k); return wireAt(bulbX(k)) + vec2(sin(s), -cos(s)) * (0.0070 + 0.0020 * h21(vec2(k, 5.0))); }
vec3 bulbColour(float k) {
  float ci = mod(k, 5.0);
  vec3 festive = ci < 0.5 ? vec3(1.0, 0.16, 0.10) : ci < 1.5 ? vec3(0.20, 0.85, 0.30) : ci < 2.5 ? vec3(0.95, 0.60, 0.15) : ci < 3.5 ? vec3(0.25, 0.42, 1.0) : vec3(1.0, 0.86, 0.62);
  // Each bulb changes over in its own moment as the switch is thrown.
  float on = smoothstep(0.0, 1.0, uHoliday * 1.6 - h21(vec2(k, 3.0)) * 0.6);
  return mix(vec3(1.0, 0.68, 0.30) * 0.76, festive, on) * (0.34 + 0.80 * pow(h21(vec2(k, 7.0)), 1.5));
}
// The glow of the nearest bulbs at a point: tight around each, with a wider faint pool.
vec3 bulbLight(vec2 p) {
  vec3 sum = vec3(0.0);
  float k0 = floor(p.x / BULB_GAP);
  for (int j = -2; j <= 2; j++) { float k = k0 + float(j); float d = distance(p, bulbAt(k)); sum += bulbColour(k) * (exp(-d * 95.0) * 0.5 + exp(-d * 24.0) * 0.14); }
  return sum;
}
`;

export const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// The backdrop works out once, not per pixel, how much cloud lies over the moon.
export const BACKDROP_VERT = /* glsl */ `
${COMMON}
uniform float uCloudX;
uniform vec3 uMoon;
varying vec2 vUv;
varying float vCloudMoon;
void main() {
  vUv = uv;
  vec2 q = vec2(uMoon.x * uAspect * 1.05 + uCloudX, uMoon.y * 3.1);
  q += (vec2(fbm(q * 1.9 + 4.0, 2), noise(q * 2.3 + 11.0) * 0.94) - 0.47) * 0.42;
  vCloudMoon = smoothstep(0.34, 0.66, noise(q) * 0.5 + noise(q * 2.03 + vec2(1.7, 9.2)) * 0.25 + noise(q * 4.12 + vec2(5.2, 27.9)) * 0.125);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const YARD_VERT_PARS = /* glsl */ `
vec4 clip(vec2 p) { return vec4(p.x / uAspect * 2.0 - 1.0, p.y * 2.0 - 1.0, 0.0, 1.0); }
`;
// A pine's trunk leans with the gust and springs back, more toward its top.
const SWAY = /* glsl */ `
float sway(float t, float seed) {
  return (sin(uTime * 0.8 + seed) * 0.012 + sin(uTime * 2.1 + seed * 3.0) * 0.004) * uSway * t * t + uGust * 0.07 * t * t + sin(uTime * 7.0 + seed + t * 5.0) * 0.005 * abs(uGust) * t;
}
`;

// Cloud has no hard edges, so its shape is worked out at half size and the backdrop reads it
// back: the broad shape, the shape with its finer billows, the low scud, and how far each
// billow faces the moon.
export const CLOUD_FRAG = /* glsl */ `
${COMMON}
uniform float uCloudX;
uniform vec3 uMoon;
varying vec2 vUv;
vec2 cloudSpace(vec2 p) { return vec2(p.x * 1.05 + uCloudX, p.y * 3.1); }
vec2 cloudWarp(vec2 q) { return (vec2(fbm(q * 1.9 + 4.0, 2), noise(q * 2.3 + 11.0) * 0.94) - 0.47) * 0.42; }
float broad(vec2 q) { return noise(q) * 0.5 + noise(q * 2.03 + vec2(1.7, 9.2)) * 0.25 + noise(q * 4.12 + vec2(5.2, 27.9)) * 0.125; }
float fine(vec2 q) { return noise(q * 8.37 + vec2(12.2, 66.0)) * 0.095 + noise(q * 17.0 + vec2(26.5, 143.0)) * 0.05 - 0.026; }
void main() {
  if (vUv.y < 0.36) { gl_FragColor = vec4(0.0); return; }
  vec2 p = vec2(vUv.x * uAspect, vUv.y), mp = vec2(uMoon.x * uAspect, uMoon.y);
  vec2 cq = cloudSpace(p);
  cq += cloudWarp(cq);
  float cb = broad(cq);
  float scud = fbm(vec2(p.x * 2.7 + uCloudX * 1.8 + 9.0, p.y * 5.5), 2) * 1.15;
  // The side of each billow that faces the moon is paler.
  float facing = clamp((cb - broad(cq + (normalize(mp - p + 1e-4) * 0.45 + vec2(0.0, 0.85)) * vec2(0.032, 0.093))) * 7.0, -1.0, 1.0);
  gl_FragColor = vec4(cb, cb + fine(cq), scud, facing);
}
`;

// The valley beyond the yard: sky, moon, cloud, lightning, the ridge and the hills with their
// lights, the lake and the wet sand of the cabin's own beach.
export const BACKDROP_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uProfile, uSky;
uniform float uCloudX, uGlow, uBolt, uBoltX, uBoltSeed;
uniform vec3 uMoon;
uniform vec2 uGlowPos;
varying vec2 vUv;
varying float vCloudMoon;
vec3 land(float x) { return texture2D(uProfile, vec2(x / ${f(PROFILE.width)}, 0.5)).rgb; }
float cover(float c) { return smoothstep(0.36, 0.62, c); }

// A bolt reaches down from the cloud base like a root: one crooked channel with side
// branches that strike outward, fork again and thin out. x is the hot core, y the glow round it.
vec2 channel(float d, float b, float w) { return b * vec2(smoothstep(w * 2.5, 0.0, d), exp(-d * 55.0) * 0.7 + exp(-d * 260.0)); }
vec2 boltLight(vec2 uv, float a, float w) {
  float top = 0.84, ground = land(uBoltX * a).r - 0.02, y = uv.y;
  vec2 lit = vec2(0.0);
  if (y > ground && y < top) {
    float xm = uBoltX + (fbm(vec2(y * 7.0, uBoltSeed), 4) - 0.5) * 0.08 + (noise(vec2(y * 55.0, uBoltSeed * 2.3)) - 0.5) * 0.015 + (noise(vec2(y * 130.0, uBoltSeed)) - 0.5) * 0.006;
    lit = channel(abs(uv.x - xm) * a, 1.0, w);
  }
  for (int i = 0; i < 9; i++) {
    vec3 h = h31(uBoltSeed * 13.1 + float(i) * 7.7);
    float yb = mix(ground + 0.05, top - 0.04, h.x);
    float len = (0.05 + 0.15 * h.y) * (0.4 + 0.6 * (yb - ground) / (top - ground));
    if (y > yb || y < yb - len) continue;
    float dir = h.z < 0.5 ? -1.0 : 1.0;
    float slope = (0.30 + 1.7 * fract(h.y * 7.0)) / a;
    float xb0 = uBoltX + (fbm(vec2(yb * 7.0, uBoltSeed), 4) - 0.5) * 0.08;
    float k = yb - y, ease = min(1.0, k * 30.0);
    float jag = ((noise(vec2(y * 28.0, h.x * 50.0)) - 0.5) * 0.034 + (noise(vec2(y * 90.0, h.x * 31.0)) - 0.5) * 0.011 + (noise(vec2(y * 240.0, h.y * 17.0)) - 0.5) * 0.004) / a * 2.4;
    float xb = xb0 + dir * k * slope + jag * ease;
    lit = max(lit, channel(abs(uv.x - xb) * a, (1.0 - k / len) * 0.60, w * 0.8));
    // Each branch forks twice more on its way down, always away from the trunk.
    for (int s = 0; s < 2; s++) {
      float at = s == 0 ? 0.35 : 0.62, turn = s == 0 ? 2.1 : 0.35;
      float ks = k - len * at, len2 = len * (s == 0 ? 0.45 : 0.38);
      if (ks < 0.0 || ks > len2) continue;
      float ya = yb - len * at;
      float xa = xb0 + dir * len * at * slope + ((noise(vec2(ya * 28.0, h.x * 50.0)) - 0.5) * 0.034 + (noise(vec2(ya * 90.0, h.x * 31.0)) - 0.5) * 0.011 + (noise(vec2(ya * 240.0, h.y * 17.0)) - 0.5) * 0.004) / a * 2.4;
      float xs = xa + dir * ks * slope * turn + ((noise(vec2(y * 70.0, h.z * 40.0 + float(s))) - 0.5) * 0.016 + (noise(vec2(y * 240.0, h.z * 9.0)) - 0.5) * 0.004) / a * 2.4 * min(1.0, ks * 40.0);
      lit = max(lit, channel(abs(uv.x - xs) * a, (1.0 - ks / len2) * (s == 0 ? 0.34 : 0.26), w * 0.7));
    }
  }
  return lit;
}

// Lights in the hills: a lakeside town, hamlets on the near slopes, a few cabins up on the
// ridge. Warm and small. With the holiday switch on, some households hang red and green.
vec3 town(vec2 uv, float a, float spread) {
  vec3 c = vec3(0.0);
  vec2 p = vec2(uv.x * a, uv.y);
  float R = max(0.0013, 0.95 / uRes.y) + spread * 0.006;
  float cw = 0.008, cid0 = floor(p.x / cw);
  for (int band = 0; band < 3; band++) {
    for (int j = -1; j <= 1; j++) {
      float cid = cid0 + float(j);
      vec3 h = h31(cid * 7.13 + float(band) * 131.7);
      float cx = (cid + 0.2 + 0.6 * h.x) * cw, x01 = cx / a, dens, y;
      vec3 hs = land(cx);
      // Where the light would be, first; whether there is one there only if we are near it.
      if (band == 0) y = max(hs.g - 0.006 - h.y * 0.050 - fract(h.x * 9.7) * 0.012, SHORE + 0.006);
      else if (band == 1) y = hs.g + 0.010 + h.y * max(0.0, hs.r - hs.g - 0.06) * 0.55;
      else y = SHORE + 0.004 + h.y * h.y * 0.03;
      float d = length(p - vec2(cx, y));
      if (d > R * 3.0) continue;
      if (band == 0) dens = 0.02 + 0.95 * smoothstep(0.60, 0.80, noise(vec2(cx * 3.4, 1.0))) * smoothstep(0.35, 0.6, noise(vec2(cx * 11.0, 3.0)));
      else if (band == 1) dens = 0.008 + 0.5 * smoothstep(0.70, 0.88, noise(vec2(cx * 2.6, 5.0)));
      else dens = 0.85 * smoothstep(0.54, 0.58, x01) * smoothstep(0.74, 0.70, x01);
      if (h.z > dens) continue;
      float k = fract(h.z * 91.7 + h.x * 13.0);
      vec3 lc = k < 0.7 ? vec3(1.0, 0.64, 0.32) : k < 0.94 ? vec3(1.0, 0.76, 0.46) : vec3(1.0, 0.90, 0.74);
      vec3 fest = fract(h.x * 41.3) < 0.5 ? vec3(1.0, 0.18, 0.12) : vec3(0.25, 0.95, 0.35);
      lc = mix(lc, fest, smoothstep(0.0, 1.0, uHoliday * 1.5 - fract(h.y * 23.0) * 0.5) * step(0.62, fract(h.x * 77.1)) * (band == 1 ? 0.0 : 1.0));
      float bright = (0.20 + 0.90 * pow(fract(h.y * 57.0), 2.0)) * (band == 1 ? 0.6 : 1.0);
      float tw = 0.9 + 0.1 * sin(uTime * (0.5 + k * 2.0) + h.x * 6.28);
      // Seen direct, a light is a point; mirrored in the lake it is a soft streak with no outline.
      float shape = spread > 0.0 ? pow(smoothstep(R * 1.6, 0.0, d), 2.0) * 1.3 : smoothstep(R, R * 0.35, d) + 0.10 * smoothstep(R * 3.0, R, d);
      c += lc * shape * bright / (1.0 + spread * 1.3) * tw;
    }
  }
  return c;
}

void main() {
  vec2 uv = vUv;
  float a = uAspect;
  vec2 p = vec2(uv.x * a, uv.y);
  float soft = 1.2 / uRes.y;
  vec3 hs = land(p.x);
  float rh = hs.r, hh = hs.g, rs = hs.b;
  vec2 mp = vec2(uMoon.x * a, uMoon.y);
  float md = length(p - mp);
  float cloudMoon = vCloudMoon;
  float moonLit = 0.85 * (1.0 - cloudMoon * 0.5) * uMoon.z;   // never gone: clouds only veil it
  vec3 col = vec3(0.0);
  if (uv.y > min(rh, hh) - 0.01) {
    // Sky, moon and clouds.
    col = mix(vec3(0.050, 0.056, 0.076), vec3(0.018, 0.022, 0.036), smoothstep(0.4, 1.0, uv.y));
    col += vec3(0.020, 0.022, 0.027) * exp(-max(0.0, uv.y - rs) * 16.0);
    vec4 sk = texture2D(uSky, uv);
    float cb = sk.r, c = sk.g, scud = sk.b, facing = sk.a;
    float cloud = max(cover(c), smoothstep(0.42, 0.80, scud) * 0.55) * smoothstep(0.38, 0.50, uv.y);
    col += vec3(0.24, 0.22, 0.17) * (exp(-md * 8.0) * 0.36 + exp(-md * 40.0) * 0.4) * moonLit;
    // A soft, warm moon; the ridge hides its lower part.
    vec2 mq = (p - mp) / 0.031;
    if (md < 0.05) {
    float disc = smoothstep(1.24, 0.82, length(mq));
    // Faint seas on its face, no terminator.
    float mshade = 0.60 + 0.20 * noise(mq * 2.3 + 4.0) + 0.42 * smoothstep(0.30, 0.62, fbm(mq * 1.5 + 9.0, 3)) - 0.10 * smoothstep(0.2, 1.0, length(mq - vec2(0.25, 0.1)));
    col += vec3(0.95, 0.80, 0.56) * disc * mshade * 0.23 * 0.85;
    }
    // Clouds passing over the moon light up; its disc still shows through as a bright patch.
    float thick = smoothstep(0.42, 0.78, c);
    // Moonlight spreads along a cloud layer further than it climbs through it.
    float mdc = length((p - mp) * vec2(0.95, 1.5));
    // Thin cloud is pale with scattered moonlight; the heavy heart of a storm cloud is dark.
    vec3 cloudCol = (mix(vec3(0.104, 0.110, 0.132), vec3(0.020, 0.022, 0.030), thick) * (1.0 + 0.7 * facing) + vec3(0.026, 0.019, 0.012) * smoothstep(0.75, 0.45, uv.y)) + vec3(0.42, 0.35, 0.24) * 0.42 * (exp(-mdc * 13.0) * 0.8 + exp(-mdc * 4.0) * 0.03) * (1.05 - 0.55 * thick) * (0.60 + 1.0 * smoothstep(-0.35, 0.75, facing)) * smoothstep(0.0, 0.5, cover(c)) * (0.45 + 0.55 * smoothstep(rs + 0.01, rs + 0.10, uv.y));
    col = mix(col, cloudCol, cloud * mix(0.9, 0.24, exp(-md * 24.0)));
    col += vec3(0.030, 0.020, 0.012) * exp(-pow(uv.y - 0.40, 2.0) * 60.0);
    // Lightning inside the cloud: a glow that shows the cloud's own billows.
    vec2 gd = (uv - uGlowPos) * vec2(a, 1.6);
    float billow = uGlow + uBolt > 0.002 ? 0.55 + 0.9 * fbm(vec2(p.x * 4.0 + uCloudX * 1.3, p.y * 7.0), 3) : 1.0;
    float g = uGlow * exp(-dot(gd, gd) * 2.2) * (0.25 + cloud * 1.1 * billow * billow) * smoothstep(0.42, 0.8, uv.y);
    col += g * ${vec3(FLASH.glow)};
    col += uAmb * (${vec3(FLASH.sky)} + cloud * ${vec3(FLASH.cloud)}) * smoothstep(0.38, 0.9, uv.y);
    if (uBolt > 0.001 && abs(uv.x - uBoltX) * a < 0.45) {
      vec2 lit = boltLight(uv, a, max(0.0012, 1.1 / uRes.y));
      // It comes out of the cloud: hidden where the cloud is thick, the cloud base lit round its root.
      lit *= smoothstep(0.84, 0.74, uv.y) * (1.0 - 0.7 * cloud * smoothstep(0.60, 0.80, uv.y));
      col += uBolt * (lit.x * vec3(0.62, 0.64, 0.82) + lit.y * vec3(0.14, 0.14, 0.22));
    }
    vec2 root = (uv - vec2(uBoltX, 0.80)) * vec2(a, 1.8);
    col += uBolt * exp(-dot(root, root) * 9.0) * (0.2 + cloud) * billow * vec3(0.20, 0.21, 0.29);
  }
  // A strike lights the country nearest it most.
  float strikeX = (uBolt > 0.001 ? uBoltX : uGlowPos.x) * a;
  float nearStrike = 0.50 + 0.65 * exp(-pow((p.x - strikeX) * 0.85, 2.0));
  // Ridge and hills: dark, moonlit a little, lit fully by lightning.
  // A strike lights the country nearest it most.
  float ridge = smoothstep(rh + soft, rh - soft, uv.y);
  if (ridge > 0.0 && uv.y > SHORE - 0.014) {
  float rTex = fbm(p * vec2(9.0, 14.0), 4) * 0.6 + noise(p * vec2(47.0, 70.0)) * 0.4;
  // Gullies run down the slopes and the side toward the strike takes more of its light.
  // Ravines run down the slopes; the wall of each that faces the strike is the lit one.
  vec2 gp = vec2(p.x * 15.0 + noise(p * 5.0) * 3.0, uv.y * 16.0);
  float gully = fbm(gp, 3);
  // Spurs drop from each crag; the flank of each that faces the strike catches it.
  float spur = uAmb > 0.002 ? clamp((land(p.x + 0.008).r - land(p.x - 0.008).r) * 22.0 * clamp((strikeX - p.x) * 3.0, -1.0, 1.0), -0.5, 0.5) * exp(-max(0.0, rh - uv.y) * 9.0) : 0.0;
  float relief = uAmb > 0.002 ? clamp((fbm(gp + vec2(0.35, 0.0), 3) - fbm(gp - vec2(0.35, 0.0), 3)) * 3.2 * clamp((p.x - strikeX) * 3.0, -1.0, 1.0), -1.0, 1.0) : 0.0;
  float side = 0.80 + 0.35 * clamp((land(p.x + 0.05).b - land(p.x - 0.05).b) * 9.0 * clamp((strikeX - p.x) * 3.0, -1.0, 1.0), -1.0, 1.0);
  vec3 ridgeCol = vec3(0.015, 0.017, 0.024) + (uAmb * ${vec3(FLASH.land)} * side * nearStrike * (0.80 + 0.30 * gully + 0.30 * relief + spur) * (0.85 + 0.3 * noise(p * vec2(260.0, 190.0))) + moonLit * vec3(0.030, 0.035, 0.048) * (0.45 + 1.1 * gully)) * (0.45 + 0.55 * rTex) * (0.42 + 0.58 * smoothstep(rs - 0.22, rs + 0.02, uv.y + (gully - 0.5) * 0.08));
  col = mix(col, ridgeCol, ridge);
  float hill = smoothstep(hh + soft, hh - soft, uv.y);
  vec3 hillCol = vec3(0.009, 0.010, 0.014) * (0.7 + 0.6 * noise(p * vec2(140.0, 60.0))) + (uAmb * vec3(0.04, 0.05, 0.065) * nearStrike * (0.7 + 0.5 * gully + 0.25 * relief) + moonLit * vec3(0.006, 0.008, 0.012)) * (0.5 + 0.5 * rTex);
  col = mix(col, hillCol, hill);
  // Rain hangs in the valley: a pale breath where the hills meet the ridge and along the far shore.
  col += vec3(0.011, 0.012, 0.015) * (0.6 + moonLit) * (exp(-abs(uv.y - hh - 0.012) * 55.0) * (1.0 - hill * 0.5) + exp(-abs(uv.y - SHORE - 0.004) * 150.0)) * ridge;
  }

  if (uv.y > SHORE && uv.y < rh + 0.004) col += town(uv, a, 0.0);
  if (uv.y < SHORE + 0.004) {
  // The lake: sky, a path of moonlight, the town. Small waves run in to the near shore.
  float shoreLine = NEAR_SHORE + (noise(vec2(p.x * 6.0, 2.0)) - 0.5) * 0.012;
  // Each wavelet runs a little way up the sand and drains back.
  float swash = sin(uTime * 0.9 + p.x * 5.0 + 2.0 * noise(vec2(p.x * 1.7, uTime * 0.11)));
  float edge = shoreLine - 0.0050 * (0.5 + 0.5 * swash) * (0.5 + noise(vec2(p.x * 3.0, uTime * 0.07))) + 0.0012 * sin(p.x * 31.0 + uTime * 1.9) + 0.0008 * sin(p.x * 73.0 - uTime * 2.6);
  if (uv.y < SHORE + 0.004) {
    // The far waterline has its own small bays and points.
    float farShore = SHORE - 0.0075 * noise(vec2(p.x * 4.3, 7.0)) - 0.0025 * noise(vec2(p.x * 19.0, 3.0));
    float lake = smoothstep(farShore + 0.0025, farShore - 0.0025, uv.y) * smoothstep(edge - soft, edge + soft, uv.y);
    float rip = noise(vec2(p.x * 30.0, uv.y * 260.0 - uTime * 0.6));
    float glint = smoothstep(0.55, 0.95, noise(vec2(p.x * 90.0, uv.y * 500.0 - uTime * 1.5)));
    float pathW = max(3.0, 9.0 - 60.0 * (SHORE - uv.y));
    float path = exp(-pow((uv.x - uMoon.x) * a * pathW, 2.0)) * (0.30 + 0.70 * glint * (0.5 + 0.5 * rip)) * moonLit;
    vec2 ruv = vec2(uv.x + (rip - 0.5) * 0.0022, SHORE + (SHORE - uv.y) * 0.12);
    float dash = smoothstep(0.3, 0.7, noise(vec2(p.x * 3.0, uv.y * 400.0 + 8.0 * noise(vec2(p.x * 1.3, 4.0)) - uTime)));
    vec3 lrefl = lake > 0.01 ? town(ruv, a, 0.4) * dash : vec3(0.0);
    // Rain on the water: a prickle far out, rings that open and fade nearer in.
    float dimple = smoothstep(0.965, 1.0, noise(vec2(p.x * 220.0, uv.y * 600.0) + floor(uTime * 8.0) * vec2(3.1, 7.7)));
    float near = smoothstep(SHORE - 0.02, NEAR_SHORE, uv.y);
    vec2 rg = vec2(p.x, uv.y * 3.4) / mix(0.006, 0.014, near);
    vec2 rid = floor(rg);
    vec3 rr = h31(rid.x * 17.3 + rid.y * 241.7);
    float rage = fract(uTime * (0.7 + 0.5 * rr.z) + rr.x * 9.0);
    float ring = smoothstep(0.10, 0.0, abs(length(fract(rg) - 0.5 - (rr.xy - 0.5) * 0.4) - rage * 0.42)) * (1.0 - rage) * step(rr.y, 0.55);
    // Wavelets coming in: thin crests that brighten as they near the sand.
    float crest = 0.0;
    for (int k = 0; k < 2; k++) {
      float ph = fract(uTime * 0.21 + float(k) * 0.5 + 0.25 * noise(vec2(p.x * 2.5, float(k) * 7.0)));
      float yk = edge + 0.015 * (1.0 - ph);
      crest += smoothstep(0.0022, 0.0, abs(uv.y - yk)) * ph * 1.6 * (0.4 + 0.6 * noise(vec2(p.x * 40.0 + float(k) * 9.0, uTime * 0.3)));
    }
    vec3 lakeCol = vec3(0.039, 0.046, 0.062) * (0.70 + 0.45 * rip * smoothstep(SHORE, NEAR_SHORE, uv.y) + 0.5 * smoothstep(SHORE - 0.03, SHORE, uv.y)) + uAmb * ${vec3(FLASH.lake)} * nearStrike * (0.6 + 0.4 * rip) + vec3(0.62, 0.56, 0.42) * path * 0.46
                 + lrefl * 0.6 + vec3(0.05, 0.05, 0.055) * (dimple * 0.7 + ring * 3.0 * near) * uRain
                 + (vec3(0.050, 0.052, 0.058) + moonLit * vec3(0.02) + uAmb * vec3(0.12, 0.12, 0.14)) * crest;
    col = mix(col, lakeCol, lake);
  }
  // Our own shore: smooth wet sand, darker and glossier where the water has just been.
  if (uv.y < edge + soft) {
    float beach = smoothstep(edge + soft, edge - soft, uv.y);
    float light = reach(p);
    vec2 dp = p - uPit;
    float wetBand = smoothstep(shoreLine + 0.004, shoreLine - 0.002, uv.y) * smoothstep(edge - 0.016, edge, uv.y);
    vec3 lawn = vec3(0.007, 0.010, 0.006) * (0.7 + 0.6 * noise(p * vec2(60.0, 25.0))) + vec3(0.018, 0.02, 0.009) * light + uAmb * vec3(0.012, 0.016, 0.018);
    vec3 sand = lawn;
    if (uv.y > RAIL_BOTTOM - 0.006) {
    float drift = 0.86 + 0.14 * fbm(p * vec2(5.0, 30.0), 3) + 0.10 * (noise(p * vec2(700.0, 1500.0)) - 0.5);
    // Night sand is dark; what shows of it is what each light reaches: a pool under every bulb, the embers' circle, the window.
    vec3 pools = mix(bulbLight(vec2(p.x, RAIL_TOP + 0.012)), vec3(dot(bulbLight(vec2(p.x, RAIL_TOP + 0.012)), vec3(0.33))), 0.45) * vec3(0.9, 0.85, 0.8) * (0.15 * exp(-(uv.y - RAIL_TOP) * 55.0) + 0.025 * exp(-(uv.y - RAIL_TOP) * 16.0));
    sand = vec3(0.020, 0.020, 0.022) * drift + vec3(0.030, 0.024, 0.018) * light * smoothstep(NEAR_SHORE + 0.02, RAIL_TOP - 0.02, uv.y) + moonLit * vec3(0.012) + uAmb * vec3(0.050, 0.050, 0.060) * drift;
    // All of it is wet tonight: a dull shine of sky, and the rail's lights lying on it near the porch.
    sand += (vec3(0.010, 0.010, 0.011) * (0.5 + moonLit) + uAmb * vec3(0.05, 0.05, 0.06)) * (0.5 + 0.5 * fbm(p * vec2(9.0, 60.0), 2));
    sand += pools * drift * (0.6 + 0.4 * noise(vec2(p.x * 220.0, uv.y * 30.0)));
    sand *= 1.0 - 0.35 * wetBand;
    sand *= 1.0 - 0.30 * step(0.90, noise(p * vec2(1100.0, 3200.0) + floor(uTime * 9.0) * vec2(7.3, 3.1))) * uRain;
    sand += (moonLit * vec3(0.02, 0.021, 0.024) + uAmb * vec3(0.10, 0.10, 0.12)) * wetBand * (0.6 + 0.4 * noise(vec2(p.x * 50.0, uTime * 0.4)));
    // The embers on the sand, and their long reflection toward us in the wet.
    sand += (vec3(0.36, 0.14, 0.04) * exp(-length(dp * vec2(1.0, 2.6)) * 13.0) + vec3(0.07, 0.026, 0.008) * exp(-length(dp * vec2(1.0, 2.6)) * 4.5) * drift) * uEmber;
    sand += vec3(0.30, 0.11, 0.03) * exp(-pow(dp.x / 0.028, 2.0)) * smoothstep(0.004, -0.006, dp.y) * smoothstep(-0.034, -0.008, dp.y) * uEmber * (0.6 + 0.4 * noise(vec2(p.x * 160.0, uv.y * 40.0)));
    // Below the beach the cabin's rough lawn begins; the rail hides the seam.
    sand = mix(lawn, sand, smoothstep(RAIL_BOTTOM - 0.006, RAIL_BOTTOM + 0.010, uv.y));
    }
    col = mix(col, sand, beach);
    float foam = smoothstep(0.0026, 0.0, abs(uv.y - edge)) * (0.35 + 0.65 * noise(vec2(p.x * 60.0 + uTime * 0.8, 0.0))) * (0.6 + 0.8 * max(0.0, cos(uTime * 0.9 + p.x * 5.0)));
    col += (vec3(0.105, 0.105, 0.110) + moonLit * vec3(0.02) + uAmb * vec3(0.14, 0.14, 0.16)) * foam;
  }
  }
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

export const BOULDER_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
attribute vec4 aRock;
attribute vec2 aSeed;
varying vec2 vQ, vP, vSeed;
void main() { vQ = position.xy * 1.35; vP = aRock.xy + vQ * aRock.zw; vSeed = aSeed; gl_Position = clip(vP); }
`;
// Granite as it sits around Big Bear: big rounded blocks, jointed, pale where light finds them.
export const BOULDER_FRAG = /* glsl */ `
${COMMON}
varying vec2 vQ, vP, vSeed;
void main() {
  vec2 q = vQ;
  float s = vSeed.x;
  float lump = (noise(vP * 55.0 + s * 10.0) - 0.5) * 0.07 + (noise(q * 1.6 + s * 3.0) - 0.5) * 0.26;
  // Blocky, not egg-shaped: flat-sided with rounded shoulders, sunk a little into the sand.
  // No two alike: some squarer, some leaning, some with a shoulder higher than the other.
  float square = 2.1 + 1.6 * fract(s * 0.37);
  q.x += q.y * (fract(s * 0.71) - 0.5) * 0.5;
  q.y -= q.x * (fract(s * 0.53) - 0.5) * 0.35;
  vec2 aq = abs(q * vec2(1.0, q.y > 0.0 ? 1.0 : 1.7));
  float d = pow(pow(aq.x, square) + pow(aq.y, square), 1.0 / square) + lump;
  float px = fwidth(d) * 0.75;
  float body = smoothstep(1.0 + px, 1.0 - px, d) * smoothstep(-0.60, -0.54, vQ.y);
  float shadow = smoothstep(1.35, 0.4, length((vQ - vec2(0.0, -0.56)) * vec2(0.70, 3.2))) * 0.9;
  // Two joints split it into blocks; each block tilts its own way.
  float j1 = dot(q, normalize(vec2(0.9, 0.35 + 0.5 * sin(s)))) - 0.18 * sin(s * 3.0) + (noise(q * 2.5 + s) - 0.5) * 0.14;
  float j2 = dot(q, normalize(vec2(-0.25, 1.0))) + 0.22 * cos(s * 2.0) + (noise(q * 2.5 + s + 4.0) - 0.5) * 0.14;
  float split = step(0.0, j1 * sin(s * 5.0));
  float crack = max(smoothstep(0.03, 0.0, abs(j1)) * (0.5 + 0.5 * noise(q * 5.0 + s)), smoothstep(0.03, 0.0, abs(j2)) * split * (0.5 + 0.5 * noise(q * 5.0 - s))) + 0.25 * smoothstep(0.02, 0.0, abs(noise(vP * vec2(45.0, 30.0) + s * 3.0) - 0.5));
  vec3 n = vec3(q.x * 0.8, q.y * 0.9 + 0.25, sqrt(max(0.04, 1.0 - d * d)));
  n.xy += vec2(sign(j1) * 0.30, sign(j2) * 0.22 * split) + (vec2(noise(vP * 120.0), noise(vP * 120.0 + 9.0)) - 0.5) * 0.30;
  n = normalize(n);
  float speck = 0.78 + 0.30 * noise(vP * 420.0) + 0.12 * noise(vP * 90.0 + s);
  float runs = 1.0 - 0.10 * smoothstep(0.45, 0.8, noise(vec2(vP.x * 40.0 + s, vP.y * 25.0)));
  vec3 albedo = vec3(1.0, 0.97, 0.93) * speck * runs * (1.0 - min(1.0, crack) * 0.6) * mix(0.16, 1.0, smoothstep(-0.6, 0.05, vQ.y));
  vec2 toPit = uPit - vP;
  vec3 light = vec3(0.042, 0.046, 0.058) * (0.5 + uMoonLit) * max(0.0, n.y * 0.9 + 0.25)
    + vec3(0.070, 0.054, 0.038) * (0.20 + reach(vP)) * max(0.0, n.z * 0.5 + n.y * 0.6)
    + bulbLight(vec2(vP.x, RAIL_TOP + 0.012)) * exp(-(vP.y - RAIL_TOP) * 30.0) * 0.5 * max(0.0, n.z - n.y * 0.4)
    + vec3(0.55, 0.21, 0.06) * uEmber * exp(-length(toPit) * 5.5) * max(0.0, dot(n, normalize(vec3(toPit, 0.06))))
    + uAmb * vec3(0.20, 0.21, 0.26) * max(0.15, n.y * 0.7 + n.z * 0.4);
  vec3 col = albedo * light * vSeed.y * 0.8;
  col += pow(max(0.0, dot(n, normalize(vec3(-0.25, 0.75, 0.6)))), 22.0) * (vec3(0.014, 0.015, 0.018) * uMoonLit + uAmb * vec3(0.10, 0.10, 0.13));
  gl_FragColor = vec4(col * body, body + shadow * (1.0 - body));
}
`;

export const PIT_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
uniform vec4 uBox;
varying vec2 vP;
void main() { vP = uBox.xy + position.xy * uBox.zw; gl_Position = clip(vP); }
`;
// A ring of stones somebody left, the fire long burned down: coals under ash, glowing in the
// cracks and breathing with the wind. Embers only.
export const PIT_FRAG = /* glsl */ `
${COMMON}
varying vec2 vP;
const float RX = 0.043, RY = 0.0072;
vec4 stone(vec2 d, float i, float front) {
  vec3 h = h31(i * 5.3 + 2.0);
  float ang = (i + 0.5 + (h.z - 0.5) * 0.35) / 11.0 * 2.0 * PI + 0.2;
  vec2 c = vec2(cos(ang) * RX, sin(ang) * RY + 0.0022) * (0.96 + 0.1 * h.y);
  if ((sin(ang) < 0.0) != (front > 0.5)) return vec4(0.0);
  // Each stone stands on the ring, a hand high.
  vec2 q = (d - c - vec2(0.0, 0.0035)) / (vec2(0.0092, 0.0096) * (0.55 + 0.85 * h.x * h.x) * vec2(1.0 + 0.3 * h.y, 0.7 + 0.5 * h.z));
  float dd = length(q * vec2(1.0, q.y > 0.0 ? 1.0 : 1.5)) + (noise(vP * 240.0 + i) - 0.5) * 0.28;
  float px = fwidth(dd);
  float inside = smoothstep(1.0 + px, 1.0 - px, dd);
  if (inside <= 0.0) return vec4(0.0);
  vec3 n = normalize(vec3(q.x, q.y + 0.2, sqrt(max(0.05, 1.0 - dd * dd))) + vec3((noise(vP * 300.0 + i) - 0.5) * 0.25));
  // Stones at the back show us their lit inner faces; those in front only a lit top edge.
  vec3 L = front > 0.5 ? normalize(vec3(-cos(ang) * 0.4, 1.0, -0.25)) : normalize(vec3(-cos(ang) * 0.6, -0.5, 0.7));
  vec3 col = vec3(0.50, 0.18, 0.045) * uEmber * pow(max(0.0, dot(n, L)), 1.5) * (front > 0.5 ? 0.7 : 1.0)
    + vec3(0.050, 0.042, 0.034) * (0.3 + reach(vP)) * max(0.0, n.z * 0.7 + n.y * 0.4)
    + vec3(0.030, 0.032, 0.040) * (0.5 + uMoonLit) * max(0.0, n.y)
    + uAmb * vec3(0.16, 0.17, 0.21) * max(0.1, n.y * 0.7 + n.z * 0.4);
  // Grey speckled cobbles, wet on top.
  col *= (0.80 + 0.30 * noise(vP * 900.0 + i * 3.0)) * (0.8 + 0.4 * h.y);
  col += pow(max(0.0, n.y), 6.0) * (vec3(0.010, 0.011, 0.013) * (0.5 + uMoonLit) + uAmb * vec3(0.06));
  return vec4(col * inside, inside);
}
void main() {
  vec2 d = vP - uPit;
  // The ring's own shadow on the sand.
  vec4 acc = vec4(0.0, 0.0, 0.0, 0.85 * smoothstep(1.5, 0.85, length((d + vec2(0.0, 0.0015)) / vec2(RX, RY))));
  for (int i = 0; i < 11; i++) { vec4 s = stone(d, float(i), 0.0); acc = s + acc * (1.0 - s.a); }
  vec2 cq = d / vec2(RX, RY);
  float e = length(cq);
  float bowl = smoothstep(0.95, 0.80, length((d - vec2(0.0, 0.0030)) / vec2(RX, RY)));
  float cells = noise(cq * vec2(9.0, 5.0) + 3.0), cracks = noise(cq * vec2(24.0, 13.0) + vec2(uTime * 0.06, 0.0));
  float breathe = 0.55 + 0.45 * noise(cq * 2.5 + vec2(uTime * 0.5, uTime * 0.23)) + 0.25 * abs(uGust);
  float hot = smoothstep(0.50, 0.90, cells * 0.6 + cracks * 0.5) * breathe * (1.0 - e * e * 0.55);
  vec3 coal = vec3(0.014, 0.011, 0.010) + vec3(1.0, 0.34, 0.06) * hot * uEmber * 2.5 + vec3(1.0, 0.72, 0.28) * pow(hot, 4.0) * uEmber * 0.5;
  acc = vec4(coal * bowl, bowl) + acc * (1.0 - bowl);
  for (int i = 0; i < 11; i++) { vec4 s = stone(d, float(i), 1.0); acc = s + acc * (1.0 - s.a); }
  gl_FragColor = acc;
}
`;

// Smoke off the embers: thin, beaten down by the rain, bent over by a gust a moment after
// the trees feel it.
export const SMOKE_FRAG = /* glsl */ `
${COMMON}
varying vec2 vP;
void main() {
  float h = vP.y - uPit.y - 0.003;
  if (h <= 0.0 || h > 0.17) discard;
  // One strand, a chair's height before the rain has it. It leaves the coals upright, snakes
  // as it climbs, and is laid over by the wind that blew a moment ago, further the higher it is.
  float k = h / 0.11;
  float lean = uSmoke * (h * 0.4 + h * h * 17.0);
  float snake = sin(h * 70.0 - uTime * 2.3) * 0.0030 * smoothstep(0.0, 0.03, h) + sin(h * 26.0 - uTime * 1.2 + 1.3) * 0.009 * k + sin(h * 11.0 - uTime * 0.5) * 0.010 * k * k;
  float cx = uPit.x + lean + snake + (fbm(vec2(h * 16.0 - uTime * 0.7, 3.0), 2) - 0.5) * 0.15 * k;
  float w = 0.0022 + 0.0075 * k + 0.024 * k * k + 0.012 * abs(uSmoke) * k;
  float x = (vP.x - cx) / w;
  // The air tears it: thick here, gone there, and a thinner strand twines round the first.
  vec2 tp = vec2(x * 1.2, h * 55.0 - uTime * 1.6);
  float torn = smoothstep(0.25, 0.70, fbm(tp + vec2(fbm(tp * 0.5, 2) * 2.0, 0.0), 3));
  float twin = (vP.x - cx - sin(h * 45.0 - uTime * 1.7) * 0.007 * k) / (w * 0.55);
  float strand = exp(-x * x) * (0.12 + 0.88 * torn) * mix(1.0, smoothstep(0.30, 0.62, noise(vec2(h * 30.0 - uTime * 1.1, 7.0))), smoothstep(0.2, 0.8, k)) + 0.6 * exp(-twin * twin) * torn;
  float fade = smoothstep(0.0, 0.006, h) * exp(-k * 1.5) * smoothstep(1.5, 1.0, k);
  float alpha = clamp(strand * fade * 1.5 * (0.5 + 0.5 * uRain) * (0.4 + 0.6 * uEmber), 0.0, 0.6);
  if (alpha < 0.004) discard;
  vec3 smokeCol = vec3(0.046, 0.046, 0.052) + uMoonLit * vec3(0.012, 0.014, 0.019) + uAmb * vec3(0.035, 0.038, 0.050)
    + vec3(0.50, 0.20, 0.06) * uEmber * exp(-h * 42.0);
  gl_FragColor = vec4(smokeCol * alpha, alpha);
}
`;

export const CHAIR_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
attribute vec3 aChair;
varying vec2 vL, vP;
void main() {
  vL = vec2(mix(-0.036, 0.074, position.x * 0.5 + 0.5), mix(-0.005, 0.108, position.y * 0.5 + 0.5));
  vP = aChair.xy + vec2(vL.x * aChair.z, vL.y) * 1.15;
  gl_Position = clip(vP);
}
`;
// An Adirondack chair seen from the side: a tall raked back, a seat that slopes down to it,
// a broad flat arm on a front post. The pit is on its +x side.
export const CHAIR_FRAG = /* glsl */ `
${COMMON}
varying vec2 vL, vP;
// The chair is drawn a little turned toward us: DEPTH is the step from its near side to its far side.
const vec2 DEPTH = vec2(0.0125, 0.0064);
float plank(vec2 p, vec2 a, vec2 b, float th) {
  vec2 d = normalize(b - a), q = p - (a + b) * 0.5;
  vec2 e = abs(vec2(dot(q, d), dot(q, vec2(-d.y, d.x)))) - vec2(length(b - a) * 0.5, th);
  return min(max(e.x, e.y), 0.0) + length(max(e, 0.0)) - 0.0005;
}
// Where p lies on the sheet spanned by a->b and DEPTH * w: x along, y across, both 0..1 inside.
vec2 sheet(vec2 p, vec2 a, vec2 b, float w) {
  vec2 e = b - a, d = DEPTH * w, q = p - a;
  float det = e.x * d.y - e.y * d.x;
  return vec2((q.x * d.y - q.y * d.x) / det, (e.x * q.y - e.y * q.x) / det);
}
float inside(vec2 st, vec2 px) { vec2 m = smoothstep(vec2(0.0) - px, vec2(0.0) + px, st) * smoothstep(vec2(1.0) + px, vec2(1.0) - px, st); return m.x * m.y; }
void over(inout vec4 acc, vec3 col, float a) { acc = vec4(mix(acc.rgb, col, a), max(acc.a, a)); }
void main() {
  vec2 l = vL;
  float px = 0.8 / uRes.y / 1.15;
  float grain = noise(vec2(l.x * 90.0 + l.y * 260.0, l.y * 40.0 - l.x * 120.0));
  float glow = exp(-length(vP - uPit) * 8.0) * uEmber, lamp = reach(vP);
  vec3 wood = vec3(0.026, 0.020, 0.015) * (0.55 + 0.75 * grain) * (0.8 + 0.4 * noise(vec2(l.x * 700.0 + l.y * 1900.0, l.y * 300.0)));
  vec3 ember = vec3(0.13, 0.062, 0.030) * glow, sky = uMoonLit * vec3(0.014, 0.016, 0.021) + uAmb * vec3(0.15, 0.15, 0.19);
  // Lit from below by the string of bulbs, on the side toward the rail.
  vec3 bulbs = bulbLight(vec2(vP.x, RAIL_TOP + 0.01)) * exp(-(vP.y - RAIL_TOP) * 22.0) * 0.5;
  wood += wood * bulbs * 14.0;
  vec3 dim = wood * (0.55 + 1.5 * lamp) + ember * 0.25 + sky * 0.3;
  vec4 acc = vec4(0.0);
  // Where it stands on the wet sand.
  acc.a = 0.85 * smoothstep(1.0, 0.1, length((l - vec2(0.026, 0.0030)) / vec2(0.050, 0.0090)));
  // Far legs and far arm.
  float legs = min(plank(l - DEPTH, vec2(0.0460, 0.0), vec2(0.0460, 0.0570), 0.0026), plank(l - DEPTH, vec2(-0.0080, 0.0), vec2(0.0030, 0.0330), 0.0024));
  over(acc, dim * 0.8, smoothstep(px, -px, legs));
  // The fan back: five tall slats, rounded across the top, leaning away from the pit.
  vec2 bs = sheet(l, vec2(0.0005, 0.0290), vec2(-0.0200, 0.0930), 1.0);
  float crown = 1.0 - 0.13 * pow(abs(bs.y * 2.0 - 1.0), 2.0);
  float slat = smoothstep(0.50, 0.40, abs(fract(bs.y * 5.0) - 0.5) * 1.12);
  float backMask = inside(vec2(bs.x / crown, bs.y), vec2(px / 0.066, px / 0.014)) * slat;
  vec3 backCol = wood * (0.9 + 1.8 * lamp) + ember * (0.40 + 0.4 * bs.x) + sky * 0.45;
  backCol *= 0.82 + 0.18 * smoothstep(0.0, 0.5, fract(bs.y * 5.0));
  over(acc, backCol, backMask);
  // The seat, sloping down to the back, slatted across.
  vec2 ss = sheet(l, vec2(-0.0020, 0.0320), vec2(0.0440, 0.0400), 1.0);
  float seatMask = inside(ss, vec2(px / 0.046, px / 0.014)) * smoothstep(0.50, 0.42, abs(fract(ss.x * 6.0) - 0.5) * 1.1);
  over(acc, wood * (1.0 + 2.0 * lamp) + ember * 0.55 + sky * 1.0, seatMask);
  float apron = plank(l, vec2(-0.0020, 0.0305), vec2(0.0440, 0.0385), 0.0016);
  over(acc, dim, smoothstep(px, -px, apron));
  // The far arm, then the near legs, then the near arm: broad, flat, wet on top.
  vec2 fa = sheet(l - DEPTH * 0.74, vec2(-0.0150, 0.0590), vec2(0.0560, 0.0590), 0.30);
  over(acc, wood * (1.0 + 2.0 * lamp) + ember * 0.5 + sky * 1.4, inside(fa, vec2(px / 0.071, px / 0.0042)));
  legs = min(plank(l, vec2(0.0460, 0.0), vec2(0.0460, 0.0570), 0.0028), plank(l, vec2(-0.0080, 0.0), vec2(0.0030, 0.0330), 0.0026));
  float rim = smoothstep(0.0020, 0.0, -legs) ;
  over(acc, dim + ember * 0.2 * smoothstep(0.0, 0.0022, plank(l + vec2(0.002, 0.0), vec2(0.0460, 0.0), vec2(0.0460, 0.0570), 0.0028)) * rim, smoothstep(px, -px, legs));
  vec2 na = sheet(l, vec2(-0.0150, 0.0590), vec2(0.0560, 0.0590), 0.30);
  float armTop = inside(na, vec2(px / 0.071, px / 0.0042));
  over(acc, wood * (1.0 + 2.0 * lamp) + ember * (0.35 + 0.5 * na.x) + sky * (1.2 + 0.8 * noise(vec2(l.x * 300.0, uTime * 3.0))), armTop);
  float edge = plank(l, vec2(-0.0150, 0.0578), vec2(0.0560, 0.0578), 0.0012);
  over(acc, dim * 0.9, smoothstep(px, -px, edge));
  if (acc.a <= 0.0) discard;
  // Darker toward the wet sand they stand in.
  acc.rgb *= mix(0.5, 1.0, smoothstep(0.0, 0.022, l.y));
  gl_FragColor = vec4(acc.rgb * acc.a, acc.a);
}
`;

export const TRUNK_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
${SWAY}
attribute vec4 aTree;
attribute float aCrown;
varying vec2 vP;
varying vec4 vTree;
varying float vCrown;
void main() { vP = position.xy; vP.x += sway(aTree.x, aTree.z); vTree = aTree; vCrown = aCrown; gl_Position = clip(vP); }
`;
// Jeffrey pine bark: long plates split by dark furrows, wet and a little glossy tonight.
export const TRUNK_FRAG = /* glsl */ `
${COMMON}
varying vec2 vP;
varying vec4 vTree;
varying float vCrown;
void main() {
  float u = vTree.y, seed = vTree.z, shade = vTree.w;
  float curve = sqrt(max(0.0, 1.0 - u * u));
  vec2 bp = vec2(u * 2.2 + seed, vP.y * 16.0 + seed * 3.0);
  float furrow = smoothstep(0.42, 0.56, abs(fbm(bp + vec2(fbm(bp * vec2(1.0, 0.3), 2) * 1.5, 0.0), 3) - 0.5) * 2.0 + 0.25);
  // Cross cracks break the long ridges into plates.
  furrow *= smoothstep(0.04, 0.14, abs(noise(vec2(u * 1.6 + seed, vP.y * 58.0 + 2.0 * noise(vec2(u * 5.0, vP.y * 9.0)))) - 0.5));
  float plate = 0.75 + 0.25 * noise(vec2(u * 9.0 + seed, vP.y * 120.0)) ;
  vec3 bark = mix(vec3(0.007, 0.005, 0.004), vec3(0.021, 0.015, 0.012) * plate, furrow) ;
  float light = reach(vP) * smoothstep(-1.0, 0.3, u * (vP.x / uAspect < 0.5 ? 1.0 : -1.0)) ;
  // Wet bark shines down the side the sky lights.
  float sheen = smoothstep(0.25, 0.75, u * (vP.x / uAspect < 0.5 ? 1.0 : -1.0) * 0.5 + 0.5) * (0.4 + 0.6 * plate) * furrow;
  vec3 col = bark * (0.45 + 2.2 * light + 0.5 * uMoonLit * curve) * curve + vec3(0.010, 0.011, 0.013) * sheen * (0.5 + uMoonLit)
    + bark * bulbLight(vP) * 1.2
    + uAmb * vec3(0.045, 0.045, 0.058) * (0.6 + 0.4 * furrow) * curve
    + pow(curve, 6.0) * furrow * (vec3(0.010, 0.008, 0.006) * light * 4.0 + uAmb * vec3(0.015));
  // Up in the crown the trunk is in the boughs' shadow and takes their colour.
  col = mix(col, vec3(0.008, 0.011, 0.009) + uAmb * vec3(0.030, 0.036, 0.048), vCrown) * shade;
  float a = smoothstep(1.0, 0.9, abs(u));
  gl_FragColor = vec4(col * a, a);
}
`;

export const BOUGH_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
${SWAY}
attribute vec4 aRoot, aShape, aLook;
varying vec2 vUv, vP;
varying vec3 vLook;
void main() {
  vec2 l = vec2(position.x * 0.5 + 0.5, position.y * 0.5);
  float seed = aLook.x, len = aShape.x;
  // Each bough has its own tremble, and all of them lift and stream when a gust arrives.
  float flutter = (sin(uTime * (2.2 + seed * 1.7) + seed * 40.0) * 0.6 + sin(uTime * 6.1 + seed * 17.0) * 0.4) * (0.012 + 0.07 * abs(uGust)) * uSway * 0.6;
  float ang = aShape.y + flutter + uGust * 0.22 * sin(aShape.y) - uGust * 0.08 * cos(aShape.y);
  vec2 dir = vec2(cos(ang), sin(ang)), nor = vec2(-dir.y, dir.x) * aLook.y;
  vec2 p = aRoot.xy + (dir * (l.x * 1.04 - 0.02) + nor * l.y * 0.5) * len;
  p.x += sway(aRoot.z, aRoot.w) + uGust * 0.026 * l.x * l.x * (len / 0.2);
  p.y += sin(uTime * 5.0 + seed * 30.0) * 0.004 * abs(uGust) * l.x * l.x;
  float v = aShape.z;
  vUv = (vec2(mod(v, 2.0), floor(v / 2.0)) + vec2(l.x, l.y + 0.5) * 0.98 + 0.01) / vec2(2.0, 4.0);
  vP = p; vLook = vec3(aRoot.z, aShape.w, aLook.z);
  gl_Position = clip(p);
}
`;
export const BOUGH_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uAtlas;
varying vec2 vUv, vP;
varying vec3 vLook;
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  tex.a = min(1.0, tex.a * 1.7);
  if (tex.a < 0.03) discard;
  float t = vLook.x, shade = vLook.y, lit = vLook.z;
  float x01 = vP.x / uAspect;
  // Needles catch the window's light on the side of the tree that faces the cabin.
  float warm = smoothstep(0.30, 0.0, abs(x01 - (x01 < 0.5 ? 0.20 : 0.82))) * (0.3 + 0.7 * (1.0 - t));
  vec3 col = vec3(0.011, 0.0145, 0.012) * (0.45 + 1.3 * tex.r)
    + vec3(0.040, 0.044, 0.030) * warm * tex.r * tex.r * lit
    + bulbLight(vP) * vec3(0.5, 0.45, 0.3) * tex.r * 0.6
    + uMoonLit * vec3(0.010, 0.014, 0.018) * tex.r * tex.r
    + uAmb * vec3(0.045, 0.055, 0.075) * (0.25 + tex.r + 1.6 * tex.r * tex.r);
  col = mix(vec3(0.020, 0.023, 0.032) + uAmb * vec3(0.05, 0.055, 0.075), col, shade);
  gl_FragColor = vec4(col * tex.a, tex.a);
}
`;

export const GRASS_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
attribute vec4 aBlade, aLook;
varying vec2 vP;
varying vec3 vBlade;
varying float vBend;
void main() {
  float h = position.y, seed = aBlade.w;
  // Every blade bows downwind in a gust and shivers on its own.
  float bend = aLook.y + uGust * 2.0 + sin(uTime * 3.0 + aBlade.x * 20.0 + seed * 6.0) * 0.22 * (0.3 + abs(uGust)) + sin(aBlade.x * 6.0 - uTime * 3.2 * sign(uGust + 0.001) + aLook.w) * 0.55 * abs(uGust) + sin(uTime * 7.0 + seed * 31.0) * 0.08 * abs(uGust);
  bend = clamp(bend, -1.5, 1.5);
  vBend = bend;
  float b = abs(bend) < 0.002 ? 0.002 : bend, ang = b * h;
  vec2 along = vec2((1.0 - cos(ang)) / b, sin(ang) / b) * aBlade.z;
  vec2 nor = vec2(cos(ang), -sin(ang));
  vP = aBlade.xy + along + nor * position.x * aLook.x * (1.0 - h * 0.9);
  vBlade = vec3(position.x, h, aLook.z);
  gl_Position = clip(vP);
}
`;
export const GRASS_FRAG = /* glsl */ `
${COMMON}
varying vec2 vP;
varying vec3 vBlade;
varying float vBend;
void main() {
  float h = vBlade.y, a = smoothstep(1.0, 0.35, abs(vBlade.x));
  // Night grass is nearly black. The bulbs overhead reach only the tips nearest the rail.
  float under = smoothstep(RAIL_BOTTOM - 0.075, RAIL_BOTTOM - 0.005, vP.y);
  vec3 col = vec3(0.009, 0.013, 0.010) * (0.25 + 0.75 * h) * vBlade.z
    + vec3(0.024, 0.026, 0.014) * reach(vP) * (0.05 + 0.95 * h * h * h) * vBlade.z
    + bulbLight(vec2(vP.x, RAIL_TOP + 0.004)) * vec3(0.85, 0.72, 0.32) * h * h * h * under * vBlade.z
    + uAmb * vec3(0.07, 0.085, 0.10) * (0.15 + h * h)
    + uMoonLit * vec3(0.004, 0.006, 0.006) * h;
  // One side of a wet blade shines a little.
  col *= 1.0 + 0.5 * smoothstep(0.2, 0.8, vBlade.x) * h;
  // Bent over, a blade shows its paler back.
  col *= 1.0 + 0.35 * smoothstep(0.5, 1.4, abs(vBend)) * h;
  gl_FragColor = vec4(col * a, a);
}
`;

export const RAIL_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
varying vec2 vP;
void main() { vP = vec2((position.x * 0.5 + 0.5) * uAspect, (position.y * 0.5 + 0.5) * (RAIL_TOP + 0.05)); gl_Position = clip(vP); }
`;
// The porch rail: a wet cap whose top we look slightly down on, square balusters, a post
// every third of the way across, the wire of the lights strung between the posts.
export const RAIL_FRAG = /* glsl */ `
${COMMON}
varying vec2 vP;
const float POST_W = 0.016, POST_TOP = RAIL_TOP + 0.040, BAL_W = 0.0055, TOP_FACE = 0.0058;
void main() {
  vec2 p = vP;
  float x01 = p.x / uAspect, px = 0.8 / uRes.y;
  float postX = (fract((x01 - POST_AT) * 3.0 + 0.5) - 0.5) / 3.0 * uAspect;
  float capW = POST_W + 0.0028 * step(POST_TOP - 0.0045, p.y);
  float post = smoothstep(capW + px, capW - px, abs(postX)) * smoothstep(POST_TOP + px, POST_TOP - px, p.y);
  float rail = smoothstep(RAIL_TOP + px, RAIL_TOP - px, p.y) * smoothstep(RAIL_BOTTOM - px, RAIL_BOTTOM + px, p.y);
  float balX = (fract(p.x / 0.05) - 0.5) * 0.05;
  float bal = smoothstep(BAL_W + px, BAL_W - px, abs(balX)) * step(p.y, RAIL_BOTTOM);
  vec3 lamp = vec3(0.10, 0.065, 0.035) * (0.05 + 0.24 * exp(-pow((x01 - 0.5) * 1.3, 2.0)));
  vec3 light = lamp + vec3(0.12, 0.05, 0.015) * pitLight(p) + uAmb * vec3(0.075, 0.075, 0.095);
  vec3 bulbs = p.y > RAIL_BOTTOM - 0.07 ? bulbLight(p) * smoothstep(RAIL_BOTTOM - 0.07, RAIL_BOTTOM - 0.02, p.y) : vec3(0.0);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (bal > 0.0) {
    float side = balX / BAL_W;
    float grain = 0.7 + 0.45 * noise(vec2(p.x * 700.0, p.y * 14.0)) * (0.6 + 0.4 * noise(vec2(p.x * 90.0, p.y * 60.0)));
    float under = 1.0 - 0.6 * smoothstep(RAIL_BOTTOM - 0.035, RAIL_BOTTOM, p.y);
    vec3 c = (light * 0.85 + vec3(0.004)) * grain * under * (0.50 + 0.50 * (1.0 - side * side));
    // Square stock seen a little from one side: a lit face and a narrower shaded one.
    c *= mix(0.55, 1.0, smoothstep(-0.50, -0.38, side)) * (1.0 + 0.5 * smoothstep(0.06, 0.0, abs(side + 0.36)));
    c *= 0.75 + 0.5 * smoothstep(0.3, 0.7, noise(vec2(p.x * 1100.0, p.y * 9.0)));
    // A thin run of water down one edge of each.
    float run = smoothstep(0.22, 0.0, abs(side - 0.45 - 0.2 * sin(p.y * 70.0 + floor(p.x / 0.05)))) * smoothstep(0.35, 0.75, noise(vec2(floor(p.x / 0.05) * 3.1, p.y * 30.0 + uTime * 0.6)));
    c += (light * 0.22 + uAmb * vec3(0.08)) * run * under + bulbs * 0.42 * grain;
    // Its corners are eased, and the one toward the nearest bulb takes a line of light.
    c += bulbs * 0.5 * smoothstep(0.55, 0.95, abs(side)) * smoothstep(1.0, 0.9, abs(side));
    c += (light * 0.5 + vec3(0.006)) * under * smoothstep(0.20, 0.0, abs(side + 0.5)) * 1.6 * (0.4 + 0.6 * noise(vec2(floor(p.x / 0.05) * 7.0, p.y * 45.0)));
    col = c; alpha = bal;
  }
  if (rail > 0.0) {
    float grain = 0.75 + 0.35 * noise(vec2(p.x * 8.0, p.y * 300.0)) + 0.12 * (noise(vec2(p.x * 40.0, p.y * 900.0)) - 0.5);
    float top = smoothstep(RAIL_TOP - TOP_FACE - px, RAIL_TOP - TOP_FACE + px, p.y);
    float seam = 1.0 - 0.55 * smoothstep(0.0016, 0.0, abs(fract(p.x / 0.62 + 0.37) - 0.5) * 0.62);
    vec3 face = (light * 0.8 + bulbs * 0.75) * (0.55 + 0.9 * (grain - 0.75) * 2.2 + 0.45) * seam * (0.8 + 0.3 * noise(vec2(p.x * 2.1, 9.0)));
    face *= 1.0 - 0.45 * smoothstep(RAIL_BOTTOM + 0.004, RAIL_BOTTOM, p.y);
    face += (light * 0.5 + bulbs * 0.5) * smoothstep(0.0016, 0.0, abs(p.y - (RAIL_TOP - TOP_FACE - 0.0006)));
    // The top is a film of water: it mirrors each bulb as a short streak, the sky as a
    // dull sheen, and every raindrop that lands flickers it.
    float film = 0.6 + 0.4 * noise(vec2(p.x * 400.0, uTime * 5.0 + p.y * 900.0));
    float k0 = floor(p.x / BULB_GAP);
    vec3 mirror = vec3(0.0);
    for (int j = -1; j <= 1; j++) { float k = k0 + float(j); vec2 b = bulbAt(k); mirror += bulbColour(k) * exp(-pow((p.x - b.x) / 0.0060, 2.0)) * exp(-max(0.0, b.y - RAIL_TOP) * 45.0); }
    vec2 pc = vec2(p.x * 260.0, p.y * 520.0); vec3 ph = h31(floor(pc.x) * 3.7 + floor(pc.y) * 91.3 + floor(uTime * 11.0) * 17.1);
    float patter = step(0.975, ph.z) * smoothstep(0.45, 0.1, length(fract(pc) - 0.25 - 0.5 * ph.xy)) * uRain;
    float boards = 0.50 + 0.7 * noise(vec2(p.x * 5.0, p.y * 900.0)) + 0.35 * (noise(vec2(p.x * 45.0, p.y * 2200.0)) - 0.5);
    // Long grain, wandering a little, with the odd darker streak and knot.
    float gy = p.y * 1500.0 + noise(vec2(p.x * 3.0, 1.0)) * 5.0;
    float lines = (0.55 + 0.6 * noise(vec2(p.x * 6.0, gy)) + 0.3 * noise(vec2(p.x * 31.0, gy * 2.3))) * (0.75 + 0.5 * noise(vec2(p.x * 2.3, 4.0)))
      * (1.0 - 0.5 * smoothstep(0.35, 0.0, length(vec2(fract(p.x * 1.7 + 0.3) - 0.5, (p.y - RAIL_TOP + TOP_FACE * 0.5) * 60.0))));
    vec3 wet = light * boards * 0.8 * lines + vec3(0.10, 0.08, 0.06) * (0.5 + 0.5 * film) * (0.25 + 1.6 * reach(p)) * boards * lines
      + mirror * 0.80 * film * (0.55 + 0.45 * boards) * lines + uAmb * vec3(0.20, 0.21, 0.26) * film + uMoonLit * vec3(0.012, 0.013, 0.016) + (light + bulbs + vec3(0.03)) * patter * 0.9;
    col = mix(col, mix(face, wet, top), rail); alpha = max(alpha, rail);
  }
  if (post > 0.0) {
    float side = postX / POST_W;
    float grain = 0.60 + 0.6 * noise(vec2(p.x * 420.0, p.y * 10.0)) * (0.5 + 0.5 * noise(vec2(p.x * 60.0, p.y * 40.0))) - 0.25 * smoothstep(0.75, 0.9, noise(vec2(p.x * 180.0, p.y * 6.0)));
    vec3 c = (light * 0.9 + bulbs * 0.6) * grain * (0.75 + 0.25 * (1.0 - side * side));
    c *= 1.0 - 0.3 * step(side, -0.82) + 0.25 * step(0.86, side);
    c *= 1.0 + 0.35 * step(POST_TOP - 0.0045, p.y);
    col = mix(col, c, post); alpha = max(alpha, post);
  }
  // Drips gather under the cap, swell and let go.
  if (p.y < RAIL_BOTTOM && p.y > RAIL_BOTTOM - 0.06) {
    float cell = floor(p.x / 0.017);
    vec3 h = h31(cell * 9.7 + 3.0);
    float ph = fract(uTime * (0.10 + 0.14 * h.x) + h.y * 5.0);
    float fall = ph > 0.86 ? pow((ph - 0.86) / 0.14, 2.0) * 0.055 : 0.0;
    vec2 dc = vec2((cell + 0.25 + 0.5 * h.z) * 0.017, RAIL_BOTTOM - 0.0010 - fall);
    float r = 0.0013 * smoothstep(0.0, 0.8, ph);
    float drip = smoothstep(r + px, r - px, length((p - dc) * vec2(1.0, 0.75))) * step(h.z, 0.6);
    vec3 dcol = light * 0.9 + bulbs * 0.6 + vec3(0.008) + uAmb * vec3(0.12);
    col = mix(col, dcol, drip); alpha = max(alpha, drip);
  }
  // The wire.
  float wire = smoothstep(0.0011 + px, 0.0011 - px, abs(p.y - wireAt(p.x).y)) * (1.0 - post * step(p.y, POST_TOP - 0.004));
  col = mix(col, vec3(0.006) + bulbs * 0.05, wire); alpha = max(alpha, wire);
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

export const BULB_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
attribute float aBulb;
varying vec2 vL, vAxis;
varying float vK;
void main() {
  float s = bulbSwing(aBulb);
  vAxis = vec2(sin(s), -cos(s)); vK = aBulb;
  vL = position.xy * 0.032;
  gl_Position = clip(bulbAt(aBulb) + vL);
}
`;
// A patio bulb: a small glass globe under a dark socket, its glow, and the raindrop that
// gathers on its underside and falls.
export const BULB_FRAG = /* glsl */ `
${COMMON}
varying vec2 vL, vAxis;
varying float vK;
void main() {
  float along = dot(vL, vAxis), across = dot(vL, vec2(-vAxis.y, vAxis.x));
  float px = 0.8 / uRes.y, d = length(vL);
  float r = length(vec2(across / 0.0041, along / 0.0054));
  float globe = smoothstep(1.0 + px * 220.0, 1.0 - px * 220.0, r);
  float socket = smoothstep(px, -px, max(abs(across) - 0.0019, abs(along + 0.0066) - 0.0022));
  vec3 c = bulbColour(vK);
  vec3 glass = c * (0.62 + 0.38 * (1.0 - r * r)) + vec3(1.0, 0.92, 0.75) * smoothstep(0.55, 0.0, r) * 0.30;
  vec3 halo = c * (exp(-d * 110.0) * 0.20 + exp(-d * 38.0) * 0.045) * smoothstep(0.032, 0.012, d);
  vec3 h = h31(vK * 3.3 + 1.0);
  float ph = fract(uTime * (0.22 + 0.25 * h.x) + h.y * 4.0);
  float fall = ph > 0.88 ? pow((ph - 0.88) / 0.12, 2.0) * 0.030 : 0.0;
  float bead = smoothstep(0.0011 + px, 0.0011 - px, length(vec2(across, (along - 0.0060 - fall) * 0.8))) * smoothstep(0.0, 0.7, ph);
  vec3 rgb = halo * (1.0 - globe) + glass * globe;
  rgb = mix(rgb, vec3(0.012, 0.010, 0.008) + c * 0.05, socket * (1.0 - globe));
  rgb = mix(rgb, c * 0.75 + vec3(0.25), bead * (1.0 - globe));
  gl_FragColor = vec4(rgb, max(max(globe, socket), bead));
}
`;

export const SPLASH_VERT = /* glsl */ `
${COMMON}
${YARD_VERT_PARS}
attribute vec2 aSplash;
varying vec2 vQ, vP;
varying float vA;
void main() {
  // Each emitter is one raindrop after another landing somewhere along the rail's wet top.
  // A drop that lands throws a low crown and three or four droplets, which rise a finger's
  // width, hang, and fall back.
  float e = aSplash.x, j = aSplash.y;
  vec3 h = h31(e * 3.17 + 1.0);
  float period = 0.7 + 1.6 * h.x, cyc = uTime / period + h.y * 7.0;
  float n = floor(cyc), age = fract(cyc) * period;
  vec3 r = h31(e * 7.31 + n * 13.7);
  vec2 hit = vec2(r.x * uAspect, RAIL_TOP - 0.0008 - 0.0042 * r.y);
  // Only on the rail's top, never on a post.
  float live = step(r.z, 0.25 + 0.6 * uRain) * step(0.021, abs((fract((hit.x / uAspect - POST_AT) * 3.0 + 0.5) - 0.5) / 3.0 * uAspect));
  vec2 pos, ax, size;
  if (j < 0.5) {
    float k = age / 0.11;
    pos = hit; ax = vec2(1.0, 0.0);
    size = vec2(0.0008 + 0.0009 * k, 0.0016 + 0.0062 * k);
    vA = live * step(k, 1.0) * (1.0 - k) * 0.7;
  } else {
    vec3 q = h31(e * 1.93 + n * 5.1 + j * 17.3);
    vec2 v = vec2((q.x - 0.5) * 0.11 + uGust * 0.05, 0.075 + 0.075 * q.y) * (0.8 + 0.3 * r.y);
    const float G = 1.5;
    pos = hit + v * age - vec2(0.0, 0.5 * G * age * age);
    vec2 vel = v - vec2(0.0, G * age);
    ax = normalize(vel + vec2(0.0, 1e-4));
    float rad = max(0.00060 + 0.0006 * q.z, 0.7 / uRes.y);
    size = vec2(rad, rad + length(vel) * 0.0022);
    vA = live * step(hit.y - 0.0006, pos.y) * (0.6 + 0.4 * q.z) * (0.35 + 0.65 * smoothstep(-0.12, 0.04, vel.y));
  }
  vQ = position.xy;
  vP = pos + vec2(-ax.y, ax.x) * position.x * size.x + ax * position.y * size.y;
  gl_Position = clip(vP);
}
`;
export const SPLASH_FRAG = /* glsl */ `
${COMMON}
varying vec2 vQ, vP;
varying float vA;
void main() {
  float a = smoothstep(1.0, 0.45, length(vQ)) * vA;
  if (a <= 0.003) discard;
  // Water shows only by the light it catches: the window, the nearest bulbs, the flash.
  vec3 light = vec3(0.085, 0.078, 0.066) * (0.35 + 1.6 * reach(vP)) + bulbLight(vP) * 1.1 + uAmb * vec3(0.14, 0.145, 0.17) + uMoonLit * vec3(0.012);
  gl_FragColor = vec4(min(light * 1.7, vec3(0.20, 0.16, 0.10)) * a, a * 0.3);
}
`;

// Rain falling through the yard, slanted by the wind, seen where light catches it.
export const RAIN_FRAG = /* glsl */ `
${COMMON}
varying vec2 vUv;
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float slant = 0.10 + 0.6 * uGust, acc = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i), sc = 1.0 + fi * 0.75;
    // Near rain is a few long bright streaks; far rain is a fine haze of them.
    float st = noise(vec2((p.x + p.y * (slant + 0.03 * fi - 0.02) + 0.0012 * sin(p.y * 5.0 + fi * 2.0)) * 270.0 * sc * (1.0 + fi * 0.4) + fi * 31.0, p.y * 9.5 * sc + mod(uTime * (22.0 + fi * 7.0), 512.0)));
    acc += smoothstep(0.84 - fi * 0.04, 1.0, st) * (1.0 - fi * 0.3) * 0.5;
  }
  // It comes in sheets that sweep across the yard.
  acc *= 0.55 + 0.9 * fbm(vec2(p.x * 1.6 - uTime * 0.45, p.y * 1.2 + uTime * 0.7), 2);
  float low = exp(-pow((p.y - RAIL_TOP - 0.02) / 0.05, 2.0));
  vec3 light = vec3(0.011, 0.012, 0.014) + vec3(0.16, 0.14, 0.11) * reach(p) + (low > 0.02 ? bulbLight(vec2(p.x, RAIL_TOP + 0.01)) * low * 0.26 : vec3(0.0)) + uAmb * vec3(0.10, 0.105, 0.13);
  gl_FragColor = vec4(light * acc * uRain, 0.0);
}
`;

// What the pane remembers. Red: where the hand wiped the fog off, counting down as it
// returns. Green: the tracks running drops leave, which heal much sooner.
export const FADE_FRAG = /* glsl */ `
uniform vec2 uFade;
void main() { gl_FragColor = vec4(uFade, 0.0, 0.0); }
`;
export const STAMP_VERT = /* glsl */ `
uniform float uAspect;
attribute vec4 aStamp;
varying vec2 vL;
varying float vKind, vSize;
void main() {
  vKind = aStamp.w; vSize = aStamp.z;
  vL = aStamp.w < 0.5 ? vec2(position.x * 0.84 - 0.06, position.y * 0.82 + 0.16) * aStamp.z : position.xy * aStamp.z * 1.6;
  vec2 p = aStamp.xy + vL;
  gl_Position = vec4(p.x / uAspect * 2.0 - 1.0, p.y * 2.0 - 1.0, 0.0, 1.0);
}
`;
export const STAMP_FRAG = /* glsl */ `
varying vec2 vL;
varying float vKind, vSize;
float handCover(vec2 d) {
  vec2 pq = abs(d / vec2(${f(PALM[0])} * (1.0 - ${f(PALM[3])} * clamp(-d.y / ${f(PALM[1])}, 0.0, 1.0)), ${f(PALM[1])}));
  float cover = 1.0 - pow(pow(pq.x, ${f(PALM[2])}) + pow(pq.y, ${f(PALM[2])}), ${f(1 / PALM[2])});
${DIGITS.map(([x, y, rx, ry, lean]) => `  { vec2 q = d - vec2(${f(x)}, ${f(y)}); cover = max(cover, 1.7 - 1.7 * length(vec2(q.x * ${f(Math.cos(lean))} - q.y * ${f(Math.sin(lean))}, q.x * ${f(Math.sin(lean))} + q.y * ${f(Math.cos(lean))}) / vec2(${f(rx)}, ${f(ry)}))); }`).join('\n')}
  return cover;
}
float lines(float x) { float i = floor(x), t = fract(x); t = t * t * (3.0 - 2.0 * t); return mix(fract(sin(i * 127.1) * 43758.5), fract(sin((i + 1.0) * 127.1) * 43758.5), t); }
void main() {
  vec2 d = vL / vSize;
  // Skin does not wipe evenly: it leaves faint lines along the way it travelled, and since
  // each print keeps the best of what was there, they only survive along the stroke.
  float clean = 0.80 + 0.20 * smoothstep(0.25, 0.75, lines(d.y * 34.0) * 0.6 + lines(d.y * 90.0 + 7.0) * 0.4);
  // The edge of the print is ragged, most of all where each line of the stroke ends.
  float edge = handCover(d) + 0.07 * sin(d.x * 17.0 + gl_FragCoord.y * 0.05) * sin(d.y * 13.0 + gl_FragCoord.x * 0.04) + 0.16 * (lines(d.y * 13.0 + 5.0) - 0.5);
  if (vKind < 0.5) gl_FragColor = vec4(smoothstep(-0.36, 0.32, edge) * clean, 0.0, 0.0, 0.0);
  else gl_FragColor = vec4(0.0, smoothstep(1.3, 0.5, length(vL) / vSize), 0.0, 0.0);
}
`;

// Fogged glass is a diffuser. The view is shrunk to a quarter and blurred once across and
// once down, which turns every light into a soft round bloom the mip chain cannot give.
export const SHRINK_FRAG = /* glsl */ `
uniform sampler2D uSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(textureLod(uSrc, vUv, 2.0).rgb, 1.0); }
`;
export const BLUR_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(uSrc, vUv).rgb * 0.2042;
  sum += (texture2D(uSrc, vUv + uStep).rgb + texture2D(uSrc, vUv - uStep).rgb) * 0.1802;
  sum += (texture2D(uSrc, vUv + uStep * 2.0).rgb + texture2D(uSrc, vUv - uStep * 2.0).rgb) * 0.1238;
  sum += (texture2D(uSrc, vUv + uStep * 3.0).rgb + texture2D(uSrc, vUv - uStep * 3.0).rgb) * 0.0663;
  sum += (texture2D(uSrc, vUv + uStep * 4.0).rgb + texture2D(uSrc, vUv - uStep * 4.0).rgb) * 0.0276;
  gl_FragColor = vec4(sum, 1.0);
}
`;

// The last thing light passes on its way to you: vignette, the display curve, a little dither.
const FINISH = /* glsl */ `
vec3 finish(vec3 col, vec2 uv, vec2 frag) {
  vec2 v = uv - 0.5;
  col *= (1.0 - dot(v, v) * 0.8) * ${f(EXPOSURE)};
  col = pow(max(col, 0.0), vec3(${f(1 / DISPLAY_GAMMA)}));
  col = max(col - 0.016, 0.0) / 0.984;
  return col + (h21(frag + fract(uTime)) - 0.5) / 255.0;
}
`;

// The pane: fogged where no hand or running drop has cleared it, with the room behind you
// faintly mirrored in it, set in a slim wooden frame.
export const GLASS_FRAG = /* glsl */ `
${COMMON}
${FINISH}
uniform sampler2D uScene, uSoft, uState;
uniform float uFire, uGlow, uFogKnee, uClear;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  float a = uAspect;
  vec4 state = texture2D(uState, uv);
  // No hand moves in a ruled line, and no smear has a ruled edge.
  vec2 wp = vec2(uv.x * uAspect, uv.y);
  vec2 wv = uv + (vec2(noise(wp * 4.0 + 2.0), noise(wp * 4.0 + 13.0)) - 0.5) * vec2(0.030 / uAspect, 0.030), wd = vec2(0.005 / uAspect, 0.005);
  state.r = 0.25 * (texture2D(uState, wv + wd).r + texture2D(uState, wv - wd).r + texture2D(uState, wv + wd * vec2(1.0, -1.0)).r + texture2D(uState, wv - wd * vec2(1.0, -1.0)).r);
  // Fog comes back unevenly, creeping in from the edges of the wiped patch.
  vec2 gp = vec2(uv.x * a, uv.y);
  float rough = (noise(gp * 7.0) * 0.6 + noise(gp * 16.0 + 3.0) * 0.4 - 0.5) * 0.44;
  float wiped = smoothstep(0.0, uFogKnee, state.r + rough * smoothstep(0.0, 0.2, state.r)) * step(0.0, state.r);
  // Even a wiped pane keeps a breath of haze.
  // A drop's track is a chain of water: wide where it paused, breaking into beads as it dries.
  float chain = 0.30 + 1.3 * noise(gp * vec2(70.0, 60.0));
  float track = smoothstep(0.03, 0.45, state.g * chain);
  float clear = max(max(wiped * 0.96, track * 0.38), uClear);
  // Condensation is never even: thicker toward the cold edges and the sill, mottled everywhere.
  float mottle = 0.5 + 1.0 * fbm(vec2(uv.x * a, uv.y) * 4.0, 3) * (0.7 + 0.6 * noise(vec2(uv.x * a, uv.y) * 23.0));
  vec2 fromEdge = min(uv, 1.0 - uv) * vec2(a, 1.0);
  float heavy = 1.0 - 0.52 * smoothstep(0.01, 0.34, min(fromEdge.x * 0.6, fromEdge.y));
  // Here and there the mist is thin enough to see through.
  // The middle of the pane, where the room's warmth reaches it, mists least: the lake shows through.
  heavy *= 1.0 - 0.36 * exp(-pow((uv.y - 0.37) / 0.15, 2.0)) * smoothstep(0.0, 0.25, fromEdge.x);
  float band = exp(-pow((uv.y - 0.36) / 0.16, 2.0)) * smoothstep(0.0, 0.25, fromEdge.x);
  float thin = smoothstep(0.50 - 0.10 * band, 0.80, fbm(gp * 2.3 + 7.0 + vec2(uTime * 0.004, uTime * 0.0015), 3)) * (0.45 + 0.25 * band) * (1.0 - smoothstep(0.75, 1.0, heavy));
  thin = max(thin, 0.30 * band);
  // And the warmth of the embers shows where they are.
  { vec2 pd = (uv - vec2(uPit.x / a, uPit.y + 0.03)) * vec2(a, 1.6); thin = max(thin, 0.14 * exp(-dot(pd, pd) * 26.0)); }
  // Below the rail the mist is whole: nothing there to look at but the dark.
  thin *= smoothstep(0.12, 0.21, uv.y);
  clear = max(clear, thin);
  vec3 sharp = texture2D(uScene, uv).rgb;
  vec3 soft = textureLod(uSoft, uv, max(0.0, heavy - 0.62) * 3.2 + 2.0 * smoothstep(0.17, 0.05, uv.y)).rgb;
  // Every light spreads a wide faint glow through the wet pane.
  vec3 bloom = textureLod(uSoft, uv, 3.2).rgb;
  float pitD = length((uv - vec2(uPit.x / a, uPit.y)) * vec2(a, 1.6));
  vec3 base = mix(soft + bloom * 0.22 + max(sharp - soft * 2.6 - vec3(0.02), 0.0) * 0.6 * (1.0 - 0.85 * exp(-pitD * pitD * 60.0)), sharp, smoothstep(0.0, 0.95, clear));
  // Condensation is a skin of droplets too fine to see singly: it sparkles a little.
  float grain = 0.87 + 0.26 * noise(gl_FragCoord.xy * 0.55) * noise(gl_FragCoord.xy * 0.19 + 7.0) * 2.0;
  // Fog scatters what light there is: it veils the pale sky more than the dark hills.
  float veil = 0.12 + 21.0 * dot(textureLod(uSoft, uv, 5.0).rgb, vec3(0.3, 0.5, 0.2));
  vec3 fogCol = base * 0.94 + vec3(0.0145, 0.0142, 0.0145) * mottle * grain * min(veil, 3.3) + vec3(0.007, 0.0068, 0.0066) * smoothstep(0.75, 1.0, heavy) * grain + uGlow * vec3(0.03, 0.031, 0.04) + uAmb * ${vec3(FLASH.fog)} * (0.40 + 0.60 * smoothstep(0.15, 0.55, uv.y))
              + vec3(0.26, 0.095, 0.018) * exp(-pitD * pitD * 22.0) * uEmber;
  float fog = (1.0 - clear) * 0.80 * clamp(heavy * (0.60 + 0.40 * mottle), 0.0, 1.0);
  // What a palm leaves behind: faint streaks in the direction the fingers point.
  fog += wiped * 0.05 * smoothstep(0.97, 0.80, state.r);
  vec3 col = mix(base, fogCol, fog);
  col += (min(soft, vec3(0.05)) * 0.30 + vec3(0.0036, 0.0036, 0.004)) * track * (1.0 - max(wiped, uClear));
  // The water a palm pushes aside stands in a bead along the edge of the wipe.
  // It gathers along the lower edge, where it would run from.
  float rise = texture2D(uState, uv + vec2(0.0, 0.004)).r - texture2D(uState, uv - vec2(0.0, 0.004)).r;
  float lip = clamp(rise * 5.0 - 0.6, 0.0, 1.0) * smoothstep(0.03, 0.2, state.r) * smoothstep(0.9, 0.5, state.r);
  // Not a line but a row of beads, each its own size.
  vec2 bp = vec2(uv.x * a, uv.y) * 110.0 + noise(vec2(uv.x * a, uv.y) * 31.0) * 1.7;
  vec3 bh = h31(floor(bp.x) * 7.1 + floor(bp.y) * 113.3);
  col += (vec3(0.014, 0.013, 0.013) + base * 0.4) * lip * smoothstep(0.40, 0.12, length(fract(bp) - 0.3 - 0.4 * bh.xy) / (0.45 + 0.55 * bh.y)) * step(0.74, bh.z);
  // The room behind you in the glass: the fireplace low on the left, a shaded lamp on the right.
  vec2 fpos = vec2(0.070, 0.125);
  float fd = length((uv - fpos) * vec2(a, 1.0));
  // The firebox: an arched opening with the fire moving in it, and its light on the hearth.
  // It stands partly behind the window frame, as only a reflection can.
  vec2 fq = (uv - fpos) * vec2(a, 1.0) / 1.75;
  // A wide, low, restless glow: nothing in a reflection this faint has an edge.
  // A fireplace, as much of one as a dark pane gives back: the surround and mantel just lit,
  // the firebox dark above a low restless fire. Soft everywhere; nothing in a reflection is sharp.
  float lick = fbm(vec2(fq.x * 22.0, fq.y * 12.0 - uTime * 1.5), 3);
  float box = max(abs(fq.x) - 0.050, abs(fq.y - 0.004) - 0.034);
  float opening = smoothstep(0.018, -0.018, box);
  float surround = smoothstep(0.045, -0.045, max(abs(fq.x) - 0.080, abs(fq.y - 0.012) - 0.054)) * (1.0 - opening);
  float mantel = smoothstep(0.012, 0.0, abs(fq.y - 0.070)) * smoothstep(0.105, 0.075, abs(fq.x)) * 0.7;
  float tongues = exp(-pow(fq.x / 0.040, 2.0)) * smoothstep(0.045, -0.02, fq.y - 0.040 * lick * (0.6 + 0.4 * uFire)) * smoothstep(-0.034, -0.018, fq.y);
  float flames = opening * tongues * smoothstep(0.30, 0.70, fbm(vec2(fq.x * 40.0, fq.y * 16.0 - uTime * 2.2), 2) + 0.2);
  vec3 refl = (vec3(1.0, 0.40, 0.12) * opening * 0.007 + vec3(1.0, 0.56, 0.20) * flames * 0.085
    + vec3(1.0, 0.66, 0.42) * (surround * 0.012 + mantel * 0.016) * (0.7 + 0.3 * lick)) * uFire;
  refl += vec3(1.0, 0.46, 0.18) * exp(-dot(fq, fq) * 60.0) * 0.010 * uFire;
  // The lamp: an amber shade on a stem, its pool of light on the table under it.
  vec2 lpos = vec2(0.850, 0.470);
  vec2 lq = (uv - lpos) * vec2(a, 1.0) / 1.45;
  // Two panes of glass give everything in the room a fainter twin beside it.
  vec2 lg = lq - vec2(0.007, -0.005), fg = fq - vec2(0.006, -0.004);
  // A tall soft glow, brightest in the shade, spilling down onto the table under it.
  float ld = length(lq * vec2(1.0, 1.6));
  // A shade is wider at the bottom than the top, and brightest along its lower rim: no moon is.
  float shade = smoothstep(0.024, -0.024, abs(lq.y) - 0.022) * smoothstep(0.024, -0.024, abs(lq.x) - (0.036 - lq.y * 0.45));
  float stem = smoothstep(0.004, 0.001, abs(lq.x)) * smoothstep(-0.070, -0.060, lq.y) * smoothstep(-0.020, -0.026, lq.y);
  refl += vec3(1.0, 0.66, 0.32) * 0.32 * (shade * (0.016 + 0.020 * smoothstep(0.022, -0.022, lq.y)) + stem * 0.012 + exp(-ld * ld * 40.0) * 0.010
    + exp(-pow(lq.x / 0.065, 2.0) - pow((lq.y + 0.076) / 0.008, 2.0)) * 0.020);
  refl += vec3(1.0, 0.66, 0.32) * 0.010 * smoothstep(0.012, -0.012, abs(lg.y) - 0.022) * smoothstep(0.008, -0.008, abs(lg.x) - (0.036 - lg.y * 0.45));
  refl += vec3(1.0, 0.44, 0.14) * 0.012 * smoothstep(0.014, -0.014, max(abs(fg.x) - 0.082, abs(fg.y - 0.012) - 0.056)) * uFire;
  // Fog is a skin of droplets too small to count; where they are large enough to see, each is a
  // pinprick of clear glass.
  vec2 mc = gp * 170.0;
  vec3 mh = h31(floor(mc.x) * 3.1 + floor(mc.y) * 71.7);
  float pin = smoothstep(0.06 + 0.20 * mh.z, 0.02, length(fract(mc) - 0.25 - 0.5 * mh.xy)) * step(0.5, mh.z) * (1.0 - clear);
  col = mix(col, sharp * 0.9, pin * 0.6) + vec3(0.010, 0.0095, 0.009) * pin * smoothstep(0.5, 0.2, fract(mc.y) - 0.5 * mh.y);
  col += refl * (1.0 - fog * 0.4);
  // Slim frame.
  float fw = ${f(FRAME)};
  vec2 ed = min(uv, 1.0 - uv) * vec2(a, 1.0);
  float edgeD = min(ed.x, ed.y);
  float frame = smoothstep(fw, fw - 0.002, edgeD);
  float alongGrain = ed.x < ed.y ? uv.y : uv.x * a, acrossGrain = edgeD;
  vec3 wood = vec3(0.040, 0.026, 0.016) * (0.7 + 0.55 * noise(vec2(alongGrain * 6.0, acrossGrain * 500.0)) + 0.15 * noise(vec2(alongGrain * 40.0, acrossGrain * 1500.0)))
            + vec3(0.09, 0.045, 0.015) * uFire * exp(-fd * 2.5) + vec3(0.05, 0.04, 0.03) * exp(-ld * 3.0);
  wood *= 1.0 + 0.5 * smoothstep(fw - 0.004, fw - 0.0015, edgeD);
  // Where two lengths of frame meet, a mitre; along the inner edge, years of hands.
  wood *= 1.0 - 0.45 * smoothstep(0.0012, 0.0, abs(ed.x - ed.y)) * frame;
  wood *= 0.85 + 0.3 * noise(vec2(alongGrain * 2.0, 3.0)) + 0.25 * smoothstep(0.6, 0.9, noise(vec2(alongGrain * 9.0, 7.0))) * smoothstep(fw - 0.006, fw, edgeD);
  col *= mix(1.0, 0.72, smoothstep(fw + 0.035, fw, edgeD) * (1.0 - frame));
  col = mix(col, wood, frame);
  gl_FragColor = vec4(finish(col, uv, gl_FragCoord.xy), 1.0);
}
`;

export const DROP_VERT = /* glsl */ `
uniform float uAspect;
attribute vec4 aDrop;
varying vec2 vQ, vC;
varying vec2 vShape;
void main() {
  vQ = position.xy * 1.08; vC = aDrop.xy; vShape = aDrop.zw;
  vec2 p = aDrop.xy + vQ * aDrop.z * vec2(1.0, aDrop.w);
  gl_Position = vec4(p.x / uAspect * 2.0 - 1.0, p.y * 2.0 - 1.0, 0.0, 1.0);
}
`;
// A drop on the glass is a small strong lens: the whole view, upside down and tiny, with a
// dark rim and a point of light.
export const DROP_FRAG = /* glsl */ `
${COMMON}
${FINISH}
uniform sampler2D uScene;
uniform float uGlow, uFire;
varying vec2 vQ, vC;
varying vec2 vShape;
void main() {
  vec2 q = vQ;
  // A drop on the move is drawn out into a tear, narrow above and heavy below.
  // The wind leans every drop a little the way it blows.
  q.x -= q.y * uGust * 0.38;
  { float tilt = (fract(sin(vC.x * 37.1 + vC.y * 81.7) * 9173.3) - 0.5) * 0.9, cs = cos(tilt), sn = sin(tilt); q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs); q *= vec2(1.0 + 0.30 * (fract(vC.x * 513.0 + vC.y * 291.0) - 0.5), 1.0 + 0.30 * (fract(vC.y * 771.0) - 0.5)); }
  q.x *= 1.0 + (vShape.y - 1.0) * 0.9 * smoothstep(-0.6, 1.0, q.y);
  // No two beads quite alike: wider, taller, or sagging to one side.
  float d = length(q * vec2(1.0 + 0.16 * sin(vC.x * 700.0), 1.0 + 0.16 * sin(vC.y * 900.0)) + vec2(q.y * 0.18 * sin(vC.x * 311.0), 0.0)) * (1.0 + 0.10 * q.y * sin(vC.y * 517.0));
  if (d >= 1.0) discard;
  vec2 screen = gl_FragCoord.xy / uRes;
  vec2 ed = min(screen, 1.0 - screen) * vec2(uAspect, 1.0);
  if (min(ed.x, ed.y) < ${f(FRAME)}) discard;
  vec2 here = vec2(vC.x / uAspect, vC.y);
  // Each takes in a little more or less of the world, from a little higher or lower.
  float own = fract(sin(vC.x * 91.7 + vC.y * 57.3) * 43758.5);
  vec2 uvc = clamp(mix(here, vec2(0.5, 0.36 + 0.14 * own), 0.35 + 0.35 * own) - q * (0.30 + 0.70 * d * d) * vec2(0.20, 0.26 + 0.16 * own), 0.002, 0.998);
  // Mostly it bends what is right behind it; the rest is the wide view in miniature.
  vec3 behind = textureLod(uScene, clamp(here - q * d * vShape.x * vec2(2.2 / uAspect, 2.2), 0.002, 0.998), 0.6).rgb;
  // At night a drop is mostly dark, with the string of lights caught small and upside down in it.
  vec3 lens = mix(behind, textureLod(uScene, uvc, 3.0 + 2.2 * fract(own * 7.0)).rgb * 1.5, 0.30 + 0.40 * fract(own * 3.0));
  vec3 n = normalize(vec3(q * 1.3, 1.05 - d * d));
  float spec = pow(max(0.0, dot(n, normalize(vec3(-0.35, 0.55, 1.0)))), 36.0) * 0.55;
  float rim = smoothstep(0.55, 1.0, d);
  vec3 col = lens * (1.0 - rim * 0.55) + (lens * 0.35 + vec3(0.007, 0.0065, 0.006)) * smoothstep(0.45, 0.95, d) * smoothstep(0.1, -0.7, q.y / max(d, 0.01))
    + spec * (vec3(0.05) + uGlow * vec3(0.04) + uAmb * vec3(0.018) + vec3(0.05, 0.03, 0.012) * uFire);
  gl_FragColor = vec4(finish(col, screen, gl_FragCoord.xy), smoothstep(1.0, 0.80, d));
}
`;
