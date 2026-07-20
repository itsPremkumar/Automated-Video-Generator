import ff from 'ffmpeg-static';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const img = os.tmpdir() + '/ct.png';
execFileSync(ff, ['-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=0.1', '-frames:v', '1', '-y', img], { stdio: 'ignore' });
const out = os.tmpdir() + '/z.mp4';
const log = os.tmpdir() + '/z.log';
const r = spawnSync(ff, ['-loop', '1', '-i', img, '-vf', 'scale=720:1280,trim=duration=4,setpts=PTS-STARTPTS,zoompan=z=min(zoom+0.0008,1.04):d=1:s=720x1280,format=yuv420p', '-t', '4', '-y', out], { encoding: 'utf8' });
const txt = (r.stdout || '') + '\n' + (r.stderr || '');
const line = txt.split('\n').find((l) => /rror|Invalid|No such|option|Trailing|expected|unrecognized|Unable|not.*found/i.test(l));
console.log('zoompan d=1 error line:', line || txt.split('\n').slice(-5).join(' | '));
