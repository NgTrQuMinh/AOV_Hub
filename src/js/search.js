/**
 * search.js - Hỗ trợ tìm kiếm phía client
 * Phụ trách: Người 4
 *
 * Các hàm ở đây được dùng lại bởi hero.js, build.js, item.js, compare.js, favorite.js:
 *   getQueryParam() - đọc tham số URL (vd heroes.html?keyword=valhein)
 *   matchKeyword()  - so khớp không phân biệt hoa/thường và không phân biệt dấu tiếng Việt
 *   debounce()      - trì hoãn xử lý khi gõ liên tục
 *
 * Bộ lọc từ cấm KD07 (danh sách truyền qua tham số, không đọc LocalStorage).
 * Mô hình CÓ XÉT DẤU: mỗi token có kd (giữ dấu, đã đổi đ->d), f (bỏ hết dấu) và
 * cờ marked. Có dấu thì chỉ khớp "đúng" (exact); KHÔNG dấu mới được khớp qua đường
 * bỏ dấu (fold) nên "ngủ"/"lớn"/"đeo" không bắt nhầm thành "ngu"/"lồn"/"đéo".
 * Cờ fold của mục từ: full = giữ mức, review = hạ còn mức 1, off = chỉ bắt đúng dấu.
 * Bắt thêm kiểu né: không dấu, chèn dấu/gạch, kéo dài chữ (squeezed), số thay chữ
 * (deleet), tách từng chữ (glued).
 *   Hằng mức độ: MOD_LEVEL_REVIEW/BLOCK/SEVERE, MOD_LEVEL_LABELS
 *   Entry = chuỗi (coi là mức 2) hoặc { word, level: 0|1|2|3, fold?: 'full'|'review'|'off' }
 *           (level 0 = cho phép, bỏ qua khi so khớp; fold mặc định 'full')
 *   normalizeForFilter()  - chuẩn hoá văn bản bỏ dấu (giữ hành vi cũ)
 *   tokenizeForFilter()   - tách token { kd, f, marked }
 *   parseBannedEntry()    - đọc 1 mục từ cấm -> { word, level, fold } hoặc null
 *   findBannedMatches()   - trả [{ word, level, loose }] mà đoạn văn chứa
 *   findBannedWords()     - mảng chuỗi các từ bị bắt
 *   containsBannedWord()  - boolean
 *   classifyContent()     - { level, action, matches, words, label }
 *   DEFAULT_BANNED_ENTRIES    - hằng danh sách từ cấm MẪU chia 3 mức (không có level 0)
 *   getDefaultBannedEntries() - bản sao sâu của DEFAULT_BANNED_ENTRIES
 *   mergeBannedEntries()      - gộp danh sách mẫu với danh sách admin tự thêm;
 *                               trùng khoá lấy mức cao hơn, fold của mục đến sau;
 *                               entry level 0 = GỠ một từ mẫu khỏi kết quả
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
 * Rút gọn mọi chuỗi ký tự giống nhau lặp liền nhau thành một ký tự (vd "dmmmm" -> "dm").
 * @param {*} s
 * @returns {string}
 */
function filterSqueeze(s) {
    try {
        return String(s).replace(/(.)\1+/g, '$1');
    } catch (e) {
        return '';
    }
}

/**
 * Đổi số thành chữ cho token né kiểu leet (0->o, 1->i, 3->e, 4->a, 5->s, 7->t).
 * @param {*} s
 * @returns {string}
 */
function filterDeleet(s) {
    const map = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
    try {
        return String(s).replace(/[0-9]/g, function (d) { return map[d] || d; });
    } catch (e) {
        return '';
    }
}

/**
 * Tách văn bản thành token { kd, f, marked }.
 * kd = giữ dấu (đã đổi đ->d), f = kd bỏ hết dấu. marked tính trên bản gốc nên "đ"
 * cũng làm marked = true, nhờ đó "đeo" KHÔNG khớp "đéo" qua đường bỏ dấu.
 * @param {*} text
 * @returns {Array<{kd: string, f: string, marked: boolean}>}
 */
function tokenizeForFilter(text) {
    try {
        const src = String(text === null || text === undefined ? '' : text)
            .normalize('NFC')
            .toLowerCase();
        let parts;
        try {
            parts = src.split(/[^\p{L}\p{N}]+/u);
        } catch (e) {
            parts = src.split(/[^0-9a-z\u00e0-\u00ff\u0100-\u024f\u1e00-\u1eff]+/g);
        }
        const out = [];
        for (let i = 0; i < parts.length; i++) {
            const tok = parts[i];
            if (!tok) continue;
            const kd = tok.replace(/đ/g, 'd');
            const f = kd.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            out.push({ kd: kd, f: f, marked: tok !== f });
        }
        return out;
    } catch (e) {
        return [];
    }
}

/**
 * Sinh các "cách đọc" của một token văn bản: gốc, squeezed (khi có chữ lặp),
 * deleet (khi không dấu và vừa có chữ vừa có số) và deleet+squeezed.
 * @param {{kd: string, f: string, marked: boolean}} tok
 * @returns {Array<{kd: string, f: string, marked: boolean, tag: string}>}
 */
function filterReadings(tok) {
    const reads = [];
    const seen = Object.create(null);
    const add = function (kd, f, marked, tag) {
        const key = kd + '\u0000' + f;
        if (seen[key]) return;
        seen[key] = true;
        reads.push({ kd: kd, f: f, marked: marked, tag: tag });
    };
    add(tok.kd, tok.f, tok.marked, 'base');
    const sqK = filterSqueeze(tok.kd);
    const sqF = filterSqueeze(tok.f);
    if (sqK !== tok.kd || sqF !== tok.f) add(sqK, sqF, tok.marked, 'squeezed');
    if (!tok.marked && /[a-z]/.test(tok.f) && /[0-9]/.test(tok.f)) {
        const dK = filterDeleet(tok.kd);
        const dF = filterDeleet(tok.f);
        if (dK !== tok.kd || dF !== tok.f) {
            add(dK, dF, false, 'deleet');
            const dqK = filterSqueeze(dK);
            const dqF = filterSqueeze(dF);
            if (dqK !== dK || dqF !== dF) add(dqK, dqF, false, 'deleet+squeezed');
        }
    }
    return reads;
}

/**
 * Khớp "đúng" theo kd. Không cho cách đọc gốc của văn bản khớp bản đã rút gọn của
 * từ cấm (tránh "cm" trong "180 cm" khớp "cmm").
 * @param {Array} textReads
 * @param {Array} entryReads
 * @returns {boolean}
 */
function filterExactMatch(textReads, entryReads) {
    for (let i = 0; i < textReads.length; i++) {
        const r = textReads[i];
        for (let j = 0; j < entryReads.length; j++) {
            const e = entryReads[j];
            if (r.kd === e.kd && !(r.tag === 'base' && e.tag !== 'base')) return true;
        }
    }
    return false;
}

/**
 * Khớp "bỏ dấu" theo f: chỉ khi token văn bản không có dấu (marked = false).
 * @param {Array} textReads
 * @param {Array} entryReads
 * @returns {boolean}
 */
function filterFoldMatch(textReads, entryReads) {
    for (let i = 0; i < textReads.length; i++) {
        const r = textReads[i];
        if (r.marked) continue;
        for (let j = 0; j < entryReads.length; j++) {
            const e = entryReads[j];
            if (r.f === e.f && !(r.tag === 'base' && e.tag !== 'base')) return true;
        }
    }
    return false;
}

/**
 * So một token văn bản với một token từ cấm -> 'exact' | 'fold' | null (ưu tiên exact).
 * @param {Array} textReads
 * @param {Array} entryReads
 * @param {boolean} allowFold
 * @returns {string|null}
 */
function matchFilterToken(textReads, entryReads, allowFold) {
    if (filterExactMatch(textReads, entryReads)) return 'exact';
    if (allowFold && filterFoldMatch(textReads, entryReads)) return 'fold';
    return null;
}

/**
 * Chuẩn bị một mục từ cấm: token hoá word, bỏ mục có tổng độ dài f < 2, tính cách đọc.
 * @param {{word: string, level: number, fold: string}} parsed
 * @returns {{word: string, level: number, fold: string, tokens: Array, reads: Array}|null}
 */
function prepareFilterEntry(parsed) {
    const tokens = tokenizeForFilter(parsed.word);
    if (!tokens.length) return null;
    let total = 0;
    for (let i = 0; i < tokens.length; i++) total += tokens[i].f.length;
    if (total < 2) return null;
    return {
        word: parsed.word,
        level: parsed.level,
        fold: parsed.fold,
        tokens: tokens,
        reads: tokens.map(filterReadings)
    };
}

/**
 * Khớp cụm token liên tiếp trong văn bản với các token của từ cấm (theo ranh giới token).
 * Cửa sổ "exact" nếu mọi token khớp exact, ngược lại là "fold".
 * @param {Array} textReadsArr - mảng cách đọc theo từng token văn bản
 * @param {Array} entryTokens
 * @param {Array} entryReads
 * @param {boolean} allowFold
 * @returns {{loose: boolean}|null}
 */
function matchFilterWindow(textReadsArr, entryTokens, entryReads, allowFold) {
    const m = entryTokens.length;
    let fold = false;
    for (let i = 0; i + m <= textReadsArr.length; i++) {
        let anyFold = false;
        let ok = true;
        for (let j = 0; j < m; j++) {
            const kind = matchFilterToken(textReadsArr[i + j], entryReads[j], allowFold);
            if (!kind) { ok = false; break; }
            if (kind === 'fold') anyFold = true;
        }
        if (ok) {
            if (!anyFold) return { loose: false };
            fold = true;
        }
    }
    return fold ? { loose: true } : null;
}

/**
 * So khớp kiểu "tách từng chữ": cụm >=2 token 1 chữ cái liền nhau nối lại,
 * so với từ cấm đã bỏ khoảng trắng (kd nối cho exact, f nối cho fold).
 * @param {Array} textToks
 * @param {Array} entryTokens
 * @param {boolean} allowFold
 * @returns {{loose: boolean}|null}
 */
function matchFilterGlued(textToks, entryTokens, allowFold) {
    const runs = [];
    let cur = [];
    for (let i = 0; i < textToks.length; i++) {
        const t = textToks[i];
        if (isSingleLetterToken(t)) cur.push(t);
        else { if (cur.length >= 2) runs.push(cur); cur = []; }
    }
    if (cur.length >= 2) runs.push(cur);
    if (!runs.length) return null;

    let entryKd = '';
    let entryF = '';
    for (let i = 0; i < entryTokens.length; i++) {
        entryKd += entryTokens[i].kd;
        entryF += entryTokens[i].f;
    }
    for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        let clusterKd = '';
        let clusterF = '';
        let allPlain = true;
        for (let j = 0; j < run.length; j++) {
            clusterKd += run[j].kd;
            clusterF += run[j].f;
            if (run[j].marked) allPlain = false;
        }
        if (clusterLike(clusterKd, entryKd)) return { loose: false };
        if (allowFold && allPlain && clusterLike(clusterF, entryF)) return { loose: true };
    }
    return null;
}

/**
 * Token có phải "1 chữ cái" không (dùng cho kiểu né tách từng chữ).
 * @param {{kd: string}} tok
 * @returns {boolean}
 */
function isSingleLetterToken(tok) {
    if (!tok || tok.kd.length !== 1) return false;
    try {
        return /\p{L}/u.test(tok.kd);
    } catch (e) {
        return /[a-z\u00c0-\u024f\u1e00-\u1eff]/.test(tok.kd);
    }
}

/**
 * Cụm nối "giống" từ cấm không: bằng nhau, hoặc rút gọn của cụm bằng từ cấm,
 * hoặc từ cấm dài >= 4 ký tự nằm trong cụm.
 * @param {string} cluster
 * @param {string} word
 * @returns {boolean}
 */
function clusterLike(cluster, word) {
    if (!cluster || !word) return false;
    if (cluster === word) return true;
    if (filterSqueeze(cluster) === word) return true;
    if (word.length >= 4 && cluster.indexOf(word) !== -1) return true;
    return false;
}

/**
 * Đọc 1 mục từ cấm: chuỗi -> mức 2, fold 'full'; object { word, level: 0|1|2|3, fold }.
 * level thiếu/sai -> 2 (level 0 được giữ nguyên = cho phép); fold thiếu/lạ -> 'full'.
 * @param {*} entry
 * @returns {{word: string, level: number, fold: string}|null}
 */
function parseBannedEntry(entry) {
    try {
        if (typeof entry === 'string') {
            const word = entry.trim();
            return word ? { word: word, level: MOD_LEVEL_BLOCK, fold: 'full' } : null;
        }
        if (entry && typeof entry === 'object' && typeof entry.word === 'string') {
            const word = entry.word.trim();
            if (!word) return null;
            const lv = entry.level;
            const level = (lv === 0 || lv === 1 || lv === 2 || lv === 3) ? lv : MOD_LEVEL_BLOCK;
            const fold = (entry.fold === 'full' || entry.fold === 'review' || entry.fold === 'off')
                ? entry.fold : 'full';
            return { word: word, level: level, fold: fold };
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Tìm các mục từ cấm mà đoạn văn chứa, kèm mức độ và cờ loose (khớp nhờ bỏ dấu).
 * Khớp theo ranh giới token (không khớp chuỗi con) và bắt kiểu né: không dấu/chữ hoa,
 * chèn dấu, kéo dài chữ, số thay chữ, tách từng chữ. Cùng word nhiều lần -> giữ mức
 * cao nhất, đúng thứ tự trong entries, không trùng theo word. entries không phải mảng
 * hoặc text rỗng -> [].
 * @param {*} text - đoạn văn cần kiểm tra
 * @param {*} entries - mảng entry (chuỗi hoặc { word, level, fold })
 * @returns {Array<{word: string, level: number, loose: boolean}>}
 */
function findBannedMatches(text, entries) {
    try {
        if (!Array.isArray(entries)) return [];
        const tokens = tokenizeForFilter(text);
        if (!tokens.length) return [];
        const textReadsArr = tokens.map(filterReadings);

        const results = [];
        const index = Object.create(null);
        for (let i = 0; i < entries.length; i++) {
            const parsed = parseBannedEntry(entries[i]);
            if (!parsed || parsed.level === 0) continue;
            const entry = prepareFilterEntry(parsed);
            if (!entry) continue;

            const allowFold = entry.fold !== 'off';
            let best = matchFilterWindow(textReadsArr, entry.tokens, entry.reads, allowFold);
            const glued = matchFilterGlued(tokens, entry.tokens, allowFold);
            if (glued && (!best || (best.loose && !glued.loose))) best = glued;
            if (!best) continue;

            let level = parsed.level;
            let loose = false;
            if (best.loose) {
                loose = true;
                if (parsed.fold === 'review') level = MOD_LEVEL_REVIEW;
            }

            if (index[parsed.word] !== undefined) {
                const idx = index[parsed.word];
                if (level > results[idx].level) results[idx].level = level;
                if (!loose) results[idx].loose = false;
            } else {
                index[parsed.word] = results.length;
                results.push({ word: parsed.word, level: level, loose: loose });
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

// ===== DANH SÁCH TỪ CẤM MẪU + GỘP DANH SÁCH (KD07) =====

/**
 * Danh sách từ cấm mẫu, chia 3 mức. Không ghi fold = 'full'.
 * Danh sách mẫu không chứa mục level 0 (mức 0 chỉ phát sinh khi admin gỡ từ).
 * Không chứa số/địa danh đứng riêng (36, 37, Thanh Hóa, Hà Nội...).
 */
const DEFAULT_BANNED_ENTRIES = (function () {
    const out = [];
    // Ghép một dãy từ ';' cùng mức; không truyền fold thì không đặt trường fold
    const add = function (level, fold, text) {
        const parts = String(text === null || text === undefined ? '' : text).split(';');
        for (let i = 0; i < parts.length; i++) {
            const word = parts[i].trim();
            if (!word) continue;
            const item = { word: word, level: level };
            if (fold) item.fold = fold;
            out.push(item);
        }
    };

    // Mức 3 - nghiêm trọng: đe dọa, thù ghét nhóm người
    add(3, null, 'giết mày; chém mày; đâm mày; đập mày; đánh chết mày; giết cả nhà mày; đốt nhà mày; tìm đến nhà mày; tao tìm mày; cho mày chết; xử mày; mày chết với tao');
    add(3, null, 'bọn bắc kỳ; lũ bắc kỳ; bọn nam kỳ; lũ nam kỳ; bọn trung kỳ; lũ trung kỳ; bọn nhà quê; lũ nhà quê; bọn tỉnh lẻ; lũ tỉnh lẻ; bọn pê đê; lũ pê đê; bọn mọi; lũ mọi; mọi đen; bọn khựa; lũ khựa');

    // Mức 2 - vi phạm, fold 'full'
    add(2, 'full', 'địt; địt mẹ; địt con mẹ; địt bố; địt má; đụ mẹ; đụ má; đù má; đủ má; đm; đcm; đjt; cmm; clm; vcl; vkl; dmcs; fuck; fucking; fck; shit; bitch; asshole; motherfucker');
    add(2, 'full', 'ngu; đồ ngu; thằng ngu; con ngu; ngu như chó; óc chó; não chó; não tàn; vô học; mất dạy; vô liêm sỉ; súc vật; súc sinh; đồ khốn; thằng khốn; con khốn; chó má; thằng hãm; con hãm; thằng chó; đồ chó; chó điên; thằng điên; con điên; đồ điên; thiểu năng; thằng thiểu năng; đồ khuyết tật; đồ tàn tật; bố láo; mẹ mày; con mẹ mày; biết tay tao');
    add(2, 'full', 'đồ pê đê; đồ nhà quê; dân nhà quê; đồ tỉnh lẻ; dân tỉnh lẻ; dân quê mùa; parky; namkiki; khựa; tàu khựa; đồ mọi rợ');

    // Mức 2 - fold 'review': gõ không dấu chỉ hạ xuống mức 1 (dễ nhầm)
    add(2, 'review', 'đéo; đếch; lồn; cặc; buồi');

    // Mức 2 - fold 'off': chỉ bắt khi gõ đúng dấu (bỏ dấu trùng từ thông thường)
    add(2, 'off', 'con đĩ; đĩ; cứt; điếm');

    // Mức 1 - cần xem xét, fold 'full'
    add(1, 'full', 'cc; cl; wtf; vl; cmn; bắc kỳ; nam kỳ; trung kỳ; cút đi; biến đi; chết đi; đáng bị đánh; liệu hồn; ăn hại; đồ rác; cặn bã; thứ rẻ rách; đồ bệnh hoạn');

    return out;
})();

/**
 * Trả bản sao sâu của danh sách mẫu (sửa kết quả không làm đổi hằng gốc).
 * @returns {Array<{word: string, level: number, fold?: string}>}
 */
function getDefaultBannedEntries() {
    try {
        return JSON.parse(JSON.stringify(DEFAULT_BANNED_ENTRIES));
    } catch (e) {
        return [];
    }
}

/**
 * Gộp hai mảng entry: mẫu mặc định trước, admin thêm sau.
 * Mỗi phần tử đi qua parseBannedEntry (chuỗi -> mức 2); không hợp lệ bị bỏ.
 * Khoá trùng = các token kd của word nối một khoảng trắng ("ngu" != "ngủ").
 * Trùng khoá: lấy mức CAO hơn, fold lấy của mục đến SAU; mục level 0 thì GỠ khoá.
 * Kết quả: mảng { word, level, fold } không trùng, theo thứ tự xuất hiện đầu tiên.
 * @param {*} defaults - mảng entry mẫu (không phải mảng -> coi như rỗng)
 * @param {*} custom - mảng entry admin thêm (không phải mảng -> coi như rỗng)
 * @returns {Array<{word: string, level: number, fold: string}>}
 */
function mergeBannedEntries(defaults, custom) {
    try {
        const buckets = [];
        const index = Object.create(null);

        const take = function (arr) {
            if (!Array.isArray(arr)) return;
            for (let i = 0; i < arr.length; i++) {
                const parsed = parseBannedEntry(arr[i]);
                if (!parsed) continue;
                const toks = tokenizeForFilter(parsed.word);
                if (!toks.length) continue;
                const key = toks.map(function (t) { return t.kd; }).join(' ');

                if (parsed.level === 0) {
                    // level 0 = gỡ từ khoá này khỏi kết quả
                    if (index[key] !== undefined) buckets[index[key]] = null;
                    delete index[key];
                    continue;
                }
                if (index[key] !== undefined) {
                    const prev = buckets[index[key]];
                    if (!prev) {
                        buckets[index[key]] = parsed;
                    } else {
                        if (parsed.level > prev.level) prev.level = parsed.level;
                        prev.fold = parsed.fold; // fold của mục đến sau
                    }
                } else {
                    index[key] = buckets.length;
                    buckets.push(parsed);
                }
            }
        };

        take(defaults);
        take(custom);

        const out = [];
        for (let i = 0; i < buckets.length; i++) {
            if (buckets[i] && buckets[i].level !== 0) out.push(buckets[i]);
        }
        return out;
    } catch (e) {
        return [];
    }
}
