const PLATFORM_ICONS = {
    tiktok: '🎵',
    facebook: '📘',
    twitter: '🐦',
    instagram: '📸'
};

const PLATFORM_COLORS = {
    tiktok: '#181818',
    facebook: '#133b70',
    twitter: '#1D9BF0',
    instagram: '#c25378'
};

function detectPlatform(url) {
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) return 'facebook';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    if (url.includes('instagram.com') || url.includes('instagr.am')) return 'instagram';
    return null;
}

function generateFilename(platform, title) {
    const prefix = {
        tiktok: 'tiktok',
        facebook: 'fb',
        instagram: 'ig'
    }[platform] || 'video';

    const cleanTitle = (title || '')
        .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '')  // quita caracteres especiales
        .trim()
        .slice(0, 30)                                    // máximo 30 caracteres
        .trim()
        .replace(/\s+/g, '_');                           // espacios por guiones

    const timestamp = Date.now().toString().slice(-6);   // últimos 6 dígitos

    return cleanTitle
        ? `${prefix}_${cleanTitle}_${timestamp}.mp4`
        : `${prefix}_${timestamp}.mp4`;
}

async function procesarDescarga() {
    const urlInput = document.getElementById('url-input').value.trim();
    const container = document.getElementById('download-container');
    const btn = document.getElementById('search-btn');

    if (!urlInput) {
        showError(container, 'Ingresa un link de TikTok, Facebook o Instagram.');
        return;
    }

    const platform = detectPlatform(urlInput);
    if (!platform) {
        showError(container, 'Plataforma no soportada. Usa TikTok, Facebook o Instagram.');
        return;
    }

    // Loading state
    btn.disabled = true;
    btn.textContent = 'Buscando...';
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Obteniendo el video de ${platform}...</p>
        </div>
    `;

    try {
        const respuesta = await fetch(`/api/download?url=${encodeURIComponent(urlInput)}`);
        const datos = await respuesta.json();

        if (datos.error) {
            showError(container, datos.error);
            return;
        }

        const color = PLATFORM_COLORS[datos.platform] || '#4f46e5';
        const icon = PLATFORM_ICONS[datos.platform] || '🎬';
        const thumb = datos.thumbnail
            ? `<img class="video-thumb" src="${datos.thumbnail}" alt="Miniatura" onerror="this.style.display='none'">`
            : `<div class="video-thumb-placeholder">${icon}</div>`;

        container.innerHTML = `
            <div class="video-card" style="--platform-color: ${color}">
                <div class="platform-badge" style="background:${color}">${icon} ${datos.platform}</div>
                ${thumb}
                <div class="video-info">
                    <p class="video-title">${truncate(datos.title, 100)}</p>
                    ${datos.author ? `<p class="video-author">@${datos.author}</p>` : ''}
                    <a href="${datos.downloadUrl}" target="_blank" download="${generateFilename(datos.platform, datos.title)}" class="download-btn" style="background:${color}">
                        ⬇ Descargar MP4
                    </a>
                </div>
            </div>
        `;

        // Agrega al historial
        addToHistory({ url: urlInput, platform: datos.platform, title: datos.title, thumbnail: datos.thumbnail, downloadUrl: datos.downloadUrl });
        renderHistory();

    } catch (error) {
        showError(container, 'Error de conexión con el servidor.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Buscar';
    }
}

function showError(container, msg) {
    container.innerHTML = `<p class="error-msg">❌ ${msg}</p>`;
}

function truncate(str, n) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n) + '...' : str;
}

// ── Historial ────────────────────────────────────────────────────────────────
function addToHistory(item) {
    const history = getHistory();
    history.unshift({ ...item, timestamp: Date.now() });
    const trimmed = history.slice(0, 20); // max 20 entradas
    localStorage.setItem('sd_history', JSON.stringify(trimmed));
}

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('sd_history') || '[]');
    } catch {
        return [];
    }
}

function clearHistory() {
    localStorage.removeItem('sd_history');
    renderHistory();
}

function renderHistory() {
    const history = getHistory();
    const section = document.getElementById('history-section');
    const list = document.getElementById('history-list');

    if (history.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    list.innerHTML = history.map((item, i) => {
        const color = PLATFORM_COLORS[item.platform] || '#4f46e5';
        const icon = PLATFORM_ICONS[item.platform] || '🎬';
        const date = new Date(item.timestamp).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        return `
            <div class="history-item" onclick="loadFromHistory(${i})">
                ${item.thumbnail
                    ? `<img class="history-thumb" src="${item.thumbnail}" alt="" onerror="this.style.display='none'">`
                    : `<div class="history-thumb-placeholder">${icon}</div>`
                }
                <div class="history-info">
                    <span class="history-platform" style="color:${color}">${icon} ${item.platform}</span>
                    <p class="history-title">${truncate(item.title, 60)}</p>
                    <span class="history-date">${date}</span>
                </div>
                <a href="${item.downloadUrl}" target="_blank" download="video.mp4" class="history-dl" style="background:${color}" onclick="event.stopPropagation()">⬇</a>
            </div>
        `;
    }).join('');
}

function loadFromHistory(index) {
    const history = getHistory();
    const item = history[index];
    if (item) {
        document.getElementById('url-input').value = item.url;
    }
}

// Permite presionar Enter en el input
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('url-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') procesarDescarga();
    });
    renderHistory();
});
