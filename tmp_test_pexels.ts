import dotenv from 'dotenv';
dotenv.config();

const axios = require('axios');
const key = process.env.PEXELS_API_KEY;
console.log('Key starts with:', key?.substring(0, 8));
console.log('Key length:', key?.length);

async function test() {
    try {
        const r = await axios.get('https://api.pexels.com/videos/search', {
            headers: { Authorization: key },
            params: { query: 'sunset', per_page: 3, page: 1 },
            timeout: 10000
        });
        console.log('Pexels response:', r.data?.videos?.length, 'videos');
        if (r.data?.videos?.length > 0) {
            console.log('First video_urls:', r.data.videos[0].video_files?.map((f: any) => f.quality + ':' + f.link.substring(0, 40)).join(', '));
        }
    } catch(e: any) {
        console.error('Pexels error:', e.message);
        if (e.response) console.error('Status:', e.response.status, e.response.statusText);
    }
}
test();
