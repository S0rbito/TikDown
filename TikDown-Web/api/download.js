export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Falta el parámetro URL' });
    }

    const apiKey = process.env.RAPIDAPI_KEY;

    const platform = detectPlatform(url);

    try {
        let result;

        if (platform === 'tiktok') {
            result = await getTikTok(url, apiKey);
        } else if (platform === 'facebook') {
            result = await getFacebook(url, apiKey);
        } else if (platform === 'instagram') {
            result = await getInstagram(url, apiKey);
        } else if (platform === 'twitter') {
            result = await getTwitter(url, apiKey);
        } else {
            return res.status(400).json({ error: 'Plataforma no soportada. Usa TikTok, Facebook o Instagram.' });
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: error.message || 'Error al procesar la solicitud.' });
    }
}

function detectPlatform(url) {
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) return 'facebook';
    if (url.includes('instagram.com') || url.includes('instagr.am')) return 'instagram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    return 'unknown';
}

// ── TikTok ────────────────────────────────────────────────────────────────────
async function getTikTok(url, apiKey) {
    const host = 'scraptik.p.rapidapi.com';
    
    // Resuelve links cortos (vt.tiktok.com, vm.tiktok.com)
    let resolvedUrl = url;
    if (url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com')) {
        try {
            const res = await fetch(url, {
                method: 'HEAD',
                redirect: 'follow',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            resolvedUrl = res.url;
            console.log('TikTok resolved URL:', resolvedUrl);
        } catch (e) {
            console.log('No se pudo resolver el link corto:', e.message);
        }
    }
    // Extrae el aweme_id de la URL
    // Formatos: /video/1234567890 o /@user/video/1234567890
    const match = resolvedUrl.match(/\/video\/(\d+)/);
    if (!match) throw new Error('No se pudo extraer el ID. Usa el link completo del video desde TikTok.');
    const awemeId = match[1];

    const response = await fetch(
        `https://${host}/video-without-watermark?compact=0&aweme_id=${awemeId}`,
        {
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': host
            }
        }
    );

    const data = await response.json();
    
    console.log('TikTok ALL keys:', JSON.stringify(Object.keys(data)));
    console.log('TikTok bit_rate:', JSON.stringify(data.bit_rate)?.slice(0, 500));
    console.log('TikTok play_addr:', JSON.stringify(data.play_addr)?.slice(0, 300));
    console.log('TikTok music:', JSON.stringify(data.music)?.slice(0, 300));
    console.log('TikTok ScrapTik response:', JSON.stringify(data).slice(0, 300));

    if (data.message) throw new Error(`Error API: ${data.message}`);

    const videoUrl = data.video_url || '';
    if (!videoUrl) throw new Error('No se encontró el video de TikTok');

    // Thumbnail desde el campo cover si existe
    const thumbnail = data.cover || data.origin_cover || null;

    return {
        platform: 'tiktok',
        title: data.desc || data.title || 'Video de TikTok',
        thumbnail,
        downloadUrl: videoUrl,
        author: data.author?.unique_id || data.author?.nickname || ''
    };
}

// ── Facebook ──────────────────────────────────────────────────────────────────
async function getFacebook(url, apiKey) {
    const response = await fetch('https://fdown.isuru.eu.org/info', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify({ url })
    });

    const data = await response.json();
    console.log('Facebook response:', JSON.stringify(data).slice(0, 300));

    if (data.status !== 'success') {
        throw new Error(data.message || 'No se pudo obtener el video de Facebook');
    }

    let videoUrl = data.download_url || '';
    if (!videoUrl && data.available_formats?.length > 0) {
        videoUrl = data.available_formats[0].url || '';
    }

    if (!videoUrl) throw new Error('No se encontró el video de Facebook');

    return {
        platform: 'facebook',
        title: data.video_info?.title || 'Video de Facebook',
        thumbnail: data.video_info?.thumbnail || null,
        downloadUrl: videoUrl,
        author: ''
    };
}


// ── Twitter/X ─────────────────────────────────────────────────────────────────
async function getTwitter(url, apiKey) {
    const host = 'twitter-video-downloader5.p.rapidapi.com';
    const response = await fetch(
        `https://${host}/download?url=${encodeURIComponent(url)}`,
        {
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': host
            }
        }
    );

    const data = await response.json();
    console.log('Twitter response:', JSON.stringify(data).slice(0, 300));

    if (data.error) throw new Error('No se pudo obtener el video de Twitter/X');

    // Toma el video de mayor calidad (mayor bitrate)
    const videos = data.videos?.[0]?.formats?.filter(f => f.container === 'mp4') || [];
    const best = videos.reduce((a, b) => (b.bitrate > a.bitrate ? b : a), videos[0] || {});
    const videoUrl = best?.url || data.videos?.[0]?.url || '';

    if (!videoUrl) throw new Error('No se encontró el video');

    return {
        platform: 'twitter',
        title: data.title || 'Video de Twitter/X',
        thumbnail: data.thumbnail || null,
        downloadUrl: videoUrl,
        author: data.author || ''
    };
}


// ── Instagram ─────────────────────────────────────────────────────────────────
async function getInstagram(url, apiKey) {
    const host = 'instagram-downloader-download-instagram-videos-stories5.p.rapidapi.com';
    const response = await fetch(
        `https://${host}/getStory?url=${encodeURIComponent(url)}`,
        {
            headers: {
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': host
            }
        }
    );

    const data = await response.json();
    console.log('Instagram response:', JSON.stringify(data).slice(0, 300));

    if (data.message) throw new Error(`Error API: ${data.message}`);

    const videoUrl = data.video_url ||
        data.media?.[0]?.video_url || '';

    if (!videoUrl) throw new Error('No se encontró el video de Instagram');

    return {
        platform: 'instagram',
        title: data.title || data.captions?.[0] || 'Video de Instagram',
        thumbnail: data.thumbnail_src || data.src || null,
        downloadUrl: videoUrl,
        author: data.author || ''
    };
}
