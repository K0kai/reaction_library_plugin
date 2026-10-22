/*
 * Reaction Library media conversions
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { applyPalette, GIFEncoder, quantize } from "gifenc";

export async function prepareClip(blob, kind, clip, signal, status) {
    if (kind !== "audio" && kind !== "video") throw new Error("Only audio and video can be clipped.");
    if (!globalThis.MediaRecorder) throw new Error("Clip recording is unavailable in this client version.");
    const media = document.createElement(kind);
    const url = URL.createObjectURL(blob);
    let stream;
    let recorder;
    media.preload = "auto";
    media.playsInline = true;
    media.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;pointer-events:none";
    document.body.append(media);
    try {
        await waitForMedia(media, "loadedmetadata", signal, () => { media.src = url; media.load(); });
        const { start, end } = clip;
        if (!Number.isFinite(media.duration) || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > media.duration || end - start < 0.1) throw new Error("Choose a valid clip start and end time.");
        if (start) await waitForMedia(media, "seeked", signal, () => { media.currentTime = start; });
        if (!media.captureStream) throw new Error("Clip recording is unavailable for this format in this client.");
        await media.play();
        signal?.throwIfAborted();
        stream = media.captureStream();
        if (!stream.getTracks().some(track => track.readyState === "live")) throw new Error("Clip recording is unavailable for this format in this client.");
        media.pause();
        if (Math.abs(media.currentTime - start) > 0.005) await waitForMedia(media, "seeked", signal, () => { media.currentTime = start; });
        signal?.throwIfAborted();
        const mimeType = kind === "video" ? ["video/webm", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus"] : ["audio/webm", "audio/webm;codecs=opus"];
        const supported = mimeType.find(type => MediaRecorder.isTypeSupported(type));
        if (!supported) throw new Error("This client cannot encode a clip of this type.");
        recorder = new MediaRecorder(stream, { mimeType: supported });
        const chunks = [];
        return await new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); media.removeEventListener("timeupdate", progress); media.removeEventListener("ended", stop); };
            const fail = error => { if (settled) return; settled = true; cleanup(); reject(error); };
            const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
            const abort = () => { stop(); fail(new Error("Conversion cancelled.")); };
            const progress = () => { status(`Recording clip · ${Math.min(100, Math.round((media.currentTime - start) / (end - start) * 100))}%`); if (media.currentTime >= end) stop(); };
            const timer = setTimeout(stop, Math.ceil((end - start) * 1000) + 1000);
            recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            recorder.onerror = () => fail(new Error("Could not record this clip."));
            recorder.onstop = () => { if (settled) return; settled = true; cleanup(); const result = new Blob(chunks, { type: supported }); result.size ? resolve(result) : reject(new Error("The recorded clip was empty.")); };
            signal?.addEventListener("abort", abort, { once: true });
            media.addEventListener("timeupdate", progress);
            media.addEventListener("ended", stop, { once: true });
            try {
                recorder.start();
                Promise.resolve(media.play()).catch(fail);
            } catch (error) { fail(error); }
        });
    } finally {
        media.pause();
        if (recorder?.state !== "inactive") recorder.stop();
        stream?.getTracks().forEach(track => track.stop());
        media.removeAttribute("src"); media.load(); media.remove(); URL.revokeObjectURL(url);
    }
}

function waitForMedia(video, event, signal, action, timeout = 30000) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        const clean = () => {
            clearTimeout(timer);
            video.removeEventListener(event, done);
            video.removeEventListener("error", failed);
            signal?.removeEventListener("abort", aborted);
        };
        const done = () => { clean(); resolve(); };
        const failed = () => { clean(); reject(new Error("Your client could not decode this video. You can send the original file instead.")); };
        const aborted = () => { clean(); reject(signal.reason); };
        const timer = setTimeout(() => { clean(); reject(new Error("Video decoding timed out. Try sending the original file.")); }, timeout);
        video.addEventListener(event, done, { once: true });
        video.addEventListener("error", failed, { once: true });
        signal?.addEventListener("abort", aborted, { once: true });
        try { action?.(); } catch (error) { clean(); reject(error); }
    });
}

async function conversionVideo(blob, signal) {
    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;pointer-events:none";
    document.body.append(video);
    const dispose = () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
    };
    try {
        await waitForMedia(video, "loadeddata", signal, () => { video.src = url; video.load(); });
        if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error("The video has no readable frames or duration.");
        return { video, dispose };
    } catch (error) { dispose(); throw error; }
}

export async function prepareGif(blob, signal, status) {
    const { video, dispose } = await conversionVideo(blob, signal);
    const canvas = document.createElement("canvas");
    try {
        const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("GIF conversion is unavailable in this client version.");
        const count = Math.max(1, Math.min(900, Math.ceil(video.duration * 10)));
        const gif = GIFEncoder();
        for (let i = 0; i < count; i++) {
            signal?.throwIfAborted();
            const time = i * video.duration / count;
            if (Math.abs(video.currentTime - time) > 0.00001) await waitForMedia(video, "seeked", signal, () => { video.currentTime = time; });
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            const palette = quantize(data, 128);
            const pixels = applyPalette(data, palette);
            const delay = (Math.round((i + 1) * video.duration * 100 / count) - Math.round(i * video.duration * 100 / count)) * 10;
            gif.writeFrame(pixels, canvas.width, canvas.height, { palette, delay: Math.max(10, delay), repeat: 0 });
            if (gif.bytesView().length > 64 * 1024 * 1024) throw new Error("This GIF is too large to prepare in memory. Try a shorter video or send the original file.");
            status(`Converting GIF · frame ${(i + 1).toLocaleString()} / ${count.toLocaleString()}`);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        gif.finish();
        return new Blob([gif.bytesView()], { type: "image/gif" });
    } finally {
        canvas.width = canvas.height = 0;
        dispose();
    }
}

export async function extractVideoAudio(blob, signal, status) {
    const { video, dispose } = await conversionVideo(blob, signal);
    let stream;
    let recorder;
    try {
        if (!video.captureStream || !globalThis.MediaRecorder) throw new Error("This client version cannot extract this video's audio. Try a browser-supported video format.");
        await video.play();
        signal?.throwIfAborted();
        stream = video.captureStream();
        const tracks = stream.getAudioTracks();
        if (!tracks.some(track => track.readyState === "live")) throw new Error("No supported audio track was found in this video.");
        const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) throw new Error("Audio extraction is unavailable in this client version.");
        recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
        const chunks = [];
        return await new Promise((resolve, reject) => {
            const clean = () => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", aborted);
                video.removeEventListener("ended", ended);
                video.removeEventListener("timeupdate", progress);
                video.removeEventListener("error", failed);
                recorder.onstop = recorder.onerror = recorder.ondataavailable = null;
            };
            const failed = () => { clean(); reject(new Error("Could not extract this video's audio.")); };
            const aborted = () => { clean(); reject(signal.reason); };
            const ended = () => { if (recorder.state !== "inactive") recorder.stop(); };
            const progress = () => status(`Extracting audio · ${Math.min(100, Math.floor(video.currentTime / video.duration * 100))}% (plays through once)`);
            const timer = setTimeout(failed, Math.ceil(video.duration * 1000) + 30000);
            recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            recorder.onerror = failed;
            recorder.onstop = () => {
                const audio = new Blob(chunks, { type: mimeType });
                clean();
                if (audio.size) resolve(audio);
                else reject(new Error("The video's audio track was empty."));
            };
            signal?.addEventListener("abort", aborted, { once: true });
            video.addEventListener("ended", ended, { once: true });
            video.addEventListener("timeupdate", progress);
            video.addEventListener("error", failed, { once: true });
            try {
                signal?.throwIfAborted();
                recorder.start();
            } catch (error) { clean(); reject(error); }
        });
    } finally {
        if (recorder && recorder.state !== "inactive") recorder.stop();
        stream?.getTracks().forEach(track => track.stop());
        dispose();
    }
}
