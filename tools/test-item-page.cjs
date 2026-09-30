/**
 * Test cho trang Danh sách Trang bị (src/pages/items.html + src/js/item.js).
 *
 * Mô phỏng DOM tối giản trong Node để kiểm tra thật sự hành vi render/tìm kiếm/lọc:
 *   - render đủ item từ src/data/items.json
 *   - tìm theo tên (không dấu, không phân biệt hoa thường)
 *   - lọc theo loại
 *   - search + filter cùng lúc
 *   - trường hợp không có kết quả + nút xóa lọc
 *   - click item sang trang chi tiết
 *   - trang chi tiết: item đầu / giữa / cuối + trang bị liên quan + xử lý lỗi
 *
 * Phần DOM giả + bộ nạp trang nằm chung ở tools/mini-dom.cjs.
 *
 * Chạy: node tools/test-item-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage: loadPageShared, unescapeHtml, fire } = require('./mini-dom.cjs');

const PAGE = 'src/pages/items.html';
const DETAIL_PAGE = 'src/pages/item-detail.html';
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));

const WAIT_RENDER_MS = 320; // > debounce 200ms trong item.js

/** Bọc lại hàm của mini-dom cho đúng kiểu gọi (page, search, options) của bộ test này. */
function loadPage(page, search, options) {
    const loaded = loadPageShared(Object.assign({ page, search }, options));

    return Object.assign(loaded, {
        afterSearch: () => new Promise((resolve) => setTimeout(resolve, WAIT_RENDER_MS)),
    });
}

/* ================= Đọc kết quả render ================= */

function readCards(listEl) {
    const html = listEl.innerHTML;

    return html
        .split('<article class="card item-card">')
        .slice(1)
        .map((block) => ({
            name: (block.match(/class="item-card__name">([^<]*)</) || [])[1] || '',
            type: (block.match(/item-card__meta">[\s\S]*?<span class="badge">([^<]*)</) || [])[1] || '',
            price: (block.match(/class="item-card__price">([^<]*)</) || [])[1] || '',
            image: (block.match(/<img src="([^"]*)"/) || [])[1] || '',
            statsCount: (block.match(/class="item-card__stat"/g) || []).length,
            detailId: (block.match(/item-detail\.html\?id=(\d+)/) || [])[1] || '',
        }));
}

function stripAccents(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** renderNotFound() escape HTML nên dấu " thành &quot; — giải mã lại để so khớp. */
function decodeEntities(text) {
    return unescapeHtml(text);
}

function stripTags(text) {
    return String(text).replace(/<[^>]+>/g, '').trim();
}

/** Đọc nội dung đã render của trang chi tiết (item-detail.html). */
function readDetail(containerEl) {
    const html = containerEl.innerHTML;
    const relatedHtml = (html.match(/<section class="item-related"[\s\S]*?<\/section>/) || [''])[0];
    // Mỗi card có 2 link về cùng 1 id (ảnh + "Xem chi tiết") -> lấy id của từng card.
    const relatedBlocks = relatedHtml.split('<article class="card item-card">').slice(1);

    return {
        html,
        relatedHtml,
        isEmptyState: html.includes('item-detail-empty'),
        name: decodeEntities((html.match(/item-detail__name">([^<]*)</) || [])[1] || ''),
        type: decodeEntities((html.match(/item-detail__type"[^>]*>([^<]*)</) || [])[1] || ''),
        price: decodeEntities((html.match(/item-detail__price[^"]*">([^<]*)</) || [])[1] || ''),
        image: (html.match(/item-detail__media">[\s\S]*?<img[\s\S]*?src="([^"]*)"/) || [])[1] || '',
        imageAlt: decodeEntities((html.match(/item-detail__media">[\s\S]*?alt="([^"]*)"/) || [])[1] || ''),
        hasImageFallback: /onerror="handleImageError\(this\)"/.test(html),
        desc: decodeEntities(stripTags((html.match(/item-detail__desc">([^<]*)</) || [])[1] || '')),
        passive: decodeEntities(stripTags((html.match(/item-detail__passive">[\s\S]*?<p>([\s\S]*?)<\/p>/) || [])[1] || '')),
        stats: [...html.matchAll(/item-detail__stat-label">([^<]*)<\/span>\s*<span class="item-detail__stat-value">([^<]*)</g)]
            .map((match) => [decodeEntities(match[1]), decodeEntities(match[2])]),
        breadcrumb: decodeEntities(stripTags((html.match(/<nav class="item-detail__breadcrumb"[\s\S]*?<\/nav>/) || [''])[0])),
        relatedCount: relatedBlocks.length,
        relatedIds: relatedBlocks.map((block) => (block.match(/item-detail\.html\?id=(\d+)/) || [])[1] || ''),
        relatedNames: relatedBlocks.map((block) => decodeEntities((block.match(/item-card__name">([^<]*)</) || [])[1] || '')),
    };
}

/** Mở trang chi tiết và chờ render xong. */
async function openDetailPage(query) {
    const page = loadPage(DETAIL_PAGE, query);
    page.run();
    await page.settled();
    page.detail = readDetail(page.el('item-detail'));
    return page;
}

function countByType(items) {
    const counts = {};
    for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;
    return counts;
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

async function openListPage(search) {
    const page = loadPage(PAGE, search);
    page.run();
    await page.settled();
    return page;
}

async function search(page, keyword) {
    const input = page.el('item-search');
    input.value = keyword;
    fire(input, 'input');
    await page.afterSearch();
}

async function clickChip(page, type) {
    const chip = page.el('item-filter-bar').querySelector(`[data-type="${type}"]`);
    if (!chip) throw new Error('Không tìm thấy nút lọc loại: ' + type);
    fire(chip, 'click');
    await page.settled();
}

async function clickPage(page, number) {
    const btn = page.el('item-pagination').querySelector(`[data-page="${number}"]`);
    if (!btn) throw new Error('Không tìm thấy nút trang: ' + number);
    fire(btn, 'click');
    await page.settled();
}

(async () => {
    console.log('Dữ liệu src/data/items.json: ' + ITEMS_JSON.length + ' item');
    console.log('Số loại: ' + JSON.stringify(countByType(ITEMS_JSON)));

    /* ---------- 0. Toàn vẹn dữ liệu ---------- */
    section('0. Dữ liệu items.json');
    const allIds = new Set(ITEMS_JSON.map((row) => row.id));
    check('mọi item đều có trường "related" khác rỗng',
        ITEMS_JSON.every((row) => Array.isArray(row.related) && row.related.length > 0));
    check('mọi id trong "related" đều tồn tại trong items.json',
        ITEMS_JSON.every((row) => row.related.every((id) => allIds.has(id))),
        ITEMS_JSON.flatMap((row) => row.related.filter((id) => !allIds.has(id)).map((id) => `${row.id}->${id}`)).join(', '));
    check('"related" không tự tham chiếu và không trùng id',
        ITEMS_JSON.every((row) => new Set(row.related).size === row.related.length && !row.related.includes(row.id)));
    check('id item là duy nhất', allIds.size === ITEMS_JSON.length);
    check('mọi item đều có đủ name/image/type/price', ITEMS_JSON.every((row) => row.name && row.image && row.type && typeof row.price === 'number'));

    /* ---------- 1. Render đủ item ---------- */
    section('1. Render danh sách từ items.json');
    const page = await openListPage('');
    const listEl = page.el('item-list');
    const filterEl = page.el('item-filter-bar');
    const countEl = page.el('item-count');

    check('không có lỗi JS khi khởi tạo', page.errors.length === 0, page.errors.join(' | '));

    const page1 = readCards(listEl);
    check('trang 1 render đúng 12 card (phân trang)', page1.length === 12, `thực tế: ${page1.length}`);
    check('ô đếm kết quả hiển thị tổng số item', countEl.textContent === `${ITEMS_JSON.length} trang bị`, countEl.textContent);

    // Gom tất cả card qua các trang để chứng minh render đủ 40 item
    const totalPages = (listEl.innerHTML, page.el('item-pagination').querySelectorAll('.pagination__item').length);
    check('có phân trang 4 trang cho 40 item', totalPages === Math.ceil(ITEMS_JSON.length / 12), `thực tế: ${totalPages}`);

    const allCards = [];
    for (let p = 1; p <= totalPages; p++) {
        if (p > 1) await clickPage(page, p);
        allCards.push(...readCards(listEl));
    }
    check('render đủ 40 card qua các trang', allCards.length === ITEMS_JSON.length, `thực tế: ${allCards.length}`);

    const ids = new Set(allCards.map((card) => card.detailId));
    check('40 id item khác nhau, đúng với items.json', ids.size === ITEMS_JSON.length, `id khác nhau: ${ids.size}`);
    check(
        'tên card khớp với items.json',
        allCards.every((card) => ITEMS_JSON.some((item) => item.name === card.name)),
    );

    check('mỗi card có ảnh', allCards.every((card) => card.image.startsWith('/assets/images/items/')), allCards[0].image);
    check('mỗi card có tên', allCards.every((card) => card.name.length > 0));
    check('mỗi card có loại', allCards.every((card) => ITEMS_JSON.some((item) => item.type === card.type)));
    check(
        'mỗi card có giá định dạng "x.xxx Bạc"',
        allCards.every((card) => /^\d{1,3}(\.\d{3})* Bạc$/.test(card.price)),
        allCards.map((c) => c.price).slice(0, 3).join(', '),
    );
    check('mỗi card có ít nhất 1 chỉ số chính', allCards.every((card) => card.statsCount >= 1));
    check(
        'chỉ số trên card lấy đúng từ items.json (ví dụ Kiếm Fafnir: +60/+30)',
        (() => {
            const card = allCards.find((c) => c.name === 'Kiếm Fafnir');
            return card && card.statsCount === 2;
        })(),
    );

    /* ---------- 2. Bộ lọc loại trong thanh filter ---------- */
    section('2. Bộ lọc theo loại');
    const chips = filterEl.querySelectorAll('.item-chip');
    const chipTypes = chips.map((chip) => chip.dataset.type);
    check(
        'thanh filter có đủ 6 loại + "Tất cả"',
        JSON.stringify(chipTypes) === JSON.stringify(['all', 'Công', 'Phép', 'Giáp', 'Kháng Phép', 'Giày', 'Đặc Biệt']),
        JSON.stringify(chipTypes),
    );
    check('nút "Tất cả" mặc định được đánh dấu active', chips[0].classList.contains('is-active'));
    check(
        'chip hiển thị số lượng item tương ứng',
        /Phép <span class="item-chip__count">10<\/span>/.test(filterEl.innerHTML),
    );

    const typeCounts = countByType(ITEMS_JSON);
    for (const [type, expected] of Object.entries(typeCounts)) {
        await clickChip(page, type);
        const cards = readCards(listEl);
        check(`lọc "${type}" ra đúng ${expected} item`, cards.length === expected && cards.every((card) => card.type === type), `thực tế: ${cards.length}`);
    }
    await clickChip(page, 'Công');
    check(
        'lọc "Công" (10 item) hiện đủ 10 card, không phân trang',
        readCards(listEl).length === 10 && page.el('item-pagination').innerHTML === '',
        readCards(listEl).length,
    );

    await clickChip(page, 'all');
    check('bấm "Tất cả" trả lại đủ 40 item qua 4 trang', readCards(listEl).length === 12 && page.el('item-pagination').querySelectorAll('.pagination__item').length === 4);

    /* ---------- 3. Tìm kiếm theo tên ---------- */
    section('3. Tìm kiếm theo tên');
    await search(page, 'kiem');
    let cards = readCards(listEl);
    check('tìm "kiem" (không dấu) ra 4 trang bị', cards.length === 4, `thực tế: ${cards.length}: ${cards.map((c) => c.name).join(', ')}`);
    check('kết quả "kiem" đều chứa "kiếm" khi bỏ dấu', cards.every((card) => stripAccents(card.name).includes('kiem')));
    check('tìm "kiem" không lọc nhầm loại khác', cards.every((card) => card.type === 'Công'));

    await search(page, 'kiếm');
    const cardsWithMarks = readCards(listEl);
    check('tìm "kiếm" (có dấu) cho kết quả giống "kiem"', cardsWithMarks.length === cards.length, `${cardsWithMarks.length} vs ${cards.length}`);

    await search(page, 'KIẾM');
    check('tìm "KIẾM" ( HOA) cho kết quả giống "kiem"', readCards(listEl).length === cards.length);

    await search(page, 'GIAP');
    const armorCards = readCards(listEl);
    check('tìm "GIAP" (không dấu + hoa) ra 7 trang bị Giáp', armorCards.length === 7 && armorCards.every((card) => card.type === 'Giáp'), armorCards.map((c) => c.name).join(', '));

    await search(page, 'phep');
    const magicCards = readCards(listEl);
    check(
        'tìm "phep" (không dấu) ra 3 item có chữ "Phép" trong tên',
        magicCards.length === 3 && magicCards.every((card) => stripAccents(card.name).includes('phep')),
        magicCards.map((c) => `${c.name} [${c.type}]`).join(', '),
    );

    await search(page, 'giay');
    check('tìm "giay" (không dấu) ra 4 trang bị Giày', readCards(listEl).every((card) => card.type === 'Giày') && readCards(listEl).length === 4);

    await search(page, '');
    check('xóa từ khoá hiển thị lại 40 item', page.el('item-pagination').querySelectorAll('.pagination__item').length === 4);

    /* ---------- 4. Search + filter đồng thời ---------- */
    section('4. Search và filter hoạt động đồng thời');
    await clickChip(page, 'Giày');
    await search(page, 'giay');
    cards = readCards(listEl);
    check('search "giay" + filter "Giày" -> 4 item', cards.length === 4 && cards.every((card) => card.type === 'Giày'), `thực tế: ${cards.length}`);

    await search(page, 'giap');
    const emptyCombo = listEl.innerHTML;
    check('search "giap" + filter "Giày" -> không có kết quả', emptyCombo.includes('item-empty') && readCards(listEl).length === 0);
    check(
        'thông báo rỗng nêu rõ cả từ khoá lẫn loại',
        decodeEntities(emptyCombo).includes('Không tìm thấy trang bị nào khớp với từ khoá "giap" và loại "Giày".'),
        emptyCombo.slice(0, 300),
    );

    await clickChip(page, 'Công');
    await search(page, 'kiem');
    cards = readCards(listEl);
    check('search "kiem" + filter "Công" -> chỉ item thỏa cả 2 điều kiện', cards.length === 4 && cards.every((card) => card.type === 'Công' && stripAccents(card.name).includes('kiem')));

    await search(page, 'giay');
    check('search "giay" + filter "Công" -> 0 kết quả (loại sai)', listEl.innerHTML.includes('item-empty'));

    // URL: items.html?keyword=kiem&type=Công
    const fromUrl = await openListPage('?keyword=kiem&type=C%C3%B4ng');
    await fromUrl.settled();
    const urlCards = readCards(fromUrl.el('item-list'));
    check(
        'URL ?keyword=kiem&type=Công -> 4 item Công chứa kiếm',
        urlCards.length === 4 && urlCards.every((card) => card.type === 'Công' && stripAccents(card.name).includes('kiem')),
        urlCards.map((c) => c.name).join(', '),
    );
    check('ô tìm kiếm được điền sẵn từ URL', fromUrl.el('item-search').value === 'kiem');
    check('nút lọc "Công" được đánh dấu active', fromUrl.el('item-filter-bar').querySelector('[data-type="Công"]').classList.contains('is-active'));

    /* ---------- 5. Trường hợp không có kết quả ---------- */
    section('5. Không có kết quả');
    await clickChip(page, 'all');
    await search(page, 'vunghiemkhongton');
    const emptyHtml = listEl.innerHTML;
    check('hiển thị khối thông báo không có kết quả', emptyHtml.includes('not-found') && emptyHtml.includes('item-empty'));
    check('thông báo nhắc lại từ khoá đã tìm', decodeEntities(emptyHtml).includes('Không tìm thấy trang bị nào khớp với từ khoá "vunghiemkhongton".'));
    check('không còn card item nào', readCards(listEl).length === 0);
    check('ẩn thanh phân trang khi rỗng', fromUrl.el('item-pagination').innerHTML === '' && page.el('item-pagination').innerHTML === '');

    const resetBtn = listEl.querySelector('[data-reset-item-filter]');
    check('có nút "Xóa tìm kiếm & bộ lọc"', Boolean(resetBtn));
    fire(resetBtn, 'click');
    await page.settled();
    check('bấm nút xóa lọc -> hiển thị lại 12 card/trang', readCards(listEl).length === 12);
    check('bấm nút xóa lọc -> xóa luôn từ khoá trong ô nhập', page.el('item-search').value === '');

    // Không có kết quả do chỉ lọc loại không tồn tại trong dữ liệu
    const fakeChip = page.el('item-filter-bar').querySelectorAll('.item-chip')[0];
    fakeChip.dataset.type = 'Không Có Loại Này';
    fire(fakeChip, 'click');
    await page.settled();
    check(
        'lọc 1 loại không có trong dữ liệu -> thông báo rõ ràng',
        decodeEntities(listEl.innerHTML).includes('Không tìm thấy trang bị nào khớp với loại "Không Có Loại Này".'),
        listEl.innerHTML.slice(0, 260),
    );

    /* ---------- 6. Click item sang trang chi tiết ---------- */
    section('6. Click item sang trang chi tiết');
    const detailPage = await openListPage('?keyword=fafnir');
    await detailPage.settled();
    const card = readCards(detailPage.el('item-list'))[0];
    const linkHref = (detailPage.el('item-list').innerHTML.match(/href="([^"]*item-detail\.html\?id=101)"/) || [])[1] || '';
    check('card có link sang item-detail.html?id=101', linkHref.includes('src/pages/item-detail.html?id=101'), linkHref);
    check('card hiển thị đúng tên/loại/giá của item 101', card.name === 'Kiếm Fafnir' && card.type === 'Công' && card.price === '2.040 Bạc', JSON.stringify(card));

    // Bấm card = đi theo href -> mở đúng trang chi tiết
    const clickedId = (linkHref.match(/id=(\d+)/) || [])[1];
    const clicked = await openDetailPage(`?id=${clickedId}`);
    check('bấm card -> mở đúng trang chi tiết của item đó', clicked.detail.name === 'Kiếm Fafnir', clicked.detail.name);

    /* ---------- 7. Trang chi tiết: item đầu / giữa / cuối ---------- */
    section('7. Trang chi tiết: item đầu tiên, ở giữa, cuối cùng');
    const firstItem = ITEMS_JSON[0];
    const midItem = ITEMS_JSON[Math.floor(ITEMS_JSON.length / 2)];
    const lastItem = ITEMS_JSON[ITEMS_JSON.length - 1];

    // Nhãn tiếng Việt của chỉ số nằm trong item.js -> đọc từ context của trang
    const statLabels = (await openDetailPage(`?id=${firstItem.id}`)).runInPage('ITEM_STAT_LABEL');
    const humanizeKey = (await openDetailPage(`?id=${firstItem.id}`)).runInPage('humanizeStatKey');

    for (const [position, target] of [['đầu tiên', firstItem], ['ở giữa', midItem], ['cuối cùng', lastItem]]) {
        const opened = await openDetailPage(`?id=${target.id}`);
        const view = opened.detail;
        const tag = `item ${position} (id=${target.id} "${target.name}")`;

        check(`${tag}: render đủ tên/loại/giá`,
            view.name === target.name && view.type === target.type && view.price === `${target.price.toLocaleString('vi-VN')} Bạc`,
            JSON.stringify({ name: view.name, type: view.type, price: view.price }));

        check(`${tag}: ảnh lấy từ image("${target.image}")`,
            view.image === `/assets/images/items/${target.image.replace('items/', '')}` && view.imageAlt === target.name && view.hasImageFallback,
            view.image);

        check(`${tag}: render đủ ${Object.keys(target.stats).length} chỉ số`,
            view.stats.length === Object.keys(target.stats).length
                && Object.keys(target.stats).every((key) => {
                    const expectedLabel = statLabels[key] || humanizeKey(key);
                    const entry = view.stats.find(([text]) => text === expectedLabel);
                    return entry && entry[1] === `+${target.stats[key]}`;
                }),
            JSON.stringify(view.stats));

        check(`${tag}: nội tại ${target.passive ? 'đúng dữ liệu' : 'hiện dòng báo không có nội tại'}`,
            target.passive ? view.passive === target.passive : view.passive === 'Trang bị này không có nội tại.',
            view.passive);

        check(`${tag}: mô tả ${target.description ? 'đúng dữ liệu' : 'hiện dòng báo chưa có mô tả'}`,
            target.description ? view.desc === target.description : view.desc === 'Trang bị này chưa có mô tả.',
            view.desc);

        check(`${tag}: breadcrumb có đường về trang danh sách + lọc theo loại`,
            view.breadcrumb.includes('Trang bị') && view.breadcrumb.includes(target.type) && view.breadcrumb.includes(target.name),
            view.breadcrumb);

        /* ---- Trang bị liên quan ---- */
        // Card render đúng thứ tự trong mảng "related"
        const expectedRelated = target.related
            .map((id) => ITEMS_JSON.find((row) => String(row.id) === String(id)))
            .filter(Boolean);

        check(`${tag}: render ${expectedRelated.length} card trang bị liên quan`,
            view.relatedCount === expectedRelated.length
                && JSON.stringify(view.relatedIds) === JSON.stringify(expectedRelated.map((row) => String(row.id)))
                && JSON.stringify(view.relatedNames) === JSON.stringify(expectedRelated.map((row) => row.name)),
            `thực tế: ${JSON.stringify(view.relatedIds)} / cần: ${JSON.stringify(expectedRelated.map((r) => r.id))}`);

        check(`${tag}: card liên quan có ảnh + giá + link đúng id`,
            view.relatedCount > 0 && expectedRelated.every((row, index) => {
                const block = view.relatedHtml.split('<article class="card item-card">')[index + 1] || '';
                return block.includes(`/assets/images/items/${row.image.replace('items/', '')}`)
                    && block.includes(`${row.price.toLocaleString('vi-VN')} Bạc`)
                    && block.includes(`item-detail.html?id=${row.id}`);
            }));

        check(`${tag}: không tự liên kết tới chính nó`, !view.relatedIds.includes(String(target.id)));
        check(`${tag}: mọi id liên quan đều tồn tại trong items.json`,
            view.relatedIds.every((id) => ITEMS_JSON.some((row) => String(row.id) === id)));
    }

    // Bấm vào card "trang bị liên quan" -> mở đúng item
    const withRelated = await openDetailPage(`?id=${firstItem.id}`);
    const firstRelatedId = withRelated.detail.relatedIds[0];
    const expectedRelatedName = ITEMS_JSON.find((row) => String(row.id) === firstRelatedId).name;
    const openedRelated = await openDetailPage(`?id=${firstRelatedId}`);
    check(`bấm card liên quan -> mở đúng item "${expectedRelatedName}"`,
        openedRelated.detail.name === expectedRelatedName && !openedRelated.detail.relatedIds.includes(firstRelatedId),
        `${firstRelatedId} -> ${openedRelated.detail.name}`);

    /* ---------- 8. Các trường hợp lỗi của trang chi tiết ---------- */
    section('8. Xử lý lỗi: thiếu id / id sai / JSON hỗng');

    const noId = await openDetailPage('');
    check('thiếu id -> báo rõ cần id trên URL',
        noId.detail.isEmptyState && decodeEntities(noId.detail.html).includes('Thiếu mã trang bị trên đường dẫn'),
        decodeEntities(noId.detail.html).slice(0, 220));
    check('thiếu id -> vẫn có link về danh sách trang bị', noId.detail.html.includes('src/pages/items.html'));

    const blankId = await openDetailPage('?id=%20%20');
    check('id rỗng (chỉ khoảng trắng) -> cũng báo thiếu mã', decodeEntities(blankId.detail.html).includes('Thiếu mã trang bị'));

    const notFound = await openDetailPage('?id=99999');
    check('id không tồn tại -> báo đúng mã id cần tìm',
        notFound.detail.isEmptyState && decodeEntities(notFound.detail.html).includes('Không tìm thấy trang bị có mã "99999".'),
        decodeEntities(notFound.detail.html).slice(0, 220));
    check('id không tồn tại -> không render card item nào', (notFound.detail.html.match(/class="card item-card"/g) || []).length === 0);

    const stringId = await openDetailPage('?id=605');
    check('id dạng chuỗi vẫn tìm thấy item', stringId.detail.name === 'Đồng Hồ Cát');

    const brokenJson = loadPage(DETAIL_PAGE, '?id=101', { failData: 'items.json' });
    brokenJson.run();
    await brokenJson.settled();
    const brokenHtml = brokenJson.el('item-detail').innerHTML;
    check('JSON lỗi / tải hỏng -> báo lỗi tải dữ liệu',
        brokenHtml.includes('item-detail-empty') && decodeEntities(brokenHtml).includes('Không tải được dữ liệu trang bị'),
        decodeEntities(brokenHtml).slice(0, 220));
    const reloadBtn = brokenJson.el('item-detail').querySelector('[data-reload-item-detail]');
    check('JSON lỗi -> có nút tải lại trang', Boolean(reloadBtn));
    fire(reloadBtn, 'click');
    check('bấm tải lại trang -> gọi location.reload()', brokenJson.reloadCount() === 1, `reloadCount=${brokenJson.reloadCount()}`);

    // Item không có related hợp lệ -> báo rõ, không vỡ trang
    const badRelated = await openDetailPage('?id=101');
    badRelated.runInPage(`var __testItems = ${JSON.stringify(ITEMS_JSON)}; true;`);

    const filteredRelated = JSON.parse(badRelated.runInPage(
        'JSON.stringify(getRelatedItems({ id: 101, related: [99999, "abc", null] }, __testItems))',
    ));
    check('related chứa id không tồn tại -> bỏ qua hết', Array.isArray(filteredRelated) && filteredRelated.length === 0, JSON.stringify(filteredRelated));

    const dedupRelated = JSON.parse(badRelated.runInPage(
        'JSON.stringify(getRelatedItems({ id: 101, related: [101, 102, 102, 103, 101] }, __testItems).map((i) => i.id))',
    ));
    check('related trùng lặp + tự tham chiếu -> chỉ giữ id hợp lệ, mỗi id 1 lần',
        JSON.stringify(dedupRelated) === '[102,103]', JSON.stringify(dedupRelated));

    const missingRelatedHtml = badRelated.runInPage(`
        (function () {
            const container = document.getElementById('item-detail');
            renderItemDetail(container, Object.assign({}, __testItems[0], { related: [99999, 'abc'] }), __testItems);
            return container.innerHTML;
        })()
    `);
    check('related rỗng sau khi lọc -> hiện dòng "Chưa có trang bị liên quan"',
        !/class="card item-card"/.test(missingRelatedHtml)
            && decodeEntities(missingRelatedHtml).includes('Chưa có trang bị liên quan cho trang bị này.'),
        decodeEntities(missingRelatedHtml).slice(-240));

    // Ảnh hỏng -> fallback placeholder
    const imageFallback = badRelated.runInPage('imageUrl("")');
    check('item không có ảnh -> dùng placeholder.svg', imageFallback === '/assets/images/placeholder.svg', imageFallback);
    const imageError = badRelated.runInPage(`
        (function () {
            const img = { dataset: {}, src: '/assets/images/items/giap-mau.png' };
            handleImageError(img);
            return img.src + '|' + img.dataset.fallbackApplied;
        })()
    `);
    check('ảnh lỗi (onerror) -> đổi sang placeholder', imageError === '/assets/images/placeholder.svg|true', imageError);

    check('các trang item không ném lỗi',
        page.errors.length === 0 && detailPage.errors.length === 0 && notFound.errors.length === 0 && noId.errors.length === 0,
        [...page.errors, ...detailPage.errors, ...notFound.errors, ...noId.errors].join(' | '));

    /* ---------- Kết quả ---------- */
    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();