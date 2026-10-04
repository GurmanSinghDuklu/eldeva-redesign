/* Paper Shaders backgrounds for the inner pages. Any <div class="bgfx" data-fx="name"> gets a shader in the brand palette. */
import { ShaderMount, grainGradientFragmentShader, godRaysFragmentShader, smokeRingFragmentShader, GrainGradientShapes, ShaderFitOptions, getShaderColorFromString as col, getShaderNoiseTexture } from "https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.81/+esm";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sizing = { u_fit: ShaderFitOptions.cover, u_rotation: 0, u_scale: 1, u_offsetX: 0, u_offsetY: 0, u_originX: .5, u_originY: .5, u_worldWidth: 0, u_worldHeight: 0 };
const noiseTex = getShaderNoiseTexture();

// Each look has a day and an evening palette; dark sections keep one palette.
const LOOKS = {
  moods: {
    frag: grainGradientFragmentShader, speed: 0.35,
    base: { u_colorsCount: 4, u_softness: 0.7, u_intensity: 0.4, u_noise: 0.18, u_shape: GrainGradientShapes.blob },
    day: { u_colorBack: col("#EDE2D1"), u_colors: ["#F2BC86", "#FAE8D0", "#DDA376", "#F6D6AE"].map(col) },
    evening: { u_colorBack: col("#1F1813"), u_colors: ["#5A3A24", "#3A2A1F", "#7A4A2A", "#2E241D"].map(col) }
  },
  ritual: {
    frag: godRaysFragmentShader, speed: 0.3,
    base: { u_colorsCount: 4, u_density: 0.22, u_spotty: 0.25, u_midIntensity: 0.5, u_midSize: 0.3, u_intensity: 0.62, u_bloom: 0.38, u_offsetX: -0.6, u_offsetY: -0.6 },
    day: { u_colorBack: col("#E3D5C0"), u_colorBloom: col("#F6C98E"), u_colors: ["#FFF6E6", "#F6C98E", "#FFFFFF", "#EBA865"].map(col) },
    evening: { u_colorBack: col("#2A211A"), u_colorBloom: col("#A5531F"), u_colors: ["#E8A25C55", "#F6C98E33", "#FFE9C440", "#A5531F55"].map(col) }
  },
  ember: {
    frag: grainGradientFragmentShader, speed: 0.25,
    base: { u_colorBack: col("#1F1813"), u_colors: ["#5A3A24", "#A5531F", "#2F241D"].map(col), u_colorsCount: 3, u_softness: 0.8, u_intensity: 0.35, u_noise: 0.25, u_shape: GrainGradientShapes.blob, u_offsetX: -0.3 }
  },
  smoke: {
    frag: smokeRingFragmentShader, speed: 0.4,
    base: { u_colorBack: col("#140E0A"), u_colors: ["#E8A25C", "#F6C98E", "#A5531F"].map(col), u_colorsCount: 3, u_noiseScale: 2.6, u_noiseIterations: 8, u_radius: 0.42, u_thickness: 0.26, u_innerShape: 0.7, u_scale: 1.1, u_offsetY: 0.15 }
  },
  halo: {
    frag: godRaysFragmentShader, speed: 0.3,
    base: { u_colorBack: col("#1A120D"), u_colorBloom: col("#A5531F"), u_colors: ["#E8A25C99", "#F6C98E66", "#A5531F88", "#FFE3B855"].map(col), u_colorsCount: 4,
      u_density: 0.3, u_spotty: 0.3, u_midIntensity: 0.45, u_midSize: 0.25, u_intensity: 0.75, u_bloom: 0.5, u_offsetX: 0, u_offsetY: -0.95 }
  },
  footer: {
    frag: grainGradientFragmentShader, speed: 0.25,
    base: { u_colorBack: col("#140E0A"), u_colors: ["#5A3A24", "#A5531F", "#2F241D"].map(col), u_colorsCount: 3, u_softness: 0.7, u_intensity: 0.3, u_noise: 0.28, u_shape: GrainGradientShapes.wave, u_offsetY: 0.35 }
  }
};

const mood = () => document.documentElement.dataset.mood === "evening" ? "evening" : "day";
const mounts = [];
noiseTex.decode().catch(() => {}).then(() => {
  document.querySelectorAll(".bgfx[data-fx]").forEach(el => {
    const L = LOOKS[el.dataset.fx]; if (!L) return;
    try {
      const m = new ShaderMount(el, L.frag, { ...sizing, ...L.base, ...(L[mood()] || {}), u_noiseTexture: noiseTex }, undefined, reduce ? 0 : L.speed);
      mounts.push([m, L]);
    } catch (e) { console.warn("Shader unavailable for", el.dataset.fx, e); }
  });
});
addEventListener("eldeva:mood", () => mounts.forEach(([m, L]) => L.day && m.setUniforms(L[mood()])));
