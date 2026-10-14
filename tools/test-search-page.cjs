/**
 * test-search-page.cjs - Kiểm tra trang Tìm kiếm toàn cục (src/pages/search.html):
 * đọc ?keyword= từ Header, gom 4 nhóm (Tướng / Trang bị / Build / Bài viết),
 * so khớp không phân biệt dấu, cập nhật realtime và trạng thái rỗng.
 * Chạy: node tools/test-search-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/search.html';
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', name), 'utf8'));

const HEROES_JSON = readJson('heroes.json');
const ITEMS_JSON = readJson('items.json');
const BUILDS_JSON = readJson('builds.json');
const POSTS_JSON = readJson('posts.json');

/* ---------- Bản sao normalizeKeyword()/matchKeyword() của search.js ---------- */

function normalizeKeyword(text) {
    return String(text === null || text === undefined ? '' : text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}

function matchKeyword(text, keyword) {
    const needle = normalizeKeyword(keyword);
    if (!needle) return true;
    return normalizeKeyword(text).includes(needle);
}

/* ---------- Số kết quả mong đợi cho từng nhóm ---------- */

const heroHits = (kw) => HEROES_JSON.filter((h) => matchKeyword(`${h.name} ${(h.role || []).join(' ')}`, kw));
const itemHits = (kw) => ITEMS_JSON.filter((i) => matchKeyword(`${i.name} ${i.type || ''}`, kw));
const buildHits = (kw) => BUILDS_JSON.filter((b) => {
    const hero = HEROES_JSON.find((h) => h.id === b.heroId);
    return matchKeyword(`${b.name} ${hero ? hero.name : ''}`, kw);
});
const postHits = (kw) => POSTS_JSON.filter((p) => {
    if (!p || p.hidden) return false;
    if (p.status && p.status !== 'approved') return false;
    return matchKeyword(`${p.title || ''} ${p.author || ''} ${p.content || ''}`, kw);
});

/* ================= Test runner ================= */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + name);
    } else {
        failures.push(name + (detail ? ` — ${detail}` : ''));
        console.log('  FAIL  ' + name + (detail ? `\n        ${detail}` : ''));
    }
}

function section(title) {
    console.log('\n== ' + title + ' ==');
}

/* ================= Trợ giúp ================= */

async function openSearch(search = '') {
    const page = loadPage({ page: PAGE, search });
    page.run();
    await page.settled();
    await new Promise((resolve) => setTimeout(resolve, 40));
    return page;
}

const resultsHtml = (page) => page.el('search-results').innerHTML;

function groupCount(page, key) {
    const match = resultsHtml(page).match(new RegExp(`id="search-group-${key}"[\\s\\S]*?search-group__count">(\\d+)<`));
    return match ? Number(match[1]) : null;
}

function hasGroup(page, key) {
    return resultsHtml(page).includes(`id="search-group-${key}"`);
}

/** Gõ vào ô tìm của trang rồi chờ debounce (250ms) chạy xong. */
async function typeKeyword(page, text) {
    const input = page.el('search-keyword');
    input.value = text;
    fire(input, 'input', page.doc);
    await new Promise((resolve) => setTimeout(resolve, 400));
}

/* ================= Test ================= */

(async () => {
    /* ---------- 1. Trạng thái chưa gõ ---------- */
    section('1. Ô tìm kiếm + trạng thái chưa gõ');
    const empty = await openSearch();
    check('trang vẽ ô tìm kiếm #search-keyword',
        Boolean(empty.el('search-keyword'))
        && empty.el('search-keyword').getAttribute('placeholder') !== null);
    check('chưa gõ từ khoá -> hiện lời nhắc, không dựng nhóm kết quả',
        resultsHtml(empty).includes('search-hint') && !hasGroup(empty, 'heroes'));

    /* ---------- 2. Tìm Tướng từ ?keyword= (đúng như Header gửi) ---------- */
    section('2. Tìm Tướng từ ?keyword=');
    const heroPage = await openSearch('?keyword=' + encodeURIComponent('Valhein'));
    check('ô tìm kiếm được điền sẵn từ URL',
        heroPage.el('search-keyword').value === 'Valhein');
    check('có nhóm "Tướng" với đúng số kết quả',
        hasGroup(heroPage, 'heroes') && groupCount(heroPage, 'heroes') === heroHits('Valhein').length,
        String(groupCount(heroPage, 'heroes')));
    check('kết quả Tướng liên kết tới hero-detail.html?id=1 và chứa tên tướng',
        unescapeHtml(resultsHtml(heroPage)).includes('hero-detail.html?id=1')
        && unescapeHtml(resultsHtml(heroPage)).includes('Valhein'));
    check('đếm tổng kết quả hiện "N kết quả"',
        heroPage.el('search-count').textContent ===
            `${heroHits('Valhein').length + itemHits('Valhein').length + buildHits('Valhein').length + postHits('Valhein').length} kết quả`,
        String(heroPage.el('search-count').textContent));

    /* ---------- 3. Không phân biệt dấu ---------- */
    section('3. Không phân biệt dấu');
    const noAccent = await openSearch('?keyword=' + encodeURIComponent('vuong mien'));
    check('gõ "vuong mien" (không dấu) ra Trang bị "Vương Miện Hecate"',
        hasGroup(noAccent, 'items')
        && unescapeHtml(resultsHtml(noAccent)).includes('item-detail.html?id=202')
        && unescapeHtml(resultsHtml(noAccent)).includes('Hecate'),
        'items=' + groupCount(noAccent, 'items'));

    /* ---------- 4. Nhóm Build ---------- */
    section('4. Nhóm Build');
    const buildPage = await openSearch('?keyword=Murad');
    check('gõ "Murad" ra nhóm "Build đề xuất"',
        hasGroup(buildPage, 'builds') && groupCount(buildPage, 'builds') === buildHits('Murad').length,
        String(groupCount(buildPage, 'builds')));
    check('kết quả Build liên kết về builds.html đã lọc theo tướng',
        resultsHtml(buildPage).includes('builds.html?keyword=Murad'));

    /* ---------- 5. Nhóm Bài viết ---------- */
    section('5. Nhóm Bài viết');
    const postPage = await openSearch('?keyword=Nakroth');
    check('gõ "Nakroth" ra nhóm "Bài viết cộng đồng"',
        hasGroup(postPage, 'posts') && groupCount(postPage, 'posts') === postHits('Nakroth').length,
        String(groupCount(postPage, 'posts')));
    check('kết quả Bài viết liên kết tới post-detail.html?id=',
        resultsHtml(postPage).includes('post-detail.html?id=9002'));

    /* ---------- 6. Không có kết quả ---------- */
    section('6. Không có kết quả');
    const none = await openSearch('?keyword=zzkhongton');
    check('từ khoá không trùng -> báo "Không tìm thấy kết quả"',
        unescapeHtml(resultsHtml(none)).includes('Không tìm thấy kết quả'));
    check('đếm hiện "0 kết quả"', none.el('search-count').textContent === '0 kết quả');

    /* ---------- 7. Gõ realtime cập nhật + URL ---------- */
    section('7. Gõ realtime');
    const live = await openSearch();
    await typeKeyword(live, 'Valhein');
    check('gõ realtime -> hiện nhóm Tướng (đã chờ debounce)',
        hasGroup(live, 'heroes') && groupCount(live, 'heroes') === heroHits('Valhein').length);
    check('URL được cập nhật ?keyword=Valhein để F5 giữ kết quả',
        new URLSearchParams(live.location.search).get('keyword') === 'Valhein',
        live.location.search);

    /* ---------- 8. Không lỗi ---------- */
    section('8. Không lỗi');
    const pages = [empty, heroPage, noAccent, buildPage, postPage, none, live];
    check('mọi lần mở trang không ném lỗi JavaScript',
        pages.every((page) => page.errors.length === 0),
        pages.map((page) => page.errors.join('; ')).filter(Boolean).join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((f) => console.log('  - ' + f));
        process.exitCode = 1;
    }
})();
