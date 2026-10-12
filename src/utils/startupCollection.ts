// src/utils/startupCollection.ts
// 「启动直达歌单」的目标身份：只记来源、id、类型、provider 与展示字段。
//
// 为什么不连整份集合描述一起存：曲目数、封面、收藏状态都会变，启动时按身份在当前已加载的
// 歌单里找同一条目、用新鲜对象重建描述（见 hooks/useStartupCollectionLaunch），打开的是这条
// 歌单的当下状态，而不是一份写死的快照。纯函数，store 与设置面板共用。

import type { LocalPlaylist } from '../types';

/** 目标歌单的来源：在线 provider 歌单，或本地自建歌单。 */
export type StartupCollectionSource = 'online' | 'local';

export type StartupCollectionTarget = {
    source: StartupCollectionSource;
    /** 在线是 provider 的集合 id，本地是歌单 id。 */
    id: string;
    /** 在线集合的 type（歌单 / 云盘……），本地固定 'playlist'。 */
    type: string;
    name: string;
    coverUrl?: string;
    /** 在线集合所属 provider；本地歌单没有。 */
    providerId?: string;
};

/** 用来在当前数据里认出目标的那几个字段。 */
export type StartupCollectionCandidate = {
    source: StartupCollectionSource;
    id: string | number;
    type: string;
    providerId?: string;
};

/** 在线集合构造目标时只读这几个字段（ProviderCollection 是它的超集）。 */
export type OnlineCollectionIdentity = {
    id: string | number;
    name: string;
    type: string;
    coverUrl?: string;
    providerId?: string;
};

const TARGET_PAYLOAD_VERSION = 1;

const asNonEmptyString = (value: unknown): string | null => (
    typeof value === 'string' && value.trim() !== '' ? value : null
);

/** 解析 localStorage 里的目标；结构不认识时当作没设置过（旧数据、手改坏了都不该让启动卡住）。 */
export const parseStartupCollectionTarget = (raw: string | null): StartupCollectionTarget | null => {
    if (!raw) return null;
    let payload: unknown;
    try {
        payload = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof payload !== 'object' || payload === null) return null;

    const record = payload as Record<string, unknown>;
    if (record.v !== TARGET_PAYLOAD_VERSION) return null;

    const source = record.source === 'online' || record.source === 'local' ? record.source : null;
    const id = asNonEmptyString(record.id);
    const type = asNonEmptyString(record.type);
    const name = asNonEmptyString(record.name);
    const providerId = asNonEmptyString(record.providerId);
    if (!source || !id || !type || !name) return null;
    // 在线歌单没有 provider 就认不回来（同名 id 在不同平台都有），当没设置过。
    if (source === 'online' && !providerId) return null;

    const coverUrl = asNonEmptyString(record.coverUrl);
    return {
        source,
        id,
        type,
        name,
        ...(coverUrl ? { coverUrl } : {}),
        ...(providerId ? { providerId } : {}),
    };
};

export const serializeStartupCollectionTarget = (target: StartupCollectionTarget): string => (
    JSON.stringify({ v: TARGET_PAYLOAD_VERSION, ...target })
);

/** 目标与候选是不是同一条歌单：来源 + provider + 类型 + id。不看名字，名字会改，也不是身份。 */
export const isSameStartupCollection = (
    target: StartupCollectionTarget,
    candidate: StartupCollectionCandidate,
): boolean => {
    if (target.source !== candidate.source) return false;
    if (String(target.id) !== String(candidate.id)) return false;
    if (target.type !== candidate.type) return false;
    if (target.source === 'online') {
        return Boolean(target.providerId) && target.providerId === candidate.providerId;
    }
    return true;
};

export const toStartupCollectionTargetFromOnline = (
    collection: OnlineCollectionIdentity,
): StartupCollectionTarget | null => {
    const id = collection.id === null || collection.id === undefined ? '' : String(collection.id);
    const providerId = asNonEmptyString(collection.providerId);
    const name = asNonEmptyString(collection.name);
    const type = asNonEmptyString(collection.type);
    if (!id || !providerId || !name || !type) return null;
    const coverUrl = asNonEmptyString(collection.coverUrl);
    return {
        source: 'online',
        id,
        type,
        name,
        providerId,
        ...(coverUrl ? { coverUrl } : {}),
    };
};

export const toStartupCollectionTargetFromLocal = (
    playlist: Pick<LocalPlaylist, 'id' | 'name'>,
): StartupCollectionTarget | null => {
    const id = playlist.id === null || playlist.id === undefined ? '' : String(playlist.id);
    const name = asNonEmptyString(playlist.name);
    if (!id || !name) return null;
    return { source: 'local', id, type: 'playlist', name };
};
