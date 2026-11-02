// Page routing and rendering. Routes live in the URL hash, so playlists and
// searches can be linked to, and the back button works on static hosting.

import { getTrending, searchTracks, showArtwork } from "./audius.js";
import {
    currentTrack,
    formatTime,
    initPlayer,
    isPlaying,
    onTrackChange,
    playQueue,
} from "./player.js";
import {
    PLAYLISTS,
    getFavorites,
    getPlaylistTracks,
    isFavorite,
    onFavoritesChange,
    toggleFavorite,
} from "./playlist.js";

const heading = document.getElementById("view-title");
const subtitle = document.getElementById("view-subtitle");
const grid = document.getElementById("music-grid");
const message = document.getElementById("view-message");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const playlistList = document.getElementById("playlist-list");

const EMPTY_FAVORITES = "Tap the heart on any song and it will show up here.";

let shownTracks = [];
let latestRender = 0;

function iconButton(className, label, icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<i class="${icon}"></i>`;
    return button;
}

function songCard(track, position) {
    const card = document.createElement("article");
    card.className = "song-card";
    card.dataset.trackId = track.id;

    const art = document.createElement("div");
    art.className = "art";
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    showArtwork(image, track);

    const play = iconButton("play-button", `Play ${track.title}`, "fas fa-play");
    play.addEventListener("click", () => playQueue(shownTracks, position));
    art.append(image, play);

    const name = document.createElement("h3");
    name.textContent = track.title;
    name.title = track.title;

    const details = document.createElement("div");
    details.className = "details";
    const artist = document.createElement("p");
    artist.textContent = `${track.artist} · ${formatTime(track.duration)}`;

    const like = iconButton("like-button", `Add ${track.title} to favorites`, "far fa-heart");
    like.addEventListener("click", () => toggleFavorite(track));
    details.append(artist, like);

    card.append(art, name, details);
    return card;
}

function renderHighlights() {
    const current = currentTrack();
    for (const card of grid.children) {
        const active = current !== null && card.dataset.trackId === current.id;
        card.classList.toggle("active", active);
        const icon = card.querySelector(".play-button i");
        icon.className = `fas ${active && isPlaying() ? "fa-volume-up" : "fa-play"}`;
    }
}

function renderFavoriteIcons() {
    shownTracks.forEach((track, position) => {
        const card = grid.children[position];
        const liked = isFavorite(track);
        card.querySelector(".like-button").classList.toggle("liked", liked);
        card.querySelector(".like-button i").className = `${liked ? "fas" : "far"} fa-heart`;
    });
}

function showTracks(tracks, emptyMessage) {
    shownTracks = tracks;
    message.textContent = tracks.length ? "" : emptyMessage;
    grid.replaceChildren(...tracks.map(songCard));
    renderHighlights();
    renderFavoriteIcons();
}

function setActiveLink(route) {
    document.querySelectorAll("[data-route]").forEach((link) => {
        const active = link.dataset.route === route;
        link.classList.toggle("active", active);
        if (active) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

async function renderView(title, description, loadTracks, emptyMessage) {
    const render = ++latestRender;
    heading.textContent = title;
    subtitle.textContent = description;
    document.title = `${title} · Encore`;
    grid.replaceChildren();
    shownTracks = [];
    message.textContent = "Loading…";

    try {
        const tracks = await loadTracks();
        // The user may have moved on while this was loading.
        if (render === latestRender) {
            showTracks(tracks, emptyMessage);
        }
    } catch (error) {
        console.error(error);
        if (render === latestRender) {
            message.textContent = "Couldn't reach the music service. Check your connection and try again.";
        }
    }
}

function route() {
    const [path, query = ""] = location.hash.slice(1).split("?");

    if (path === "/search") {
        const term = new URLSearchParams(query).get("q")?.trim() ?? "";
        searchInput.value = term;
        setActiveLink("/search");
        if (term) {
            renderView(`Results for "${term}"`, "", () => searchTracks(term), `Nothing found for "${term}".`);
        } else {
            renderView("Search", "", async () => [], "Search for any song or artist above.");
            searchInput.focus();
        }
        return;
    }

    if (path.startsWith("/playlist/")) {
        const playlist = PLAYLISTS.find((item) => item.id === path.slice("/playlist/".length));
        if (playlist) {
            setActiveLink(path);
            const description = playlist.genre
                ? `Trending in ${playlist.genre}`
                : "Songs you've saved in this browser";
            renderView(playlist.name, description, () => getPlaylistTracks(playlist), EMPTY_FAVORITES);
            return;
        }
    }

    if (path === "/library") {
        setActiveLink(path);
        renderView("Your Library", "Songs you've saved in this browser", async () => getFavorites(), EMPTY_FAVORITES);
        return;
    }

    setActiveLink("/");
    renderView("Popular Songs", "Trending on Audius right now", () => getTrending(), "No songs right now.");
}

function renderSidebarPlaylists() {
    playlistList.replaceChildren(
        ...PLAYLISTS.map((playlist) => {
            const link = document.createElement("a");
            link.href = `#/playlist/${playlist.id}`;
            link.dataset.route = `/playlist/${playlist.id}`;
            link.innerHTML = `<i class="fas ${playlist.icon}"></i>`;
            link.append(playlist.name);

            const item = document.createElement("li");
            item.append(link);
            return item;
        })
    );
}

searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const term = searchInput.value.trim();
    if (term) {
        location.hash = `/search?q=${encodeURIComponent(term)}`;
    }
});

window.addEventListener("hashchange", route);

onFavoritesChange(() => {
    const favoritesOnScreen = location.hash === "#/library" || location.hash === "#/playlist/favorites";
    if (favoritesOnScreen) {
        showTracks(getFavorites(), EMPTY_FAVORITES);
    } else {
        renderFavoriteIcons();
    }
});

onTrackChange(renderHighlights);
renderSidebarPlaylists();
initPlayer();
route();
