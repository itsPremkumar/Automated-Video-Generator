# Free Music Module

All free music download options for commercial use, programmatically accessible from Node.js.

```bash
cd free-music-module
npm install
npx tsx src/test.ts all    # tests pass
```

## 7 Providers (5 active + 2 experimental)

| Provider | Tracks | License | API Key | Status |
|----------|--------|---------|---------|--------|
| **open-lofi** | **166** lo-fi | **CC0 (Public Domain)** | None | ✅ |
| **everythingisfree** | **7** + stems | **CC0 (Public Domain)** | None | ✅ |
| **Internet Archive Audio** | Millions | Public Domain / CC | None | ✅ |
| **NCS (NoCopyrightSounds)** | 1000+ electronic | Free monetization | None | ✅ |
| **Free Music Archive** | 150k+ | Various CC | None | ✅ |
| **FreeMusicLab.ai** | 2,000+ AI | Google Lyria | Free key | ⏳ |
| **ACE-Step 1.5** | Generation | MIT | None (GPU) | ⏳ |

## Quick Download

```bash
# Download one track from each provider
npx tsx -e "
import * as all from './src/index.js';
const provs = [all.openLofiProvider, all.archiveAudioProvider, all.ncsProvider];
for (const p of provs) {
  const tracks = await p.search('ambient', 1);
  if (tracks.length) {
    console.log((await p.download(tracks[0], './downloads')) || 'FAIL');
  }
}
"
```

## Running Tests

```bash
npm run test:all          # all 7 download providers + 1 generator
npm run test:search       # all providers search test
npm run test:download     # archive download test
npm run test:ace          # ACE-Step status check
```

## Providers Detail

### open-lofi (CC0, no key)
166 lo-fi tracks across 10 categories. Fetches `catalog.json` from GitHub, downloads individual MP3s from raw GitHub URLs. Zero restrictions.

### everythingisfree (CC0, no key)
7-track electronic album with stems. Uses npm package `@ichbinsoftware/everything-is-free`. WAV downloads, CC0 public domain.

### Internet Archive Audio (no key)
Search millions of public domain audio files via `archive.org/advancedsearch.php`. Mixed genres and quality.

### NCS (NoCopyrightSounds) (no key)
1000+ electronic tracks. Uses npm package `nocopyrightsounds-api`. Free for monetized content.

### Free Music Archive (no key)
150k+ tracks across all genres. Scrapes search page + track pages for direct MP3 URLs. Various CC licenses.
