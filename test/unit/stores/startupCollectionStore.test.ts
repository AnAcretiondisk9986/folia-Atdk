import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    isSameStartupCollection,
    parseStartupCollectionTarget,
    serializeStartupCollectionTarget,
    toStartupCollectionTargetFromLocal,
    toStartupCollectionTargetFromOnline,
    type StartupCollectionTarget,
} from '@/utils/startupCollection';

// test/unit/stores/startupCollectionStore.test.ts
// 「启动直达歌单」：目标身份的解析与匹配、store 的读回与持久化、启动时的集合描述还原（数据没到时不还原）、
// 以及命令面板里那两个开关 / 清除命令。store 在 import 时读存储，所以读回类用例每个都重新 import 一份。

const ENABLED_KEY = 'startup_collection_enabled';
const TARGET_KEY = 'startup_collection_target';

const ONLINE_TARGET: StartupCollectionTarget = {
    source: 'online',
    id: '7384921',
    type: 'playlist',
    name: '我喜欢的音乐',
    providerId: 'netease',
};

let storage: Map<string, string>;

const stubBrowserStorage = (initial: Record<string, string> = {}) => {
    storage = new Map(Object.entries(initial));
    // 命令注册表会连带 import 一批在模块初始化时读 window.localStorage 的 store，
    // 所以 window 上必须挂着同一份存储，而不只是 stubGlobal('localStorage')。
    const browserStorage = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
        clear: () => { storage.clear(); },
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() { return storage.size; },
    };
    vi.stubGlobal('localStorage', browserStorage);
    vi.stubGlobal('window', { localStorage: browserStorage });
};

const loadStoreModule = async (initial: Record<string, string> = {}) => {
    vi.resetModules();
    stubBrowserStorage(initial);
    return import('@/stores/useStartupCollectionStore');
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('startup collection target identity', () => {
    it('round-trips a target through storage', () => {
        const serialized = serializeStartupCollectionTarget(ONLINE_TARGET);
        expect(parseStartupCollectionTarget(serialized)).toEqual(ONLINE_TARGET);
    });

    it('rejects anything it cannot recognise instead of guessing', () => {
        expect(parseStartupCollectionTarget(null)).toBeNull();
        expect(parseStartupCollectionTarget('')).toBeNull();
        expect(parseStartupCollectionTarget('not json')).toBeNull();
        expect(parseStartupCollectionTarget('[]')).toBeNull();
        // 版本不认识（旧数据）时当没设置过。
        expect(parseStartupCollectionTarget(JSON.stringify({ v: 99, ...ONLINE_TARGET }))).toBeNull();
        expect(parseStartupCollectionTarget(JSON.stringify({ v: 1, source: 'online', id: '1', type: 'playlist', name: 'x' }))).toBeNull();
        expect(parseStartupCollectionTarget(JSON.stringify({ v: 1, source: 'local', id: '', type: 'playlist', name: 'x' }))).toBeNull();
        expect(parseStartupCollectionTarget(JSON.stringify({ v: 1, source: 'local', id: '1', type: 'playlist', name: '  ' }))).toBeNull();
    });

    it('accepts a local target without a provider', () => {
        const local = { v: 1, source: 'local', id: 'p1', type: 'playlist', name: '下班路上' };
        expect(parseStartupCollectionTarget(JSON.stringify(local))).toEqual({
            source: 'local',
            id: 'p1',
            type: 'playlist',
            name: '下班路上',
        });
    });

    it('matches on source, provider, type and id — never on the name', () => {
        expect(isSameStartupCollection(ONLINE_TARGET, {
            source: 'online', id: 7384921, type: 'playlist', providerId: 'netease',
        })).toBe(true);
        expect(isSameStartupCollection(ONLINE_TARGET, {
            source: 'online', id: '7384921', type: 'playlist', providerId: 'kugou',
        })).toBe(false);
        expect(isSameStartupCollection(ONLINE_TARGET, {
            source: 'online', id: '7384921', type: 'cloud', providerId: 'netease',
        })).toBe(false);
        expect(isSameStartupCollection(ONLINE_TARGET, {
            source: 'local', id: '7384921', type: 'playlist',
        })).toBe(false);
    });

    it('builds targets from the collections the app already has', () => {
        expect(toStartupCollectionTargetFromOnline({
            id: 42, name: '云盘', type: 'cloud', providerId: 'netease',
        })).toEqual({ source: 'online', id: '42', type: 'cloud', name: '云盘', providerId: 'netease' });

        // 没有 provider 的在线集合认不回来，宁可不设也不要指向错的平台。
        expect(toStartupCollectionTargetFromOnline({ id: 42, name: 'x', type: 'playlist' } as never)).toBeNull();
        expect(toStartupCollectionTargetFromLocal({ id: 'p9', name: '通勤' })).toEqual({
            source: 'local', id: 'p9', type: 'playlist', name: '通勤',
        });
        expect(toStartupCollectionTargetFromLocal({ id: 'p9', name: '' })).toBeNull();
    });
});

describe('startup collection store', () => {
    it('starts empty and off', async () => {
        const { useStartupCollectionStore, isStartupCollectionLaunchActive } = await loadStoreModule();
        expect(useStartupCollectionStore.getState().startupCollection).toBeNull();
        expect(useStartupCollectionStore.getState().startupCollectionEnabled).toBe(false);
        expect(isStartupCollectionLaunchActive()).toBe(false);
    });

    it('treats a stored switch without a target as off', async () => {
        const { useStartupCollectionStore, isStartupCollectionLaunchActive } = await loadStoreModule({
            [ENABLED_KEY]: 'true',
        });
        expect(useStartupCollectionStore.getState().startupCollectionEnabled).toBe(false);
        expect(isStartupCollectionLaunchActive()).toBe(false);
    });

    it('persists a chosen target and turns the switch on', async () => {
        const { useStartupCollectionStore, isStartupCollectionLaunchActive } = await loadStoreModule();
        useStartupCollectionStore.getState().setStartupCollection(ONLINE_TARGET);

        expect(storage.get(ENABLED_KEY)).toBe('true');
        expect(parseStartupCollectionTarget(storage.get(TARGET_KEY) ?? null)).toEqual(ONLINE_TARGET);
        expect(isStartupCollectionLaunchActive()).toBe(true);

        // 重新加载（重启应用）后仍然生效。
        const reloaded = await loadStoreModule(Object.fromEntries(storage));
        expect(reloaded.useStartupCollectionStore.getState().startupCollection).toEqual(ONLINE_TARGET);
        expect(reloaded.isStartupCollectionLaunchActive()).toBe(true);
    });

    it('keeps the target when the switch is turned off, and clears both on clear', async () => {
        const { useStartupCollectionStore, isStartupCollectionLaunchActive } = await loadStoreModule();
        useStartupCollectionStore.getState().setStartupCollection(ONLINE_TARGET);
        useStartupCollectionStore.getState().setStartupCollectionEnabled(false);
        expect(storage.get(ENABLED_KEY)).toBe('false');
        expect(useStartupCollectionStore.getState().startupCollection).toEqual(ONLINE_TARGET);
        expect(isStartupCollectionLaunchActive()).toBe(false);

        useStartupCollectionStore.getState().clearStartupCollection();
        expect(storage.has(TARGET_KEY)).toBe(false);
        expect(storage.get(ENABLED_KEY)).toBe('false');
        expect(useStartupCollectionStore.getState().startupCollection).toBeNull();
        expect(isStartupCollectionLaunchActive()).toBe(false);
    });
});

describe('resolving the launch target against current data', () => {
    const onlineCollections = [
        { providerId: 'netease', id: 7384921, name: '我喜欢的音乐', type: 'playlist' },
        { providerId: 'netease', id: 555, name: '通勤', type: 'playlist' },
    ] as never;
    const localPlaylists = [
        { id: 'p1', name: '本地通勤', songIds: ['s1', 's2'], createdAt: 1, updatedAt: 2 },
    ];

    it('rebuilds an online descriptor from the live collection', async () => {
        vi.resetModules();
        stubBrowserStorage();
        const { resolveStartupCollectionDescriptor } = await import('@/hooks/useStartupCollectionLaunch');
        const descriptor = resolveStartupCollectionDescriptor({
            target: ONLINE_TARGET,
            onlineCollections,
            localPlaylists,
            providerId: 'netease' as never,
        });
        expect(descriptor?.source).toBe('online');
        expect(descriptor?.id).toBe(7384921);
        expect(descriptor?.name).toBe('我喜欢的音乐');
        if (!descriptor || descriptor.source !== 'online') throw new Error('expected an online descriptor');
        expect(descriptor.providerId).toBe('netease');
        // 这一条要 import 整个 hook（连带首页集合适配与一批 store），全量并发跑时慢于默认的 5s。
    }, 20000);

    it('rebuilds a local descriptor from the live playlist', async () => {
        vi.resetModules();
        stubBrowserStorage();
        const { resolveStartupCollectionDescriptor } = await import('@/hooks/useStartupCollectionLaunch');
        const descriptor = resolveStartupCollectionDescriptor({
            target: { source: 'local', id: 'p1', type: 'playlist', name: '本地通勤' },
            onlineCollections,
            localPlaylists,
            providerId: 'netease' as never,
        });
        expect(descriptor?.source).toBe('local');
        if (!descriptor || descriptor.source !== 'local') throw new Error('expected a local descriptor');
        expect(descriptor.songIds).toEqual(['s1', 's2']);
        expect(descriptor.playlistId).toBe('p1');
    });

    it('returns null while the playlist has not arrived yet', async () => {
        vi.resetModules();
        stubBrowserStorage();
        const { resolveStartupCollectionDescriptor } = await import('@/hooks/useStartupCollectionLaunch');
        expect(resolveStartupCollectionDescriptor({
            target: ONLINE_TARGET,
            onlineCollections: [] as never,
            localPlaylists: [],
            providerId: 'netease' as never,
        })).toBeNull();
        expect(resolveStartupCollectionDescriptor({
            target: { source: 'local', id: 'gone', type: 'playlist', name: '删掉的歌单' },
            onlineCollections,
            localPlaylists,
            providerId: 'netease' as never,
        })).toBeNull();
    });
});

describe('startup collection commands', () => {
    const loadCommands = async () => {
        vi.resetModules();
        stubBrowserStorage();
        const [registry, storeModule] = await Promise.all([
            import('@/components/command-palette/commandRegistry'),
            import('@/stores/useStartupCollectionStore'),
        ]);
        return { registry, store: storeModule.useStartupCollectionStore };
    };

    it('offers the toggle and clear commands only when a target is set', async () => {
        const { registry, store } = await loadCommands();
        const find = (id: string) => {
            const command = registry.COMMAND_PALETTE_COMMANDS.find(candidate => candidate.id === id);
            if (!command) throw new Error(`missing command ${id}`);
            return command;
        };

        for (const id of ['startup-collection-toggle', 'startup-collection-clear']) {
            expect(find(id).group).toBe('settings');
            expect(find(id).isAvailable?.({} as never)).toBe(false);
            expect(find(id).executeShortcut).toBeUndefined();
        }

        store.getState().setStartupCollection(ONLINE_TARGET);
        expect(find('startup-collection-toggle').isAvailable?.({} as never)).toBe(true);
        expect(await find('startup-collection-toggle').execute('', {} as never)).toBe(true);
        expect(store.getState().startupCollectionEnabled).toBe(false);
        expect(await find('startup-collection-toggle').execute('', {} as never)).toBe(true);
        expect(store.getState().startupCollectionEnabled).toBe(true);

        expect(await find('startup-collection-clear').execute('', {} as never)).toBe(true);
        expect(store.getState().startupCollection).toBeNull();
        expect(await find('startup-collection-clear').execute('', {} as never)).toBe(false);
        // 命令注册表要 import 全部命令与服务，全量并发跑时这一条明显慢于默认的 5s。
    }, 20000);
});
