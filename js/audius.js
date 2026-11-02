// Audius is a free music platform with an open API: full-length tracks, no key,
// and CORS enabled, so the browser can talk to it directly with no backend.

const API = "https://api.audius.co/v1";
const APP_NAME = "encore-music-demo";
const RESULT_LIMIT = 40;

// Shown when a track has no artwork, or its image fails to load.
export const FALLBACK_ART =
    "data:image/svg+xml," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="#282828"/>
            <path fill="#7a7a7a" d="M40 28v34a10 10 0 1 0 6 9V40l24-6v22a10 10 0 1 0 6 9V21z"/>
        </svg>`
    );

async function request(path, params = {}) {
    const url = new URL(API + path);
    url.search = new URLSearchParams({ ...params, app_name: APP_NAME });

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Audius returned ${response.status}`);
    }
    const body = await response.json();
    return body.data ?? [];
}

// Audius artwork is hosted on community nodes, and some are down at any given
// time, so each image comes with mirror hosts to fall back on.
function artworkUrls(artwork) {
    const url = artwork?.["480x480"] ?? artwork?.["150x150"];
    if (!url) {
        return [];
    }
    const { pathname } = new URL(url);
    return [url, ...(artwork.mirrors ?? []).map((host) => host + pathname)];
}

// Shows a track's artwork, moving down the list each time an image fails.
export function showArtwork(image, track) {
    const urls = [...(track.artworkMirrors ?? []), FALLBACK_ART];
    image.onerror = () => {
        image.src = urls.shift() ?? FALLBACK_ART;
        if (!urls.length) {
            image.onerror = null;
        }
    };
    image.src = track.artwork;
}

function toTrack(raw) {
    const [artwork = FALLBACK_ART, ...artworkMirrors] = artworkUrls(raw.artwork);
    return {
        id: raw.id,
        title: raw.title,
        artist: raw.user?.name ?? "Unknown artist",
        duration: raw.duration,
        artwork,
        artworkMirrors,
        streamUrl: `${API}/tracks/${raw.id}/stream?app_name=${APP_NAME}`,
    };
}

// Some tracks are locked behind purchases or follows, so they can't be played here.
function playable(tracks) {
    return tracks
        .filter((track) => track.is_streamable && !track.is_stream_gated)
        .map(toTrack);
}

export async function getTrending(genre) {
    const params = { limit: RESULT_LIMIT };
    if (genre) {
        params.genre = genre;
    }
    return playable(await request("/tracks/trending", params));
}

export async function searchTracks(query) {
    return playable(await request("/tracks/search", { query, limit: RESULT_LIMIT }));
}
