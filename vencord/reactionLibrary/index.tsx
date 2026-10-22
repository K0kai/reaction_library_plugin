/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import * as DataStore from "@api/DataStore";
import { sendMessage } from "@utils/discord";
import definePlugin, { PluginNative } from "@utils/types";
import type { CloudUpload } from "@vencord/discord-types";
import { findLazy } from "@webpack";
import * as Common from "@webpack/common";

import { createReactionLibrary } from "./runtime";

const CloudUploader: typeof CloudUpload = findLazy(module => module.prototype?.trackUploadFinished);
let library: ReturnType<typeof createReactionLibrary> | undefined;

function LibraryIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="m5 16 5-5 3 3 3-3 3 3" stroke="currentColor" strokeWidth="2" />
        <circle cx="16.5" cy="8" r="1.5" fill="currentColor" />
    </svg>;
}

export default definePlugin({
    name: "ReactionLibrary",
    description: "Browse local media with tags, previews, and GIF or voice message conversion.",
    authors: [],
    dependencies: ["ChatInputButtonAPI"],
    start() {
        const native = IS_WEB ? undefined : VencordNative.pluginHelpers.ReactionLibrary as PluginNative<typeof import("./native")>;
        library = createReactionLibrary({
            Api: { DataStore },
            Webpack: { Common: { ...Common, CloudUploader } },
            Util: { sendMessage },
            Native: native
        }, { mountButton: false });
        library.start();
    },
    stop() {
        library?.stop();
        library = undefined;
    },
    chatBarButton: {
        icon: LibraryIcon,
        render({ isAnyChat }) {
            if (!isAnyChat) return null;
            return <ChatBarButton
                tooltip={/^pt(?:-|$)/i.test(Common.LocaleStore?.locale ?? "") ? "Biblioteca de reações" : "Reaction Library"}
                onClick={event => { void library?.toggle(event.currentTarget); }}
                buttonProps={{ "aria-haspopup": "dialog" }}
            >
                <span className="reaction-library-button"><LibraryIcon /></span>
            </ChatBarButton>;
        }
    }
});
