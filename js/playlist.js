// Favorites live in this browser's localStorage. The other playlists are
// generated from what's trending in a genre on Audius.

import { getTrending } from "./audius.js";

const FAVORITES_KEY = "encore.favorites";

export const PLAYLISTS = [
    { id: "favorites", name: "My Favorites", icon: "fa-heart" },
    { id: "chill", name: "Chill Vibes", icon: "fa-moon", genre: "Lo-Fi" },
    { id: "workout", name: "Workout Mix", icon: "fa-dumbbell", genre: "Hip-Hop/Rap" },
    { id: "focus", name: "Deep Focus", icon: "fa-brain", genre: "Ambient" },
];

// Storage can be unavailable (private windows, blocked site data). Favorites
// then last for the visit instead of breaking the app.
let favorites = loadFavorites();
const listeners = new Set();

function loadFavorites() {
    try {
        return JSON.parse(localStorage.getItem(FAVORITES_KEY)) ?? [];
    } catch {
        return [];
    }
}

function saveFavorites() {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
        // Keep working from memory.
    }
}

export function getFavorites() {
    return [...favorites];
}

export function isFavorite(track) {
    return favorites.some((favorite) => favorite.id === track.id);
}

export function toggleFavorite(track) {
    favorites = isFavorite(track)
        ? favorites.filter((favorite) => favorite.id !== track.id)
        : [track, ...favorites];
    saveFavorites();
    listeners.forEach((listener) => listener());
}

export function onFavoritesChange(listener) {
    listeners.add(listener);
}

export async function getPlaylistTracks(playlist) {
    return playlist.id === "favorites" ? getFavorites() : getTrending(playlist.genre);
}
