# Agentic Video Plugin System

A self-contained, zero-dependency plugin architecture for extending the agentic video pipeline with professional editing features.

## 🏗️ Architecture

```
src/agentic/plugins/
├── core/                    # Core plugin system
│   ├── types.ts             # TypeScript interfaces
│   ├── registry.ts          # Plugin registry & lifecycle
│   └── loader.ts            # Auto-discovery & config loading
├── motion/                  # Motion effects
│   ├── punch-in.ts          # Keyframed zoom (snap-zoom)
│   ├── speed-ramp.ts        # Variable speed (slow-mo/fast)
│   ├── ken-burns-pro.ts     # Advanced Ken Burns
│   ├── shake.ts             # Handheld camera shake
│   └── parallax.ts          # 2.5D parallax
├── color/                   # Color grading
│   ├── lut-loader.ts        # .cube/.3dl LUT support
│   ├── film-grain.ts        # Film grain overlay
│   ├── halation.ts          # Highlight halation/bloom
│   └── color-wheels.ts      # Lift/Gamma/Gain
├── transitions/             # Advanced transitions
│   └── advanced-transitions.ts  # Whip pan, glitch, light leak, morph cut, match cut
├── overlays/                # Overlays & branding
│   ├── watermark.ts         # Logo/brand watermark
│   ├── dynamic-captions.ts  # Animated captions
│   ├── typewriter.ts        # Typewriter effect
│   ├── safe-zones.ts        # Platform safe zones
│   ├── lower-third.ts       # Lower third bars
│   └── progress-bar.ts      # Progress indicator
├── audio/                   # Audio processing
│   ├── beat-sync.ts         # Beat-synced cuts
│   ├── audio-ducking.ts     # Sidechain ducking
│   ├── normalize-loudness.ts # LUFS normalization
│   └── ambience-layer.ts    # Background ambience
├── genres/                  # Genre templates
│   └── genre-style.ts       # 13 genre presets
├── platforms/               # Platform export
│   └── platform-export.ts   # TikTok/Reels/Shorts specs
├── index.ts                 # Main exports & setup
├── integration-example.ts   # Usage examples
├── plugin-config.schema.json # JSON Schema for config
└── agentic-plugins.config.json # Example config
```

## 🚀 Quick Start

### 1. Install (no additional deps required)

```bash
# Core system works with zero extra dependencies
# Optional: npm install @aubio/wasm  # for beat-sync
```

### 2. Create Plugin Config

```json
// agentic-plugins.config.json
{
    "plugins": [
        { "name": "punch-in", "enabled": true, "config": { "autoEmphasis": true } },
        { "name": "lut-loader", "enabled": true, "config": { "defaultLUT": "fuji-400h.cube" } },
        { "name": "watermark", "enabled": true, "config": { "image": "./assets/logo.png" } },
        { "name": "genre-style", "enabled": true, "config": { "genre": "reels" } },
        { "name": "platform-export", "enabled": true, "config": { "platforms": ["tiktok", "reels", "shorts"] } }
    ]
}
```

### 3. Use with Autopilot

```typescript
import { runWithPluginsAutopilot } from './src/agentic/plugins/integration-example.js';

const output = await runWithPluginsAutopilot('5 amazing coffee facts', 'Coffee Facts', {
    configPath: './agentic-plugins.config.json',
});
```

### 4. Use with Custom Pipeline

```typescript
import { createPluginRegistry, registerAllPlugins } from './src/agentic/plugins/index.js';

const context = { jobId, workspaceRoot, config, metadata: {}, shared: new Map() };
const registry = createPluginRegistry(context);
registerAllPlugins(registry, customConfig);

// In your pipeline stages:
plan = await registry.invokeOnPlan(plan);
style = await registry.invokeOnStyle(style);
filtergraph = await registry.invokeOnRender(filtergraph);
await registry.invokeOnPostRender(outputPath);
```

## 🎬 Available Plugins

### Motion Effects

| Plugin          | Description                              | Key Config                     |
| --------------- | ---------------------------------------- | ------------------------------ |
| `punch-in`      | Keyframed digital zoom on emphasis words | `autoEmphasis`, `scale`, `dur` |
| `speed-ramp`    | Variable speed with bezier curves        | `points: [{t, speed}]`         |
| `ken-burns-pro` | Advanced Ken Burns with auto-direction   | `intensity`, `autoDirection`   |
| `shake`         | Handheld camera shake                    | `intensity`, `frequency`       |
| `parallax`      | 2.5D layer separation                    | `layers: [{depth, scale}]`     |

### Color Grading

| Plugin         | Description           | Key Config                          |
| -------------- | --------------------- | ----------------------------------- |
| `lut-loader`   | Load .cube/.3dl LUTs  | `lutDir`, `defaultLUT`, `intensity` |
| `film-grain`   | Procedural film grain | `strength`, `size`                  |
| `halation`     | Highlight bloom       | `threshold`, `intensity`            |
| `color-wheels` | Lift/Gamma/Gain       | `lift`, `gamma`, `gain`             |

### Transitions

| Plugin                 | Effects                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `advanced-transitions` | whip-pan, glitch, light-leak, morph-cut, match-cut, all xfade types |

### Overlays

| Plugin             | Description                                |
| ------------------ | ------------------------------------------ |
| `watermark`        | Logo with position, opacity, animation     |
| `dynamic-captions` | Karaoke, word-pop, typewriter              |
| `typewriter`       | Character-by-character reveal              |
| `safe-zones`       | Platform UI overlays (TikTok/Reels/Shorts) |
| `lower-third`      | Animated lower third bars                  |
| `progress-bar`     | Bottom progress indicator                  |

### Audio

| Plugin               | Description                                  |
| -------------------- | -------------------------------------------- |
| `beat-sync`          | Cuts synced to music beats (uses aubio WASM) |
| `audio-ducking`      | Sidechain music under voiceover              |
| `normalize-loudness` | LUFS normalization (-14 default)             |
| `ambience-layer`     | Background atmosphere bed                    |

### Genre Templates (13 genres)

`reels`, `tiktok`, `documentary`, `cinematic`, `news`, `tutorial`, `vlog`, `product`, `motivational`, `nature`, `corporate`, `wedding`, `gaming`, `realestate`

Each genre configures: transitions, grades, pacing, captions, motion, audio, overlays, platforms.

### Platform Export

Generates platform-compliant outputs with:

- Correct aspect, duration, bitrate, codec
- Safe zone validation
- Thumbnails (1080x1920, 1280x720, etc.)
- Metadata JSON for upload APIs

## ⚙️ Configuration

### Per-Plugin Config (in agentic-plugins.config.json)

```json
{
    "name": "punch-in",
    "enabled": true,
    "config": {
        "autoEmphasis": true,
        "imagesOnly": true,
        "defaults": { "scale": 1.4, "dur": 0.8, "easing": "ease-out" },
        "scenes": [{ "sceneIndex": 0, "atSec": 1.5, "scale": 1.6 }]
    }
}
```

### Genre Override

```json
{
    "name": "genre-style",
    "enabled": true,
    "config": { "genre": "cinematic", "overrideConfig": true }
}
```

### Multi-Platform Export

```json
{
    "name": "platform-export",
    "enabled": true,
    "config": {
        "platforms": ["tiktok", "reels", "shorts", "youtube"],
        "thumbnails": true,
        "metadata": true,
        "safeZones": true,
        "codec": "h264",
        "quality": "high"
    }
}
```

## 🔌 Creating Custom Plugins

```typescript
// my-plugins/custom-zoom.ts
import { AgenticPlugin, PluginCategory, Capability } from '../src/agentic/plugins/core/types.js';

export const customZoomPlugin: AgenticPlugin = {
    metadata: {
        name: 'custom-zoom',
        version: '1.0.0',
        description: 'Custom zoom effect',
        category: PluginCategory.MOTION,
    },
    capabilities: [Capability.MOTION_KEYFRAMES],
    category: PluginCategory.MOTION,
    defaultConfig: { intensity: 1.0 },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            const cfg = ctx.getConfig('custom-zoom');
            return {
                ...scene,
                filterChain: scene.filterChain + `,zoompan=z='min(zoom+${cfg.intensity * 0.01},1.5)':d=1`,
            };
        },
    },
};

// Register:
import { customZoomPlugin } from './my-plugins/custom-zoom.js';
registry.register(customZoomPlugin, { intensity: 1.5 }, true);
```

## 📁 Directory Structure for External Plugins

```
my-project/
├── agentic-plugins.config.json
├── assets/
│   ├── luts/           # .cube files for lut-loader
│   ├── brand/          # watermark.png
│   ├── overlays/       # light-leaks, lower-thirds
│   └── audio/          # ambience, music
└── my-plugins/         # Custom plugins (optional)
    └── custom-zoom.ts
```

## 🔗 Integration Points

The plugin system hooks into pipeline stages:

1. **onLoad** - Initialize (load LUTs, verify assets)
2. **onPlan** - Modify script/plan (genre pacing, durations)
3. **onAcquire** - Influence asset selection
4. **onStyle** - Override transitions, grades, kinetics
5. **onRender** - Inject ffmpeg filtergraph fragments
6. **onPostRender** - Thumbnails, metadata, transcode
7. **onError** - Cleanup, fallback

## ⚡ Performance

- **Zero core deps** — only uses ffmpeg-static, fs, path
- **Lazy loading** — plugins only loaded when enabled
- **Deterministic** — same config = same output (hash-based)
- **Parallel safe** — registry is read-only after init

## 🧪 Testing

```bash
# Test specific plugin
npx tsx -e "
import { createPluginRegistry, registerAllPlugins } from './src/agentic/plugins/index.js';
const ctx = { jobId: 'test', workspaceRoot: '.', config: {}, metadata: {}, shared: new Map() };
const r = createPluginRegistry(ctx);
registerAllPlugins(r, { 'punch-in': { enabled: true, config: {} } });
await r.invokeOnLoad();
console.log('Plugins:', r.getEnabled().map(e => e.plugin.metadata.name));
"
```

## 📋 Plugin Config Schema

See `plugin-config.schema.json` for full JSON Schema with autocomplete support in VS Code.

---

**Note**: This plugin system is completely decoupled from the core agentic pipeline. It reads/writes to a shared context Map and never modifies core files.
