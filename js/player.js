// The bottom player bar: owns the <audio> element and the play queue.

import { FALLBACK_ART, showArtwork } from "./audius.js";
import { isFavorite, onFavoritesChange, toggleFavorite } from "./playlist.js";

const VOLUME_KEY = "encore.volume";
const RESTART_THRESHOLD_SECONDS = 3;
const SEEK_STEP_SECONDS = 5;

const audio = document.getElementById("audio");
const image = document.getElementById("current-song-image");
const title = document.getElementById("current-song-title");
const artist = document.getElementById("current-song-artist");
const likeButton = document.getElementById("like-btn");
const playButton = document.getElementById("play-btn");
const previousButton = document.getElementById("prev-btn");
const nextButton = document.getElementById("next-btn");
const currentTime = document.getElementById("current-time");
const totalTime = document.getElementById("total-time");
const progressBar = document.getElementById("progress-bar");
const progress = document.getElementById("progress");
const volumeButton = document.getElementById("volume-btn");
const volumeControl = document.getElementById("volume-control");
const status = document.getElementById("player-status");

let queue = [];
let index = -1;
let seeking = false;
let trackChangeListener = () => {};

export function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return "0:00";
    }
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

export function onTrackChange(listener) {
    trackChangeListener = listener;
}

export function currentTrack() {
    return queue[index] ?? null;
}

export function isPlaying() {
    return !audio.paused;
}

export function playQueue(tracks, startIndex) {
    queue = tracks;
    loadTrack(startIndex);
}

function loadTrack(newIndex) {
    index = newIndex;
    const track = queue[index];

    status.textContent = "Loading…";
    audio.src = track.streamUrl;
    title.textContent = track.title;
    artist.textContent = track.artist;
    showArtwork(image, track);
    image.alt = `Artwork for ${track.title}`;
    totalTime.textContent = formatTime(track.duration);
    likeButton.disabled = false;
    renderLike();
    showProgress(0);
    updateMediaSession(track);

    audio.play().catch(handlePlaybackError);
    trackChangeListener();
}

function handlePlaybackError(error) {
    // A newer track interrupted this one, which is normal when skipping.
    if (error.name !== "AbortError") {
        status.textContent = "Playback was blocked. Press play to try again.";
    }
}

function togglePlay() {
    if (!currentTrack()) {
        return;
    }
    if (audio.paused) {
        audio.play().catch(handlePlaybackError);
    } else {
        audio.pause();
    }
}

function playNext() {
    if (queue.length) {
        loadTrack((index + 1) % queue.length);
    }
}

function playPrevious() {
    if (!queue.length) {
        return;
    }
    if (audio.currentTime > RESTART_THRESHOLD_SECONDS) {
        audio.currentTime = 0;
    } else {
        loadTrack((index - 1 + queue.length) % queue.length);
    }
}

function duration() {
    return Number.isFinite(audio.duration) ? audio.duration : currentTrack()?.duration ?? 0;
}

function showProgress(seconds) {
    const total = duration();
    const percent = total ? Math.min(100, (seconds / total) * 100) : 0;
    progress.style.width = `${percent}%`;
    currentTime.textContent = formatTime(seconds);
    progressBar.setAttribute("aria-valuenow", String(Math.round(percent)));
    progressBar.setAttribute("aria-valuetext", formatTime(seconds));
}

function positionFromPointer(event) {
    const rect = progressBar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration();
}

function seekBy(seconds) {
    if (currentTrack()) {
        audio.currentTime = Math.min(duration(), Math.max(0, audio.currentTime + seconds));
    }
}

function renderPlayButton() {
    const paused = audio.paused;
    playButton.innerHTML = `<i class="fas ${paused ? "fa-play" : "fa-pause"}"></i>`;
    playButton.setAttribute("aria-label", paused ? "Play" : "Pause");
    trackChangeListener();
}

function renderLike() {
    const track = currentTrack();
    const liked = track !== null && isFavorite(track);
    likeButton.innerHTML = `<i class="${liked ? "fas" : "far"} fa-heart"></i>`;
    likeButton.classList.toggle("liked", liked);
    likeButton.setAttribute("aria-pressed", String(liked));
    likeButton.setAttribute("aria-label", liked ? "Remove from favorites" : "Add to favorites");
}

function renderVolume() {
    const muted = audio.muted || audio.volume === 0;
    const icon = muted ? "fa-volume-mute" : audio.volume < 0.5 ? "fa-volume-down" : "fa-volume-up";
    volumeButton.innerHTML = `<i class="fas ${icon}"></i>`;
    volumeButton.setAttribute("aria-label", muted ? "Unmute" : "Mute");
}

function setVolume(percent) {
    audio.volume = percent / 100;
    audio.muted = false;
    try {
        localStorage.setItem(VOLUME_KEY, String(percent));
    } catch {
        // The volume just won't be remembered.
    }
    renderVolume();
}

function restoreVolume() {
    let saved = null;
    try {
        saved = localStorage.getItem(VOLUME_KEY);
    } catch {
        // Fall back to the slider's default.
    }
    if (saved !== null) {
        volumeControl.value = saved;
    }
    setVolume(Number(volumeControl.value));
}

function updateMediaSession(track) {
    if (!("mediaSession" in navigator)) {
        return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: track.artwork === FALLBACK_ART ? [] : [{ src: track.artwork, sizes: "480x480" }],
    });
}

function isTyping(target) {
    return target instanceof HTMLInputElement && target.type !== "range";
}

export function initPlayer() {
    restoreVolume();
    image.src = FALLBACK_ART;

    playButton.addEventListener("click", togglePlay);
    nextButton.addEventListener("click", playNext);
    previousButton.addEventListener("click", playPrevious);
    likeButton.addEventListener("click", () => {
        if (currentTrack()) {
            toggleFavorite(currentTrack());
        }
    });
    onFavoritesChange(renderLike);

    audio.addEventListener("play", renderPlayButton);
    audio.addEventListener("pause", renderPlayButton);
    audio.addEventListener("playing", () => {
        status.textContent = "";
    });
    audio.addEventListener("waiting", () => {
        status.textContent = "Loading…";
    });
    audio.addEventListener("ended", playNext);
    audio.addEventListener("timeupdate", () => {
        if (!seeking) {
            showProgress(audio.currentTime);
        }
    });
    audio.addEventListener("loadedmetadata", () => {
        totalTime.textContent = formatTime(duration());
    });
    audio.addEventListener("error", () => {
        if (currentTrack()) {
            status.textContent = `Couldn't load "${currentTrack().title}". Try another track.`;
        }
    });

    progressBar.addEventListener("pointerdown", (event) => {
        if (!currentTrack()) {
            return;
        }
        seeking = true;
        progressBar.setPointerCapture(event.pointerId);
        showProgress(positionFromPointer(event));
    });
    progressBar.addEventListener("pointermove", (event) => {
        if (seeking) {
            showProgress(positionFromPointer(event));
        }
    });
    progressBar.addEventListener("pointerup", (event) => {
        if (seeking) {
            audio.currentTime = positionFromPointer(event);
            seeking = false;
        }
    });
    progressBar.addEventListener("pointercancel", () => {
        seeking = false;
    });
    progressBar.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            event.stopPropagation();
            seekBy(event.key === "ArrowRight" ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS);
        }
    });

    volumeControl.addEventListener("input", () => setVolume(Number(volumeControl.value)));
    volumeButton.addEventListener("click", () => {
        audio.muted = !audio.muted;
        renderVolume();
    });

    document.addEventListener("keydown", (event) => {
        // Buttons already respond to Space, and it shouldn't toggle twice.
        if (event.code !== "Space" || isTyping(event.target) || event.target instanceof HTMLButtonElement) {
            return;
        }
        event.preventDefault();
        togglePlay();
    });

    if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("nexttrack", playNext);
        navigator.mediaSession.setActionHandler("previoustrack", playPrevious);
    }
}
