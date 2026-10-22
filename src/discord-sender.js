/*
 * Reaction Library Discord upload adapters
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export async function uploadFile(vc, common, channelId, channel, file, spoiler) {
    const draftType = common.DraftType.ChannelMessage;
    await common.UploadHandler.promptToUpload([file], channel, draftType);
    const uploads = [...common.UploadAttachmentStore.getUploads(channelId, draftType)];
    const index = uploads.findIndex(upload => upload.item.file === file);
    if (index < 0) throw new Error("The upload was not accepted.");
    const [upload] = uploads.splice(index, 1);
    if (spoiler) upload.item.isSpoiler = true;
    common.UploadManager.setUploads({ uploads, channelId, draftType });
    const reply = common.PendingReplyStore.getPendingReply(channelId);
    common.FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
    await vc.Util.sendMessage(channelId, {}, false, {
        ...common.MessageActions.getSendMessageOptionsForReply(reply),
        attachmentsToUpload: [upload]
    });
}

export async function uploadVoice(common, channelId, prepared) {
    const reply = common.PendingReplyStore.getPendingReply(channelId);
    const upload = new common.CloudUploader({ file: new File([prepared.blob], "voice-message.ogg", { type: "audio/ogg; codecs=opus" }), isThumbnail: false, platform: 1 }, channelId);
    await new Promise((resolve, reject) => {
        upload.on("complete", resolve);
        upload.on("error", () => reject(new Error("Voice message upload failed.")));
        Promise.resolve(upload.upload()).catch(reject);
    });
    await common.RestAPI.post({
        url: common.Constants.Endpoints.MESSAGES(channelId),
        body: {
            flags: 8192,
            channel_id: channelId,
            content: "",
            nonce: common.SnowflakeUtils.fromTimestamp(Date.now()),
            sticker_ids: [], type: 0,
            attachments: [{ id: "0", filename: "voice-message.ogg", uploaded_filename: upload.uploadedFilename, waveform: prepared.waveform, duration_secs: prepared.duration }],
            message_reference: reply ? common.MessageActions.getSendMessageOptionsForReply(reply)?.messageReference : null
        }
    });
    if (reply && common.PendingReplyStore.getPendingReply(channelId) === reply) common.FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
}
