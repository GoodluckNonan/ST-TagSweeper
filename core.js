/**
 * ST-TagSweeper / core.js
 * ---------------------------------------------------------------------------
 * 純邏輯層：標籤掃描 → 開閉配對 → 計算刪除區間 → 產生清理後文本。
 *
 * 這個檔案「不依賴 SillyTavern、不碰 DOM、不使用 jQuery」，
 * 因此可以直接被 Node 匯入跑單元測試（見 tests/core.test.mjs）。
 *
 * 支援的標記：
 *   <tag> ... </tag>       一般成對標籤（允許屬性、允許中文標籤名，例如 <正文>）
 *   <tag/>                 自閉合標籤（預設原樣保留）
 *   <!-- ... -->           HTML 註解（視為一個完整的「標籤」）
 *   落單的 </tag>          孤兒閉合標籤 → 連同「它前面的那一段內容」一起刪掉
 *   落單的 <tag>           孤兒開啟標籤 → 連同「它後面的那一段內容」一起刪掉
 *
 * 白名單（whitelist）語意：
 *   命中的標籤名 → 只刪掉「標籤符號本身」，標籤裡的正文原樣保留。
 *   例：白名單含 plot 時，<plot>正文</plot> → 正文
 *   註解的白名單鍵名是 "!--"（白名單它＝所有 <!-- --> 都只脫殼、保留內容）。
 */

export const TAG_SWEEPER_VERSION = '1.2.0';

/** 模組層級的 sticky 正則：每次使用前都會重設 lastIndex，JS 單執行緒下安全。 */
const TAG_HEAD_RE = /<(\/?)([^\s<>/]+)((?:"[^"]*"|'[^']*'|[^<>"'])*?)(\/?)>/y;

/** HTML 的空元素（void element）：天生沒有閉合標籤，不該被當成「孤兒開啟標籤」處理。 */
export const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype',
]);

/**
 * 預設的「正文標籤」白名單。
 * 這些標籤裡的內容會被保留，只脫掉外殼。
 */
export const DEFAULT_BODY_TAGS = ['plot', 'content', '正文'];

/** 註解用的虛擬標籤名 */
export const COMMENT_TAG = '!--';

/** 孤兒閉合標籤的處理方式 */
export const ORPHAN_CLOSE_MODES = ['block', 'tag', 'off'];
/** 孤兒閉合標籤「從哪裡開始砍」的判斷方式 */
export const ORPHAN_ANCHOR_MODES = ['complete', 'message', 'token'];
/** 孤兒開啟標籤的處理方式 */
export const ORPHAN_OPEN_MODES = ['next', 'end', 'tag', 'off'];

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/**
 * 把使用者輸入的標籤名正規化：允許輸入 `<plot>`、`</plot>`、`plot`、` plot `
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTagName(value) {
    let name = String(value ?? '').trim();
    // 去掉可能一起被貼進來的角括號與斜線
    name = name.replace(/^<\s*\/?\s*/, '').replace(/\s*\/?>$/, '').trim();
    return name;
}

/**
 * 把外部（設定檔）來的選項補齊成完整、可信任的選項物件。
 * @param {object} [raw]
 * @returns {object}
 */
export function normalizeOptions(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};

    const rawList = Array.isArray(source.whitelist) ? source.whitelist : DEFAULT_BODY_TAGS;
    const whitelist = [];
    const seen = new Set();
    for (const item of rawList) {
        const name = normalizeTagName(item);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        whitelist.push(name);
    }

    const rawIgnore = Array.isArray(source.ignore) ? source.ignore : [];
    const ignoreList = [];
    const ignoreSeen = new Set();
    for (const item of rawIgnore) {
        const name = normalizeTagName(item);
        if (!name) continue;
        const key = name.toLowerCase();
        if (ignoreSeen.has(key)) continue;
        ignoreSeen.add(key);
        ignoreList.push(name);
    }

    return {
        /** 原樣保留內容的標籤名（只脫殼） */
        whitelist,
        /** 小寫查表用 */
        whitelistSet: seen,
        /** 完全不理會的標籤名（原樣留在訊息裡） */
        ignore: ignoreList,
        /** 小寫查表用 */
        ignoreSet: ignoreSeen,
        /** 跳過 ``` 圍欄程式碼區塊裡的標籤 */
        skipCodeBlocks: source.skipCodeBlocks !== false,
        /** 跳過行內 `code` 裡的標籤 */
        skipInlineCode: source.skipInlineCode === true,
        /** 孤兒閉合標籤：block=連前面的內容一起刪 / tag=只刪標籤 / off=完全不動 */
        orphanCloseMode: ORPHAN_CLOSE_MODES.includes(source.orphanCloseMode) ? source.orphanCloseMode : 'block',
        /** 孤兒閉合標籤要從哪裡開始砍：complete=上一個「已完整收尾」的標籤 / message=訊息開頭 / token=上一個標籤 */
        orphanAnchorMode: ORPHAN_ANCHOR_MODES.includes(source.orphanAnchorMode) ? source.orphanAnchorMode : 'complete',
        /** 孤兒開啟標籤：next=刪到下一個標籤前 / end=刪到訊息結尾 / tag=只刪標籤 / off=完全不動 */
        orphanOpenMode: ORPHAN_OPEN_MODES.includes(source.orphanOpenMode) ? source.orphanOpenMode : 'next',
        /** 刪除後整理空行（不會產生連續多個空行、去掉頭尾空白） */
        tidy: source.tidy !== false,
        /** 白名單內容保護：外面的大標籤整段被刪時，仍然把白名單裡的正文挖出來保留 */
        protectWhitelistContent: source.protectWhitelistContent !== false,
        /** 保留自閉合標籤（<br/> 之類） */
        keepSelfClosing: source.keepSelfClosing !== false,
        /** 白名單脫殼時，順手吃掉標籤內側緊貼的空白（不吃換行，避免動到縮排） */
        trimMarkerPadding: source.trimMarkerPadding !== false,
    };
}

/**
 * 把區間清單合併成互不重疊、由小到大的區間清單。
 * @param {{start:number,end:number}[]} intervals
 * @returns {{start:number,end:number}[]}
 */
export function mergeIntervals(intervals) {
    const valid = (intervals || [])
        .filter(x => x && Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
        .map(x => ({ start: x.start, end: x.end }))
        .sort((a, b) => a.start - b.start || a.end - b.end);

    const merged = [];
    for (const range of valid) {
        const last = merged[merged.length - 1];
        if (last && range.start <= last.end) {
            if (range.end > last.end) last.end = range.end;
        } else {
            merged.push({ start: range.start, end: range.end });
        }
    }
    return merged;
}

/**
 * 依區間清單把文字切掉（start 含、end 不含）。
 * @param {string} text
 * @param {{start:number,end:number}[]} intervals
 * @returns {string}
 */
export function applyIntervals(text, intervals) {
    const merged = mergeIntervals(intervals);
    if (merged.length === 0) return text;
    let out = '';
    let cursor = 0;
    for (const range of merged) {
        const start = Math.max(cursor, Math.min(range.start, text.length));
        const end = Math.max(start, Math.min(range.end, text.length));
        out += text.slice(cursor, start);
        cursor = end;
    }
    out += text.slice(cursor);
    return out;
}

/**
 * 刪除後的空行整理。只有在真的刪過東西時才會呼叫。
 * @param {string} text
 * @returns {string}
 */
export function tidyText(text) {
    let out = String(text ?? '');
    out = out.replace(/^[ \t]+$/gm, '');   // 只剩空白的分行 → 清空（不動 markdown 的「行尾兩空白」換行）
    out = out.replace(/\n{3,}/g, '\n\n');  // 最多留一個空行
    out = out.replace(/^[\s\uFEFF\xA0]+/, '').replace(/[\s\uFEFF\xA0]+$/, '');
    return out;
}

/** 折疊空白，用於產生單行摘要 */
export function collapseWhitespace(text, limit = 0) {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!limit || flat.length <= limit) return flat;
    return `${flat.slice(0, Math.max(0, limit - 1))}…`;
}

// ---------------------------------------------------------------------------
// 程式碼區塊保護
// ---------------------------------------------------------------------------

/**
 * 找出應該被保護（不處理標籤）的區間：``` 圍欄區塊、以及可選的行內 `code`。
 * @param {string} text
 * @param {{skipCodeBlocks?:boolean, skipInlineCode?:boolean}} [options]
 * @returns {{start:number,end:number}[]}
 */
export function findProtectedRanges(text, options = {}) {
    const source = String(text ?? '');
    const ranges = [];

    if (options.skipCodeBlocks !== false) {
        const fenceRe = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*$/gm;
        let open = null;
        let match;
        while ((match = fenceRe.exec(source)) !== null) {
            const marker = match[1];
            if (!open) {
                open = { start: match.index, char: marker[0], len: marker.length };
                continue;
            }
            if (marker[0] === open.char && marker.length >= open.len) {
                ranges.push({ start: open.start, end: match.index + match[0].length });
                open = null;
            }
        }
        if (open) ranges.push({ start: open.start, end: source.length });
    }

    if (options.skipInlineCode === true) {
        const inlineRe = /`[^`\n]*`/g;
        let match;
        while ((match = inlineRe.exec(source)) !== null) {
            ranges.push({ start: match.index, end: match.index + match[0].length });
        }
    }

    return mergeIntervals(ranges);
}

/**
 * @param {number} index
 * @param {{start:number,end:number}[]} ranges
 * @returns {boolean}
 */
function isProtected(index, ranges) {
    for (const range of ranges) {
        if (index >= range.start && index < range.end) return true;
        if (range.start > index) break;
    }
    return false;
}

// ---------------------------------------------------------------------------
// 詞法分析：把文字切成「文字段 + 標籤 token」
// ---------------------------------------------------------------------------

/**
 * @typedef {object} TagToken
 * @property {'open'|'close'|'comment'|'stray-comment-close'} type
 * @property {string} name 標籤名（註解為 "!--"）
 * @property {number} start 標籤起點（含 `<`）
 * @property {number} end 標籤終點（不含）
 * @property {string} raw 標籤原文
 * @property {boolean} [selfClosing] 是否自閉合 `<tag/>`
 * @property {boolean} [complete] 註解是否有收尾 `-->`
 */

/**
 * 掃出所有標籤 token（不做配對）。
 * @param {string} text
 * @param {{skipCodeBlocks?:boolean, skipInlineCode?:boolean}} [options]
 * @returns {TagToken[]}
 */
export function tokenizeTags(text, options = {}) {
    const source = String(text ?? '');
    const len = source.length;
    const protectedRanges = findProtectedRanges(source, options);
    /** @type {TagToken[]} */
    const tokens = [];
    let i = 0;

    while (i < len) {
        const lt = source.indexOf('<', i);
        if (lt < 0) break;

        if (isProtected(lt, protectedRanges)) {
            // 跳過整個受保護區間，避免在程式碼裡誤判標籤
            const range = protectedRanges.find(r => lt >= r.start && lt < r.end);
            i = range ? range.end : lt + 1;
            continue;
        }

        // HTML 註解：整段 <!-- ... --> 視為一個 token
        if (source.startsWith('<!--', lt)) {
            const close = source.indexOf('-->', lt + 4);
            const complete = close >= 0;
            const end = complete ? close + 3 : len;
            tokens.push({
                type: 'comment',
                name: COMMENT_TAG,
                start: lt,
                end,
                raw: source.slice(lt, end),
                complete,
                selfClosing: false,
            });
            i = end;
            continue;
        }

        // 落單的註解收尾
        if (source.startsWith('-->', lt)) {
            tokens.push({
                type: 'stray-comment-close',
                name: COMMENT_TAG,
                start: lt,
                end: lt + 3,
                raw: '-->',
                selfClosing: false,
            });
            i = lt + 3;
            continue;
        }

        TAG_HEAD_RE.lastIndex = lt;
        const match = TAG_HEAD_RE.exec(source);
        if (!match || match.index !== lt) {
            i = lt + 1;
            continue;
        }

        const name = match[2];
        const selfClosing = match[4] === '/';
        tokens.push({
            type: match[1] === '/' ? 'close' : 'open',
            name,
            start: lt,
            end: lt + match[0].length,
            raw: match[0],
            selfClosing,
        });
        i = lt + match[0].length;
    }

    return tokens;
}

// ---------------------------------------------------------------------------
// 語法分析：配對開 / 閉標籤
// ---------------------------------------------------------------------------

/**
 * @typedef {TagToken & {
 *   paired: boolean,
 *   orphan: boolean,
 *   closeOnly: boolean,
 *   selfClosingOnly: boolean,
 *   closeIndex: number,
 *   openIndex: number,
 * }} TagNode
 */

/**
 * 用堆疊把開 / 閉標籤配對起來（容忍不對稱的破損輸出）。
 * @param {TagToken[]} tokens
 * @returns {TagNode[]}
 */
export function pairTags(tokens) {
    /** @type {TagNode[]} */
    const nodes = (tokens || []).map(token => ({
        ...token,
        paired: false,
        orphan: false,
        closeOnly: false,
        selfClosingOnly: false,
        closeIndex: -1,
        openIndex: -1,
    }));

    /** @type {number[]} 堆疊裡放的是 nodes 的索引 */
    const stack = [];

    for (let idx = 0; idx < nodes.length; idx++) {
        const node = nodes[idx];

        if (node.type === 'comment') {
            node.paired = !!node.complete;
            node.orphan = !node.complete;
            node.closeOnly = false;
            continue;
        }

        if (node.type === 'stray-comment-close') {
            node.orphan = true;
            node.closeOnly = true;
            continue;
        }

        if (node.type === 'open') {
            if (node.selfClosing || VOID_TAGS.has(node.name.toLowerCase())) {
                node.selfClosingOnly = true;
                continue;
            }
            stack.push(idx);
            continue;
        }

        // type === 'close'
        let found = -1;
        for (let k = stack.length - 1; k >= 0; k--) {
            if (nodes[stack[k]].name.toLowerCase() === node.name.toLowerCase()) {
                found = k;
                break;
            }
        }

        if (found === -1) {
            node.orphan = true;
            node.closeOnly = true;
            continue;
        }

        const openIdx = stack[found];

        // 被夾在中間、永遠等不到閉合的同層標籤 → 標記為孤兒後丟棄
        for (let k = stack.length - 1; k > found; k--) {
            nodes[stack[k]].orphan = true;
        }
        stack.length = found; // 這一行同時把 openIdx 本身移除

        nodes[openIdx].paired = true;
        nodes[openIdx].closeIndex = idx;
        node.openIndex = openIdx;
    }

    for (const openIdx of stack) {
        nodes[openIdx].orphan = true;
    }

    return nodes;
}

// ---------------------------------------------------------------------------
// 計算刪除區間
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Removal
 * @property {number} start
 * @property {number} end
 * @property {string} tag 標籤名
 * @property {'full'|'marker'|'block'|'tag'} mode
 * @property {'pair'|'comment'|'marker'|'orphan-close'|'orphan-open'|'tag'} kind
 * @property {'normal'|'high'} risk
 * @property {string} reason 人類可讀的原因
 */

/**
 * 把 base 區間減掉 protect 區間（回傳剩下的碎片）。
 * @param {{start:number,end:number}[]} base
 * @param {{start:number,end:number}[]} protect
 * @returns {{start:number,end:number}[]}
 */
export function subtractIntervals(base, protect) {
    const holes = mergeIntervals(protect);
    let pieces = mergeIntervals(base).map(range => ({ start: range.start, end: range.end }));

    for (const hole of holes) {
        const next = [];
        for (const piece of pieces) {
            if (hole.end <= piece.start || hole.start >= piece.end) {
                next.push(piece);
                continue;
            }
            if (hole.start > piece.start) next.push({ start: piece.start, end: hole.start });
            if (hole.end < piece.end) next.push({ start: hole.end, end: piece.end });
        }
        pieces = next;
    }

    return mergeIntervals(pieces);
}

/**
 * 把「白名單標籤的內容」蒐集起來當成保護區。
 *
 * 白名單的語意是「這是正文，內容要留下」——那麼連外面那層垃圾標籤也不該把它吃掉。
 * 保護區只涵蓋標籤之間的內容，不含標籤符號本身（那還是要脫掉）。
 *
 * @param {TagNode[]} nodes
 * @param {ReturnType<typeof normalizeOptions>} [options]
 * @returns {{start:number,end:number}[]}
 */
export function collectProtectedRanges(nodes, options) {
    const opts = options && options.whitelistSet ? options : normalizeOptions(options);
    const ranges = [];

    for (const node of nodes) {
        if (!node.paired) continue;
        if (!opts.whitelistSet.has(String(node.name).toLowerCase())) continue;

        if (node.type === 'comment') {
            if (node.end - 3 > node.start + 4) ranges.push({ start: node.start + 4, end: node.end - 3 });
            continue;
        }
        const closeNode = nodes[node.closeIndex];
        if (!closeNode) continue;
        if (closeNode.start > node.end) ranges.push({ start: node.end, end: closeNode.start });
    }

    return mergeIntervals(ranges);
}

/**
 * 把「整段吃掉」的刪除區間，用保護區挖洞。
 * 只挖 mode 為 full / block 的大範圍；純標籤的 marker / tag 小範圍不需要挖。
 *
 * @param {Removal[]} removals
 * @param {{start:number,end:number}[]} protectedRanges
 * @returns {Removal[]}
 */
export function carveProtected(removals, protectedRanges) {
    if (!protectedRanges || protectedRanges.length === 0) return removals;
    const out = [];

    for (const removal of removals) {
        if (removal.mode !== 'full' && removal.mode !== 'block') {
            out.push(removal);
            continue;
        }
        const inside = protectedRanges.filter(p => p.start >= removal.start && p.end <= removal.end
            && (p.start > removal.start || p.end < removal.end));
        if (inside.length === 0) {
            out.push(removal);
            continue;
        }
        for (const piece of subtractIntervals([{ start: removal.start, end: removal.end }], inside)) {
            out.push({ ...removal, start: piece.start, end: piece.end, reason: `${removal.reason}（白名單內容已保留）` });
        }
    }

    return out;
}

/**
 * 這個 token 是不是「已經完整收尾的建構」？
 *
 * 只有這種 token 能拿來當孤兒閉合標籤的刪除邊界。理由：
 *   成對標籤的收尾、完整的註解、自閉合／void 標籤 → 它們自成一塊，後面的文字一定不屬於它們；
 *   而落單的開頭標籤（例如推理中間冒出的 `<Admin>`）本身就是破損殘骸，
 *   若拿它當邊界，會把該刪的內容切成兩半、留下前半段（這正是實測踩到的 bug）。
 *
 * @param {TagNode} node
 * @returns {boolean}
 */
export function isCompleteConstruct(node) {
    if (!node) return false;
    if (node.selfClosingOnly) return true;                                  // <br/>、<hr> 之類
    if (node.type === 'comment') return !!node.complete;                    // <!-- … -->
    if (node.type === 'close' && node.openIndex >= 0) return true;          // 成對標籤的 </x>
    return false;
}

/**
 * 算出孤兒閉合標籤的刪除起點。
 * @param {TagNode[]} nodes
 * @param {number} index 孤兒閉合標籤在 nodes 裡的位置
 * @param {ReturnType<typeof normalizeOptions>} [options]
 * @returns {number}
 */
export function findOrphanCloseStart(nodes, index, options) {
    const mode = options?.orphanAnchorMode ?? 'complete';

    if (mode === 'message') return 0;

    if (mode === 'token') {
        const prev = index > 0 ? nodes[index - 1] : null;
        return prev ? prev.end : 0;
    }

    // complete：往回找最近一個真的收乾淨了的標籤，中間的破損殘骸一律一起吸收
    for (let k = index - 1; k >= 0; k--) {
        if (isCompleteConstruct(nodes[k])) return nodes[k].end;
    }
    return 0;
}

/**
 * 偵測「孤兒閉合標籤前面還有沒清掉的內容」。
 *
 * 破損輸出千奇百怪，演算法再聰明也可能只清掉一半。與其默默放過，
 * 不如把「前面還留著 N 個字」明確回報出來，讓使用者在預覽裡一眼看到、換個判斷方式。
 *
 * @param {string} text
 * @param {Removal[]} removals 最終的刪除區間（可能已被白名單保護挖過洞）
 * @param {{start:number,end:number}[]} blockers 用來判斷「這段其實是正文」的額外保留區（白名單內容）
 * @param {ReturnType<typeof normalizeOptions>} [options]
 * @returns {{tag:string, chars:number, at:number}|null}
 */
export function detectOrphanResidue(text, removals, blockers = [], options) {
    const opts = options && options.whitelistSet ? options : normalizeOptions(options);
    if (opts.orphanCloseMode !== 'block') return null;

    const cleared = mergeIntervals([...removals, ...blockers]);
    const checked = new Set();

    for (const removal of removals) {
        if (removal.kind !== 'orphan-close') continue;

        const anchor = Number.isFinite(removal.anchorStart) ? removal.anchorStart : removal.start;
        const dedupeKey = `${removal.tag}@${anchor}`;
        if (checked.has(dedupeKey)) continue;
        checked.add(dedupeKey);

        if (anchor <= 0) continue;

        const head = text.slice(0, anchor);
        if (!head.trim()) continue;

        const headCleared = cleared
            .filter(range => range.start < anchor)
            .map(range => ({ start: range.start, end: Math.min(range.end, anchor) }));
        const leftover = applyIntervals(head, headCleared).trim();

        if (leftover.length > 0) {
            return { tag: removal.tag, chars: leftover.length, at: anchor };
        }
    }
    return null;
}

/**
 * 依照配對結果與白名單，算出所有要刪掉的區間（原始座標）。
 * @param {string} text
 * @param {TagNode[]} nodes
 * @param {ReturnType<typeof normalizeOptions>} options
 * @returns {Removal[]}
 */
export function computeRemovals(text, nodes, options) {
    const opts = options && options.whitelistSet ? options : normalizeOptions(options);
    const source = String(text ?? '');
    /** @type {Removal[]} */
    const removals = [];

    const isWhitelisted = name => opts.whitelistSet.has(String(name).toLowerCase());

    /** 往後吃掉緊貼的空白（不含換行） */
    const padEnd = (pos) => {
        let i = pos;
        while (i < source.length && (source[i] === ' ' || source[i] === '\t')) i++;
        return i;
    };
    /** 往前吃掉緊貼的空白（不含換行） */
    const padStart = (pos) => {
        let i = pos;
        while (i > 0 && (source[i - 1] === ' ' || source[i - 1] === '\t')) i--;
        return i;
    };
    const openMarker = (node, reason) => ({
        start: node.start,
        end: opts.trimMarkerPadding ? padEnd(node.end) : node.end,
        tag: node.name,
        mode: 'marker',
        kind: 'marker',
        risk: 'normal',
        reason,
    });
    const closeMarker = (node, reason) => ({
        start: opts.trimMarkerPadding ? padStart(node.start) : node.start,
        end: node.end,
        tag: node.name,
        mode: 'marker',
        kind: 'marker',
        risk: 'normal',
        reason,
    });

    for (let idx = 0; idx < nodes.length; idx++) {
        const node = nodes[idx];

        // 列在「不理會」清單裡的標籤：原樣留在訊息中，連外殼都不動
        if (opts.ignoreSet && opts.ignoreSet.has(String(node.name).toLowerCase())) continue;

        if (node.selfClosingOnly) {
            if (node.type === 'open' && !opts.keepSelfClosing) {
                removals.push({ start: node.start, end: node.end, tag: node.name, mode: 'tag', kind: 'tag', risk: 'normal', reason: '自閉合標籤' });
            }
            continue;
        }

        if (node.paired) {
            if (node.type === 'comment') {
                if (isWhitelisted(COMMENT_TAG)) {
                    removals.push(openMarker({ ...node, end: node.start + 4 }, '白名單：只脫註解外殼'));
                    removals.push(closeMarker({ ...node, start: node.end - 3 }, '白名單：只脫註解外殼'));
                } else {
                    removals.push({ start: node.start, end: node.end, tag: COMMENT_TAG, mode: 'full', kind: 'comment', risk: 'normal', reason: '刪除註解' });
                }
                continue;
            }

            const closeNode = nodes[node.closeIndex];
            if (!closeNode) continue;

            if (isWhitelisted(node.name)) {
                removals.push(openMarker(node, '白名單：保留內容，只脫殼'));
                removals.push(closeMarker(closeNode, '白名單：保留內容，只脫殼'));
            } else {
                removals.push({ start: node.start, end: closeNode.end, tag: node.name, mode: 'full', kind: 'pair', risk: 'normal', reason: '刪除成對標籤（含內容）' });
            }
            continue;
        }

        if (!node.orphan) continue;

        if (node.closeOnly) {
            if (opts.orphanCloseMode === 'off') continue;
            if (opts.orphanCloseMode === 'tag') {
                removals.push({ start: node.start, end: node.end, tag: node.name, mode: 'tag', kind: 'orphan-close', risk: 'normal', reason: '孤兒閉合標籤：只刪標籤' });
                continue;
            }
            const from = findOrphanCloseStart(nodes, idx, opts);
            removals.push({
                start: from,
                end: node.end,
                tag: node.name,
                mode: 'block',
                kind: 'orphan-close',
                anchorStart: from,
                risk: 'high',
                reason: '孤兒閉合標籤：連同它前面的內容一起刪',
            });
            continue;
        }

        // 孤兒開啟標籤
        if (opts.orphanOpenMode === 'off') continue;
        if (opts.orphanOpenMode === 'tag') {
            removals.push({ start: node.start, end: node.end, tag: node.name, mode: 'tag', kind: 'orphan-open', risk: 'normal', reason: '孤兒開啟標籤：只刪標籤' });
            continue;
        }
        const next = idx + 1 < nodes.length ? nodes[idx + 1] : null;
        const to = opts.orphanOpenMode === 'end' || !next ? source.length : next.start;
        removals.push({
            start: node.start,
            end: to,
            tag: node.name,
            mode: 'block',
            kind: 'orphan-open',
            risk: 'high',
            reason: opts.orphanOpenMode === 'end'
                ? '孤兒開啟標籤：刪到訊息結尾'
                : '孤兒開啟標籤：刪到下一個標籤之前',
        });
    }

    return removals.filter(r => r.end > r.start);
}

// ---------------------------------------------------------------------------
// 標籤統計（給「標籤處理」面板用）
// ---------------------------------------------------------------------------

/**
 * @typedef {object} TagStat
 * @property {string} name 標籤名（原樣）
 * @property {string} key 小寫鍵值
 * @property {number} count 出現次數
 * @property {number} paired 成對次數
 * @property {number} orphanOpen 孤兒開啟次數
 * @property {number} orphanClose 孤兒閉合次數
 * @property {number} selfClosing 自閉合次數
 * @property {boolean} isComment 是否為 HTML 註解
 * @property {boolean} whitelisted 是否在白名單
 * @property {string} sample 樣本（<tag>…</tag>）
 * @property {number} removedChars 這個標籤造成的刪除字數（未合併，可能重疊）
 */

/**
 * 統計每個標籤的出現狀況，並產生面板要顯示的樣本字串。
 * @param {string} text
 * @param {TagNode[]} nodes
 * @param {Removal[]} removals
 * @param {ReturnType<typeof normalizeOptions>} options
 * @returns {TagStat[]}
 */
export function buildTagStats(text, nodes, removals, options) {
    const opts = options && options.whitelistSet ? options : normalizeOptions(options);
    const source = String(text ?? '');
    /** @type {Map<string, TagStat>} */
    const map = new Map();

    const ensure = (name) => {
        const key = String(name).toLowerCase();
        let stat = map.get(key);
        if (!stat) {
            stat = {
                name: name === COMMENT_TAG ? COMMENT_TAG : String(name),
                key,
                count: 0,
                paired: 0,
                orphanOpen: 0,
                orphanClose: 0,
                selfClosing: 0,
                isComment: key === COMMENT_TAG.toLowerCase(),
                whitelisted: opts.whitelistSet.has(key),
                ignored: !!opts.ignoreSet?.has(key),
                sample: '',
                removedChars: 0,
            };
            map.set(key, stat);
        }
        return stat;
    };

    for (const node of nodes) {
        // 成對標籤的閉合端不再重複計數（只算「開端」一次）
        if (node.type === 'close' && node.openIndex >= 0) continue;

        const stat = ensure(node.name);
        stat.count++;
        if (node.selfClosingOnly) stat.selfClosing++;
        else if (node.paired) stat.paired++;
        else if (node.closeOnly) stat.orphanClose++;
        else stat.orphanOpen++;

        if (!stat.sample) {
            stat.sample = buildSample(source, node, nodes);
        }
    }

    for (const removal of removals) {
        const stat = map.get(String(removal.tag).toLowerCase());
        if (stat) stat.removedChars += Math.max(0, removal.end - removal.start);
    }

    return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * 產生像 `<think>…內容…</think>` 的樣本字串。
 * @param {string} text
 * @param {TagNode} node
 * @param {TagNode[]} nodes
 * @returns {string}
 */
export function buildSample(text, node, nodes) {
    if (node.type === 'comment') {
        return collapseWhitespace(node.raw, 90);
    }
    if (node.selfClosingOnly) {
        return collapseWhitespace(node.raw, 90);
    }
    if (node.paired) {
        const closeNode = nodes[node.closeIndex];
        const inner = closeNode ? text.slice(node.end, closeNode.start) : '';
        return `${node.raw}${collapseWhitespace(inner, 60)}${closeNode ? closeNode.raw : ''}`;
    }
    return collapseWhitespace(node.raw, 90);
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * @typedef {object} MessageAnalysis
 * @property {ReturnType<typeof normalizeOptions>} options
 * @property {TagToken[]} tokens
 * @property {TagNode[]} nodes
 * @property {Removal[]} removals
 * @property {{start:number,end:number}[]} merged 合併後的刪除區間
 * @property {string} before
 * @property {string} after
 * @property {boolean} changed
 * @property {number} removedChars
 * @property {'normal'|'high'} risk
 * @property {{tag:string,chars:number,at:number}|null} residue 孤兒標籤前面疑似沒清乾淨的殘留
 * @property {TagStat[]} stats
 */

/**
 * 分析單一訊息文字，回傳「刪哪些、刪完長怎樣」的完整結果。
 * @param {string} text
 * @param {object} [rawOptions]
 * @returns {MessageAnalysis}
 */
export function analyzeText(text, rawOptions = {}) {
    const before = String(text ?? '');
    const options = normalizeOptions(rawOptions);
    const tokens = tokenizeTags(before, options);
    const nodes = pairTags(tokens);
    let removals = computeRemovals(before, nodes, options);

    // 白名單保護：把正文從「整段吃掉」的刪除範圍裡挖出來
    let protectedRanges = [];
    if (options.protectWhitelistContent) {
        protectedRanges = collectProtectedRanges(nodes, options);
        if (protectedRanges.length > 0) removals = carveProtected(removals, protectedRanges);
    }

    const merged = mergeIntervals(removals);

    let after = before;
    if (merged.length > 0) {
        after = applyIntervals(before, merged);
        if (options.tidy) after = tidyText(after);
    }

    let removedChars = 0;
    for (const range of merged) removedChars += range.end - range.start;
    if (options.tidy) removedChars = Math.max(removedChars, 0);

    const changed = after !== before;
    const hadContent = before.trim().length > 0;
    const lostContent = hadContent && after.trim().length === 0;
    const shrinkRatio = before.length > 0 ? (before.length - after.length) / before.length : 0;
    const riskyRemoval = removals.some(r => r.risk === 'high');
    const residue = detectOrphanResidue(before, removals, protectedRanges, options);
    const risk = (lostContent || riskyRemoval || residue || (shrinkRatio >= 0.75 && before.length >= 200)) ? 'high' : 'normal';

    return {
        options,
        tokens,
        nodes,
        removals,
        merged,
        before,
        after,
        changed,
        removedChars,
        risk,
        residue,
        stats: buildTagStats(before, nodes, removals, options),
    };
}

/**
 * 只取結果（方便測試與外部呼叫）。
 * @param {string} text
 * @param {object} [options]
 * @returns {string}
 */
export function sweepText(text, options = {}) {
    return analyzeText(text, options).after;
}

/**
 * 把多條訊息的統計合併成一份標籤總表（面板「標籤處理」頁用）。
 * @param {MessageAnalysis[]} analyses
 * @returns {TagStat[]}
 */
export function mergeTagStats(analyses) {
    /** @type {Map<string, TagStat>} */
    const map = new Map();
    for (const analysis of analyses || []) {
        for (const stat of analysis?.stats || []) {
            let target = map.get(stat.key);
            if (!target) {
                target = { ...stat };
                map.set(stat.key, target);
                continue;
            }
            target.count += stat.count;
            target.paired += stat.paired;
            target.orphanOpen += stat.orphanOpen;
            target.orphanClose += stat.orphanClose;
            target.selfClosing += stat.selfClosing;
            target.removedChars += stat.removedChars;
            target.whitelisted = stat.whitelisted;
            if (!target.sample && stat.sample) target.sample = stat.sample;
        }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
