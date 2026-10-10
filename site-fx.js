/* Paper Shaders backgrounds for the inner pages. Any <div class="bgfx" data-fx="name"> gets a shader in the brand palette. */
import { ShaderMount, grainGradientFragmentShader, godRaysFragmentShader, smokeRingFragmentShader, GrainGradientShapes, ShaderFitOptions, getShaderColorFromString as col, getShaderNoiseTexture } from "https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.81/+esm";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sizing = { u_fit: ShaderFitOptions.cover, u_rotation: 0, u_scale: 1, u_offsetX: 0, u_offsetY: 0, u_originX: .5, u_originY: .5, u_worldWidth: 0, u_worldHeight: 0 };
const noiseTex = getShaderNoiseTexture();

// Each look's palette, drawn from the Eldeva brand colours.
const LOOKS = {
  moods: {
    frag: grainGradientFragmentShader, speed: 0.35,
    base: { u_colorsCount: 4, u_softness: 0.7, u_intensity: 0.4, u_noise: 0.18, u_shape: GrainGradientShapes.blob },
    day: { u_colorBack: col("#F7F2EA"), u_colors: ["#E7D8C9", "#FBF8F4", "#DCC4A6", "#EFE4D6"].map(col) }
  },
  ritual: {
    frag: godRaysFragmentShader, speed: 0.3,
    base: { u_colorsCount: 4, u_density: 0.22, u_spotty: 0.25, u_midIntensity: 0.5, u_midSize: 0.3, u_intensity: 0.62, u_bloom: 0.38, u_offsetX: -0.6, u_offsetY: -0.6 },
    day: { u_colorBack: col("#E7D8C9"), u_colorBloom: col("#D9BE96"), u_colors: ["#FBF8F4", "#E4D0B3", "#FFFFFF", "#C9A77A"].map(col) }
  },
  ember: {
    frag: grainGradientFragmentShader, speed: 0.25,
    base: { u_colorBack: col("#3A241C"), u_colors: ["#5A3A24", "#9C7A52", "#4A2E24"].map(col), u_colorsCount: 3, u_softness: 0.8, u_intensity: 0.35, u_noise: 0.25, u_shape: GrainGradientShapes.blob, u_offsetX: -0.3 }
  },
  smoke: {
    frag: smokeRingFragmentShader, speed: 0.4,
    base: { u_colorBack: col("#2B1A14"), u_colors: ["#C9A77A", "#D9BE96", "#9C7A52"].map(col), u_colorsCount: 3, u_noiseScale: 2.6, u_noiseIterations: 8, u_radius: 0.42, u_thickness: 0.26, u_innerShape: 0.7, u_scale: 1.1, u_offsetY: 0.15 }
  },
  halo: {
    frag: godRaysFragmentShader, speed: 0.3,
    base: { u_colorBack: col("#2F1D16"), u_colorBloom: col("#9C7A52"), u_colors: ["#C9A77A99", "#D9BE9666", "#9C7A5288", "#FFE3B855"].map(col), u_colorsCount: 4,
      u_density: 0.3, u_spotty: 0.3, u_midIntensity: 0.45, u_midSize: 0.25, u_intensity: 0.75, u_bloom: 0.5, u_offsetX: 0, u_offsetY: -0.95 }
  },
  footer: {
    frag: grainGradientFragmentShader, speed: 0.25,
    base: { u_colorBack: col("#4A2E24"), u_colors: ["#5E3A2C", "#7A5A40", "#3E261E"].map(col), u_colorsCount: 3, u_softness: 0.7, u_intensity: 0.3, u_noise: 0.28, u_shape: GrainGradientShapes.wave, u_offsetY: 0.35 }
  }
};

const mounts = [];
noiseTex.decode().catch(() => {}).then(() => {
  document.querySelectorAll(".bgfx[data-fx]").forEach(el => {
    const L = LOOKS[el.dataset.fx]; if (!L) return;
    try {
      const m = new ShaderMount(el, L.frag, { ...sizing, ...L.base, ...(L.day || {}), u_noiseTexture: noiseTex }, undefined, reduce ? 0 : L.speed);
      mounts.push([m, L]);
    } catch (e) { console.warn("Shader unavailable for", el.dataset.fx, e); }
  });
});
