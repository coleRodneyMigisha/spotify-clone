// End-to-end smoke test: drives real Chrome through the app against live Audius.
// Needs Node 22+ and Chrome. Serve the site first, or point at a deployed URL:
//
//     python3 -m http.server 8765 &
//     node tests/smoke.mjs http://127.0.0.1:8765/

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SITE = process.argv[2] ?? "http://127.0.0.1:8765/";
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), "encore-smoke-"));

const chrome = spawn(
    process.env.CHROME ?? "google-chrome",
    [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--mute-audio",
        "--autoplay-policy=no-user-gesture-required",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${profile}`,
        "--window-size=1280,800",
        "about:blank",
    ],
    { stdio: "ignore" }
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            const page = targets.find((target) => target.type === "page");
            const socket = new WebSocket(page.webSocketDebuggerUrl);
            await new Promise((resolve, reject) => {
                socket.onopen = resolve;
                socket.onerror = reject;
            });
            return socket;
        } catch {
            await sleep(200);
        }
    }
    throw new Error("Chrome did not start");
}

const socket = await connect();
const pending = new Map();
const pageErrors = [];
let nextId = 1;

// Community artwork nodes go down routinely; the app falls back to mirrors.
function isArtworkFailure(entry) {
    return entry.source === "network" && /\.jpg(\?|$)/.test(entry.url ?? "");
}

socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
    } else if (message.method === "Runtime.exceptionThrown") {
        pageErrors.push(message.params.exceptionDetails.exception?.description ?? "exception");
    } else if (
        message.method === "Log.entryAdded" &&
        message.params.entry.level === "error" &&
        !isArtworkFailure(message.params.entry)
    ) {
        pageErrors.push(`${message.params.entry.text} ${message.params.entry.url ?? ""}`);
    }
};

function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve) => {
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const { result } = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (result.exceptionDetails) {
        throw new Error(`${expression}: ${result.exceptionDetails.text}`);
    }
    return result.result.value;
}

async function waitFor(expression, label, timeoutMs = 45000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(expression)) {
            return;
        }
        await sleep(250);
    }
    throw new Error(`timed out waiting for: ${label}`);
}

async function check(name, run) {
    const started = Date.now();
    await run();
    console.log(`ok   ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

const audio = "document.getElementById('audio')";
const hasCards = "document.querySelectorAll('.song-card').length > 0";

async function goTo(hash) {
    await evaluate(`location.hash = ${JSON.stringify(hash)}`);
}

let exitCode = 0;
try {
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: SITE });

    await check("home loads trending songs", () => waitFor(hasCards, "song cards"));

    await check("clicking a song plays it past 2 seconds", async () => {
        await evaluate("document.querySelector('.play-button').click()");
        await waitFor(`${audio}.currentTime > 2 && !${audio}.paused`, "audio advancing");
    });

    await check("the player shows the track and a long duration", async () => {
        const title = await evaluate("document.getElementById('current-song-title').textContent");
        if (title === "Select a song") throw new Error("title not updated");
        const duration = await evaluate(`${audio}.duration`);
        if (!(duration > 60)) throw new Error(`duration ${duration}: looks like a preview clip`);
    });

    await check("clicking the progress bar seeks", async () => {
        await evaluate(`(() => {
            const bar = document.getElementById("progress-bar");
            const rect = bar.getBoundingClientRect();
            const init = { bubbles: true, pointerId: 1, clientX: rect.left + rect.width / 2, clientY: rect.top + 5 };
            bar.setPointerCapture = () => {};
            bar.dispatchEvent(new PointerEvent("pointerdown", init));
            bar.dispatchEvent(new PointerEvent("pointerup", init));
        })()`);
        await waitFor(
            `Math.abs(${audio}.currentTime / ${audio}.duration - 0.5) < 0.05`,
            "seek to the middle"
        );
    });

    await check("pause and resume", async () => {
        await evaluate("document.getElementById('play-btn').click()");
        await waitFor(`${audio}.paused`, "paused");
        await evaluate("document.getElementById('play-btn').click()");
        await waitFor(`!${audio}.paused`, "resumed");
    });

    await check("next plays a different song", async () => {
        const before = await evaluate(`${audio}.src`);
        await evaluate("document.getElementById('next-btn').click()");
        await waitFor(`${audio}.src !== ${JSON.stringify(before)}`, "new source");
        await waitFor(`${audio}.currentTime > 1`, "next song advancing");
    });

    await check("volume slider changes the audio volume", async () => {
        await evaluate(`(() => {
            const slider = document.getElementById("volume-control");
            slider.value = 30;
            slider.dispatchEvent(new Event("input"));
        })()`);
        await waitFor(`Math.abs(${audio}.volume - 0.3) < 0.01`, "volume 0.3");
    });

    await check("favorites appear in the library and survive a reload", async () => {
        await evaluate("document.getElementById('like-btn').click()");
        await goTo("/library");
        await waitFor("document.querySelectorAll('.song-card').length === 1", "one favorite");
        await send("Page.reload");
        await sleep(1000);
        await waitFor("document.querySelectorAll('.song-card').length === 1", "favorite after reload");
    });

    await check("removing a favorite updates the library", async () => {
        await evaluate("document.querySelector('.song-card .like-button').click()");
        await waitFor("document.querySelectorAll('.song-card').length === 0", "empty library");
    });

    await check("search finds songs", async () => {
        await evaluate(`(() => {
            document.getElementById("search-input").value = "lofi";
            document.getElementById("search-form").requestSubmit();
        })()`);
        await waitFor(hasCards, "search results");
        await waitFor("location.hash.startsWith('#/search?q=lofi')", "search route");
    });

    await check("every generated playlist has songs", async () => {
        for (const id of ["chill", "workout", "focus"]) {
            await goTo(`/playlist/${id}`);
            await waitFor(
                `document.getElementById("view-title").textContent !== "" && document.getElementById("view-message").textContent === "" && ${hasCards}`,
                `playlist ${id}`
            );
        }
    });

    await check("no horizontal page scroll at phone width", async () => {
        await send("Emulation.setDeviceMetricsOverride", {
            width: 360,
            height: 740,
            deviceScaleFactor: 1,
            mobile: true,
        });
        await sleep(300);
        const overflow = await evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth"
        );
        if (overflow > 0) throw new Error(`page overflows by ${overflow}px`);
    });

    if (pageErrors.length) {
        throw new Error(`page errors:\n${pageErrors.join("\n")}`);
    }
    console.log("ok   no errors in the page console");
} catch (error) {
    console.error(`FAIL ${error.message}`);
    exitCode = 1;
} finally {
    socket.close();
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
}

process.exit(exitCode);
