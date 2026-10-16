/**
 * search.js - Hỗ trợ tìm kiếm phía client
 * Phụ trách: Người 4
 *
 * Các hàm ở đây được dùng lại bởi hero.js, build.js, item.js, compare.js, favorite.js:
 *   getQueryParam() - đọc tham số URL (vd heroes.html?keyword=valhein)
 *   matchKeyword()  - so khớp không phân biệt hoa/thường và không phân biệt dấu tiếng Việt
 *   debounce()      - trì hoãn xử lý khi gõ liên tục
 *
 * Bộ lọc từ cấm KD07 (danh sách truyền qua tham số, không đọc LocalStorage):
 *   Hằng mức độ: MOD_LEVEL_REVIEW/BLOCK/SEVERE, MOD_LEVEL_LABELS
 *   Entry = chuỗi (coi là mức 2) hoặc { word, level: 1|2|3 }
 *   normalizeForFilter()  - chuẩn hoá văn bản để so khớp
 *   buildFilterVariants() - sinh biến thể chống lách (deleet/glued/squeezed)
 *   parseBannedEntry()    - đọc 1 mục từ cấm (chuỗi hoặc object)
 *   findBannedMatches()   - trả [{ word, level }] mà đoạn văn chứa
 *   findBannedWords()     - mảng chuỗi các từ bị bắt
 *   containsBannedWord()  - boolean
 *   classifyContent()     - { level, action, matches, words, label }
 *
 * Nạp sau components.js (dùng chung escapeHtml/imageUrl) và trước file gọi tới nó.
 */

/**
 * Bỏ dấu tiếng Việt + đưa về chữ thường, bỏ khoảng trắng thừa ở hai đầu.
 * @param {*} text
 * @returns {string}
 */
function normalizeKeyword(text) {
    return String(text === null || text === undefined ? '' : text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}

/**
 * Kiểm tra 1 đoạn text có chứa keyword không.
 * @param {string} text - nội dung cần tìm (vd: tên tướng, tên build)
 * @param {string} keyword - từ khoá người dùng gõ, rỗng = khớp tất cả
 * @returns {boolean}
 */
function matchKeyword(text, keyword) {
    const needle = normalizeKeyword(keyword);
    if (!needle) return true;

    return normalizeKeyword(text).includes(needle);
}

/**
 * Trì hoãn gọi hàm cho tới khi người dùng ngừng gõ trong `wait` mili giây.
 * @param {Function} fn
 * @param {number} [wait=300]
 * @returns {Function}
 */
function debounce(fn, wait = 300) {
    let timerId = null;

    return function debounced(...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Đọc tham số trên URL, vd ?id=12&keyword=valhein
 * @param {string} name
 * @param {string} [fallback=''] giá trị trả về khi không có tham số
 * @returns {string}
 */
function getQueryParam(name, fallback = '') {
    const value = new URLSearchParams(window.location.search).get(name);
    return value === null ? fallback : value;
}

// ===== BỘ LỌC TỪ CẤM (KD07) =====

// Mức độ vi phạm (số lớn = nặng hơn)
const MOD_LEVEL_REVIEW = 1;  // cần xem xét: bài vào hàng chờ, bình luận gắn cờ
const MOD_LEVEL_BLOCK = 2;   // vi phạm: chặn + cảnh cáo
const MOD_LEVEL_SEVERE = 3;  // nghiêm trọng: chặn + cảnh cáo nặng
const MOD_LEVEL_LABELS = { 1: 'Cần xem xét', 2: 'Vi phạm', 3: 'Nghiêm trọng' };

/**
 * Chuẩn hoá văn bản để so khớp từ cấm: bỏ dấu + chữ thường (normalizeKeyword),
 * mọi ký tự không phải a-z/0-9 thành một dấu cách, gộp khoảng trắng thừa.
 * @param {*} text
 * @returns {string} rỗng nếu lỗi/không có nội dung
 */
function normalizeForFilter(text) {
    try {
        return normalizeKeyword(text)
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    } catch (e) {
        return '';
    }
}

/**
 * Sinh biến thể dò từ cấm có gắn nhãn (nội bộ của buildFilterVariants/findBannedMatches):
 * plain = base hoặc deleet; plain+glued = bản nối token 1 chữ cái; squeezed = rút ký tự lặp.
 * @param {*} text
 * @returns {Array<{text: string, kind: string}>}
 */
function _buildFilterVariantsTagged(text) {
    const base = normalizeForFilter(text);
    if (!base) return [];

    // deleet: token có cả chữ lẫn số -> số thành chữ (0->o, 1->i...); token chỉ số/chỉ chữ giữ nguyên
    const digitMap = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
    const deleet = base.split(' ').map(function (tok) {
        if (!/[a-z]/.test(tok) || !/[0-9]/.test(tok)) return tok;
        return tok.replace(/[0-9]/g, function (d) { return digitMap[d] || d; });
    }).join(' ');

    // glued: token 1 chữ cái (a-z) liền nhau từ 2 cái trở lên -> nối thành 1 token; token số không nối
    const parts = [];
    let run = [];
    const flush = function () {
        if (run.length >= 2) parts.push(run.join(''));
        else parts.push.apply(parts, run);
        run = [];
    };
    base.split(' ').forEach(function (tok) {
        if (/^[a-z]$/.test(tok)) { run.push(tok); return; }
        flush();
        if (tok) parts.push(tok);
    });
    flush();
    const glued = parts.filter(Boolean).join(' ');

    // squeezed: rút mọi chuỗi ký tự lặp liên tiếp về 1 ký tự (vd "dmmmmm" -> "dm")
    const squeeze = function (s) { return s.replace(/(.)\1+/g, '$1'); };

    return [
        { text: base, kind: 'plain' },
        { text: deleet, kind: 'plain' },
        { text: glued, kind: 'plain+glued' },
        { text: squeeze(base), kind: 'squeezed' },
        { text: squeeze(deleet), kind: 'squeezed' },
        { text: squeeze(glued), kind: 'squeezed' }
    ];
}

/**
 * Sinh tối đa 6 chuỗi biến thể đã chuẩn hoá (không trùng, bỏ rỗng) để dò từ cấm:
 * base, deleet (số->chữ), glued (token 1 chữ cái liền nhau nối lại),
 * và bản squeezed (rút ký tự lặp) của 3 biến thể trên.
 * @param {*} text
 * @returns {string[]}
 */
function buildFilterVariants(text) {
    try {
        const out = [];
        _buildFilterVariantsTagged(text).forEach(function (v) {
            if (v.text && out.indexOf(v.text) === -1 && out.length < 6) out.push(v.text);
        });
        return out;
    } catch (e) {
        return [];
    }
}

/**
 * Đọc 1 mục từ cấm: chuỗi -> mức 2; object { word, level: 1|2|3 } (level sai -> 2).
 * @param {*} entry
 * @returns {{word: string, level: number}|null}
 */
function parseBannedEntry(entry) {
    try {
        if (typeof entry === 'string') {
            const word = entry.trim();
            return word ? { word: word, level: MOD_LEVEL_BLOCK } : null;
        }
        if (entry && typeof entry === 'object' && typeof entry.word === 'string') {
            const word = entry.word.trim();
            if (!word) return null;
            const lv = entry.level;
            const level = (lv === MOD_LEVEL_REVIEW || lv === MOD_LEVEL_BLOCK || lv === MOD_LEVEL_SEVERE)
                ? lv : MOD_LEVEL_BLOCK;
            return { word: word, level: level };
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Tìm các mục từ cấm mà đoạn văn chứa, kèm mức độ.
 * Khớp theo ranh giới từ (không khớp chuỗi con), bắt được cả kiểu lách:
 * không dấu/chữ hoa, chèn dấu chấm, kéo dài chữ, số thay chữ, tách từng chữ.
 * Cùng word xuất hiện nhiều lần -> giữ mức cao nhất, không trùng theo word.
 * @param {*} text - đoạn văn cần kiểm tra
 * @param {*} entries - mảng entry (chuỗi hoặc { word, level })
 * @returns {Array<{word: string, level: number}>}
 */
function findBannedMatches(text, entries) {
    try {
        if (!Array.isArray(entries)) return [];
        if (text === null || text === undefined) return [];

        const tagged = _buildFilterVariantsTagged(text);
        if (!tagged.length) return [];
        const padded = tagged.map(function (v) { return { pad: ' ' + v.text + ' ', kind: v.kind }; });

        const results = [];
        const seen = Object.create(null);
        for (let i = 0; i < entries.length; i++) {
            const parsed = parseBannedEntry(entries[i]);
            if (!parsed) continue;

            const nw = normalizeForFilter(parsed.word);
            if (nw.length < 2) continue;

            const squeezedWord = nw.replace(/(.)\1+/g, '$1');
            const compactWord = nw.replace(/ /g, '');

            let hit = false;
            for (let j = 0; j < padded.length && !hit; j++) {
                const p = padded[j];
                if (p.pad.indexOf(' ' + nw + ' ') !== -1) hit = true;
                else if (p.kind === 'squeezed' && squeezedWord.length >= 2 &&
                    p.pad.indexOf(' ' + squeezedWord + ' ') !== -1) hit = true;
                else if (p.kind === 'plain+glued' && compactWord.length >= 2 && compactWord !== nw &&
                    p.pad.indexOf(' ' + compactWord + ' ') !== -1) hit = true;
            }
            if (!hit) continue;

            if (seen[parsed.word] !== undefined) {
                const idx = seen[parsed.word];
                if (parsed.level > results[idx].level) results[idx].level = parsed.level;
            } else {
                seen[parsed.word] = results.length;
                results.push({ word: parsed.word, level: parsed.level });
            }
        }
        return results;
    } catch (e) {
        return [];
    }
}

/**
 * Tiện ích của findBannedMatches: chỉ trả mảng chuỗi từ bị bắt (nguyên văn admin nhập).
 * @param {*} text
 * @param {*} entries
 * @returns {string[]}
 */
function findBannedWords(text, entries) {
    try {
        return findBannedMatches(text, entries).map(function (m) { return m.word; });
    } catch (e) {
        return [];
    }
}

/**
 * Kiểm tra nhanh đoạn văn có chứa từ cấm không.
 * @param {*} text
 * @param {*} entries
 * @returns {boolean}
 */
function containsBannedWord(text, entries) {
    try {
        return findBannedMatches(text, entries).length > 0;
    } catch (e) {
        return false;
    }
}

/**
 * Phân loại nội dung theo mức từ cấm cao nhất tìm được.
 * @param {*} text
 * @param {*} entries
 * @returns {{level: number, action: string, matches: Array, words: string[], label: string}}
 */
function classifyContent(text, entries) {
    try {
        const matches = findBannedMatches(text, entries);
        let level = 0;
        for (let i = 0; i < matches.length; i++) {
            if (matches[i].level > level) level = matches[i].level;
        }
        const action = level === 0 ? 'ok'
            : level === MOD_LEVEL_REVIEW ? 'review'
            : level === MOD_LEVEL_BLOCK ? 'block'
            : 'severe';
        return {
            level: level,
            action: action,
            matches: matches,
            words: matches.map(function (m) { return m.word; }),
            label: MOD_LEVEL_LABELS[level] || ''
        };
    } catch (e) {
        return { level: 0, action: 'ok', matches: [], words: [], label: '' };
    }
}
