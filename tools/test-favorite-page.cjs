/**
 * test-favorite-page.cjs - Kiểm tra trang Yêu thích / Lịch sử (src/pages/favorite.html):
 * 2 tab, hiển thị tướng & trang bị đã yêu thích, bỏ yêu thích ngay trên trang,
 * lịch sử tra cứu, xoá lịch sử và giữ tab trên URL khi mở lại.
 * Chạy: node tools/test-favorite-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/favorite.html';
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));

const heroName = (id) => (HEROES_JSON.find((hero) => hero.id === id) || {}).name;
const itemName = (id) => (ITEMS_JSON.find((item) => item.id === id) || {}).name;

const HERO_A = HEROES_JSON[0].id;
const HERO_B = HEROES_JSON[1].id;
const HERO_C = HEROES_JSON[2].id;
const ITEM_A = ITEMS_JSON[0].id;
const ITEM_B = ITEMS_JSON[1].id;

/** LocalStorage dựng sẵn: yêu thích 2 tướng + 2 trang bị, lịch sử xem [HERO_C, HERO_B]. */
function seedStorage() {
    return new Map([
        ['aov_favorites', JSON.stringify({ hero: [HERO_A, HERO_B], item: [ITEM_A, ITEM_B] })],
        ['aov_history', JSON.stringify([HERO_C, HERO_B])],
    ]);
}

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

async function openFavorite(search = '', options = {}) {
    const page = loadPage(Object.assign({ page: PAGE, search, storage: seedStorage() }, options));
    page.run();
    await page.settled();
    return page;
}

function namesOf(page, type) {
    const list = page.el('favorite-list').innerHTML;
    const regex = type === 'hero'
        ? /hero-card__name">([^<]*)</g
        : /item-card__name">([^<]*)</g;

    return [...list.matchAll(regex)].map((match) => unescapeHtml(match[1]));
}

/** Đọc số lượng ghi trong badge của nhóm đầu tiên (Tướng) của tab Yêu thích. */
function firstCount(page) {
    const match = page.el('favorite-list').innerHTML.match(/favorite-section__count">([^<]*)<\/span>/);
    return match ? unescapeHtml(match[1]) : '';
}

function tabButtons(page) {
    return Array.from(page.doc.querySelectorAll('.tabs__btn[data-tab]'));
}

(async () => {
    /* ---------- 1. Tab mặc định: Yêu thích ---------- */
    section('1. Tab Yêu thích (mặc định)');
    const page = await openFavorite();
    const tabs = tabButtons(page);

    check('có đúng 2 tab "Yêu thích" và "Lịch sử"',
        tabs.length === 2
        && [...page.el('favorite-tabs').innerHTML.matchAll(/data-tab="([\w-]+)"[^>]*>\s*([^<]*)\s*<\/button>/g)]
            .map((match) => unescapeHtml(match[2]))
            .join(',') === 'Yêu thích,Lịch sử',
        tabs.map((tab) => tab.getAttribute('data-tab')).join(','));
    check('tab "Yêu thích" đang active và Lịch sử chưa active',
        tabs[0].getAttribute('aria-selected') === 'true'
        && tabs[1].getAttribute('aria-selected') === 'false');

    check('nhóm Tướng hiển thị đúng 2 tướng đã yêu thích',
        namesOf(page, 'hero').join(',') === `${heroName(HERO_A)},${heroName(HERO_B)}`,
        namesOf(page, 'hero').join(','));
    check('badge số lượng nhóm Tướng hiện "2"',
        firstCount(page) === '2',
        firstCount(page));
    check('nhóm Trang bị hiển thị đúng 2 trang bị đã yêu thích',
        namesOf(page, 'item').join(',') === `${itemName(ITEM_A)},${itemName(ITEM_B)}`,
        namesOf(page, 'item').join(','));
    check('mọi nút ♥ trên trang đều ở trạng thái đã yêu thích (aria-pressed=true)',
        page.doc.querySelectorAll('.btn-favorite').length === 4
        && Array.from(page.doc.querySelectorAll('.btn-favorite')).every((btn) => btn.getAttribute('aria-pressed') === 'true'),
        String(page.doc.querySelectorAll('.btn-favorite').length));

    /* ---------- 2. Bỏ yêu thích ngay trên trang ---------- */
    section('2. Bỏ yêu thích');
    const heroButton = page.doc.querySelectorAll('.btn-favorite[data-type="hero"]')[0];
    fire(heroButton, 'click', page.doc);
    await page.settled();

    check('bấm ♥ trên card tướng -> tướng đó biến mất khỏi nhóm Tướng',
        namesOf(page, 'hero').join(',') === heroName(HERO_B),
        namesOf(page, 'hero').join(','));
    check('bấm ♥ -> aov_favorites.hero giảm còn 1 id (không giữ id đã bỏ)',
        JSON.parse(page.storage.get('aov_favorites')).hero.join(',') === String(HERO_B),
        String(page.storage.get('aov_favorites')));
    check('badge cập nhật thành "1"',
        firstCount(page) === '1',
        firstCount(page));

    /* ---------- 3. Tab Lịch sử ---------- */
    section('3. Tab Lịch sử');
    const historyTab = tabButtons(page)[1];
    fire(historyTab, 'click', page.doc);
    await page.settled();

    check('bấm tab Lịch sử -> hiện tướng đã xem (mới nhất trước)',
        namesOf(page, 'hero').join(',') === `${heroName(HERO_C)},${heroName(HERO_B)}`,
        namesOf(page, 'hero').join(','));
    check('lịch sử hiện đếm "2/10"',
        firstCount(page) === '2/10',
        firstCount(page));
    check('đổi tab ghi lên URL (?tab=history)',
        new URLSearchParams(page.location.search).get('tab') === 'history',
        page.location.search);

    const listHtml = page.el('favorite-list').innerHTML;
    const clearBtn = page.doc.querySelectorAll('[data-action="clear-history"]')[0];
    check('tab Lịch sử có sẵn nút "Xóa lịch sử"',
        Boolean(clearBtn) && /Xóa lịch sử/.test(listHtml),
        String(clearBtn));
    check('lịch sử đang hiện trong list có đủ 2 card tướng',
        namesOf(page, 'hero').length === 2,
        String(namesOf(page, 'hero').length));

    if (clearBtn) {
        fire(clearBtn, 'click', page.doc);
        await page.settled();
    }
    check('bấm "Xóa lịch sử" -> lịch sử rỗng và hiện nhắc trống',
        /Bạn chưa xem tướng nào/.test(page.el('favorite-list').innerHTML)
        && !page.storage.has('aov_history'),
        page.el('favorite-list').innerHTML.slice(0, 80));

    /* ---------- 4. Mở trang bằng URL có sẵn tab ---------- */
    section('4. Tab trên URL');
    const fromUrl = await openFavorite('?tab=history');
    check('mở thẳng ?tab=history -> ngay tab Lịch sử (hiện lịch sử sẵn có)',
        fromUrl.doc.querySelectorAll('.tabs__btn[data-tab="history"]')[0].getAttribute('aria-selected') === 'true'
        && namesOf(fromUrl, 'hero').join(',') === `${heroName(HERO_C)},${heroName(HERO_B)}`,
        namesOf(fromUrl, 'hero').join(','));

    const badTab = await openFavorite('?tab=cai-la');
    check('?tab= giá trị lạ -> rơi về tab Yêu thích và URL được sửa lại',
        badTab.doc.querySelectorAll('.tabs__btn[data-tab="favorite"]')[0].getAttribute('aria-selected') === 'true'
        && new URLSearchParams(badTab.location.search).get('tab') === 'favorite',
        badTab.location.search);

    /* ---------- 5. Không lỗi JavaScript ---------- */
    section('5. Không lỗi');
    check('mọi lần mở trang không ném lỗi JavaScript',
        [page, fromUrl, badTab].every((p) =>
            p.errors.filter((error) => !error.startsWith('console.error')).length === 0),
        [page, fromUrl, badTab].flatMap((p) => p.errors).join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();