# Encore

A Spotify-style music streaming web app that plays real, full-length songs.
Built with plain HTML, CSS and JavaScript, with no framework, build step or backend.

## Features

- Trending songs on the home page
- Search across the Audius catalog
- Play, pause, previous, next, seek and volume controls
- Autoplay of the next song in the current list
- Favorites saved in your browser
- Genre playlists: Chill Vibes, Workout Mix and Deep Focus
- Layout that works on phones
- Links to any page or search, and working back and forward buttons
- Lock-screen and media-key controls on supported devices

## Where the music comes from

Songs stream from [Audius](https://audius.co), a free music platform with an open
API. It suits a project like this because it needs no API key, serves full tracks
instead of 30-second previews, and allows direct requests from the browser.

Songs belong to the artists who uploaded them. Audius search can also return tracks
locked behind purchases or follows, so the app filters those out.

## Run it locally

The app uses JavaScript modules, so it has to be served rather than opened as a file:

```bash
python3 -m http.server 8765
```

Then open <http://127.0.0.1:8765/>.

## Test it

`tests/smoke.mjs` drives real Chrome through the app against the live Audius API:
playing, seeking, skipping, favorites, search, playlists and phone width.

```bash
node tests/smoke.mjs http://127.0.0.1:8765/
```

It needs Node 22+ and Chrome. Pass a deployed URL to test that instead.

## Project layout

| File | Purpose |
|---|---|
| `js/audius.js` | Calls the Audius API and handles artwork mirrors |
| `js/player.js` | The player bar, audio element and play queue |
| `js/playlist.js` | Favorites and the genre playlists |
| `js/main.js` | Page routing and rendering |

## Disclaimer

This is a learning project, inspired by Spotify's design. It isn't affiliated with
or endorsed by Spotify or Audius.
