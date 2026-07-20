# Test Commands

```bash
cd free-music-module
npm install
```

## All Tests

```bash
npm run test:all
```

## By Feature

```bash
npm run test:search     # Archive Audio + FreeMusicLab search
npm run test:download   # Archive download + cleanup
npm run test:genres     # List available genres
npm run test:ace        # ACE-Step status check
```

## Environment Variables (Optional)

```bash
# Get a free key at https://freemusiclab.ai/profile
set FREEMUSICLAB_API_KEY=fml_your_key_here
npm run test:search
```

## Expected Output

```
=== Internet Archive Audio Search ===
  ✅ "ambient music" returned 2+ tracks
  ✅ "classical music" returned 2+ tracks
  ✅ "nature sounds" returned 2+ tracks

=== ACE-Step Status ===
  ⏭️  SKIP: Not running (expected if not installed)
```
