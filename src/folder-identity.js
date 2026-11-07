// Keep library folder keys unique while showing the directory's real name.

export function folderDisplayName(folder) {
    const handle = folder?.handle;
    if (handle?.name) return handle.name;
    if (handle?.root) return handle.root.split(/[\\/]/).filter(Boolean).at(-1) ?? folder.name;
    return folder?.name ?? "";
}

export function folderPathLabel(path, folders) {
    const slash = path.indexOf("/");
    const key = slash < 0 ? path : path.slice(0, slash);
    const folder = folders.find(item => item.name === key);
    if (!folder) return path;
    const display = folderDisplayName(folder);
    const matchingKeys = new Set(folders.filter(item => folderDisplayName(item) === display).map(item => item.name));
    const label = matchingKeys.size > 1 ? folder.name : display;
    return `${label}${slash < 0 ? "" : path.slice(slash)}`;
}

export async function sameDirectory(left, right) {
    if (left?.root && right?.root) return left.root.replace(/[\\/]+$/, "").toLowerCase() === right.root.replace(/[\\/]+$/, "").toLowerCase();
    if (left === right) return true;
    if (left?.isSameEntry && right) {
        try { return await left.isSameEntry(right); } catch { return false; }
    }
    if (right?.isSameEntry && left) {
        try { return await right.isSameEntry(left); } catch { return false; }
    }
    return false;
}

export async function matchingFolder(folders, handle) {
    for (const folder of folders) {
        if (await sameDirectory(folder.handle, handle)) return folder;
    }
    return undefined;
}

export async function mergeSameDirectoryFolders(folders) {
    const kept = [];
    const remap = new Map();
    for (const folder of folders) {
        const existing = await matchingFolder(kept, folder.handle);
        if (existing) remap.set(folder.name, existing.name);
        else kept.push(folder);
    }
    return { folders: kept, remap };
}

export function mergeFolderReferences(entries, remap) {
    const byPath = new Map();
    const removedIds = [];
    for (const entry of entries) {
        const slash = entry.path.indexOf("/");
        const key = slash < 0 ? entry.path : entry.path.slice(0, slash);
        const target = remap.get(key);
        const path = target ? `${target}${slash < 0 ? "" : entry.path.slice(slash)}` : entry.path;
        const current = { ...entry, path };
        const previous = byPath.get(path);
        if (!previous) {
            byPath.set(path, current);
            continue;
        }
        previous.tags = [...new Set([...(previous.tags ?? []), ...(current.tags ?? [])])];
        previous.added = Math.min(previous.added, current.added);
        if (current.id !== previous.id) removedIds.push(current.id);
    }
    return { entries: [...byPath.values()], removedIds };
}

export async function uniqueFolderName(saved, name, handle) {
    const matching = await matchingFolder(saved, handle);
    if (matching) return matching.name;
    let candidate = name;
    let suffix = 2;
    while (true) {
        const existing = saved.find(folder => folder.name === candidate);
        if (!existing || await sameDirectory(existing.handle, handle)) return candidate;
        candidate = `${name} (${suffix++})`;
    }
}
