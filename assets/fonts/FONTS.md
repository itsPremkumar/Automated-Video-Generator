# Bundled fonts (caption rendering)

These fonts ship with AVS so captions/subtitles render reliably on headless
boxes (no system fontconfig) and for non-Latin scripts that system fonts lack.

| File | Script | License |
|------|--------|---------|
| `NotoSans-Regular.ttf` | Latin (default) | SIL Open Font License 1.1 |
| `NotoSansTamil-Regular.ttf` | Tamil | SIL Open Font License 1.1 |
| `NotoSansDevanagari-Regular.ttf` | Devanagari (Hindi, etc.) | SIL Open Font License 1.1 |
| `NotoSansSC-Regular.otf` | CJK (Simplified Chinese) | SIL Open Font License 1.1 |

Source: Google Noto Fonts (https://github.com/notofonts). All are free for
commercial and personal use under the SIL OFL 1.1. The pipeline auto-selects
the right font per caption by detecting its Unicode script range.
