/**
 * test-build-share.cjs - Kiểm tra sao chép / chia sẻ hướng dẫn build (HD09).
 *
 * Phủ:
 *   - buildDetailShareUrl() / buildDetailShareText() dựng đúng liên kết + nội dung chia sẻ.
 *   - copyBuildDetailLink() dùng Clipboard API khi có, trả false khi trình duyệt chặn.
 *   - shareBuildDetail() dùng Web Share API, tự lùi về sao chép, báo 'failed' khi bất khả thi.
 *   - Trang chi tiết có nút "Sao chép liên kết" / "Chia sẻ" + vùng trạng thái;
 *     bấm nút cập nhật đúng thông báo.
 *
 * Chạy: node tools/test-build-share.cjs
 */
const { ROOT, loadPage: loadPageShared, fire } = require('./mini-dom.cjs');
const path = require('path');
const fs = require('fs');

const DETAIL_PAGE = 'src/pages/build-detail.html';
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openDetail(search, options) {
    const sp = loadPageShared(Object.assign({ page: DETAIL_PAGE, search }, options));
    sp.run();
    await sp.settled();
    return sp;
}

const inPage = (sp, expr) => sp.runInPage(expr);

(async () => {
    const first = BUILDS_JSON[0];
    const firstHero = HEROES_JSON.find((hero) => String(hero.id) === String(first.heroId));

    /* ---------------- 1. Hàm dựng liên kết + nội dung ---------------- */
    section('1. buildDetailShareUrl() / buildDetailShareText()');

    const page = await openDetail('?id=1');

    const url = inPage(page, `buildDetailShareUrl(${JSON.stringify(first)})`);
    check('liên kết chia sẻ trỏ đúng trang chi tiết build',
        url === `/src/pages/build-detail.html?id=${first.id}`, url);

    const urlEscaped = inPage(page, `buildDetailShareUrl({ id: 'a b&c' })`);
    check('id đặc biệt được encode trong liên kết', urlEscaped === '/src/pages/build-detail.html?id=a%20b%26c', urlEscaped);

    const text = inPage(page, `buildDetailShareText(${JSON.stringify(first)}, ${JSON.stringify(firstHero.name)})`);
    check('nội dung chia sẻ có tên build', text.includes(first.name), text);
    check('nội dung chia sẻ có tên tướng', text.includes(firstHero.name), text);
    check('nội dung chia sẻ có thương hiệu AOV HUB', text.includes('AOV HUB'), text);

    const textNoHero = inPage(page, `buildDetailShareText(${JSON.stringify(first)}, '')`);
    check('thiếu tên tướng vẫn dựng được nội dung', textNoHero.includes(first.name) && !textNoHero.includes(' cho '), textNoHero);

    /* ---------------- 2. copyBuildDetailLink() ---------------- */
    section('2. copyBuildDetailLink()');

    page.ctx.navigator.clipboard = { writeText: async (value) => { page.ctx.__copied = value; } };
    const copied = await page.runInPage(`copyBuildDetailLink(${JSON.stringify(first)})`);
    check('có Clipboard API -> sao chép thành công (true)', copied === true, String(copied));
    check('Clipboard API nhận đúng liên kết', page.ctx.__copied === `/src/pages/build-detail.html?id=${first.id}`, String(page.ctx.__copied));

    const noClipboard = await openDetail('?id=1');
    const failedCopy = await noClipboard.runInPage(`copyBuildDetailLink(${JSON.stringify(first)})`);
    check('không có Clipboard API / execCommand -> sao chép thất bại (false)', failedCopy === false, String(failedCopy));

    /* ---------------- 3. shareBuildDetail() ---------------- */
    section('3. shareBuildDetail()');

    const sharePage = await openDetail('?id=1');
    sharePage.ctx.navigator.share = async (data) => { sharePage.ctx.__share = data; };
    const shared = await sharePage.runInPage(`shareBuildDetail(${JSON.stringify(first)}, ${JSON.stringify(firstHero.name)})`);
    check('có Web Share API -> trả "shared"', shared === 'shared', String(shared));
    check('Web Share API nhận đủ title/text/url', sharePage.ctx.__share && sharePage.ctx.__share.url === `/src/pages/build-detail.html?id=${first.id}`
        && sharePage.ctx.__share.text.includes(first.name), JSON.stringify(sharePage.ctx.__share));

    const cancelPage = await openDetail('?id=1');
    cancelPage.ctx.navigator.share = async () => { throw new Error('người dùng huỷ'); };
    cancelPage.ctx.navigator.clipboard = { writeText: async (value) => { cancelPage.ctx.__copied = value; } };
    const cancelled = await cancelPage.runInPage(`shareBuildDetail(${JSON.stringify(first)}, '')`);
    check('người dùng huỷ chia sẻ -> lùi về sao chép ("copied")', cancelled === 'copied', String(cancelled));
    check('bản sao chép khi huỷ đúng liên kết', cancelPage.ctx.__copied === `/src/pages/build-detail.html?id=${first.id}`, String(cancelPage.ctx.__copied));

    const noWayPage = await openDetail('?id=1');
    const failedShare = await noWayPage.runInPage(`shareBuildDetail(${JSON.stringify(first)}, '')`);
    check('không có cách chia sẻ nào -> trả "failed"', failedShare === 'failed', String(failedShare));

    /* ---------------- 4. UI trang chi tiết ---------------- */
    section('4. UI: nút sao chép / chia sẻ trên trang chi tiết');

    const uiPage = await openDetail('?id=1', { login: 'alice' });
    const container = uiPage.el('build-detail');
    check('có nút "Sao chép liên kết"', container.innerHTML.includes('data-copy-build-link') && container.innerHTML.includes('Sao chép liên kết'));
    check('có nút "Chia sẻ"', container.innerHTML.includes('data-share-build') && container.innerHTML.includes('Chia sẻ'));
    check('có vùng trạng thái chia sẻ', Boolean(container.querySelector('[data-build-share-status]')));

    uiPage.ctx.navigator.clipboard = { writeText: async (value) => { uiPage.ctx.__copied = value; } };
    const copyBtn = container.querySelector('[data-copy-build-link]');
    fire(copyBtn, 'click', uiPage.doc);
    await sleep(10);
    const statusEl = container.querySelector('[data-build-share-status]');
    check('bấm "Sao chép liên kết" -> hiện thông báo thành công', /Đã sao chép/.test(statusEl.textContent), statusEl.textContent);
    check('bấm "Sao chép liên kết" -> sao chép đúng liên kết', uiPage.ctx.__copied === `/src/pages/build-detail.html?id=1`, String(uiPage.ctx.__copied));

    uiPage.ctx.navigator.share = async (data) => { uiPage.ctx.__share = data; };
    const shareBtn = container.querySelector('[data-share-build]');
    fire(shareBtn, 'click', uiPage.doc);
    await sleep(10);
    check('bấm "Chia sẻ" -> hiện thông báo mở hộp thoại', /hộp thoại chia sẻ/.test(statusEl.textContent), statusEl.textContent);

    /* Thất bại -> thông báo lỗi + gắn lớp is-error. */
    const errPage = await openDetail('?id=1', { login: 'alice' });
    const errBtn = errPage.el('build-detail').querySelector('[data-copy-build-link]');
    fire(errBtn, 'click', errPage.doc);
    await sleep(10);
    const errStatus = errPage.el('build-detail').querySelector('[data-build-share-status]');
    check('sao chép thất bại -> thông báo thủ công', /thanh địa chỉ/.test(errStatus.textContent), errStatus.textContent);
    check('sao chép thất bại -> gắn lớp is-error', errStatus.classList.contains('is-error'));

    check('mở trang chi tiết chia sẻ không ném lỗi', uiPage.errors.length === 0, uiPage.errors.join(' | '));

    /* ---------------- Tổng kết ---------------- */
    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
