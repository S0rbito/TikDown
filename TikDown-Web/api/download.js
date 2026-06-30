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
            return res.status(400).json({ error: 'Plataforma no soportada. Usa TikTok, Facebook, Instagram o Twitter/X.' });
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
        } catch (e) {
            console.log('No se pudo resolver el link corto:', e.message);
        }
    }

    const match = resolvedUrl.match(/\/video\/(\d+)/);
    if (!match) throw new Error('No se pudo extraer el ID. Usa el link completo del video.');
    const awemeId = match[1];

    const response = await fetch(
        `https://${host}/get-post?region=GB&compact=0&aweme_id=${awemeId}`,
        {
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': host
            }
        }
    );

    const data = await response.json();
    console.log('TikTok get-post status_code:', data.status_code);

    const detail = data.aweme_detail;
    if (!detail) throw new Error('No se encontró el video');

    const video = detail.video;

    // Construye lista de calidades desde bit_rate, ordenadas de mayor a menor
    const qualities = (video.bit_rate || [])
        .map(b => ({
            label: b.gear_name?.replace(/_/g, ' ') || 'Calidad',
            url: b.play_addr?.url_list?.[0] || '',
            sizeBytes: b.play_addr?.data_size || 0,
            hasWatermark: false
        }))
        .filter(q => q.url)
        .sort((a, b) => b.sizeBytes - a.sizeBytes);

    // Agrega la versión sin marca de agua si existe
    if (video.download_no_watermark_addr?.url_list?.[0]) {
        qualities.unshift({
            label: 'Sin marca de agua (HD)',
            url: video.download_no_watermark_addr.url_list[0],
            sizeBytes: video.download_no_watermark_addr.data_size || 0,
            hasWatermark: false
        });
    }

    if (qualities.length === 0) throw new Error('No se encontraron calidades de video');

    return {
        platform: 'tiktok',
        title: detail.desc || 'Video de TikTok',
        thumbnail: video.cover?.url_list?.[0] || video.origin_cover?.url_list?.[0] || null,
        author: detail.author?.unique_id || detail.author?.nickname || '',
        downloadUrl: qualities[0].url,
        qualities
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
        author: '',
        qualities: [{ label: 'Original', url: videoUrl, sizeBytes: 0, hasWatermark: false }]
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

    const allFormats = (data.videos?.[0]?.formats || []).filter(f => f.container === 'mp4');

    const qualities = allFormats
        .map(f => ({
            label: f.resolution || `${f.bitrate || ''} bps`,
            url: f.url,
            sizeBytes: 0,
            hasWatermark: false
        }))
        .sort((a, b) => (b.label > a.label ? 1 : -1));

    const videoUrl = allFormats.length > 0
        ? allFormats.reduce((a, b) => (b.bitrate > a.bitrate ? b : a), allFormats[0]).url
        : (data.videos?.[0]?.url || '');

    if (!videoUrl) throw new Error('No se encontró el video');

    return {
        platform: 'twitter',
        title: data.title || 'Video de Twitter/X',
        thumbnail: data.thumbnail || null,
        downloadUrl: videoUrl,
        author: data.author || '',
        qualities: qualities.length > 0
            ? qualities
            : [{ label: 'Original', url: videoUrl, sizeBytes: 0, hasWatermark: false }]
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
        author: data.author || '',
        qualities: [{ label: 'Original', url: videoUrl, sizeBytes: 0, hasWatermark: false }]
    };
}
