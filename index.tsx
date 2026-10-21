/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, DraftType, FluxDispatcher, MessageActions, Modal, openModal, PendingReplyStore, SelectedChannelStore, showToast, TextInput, UploadAttachmentStore, UploadHandler, UploadManager, useEffect, useRef, useState } from "@webpack/common";

type Kind = "image" | "video" | "audio";
type Entry = { id: string; name: string; path: string; kind: Kind; tags: string[]; added: number; };

const store = DataStore.createStore("ReactionLibrary", "files");
const indexKey = "index";
const fileKey = (id: string) => `file:${id}`;

function kindOf(file: File): Kind | null {
    if (file.type.startsWith("image/") || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)) return "image";
    if (file.type.startsWith("video/") || /\.(?:avi|m4v|mkv|mov|mp4|webm)$/i.test(file.name)) return "video";
    if (file.type.startsWith("audio/") || /\.(?:aac|flac|m4a|mp3|ogg|opus|wav)$/i.test(file.name)) return "audio";
    return null;
}

async function send(file: File) {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return;

    await UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage);
    const uploads = [...UploadAttachmentStore.getUploads(channelId, DraftType.ChannelMessage)];
    const index = uploads.findIndex(upload => upload.item.file === file);
    if (index < 0) return;
    const [upload] = uploads.splice(index, 1);
    UploadManager.setUploads({ uploads, channelId, draftType: DraftType.ChannelMessage });
    const reply = PendingReplyStore.getPendingReply(channelId);
    FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
    void sendMessage(channelId, {}, false, {
        ...MessageActions.getSendMessageOptionsForReply(reply),
        attachmentsToUpload: [upload]
    });
}

function Picker(props: RenderModalProps) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [query, setQuery] = useState("");
    const [kind, setKind] = useState("all");
    const [sort, setSort] = useState("newest");
    const [editing, setEditing] = useState<string | null>(null);
    const [tags, setTags] = useState("");
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let active = true;
        void DataStore.get<Entry[]>(indexKey, store).then(saved => { if (active) setEntries(saved ?? []); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        let active = true;
        const urls: string[] = [];
        void Promise.all(entries.filter(entry => entry.kind === "image").map(async entry => {
            const blob = await DataStore.get<Blob>(fileKey(entry.id), store);
            if (!blob) return null;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return [entry.id, url] as const;
        })).then(pairs => {
            if (active) setPreviews(Object.fromEntries(pairs.filter(pair => pair !== null)));
            else urls.forEach(URL.revokeObjectURL);
        });
        return () => { active = false; urls.forEach(URL.revokeObjectURL); };
    }, [entries]);

    async function importFiles(files: FileList | null) {
        if (!files) return;
        const next = [...entries];
        for (const file of Array.from(files)) {
            const fileKind = kindOf(file);
            if (!fileKind) continue;
            const path = (file as File & { webkitRelativePath?: string; }).webkitRelativePath || file.name;
            const existing = next.find(entry => entry.path === path);
            const id = existing?.id ?? crypto.randomUUID();
            await DataStore.set(fileKey(id), file, store);
            if (!existing) next.push({ id, name: file.name, path, kind: fileKind, tags: [], added: Date.now() });
        }
        await DataStore.set(indexKey, next, store);
        setEntries(next);
        if (input.current) input.current.value = "";
    }

    async function saveTags(entry: Entry) {
        const next = entries.map(item => item.id === entry.id
            ? { ...item, tags: [...new Set(tags.split(",").map(tag => tag.trim()).filter(Boolean))] }
            : item);
        await DataStore.set(indexKey, next, store);
        setEntries(next);
        setEditing(null);
    }

    async function sendEntry(entry: Entry) {
        const blob = await DataStore.get<Blob>(fileKey(entry.id), store);
        if (!blob) return;
        try {
            await send(new File([blob], entry.name, { type: blob.type }));
            props.onClose();
        } catch {
            showToast({ text: `Couldn't send ${entry.name}.`, variant: "critical" });
        }
    }

    const shown = entries.filter(entry =>
        (kind === "all" || entry.kind === kind) &&
        `${entry.name} ${entry.path} ${entry.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())
    ).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.added - b.added : b.added - a.added);

    return <Modal {...props} title="Reaction Library">
        <div className="vc-reaction-library">
            <div className="vc-reaction-library-toolbar">
                <TextInput value={query} onChange={setQuery} placeholder="Search names, folders, and tags" />
                <select aria-label="Type" value={kind} onChange={event => setKind(event.currentTarget.value)}>
                    <option value="all">All types</option><option value="image">Images and GIFs</option>
                    <option value="video">Videos</option><option value="audio">Audio</option>
                </select>
                <select aria-label="Sort" value={sort} onChange={event => setSort(event.currentTarget.value)}>
                    <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option>
                </select>
            </div>
            <input ref={input} hidden type="file" multiple accept="image/*,video/*,audio/*" onChange={event => void importFiles(event.currentTarget.files)} {...{ webkitdirectory: "" }} />
            <Button onClick={() => input.current?.click()}>Add folder</Button>
            {entries.length === 0 && <p className="vc-reaction-library-empty">Choose a folder to start your reaction library.</p>}
            {entries.length > 0 && shown.length === 0 && <p className="vc-reaction-library-empty">No reactions match your search.</p>}
            <div className="vc-reaction-library-grid">
                {shown.map(entry => <div className="vc-reaction-library-item" key={entry.id}>
                    <button className="vc-reaction-library-send" onClick={() => void sendEntry(entry)} title={`Send ${entry.name}`}>
                        {previews[entry.id] ? <img src={previews[entry.id]} alt="" /> : <span>{entry.kind === "video" ? "▶" : "♫"}</span>}
                        <strong>{entry.name}</strong>
                    </button>
                    {editing === entry.id ? <div className="vc-reaction-library-tags">
                        <TextInput value={tags} onChange={setTags} placeholder="Tags, separated by commas" />
                        <Button onClick={() => void saveTags(entry)}>Save</Button>
                    </div> : <button className="vc-reaction-library-edit" onClick={() => { setEditing(entry.id); setTags(entry.tags.join(", ")); }}>
                        {entry.tags.length ? entry.tags.join(", ") : "Add tags"}
                    </button>}
                </div>)}
            </div>
        </div>
    </Modal>;
}

const LibraryIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/><path d="m5 16 5-5 3 3 3-3 3 3" stroke="currentColor" strokeWidth="2"/><circle cx="16.5" cy="8" r="1.5" fill="currentColor"/></svg>;

const LibraryButton: ChatBarButtonFactory = ({ isAnyChat }) => isAnyChat ? <ChatBarButton
    tooltip="Reaction Library"
    onClick={() => openModal(props => <Picker {...props} />)}
    buttonProps={{ "aria-haspopup": "dialog" }}
><LibraryIcon /></ChatBarButton> : null;

export default definePlugin({
    name: "ReactionLibrary",
    description: "Keep a searchable local library of reactions and send them from chat.",
    authors: [Devs.Ven],
    dependencies: ["ChatInputButtonAPI"],
    chatBarButton: { icon: LibraryIcon, render: LibraryButton }
});
