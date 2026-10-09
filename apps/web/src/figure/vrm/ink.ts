import * as THREE from 'three';

/**
 * The storybook look: turns the rendered figure into a pen-and-ink plate on
 * paper. Outlines come from changes in brightness, shadow becomes hatching in
 * up to three directions as it deepens, and a faint wash of the original
 * colour stays, like a tinted engraving. Lines wobble slightly, as if drawn by hand.
 */
export const InkShader = {
  name: 'InkShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    pixelRatio: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelRatio;
    varying vec2 vUv;

    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    float L(vec2 o) { return lum(texture2D(tDiffuse, vUv + o / resolution).rgb); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    // Parallel strokes at an angle; width grows with how dark the surface is.
    float hatch(vec2 p, float angle, float spacing, float width) {
      vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
      float d = abs(fract(q.x / spacing) - 0.5) * spacing;
      return width <= 0.01 ? 0.0 : 1.0 - smoothstep(width * 0.5, width * 0.5 + 0.9, d);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = lum(c);
      float s = pixelRatio;

      // Outline: Sobel on brightness, two pixels wide at any pixel ratio.
      float tl = L(vec2(-s, s)), t = L(vec2(0, s)), tr = L(vec2(s, s));
      float ml = L(vec2(-s, 0)), mr = L(vec2(s, 0));
      float bl = L(vec2(-s, -s)), b = L(vec2(0, -s)), br = L(vec2(s, -s));
      float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
      float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
      float edge = smoothstep(0.12, 0.42, length(vec2(gx, gy)));

      // Hatching in screen space, nudged off true so it reads as drawn.
      vec2 p = gl_FragCoord.xy / s;
      p += 1.4 * vec2(noise(p * 0.045), noise(p * 0.045 + 17.0)) - 0.7;
      // Lift the tones first: an illustrator hatches only real shadow, not every mid-tone.
      float dark = 1.0 - pow(l, 0.6);
      float ink = 0.0;
      ink = max(ink, hatch(p, 0.785, 7.5, mix(0.0, 1.1, smoothstep(0.38, 0.62, dark))));
      ink = max(ink, hatch(p, -0.785, 7.5, mix(0.0, 1.0, smoothstep(0.6, 0.8, dark))));
      ink = max(ink, hatch(p, 0.0, 5.0, mix(0.0, 1.1, smoothstep(0.8, 0.95, dark))));
      ink = max(ink * 0.85, edge);

      // Warm paper with a little grain and fibre, and a pale wash of the figure's colour.
      vec3 paper = vec3(0.955, 0.918, 0.835) * (0.95 + 0.05 * noise(p * 0.8) + 0.02 * hash(floor(p / 1.5)));
      vec3 hue = c / max(l, 0.05);
      vec3 wash = paper * mix(vec3(1.0), clamp(hue, 0.0, 1.6), 0.42) * mix(1.0, 0.82 + 0.18 * l, 0.6);
      vec3 inkColour = vec3(0.16, 0.115, 0.085);
      gl_FragColor = vec4(mix(wash, inkColour, ink * 0.92), 1.0);
    }
  `,
};
