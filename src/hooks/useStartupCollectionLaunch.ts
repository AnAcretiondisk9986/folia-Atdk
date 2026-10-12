// src/hooks/useStartupCollectionLaunch.ts
// 启动直达歌单的触发点。
//
// 目标是身份而不是快照，所以这里要等当前数据里出现这条歌单（在线账户歌单、本地曲库都是异步到的），
// 再把它交给导航打开；等不到（没登录、歌单被删、同步还没回来）就在窗口结束后放弃这次启动，
// 不会在用户已经自己在浏览之后突然跳走。只在启动那一次生效，之后设置变化不触发跳转。

import { useEffect, useRef } from 'react';
import type { LocalPlaylist } from '../types';
import type { OnlineProviderId, ProviderCollection } from '../types/onlineMusic';
import type {
    GridViewCollectionDescriptor,
    LocalGridViewCollectionDescriptor,
} from '../library/core/contracts/collection';
import { createOnlineGridViewCollection } from '../components/app/home/gridViewCollectionAdapters';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useCollectionNavigationStore } from '../stores/useCollectionNavigationStore';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { useSearchNavigationStore } from '../stores/useSearchNavigationStore';
import { useStartupCollectionStore } from '../stores/useStartupCollectionStore';
import { isSameStartupCollection, type StartupCollectionTarget } from '../utils/startupCollection';

/** 没有账户时的稳定空数组，免得 selector 每次给出新引用。 */
const NO_COLLECTIONS: ProviderCollection[] = [];

/**
 * 在线账户与本地曲库都是异步到的，冷启动（账户歌单还没缓存）时可能要等上几十秒：
 * 这段时间里一直等目标歌单出现，超时才放弃这次启动。用户自己走开（打开别的集合、进搜索、
 * 切播放页）会立刻放弃，所以窗口只用来兜住「数据一直不来」，不用于限制正常等待。
 */
const STARTUP_COLLECTION_WAIT_MS = 120000;

type StartupCollectionLaunchParams = {
    localPlaylists: LocalPlaylist[];
    openCollection: (collection: GridViewCollectionDescriptor) => void;
};

/**
 * 把保存的目标还原成集合描述；当前数据里还没有这条歌单时返回 null（调用方继续等）。
 * 在线歌单用此刻的集合对象重建，所以改名、曲目变化、封面更新都跟着走。
 */
export const resolveStartupCollectionDescriptor = ({
    target,
    onlineCollections,
    localPlaylists,
    providerId,
}: {
    target: StartupCollectionTarget;
    onlineCollections: ProviderCollection[];
    localPlaylists: LocalPlaylist[];
    providerId: OnlineProviderId;
}): GridViewCollectionDescriptor | null => {
    if (target.source === 'online') {
        const collection = onlineCollections.find(candidate => isSameStartupCollection(target, {
            source: 'online',
            id: candidate.id,
            type: candidate.type,
            providerId: candidate.providerId ?? providerId,
        }));
        if (!collection) return null;
        return createOnlineGridViewCollection(collection, collection.providerId ?? providerId);
    }

    const playlist = localPlaylists.find(candidate => isSameStartupCollection(target, {
        source: 'local',
        id: candidate.id,
        type: 'playlist',
    }));
    if (!playlist) return null;

    // 本地集合的曲目由宿主按 playlistId 重新解析（GridViewOverlayHost 的 resolveLiveLocalCollection），
    // 这里给的 songIds 只是第一帧用的，导入或删除歌曲后照样是当下状态。
    const descriptor: LocalGridViewCollectionDescriptor = {
        source: 'local',
        id: playlist.id,
        name: playlist.name,
        type: 'playlist',
        songIds: playlist.songIds,
        playlistId: playlist.id,
        trackCount: playlist.songIds.length,
        ...(playlist.isFavorite ? { isVirtual: true } : {}),
    };
    return descriptor;
};

/** 启动那一刻还在首页、没打开任何集合、也没进搜索：只有这时才轮到启动直达接管。 */
const isStillAtStartupEntry = (): boolean => (
    useAppViewStore.getState().view === 'home'
    && useCollectionNavigationStore.getState().snapshot === null
    && !useSearchNavigationStore.getState().isSearchOpen
);

export const useStartupCollectionLaunch = ({
    localPlaylists,
    openCollection,
}: StartupCollectionLaunchParams): void => {
    const enabled = useStartupCollectionStore(state => state.startupCollectionEnabled);
    const target = useStartupCollectionStore(state => state.startupCollection);
    const activeProviderId = useOnlineProviderAccountStore(state => state.activeProviderId);
    const onlineCollections = useOnlineProviderAccountStore(
        state => state.accounts[state.activeProviderId]?.collections ?? NO_COLLECTIONS,
    );
    // 这次启动是否已经有结论（打开过、或判定放弃）。组件重挂载才开始新一次启动。
    const consumedRef = useRef(false);

    useEffect(() => {
        if (!enabled || !target || consumedRef.current) return;
        // 用户已经自己走到别处（打开了别的集合、进了搜索、切到播放页）就不再接管。
        if (!isStillAtStartupEntry()) {
            consumedRef.current = true;
            return;
        }
        const descriptor = resolveStartupCollectionDescriptor({
            target,
            onlineCollections,
            localPlaylists,
            providerId: activeProviderId,
        });
        if (!descriptor) return;
        consumedRef.current = true;
        openCollection(descriptor);
    }, [activeProviderId, enabled, localPlaylists, onlineCollections, openCollection, target]);

    useEffect(() => {
        if (!enabled || !target || consumedRef.current) return;
        const timer = setTimeout(() => {
            consumedRef.current = true;
        }, STARTUP_COLLECTION_WAIT_MS);
        return () => clearTimeout(timer);
    }, [enabled, target]);
};
