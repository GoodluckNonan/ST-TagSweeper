/**
 * ST-TagSweeper —— 一鍵去正則保正文
 * ---------------------------------------------------------------------------
 * 目的：
 *   酒館裡的 <think> / <summary> / <plot> … 這類角括號標籤，平常靠正則折疊或隱藏，
 *   一旦換預設、關正則，這些內容就會原文炸在聊天框裡。本插件直接把標籤內容
 *   「破壞式」地從聊天檔案中刪掉，只留下正文，之後正則開不開都不會再亂。
 *
 * 主要能力：
 *   1. 掃描當前聊天檔案所有訊息，列出偵測到的每一種 <> 標籤；
 *   2. 每個標籤有三態：消除（連內容刪）/ 白名單（保留內容只脫殼）/ 不理會；
 *   3. 外殼頁：<> / {} / [] / 《》/【】 等包裝可以各自啟停、新增、刪除、設定只脫殼；
 *   4. 完全匹配移除：指定字串（例如 ```bash）原樣出現就刪掉；
 *   5. 預覽翻頁、可切換顯示刪除內容、可手動編輯單條訊息（撤銷 / 重做 / 保存）；
 *   6. 寫入前二次確認（含「正文可能被誤刪」提示）、自動建立可回滾的備份點。
 *
 * 只用公開 API：SillyTavern.getContext()。
 */

import {
    analyzeText,
    mergeTagStats,
    collapseWhitespace,
    normalizeTagName,
    DEFAULT_BODY_TAGS,
    DEFAULT_SHELLS,
    COMMENT_TAG,
    TAG_SWEEPER_VERSION,
} from './core.js';

import {
    LOCALES,
    localizeText,
    localizeHtml,
    localizeTree,
    makeTranslator,
    resolveLocale,
} from './i18n.js';

const MODULE_NAME = 'ST-TagSweeper';
const LOG = '[TagSweeper]';

/**
 * 模板資料夾路徑。
 * 用「自己這支 script 的網址」反推，這樣就算 GitHub 專案取了別的名字
 * （酒館線上安裝會把 repo 複製成 third-party/<repo 名>），panel.html 也找得到。
 */
function resolveTemplatePath() {
    try {
        const match = /\/scripts\/extensions\/(.+?)\/[^/]+\.js(?:\?.*)?$/.exec(import.meta.url);
        if (match?.[1]) return decodeURIComponent(match[1]);
    } catch { /* 落到下面的預設值 */ }
    return `third-party/${MODULE_NAME}`;
}

const TEMPLATE_PATH = resolveTemplatePath();

/** 預設快捷鍵 */
const HOTKEY_DEFAULT = 'Ctrl+Alt+X';

const DEFAULT_SETTINGS = Object.freeze({
    /** 白名單：保留內容、只脫掉外殼 */
    whitelist: [...DEFAULT_BODY_TAGS],
    /** 不理會清單：原樣留在訊息裡 */
    ignore: [],
    /** 清單裡被隱藏的標籤：只是不在面板上干擾你，處理規則完全不變 */
    hiddenTags: [],
    /** 外殼（左右界包裝）：<> 由標籤引擎處理，其餘只做左右界配對 */
    shells: DEFAULT_SHELLS.map(shell => ({ ...shell })),
    /** 完全匹配就刪掉的字串 */
    literals: [],
    options: {
        includeUser: true,
        includeSystem: false,
        allSwipes: true,
        includeReasoning: false,
        skipCodeBlocks: true,
        skipInlineCode: false,
        orphanCloseMode: 'block',
        orphanAnchorMode: 'complete',
        orphanOpenMode: 'next',
        tidy: true,
    },
    ui: {
        hotkey: HOTKEY_DEFAULT,
        hotkeyEnabled: true,
        panelFloat: true,
        panelPos: null,
        tab: 'tags',
        /** 介面語言：auto / zh-Hant / zh-Hans / en */
        locale: 'auto',
    },
    keepBackups: 5,
    maxBackupBytes: 1.5 * 1024 * 1024,
    maxTotalBackupBytes: 4 * 1024 * 1024,
    backups: [],
    /** 正則暫停的快照；非 null 代表「上次沒還原乾淨」，載入時會自動補還原 */
    pendingRegexRestore: null,
});

/** 執行期狀態（不持久化） */
const state = {
    open: false,
    busy: false,
    plan: null,
    tab: 'tags',
    filter: '',
    showHidden: false,
    /** 目前展開來源的標籤 key */
    expanded: new Set(),
    probeTimer: null,
    /** 預覽：目前顯示「消除前」（含紅線） */
    showBefore: false,
    /** 預覽：目前頁碼（0 起算） */
    previewIndex: 0,
    /** 手動編輯工作階段；null 代表沒在編輯 */
    edit: null,
    /** 手動編輯結果：訊息索引 → 最終文字 */
    manualEdits: new Map(),
    regexPaused: false,
    regexSnapshot: null,
    lastBackupId: null,
    drag: null,
    templateReady: false,
    /** 目前實際使用的介面語言（已解析 auto） */
    locale: 'zh-Hant',
    /** 依 locale 產生的翻譯函式 */
    tr: key => key,
};

/** extension_settings 的取得（getContext() 每次回傳新物件，不能把備援存在它身上） */
let localSettingsStore = null;
function settingsStore() {
    const ctx = getCtx();
    if (ctx.extensionSettings && typeof ctx.extensionSettings === 'object') return ctx.extensionSettings;
    if (!localSettingsStore) {
        localSettingsStore = globalThis.extension_settings ?? (globalThis.extension_settings = {});
    }
    return localSettingsStore;
}

// ===========================================================================
// 基礎工具
// ===========================================================================

function getCtx() {
    return globalThis.SillyTavern?.getContext?.() ?? {};
}

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;',
    }[c]));
}

function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function safeUuid() {
    const ctx = getCtx();
    if (typeof ctx.uuidv4 === 'function') {
        try {
            return ctx.uuidv4();
        } catch { /* 落到下面的備援 */ }
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function formatTime(ts) {
    try {
        return new Date(Number(ts)).toLocaleString();
    } catch {
        return String(ts);
    }
}

function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function jsonClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function notify(level, message) {
    const t = globalThis.toastr;
    const text = localizeText(String(message ?? ''), state.locale);
    if (t && typeof t[level] === 'function') {
        t[level](text, localizeText('一鍵去正則保正文', state.locale), { timeOut: level === 'error' ? 12000 : 5000 });
    } else {
        console.log(`${LOG} ${level}: ${text}`);
    }
}

function downloadText(filename, text) {
    try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return true;
    } catch (err) {
        console.error(LOG, '下載失敗', err);
        return false;
    }
}

function sanitizeFileName(name) {
    return String(name ?? 'chat').replace(/[\s.<>:"/\\|?*\x00-\x1F\x7F]/g, '_').toLowerCase().slice(0, 80);
}

function setStatus(text, busy = false) {
    const node = document.getElementById('ts_status');
    if (node) node.textContent = localizeText(text, state.locale);
    const bar = node?.parentElement;
    if (bar) bar.classList.toggle('ts-busy', !!busy);
}

function setButtonsBusy(busy) {
    state.busy = !!busy;
    for (const id of ['ts_btn_scan', 'ts_btn_apply', 'ts_btn_undo']) {
        document.getElementById(id)?.classList.toggle('ts-disabled', !!busy);
    }
}

// ===========================================================================
// 設定存取
// ===========================================================================

function getSettings() {
    const store = settingsStore();
    let settings = store[MODULE_NAME];
    if (!settings || typeof settings !== 'object') {
        settings = {};
        store[MODULE_NAME] = settings;
    }

    if (!Array.isArray(settings.whitelist)) settings.whitelist = [...DEFAULT_SETTINGS.whitelist];
    if (!Array.isArray(settings.ignore)) settings.ignore = [];
    if (!Array.isArray(settings.hiddenTags)) settings.hiddenTags = [];
    if (!Array.isArray(settings.shells)) settings.shells = DEFAULT_SHELLS.map(shell => ({ ...shell }));
    if (!settings.shells.some(shell => shell?.open === '<' && shell?.close === '>')) {
        const native = DEFAULT_SHELLS.find(shell => shell.native);
        if (native) settings.shells.unshift({ ...native });
    }
    if (!Array.isArray(settings.literals)) settings.literals = [];
    if (!Array.isArray(settings.backups)) settings.backups = [];
    if (typeof settings.keepBackups !== 'number') settings.keepBackups = DEFAULT_SETTINGS.keepBackups;
    if (typeof settings.maxBackupBytes !== 'number') settings.maxBackupBytes = DEFAULT_SETTINGS.maxBackupBytes;
    if (typeof settings.maxTotalBackupBytes !== 'number') settings.maxTotalBackupBytes = DEFAULT_SETTINGS.maxTotalBackupBytes;
    settings.options = { ...DEFAULT_SETTINGS.options, ...(settings.options ?? {}) };
    settings.ui = { ...DEFAULT_SETTINGS.ui, ...(settings.ui ?? {}) };
    if (typeof settings.pendingRegexRestore === 'undefined') settings.pendingRegexRestore = null;

    return settings;
}

function saveSettings() {
    try {
        getCtx().saveSettingsDebounced?.();
    } catch (err) {
        console.warn(LOG, '儲存設定失敗', err);
    }
}

/** 目前這個標籤名要怎麼處理：remove / keep / ignore */
function getTagMode(name) {
    const settings = getSettings();
    const key = String(name).toLowerCase();
    if (settings.ignore.some(x => String(x).toLowerCase() === key)) return 'ignore';
    if (settings.whitelist.some(x => String(x).toLowerCase() === key)) return 'keep';
    return 'remove';
}

/** 這個標籤是不是被「隱藏」了（只影響清單顯示，不影響處理規則） */
function isTagHidden(name) {
    const key = String(name).toLowerCase();
    return getSettings().hiddenTags.some(x => String(x).toLowerCase() === key);
}

function setTagHidden(name, hidden) {
    const settings = getSettings();
    const cleaned = normalizeTagName(name);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    settings.hiddenTags = settings.hiddenTags.filter(x => String(x).toLowerCase() !== key);
    if (hidden) settings.hiddenTags.push(cleaned);
    saveSettings();
}

function setTagMode(name, mode) {
    const settings = getSettings();
    const cleaned = normalizeTagName(name);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    settings.whitelist = settings.whitelist.filter(x => String(x).toLowerCase() !== key);
    settings.ignore = settings.ignore.filter(x => String(x).toLowerCase() !== key);
    if (mode === 'keep') settings.whitelist.push(cleaned);
    else if (mode === 'ignore') settings.ignore.push(cleaned);
    saveSettings();
}

// ===========================================================================
// 正則暫停 / 還原
// ===========================================================================

function regexScriptKey(script, index) {
    if (script && typeof script.id === 'string' && script.id) return script.id;
    if (script && typeof script.id === 'number') return String(script.id);
    return `#${index}`;
}

/** 收集三種來源的正則腳本（全域 / 角色 / 預設集） */
function readAllRegexScripts() {
    const ctx = getCtx();
    const groups = { global: [], scoped: [], preset: [] };

    const extensionSettings = ctx.extensionSettings ?? {};
    if (Array.isArray(extensionSettings.regex)) groups.global = extensionSettings.regex;

    try {
        const character = ctx.characters?.[ctx.characterId];
        const scoped = character?.data?.extensions?.regex_scripts;
        if (Array.isArray(scoped)) groups.scoped = scoped;
    } catch { /* 忽略 */ }

    try {
        const presetManager = ctx.getPresetManager?.();
        const preset = presetManager?.readPresetExtensionField?.({ path: 'regex_scripts' });
        if (Array.isArray(preset)) groups.preset = preset;
    } catch { /* 忽略 */ }

    return groups;
}

function countEnabledRegex() {
    const groups = readAllRegexScripts();
    let enabled = 0;
    let total = 0;
    for (const list of Object.values(groups)) {
        for (const script of list) {
            total++;
            if (!script?.disabled) enabled++;
        }
    }
    return { enabled, total };
}

function buildRegexSnapshot(groups) {
    const snapshot = { global: {}, scoped: {}, preset: {}, count: 0 };
    for (const [type, list] of Object.entries(groups)) {
        list.forEach((script, index) => {
            const key = regexScriptKey(script, index);
            snapshot[type][key] = !!script?.disabled;
            if (!script?.disabled) snapshot.count++;
        });
    }
    return snapshot;
}

/** 暫時關閉所有正則（手動觸發；快照會先寫進設定，避免中途關掉瀏覽器導致正則永久停用） */
async function pauseRegex(force = true) {
    const settings = getSettings();
    if (state.regexPaused) return true;
    if (!force) return false;

    const ctx = getCtx();
    const groups = readAllRegexScripts();
    const snapshot = buildRegexSnapshot(groups);
    if (snapshot.count === 0) {
        setRegexChip();
        return false;
    }

    settings.pendingRegexRestore = snapshot;
    saveSettings();

    try {
        // 全域
        if (Array.isArray(ctx.extensionSettings?.regex) && groups.global.some(s => !s.disabled)) {
            ctx.extensionSettings.regex = groups.global.map(s => (s?.disabled ? s : { ...s, disabled: true }));
            ctx.saveSettingsDebounced?.();
        }
        // 角色專屬
        if (groups.scoped.some(s => !s.disabled) && ctx.characterId !== undefined && ctx.characterId !== null) {
            const next = groups.scoped.map(s => (s?.disabled ? s : { ...s, disabled: true }));
            await ctx.writeExtensionField?.(ctx.characterId, 'regex_scripts', next);
        }
        // 預設集
        if (groups.preset.some(s => !s.disabled)) {
            const presetManager = ctx.getPresetManager?.();
            if (presetManager?.writePresetExtensionField) {
                const next = groups.preset.map(s => (s?.disabled ? s : { ...s, disabled: true }));
                await presetManager.writePresetExtensionField({ path: 'regex_scripts', value: next });
            }
        }
    } catch (err) {
        console.warn(LOG, '暫停正則時發生錯誤', err);
        notify('warning', '暫停正則時出了點問題，詳情見控制台；清除功能本身不受影響。');
    }

    state.regexPaused = true;
    state.regexSnapshot = snapshot;
    setRegexChip();
    try {
        await ctx.reloadCurrentChat?.();
    } catch (err) {
        console.warn(LOG, '重載聊天失敗', err);
    }
    return true;
}

/** 還原正則到暫停前的狀態 */
async function restoreRegex(snapshotOverride = null, { silent = false } = {}) {
    const settings = getSettings();
    const snapshot = snapshotOverride ?? state.regexSnapshot ?? settings.pendingRegexRestore;
    if (!snapshot) {
        state.regexPaused = false;
        state.regexSnapshot = null;
        setRegexChip();
        return false;
    }

    const ctx = getCtx();
    const groups = readAllRegexScripts();
    let touched = 0;

    try {
        const restoreList = (list, savedMap) => list.map((script, index) => {
            const key = regexScriptKey(script, index);
            if (Object.prototype.hasOwnProperty.call(savedMap ?? {}, key) && script?.disabled === true) {
                touched++;
                return { ...script, disabled: savedMap[key] };
            }
            return script;
        });

        if (Array.isArray(ctx.extensionSettings?.regex) && groups.global.length > 0) {
            const next = restoreList(groups.global, snapshot.global);
            if (next.some((s, i) => s !== groups.global[i])) {
                ctx.extensionSettings.regex = next;
                ctx.saveSettingsDebounced?.();
            }
        }
        if (groups.scoped.length > 0 && ctx.characterId !== undefined && ctx.characterId !== null) {
            const next = restoreList(groups.scoped, snapshot.scoped);
            if (next.some((s, i) => s !== groups.scoped[i])) {
                await ctx.writeExtensionField?.(ctx.characterId, 'regex_scripts', next);
            }
        }
        if (groups.preset.length > 0) {
            const next = restoreList(groups.preset, snapshot.preset);
            if (next.some((s, i) => s !== groups.preset[i])) {
                const presetManager = ctx.getPresetManager?.();
                await presetManager?.writePresetExtensionField?.({ path: 'regex_scripts', value: next });
            }
        }
    } catch (err) {
        console.warn(LOG, '還原正則時發生錯誤', err);
        notify('error', '還原正則失敗！請到「正則」面板手動把腳本勾回來，詳情見控制台。');
        return false;
    }

    settings.pendingRegexRestore = null;
    saveSettings();
    state.regexPaused = false;
    state.regexSnapshot = null;
    setRegexChip();

    if (!silent && touched > 0) {
        try {
            await ctx.reloadCurrentChat?.();
        } catch { /* 忽略 */ }
    }
    return true;
}

/** 手動切換「暫時關閉正則」。回傳 true 代表現在是暫停狀態。 */
async function toggleRegexPause() {
    if (getSettings().pendingRegexRestore) {
        await restoreRegex();
        return false;
    }
    await pauseRegex(true);
    return true;
}

function setRegexChip() {    const chip = document.getElementById('ts_regexchip');
    if (!chip) return;
    if (state.regexPaused) {
        chip.textContent = '正則：已暫停';
        chip.classList.add('ts-on');
        chip.title = '所有正則已暫時停用。關閉面板或按「立刻還原正則」就會復原。';
    } else {
        const { enabled, total } = countEnabledRegex();
        chip.textContent = total > 0 ? `正則：${enabled}/${total} 啟用中` : '正則：無';
        chip.classList.remove('ts-on');
        chip.title = '目前沒有暫停任何正則。';
    }
}

// ===========================================================================
// 掃描：建立清除計畫
// ===========================================================================

function isSystemMessage(message) {
    return !!message?.is_system || !!message?.extra?.isSmallSys;
}

function chatDisplayLabel() {
    const ctx = getCtx();
    const chatId = typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx.chatId;
    let name = '';
    if (ctx.groupId) {
        name = (ctx.groups ?? []).find(g => g.id === ctx.groupId)?.name ?? '群組聊天';
    } else if (ctx.characterId !== undefined && ctx.characterId !== null && ctx.characters) {
        name = ctx.characters?.[ctx.characterId]?.name ?? '';
    }
    const id = String(chatId ?? '');
    return { name, id, display: `${name || '（未開啟聊天）'}${id ? ` · ${id}` : ''}` };
}

function chatSignature() {
    const ctx = getCtx();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    let size = 0;
    for (const message of chat) size += String(message?.mes ?? '').length;
    return `${ctx.chatId ?? ''}|${chat.length}|${size}`;
}

function currentScanOptions() {
    const settings = getSettings();
    return {
        ...settings.options,
        whitelist: settings.whitelist,
        ignore: settings.ignore,
        shells: settings.shells,
        literals: settings.literals,
        // 白名單內容保護是硬規則：白名單標籤裡的內容永遠不會被消除，
        // 就算它被包在更大的黑名單標籤裡面也一樣（例如 <a><story>正文</story></a>）。
        protectWhitelistContent: true,
    };
}

/**
 * 掃描用的便宜預檢：訊息裡完全沒有啟用中的外殼左界、也沒有完全匹配字串時，
 * 就不用對它（以及它的所有 swipe）跑完整分析。
 * @param {object} options
 * @returns {(text:string) => boolean}
 */
function buildQuickMatcher(options) {
    const openers = [...new Set((options.shells || []).filter(s => s.enabled).map(s => s.open))];
    const literals = options.literals || [];
    return (text) => {
        const source = String(text ?? '');
        if (!source) return false;
        for (const opener of openers) if (source.includes(opener)) return true;
        for (const literal of literals) if (source.includes(literal)) return true;
        return false;
    };
}

/**
 * 掃描整個聊天檔案，產生「哪幾條訊息會被改成什麼」的計畫。
 * @returns {{entries:Array, stats:Array, scanned:number, tagged:number, removedChars:number, riskCount:number, signature:string, label:object, options:object}}
 */
function buildPlan() {
    const settings = getSettings();
    const options = currentScanOptions();
    const ctx = getCtx();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const quickHas = buildQuickMatcher(options);

    const entries = [];
    const analyses = [];
    /** @type {Map<string, object>} */
    const shellStats = new Map();
    /** @type {Map<string, object>} */
    const literalStats = new Map();
    /** @type {Map<string, Array<{index:number,name:string,count:number,sample:string,orphanOpen:number,orphanClose:number}>>} */
    const tagSources = new Map();
    let scanned = 0;
    let tagged = 0;

    const mergeShellStat = (stat) => {
        let target = shellStats.get(stat.key);
        if (!target) {
            target = { ...stat };
            shellStats.set(stat.key, target);
            return;
        }
        target.count += stat.count;
        target.removedChars += stat.removedChars;
    };
    const mergeLiteralStat = (stat) => {
        let target = literalStats.get(stat.key);
        if (!target) {
            target = { ...stat };
            literalStats.set(stat.key, target);
            return;
        }
        target.count += stat.count;
        target.removedChars += stat.removedChars;
    };

    chat.forEach((message, index) => {
        if (!message || typeof message !== 'object') return;
        if (isSystemMessage(message) && !settings.options.includeSystem) return;
        if (message.is_user && !settings.options.includeUser) return;
        scanned++;

        const before = String(message.mes ?? '');
        const analysis = analyzeText(before, options);
        analyses.push(analysis);

        for (const stat of analysis.shellStats || []) mergeShellStat(stat);
        for (const stat of analysis.literalStats || []) mergeLiteralStat(stat);

        const speaker = String(message.name || (message.is_user ? 'You' : 'AI'));
        for (const stat of analysis.stats) {
            let list = tagSources.get(stat.key);
            if (!list) {
                list = [];
                tagSources.set(stat.key, list);
            }
            list.push({
                index,
                name: speaker,
                isUser: !!message.is_user,
                count: stat.count,
                sample: stat.sample,
                orphanOpen: stat.orphanOpen,
                orphanClose: stat.orphanClose,
            });
        }

        // 手動編輯：使用者在地化編輯框改過的內容優先於自動分析結果
        let after = analysis.after;
        let manual = false;
        const edited = state.manualEdits.get(index);
        if (typeof edited === 'string') {
            if (edited === analysis.before) {
                state.manualEdits.delete(index);
            } else {
                after = edited;
                manual = true;
            }
        }

        /** @type {Array<{index:number,before:string,after:string,analysis:object}>} */
        const swipes = [];
        if (settings.options.allSwipes && Array.isArray(message.swipes)) {
            message.swipes.forEach((text, swipeIndex) => {
                if (typeof text !== 'string' || !quickHas(text)) return;
                const swipeAnalysis = analyzeText(text, options);
                if (swipeAnalysis.changed) {
                    swipes.push({ index: swipeIndex, before: swipeAnalysis.before, after: swipeAnalysis.after, analysis: swipeAnalysis });
                }
            });
        }

        let reasoning = null;
        if (settings.options.includeReasoning && quickHas(message?.extra?.reasoning)) {
            const reasoningAnalysis = analyzeText(message.extra.reasoning, options);
            if (reasoningAnalysis.changed) {
                reasoning = { before: reasoningAnalysis.before, after: reasoningAnalysis.after, analysis: reasoningAnalysis };
            }
        }

        if (!analysis.changed && !manual && swipes.length === 0 && !reasoning) return;
        if (analysis.changed || manual) tagged++;

        const risk = (analysis.risk === 'high' || swipes.some(s => s.analysis.risk === 'high') || reasoning?.analysis?.risk === 'high')
            ? 'high'
            : 'normal';

        entries.push({
            index,
            name: String(message.name || (message.is_user ? 'You' : 'AI')),
            isUser: !!message.is_user,
            before: analysis.before,
            after,
            manual,
            analysis,
            swipes,
            reasoning,
            risk,
            residue: analysis.residue ?? null,
        });
    });

    let removedChars = 0;
    for (const entry of entries) {
        removedChars += Math.max(0, entry.before.length - entry.after.length);
        for (const swipe of entry.swipes) removedChars += Math.max(0, swipe.before.length - swipe.after.length);
        if (entry.reasoning) removedChars += Math.max(0, entry.reasoning.before.length - entry.reasoning.after.length);
    }

    return {
        entries,
        stats: mergeTagStats(analyses),
        tagSources,
        shellStats: [...shellStats.values()],
        literalStats: [...literalStats.values()],
        scanned,
        tagged,
        removedChars,
        riskCount: entries.filter(e => e.risk === 'high').length,
        residueCount: entries.filter(e => e.residue).length,
        signature: chatSignature(),
        label: chatDisplayLabel(),
        options,
        time: Date.now(),
    };
}

function refreshPlan({ rerender = true } = {}) {
    state.plan = buildPlan();
    clampPreviewIndex();
    if (rerender) {
        renderSummary();
        renderTagList();
        renderShells();
        renderPreview();
    }
    return state.plan;
}

// ===========================================================================
// 備份點
// ===========================================================================

function pruneBackups(settings = getSettings()) {
    const keep = clampInt(settings.keepBackups, 1, 50, DEFAULT_SETTINGS.keepBackups);
    const budget = clampInt(settings.maxTotalBackupBytes, 128 * 1024, 64 * 1024 * 1024, DEFAULT_SETTINGS.maxTotalBackupBytes);

    const sorted = settings.backups.slice().sort((a, b) => Number(b.time) - Number(a.time));
    const kept = [];
    let embeddedBytes = 0;

    for (const record of sorted) {
        if (kept.length >= keep) break;
        const isEmbedded = !!record?.payload;
        const bytes = Number(record?.bytes) || 0;
        if (isEmbedded && kept.length > 0 && embeddedBytes + bytes > budget) continue;
        kept.push(record);
        if (isEmbedded) embeddedBytes += bytes;
    }
    settings.backups = kept;
}

function createBackupPoint(reason, { download = false } = {}) {
    const settings = getSettings();
    const ctx = getCtx();
    const payload = {
        messages: jsonClone(Array.isArray(ctx.chat) ? ctx.chat : []),
        metadata: jsonClone(ctx.chatMetadata ?? {}),
    };
    const serialized = JSON.stringify(payload);
    const label = chatDisplayLabel();

    const record = {
        id: safeUuid(),
        time: Date.now(),
        label: label.name || label.id || '未命名聊天',
        chatId: label.id,
        isGroup: !!ctx.groupId,
        messageCount: payload.messages.length,
        bytes: serialized.length,
        reason: String(reason ?? ''),
        fileOnly: false,
        payload,
    };

    if (serialized.length > settings.maxBackupBytes) {
        record.fileOnly = true;
        record.payload = null;
    }
    if (record.fileOnly || download) {
        downloadBackup(record, payload);
        if (record.fileOnly) {
            notify('warning', `聊天較大（${formatBytes(serialized.length)}），備份已自動匯出成檔案；此備份點無法在面板內一鍵回滾。`);
        }
    }

    settings.backups.unshift(record);
    pruneBackups(settings);
    saveSettings();
    state.lastBackupId = record.id;
    return record;
}

function toJsonl(payload) {
    const header = {
        chat_metadata: payload?.metadata ?? {},
        user_name: 'unused',
        character_name: 'unused',
    };
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    return [JSON.stringify(header), ...messages.map(m => JSON.stringify(m))].join('\n');
}

function downloadBackup(record, payloadOverride = null) {
    const payload = payloadOverride ?? record?.payload;
    if (!payload) {
        notify('warning', '這個備份點沒有內嵌資料可匯出（可能是僅檔案備份）。');
        return;
    }
    const stamp = new Date(Number(record?.time ?? Date.now())).toISOString().replace(/[:.]/g, '-');
    const name = `tagsweeper_${sanitizeFileName(record?.label ?? 'chat')}_${stamp}.jsonl`;
    if (downloadText(name, toJsonl(payload))) notify('info', `已匯出備份檔：${name}`);
}

function parseBackupText(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('{')) {
        try {
            const obj = JSON.parse(trimmed);
            if (Array.isArray(obj?.messages)) return { messages: obj.messages, metadata: obj.metadata ?? {} };
        } catch { /* 繼續嘗試 jsonl */ }
    }

    const messages = [];
    let metadata = {};
    for (const line of trimmed.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let obj;
        try {
            obj = JSON.parse(line);
        } catch {
            return null;
        }
        if (!obj || typeof obj !== 'object') return null;
        if (obj.chat_metadata) {
            metadata = obj.chat_metadata;
            continue;
        }
        if (typeof obj.mes === 'string' || typeof obj.name === 'string') messages.push(obj);
    }
    if (messages.length === 0) return null;
    return { messages, metadata };
}

async function restoreFromPayload(payload, label, timeLabel) {
    const ctx = getCtx();
    const currentCount = Array.isArray(ctx.chat) ? ctx.chat.length : 0;
    const result = await ctx.callGenericPopup(
        trHtml(`<h3>回滾聊天檔案</h3>
        <p>即將用備份「<b>${escapeHtml(label)}</b>」（${escapeHtml(timeLabel)}，${payload.messages.length} 條訊息）</p>
        <p>覆蓋目前聊天的 <b>${currentCount}</b> 條訊息。</p>
        <p>回滾前會再自動建立一個「當前狀態」的備份點，所以這一步本身也能反悔。</p>`),
        ctx.POPUP_TYPE.CONFIRM,
        '',
        {
            okButton: localizeText('確認回滾', state.locale),
            cancelButton: localizeText('取消', state.locale),
            wide: true,
        },
    );
    if (result !== ctx.POPUP_RESULT.AFFIRMATIVE) {
        notify('info', '已取消回滾。');
        return;
    }

    createBackupPoint('回滾前自動備份');

    const fresh = getCtx();
    if (!Array.isArray(fresh.chat)) {
        notify('error', '目前沒有已載入的聊天，無法回滾。');
        return;
    }
    fresh.chat.splice(0, fresh.chat.length, ...jsonClone(payload.messages));
    if (fresh.chatMetadata && payload.metadata) {
        for (const key of Object.keys(fresh.chatMetadata)) delete fresh.chatMetadata[key];
        Object.assign(fresh.chatMetadata, jsonClone(payload.metadata));
    }
    if (typeof fresh.saveChat === 'function') await fresh.saveChat();
    try {
        await fresh.reloadCurrentChat?.();
    } catch (err) {
        console.warn(LOG, '回滾後重載聊天失敗', err);
    }
    notify('success', '已回滾到指定備份點。');
    refreshPlan();
    renderBackupList();
}

async function restoreBackupById(id) {
    const record = getSettings().backups.find(x => x.id === id);
    if (!record) {
        notify('error', '找不到這個備份點。');
        return;
    }
    if (!record.payload) {
        notify('warning', '這個備份點只有檔案、沒有內嵌資料，請用「匯入備份檔」選擇對應檔案來還原。');
        return;
    }
    await restoreFromPayload(record.payload, record.label, formatTime(record.time));
}

async function importBackupFile(file) {
    let payload;
    try {
        payload = parseBackupText(await file.text());
    } catch (err) {
        console.error(LOG, '讀取備份檔失敗', err);
        notify('error', '讀取備份檔失敗，詳情見控制台。');
        return;
    }
    if (!payload) {
        notify('error', '無法解析這個檔案（支援本插件匯出的 .json 或 ST 的 .jsonl 聊天檔）。');
        return;
    }

    const settings = getSettings();
    const size = JSON.stringify(payload).length;
    const record = {
        id: safeUuid(),
        time: Date.now(),
        label: `匯入：${file.name}`,
        chatId: '',
        isGroup: false,
        messageCount: payload.messages.length,
        bytes: size,
        reason: '從檔案匯入',
        fileOnly: false,
        payload,
    };
    if (size > settings.maxBackupBytes) {
        record.fileOnly = true;
        record.payload = null;
    }
    settings.backups.unshift(record);
    pruneBackups(settings);
    saveSettings();
    renderBackupList();

    notify('success', `已讀入 ${payload.messages.length} 條訊息，接著確認是否回滾。`);
    await restoreFromPayload(payload, record.label, formatTime(record.time));
}

// ===========================================================================
// 寫入
// ===========================================================================

async function applyPlan(plan) {
    const ctx = getCtx();

    if (!Array.isArray(ctx.chat)) {
        notify('error', '目前沒有已載入的聊天，無法寫入。');
        return false;
    }
    if (typeof ctx.saveChat !== 'function') {
        notify('error', '這個 ST 版本沒有提供 saveChat，無法寫回聊天檔案。');
        return false;
    }
    if (chatSignature() !== plan.signature) {
        notify('error', '聊天內容在確認期間發生變化（換了聊天或收到新訊息），為安全起見已中止。請重新掃描。');
        return false;
    }

    const backup = createBackupPoint('一鍵清除前自動備份');
    const chat = ctx.chat;
    const expected = new Map();
    let touched = 0;

    for (const entry of plan.entries) {
        const message = chat[entry.index];
        if (!message || typeof message !== 'object') continue;

        message.mes = entry.after;

        if (Array.isArray(message.swipes) && message.swipes.length > 0) {
            for (const swipe of entry.swipes) {
                if (swipe.index < message.swipes.length) message.swipes[swipe.index] = swipe.after;
            }
            if (typeof message.swipe_id === 'number' && message.swipes[message.swipe_id] !== message.mes) {
                message.swipes[message.swipe_id] = message.mes;
            }
        }

        if (entry.reasoning && message.extra && typeof message.extra === 'object') {
            message.extra.reasoning = entry.reasoning.after;
        }

        expected.set(entry.index, entry.after);
        touched++;
    }

    await ctx.saveChat();

    try {
        await ctx.reloadCurrentChat?.();
    } catch (err) {
        console.warn(LOG, '寫入後重載聊天失敗，改為逐條刷新訊息區塊', err);
        const fresh = getCtx();
        for (const index of expected.keys()) {
            try {
                fresh.updateMessageBlock?.(index, fresh.chat?.[index]);
            } catch { /* 忽略 */ }
        }
    }

    // 校驗：重新讀回來確認真的寫進去了
    const after = getCtx();
    let mismatched = 0;
    for (const [index, text] of expected) {
        if (String(after.chat?.[index]?.mes ?? '') !== text) mismatched++;
    }

    if (mismatched > 0) {
        notify('error', `寫入校驗未通過：${mismatched}/${touched} 條訊息與預期不符。原檔案多半沒被改動，可用備份點回滾。`);
        return false;
    }

    notify('success', `完成！已清除 ${touched} 條訊息裡的標籤內容。備份點「${formatTime(backup.time)}」可隨時回滾。`);
    state.manualEdits.clear();
    return true;
}

/** 完整流程：重新掃描 → 二次確認 → （有誤刪風險時再問一次）→ 備份 → 寫入 */
async function runApplyFlow({ skipConfirm = false } = {}) {
    if (state.busy) return;
    setButtonsBusy(true);
    setStatus('掃描中…', true);
    const ctx = getCtx();
    try {
        ctx.showLoader?.();
        await new Promise(resolve => setTimeout(resolve, 30));
        const plan = refreshPlan();
        renderBackupList();

        if (plan.entries.length === 0) {
            setStatus('沒有需要清除的標籤。');
            notify('info', '沒有偵測到需要清除的標籤內容（或目前的標籤設定不會改動任何訊息）。');
            return;
        }

        if (!skipConfirm) {
            const confirmHtml = buildConfirmHtml(plan);
            const result = await ctx.callGenericPopup(confirmHtml, ctx.POPUP_TYPE.CONFIRM, '', {
                okButton: localizeText(`確認清除（${plan.entries.length} 條）`, state.locale),
                cancelButton: localizeText('再想想', state.locale),
                wide: true,
                allowVerticalScrolling: true,
            });
            if (result !== ctx.POPUP_RESULT.AFFIRMATIVE) {
                setStatus('已取消，未寫入任何內容。');
                notify('info', '已取消，聊天檔案沒有被改動。');
                return;
            }

            if (plan.riskCount > 0) {
                const risky = plan.entries.filter(entry => entry.risk === 'high').map(entry => `#${entry.index}`);
                const shown = risky.slice(0, 12).join('、') + (risky.length > 12 ? ` 等 ${risky.length} 條` : '');
                const proceed = await ctx.callGenericPopup(
                    localizeText(`檢測到正文 ${escapeHtml(shown)} 可能被誤刪，是否仍然繼續清除？`, state.locale),
                    ctx.POPUP_TYPE.CONFIRM,
                    '',
                    {
                        okButton: localizeText('是', state.locale),
                        cancelButton: localizeText('否', state.locale),
                        wide: true,
                    },
                );
                if (proceed !== ctx.POPUP_RESULT.AFFIRMATIVE) {
                    setStatus('已取消，未寫入任何內容。');
                    notify('info', '已取消，聊天檔案沒有被改動。');
                    return;
                }
            }
        }

        setStatus('寫入中…', true);
        const ok = await applyPlan(plan);
        refreshPlan();
        renderBackupList();
        setStatus(ok ? `完成：已清除 ${plan.entries.length} 條訊息。` : '寫入未完成，請看通知訊息。');
    } catch (err) {
        console.error(LOG, '清除流程失敗', err);
        notify('error', `清除流程失敗：${err?.message ?? err}`);
        setStatus('發生錯誤，詳情見控制台。');
    } finally {
        ctx.hideLoader?.();
        setButtonsBusy(false);
    }
}

function buildConfirmHtml(plan) {
    const rows = plan.entries.slice(0, 40).map(entry => {
        const before = collapseWhitespace(entry.before, 90);
        const after = collapseWhitespace(entry.after, 90) || '（整條清空）';
        const flag = entry.risk === 'high'
        ? `<span style="color:#e0554b">${escapeHtml(localizeText('⚠ 可能誤刪正文', state.locale))}</span>`
        : '';
        return `<tr>
            <td>#${entry.index}</td>
            <td>${escapeHtml(entry.name)}</td>
            <td>${escapeHtml(before)}</td>
            <td>${escapeHtml(after)}</td>
            <td>${flag}</td>
        </tr>`;
    }).join('');

    const more = plan.entries.length > 40
        ? `<p>（僅列出前 40 條，完整內容請看面板的「預覽」頁）</p>`
        : '';

    return trHtml(`
        <h3>確認清除標籤內容</h3>
        <p>即將改寫 <b>${plan.entries.length}</b> 條訊息，刪除約 <b>${plan.removedChars.toLocaleString()}</b> 個字元。</p>
        <p>白名單（保留內容只脫殼）：<b>${escapeHtml(plan.options.whitelist.join('、') || '（無）')}</b></p>
        <p>寫入前會自動建立備份點，之後可以一鍵回滾。</p>
        ${plan.riskCount > 0 ? `<p style="color:#e0554b"><b>注意：正文 ${plan.entries.filter(e => e.risk === 'high').map(e => `#${e.index}`).join('、')} 可能被誤刪（這幾條訊息幾乎整條都會被清掉）。</b></p>` : ''}
        ${plan.residueCount > 0 ? `<p style="color:#e0a03a"><b>有 ${plan.residueCount} 條訊息出現「孤兒標籤前面還有殘留」：插件不確定那段該不該刪，所以保留了。
            請先到「預覽」頁切到「消除前」確認；若確實是垃圾，把設定改成「一律從訊息開頭砍」再清一次。</b></p>` : ''}
        <div style="max-height:40vh;overflow:auto">
            <table class="ts-confirm-table">
                <thead><tr><th>#</th><th>發言者</th><th>清除前</th><th>清除後</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        ${more}
    `);
}

/** 設定頁抽屜與說明視窗的 HTML 都在這裡翻一次（字串層級，不動使用者內容） */
function trHtml(html) {
    return localizeHtml(html, state.locale);
}

// ===========================================================================
// 面板：建立與開關
// ===========================================================================

async function mountPanel() {
    if (document.getElementById('tagsweeper_panel')) {
        state.templateReady = true;
        return;
    }
    const ctx = getCtx();
    let html = '';
    try {
        html = await ctx.renderExtensionTemplateAsync(TEMPLATE_PATH, 'panel', {}, true, false) ?? '';
    } catch (err) {
        console.error(LOG, '載入面板模板失敗', err);
        notify('error', '載入面板模板失敗，請確認插件檔案完整（panel.html 是否存在）並重新整理頁面。');
        return;
    }
    if (!String(html).includes('tagsweeper_panel')) {
        notify('error', '面板模板內容不正確，載入中止。');
        return;
    }
    document.body.insertAdjacentHTML('beforeend', html);
    state.templateReady = true;
    bindPanel();
    applyPanelPosition();
    applyLocale();
    void setTab(getSettings().ui.tab || 'tags');
}

function applyPanelPosition() {
    const panel = document.getElementById('tagsweeper_panel');
    if (!panel) return;
    const settings = getSettings();
    const pos = settings.ui.panelFloat ? settings.ui.panelPos : null;
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        panel.style.left = `${Math.max(0, Math.min(window.innerWidth - 120, pos.left))}px`;
        panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, pos.top))}px`;
        panel.style.right = 'auto';
    } else {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
    }
}

/**
 * 依設定解析目前介面語言，建立翻譯函式，並把面板上的文字換成該語言。
 * 面板 HTML 的原文是繁體，所以 zh-Hant 時什麼都不用做。
 */
function applyLocale() {
    const settings = getSettings();
    state.locale = resolveLocale(settings.ui.locale, getCtx());
    state.tr = makeTranslator(state.locale);

    const select = document.getElementById('ts_locale');
    if (select) select.value = settings.ui.locale ?? 'auto';

    for (const id of ['tagsweeper_panel', 'tagsweeper_settings_body']) {
        const node = document.getElementById(id);
        if (node) localizeTree(node, state.locale);
    }
}

/**
 * 換語言時整塊面板重建：先把舊的 DOM 丟掉，再從乾淨的繁體模板重新掛載，
 * 以免切成英文後又切回中文時，靜態文字卡在英文。
 */
async function setLocale(value) {
    const settings = getSettings();
    settings.ui.locale = LOCALES.includes(value) ? value : 'auto';
    saveSettings();

    const wasOpen = state.open;
    document.getElementById('tagsweeper_panel')?.remove();
    state.templateReady = false;
    await mountPanel();
    await setTab(settings.ui.tab || 'tags');
    if (wasOpen) openPanel();
    else document.getElementById('tagsweeper_panel')?.setAttribute('hidden', '');
    refreshPlan();
}

function bindPanel() {
    const $panel = document.getElementById('tagsweeper_panel');
    if (!$panel) return;
    // 分頁
    $panel.querySelectorAll('.ts-tab').forEach(tab => {
        tab.addEventListener('click', () => { void setTab(tab.dataset.tab); });
    });

    document.getElementById('ts_btn_min')?.addEventListener('click', () => {
        $panel.classList.toggle('ts-collapsed');
    });
    document.getElementById('ts_btn_close')?.addEventListener('click', () => void closePanel());
    document.getElementById('ts_btn_scan')?.addEventListener('click', () => {
        refreshPlan();
        renderBackupList();
        setStatus(`掃描完成：${state.plan?.entries.length ?? 0} 條訊息需要改寫。`);
    });
    document.getElementById('ts_btn_apply')?.addEventListener('click', () => void runApplyFlow());
    document.getElementById('ts_btn_undo')?.addEventListener('click', () => void undoLastBackup());
    document.getElementById('ts_btn_help')?.addEventListener('click', () => showHelp());
    document.getElementById('ts_locale')?.addEventListener('change', event => void setLocale(event.target.value));

    // 標籤頁
    document.getElementById('ts_bulk_remove')?.addEventListener('change', event => {
        bulkSetMode(event.target.checked ? 'remove' : 'ignore');
    });
    document.getElementById('ts_tag_filter')?.addEventListener('input', event => {
        state.filter = String(event.target.value ?? '');
        renderTagList();
    });
    document.getElementById('ts_show_hidden')?.addEventListener('change', event => {
        state.showHidden = !!event.target.checked;
        renderTagList();
    });
    document.getElementById('ts_hide_listed')?.addEventListener('click', () => {
        const plan = state.plan;
        if (!plan || plan.stats.length === 0) return;
        const filter = state.filter.trim().toLowerCase();
        const targets = filter ? plan.stats.filter(s => s.key.includes(filter)) : plan.stats;
        if (targets.length === 0) return;
        for (const stat of targets) setTagHidden(stat.name, true);
        state.showHidden = false;
        renderTagList();
        notify('success', `已隱藏 ${targets.length} 個標籤（仍然會照規則消除，勾「顯示已隱藏」可以叫回來）。`);
    });

    // 外殼頁
    document.getElementById('ts_shell_add')?.addEventListener('click', () => {
        const leftInput = document.getElementById('ts_shell_left');
        const rightInput = document.getElementById('ts_shell_right');
        const left = String(leftInput?.value ?? '').trim();
        const right = String(rightInput?.value ?? '').trim();
        if (!left || !right) {
            notify('warning', '外殼的左界與右界都要填。');
            return;
        }
        if (left === right) {
            notify('warning', '左右界不能相同。');
            return;
        }
        const settings = getSettings();
        const exists = settings.shells.some(shell => shell.open === left && shell.close === right);
        if (exists) {
            notify('warning', `${left}…${right} 已經在清單裡了。`);
            return;
        }
        settings.shells.push({
            id: `shell-${left}${right}`,
            open: left,
            close: right,
            escape: document.getElementById('ts_shell_slash')?.checked ? '/' : '',
            mode: 'remove',
            enabled: true,
            native: left === '<' && right === '>',
        });
        saveSettings();
        if (leftInput) leftInput.value = '';
        if (rightInput) rightInput.value = '';
        renderShells();
        refreshPlan();
        notify('success', `已加入外殼 ${left}…${right}。`);
    });
    document.getElementById('ts_literal_add')?.addEventListener('click', () => {
        const input = document.getElementById('ts_literal_input');
        const value = String(input?.value ?? '');
        if (!value) {
            notify('warning', '請先輸入要移除的內容。');
            return;
        }
        const settings = getSettings();
        if (settings.literals.includes(value)) {
            notify('warning', '這個內容已經在清單裡了。');
            return;
        }
        settings.literals.push(value);
        saveSettings();
        if (input) input.value = '';
        renderShells();
        refreshPlan();
    });
    document.getElementById('ts_literal_input')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') document.getElementById('ts_literal_add')?.click();
    });
    document.getElementById('ts_shell_list')?.addEventListener('click', event => {
        const removeBtn = event.target.closest('[data-shell-remove]');
        if (removeBtn) {
            const settings = getSettings();
            settings.shells = settings.shells.filter(shell => shell.id !== removeBtn.dataset.shellRemove);
            saveSettings();
            renderShells();
            refreshPlan();
            return;
        }
        const slashBtn = event.target.closest('[data-shell-slash]');
        if (slashBtn) {
            const settings = getSettings();
            const shell = settings.shells.find(item => item.id === slashBtn.dataset.shellSlash);
            if (!shell) return;
            shell.escape = shell.escape ? '' : '/';
            saveSettings();
            renderShells();
            refreshPlan();
        }
    });
    document.getElementById('ts_shell_list')?.addEventListener('change', event => {
        const settings = getSettings();
        const enabledBox = event.target.closest('[data-shell-enabled]');
        if (enabledBox) {
            const shell = settings.shells.find(item => item.id === enabledBox.dataset.shellEnabled);
            if (!shell) return;
            shell.enabled = !!enabledBox.checked;
            saveSettings();
            refreshPlan();
            return;
        }
        const modeBox = event.target.closest('[data-shell-mode]');
        if (modeBox) {
            const shell = settings.shells.find(item => item.id === modeBox.dataset.shellMode);
            if (!shell) return;
            shell.mode = modeBox.value === 'keep' ? 'keep' : 'remove';
            saveSettings();
            refreshPlan();
        }
    });
    document.getElementById('ts_literal_list')?.addEventListener('click', event => {
        const removeBtn = event.target.closest('[data-literal-remove]');
        if (!removeBtn) return;
        const settings = getSettings();
        settings.literals = settings.literals.filter(item => item !== removeBtn.dataset.literalRemove);
        saveSettings();
        renderShells();
        refreshPlan();
    });

    // 預覽頁
    document.getElementById('ts_btn_showdel')?.addEventListener('click', () => {
        state.showBefore = !state.showBefore;
        renderPreview();
    });
    document.getElementById('ts_btn_edit')?.addEventListener('click', () => {
        if (state.edit) {
            cancelEdit();
            return;
        }
        beginEdit();
    });
    document.getElementById('ts_page_prev')?.addEventListener('click', () => {
        if (state.edit) return;
        state.previewIndex = clampInt(state.previewIndex - 1, 0, Math.max(0, previewCount() - 1), 0);
        renderPreview();
    });
    document.getElementById('ts_page_next')?.addEventListener('click', () => {
        if (state.edit) return;
        state.previewIndex = clampInt(state.previewIndex + 1, 0, Math.max(0, previewCount() - 1), 0);
        renderPreview();
    });
    document.getElementById('ts_edit_undo')?.addEventListener('click', () => editHistoryStep(-1));
    document.getElementById('ts_edit_redo')?.addEventListener('click', () => editHistoryStep(1));
    document.getElementById('ts_edit_save')?.addEventListener('click', () => commitEdit());
    document.getElementById('ts_edit_cancel')?.addEventListener('click', () => cancelEdit());
    // 編輯區每次重繪都會重建，所以用委派綁在容器上
    const previewBody = document.getElementById('ts_preview_body');
    previewBody?.addEventListener('input', event => {
        if (event.target?.id === 'ts_preview_edit') scheduleEditHistory();
    });
    previewBody?.addEventListener('keydown', event => {
        if (event.target?.id !== 'ts_preview_edit') return;
        if (!(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === 'z') {
            event.preventDefault();
            editHistoryStep(event.shiftKey ? 1 : -1);
        } else if (key === 'y') {
            event.preventDefault();
            editHistoryStep(1);
        } else if (key === 's') {
            event.preventDefault();
            commitEdit();
        }
    });

    // 白名單頁
    document.getElementById('ts_white_add')?.addEventListener('click', () => {
        const input = document.getElementById('ts_white_input');
        const value = normalizeTagName(input?.value ?? '');
        if (!value) {
            notify('warning', '請先輸入標籤名。');
            return;
        }
        setTagMode(value, 'keep');
        if (input) input.value = '';
        renderWhitelist();
        refreshPlan();
        notify('success', `已把 <${value}> 加入白名單（保留內容、只脫外殼）。`);
    });
    document.getElementById('ts_white_input')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') document.getElementById('ts_white_add')?.click();
    });
    document.getElementById('ts_white_preset')?.addEventListener('click', () => {
        const settings = getSettings();
        for (const name of DEFAULT_BODY_TAGS) {
            if (!settings.whitelist.some(x => String(x).toLowerCase() === name.toLowerCase())) settings.whitelist.push(name);
        }
        saveSettings();
        renderWhitelist();
        refreshPlan();
    });
    document.getElementById('ts_white_none')?.addEventListener('click', () => {
        const settings = getSettings();
        settings.whitelist = [];
        saveSettings();
        renderWhitelist();
        refreshPlan();
    });
    document.getElementById('ts_white_export')?.addEventListener('click', () => {
        const settings = getSettings();
        const text = settings.whitelist.join('\n');
        if (downloadText('tagsweeper-whitelist.txt', text)) notify('info', '白名單已匯出成文字檔。');
    });
    document.getElementById('ts_white_import')?.addEventListener('click', async () => {
        const ctx = getCtx();
        const text = await ctx.Popup.show.input('匯入白名單', '一行一個標籤名，貼上後按確認：', '', { okButton: '匯入', cancelButton: '取消' });
        if (!text) return;
        const settings = getSettings();
        let added = 0;
        for (const line of String(text).split(/[\n,，、\s]+/)) {
            const name = normalizeTagName(line);
            if (!name) continue;
            const key = name.toLowerCase();
            settings.ignore = settings.ignore.filter(x => String(x).toLowerCase() !== key);
            if (settings.whitelist.some(x => String(x).toLowerCase() === key)) continue;
            settings.whitelist.push(name);
            added++;
        }
        saveSettings();
        renderWhitelist();
        refreshPlan();
        notify('success', `已匯入 ${added} 個白名單標籤。`);
    });

    // 備份（設定頁裡）
    document.getElementById('ts_keep_backups')?.addEventListener('change', event => {
        const settings = getSettings();
        settings.keepBackups = clampInt(event.target.value, 1, 50, DEFAULT_SETTINGS.keepBackups);
        event.target.value = String(settings.keepBackups);
        pruneBackups(settings);
        saveSettings();
        renderBackupList();
    });
    document.getElementById('ts_backup_now')?.addEventListener('click', () => {
        const record = createBackupPoint('手動備份');
        renderBackupList();
        notify('success', `已建立備份點：${formatTime(record.time)}`);
    });
    document.getElementById('ts_backup_import')?.addEventListener('click', () => {
        document.getElementById('ts_backup_file')?.click();
    });
    document.getElementById('ts_backup_file')?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void importBackupFile(file);
    });

    // 設定頁
    $panel.querySelectorAll('[data-opt]').forEach(input => {
        input.addEventListener('change', () => {
            const settings = getSettings();
            const key = input.dataset.opt;
            const value = input.type === 'checkbox' ? !!input.checked : input.value;
            if (key === 'hotkeyEnabled') {
                settings.ui.hotkeyEnabled = value;
            } else if (key === 'panelFloat') {
                settings.ui.panelFloat = value;
                applyPanelPosition();
            } else {
                settings.options[key] = value;
            }
            saveSettings();
            refreshPlan();
        });
    });
    document.getElementById('ts_opt_orphan_close')?.addEventListener('change', event => {
        getSettings().options.orphanCloseMode = event.target.value;
        saveSettings();
        refreshPlan();
    });
    document.getElementById('ts_opt_orphan_anchor')?.addEventListener('change', event => {
        getSettings().options.orphanAnchorMode = event.target.value;
        saveSettings();
        refreshPlan();
    });
    document.getElementById('ts_opt_orphan_open')?.addEventListener('change', event => {
        getSettings().options.orphanOpenMode = event.target.value;
        saveSettings();
        refreshPlan();
    });
    document.getElementById('ts_regex_restore')?.addEventListener('click', async () => {
        const done = await toggleRegexPause();
        notify(done ? 'success' : 'info', done ? '已暫時關閉所有正則。' : '已還原所有正則。');
    });
    const hotkeyInput = document.getElementById('ts_hotkey');
    hotkeyInput?.addEventListener('keydown', event => {
        event.preventDefault();
        event.stopPropagation();
        const combo = hotkeyFromEvent(event);
        if (!combo) return;
        getSettings().ui.hotkey = combo;
        saveSettings();
        hotkeyInput.value = combo;
        renderHotkeyInput();
    });
    hotkeyInput?.addEventListener('click', () => hotkeyInput.select());
    document.getElementById('ts_hotkey_reset')?.addEventListener('click', () => {
        getSettings().ui.hotkey = HOTKEY_DEFAULT;
        saveSettings();
        renderHotkeyInput();
    });
    document.getElementById('ts_panel_reset_pos')?.addEventListener('click', () => {
        getSettings().ui.panelPos = null;
        saveSettings();
        applyPanelPosition();
    });
    document.getElementById('ts_settings_reset')?.addEventListener('click', async () => {
        const ctx = getCtx();
        const result = await ctx.callGenericPopup(
            '<h3>恢復出廠設定</h3><p>會把選項、白名單、不理會清單與面板位置恢復成預設值。</p><p><b>備份點不會被刪除。</b></p>',
            ctx.POPUP_TYPE.CONFIRM,
            '',
            { okButton: '恢復預設', cancelButton: '取消' },
        );
        if (result !== ctx.POPUP_RESULT.AFFIRMATIVE) return;
        const settings = getSettings();
        const backups = settings.backups;
        const store = settingsStore();
        store[MODULE_NAME] = {
            ...jsonClone(DEFAULT_SETTINGS),
            backups,
            pendingRegexRestore: null,
        };
        saveSettings();
        syncSettingsUi();
        renderWhitelist();
        renderBackupList();
        refreshPlan();
        notify('success', '已恢復出廠設定。');
    });

    bindDrag();
}

function bindDrag() {
    const titlebar = document.getElementById('ts_titlebar');
    const panel = document.getElementById('tagsweeper_panel');
    if (!titlebar || !panel) return;

    titlebar.addEventListener('mousedown', event => {
        if (event.target.closest('.ts-winbtn')) return;
        const rect = panel.getBoundingClientRect();
        state.drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        event.preventDefault();
    });

    window.addEventListener('mousemove', event => {
        if (!state.drag) return;
        const left = Math.max(0, Math.min(window.innerWidth - 100, event.clientX - state.drag.dx));
        const top = Math.max(0, Math.min(window.innerHeight - 40, event.clientY - state.drag.dy));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = 'auto';
    });

    window.addEventListener('mouseup', () => {
        if (!state.drag) return;
        state.drag = null;
        const settings = getSettings();
        if (settings.ui.panelFloat) {
            const rect = panel.getBoundingClientRect();
            settings.ui.panelPos = { left: Math.round(rect.left), top: Math.round(rect.top) };
            saveSettings();
        }
    });
}

/** 切換分頁。若正在手動編輯，先問要不要保存（取消＝當無事發生） */
async function setTab(tab) {
    if (tab === 'probe' || tab === 'backup') tab = 'settings';
    if (state.edit && tab !== 'preview' && tab !== state.tab) {
        const ctx = getCtx();
        const result = await ctx.callGenericPopup(
            localizeText('這一條訊息還在手動編輯中。要先保存再切換嗎？', state.locale),
            ctx.POPUP_TYPE.CONFIRM,
            '',
            {
                okButton: localizeText('保存並切換', state.locale),
                cancelButton: localizeText('取消', state.locale),
            },
        );
        if (result !== ctx.POPUP_RESULT.AFFIRMATIVE) return;
        commitEdit();
    }
    state.tab = tab;
    const settings = getSettings();
    settings.ui.tab = tab;
    saveSettings();

    document.querySelectorAll('#tagsweeper_panel .ts-tab').forEach(node => {
        node.classList.toggle('ts-active', node.dataset.tab === tab);
    });
    document.querySelectorAll('#tagsweeper_panel .ts-page').forEach(node => {
        node.hidden = node.dataset.page !== tab;
    });

    if (tab === 'whitelist') renderWhitelist();
    if (tab === 'settings') {
        syncSettingsUi();
        renderBackupList();
    }
    if (tab === 'tags') renderTagList();
    if (tab === 'shells') renderShells();
    if (tab === 'preview') renderPreview();

    const panel = document.getElementById('tagsweeper_panel');
    if (panel) localizeTree(panel, state.locale);
}

async function openPanel() {
    await mountPanel();
    const panel = document.getElementById('tagsweeper_panel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('ts-collapsed');
    state.open = true;
    applyPanelPosition();
    syncSettingsUi();
    setStatus('正在掃描…', true);
    // 讀的是聊天檔案的原始內容（跟按鉛筆看到的編輯框一模一樣），所以不需要動正則
    await new Promise(resolve => setTimeout(resolve, 20));
    refreshPlan();
    renderWhitelist();
    renderBackupList();
    setStatus(`掃描完成：${state.plan?.scanned ?? 0} 條訊息、${state.plan?.stats?.length ?? 0} 種標籤、${state.plan?.entries?.length ?? 0} 條需要改寫。`);
}

async function closePanel() {
    const panel = document.getElementById('tagsweeper_panel');
    if (panel) panel.hidden = true;
    state.open = false;
    if (getSettings().pendingRegexRestore) {
        await restoreRegex();
        notify('info', '已還原所有正則。');
    }
}

async function togglePanel() {
    if (state.open) await closePanel();
    else await openPanel();
}

// ===========================================================================
// 面板：各頁渲染
// ===========================================================================

function renderSummary() {
    const node = document.getElementById('ts_summary');
    const labelNode = document.getElementById('ts_chatlabel');
    const label = chatDisplayLabel();
    if (labelNode) {
        labelNode.textContent = label.name || label.id || '未開啟聊天';
        labelNode.title = label.display;
    }
    if (!node) return;
    const plan = state.plan;
    if (!plan) {
        node.innerHTML = localizeHtml(`聊天：<b>${escapeHtml(label.display)}</b> ｜ 尚未掃描。`, state.locale);
        return;
    }
    const tagNames = plan.stats.map(s => s.key);
    const keepCount = plan.stats.filter(s => s.whitelisted).length;
    const ignoreCount = plan.stats.filter(s => s.ignored).length;
    node.innerHTML = localizeHtml([
        `聊天：<b>${escapeHtml(label.display)}</b>`,
        `掃描 <b>${plan.scanned}</b> 條`,
        `有標籤 <b>${plan.tagged}</b> 條`,
        `標籤種類 <b>${tagNames.length}</b>`,
        `將改寫 <b>${plan.entries.length}</b> 條`,
        `刪除約 <b>${plan.removedChars.toLocaleString()}</b> 字`,
        `白名單 <b>${keepCount}</b>`,
        ignoreCount ? `不理會 <b>${ignoreCount}</b>` : '',
        plan.residueCount ? `<b class="ts-red">殘留警告 ${plan.residueCount} 條</b>` : '',
        plan.riskCount ? `<b class="ts-red">可能誤刪 ${plan.riskCount} 條</b>` : '',
    ].filter(Boolean).join(' ｜ '), state.locale);
}

function tagDisplayName(name) {
    return name === COMMENT_TAG ? '<!-- -->' : `<${name}>`;
}

function renderTagList() {
    const list = document.getElementById('ts_taglist');
    if (!list) return;
    const plan = state.plan;
    list.innerHTML = '';

    if (!plan || plan.stats.length === 0) {
        list.innerHTML = localizeHtml('<div class="ts-empty">這個聊天檔案裡沒有偵測到任何 &lt; &gt; 標籤。</div>', state.locale);
        updateBulkChecks();
        return;
    }

    const filter = state.filter.trim().toLowerCase();
    const stats = filter ? plan.stats.filter(s => s.key.includes(filter)) : plan.stats;
    const hiddenCount = plan.stats.filter(s => isTagHidden(s.name)).length;
    const visible = stats.filter(s => state.showHidden || !isTagHidden(s.name));

    const hiddenCountNode = document.getElementById('ts_hidden_count');
    if (hiddenCountNode) hiddenCountNode.textContent = String(hiddenCount);
    const showHiddenBox = document.getElementById('ts_show_hidden');
    if (showHiddenBox) showHiddenBox.checked = state.showHidden;
    const hideListedBtn = document.getElementById('ts_hide_listed');
    if (hideListedBtn) hideListedBtn.classList.toggle('ts-disabled', stats.length === 0);

    if (visible.length === 0) {
        list.innerHTML = localizeHtml(hiddenCount > 0 && !state.showHidden
            ? `<div class="ts-empty">列表上的 ${hiddenCount} 個標籤都被你隱藏了。勾「顯示已隱藏」可以叫回來（它們仍然會照規則處理）。</div>`
            : '<div class="ts-empty">沒有符合篩選條件的標籤。</div>', state.locale);
        updateBulkChecks();
        return;
    }

    for (const stat of visible) {
        const mode = getTagMode(stat.name);
        const hidden = isTagHidden(stat.name);
        const item = document.createElement('div');
        item.className = 'ts-tagitem';

        const row = document.createElement('div');
        row.className = `ts-tagrow ts-mode-${mode === 'keep' ? 'keep' : mode === 'ignore' ? 'alone' : 'remove'}`;
        if (hidden) row.style.opacity = '0.55';

        const boxRemove = document.createElement('div');
        boxRemove.className = `ts-box ts-box-remove${mode === 'remove' ? ' ts-on' : ''}`;
        boxRemove.textContent = mode === 'remove' ? '✕' : '';
        boxRemove.title = '勾選＝消除（連裡面的內容一起刪掉）';
        boxRemove.addEventListener('click', () => {
            setTagMode(stat.name, mode === 'remove' ? 'ignore' : 'remove');
            refreshPlan();
        });

        const boxWhite = document.createElement('div');
        boxWhite.className = `ts-box ts-box-white${mode === 'keep' ? ' ts-on' : ''}`;
        boxWhite.textContent = mode === 'keep' ? '✓' : '';
        boxWhite.title = '勾選＝加入白名單（保留內容，只脫掉 <> 外殼）；白名單裡的內容永遠不會被消除';
        boxWhite.addEventListener('click', () => {
            setTagMode(stat.name, mode === 'keep' ? 'ignore' : 'keep');
            refreshPlan();
        });

        const name = document.createElement('div');
        name.className = 'ts-tagname';
        name.textContent = tagDisplayName(stat.name);
        name.title = tagDisplayName(stat.name);

        const sample = document.createElement('div');
        sample.className = 'ts-sample';
        sample.textContent = stat.sample || '';
        sample.title = stat.sample || '';

        const meta = document.createElement('div');
        meta.className = 'ts-meta';
        const parts = [`出現 ${stat.count}`];
        if (stat.paired) parts.push(`成對 ${stat.paired}`);
        if (stat.orphanOpen) parts.push(`孤兒開 ${stat.orphanOpen}`);
        if (stat.orphanClose) parts.push(`孤兒閉 ${stat.orphanClose}`);
        if (stat.selfClosing) parts.push(`自閉合 ${stat.selfClosing}`);
        const badges = [];
        if (stat.orphanOpen || stat.orphanClose) badges.push('<span class="ts-badge ts-warn">破損</span>');
        if (mode === 'ignore') badges.push('<span class="ts-badge">不理會</span>');
        meta.innerHTML = parts.map(part => `<span class="ts-metapart">${escapeHtml(part)}</span>`).join('')
            + badges.join('');

        const sources = Array.isArray(plan.tagSources?.get(stat.key)) ? plan.tagSources.get(stat.key) : [];

        const buttons = document.createElement('div');
        buttons.className = 'ts-rowbtns';

        const expandBtn = document.createElement('div');
        expandBtn.className = `ts-minibtn${state.expanded.has(stat.key) ? ' ts-on' : ''}`;
        expandBtn.textContent = state.expanded.has(stat.key) ? '▾' : '▸';
        expandBtn.title = `看這個標籤出現在哪幾條訊息（共 ${sources.length} 條）`;
        expandBtn.addEventListener('click', () => {
            if (state.expanded.has(stat.key)) state.expanded.delete(stat.key);
            else state.expanded.add(stat.key);
            renderTagList();
        });

        const hideBtn = document.createElement('div');
        hideBtn.className = `ts-minibtn${hidden ? ' ts-on' : ''}`;
        hideBtn.textContent = hidden ? '🚫' : '👁';
        hideBtn.title = hidden ? '取消隱藏（重新顯示在清單上）' : '隱藏這個標籤（只是不顯示，仍然照規則消除）';
        hideBtn.addEventListener('click', () => {
            setTagHidden(stat.name, !hidden);
            renderTagList();
        });

        buttons.append(expandBtn, hideBtn);
        row.append(boxRemove, boxWhite, name, sample, meta, buttons);
        item.append(row);

        if (state.expanded.has(stat.key)) {
            item.append(buildSourcesPanel(stat, sources));
        }

        list.append(item);
    }

    localizeTree(list, state.locale);
    updateBulkChecks();
}

/** 展開後顯示「這個標籤來自哪幾條訊息」，方便跟編輯框核對 */
function buildSourcesPanel(stat, sources) {
    const box = document.createElement('div');
    box.className = 'ts-sources';

    if (sources.length === 0) {
        box.textContent = localizeText('（找不到來源訊息）', state.locale);
        return box;
    }

    const head = document.createElement('div');
    head.className = 'ts-hint ts-inline';
    head.textContent = `${tagDisplayName(stat.name)} 出現在 ${sources.length} 條訊息裡`
        + (sources.length > 30 ? '（只列出前 30 條）' : '')
        + ' —— 點訊息編號可以跳到那一條，跟編輯框對照。';
    box.append(head);

    for (const source of sources.slice(0, 30)) {
        const row = document.createElement('div');
        row.className = 'ts-source-row';

        const idx = document.createElement('span');
        idx.className = 'ts-source-idx';
        idx.textContent = `#${source.index}`;
        idx.title = '跳到這條訊息';
        idx.addEventListener('click', () => jumpToMessage(source.index));

        const who = document.createElement('span');
        who.className = 'ts-source-idx';
        who.style.cursor = 'default';
        who.style.color = 'var(--ts-dim)';
        who.textContent = source.name;

        const text = document.createElement('span');
        text.className = 'ts-source-text';
        text.textContent = source.sample || '';
        text.title = source.sample || '';

        row.append(idx, who, text);
        box.append(row);
    }

    localizeTree(box, state.locale);
    return box;
}

/** 把聊天捲到指定訊息並閃一下 */
function jumpToMessage(index) {
    const el = document.querySelector(`#chat .mes[mesid="${index}"]`);
    if (!el) {
        notify('warning', `找不到第 ${index} 條訊息（可能還沒載入到畫面上）。`);
        return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prevOutline = el.style.outline;
    const prevOffset = el.style.outlineOffset;
    el.style.outline = '2px solid var(--SmartThemeQuoteColor, #e2703a)';
    el.style.outlineOffset = '2px';
    setTimeout(() => {
        el.style.outline = prevOutline;
        el.style.outlineOffset = prevOffset;
    }, 1600);
}

function updateBulkChecks() {
    const plan = state.plan;
    const removeBox = document.getElementById('ts_bulk_remove');
    if (!removeBox) return;
    if (!plan || plan.stats.length === 0) {
        removeBox.checked = false;
        removeBox.indeterminate = false;
        return;
    }
    const modes = plan.stats.map(s => getTagMode(s.name));
    const allRemove = modes.every(m => m === 'remove');
    removeBox.checked = allRemove;
    removeBox.indeterminate = !allRemove && modes.some(m => m === 'remove');
}

function bulkSetMode(mode) {
    const plan = state.plan;
    if (!plan || plan.stats.length === 0) return;
    for (const stat of plan.stats) setTagMode(stat.name, mode);
    refreshPlan();
}

function previewEntries() {
    return state.plan?.entries ?? [];
}

function previewCount() {
    return previewEntries().length;
}

function clampPreviewIndex() {
    const count = previewCount();
    state.previewIndex = clampInt(state.previewIndex, 0, Math.max(0, count - 1), 0);
}

/** 預覽頁：一次顯示一條訊息，可翻頁、可切換顯示刪除內容、可手動編輯 */
function renderPreview() {
    const body = document.getElementById('ts_preview_body');
    if (!body) return;

    clampPreviewIndex();
    const entries = previewEntries();
    const entry = entries[state.previewIndex] ?? null;

    const showDelBtn = document.getElementById('ts_btn_showdel');
    if (showDelBtn) {
        showDelBtn.classList.toggle('ts-on', state.showBefore);
        showDelBtn.textContent = state.showBefore ? '顯示刪除內容：開' : '顯示刪除內容：關';
    }
    const editBtn = document.getElementById('ts_btn_edit');
    if (editBtn) {
        editBtn.classList.toggle('ts-on', !!state.edit);
        editBtn.textContent = state.edit ? '結束編輯' : '手動編輯內容';
    }
    const editBar = document.getElementById('ts_edit_bar');
    if (editBar) editBar.hidden = !state.edit;
    const pager = document.getElementById('ts_pager');
    if (pager) pager.hidden = !!state.edit;

    const countNode = document.getElementById('ts_preview_count');
    if (countNode) {
        countNode.textContent = entries.length === 0
            ? ''
            : localizeText(
                `共 ${entries.length} 條訊息、刪除約 ${Number(state.plan?.removedChars ?? 0).toLocaleString()} 字`,
                state.locale,
            );
    }
    const pageLabel = document.getElementById('ts_page_label');
    if (pageLabel) pageLabel.textContent = entries.length ? `${state.previewIndex + 1} / ${entries.length}` : '0 / 0';

    const headNode = document.getElementById('ts_preview_head');
    if (headNode) {
        headNode.innerHTML = entry ? buildPreviewHeadHtml(entry) : '';
        localizeTree(headNode, state.locale);
    }

    body.innerHTML = '';
    if (!entry) {
        body.innerHTML = localizeHtml('<div class="ts-empty">沒有需要改寫的訊息。</div>', state.locale);
        return;
    }

    if (state.edit && state.edit.index === entry.index) {
        body.append(buildEditArea());
        return;
    }

    const pre = document.createElement('pre');
    pre.className = 'ts-msg-body';
    if (state.showBefore) pre.innerHTML = renderHighlighted(entry.before, entry.analysis.merged);
    else pre.textContent = entry.after;
    body.append(pre);
}

function buildPreviewHeadHtml(entry) {
    const removed = entry.before.length - entry.after.length;
    const parts = [
        `<span class="ts-msg-name">${escapeHtml(entry.name)}</span>`,
        `<span>#${entry.index}</span>`,
        `<span>${entry.isUser ? '用戶' : 'AI'}</span>`,
        `<span>刪除 ${removed} 字</span>`,
    ];
    if (entry.manual) parts.push('<span class="ts-badge">已手動編輯</span>');
    if (entry.swipes.length) parts.push(`<span>另含 ${entry.swipes.length} 個 swipe</span>`);
    if (entry.reasoning) parts.push('<span>含思維鏈欄位</span>');
    if (entry.residue) {
        parts.push('<span class="ts-badge ts-warn" title="這條訊息開頭可能還有沒被清掉的內容。&#10;如果那些確實該刪，可以把「落單的結尾標籤 → 要從哪裡開始砍」改成「一律從訊息開頭砍」。">⚠ 前面可能還有殘留</span>');
    }
    if (entry.risk === 'high') parts.push('<span class="ts-badge ts-warn" title="這條訊息幾乎整條都會被清掉，正文可能不保。">⚠ 可能誤刪正文</span>');
    return parts.join('');
}

/** 把「將被刪除」的區間標紅，其餘原樣（都經過 HTML 轉義） */
function renderHighlighted(text, merged) {
    let html = '';
    let cursor = 0;
    for (const range of merged ?? []) {
        const start = Math.max(cursor, Math.min(range.start, text.length));
        const end = Math.max(start, Math.min(range.end, text.length));
        html += escapeHtml(text.slice(cursor, start));
        html += `<mark class="ts-del">${escapeHtml(text.slice(start, end))}</mark>`;
        cursor = end;
    }
    html += escapeHtml(text.slice(cursor));
    return html;
}

// ===========================================================================
// 手動編輯
// ===========================================================================

/** 把文字轉成可編輯的 HTML：換行變 <br>，將被刪除的段落包成紅色 <mark> */
function textToEditableHtml(text, merged) {
    const source = String(text ?? '');
    const html = renderHighlighted(source, merged);
    return html.split('\n').join('<br>');
}

/** 把可編輯區的內容讀回純文字 */
function editableToText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    clone.querySelectorAll('div, p').forEach(block => block.append('\n'));
    return String(clone.textContent ?? '').replace(/\u00a0/g, ' ');
}

function buildEditArea() {
    const edit = state.edit;
    const area = document.createElement('div');
    area.id = 'ts_preview_edit';
    area.className = 'ts-edit-area';
    area.contentEditable = 'true';
    area.spellcheck = false;
    area.innerHTML = edit.history[edit.cursor] ?? textToEditableHtml(edit.before, edit.merged);
    return area;
}

function beginEdit() {
    const entry = previewEntries()[state.previewIndex];
    if (!entry) {
        notify('warning', '目前沒有可以編輯的訊息。');
        return;
    }
    const initial = textToEditableHtml(entry.before, entry.analysis.merged);
    state.edit = {
        index: entry.index,
        before: entry.before,
        merged: entry.analysis.merged,
        history: [initial],
        cursor: 0,
        timer: null,
    };
    renderPreview();
    notify('info', `第 #${entry.index} 條：紅色是要刪掉的內容，可以直接修改或整段刪掉，好了按「保存」。`);
}

function currentEditSnapshot() {
    const area = document.getElementById('ts_preview_edit');
    return area ? area.innerHTML : '';
}

/** 把當前編輯狀態補進歷史（同步） */
function flushEditHistory() {
    const edit = state.edit;
    if (!edit) return;
    if (edit.timer) {
        clearTimeout(edit.timer);
        edit.timer = null;
    }
    const snapshot = currentEditSnapshot();
    if (!snapshot || snapshot === edit.history[edit.cursor]) return;
    edit.history = edit.history.slice(0, edit.cursor + 1);
    edit.history.push(snapshot);
    if (edit.history.length > 60) edit.history.shift();
    edit.cursor = edit.history.length - 1;
}

function scheduleEditHistory() {
    const edit = state.edit;
    if (!edit) return;
    if (edit.timer) clearTimeout(edit.timer);
    edit.timer = setTimeout(() => {
        edit.timer = null;
        flushEditHistory();
    }, 300);
}

function editHistoryStep(direction) {
    const edit = state.edit;
    if (!edit) return;
    const area = document.getElementById('ts_preview_edit');
    if (!area) return;
    flushEditHistory();
    const next = edit.cursor + direction;
    if (next < 0 || next >= edit.history.length) return;
    edit.cursor = next;
    area.innerHTML = edit.history[next];
}

function cancelEdit() {
    if (!state.edit) return;
    state.edit = null;
    renderPreview();
}

function commitEdit() {
    const edit = state.edit;
    if (!edit) return;
    const area = document.getElementById('ts_preview_edit');
    const text = editableToText(area);
    state.manualEdits.set(edit.index, text);
    state.edit = null;
    refreshPlan();
    notify('success', `第 #${edit.index} 條已套用手動編輯（還沒寫回聊天檔案，按「一鍵清除」才會生效）。`);
}

function renderWhitelist() {
    const container = document.getElementById('ts_white_chips');
    if (!container) return;
    const settings = getSettings();
    container.innerHTML = '';

    if (settings.whitelist.length === 0) {
        container.innerHTML = '<div class="ts-hint">白名單是空的：目前所有標籤都會被連內容刪掉。</div>';
    }

    for (const name of settings.whitelist) {
        const chip = document.createElement('span');
        chip.className = 'ts-chipitem';
        const label = document.createElement('span');
        label.textContent = tagDisplayName(name);
        const close = document.createElement('span');
        close.className = 'ts-chip-x';
        close.textContent = '✕';
        close.title = '從白名單移除';
        close.addEventListener('click', () => {
            setTagMode(name, 'remove');
            renderWhitelist();
            refreshPlan();
        });
        chip.append(label, close);
        container.append(chip);
    }

    if (settings.ignore.length > 0) {
        const title = document.createElement('div');
        title.className = 'ts-hint';
        title.style.width = '100%';
        title.textContent = localizeText(`不理會（原樣保留）：${settings.ignore.map(tagDisplayName).join('、')}`, state.locale);
        container.append(title);
    }

    localizeTree(container, state.locale);
}

/** 外殼頁：外殼清單 + 完全匹配移除清單 */
function renderShells() {
    const list = document.getElementById('ts_shell_list');
    if (!list && !document.getElementById('ts_literal_list')) return;

    const settings = getSettings();
    const plan = state.plan;
    const shellStats = new Map((plan?.shellStats ?? []).map(stat => [`${stat.open}\u0000${stat.close}`, stat]));

    if (list) {
        list.innerHTML = '';
        if (settings.shells.length === 0) {
            list.innerHTML = localizeHtml('<div class="ts-empty">目前沒有外殼。</div>', state.locale);
        }
        for (const shell of settings.shells) {
            const row = document.createElement('div');
            row.className = 'ts-listrow ts-shellrow';

            const enable = document.createElement('input');
            enable.type = 'checkbox';
            enable.checked = shell.enabled;
            enable.title = shell.enabled ? '已啟用' : '已停用';
            enable.dataset.shellEnabled = shell.id;

            const label = document.createElement('span');
            label.className = 'ts-shell-label';
            label.textContent = `${shell.open} … ${shell.close}`;

            const stat = shellStats.get(`${shell.open}\u0000${shell.close}`);
            const detail = document.createElement('span');
            detail.className = 'ts-shell-detail';
            if (shell.native) {
                detail.textContent = stat ? `命中 ${stat.count} 次 · 內容取捨看白名單` : '原生 < > 標籤，內容取捨看白名單';
            } else {
                const modeText = shell.mode === 'keep' ? '只脫殼' : '整段消除';
                detail.textContent = stat
                    ? `${modeText} · 命中 ${stat.count} 次 · 刪 ${stat.removedChars} 字`
                    : `${modeText} · 未命中`;
            }

            row.append(enable, label, detail);

            if (!shell.native) {
                const mode = document.createElement('select');
                mode.className = 'ts-select ts-shell-mode';
                mode.dataset.shellMode = shell.id;
                for (const [value, text] of [['remove', '整段消除'], ['keep', '只脫殼']]) {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = text;
                    option.selected = shell.mode === value;
                    mode.append(option);
                }

                const slash = document.createElement('div');
                slash.className = `menu_button ts-btn ts-mini${shell.escape ? ' ts-on' : ''}`;
                slash.textContent = '/ 收束';
                slash.title = shell.escape ? '右界前面要有 / 才算結尾，點一下取消' : '點一下改成右界前面要有 / 才算結尾';
                slash.dataset.shellSlash = shell.id;

                const remove = document.createElement('div');
                remove.className = 'menu_button ts-btn ts-mini';
                remove.textContent = '刪除';
                remove.dataset.shellRemove = shell.id;

                row.append(mode, slash, remove);
            }

            list.append(row);
        }
        localizeTree(list, state.locale);
    }

    const literalList = document.getElementById('ts_literal_list');
    if (!literalList) return;
    const literalStats = new Map((plan?.literalStats ?? []).map(stat => [stat.literal, stat]));
    literalList.innerHTML = '';
    if (settings.literals.length === 0) {
        literalList.innerHTML = localizeHtml('<div class="ts-empty">目前沒有指定要移除的內容。</div>', state.locale);
        return;
    }
    for (const literal of settings.literals) {
        const row = document.createElement('div');
        row.className = 'ts-listrow';

        const label = document.createElement('code');
        label.className = 'ts-literal';
        label.textContent = literal.replace(/\n/g, '⏎');

        const stat = literalStats.get(literal);
        const detail = document.createElement('span');
        detail.className = 'ts-shell-detail';
        detail.textContent = stat ? `命中 ${stat.count} 次 · 刪 ${stat.removedChars} 字` : '未命中';

        const remove = document.createElement('div');
        remove.className = 'menu_button ts-btn ts-mini';
        remove.textContent = '刪除';
        remove.dataset.literalRemove = literal;

        row.append(label, detail, remove);
        literalList.append(row);
    }

    localizeTree(literalList, state.locale);
}

function renderBackupList() {
    const container = document.getElementById('ts_backup_list');
    if (!container) return;
    const settings = getSettings();
    container.innerHTML = '';

    const keepInput = document.getElementById('ts_keep_backups');
    if (keepInput) keepInput.value = String(settings.keepBackups);

    if (settings.backups.length === 0) {
        container.innerHTML = '<div class="ts-empty">目前沒有任何備份點。</div>';
        return;
    }

    for (const record of settings.backups) {
        const row = document.createElement('div');
        row.className = 'ts-listrow';

        const main = document.createElement('div');
        main.className = 'ts-listmain';
        main.innerHTML = localizeHtml(`<b>${escapeHtml(record.label)}</b> <span>· ${escapeHtml(formatTime(record.time))}`
            + ` · ${record.messageCount} 條 · ${formatBytes(record.bytes)}`
            + `${record.reason ? ` · ${escapeHtml(record.reason)}` : ''}`
            + `${record.payload ? '' : ' · <b>僅檔案</b>'}</span>`, state.locale);

        const rollback = document.createElement('div');
        rollback.className = 'menu_button ts-btn';
        rollback.textContent = '回滾';
        rollback.title = record.payload ? '用這個備份點覆蓋當前聊天' : '這個備份點沒有內嵌資料，需用「匯入備份檔」還原';
        rollback.addEventListener('click', () => void restoreBackupById(record.id));

        const download = document.createElement('div');
        download.className = 'menu_button ts-btn';
        download.textContent = '下載';
        download.addEventListener('click', () => downloadBackup(record));

        const remove = document.createElement('div');
        remove.className = 'menu_button ts-btn';
        remove.textContent = '刪除';
        remove.addEventListener('click', () => {
            const current = getSettings();
            current.backups = current.backups.filter(x => x.id !== record.id);
            saveSettings();
            renderBackupList();
        });

        row.append(main, rollback, download, remove);
        container.append(row);
    }

    localizeTree(container, state.locale);
}

function syncSettingsUi() {
    const settings = getSettings();
    const panel = document.getElementById('tagsweeper_panel');
    if (!panel) return;

    panel.querySelectorAll('[data-opt]').forEach(input => {
        const key = input.dataset.opt;
        let value;
        if (key === 'hotkeyEnabled' || key === 'panelFloat') value = settings.ui[key];
        else value = settings.options[key];
        if (input.type === 'checkbox') input.checked = !!value;
        else input.value = value ?? '';
    });

    const closeSelect = document.getElementById('ts_opt_orphan_close');
    if (closeSelect) closeSelect.value = settings.options.orphanCloseMode;
    const anchorSelect = document.getElementById('ts_opt_orphan_anchor');
    if (anchorSelect) anchorSelect.value = settings.options.orphanAnchorMode;
    const openSelect = document.getElementById('ts_opt_orphan_open');
    if (openSelect) openSelect.value = settings.options.orphanOpenMode;

    renderHotkeyInput();
    setRegexChip();

    const regexBtn = document.getElementById('ts_regex_restore');
    if (regexBtn) {
        regexBtn.textContent = settings.pendingRegexRestore ? '還原正則' : '暫時關閉所有正則';
    }
}

function renderHotkeyInput() {
    const input = document.getElementById('ts_hotkey');
    if (input) input.value = getSettings().ui.hotkey || HOTKEY_DEFAULT;
}

// ===========================================================================
// 說明
// ===========================================================================

async function showHelp() {
    const ctx = getCtx();
    const html = `
        <h3>一鍵去正則保正文 · 使用說明</h3>
        <ol style="text-align:left;line-height:1.7">
            <li>按「掃描」：讀取當前聊天檔案的原始內容，列出所有偵測到的標籤。</li>
            <li>「標籤處理」頁決定每個標籤怎麼辦：
                <br>紅框＝<b>消除</b>（連裡面的內容一起刪）；綠框＝<b>白名單</b>（保留內容、只脫掉外殼）；都不勾＝<b>不理會</b>。</li>
            <li>「外殼」頁可以處理 &lt; &gt; 以外的外殼（{}、[]、《》等），也能指定某些字串出現就移除。</li>
            <li>「預覽」頁一條一條確認：按左右鍵翻頁，「顯示刪除內容」會把要刪的部分標紅，必要時可以直接「手動編輯內容」再保存。</li>
            <li>按「一鍵清除」→ 二次確認 → 自動備份 → 寫入聊天檔案。</li>
            <li>後悔了：按「回滾上次」，或到「設定」頁的備份區回滾任一備份點。</li>
        </ol>
        <p style="text-align:left">快捷鍵 <code>${escapeHtml(getSettings().ui.hotkey || HOTKEY_DEFAULT)}</code> 可以隨時開關這個面板（可在「設定」頁改）。</p>
        <p style="text-align:left">正文標籤不一定長得像正文，所以最穩的做法是先看預覽：紅色範圍不對，就把那個標籤勾成綠框，或直接手動編輯那一條。</p>
    `;
    await ctx.callGenericPopup(trHtml(html), ctx.POPUP_TYPE.TEXT, '', {
        wide: true,
        allowVerticalScrolling: true,
        okButton: localizeText('知道了', state.locale),
    });
}

async function undoLastBackup() {
    const settings = getSettings();
    const record = settings.backups.find(x => x.id === state.lastBackupId) ?? settings.backups[0];
    if (!record) {
        notify('info', '目前沒有可回滾的備份點。');
        return;
    }
    await restoreBackupById(record.id);
}

// ===========================================================================
// 快捷鍵
// ===========================================================================

function hotkeyFromEvent(event) {
    const key = event.key;
    if (!key || ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Dead'].includes(key)) return null;
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    let main = key.length === 1 ? key.toUpperCase() : key;
    if (main === ' ') main = 'Space';
    parts.push(main);
    return parts.join('+');
}

function parseHotkey(combo) {
    const parsed = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
    for (const rawPart of String(combo ?? '').split('+')) {
        const part = rawPart.trim().toLowerCase();
        if (!part) continue;
        if (part === 'ctrl' || part === 'control') parsed.ctrl = true;
        else if (part === 'alt' || part === 'option') parsed.alt = true;
        else if (part === 'shift') parsed.shift = true;
        else if (part === 'meta' || part === 'cmd' || part === 'win') parsed.meta = true;
        else parsed.key = part;
    }
    return parsed;
}

function hotkeyMatches(event, combo) {
    const parsed = parseHotkey(combo);
    if (!parsed.key) return false;
    if (!!event.ctrlKey !== parsed.ctrl) return false;
    if (!!event.altKey !== parsed.alt) return false;
    if (!!event.shiftKey !== parsed.shift) return false;
    if (!!event.metaKey !== parsed.meta) return false;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    const target = parsed.key === 'space' ? ' ' : parsed.key;
    return key === target;
}

function installHotkey() {
    document.addEventListener('keydown', event => {
        try {
            const settings = getSettings();
            if (!settings.ui.hotkeyEnabled) return;
            if (!hotkeyMatches(event, settings.ui.hotkey)) return;

            const target = event.target;
            const isRecording = target instanceof HTMLElement && target.id === 'ts_hotkey';
            if (isRecording) return;

            const parsed = parseHotkey(settings.ui.hotkey);
            const hasModifier = parsed.ctrl || parsed.alt || parsed.meta;
            const isTyping = target instanceof HTMLElement
                && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            // 在輸入框裡打字時，只有帶修飾鍵的組合鍵才攔截，避免誤觸
            if (isTyping && !hasModifier) return;

            event.preventDefault();
            event.stopPropagation();
            void togglePanel();
        } catch (err) {
            console.warn(LOG, '快捷鍵處理失敗', err);
        }
    }, true);
}

// ===========================================================================
// 擴展設定抽屜
// ===========================================================================

function buildSettingsDrawer() {
    const body = document.getElementById('tagsweeper_settings_body');
    if (!body) return;
    body.innerHTML = '';

    const note = document.createElement('div');
    note.className = 'ts-drawer-note';
    note.innerHTML = '把聊天檔案裡所有 <code>&lt;think&gt;</code>、<code>&lt;summary&gt;</code> 之類的標籤內容直接刪掉，'
        + '只留正文。有掃描預覽、白名單、二次確認與可回滾的備份點。';
    body.append(note);

    const status = document.createElement('div');
    status.className = 'ts-drawer-status';
    status.id = 'tagsweeper_drawer_status';
    body.append(status);

    const row1 = document.createElement('div');
    row1.className = 'ts-drawer-row';
    const openBtn = document.createElement('div');
    openBtn.className = 'menu_button';
    openBtn.innerHTML = '<i class="fa-solid fa-broom"></i> 開啟面板';
    openBtn.addEventListener('click', () => void openPanel());
    const scanBtn = document.createElement('div');
    scanBtn.className = 'menu_button';
    scanBtn.textContent = '一鍵清除…';
    scanBtn.title = '掃描 → 確認 → 備份 → 清除';
    scanBtn.addEventListener('click', () => void runApplyFlow());
    const undoBtn = document.createElement('div');
    undoBtn.className = 'menu_button';
    undoBtn.textContent = '回滾上次';
    undoBtn.addEventListener('click', () => void undoLastBackup());
    row1.append(openBtn, scanBtn, undoBtn);
    body.append(row1);

    const row2 = document.createElement('div');
    row2.className = 'ts-drawer-row';
    const backupBtn = document.createElement('div');
    backupBtn.className = 'menu_button';
    backupBtn.textContent = '建立備份點';
    backupBtn.addEventListener('click', () => {
        createBackupPoint('手動備份');
        refreshDrawerStatus();
        renderBackupList();
        notify('success', '已建立備份點。');
    });
    const regexBtn = document.createElement('div');
    regexBtn.className = 'menu_button';
    regexBtn.id = 'tagsweeper_drawer_regex';
    regexBtn.textContent = '暫停正則';
    regexBtn.addEventListener('click', async () => {
        const paused = await toggleRegexPause();
        notify('success', paused ? '已暫時停用所有正則（重新整理頁面也會自動還原）。' : '已還原所有正則。');
        refreshDrawerStatus();
    });
    row2.append(backupBtn, regexBtn);
    body.append(row2);

    const hint = document.createElement('div');
    hint.className = 'ts-drawer-note';
    hint.innerHTML = trHtml(`快捷鍵：<code>${escapeHtml(getSettings().ui.hotkey || HOTKEY_DEFAULT)}</code>（可在面板「設定」頁修改）`);
    body.append(hint);

    const backupTitle = document.createElement('div');
    backupTitle.className = 'ts-drawer-note';
    backupTitle.innerHTML = '<b>最近備份點</b>';
    body.append(backupTitle);

    const list = document.createElement('div');
    list.id = 'tagsweeper_drawer_backups';
    list.className = 'ts-list';
    body.append(list);

    refreshDrawerStatus();
    renderDrawerBackups();
}

function refreshDrawerStatus() {
    const node = document.getElementById('tagsweeper_drawer_status');
    if (!node) return;
    const ctx = getCtx();
    const label = chatDisplayLabel();
    const count = Array.isArray(ctx.chat) ? ctx.chat.length : 0;
    const { enabled, total } = countEnabledRegex();
    const pending = !!getSettings().pendingRegexRestore;
    node.innerHTML = trHtml(`聊天：<b>${escapeHtml(label.display)}</b>（${count} 條訊息）<br>`
        + `正則：${total > 0 ? `${enabled}/${total} 啟用中` : '沒有正則'}`
        + (pending ? ' · <b class="ts-red">目前為暫停狀態</b>' : ''));

    const regexBtn = document.getElementById('tagsweeper_drawer_regex');
    if (regexBtn) regexBtn.textContent = pending ? '還原正則' : '暫停正則';
}

function renderDrawerBackups() {
    const container = document.getElementById('tagsweeper_drawer_backups');
    if (!container) return;
    const settings = getSettings();
    container.innerHTML = '';
    if (settings.backups.length === 0) {
        container.innerHTML = localizeHtml('<div class="ts-drawer-note">（還沒有備份點）</div>', state.locale);
        return;
    }
    for (const record of settings.backups.slice(0, 5)) {
        const row = document.createElement('div');
        row.className = 'ts-listrow';
        const main = document.createElement('div');
        main.className = 'ts-listmain';
        main.innerHTML = trHtml(`<b>${escapeHtml(record.label)}</b> <span>· ${escapeHtml(formatTime(record.time))} · ${record.messageCount} 條</span>`);
        const rollback = document.createElement('div');
        rollback.className = 'menu_button ts-btn';
        rollback.textContent = '回滾';
        rollback.addEventListener('click', () => void restoreBackupById(record.id));
        row.append(main, rollback);
        container.append(row);
    }

    localizeTree(container, state.locale);
}

// ===========================================================================
// 魔法棒選單 / 斜線命令
// ===========================================================================

function buildWandMenu() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('tagsweeper_wand')) return false;

    const item = document.createElement('div');
    item.id = 'tagsweeper_wand';
    item.className = 'list-group-item flex-container flexGap5';
    item.tabIndex = 0;
    item.title = localizeText('掃描聊天檔案裡的 <> 標籤，一鍵清掉只留正文（含預覽、白名單、備份點）', state.locale);
    item.innerHTML = `<div class="fa-solid fa-broom extensionsMenuExtensionButton"></div><span>${escapeHtml(localizeText('一鍵去正則保正文', state.locale))}</span>`;
    item.addEventListener('click', () => void openPanel());
    menu.append(item);
    return true;
}

function ensureWandMenu(attempt = 0) {
    if (buildWandMenu()) return;
    if (attempt > 40) return;
    setTimeout(() => ensureWandMenu(attempt + 1), 500);
}

function registerSlashCommands() {
    try {
        const ctx = getCtx();
        const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx;
        if (!SlashCommandParser || !SlashCommand) {
            console.warn(`${LOG} 斜線命令 API 不可用，跳過註冊（面板功能不受影響）`);
            return;
        }

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'tagsweep',
            returns: '開啟或關閉面板',
            helpString: '開啟 / 關閉「一鍵去正則保正文」面板。',
            callback: async () => {
                await togglePanel();
                return state.open ? '面板已開啟。' : '面板已關閉。';
            },
        }));

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'tagsweep-scan',
            returns: '掃描摘要',
            helpString: '只掃描不改檔，回傳這個聊天裡偵測到的標籤統計。',
            callback: async () => {
                const plan = refreshPlan();
                if (plan.stats.length === 0) return localizeText('這個聊天檔案裡沒有偵測到任何 <> 標籤。', state.locale);
                const top = plan.stats.slice(0, 8)
                    .map(s => `${tagDisplayName(s.name)}×${s.count}(${getTagMode(s.name) === 'keep' ? localizeText('白名單', state.locale) : getTagMode(s.name) === 'ignore' ? localizeText('不理會', state.locale) : localizeText('消除', state.locale)})`)
                    .join('、');
                return localizeText(`掃描 ${plan.scanned} 條訊息，偵測到 ${plan.stats.length} 種標籤：${top}。`, state.locale)
                    + localizeText(`目前設定會改寫 ${plan.entries.length} 條訊息、刪除約 ${plan.removedChars} 字。`, state.locale);
            },
        }));

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'tagsweep-apply',
            returns: '執行結果',
            helpString: '直接走一次完整清除流程（會跳確認視窗）。',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'quiet',
                    description: 'true = 跳過確認直接寫入（仍然會自動備份）',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    defaultValue: 'false',
                }),
            ],
            callback: async (args) => {
                const quiet = String(args?.quiet ?? 'false').toLowerCase() === 'true';
                await runApplyFlow({ skipConfirm: quiet });
                return '已執行清除流程。';
            },
        }));

        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'tagsweep-undo',
            returns: '執行結果',
            helpString: '回滾到上一個備份點。',
            callback: async () => {
                await undoLastBackup();
                return '已執行回滾。';
            },
        }));
    } catch (err) {
        console.warn(`${LOG} 註冊斜線命令失敗（不影響面板使用）`, err);
    }
}

// ===========================================================================
// 初始化
// ===========================================================================

globalThis.TagSweeperDebug = {
    MODULE_NAME,
    VERSION: TAG_SWEEPER_VERSION,
    settings: getSettings,
    buildPlan,
    refreshPlan,
    applyPlan,
    buildConfirmHtml,
    analyzeText,
    runApplyFlow,
    pauseRegex,
    restoreRegex,
    pruneBackups,
    createBackupPoint,
    countEnabledRegex,
    getTagMode,
    setTagMode,
    isTagHidden,
    setTagHidden,
    renderSummary,
    renderTagList,
    renderPreview,
    renderShells,
    beginEdit,
    cancelEdit,
    commitEdit,
    textToEditableHtml,
    editableToText,
    renderWhitelist,
    renderBackupList,
    parseBackupText,
    toJsonl,
    applyLocale,
    setLocale,
    state,
};

jQuery(async () => {
    try {
        getSettings();

        const ctx = getCtx();
        try {
            const html = await ctx.renderExtensionTemplateAsync(TEMPLATE_PATH, 'settings', {}, true, false);
            jQuery('#extensions_settings').append(html);
        } catch (err) {
            console.warn(LOG, '載入設定面板模板失敗', err);
        }

        buildSettingsDrawer();
        ensureWandMenu();
        registerSlashCommands();
        installHotkey();

        // 上次沒還原乾淨的正則，開場就先補還原
        if (getSettings().pendingRegexRestore) {
            console.log(LOG, '偵測到上次未還原的正則暫停，正在自動還原…');
            await restoreRegex(null, { silent: true });
        }

        try {
            ctx.eventSource?.on(ctx.eventTypes?.CHAT_CHANGED, () => {
                state.plan = null;
                refreshDrawerStatus();
                renderDrawerBackups();
                if (state.open) {
                    refreshPlan();
                    renderBackupList();
                    setRegexChip();
                }
            });
        } catch (err) {
            console.warn(LOG, '監聽 CHAT_CHANGED 失敗', err);
        }

        console.log(`${LOG} 已載入 v${TAG_SWEEPER_VERSION}`);
    } catch (err) {
        console.error(`${LOG} 初始化失敗`, err);
    }
});
