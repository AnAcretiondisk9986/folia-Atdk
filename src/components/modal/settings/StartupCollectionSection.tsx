// src/components/modal/settings/StartupCollectionSection.tsx
// 「启动直达歌单」设置：独立于「启动后直接进入播放界面」的启动目标。
//
// 候选来自此刻能看到的歌单：在线 provider 的账户歌单，加上本地自建歌单。选中的只是一条身份，
// 启动时按身份重新解析（见 hooks/useStartupCollectionLaunch），所以这里不需要保存快照。

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Rocket } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { LocalPlaylist, Theme } from '../../../types';
import { CustomSelect } from '../../shared/CustomSelect';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { settingsDividerClassFor } from './settingsCardClasses';
import { getLocalPlaylists } from '../../../services/localPlaylistService';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { useStartupCollectionStore } from '../../../stores/useStartupCollectionStore';
import {
    isSameStartupCollection,
    toStartupCollectionTargetFromLocal,
    toStartupCollectionTargetFromOnline,
    type StartupCollectionTarget,
} from '../../../utils/startupCollection';

const NO_SELECTION = '';
/** 已保存但当前列表里没有这条歌单时的占位项。 */
const SAVED_SELECTION = '__saved__';

type StartupCollectionSectionProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: Theme;
    utilityGhostButtonClass: string;
};

const StartupCollectionSection: React.FC<StartupCollectionSectionProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
    utilityGhostButtonClass,
}) => {
    const { t } = useTranslation();
    const [localPlaylists, setLocalPlaylists] = useState<LocalPlaylist[]>([]);

    const { accounts, activeProviderId } = useOnlineProviderAccountStore(useShallow(state => ({
        accounts: state.accounts,
        activeProviderId: state.activeProviderId,
    })));
    const {
        startupCollectionEnabled,
        startupCollection,
        setStartupCollection,
        setStartupCollectionEnabled,
        clearStartupCollection,
    } = useStartupCollectionStore(useShallow(state => ({
        startupCollectionEnabled: state.startupCollectionEnabled,
        startupCollection: state.startupCollection,
        setStartupCollection: state.setStartupCollection,
        setStartupCollectionEnabled: state.setStartupCollectionEnabled,
        clearStartupCollection: state.clearStartupCollection,
    })));

    // 本地歌单存在 IndexedDB 里，按需读一次即可；读失败就当没有本地候选。
    useEffect(() => {
        let cancelled = false;
        void getLocalPlaylists()
            .then(playlists => {
                if (!cancelled) setLocalPlaylists(playlists);
            })
            .catch(() => {
                if (!cancelled) setLocalPlaylists([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const onlineCollections = accounts[activeProviderId]?.collections ?? [];

    const { options, targetsByValue } = useMemo(() => {
        const targets = new Map<string, StartupCollectionTarget>();
        const list: Array<{ value: string; label: string }> = [
            { value: NO_SELECTION, label: t('options.startupCollectionNone') },
        ];

        const onlinePrefix = '';
        const localPrefix = '';
        let index = 0;

        onlineCollections.forEach((collection) => {
            const target = toStartupCollectionTargetFromOnline(collection);
            if (!target) return;
            const value = `online:${index++}`;
            targets.set(value, target);
            list.push({ value, label: t('options.startupCollectionOnlineOption', { name: target.name }) });
        });

        localPlaylists.forEach((playlist) => {
            const target = toStartupCollectionTargetFromLocal(playlist);
            if (!target) return;
            const value = `local:${index++}`;
            targets.set(value, target);
            list.push({ value, label: t('options.startupCollectionLocalOption', { name: target.name }) });
        });

        return { options: list, targetsByValue: targets };
    }, [localPlaylists, onlineCollections, t]);

    // 当前选中的项：目标还在候选里就用它的 value，否则给一个占位项，用户能看出存的是哪条歌单。
    const matchedValue = useMemo(() => {
        if (!startupCollection) return NO_SELECTION;
        for (const [value, target] of targetsByValue) {
            if (isSameStartupCollection(startupCollection, {
                source: target.source,
                id: target.id,
                type: target.type,
                providerId: target.providerId,
            })) {
                return value;
            }
        }
        return SAVED_SELECTION;
    }, [startupCollection, targetsByValue]);

    const isTargetMissing = Boolean(startupCollection) && matchedValue === SAVED_SELECTION;
    const selectOptions = useMemo(() => (
        isTargetMissing && startupCollection
            ? [{ value: SAVED_SELECTION, label: t('options.startupCollectionSavedOption', { name: startupCollection.name }) }, ...options]
            : options
    ), [isTargetMissing, options, startupCollection, t]);

    const sourceLabel = startupCollection?.source === 'local'
        ? t('options.startupCollectionLocal')
        : t('options.startupCollectionOnline');

    const handleSelect = (value: string) => {
        if (value === NO_SELECTION) {
            clearStartupCollection();
            return;
        }
        const target = targetsByValue.get(value);
        if (target) setStartupCollection(target);
    };

    const hint = !startupCollection
        ? t('options.startupCollectionEmptyHint')
        : !startupCollectionEnabled
            ? t('options.startupCollectionDisabledHint', { name: startupCollection.name })
            : t('options.startupCollectionActiveHint', { name: startupCollection.name });

    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]';

    return (
        <SettingsAnchor anchorId="startupCollection" label={t('options.startupCollection')}>
            <SettingsSectionHeading icon={Rocket} label={t('options.startupCollection')} />
            <div className={`rounded-xl border ${settingsCardClass} overflow-hidden`}>
                <div className={`flex items-center justify-between p-4 border-b ${settingsDividerClassFor(isDaylight)}`}>
                    <div className="space-y-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t('options.startupCollectionEnable')}
                        </div>
                        <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('options.startupCollectionEnableDesc')}
                        </div>
                    </div>
                    <button
                        onClick={() => setStartupCollectionEnabled(!startupCollectionEnabled)}
                        disabled={!startupCollection}
                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!startupCollectionEnabled ? toggleOffBackgroundClass : ''} ${!startupCollection ? 'opacity-40 cursor-not-allowed' : ''}`}
                        style={{ backgroundColor: startupCollectionEnabled && startupCollection ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${startupCollectionEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className={`p-4 border-b ${settingsDividerClassFor(isDaylight)} space-y-2`}>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('options.startupCollectionPick')}
                    </div>
                    <CustomSelect
                        value={matchedValue}
                        onChange={handleSelect}
                        options={selectOptions}
                        placeholder={t('options.startupCollectionNone')}
                        isDaylight={isDaylight}
                        theme={theme}
                    />
                    <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                        {hint}
                    </div>
                    {isTargetMissing && (
                        <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                            {t('options.startupCollectionMissingHint')}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between p-4">
                    <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                        {t('options.startupCollectionStorageHint', { source: sourceLabel })}
                    </div>
                    <button
                        onClick={clearStartupCollection}
                        disabled={!startupCollection}
                        className={`${utilityGhostButtonClass} ${!startupCollection ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                        {t('options.startupCollectionClear')}
                    </button>
                </div>
            </div>
        </SettingsAnchor>
    );
};

export default StartupCollectionSection;
