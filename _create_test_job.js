const fs = require('fs');

// Create a test job that uses local assets + new advanced fields
const testJob = {
  id: "test_adv_vfx",
  title: "Test VFX Advanced",
  topic: "technology test",
  script: "Testing advanced VFX. [Visual: logo-automation.png] [Grade: cinematic] [Kinetic: on]\nWith color grading. [Visual: brand_cover.jpg] [Grade: warm] [Kinetic: on]\nAnd motion effects. [Visual: github-profile.png] [Grade: vivid] [Kinetic: on]",
  mode: "compose",
  orientation: "portrait",
  captionTheme: "neon",
  kineticText: true,
  transition: "slide",
  transitionInByScene: { "0": "fade", "1": "zoomblur", "2": "slide" },
  transitionDurationByScene: { "0": 0.5, "1": 0.3, "2": 0.7 },
  transitionCurve: "ease-in-out",
  contrastByScene: { "0": 1.2, "1": 1.1, "2": 1.3 },
  saturationByScene: { "0": 1.1, "1": 1.3, "2": 1.5 },
  brightnessByScene: { "0": 0.05, "1": 0.1, "2": 0.0 },
  gammaByScene: { "0": 1.0, "1": 0.95, "2": 1.1 },
  colorTempByScene: { "0": 6500, "1": 5500, "2": 8000 },
  zoomByScene: { "0": { start: 1.0, end: 1.2 }, "2": { start: 1.1, end: 1.3 } },
  panByScene: { "1": { startX: 0, startY: 0, endX: 50, endY: 30 } },
  opacityByScene: { "1": 0.9 },
  blendModeByScene: { "2": "screen" },
  mirrorByScene: { "0": "horizontal" },
  textOverlayByScene: { "0": { text: "VFX TEST", x: "(w-text_w)/2", y: "40", fontSize: 48, color: "yellow", duration: 3 } },
  emojiOverlayByScene: { "0": { emoji: "🧪", x: "W-96-24", y: "24", size: 96 }, "2": { emoji: "✨", x: "W-96-24", y: "24", size: 80 } },
  ctaButtonByScene: { "2": { text: "DONE", x: "(w-text_w)/2", y: "H-th-60", width: 200, height: 60, color: "#FF6B35", borderColor: "white", borderRadius: 30 } },
  watermark: "logo-automation.png",
  watermarkRotation: 5,
  watermarkShadow: { x: 3, y: 3, blur: 5, color: "black@0.5" },
  brandTintByScene: { "0": "#FF6B35@0.1" },
  parallaxDepthByScene: { "0": 5, "1": 3 },
  particlesByScene: { "0": "sparkles" },
  progressBar: true,
  crossfadeSec: 0.5,
  exportFormat: "mp4",
  contactSheet: true,
  licenseFilter: "cc0"
};

// Write a temp scripts file with just this job
const testFile = 'input/scripts/test-advanced.json';
fs.writeFileSync(testFile, JSON.stringify([testJob], null, 2) + '\n');
console.log('Test job written to:', testFile);
console.log('Job ID:', testJob.id);
console.log('New fields used:', Object.keys(testJob).filter(k => 
  ['transitionInByScene','transitionDurationByScene','transitionCurve','contrastByScene','saturationByScene','brightnessByScene','gammaByScene','colorTempByScene','zoomByScene','panByScene','opacityByScene','blendModeByScene','mirrorByScene','textOverlayByScene','emojiOverlayByScene','ctaButtonByScene','watermarkRotation','watermarkShadow','brandTintByScene','parallaxDepthByScene','particlesByScene','crossfadeSec'].includes(k)
).join(', '));
