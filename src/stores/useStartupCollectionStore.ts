// src/stores/useStartupCollectionStore.ts
// 启动直达歌单：一个独立于「启动后直接进入播放界面」的启动目标。
//
// 与那条设置分开是有意的：那边决定「启动后进哪个播放界面」，这里决定「启动后打开哪个歌单」，
// 两者互相独立，同时开启时以歌单为准（更具体的目标，见 hooks/useAppNavigation 的启动视图）。
//
// 不进设置同步（sync）：目标指向的是「这台设备上、这个账户里的一条歌单」，换设备时账号与曲库
// 都未必对得上，同步过去只会得到一条打不开的目标。用户的决定，2026-10-12。

import { create } from 'zustand';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';
import {
    parseStartupCollectionTarget,
    serializeStartupCollectionTarget,
    type StartupCollectionTarget,
} from '../utils/startupCollection';

const ENABLED_KEY = 'startup_collection_enabled';
const TARGET_KEY = 'startup_collection_target';

export type StartupCollectionState = {
    /** 启动后是否真的打开目标歌单。 */
    startupCollectionEnabled: boolean;
    /** 目标歌单的身份；没设置过时为 null。 */
    startupCollection: StartupCollectionTarget | null;
    setStartupCollectionEnabled: (enabled: boolean) => void;
    /** 选一个歌单作为启动目标；选完即启用（选了就是要用）。传 null 等同清除。 */
    setStartupCollection: (target: StartupCollectionTarget | null) => void;
    /** 清除目标并关掉开关。 */
    clearStartupCollection: () => void;
};

const readStoredTarget = (): StartupCollectionTarget | null => (
    typeof window === 'undefined' ? null : parseStartupCollectionTarget(localStorage.getItem(TARGET_KEY))
);

const writeStoredTarget = (target: StartupCollectionTarget | null) => {
    if (typeof window === 'undefined') return;
    if (target) localStorage.setItem(TARGET_KEY, serializeStartupCollectionTarget(target));
    else localStorage.removeItem(TARGET_KEY);
};

export const useStartupCollectionStore = create<StartupCollectionState>((set) => ({
    // 没有目标时开关没有意义，存储里残留的 true 一律当关闭读。
    startupCollectionEnabled: getStoredBoolean(ENABLED_KEY, false) && readStoredTarget() !== null,
    startupCollection: readStoredTarget(),

    setStartupCollectionEnabled: (enabled) => {
        setStoredBoolean(ENABLED_KEY, enabled);
        set({ startupCollectionEnabled: enabled });
    },

    setStartupCollection: (target) => {
        writeStoredTarget(target);
        setStoredBoolean(ENABLED_KEY, target !== null);
        set({ startupCollection: target, startupCollectionEnabled: target !== null });
    },

    clearStartupCollection: () => {
        writeStoredTarget(null);
        setStoredBoolean(ENABLED_KEY, false);
        set({ startupCollection: null, startupCollectionEnabled: false });
    },
}));

/**
 * 模块级读法：启动视图与命令这类非组件代码用它，不需要订阅。
 * 开关开着但没设目标时不算生效——那只会让启动停在一个打不开的目标上。
 */
export const isStartupCollectionLaunchActive = (): boolean => {
    const { startupCollectionEnabled, startupCollection } = useStartupCollectionStore.getState();
    return startupCollectionEnabled && startupCollection !== null;
};
