// src/utils/appSplash.ts
// 控制 index.html 里的开屏遮罩（词标 + index.html 内联的浮现启动脚本）：React 挂载后让它消失，
// 动画结束再从 DOM 摘掉。

const SPLASH_ELEMENT_ID = 'app-splash';
// 与 appSplash.css 中 #app-splash 的 transition 时长保持一致（迅速消失）。
const FADE_OUT_MS = 200;
// 从词标开始浮现算起，至少留这么久再消失：够 appSplash.css 里的浮现动画播完
//（product 900ms，owner 提前 100ms 起跑）再停留一小段。React 秒挂载的构建也照这个走，
// 否则开屏会被截断成闪一下。
const MIN_REVEAL_HOLD_MS = 1300;
// 词标还没开始浮现时（字体仍在路上），按「最晚此刻一定开始」估它的起点：与 index.html 里的
// FONT_WAIT_LIMIT_MS 一致。少了这一步，字体未就绪时遮罩会在 React 挂载的瞬间就被摘掉。
const REVEAL_FALLBACK_MS = 1000;

// 让开屏遮罩消失并移除；遮罩不存在（OBS 源已提前移除、或已经调用过）时是空操作。
export const hideAppSplash = (): void => {
    const splash = document.getElementById(SPLASH_ELEMENT_ID);
    if (!splash || splash.dataset.hiding === '1') {
        return;
    }
    // 标记在排定时器之前落下：StrictMode 下这个 effect 会跑两次，第二次不该再排一个。
    splash.dataset.hiding = '1';

    const fadeOut = () => {
        // 等待期间遮罩可能已经被别的路径摘掉。
        const target = document.getElementById(SPLASH_ELEMENT_ID);
        if (!target) {
            return;
        }
        target.classList.add('is-hiding');
        window.setTimeout(() => target.remove(), FADE_OUT_MS);
    };

    const now = performance.now();
    const revealAt = Number(splash.dataset.revealAt);
    const shownAt = Number(splash.dataset.shownAt);
    const anchor = Number.isFinite(revealAt)
        ? revealAt
        : (Number.isFinite(shownAt) ? shownAt + REVEAL_FALLBACK_MS : now);

    window.setTimeout(fadeOut, Math.max(0, MIN_REVEAL_HOLD_MS - (now - anchor)));
};
