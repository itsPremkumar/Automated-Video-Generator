import { searchAllImagePlatforms, searchAllVideoPlatforms } from '../src/lib/media-downloader.js';
import { FreeImageAdapter, FreeVideoAdapter } from '../src/lib/free-image/adapter.js';
(async () => {
  const img = await searchAllImagePlatforms('lion', 12);
  const vid = await searchAllVideoPlatforms('lion', 12);
  const imgBySrc: Record<string, number> = {};
  for (const h of img) imgBySrc[h.source] = (imgBySrc[h.source] || 0) + 1;
  const vidBySrc: Record<string, number> = {};
  for (const h of vid) vidBySrc[h.source] = (vidBySrc[h.source] || 0) + 1;
  console.log('IMAGE candidates by source:', JSON.stringify(imgBySrc));
  console.log('VIDEO candidates by source:', JSON.stringify(vidBySrc));
  console.log('IMAGE on-topic:', img.filter((h) => FreeImageAdapter.isOnTopic('lion', h.title)).length, '/', img.length);
  console.log('VIDEO on-topic:', vid.filter((h) => FreeVideoAdapter.isOnTopic('lion', h.title)).length, '/', vid.length);
  console.log('IMAGE samples:', img.slice(0, 5).map((h) => `[${h.source}] ${h.title}`));
  console.log('VIDEO samples:', vid.slice(0, 5).map((h) => `[${h.source}] ${h.title}`));
})().catch((e) => { console.error('DIAG ERR', e); process.exit(1); });
