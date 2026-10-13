// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hideAppSplash } from '@/utils/appSplash';

// test/unit/utils/appSplash.test.ts
// 开屏遮罩的退出时序：词标浮现之后至少留 1300ms（够 appSplash.css 里 product 的 900ms 动画
// 加停留跑完），再 200ms 迅速淡出并摘掉遮罩。
// 两头都不能错：早了词标刚浮起来就被抹掉，晚了主界面被遮罩多盖一截。
// 时长在这里按字面重写了一遍——index.html / appSplash.css / appSplash.ts 里改任何一个，
// 都该让这里的断言先红，而不是靠人记着三处同步。

const MIN_REVEAL_HOLD_MS = 1300;
const FADE_OUT_MS = 200;
const REVEAL_FALLBACK_MS = 1000;

const mountSplash = (dataset: Record<string, string> = {}): HTMLDivElement => {
    const splash = document.createElement('div');
    splash.id = 'app-splash';
    Object.entries(dataset).forEach(([key, value]) => {
        splash.dataset[key] = value;
    });
    document.body.appendChild(splash);
    return splash;
};

const splashInDom = (): HTMLElement | null => document.getElementById('app-splash');

describe('hideAppSplash', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // index.html 写进 dataset 的是 performance.now() 域的时间戳，这里给一个固定「当前时刻」。
        vi.spyOn(performance, 'now').mockReturnValue(10_000);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('浮现刚开始也要补满最短停留才淡出，然后按淡出时长摘掉', () => {
        const splash = mountSplash({ shownAt: '9000', revealAt: '9600' });

        hideAppSplash();

        // 距浮现 400ms，还差 900ms 才到最短停留。
        vi.advanceTimersByTime(MIN_REVEAL_HOLD_MS - 400 - 1);
        expect(splash.classList.contains('is-hiding')).toBe(false);

        vi.advanceTimersByTime(1);
        expect(splash.classList.contains('is-hiding')).toBe(true);
        expect(splashInDom()).toBe(splash);

        vi.advanceTimersByTime(FADE_OUT_MS - 1);
        expect(splashInDom()).toBe(splash);

        vi.advanceTimersByTime(1);
        expect(splashInDom()).toBeNull();
    });

    it('浮现早就播完时立即淡出，不多留一秒', () => {
        const splash = mountSplash({ shownAt: '1000', revealAt: '2000' });

        hideAppSplash();
        vi.advanceTimersByTime(1);

        expect(splash.classList.contains('is-hiding')).toBe(true);
    });

    it('浮现还没开始（字体仍在路上）时按兜底起点估，不提前摘遮罩', () => {
        const splash = mountSplash({ shownAt: '9700' });

        hideAppSplash();

        // anchor = 9700 + 1000(REVEAL_FALLBACK_MS)，最短停留到 12000，即当前时刻之后 2000ms。
        vi.advanceTimersByTime(REVEAL_FALLBACK_MS - 300 + MIN_REVEAL_HOLD_MS - 1);
        expect(splash.classList.contains('is-hiding')).toBe(false);

        vi.advanceTimersByTime(1);
        expect(splash.classList.contains('is-hiding')).toBe(true);
    });

    it('两个时间戳都没有时按当前时刻算，仍然完整停留', () => {
        const splash = mountSplash();

        hideAppSplash();

        vi.advanceTimersByTime(MIN_REVEAL_HOLD_MS - 1);
        expect(splash.classList.contains('is-hiding')).toBe(false);

        vi.advanceTimersByTime(1);
        expect(splash.classList.contains('is-hiding')).toBe(true);
    });

    it('StrictMode 下 effect 跑两次也只排一次退出', () => {
        mountSplash({ revealAt: '9600' });
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

        hideAppSplash();
        hideAppSplash();

        expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    });

    it('遮罩已不存在时是空操作', () => {
        const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

        expect(() => hideAppSplash()).not.toThrow();
        expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('等待期间遮罩被别的路径摘掉也不会二次移除', () => {
        const splash = mountSplash({ revealAt: '9600' });

        hideAppSplash();
        splash.remove();

        expect(() => vi.advanceTimersByTime(MIN_REVEAL_HOLD_MS + FADE_OUT_MS + 10)).not.toThrow();
        expect(splashInDom()).toBeNull();
    });
});
