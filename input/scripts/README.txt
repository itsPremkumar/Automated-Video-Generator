INPUT FOLDER NOTES
==================

Most end users do not need this folder anymore.

Recommended flow:
1. Start the app with `Start-Automated-Video-Generator.bat`
2. Open the browser portal
3. Paste the script there
4. Wait on the live job page
5. Download the final MP4 from the watch page

Use `input/input-scripts.json` only when you want batch jobs or developer-style runs with:

`npm run generate`

You can still use `[Visual: ...]` tags in scripts to guide stock footage searches or reference local files from `input/input-assets/`.

==================================================================
SCRIPT FILE STRUCTURE (what the runtime actually reads)
==================================================================

Only TWO files are live inputs. Everything else is a reference fixture.

LIVE INPUTS (consumed at runtime):
  - agentic-scripts.json   -> the AGENTIC pipeline. `agentic-batch.ts`
                              reads THIS file only. Contains 65 jobs
                              (incl. all wave/variety-matrix jobs, tagged
                              with "tags": ["waveA"], ["variety-matrix"], etc.).
  - input-scripts.json     -> the LEGACY batch flow (`npm run generate`).
                              Simple jobs: id/title/script/orientation/voice.

REFERENCE FIXTURES (NOT auto-loaded — copy a job into a live file to run it):
  - examples/agentic-scripts.example.json  -> full-feature agentic template
                                              (every knob documented).
  - examples/*-matrix.example.json          -> the 9 wave/variety matrices
                                              (waveA..waveI, variety). These
                                              are the SAME jobs already present
                                              inside agentic-scripts.json; kept
                                              here only as labeled examples of
                                              each FX variety (transitions,
                                              chromaKey, kinetic, emoji, sfx...).

To run a fixture: open examples/<file>.example.json, copy the desired job
object into agentic-scripts.json (or input-scripts.json for legacy), then run.

Why the split? The agentic runner hardcodes `agentic-scripts.json` as its
input. The matrices were standalone fixtures, not auto-merged — so all their
jobs already live inside agentic-scripts.json (de-duplicated, with `tags` for
provenance). The examples/ folder just labels them for learning.
