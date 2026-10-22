/*
 * Reaction Library voice encoding
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

function waveform(samples, duration) {
    const bins = new Uint8Array(Math.min(256, Math.max(32, Math.ceil(duration * 10))));
    for (let i = 0; i < bins.length; i++) {
        const start = Math.floor(i * samples.length / bins.length);
        const end = Math.floor((i + 1) * samples.length / bins.length);
        let sum = 0;
        for (let j = start; j < end; j++) sum += samples[j] ** 2;
        bins[i] = Math.min(255, Math.round(Math.sqrt(sum / Math.max(1, end - start)) * 255));
    }
    return btoa(String.fromCharCode(...bins));
}

export function oggPage(packet, sequence, granule, flags, serial) {
    const segments = Math.floor(packet.length / 255) + 1;
    if (segments > 255) throw new Error("Audio packet is too large.");
    const page = new Uint8Array(27 + segments + packet.length);
    const view = new DataView(page.buffer);
    page.set(new TextEncoder().encode("OggS"));
    page[5] = flags;
    view.setBigUint64(6, BigInt(granule), true);
    view.setUint32(14, serial, true);
    view.setUint32(18, sequence, true);
    page[26] = segments;
    for (let i = 0; i < segments; i++) page[27 + i] = Math.min(255, packet.length - i * 255);
    page.set(packet, 27 + segments);
    let crc = 0;
    for (const byte of page) {
        crc ^= byte << 24;
        for (let i = 0; i < 8; i++) crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0);
    }
    view.setUint32(22, crc >>> 0, true);
    return page;
}

export async function prepareVoice(blob, video = false, signal, clip, { status, extractVideoAudio }) {
    const context = new AudioContext();
    let decoded;
    try {
        try { decoded = await context.decodeAudioData(await blob.arrayBuffer()); }
        catch (error) {
            if (!video) throw error;
            status("Extracting the video's audio in memory…");
            const audio = await extractVideoAudio(blob, signal);
            decoded = await context.decodeAudioData(await audio.arrayBuffer());
        }
    }
    finally { await context.close(); }
    const start = clip?.start ?? 0;
    const end = clip ? Math.min(clip.end, decoded.duration) : decoded.duration;
    const duration = end - start;
    signal?.throwIfAborted();
    if (!Number.isFinite(duration) || duration <= 0 || start < 0 || (clip && clip.end - start < 0.1)) throw new Error("This audio file is empty or could not be decoded.");
    const offline = new OfflineAudioContext(1, Math.ceil(duration * 48000), 48000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0, start, duration);
    const samples = (await offline.startRendering()).getChannelData(0);
    const wave = waveform(samples, duration);
    const headerBytes = new Uint8Array(await blob.slice(0, 256).arrayBuffer());
    const signature = new TextDecoder().decode(headerBytes);
    if (!clip && signature.startsWith("OggS") && signature.includes("OpusHead")) return { blob, duration, waveform: wave };
    if (!globalThis.AudioEncoder || !globalThis.AudioData) throw new Error("Voice conversion is unavailable in this client version. You can send this as a file, or use OGG Opus audio.");
    const config = { codec: "opus", sampleRate: 48000, numberOfChannels: 1, bitrate: 32000, opus: { frameDuration: 20000 } };
    if (!(await AudioEncoder.isConfigSupported(config)).supported) throw new Error("This client version cannot encode voice messages. Send the original file instead.");
    const packets = [];
    let header;
    let encodingError;
    const encoder = new AudioEncoder({
        output(chunk, metadata) {
            const packet = new Uint8Array(chunk.byteLength);
            chunk.copyTo(packet);
            packets.push(packet);
            if (metadata?.decoderConfig?.description) header = new Uint8Array(metadata.decoderConfig.description).slice();
        },
        error: error => { encodingError = error; }
    });
    try {
        encoder.configure(config);
        for (let offset = 0; offset < samples.length; offset += 960) {
            signal?.throwIfAborted();
            const data = new Float32Array(960);
            data.set(samples.subarray(offset, offset + 960));
            const frame = new AudioData({ format: "f32", sampleRate: 48000, numberOfFrames: 960, numberOfChannels: 1, timestamp: Math.round(offset / 48000 * 1000000), data });
            try { encoder.encode(frame); } finally { frame.close(); }
            while (encoder.encodeQueueSize > 50 && !encodingError) await new Promise(resolve => setTimeout(resolve, 0));
            if (encodingError) throw encodingError;
        }
        await encoder.flush();
        if (encodingError) throw encodingError;
    } finally { if (encoder.state !== "closed") encoder.close(); }
    if (!packets.length) throw new Error("Voice conversion produced no audio.");
    if (!header || new TextDecoder().decode(header.subarray(0, 8)) !== "OpusHead") {
        header = new Uint8Array(19);
        header.set(new TextEncoder().encode("OpusHead"));
        header[8] = 1;
        header[9] = 1;
        const view = new DataView(header.buffer);
        view.setUint16(10, 312, true);
        view.setUint32(12, 48000, true);
    }
    const preskip = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint16(10, true);
    const tags = new Uint8Array(16);
    tags.set(new TextEncoder().encode("OpusTags"));
    const serial = crypto.getRandomValues(new Uint32Array(1))[0];
    const pages = [oggPage(header, 0, 0, 2, serial), oggPage(tags, 1, 0, 0, serial)];
    packets.forEach((packet, i) => pages.push(oggPage(packet, i + 2, i === packets.length - 1 ? Math.min((i + 1) * 960, samples.length + preskip) : (i + 1) * 960, i === packets.length - 1 ? 4 : 0, serial)));
    return { blob: new Blob(pages, { type: "audio/ogg; codecs=opus" }), duration, waveform: wave };
}
