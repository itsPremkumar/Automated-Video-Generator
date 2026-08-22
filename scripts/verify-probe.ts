import { spawnSync } from 'child_process';
import * as path from 'path';

const files = process.argv.slice(2);
const ffmpeg = path.resolve('node_modules', 'ffmpeg-static', 'ffmpeg.exe');

for (const f of files) {
  const r = spawnSync(ffmpeg, ['-i', f, '-f', 'null', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const stderrStr = r.stderr?.toString() || '';
  const dur = stderrStr.match(/Duration: (\d+:\d+:\d+\.\d+)/);
  const vid = stderrStr.match(/Stream #0.*Video: (\w+)/);
  const aud = stderrStr.match(/Stream #0.*Audio: (\w+)/);
  const dim = stderrStr.match(/(\d+)x(\d+)/);
  if (r.status === 0 || r.status === 1) {
    console.log(`✅ ${f.substring(7)}: ${vid?.[1]||'?'} ${dim?.[1]||'?'}x${dim?.[2]||'?'} ${dur?.[1]||'?'} ${aud?.[1]||''}`);
  } else {
    console.log(`❌ ${f.substring(7)}: exit=${r.status}`);
  }
}
