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
    return folder ? `${folderDisplayName(folder)}${slash < 0 ? "" : path.slice(slash)}` : path;
}

async function sameDirectory(left, right) {
    if (left?.root && right?.root) return left.root === right.root;
    if (left === right) return true;
    if (left?.isSameEntry && right) {
        try { return await left.isSameEntry(right); } catch { return false; }
    }
    if (right?.isSameEntry && left) {
        try { return await right.isSameEntry(left); } catch { return false; }
    }
    return false;
}

export async function uniqueFolderName(saved, name, handle) {
    let candidate = name;
    let suffix = 2;
    while (true) {
        const existing = saved.find(folder => folder.name === candidate);
        if (!existing || await sameDirectory(existing.handle, handle)) return candidate;
        candidate = `${name} (${suffix++})`;
    }
}
