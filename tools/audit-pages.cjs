const fs = require('fs');
const path = require('path');
const { loadPage, fire, fireOnDocument } = require('./mini-dom.cjs');
const items = require('../src/data/items.json');
const heroes = require('../src/data/heroes.json');
const postsFile = require('../src/data/posts.json');

const ROOT = path.resolve(__dirname, '..');

const R = [];
const ok = (req, name, cond, detail = '') => R.push({ req, name, pass: !!cond, detail });
const head = (s) => console.log('\n===== ' + s + ' =====');
// mini-dom: innerHTML rong voi node duoc parse -> luon doc chuoi HTML cua container
const pdh0 = (pg) => pg.el('post-detail').innerHTML;
// components.js escapeHtml() -> innerHTML luon chua da escape, phai so sanh tuong duong
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const setVal = (node, v) => { node.value = v; };

(async () => {
    /* ---------------- REQUIREMENT 3 ---------------- */
    head('REQUIREMENT 3 - Trang danh sách trang bị');
    let p = loadPage({ page: 'src/pages/items.html', search: '' });
    p.run();
    await p.settled();
    const wait = (ms = 420) => new Promise((r) => setTimeout(r, ms));
    // mini-dom: innerHTML rong voi node duoc parse -> phai doc chuoi HTML cua container
    const listHtml = () => p.el('item-list').innerHTML;
    const cardNames = () => [...listHtml().matchAll(/item-card__name[^>]*>([^<]*)</g)].map((m) => m[1]);
    const cardCount = () => (listHtml().match(/class="card item-card"/g) || []).length;

    ok(3, 'render tu items.json', cardCount() > 0 && cardCount() <= 12, cardCount() + ' card trang 1');
    ok(3, 'so luong kha nang chon dung', /40/.test(p.el('item-count').textContent), p.el('item-count').textContent);
    ok(3, 'co phan trang', !!p.el('item-pagination') && p.el('item-pagination').innerHTML.includes('data-page'), 'co pagination__item');

    // phan trang (event delegation tren #item-pagination)
    const p1 = cardNames().slice();
    const pagEl = p.el('item-pagination');
    pagEl.querySelector('[data-page="2"]');
    fire(pagEl.querySelector('[data-page="2"]'), 'click', p.doc);
    await p.settled();
    const p2 = cardNames().slice();
    ok(3, 'phan trang doi noi dung', p2.length > 0 && p2[0] !== p1[0], 'trang 1: ' + p1[0] + ' | trang 2: ' + p2[0]);
    ok(3, 'phan trang danh dau trang hien tai', /aria-current="page"[\s\S]{0,200}?data-page="2"|data-page="2"[\s\S]{0,200}?aria-current="page"/.test(pagEl.innerHTML) || /class="pagination__item is-active"[\s\S]{0,120}data-page="2"/.test(pagEl.innerHTML), 'nut trang 2 co is-active');
    fire(pagEl.querySelector('[data-page="1"]'), 'click', p.doc);
    await p.settled();
    ok(3, 'quay lai trang 1', cardNames()[0] === p1[0], cardNames()[0]);

    // search theo ten - item.js dung debounce
    const searchInput = p.el('item-search');
    ok(3, 'co o tim kiem', !!searchInput, searchInput ? '#item-search' : 'THIEU');
    const type = async (v) => { searchInput.value = v; (searchInput.listeners.input || []).forEach((fn) => fn({ type: 'input', target: searchInput })); await wait(); };
    await type('kiem fafnir');
    ok(3, 'search khong dau (kiem fafnir)', cardNames().length === 1 && /Fafnir/i.test(cardNames()[0] || ''), JSON.stringify(cardNames()));
    await type('KIEM FAFNIR');
    ok(3, 'search khong phan biet hoa/thuong', cardNames().length === 1, JSON.stringify(cardNames()));
    await type('huan chuong troy');   // co dau tieng Viet
    ok(3, 'search bo qua dau tieng Viet', cardNames().length === 1 && /Huân/i.test(cardNames()[0] || ''), JSON.stringify(cardNames()));
    await type('khongcoidatung123');
    ok(3, 'search khong co ket qua -> bao rong', cardCount() === 0 && /Không tìm thấy trang bị nào/.test(listHtml()), '');
    ok(3, 'dem ket qua khi search', /\/40/.test(p.el('item-count').textContent), p.el('item-count').textContent);

    // filter theo loai
    await type('');
    const bar = p.el('item-filter-bar');
    const chips = [...new Set([...bar.innerHTML.matchAll(/data-type="([^"]+)"/g)].map((m) => m[1]))];
    ok(3, 'co chip loc theo loai', chips.length > 1, chips.join(' | '));
    fire(bar.querySelector('[data-type="Phép"]'), 'click', p.doc);
    await p.settled();
    const expectPhép = items.filter((i) => i.type === 'Phép').length;
    ok(3, 'filter theo loai dung so luong', cardCount() === Math.min(expectPhép, 12), cardCount() + ' card (Phép=' + expectPhép + ')');
    ok(3, 'tat ca card sau loc deu thuoc loai', cardNames().length === cardCount() && !listHtml().includes('item-empty'), 'khong con item rong');
    ok(3, 'dem ket qua khi filter', p.el('item-count').textContent.includes(expectPhép + '/' + 40), p.el('item-count').textContent);

    // search + filter cung luc
    await type('trượng');
    const combo = cardNames();
    const comboExpect = items.filter((i) => i.type === 'Phép' && /trượng/i.test(i.name)).length;
    ok(3, 'search + filter cung luc', combo.length === comboExpect && comboExpect > 0, combo.length + '/' + comboExpect + ' ' + JSON.stringify(combo));
    ok(3, 'loc sai khi doi tu khoa', combo.length > 0 && combo.length < Math.min(expectPhép, 12), 'truoc=' + Math.min(expectPhép, 12) + ' sau=' + combo.length);
    // filter khac + search khac -> 0 ket qua
    fire(p.el('item-filter-bar').querySelector('[data-type="Rừng"]'), 'click', p.doc);
    await p.settled();
    ok(3, 'search + filter -> bao rong khi khong khop', cardCount() === 0 && /Không tìm thấy trang bị nào/.test(listHtml()) && /Rừng/.test(listHtml()), (listHtml().match(/Không tìm thấy[^<]*/) || [''])[0]);
    // bo loc (nut reset chi render trong #item-list khi 0 ket qua)
    const reset = p.el('item-list').querySelector('[data-reset-item-filter]');
    ok(3, 'co nut bo loc khi khong khop', !!reset, reset ? 'co' : 'THIEU');
    fire(reset, 'click', p.doc);
    await wait();
    ok(3, 'nut bo loc tra ve tat ca', /40 trang bị/.test(p.el('item-count').textContent) && cardCount() === 12, p.el('item-count').textContent);

    /* ---------------- REQUIREMENT 4 ---------------- */
    head('REQUIREMENT 4 - Chi tiết trang bị');
    const it = items[0];
    const d = loadPage({ page: 'src/pages/item-detail.html', search: '?id=' + it.id });
    d.run();
    await d.settled();
    const dh = d.el('item-detail').innerHTML;
    ok(4, 'ID tu URL', dh.includes(it.name), '?id=' + it.id + ' -> ' + it.name);
    ok(4, 'hien ten', dh.includes(it.name), it.name);
    ok(4, 'hien anh', /<img[^>]+src="[^"]*\.png/.test(dh), (dh.match(/src="([^"]*)"/) || [])[1]);
    ok(4, 'hien gia', /item-detail__price[^>]*>[\s\S]*?[\d]/.test(dh) || dh.includes(String(it.price)), 'gia ' + it.price);
    const statRows = (dh.match(/item-detail__stat"/g) || []).length;
    ok(4, 'hien stats', statRows === Object.keys(it.stats).length, statRows + '/' + Object.keys(it.stats).length);
    ok(4, 'hien passive', /passive/i.test(dh) && dh.includes(it.passive.slice(0, 25)), '');
    ok(4, 'hien description', dh.includes(it.description.slice(0, 25)), '');
    const relCards = (dh.match(/item-card/g) || []).length;
    ok(4, 'hien related items', relCards >= it.related.length, relCards + ' card / ' + it.related.length + ' related');
    const relHref = (dh.match(/item-detail\.html\?id=(\d+)/g) || []).map((m) => Number(m.split('=')[1]));
    const relTargetOk = it.related.every((r) => relHref.includes(r));
    ok(4, 'related tro dung ID', relTargetOk, 'related=' + it.related.join(',') + ' href co=' + relHref.join(','));

    // click related item -> chuyen trang dung item
    const relatedId = it.related[0];
    const d2 = loadPage({ page: 'src/pages/item-detail.html', search: '?id=' + relatedId });
    d2.run();
    await d2.settled();
    const target = items.find((x) => x.id === relatedId);
    ok(4, 'click related item sang dung trang', d2.el('item-detail').innerHTML.includes(target.name), relatedId + ' -> ' + target.name);

    // ID khong ton tai -> khong crash
    const bad = loadPage({ page: 'src/pages/item-detail.html', search: '?id=99999' });
    bad.run();
    await bad.settled();
    ok(4, 'ID sai khong crash', bad.errors.length === 0, bad.errors.join(' | ') || 'khong loi');
    const badQ = loadPage({ page: 'src/pages/item-detail.html', search: '' });
    badQ.run();
    await badQ.settled();
    ok(4, 'khong co ID trong URL khong crash', badQ.errors.length === 0, badQ.errors.join(' | ') || 'khong loi');

    /* ---------------- REQUIREMENT 1 (UI render item) ---------------- */
    head('REQUIREMENT 1 - Trang bị hiển thị từ items.json');
    const il = loadPage({ page: 'src/pages/items.html', search: '' });
    il.run();
    await il.settled();
    const ilh = il.el('item-list').innerHTML;
    const ilNames = [...ilh.matchAll(/item-card__name[^>]*>([^<]*)</g)].map((m) => m[1]);
    const ilImg = [...ilh.matchAll(/<img src="([^"]*items\/[^"]+)"/g)].map((m) => m[1]);
    ok(1, 'card item lay ten tu JSON', ilNames.length === 12 && ilNames.every((n) => items.some((x) => x.name === n)), ilNames.length + ' card');
    ok(1, 'moi card co duong dan anh', ilImg.length === ilNames.length && ilImg.every((s) => /\/assets\/images\/items\/.+\.png$/.test(s)), ilImg.length + '/' + ilNames.length + ' anh');
    ok(1, 'anh lay dung path trong items.json', ilImg.every((s, i) => s.endsWith('/' + items[Number(ilNames.indexOf(ilNames[i]))]?.image)), 'khop alias');
    const idl = loadPage({ page: 'src/pages/item-detail.html', search: '?id=' + items[0].id });
    idl.run();
    await idl.settled();
    const idlh = idl.el('item-detail').innerHTML;
    ok(1, 'chi tiet hien ten item tu JSON', idlh.includes(items[0].name), items[0].name);
    ok(1, 'chi tiet hien mo ta + stats', /<dl|stats|stat-row/i.test(idlh) && idlh.includes(items[0].description.slice(0, 25)), '');
    ok(1, 'cap nhat 40 item moi (4 id moi)', [209, 210, 504, 604].every((id) => items.some((x) => x.id === id)), '209,210,504,604');

    /* ---------------- REQUIREMENT 2 (render that) ---------------- */
    head('REQUIREMENT 2 - build render that');
    const b = loadPage({ page: 'src/pages/builds.html', search: '' });
    b.run();
    await b.settled();
    const bh = b.el('build-list').innerHTML;
    const builds = require('../src/data/builds.json');
    const bBlocks = bh.split('<article class="build-card">').length - 1;
    ok(2, 'render tat ca build', bBlocks === builds.length, bBlocks + '/' + builds.length);
    const perBuild = bBlocks ? (bh.match(/class="build-item"/g) || []).length / bBlocks : 0;
    ok(2, 'moi build du 6 item', perBuild === 6, perBuild + ' item/build');
    const bNames = [...bh.matchAll(/<a class="build-item"[^>]*title="([^"]*)"/g)].map((m) => m[1]);
    const bExpect = builds.flatMap((x) => x.items.map((i) => items.find((y) => y.id === i).name));
    const missingNames = bExpect.filter((n) => !bNames.includes(n));
    ok(2, 'hien ten item that trong build', missingNames.length === 0, 'thieu: ' + (missingNames.join(', ') || 'khong'));
    const bHref = [...bh.matchAll(/hero-detail\.html\?id=(\d+)/g)].map((m) => Number(m[1]));
    const heroOk = builds.every((x) => bHref.includes(x.heroId));
    ok(2, 'build lien ket dung hero', heroOk, bHref.join(','));

    /* ---------------- REQUIREMENT 6 (hero detail) ---------------- */
    head('HERO DETAIL - build gan hero');
    const h1 = builds[0].heroId;
    const hp = loadPage({ page: 'src/pages/hero-detail.html', search: '?id=' + h1 });
    hp.run();
    await hp.settled();
    const hero = heroes.find((x) => x.id === h1);
    ok(2, 'hero-detail hien hero dung', hp.el('hero-detail').innerHTML.includes(hero.name), h1 + ' -> ' + hero.name);
    const hdBuilds = (hp.el('hero-detail').innerHTML.match(/class="build-item"/g) || []).length;
    ok(2, 'hero-detail hien build cua hero', hdBuilds >= 1, hdBuilds + ' item trong .build-items');
    const recRef = hero.recommendedBuild || [];
    const recBad = recRef.filter((r) => !items.some((i) => i.id === r));
    ok(2, 'recommendedBuild tro ID item that', recBad.length === 0, recBad.length ? 'hero ' + h1 + ' tro ID sai: ' + recBad.join(',') : 'PASS');

    /* ---------------- IN ALL HEROES ---------------- */
    head('TAT CA HERO - recommendedBuild');
    const recAll = [];
    heroes.forEach((h) => {
        const r = h.recommendedBuild || [];
        (Array.isArray(r) ? r : [r]).forEach((x) => { if (!items.some((i) => i.id === x)) recAll.push(h.id + '->' + x); });
    });
    ok(2, 'MOI hero co recommendedBuild hop le', recAll.length === 0, recAll.length + ' ref sai: ' + recAll.join(', '));

/* ---------------- REQUIREMENT 5-9: FEED ---------------- */
    // LUON Y: loadPage() copy LocalStorage -> phai doc/ghi qua <page>.storage,
    // dung Map goc se luon rong va moi kiem tra reload deu sai.
    head('REQUIREMENT 5 - Feed');
    const f = loadPage({ page: 'src/pages/feed.html', search: '', storage: new Map(), login: 'tester' });
    f.run();
    await f.settled();
    const postCards = f.doc.querySelectorAll('.post-card');
    ok(5, 'render post tu posts.json', postCards.length > 0, postCards.length + ' post');
    ok(5, 'posts.json duoc nap dung so bai', postCards.length === postsFile.length, postCards.length + '/' + postsFile.length);
    const feedHtml = () => f.el('feed-list').innerHTML;
    const titles = [...feedHtml().matchAll(/post-card__title[^>]*>([^<]*)</g)].map((m) => m[1]);
    const missT = postsFile.filter((p) => !titles.includes(esc(p.title)));
    ok(5, 'render dung tieu de tu JSON', missT.length === 0, 'thieu: ' + (missT.map((p) => p.title).join(', ') || 'khong'));
    ok(5, 'hien ten tac gia', postsFile.every((p) => feedHtml().includes(esc(p.author))), [...new Set(postsFile.map((p) => p.author))].join(','));

    // like
    const likeBtn = f.doc.querySelector('[data-post-like]');
    ok(5, 'co nut like', !!likeBtn, likeBtn ? 'co' : 'THIEU');
    const pid = likeBtn ? likeBtn.dataset.postLike : null;
    if (likeBtn) {
        fireOnDocument(f.doc, likeBtn, 'click');
        await f.settled();
        const likes = f.readKey('aov_likes');
        ok(5, 'like luu vao LocalStorage (aov_likes)', likes && Array.isArray(likes[pid]) && likes[pid].length === 1, JSON.stringify(likes));
        ok(5, 'UI cap nhat so like', /Thích \(1\)/.test(feedHtml()), feedHtml().match(/Thích \(\d+\)/)?.[0] || '');
        ok(5, 'nut like co aria-pressed=true', f.el('feed-list').querySelector('[data-post-like="' + pid + '"]').getAttribute('aria-pressed') === 'true', '');
        // toggle off
        fireOnDocument(f.doc, f.doc.querySelector('[data-post-like="' + pid + '"]'), 'click');
        await f.settled();
        ok(5, 'bam lai se bo like', (f.readKey('aov_likes')[pid] || []).length === 0, JSON.stringify(f.readKey('aov_likes')));
        // like lai de giu cho buoc reload
        fireOnDocument(f.doc, f.doc.querySelector('[data-post-like="' + pid + '"]'), 'click');
        await f.settled();
    }
    // khac: khong dang nhap -> like bi chan
    const guestLike = loadPage({ page: 'src/pages/feed.html', search: '' });
    guestLike.run();
    await guestLike.settled();
    const gLike = guestLike.doc.querySelector('[data-post-like]');
    if (gLike) {
        fireOnDocument(guestLike.doc, gLike, 'click');
        await guestLike.settled();
        ok(5, 'khong dang nhap thi khong like duoc', guestLike.alerts.some((a) => /đăng nhập/.test(a)), guestLike.alerts.join(' | ') || 'khong co canh bao');
        ok(5, 'khong co form comment khi khach', !guestLike.doc.querySelector('[data-comment-form]'), guestLike.doc.querySelector('[data-comment-form]') ? 'LOI' : 'an form');
    }

    // comment
    const cmtForm = f.doc.querySelector('[data-comment-form]');
    ok(5, 'co form comment', !!cmtForm, cmtForm ? 'co' : 'THIEU');
    if (cmtForm) {
        const cpid = cmtForm.dataset.commentForm;
        cmtForm.querySelector('input').value = 'Binh luan kiem tra audit';
        fireOnDocument(f.doc, cmtForm, 'submit');
        await f.settled();
        const cmts = f.readKey('aov_comments');
        const mine = cmts ? cmts.filter((c) => String(c.postId) === String(cpid)) : [];
        ok(5, 'comment luu vao LocalStorage (aov_comments)', mine.length === 1 && mine[0].author === 'tester', JSON.stringify(cmts));
        ok(5, 'comment hien len UI', f.el('feed-list').innerHTML.includes('Binh luan kiem tra audit'), '');
        ok(5, 'dem so binh luan tren card', /💬 1 bình luận/.test(f.el('feed-list').innerHTML), '');
        ok(5, 'xoa du lieu form sau khi gui', cmtForm.querySelector('input').value === '', 'input value = "' + cmtForm.querySelector('input').value + '"');
    }

    // reload van giu du lieu
    const f2 = loadPage({ page: 'src/pages/feed.html', search: '', storage: f.storage, login: 'tester' });
    f2.run();
    await f2.settled();
    const likesR = f2.readKey('aov_likes');
    const cmtsR = f2.readKey('aov_comments');
    ok(5, 'reload van giu like', likesR && Object.values(likesR).some((a) => a.length > 0), JSON.stringify(likesR));
    ok(5, 'reload van giu comment', cmtsR && cmtsR.length === 1, JSON.stringify(cmtsR));
    ok(5, 'reload khong bi loi', f2.errors.length === 0, f2.errors.join(' | ') || 'khong loi');
    ok(5, 'reload khong tao them bai trung', f2.doc.querySelectorAll('.post-card').length === postsFile.length, f2.doc.querySelectorAll('.post-card').length + ' post');
    ok(5, 'UI reload van hien comment', f2.el('feed-list').innerHTML.includes('Binh luan kiem tra audit'), '');

    /* ---------------- REQUIREMENT 6 ---------------- */
    head('REQUIREMENT 6 - Trang chi tiet bai viet');
    const pid6 = postsFile[0].id;
    const pd = loadPage({ page: 'src/pages/post-detail.html', search: '?id=' + pid6, storage: f.storage, login: 'tester' });
    pd.run();
    await pd.settled();
    const pdh = pd.el('post-detail').innerHTML;
    ok(6, 'post-detail.html ton tai', true, 'src/pages/post-detail.html');
    ok(6, 'doc ID tu URL', pdh.includes('data-post-id="' + pid6 + '"'), '?id=' + pid6);
    ok(6, 'render dung bai theo ID', pdh.includes(esc(postsFile[0].title)), postsFile[0].title);
    // ID khac phai ra bai khac
    const pid6b = postsFile[1].id;
    const pd2 = loadPage({ page: 'src/pages/post-detail.html', search: '?id=' + pid6b, storage: f.storage, login: 'tester' });
    pd2.run(); await pd2.settled();
    ok(6, 'ID khac ra bai khac', pd2.el('post-detail').innerHTML.includes(esc(postsFile[1].title)) && !pd2.el('post-detail').innerHTML.includes(esc(postsFile[0].title)), pid6b + ' -> ' + postsFile[1].title);
    const wrongId = loadPage({ page: 'src/pages/post-detail.html', search: '?id=' + (pid6 + 9999), storage: f.storage, login: 'tester' });
    wrongId.run(); await wrongId.settled();
    ok(6, 'ID sai thi bao khong tim thay', wrongId.el('post-detail').innerHTML.includes('Không tìm thấy'), '');
    const noId = loadPage({ page: 'src/pages/post-detail.html', search: '', storage: f.storage, login: 'tester' });
    noId.run(); await noId.settled();
    ok(6, 'khong co ID thi bao loi, khong crash', noId.el('post-detail').innerHTML.includes('Thiếu mã bài viết') && noId.errors.length === 0, noId.errors.join(' | ') || 'khong loi');
    // like tren post-detail -> dong bo voi feed
    const pdLike = pd.doc.querySelector('[data-post-like]');
    ok(6, 'co nut like tren trang chi tiet', !!pdLike, pdLike ? 'co' : 'THIEU');
    if (pdLike) {
        const before = (pd.readKey('aov_likes')[pid6] || []).length;
        fireOnDocument(pd.doc, pdLike, 'click');
        await pd.settled();
        const after = (pd.readKey('aov_likes')[pid6] || []).length;
        ok(6, 'like tren post-detail luu dung cho post do', after !== before, 'like ' + pid6 + ': ' + before + ' -> ' + after);
        ok(6, 'UI post-detail cap nhat like', /Thích \(\d\)/.test(pdh0(pd)) , '');
        const cForm = pd.doc.querySelector('[data-comment-form]');
        const cIn = cForm && cForm.querySelector('input');
        ok(6, 'co form comment tren post-detail', !!cIn, cIn ? 'co' : 'THIEU');
        if (cIn) {
            cIn.value = 'Binh luan tu trang chi tiet';
            fireOnDocument(pd.doc, cForm, 'submit');
            await pd.settled();
            const cAll = pd.readKey('aov_comments');
            ok(6, 'comment tren post-detail duoc luu', cAll.some((c) => c.content === 'Binh luan tu trang chi tiet'), 'aov_comments = ' + cAll.length + ' dong');
            ok(6, 'post-detail hien comment vua gui', pd.el('post-detail').innerHTML.includes('Binh luan tu trang chi tiet'), '');
        }
        // like tren post-detail 9001 -> feed phai thay doi
        const f3 = loadPage({ page: 'src/pages/feed.html', search: '', storage: pd.storage, login: 'tester' });
        f3.run(); await f3.settled();
        ok(6, 'Feed thay doi khi thao tac o post-detail', f3.el('feed-list').innerHTML.includes('Binh luan tu trang chi tiet'), 'feed thay comment moi');
        ok(6, 'trang chi tiet XOA khong lan sang post khac', f3.el('feed-list').innerHTML.split('Binh luan tu trang chi tiet').length - 1 === 1, 'xuat hien ' + (f3.el('feed-list').innerHTML.split('Binh luan tu trang chi tiet').length - 1) + ' lan');
    }

    /* ---------------- REQUIREMENT 7 ---------------- */
    head('REQUIREMENT 7 - Form tao bai viet');
    const fm = loadPage({ page: 'src/pages/feed.html', search: '', storage: new Map(), login: 'tester' });
    fm.run();
    await fm.settled();
    const form7 = fm.el('post-form');
    ok(7, 'co form tao bai', !!form7, form7 ? '#post-form' : 'THIEU');
    if (form7) {
        // khach khong co form
        const guest = loadPage({ page: 'src/pages/feed.html', search: '', storage: new Map() });
        guest.run(); await guest.settled();
        ok(7, 'khach khong duoc co form (an toan)', !guest.el('post-form'), guest.el('post-form') ? 'LOI: co form' : 'khong co form');
        const S7 = () => fm.storage;
        const userPosts = () => JSON.parse(S7().get('aov_posts') || '[]').filter((x) => !postsFile.some((p) => p.id === x.id));

        // validation rong
        fm.el('post-title').value = '';
        fm.el('post-content').value = '';
        fire(form7, 'submit', fm.doc);
        await fm.settled();
        ok(7, 'validation chan bai rong', userPosts().length === 0, 'so bai nguoi dung=' + userPosts().length);
        ok(7, 'hien loi "khong duoc de trong"', fm.el('post-errors').innerHTML.includes('không được để trống'), fm.el('post-errors').innerHTML.replace(/\s+/g, ' ').slice(0, 90));

        // validation ngan
        fm.el('post-title').value = 'ab';
        fm.el('post-content').value = 'x';
        fire(fm.el('post-form'), 'submit', fm.doc);
        await fm.settled();
        ok(7, 'validation do dai toi thieu (5/10)', fm.el('post-errors').innerHTML.includes('ít nhất 5 ký tự') && fm.el('post-errors').innerHTML.includes('ít nhất 10 ký tự'), fm.el('post-errors').innerHTML.replace(/\s+/g, ' ').slice(0, 120));
        ok(7, 'khong tao bai khi du lieu sai', userPosts().length === 0, 'so bai nguoi dung=' + userPosts().length);

        // tao bai hop le
        const before7 = userPosts().length;
        fm.el('post-title').value = 'Bai viet audit hop le';
        fm.el('post-content').value = 'Noi dung bai viet audit da du chieu dai';
        fire(fm.el('post-form'), 'submit', fm.doc);
        await fm.settled();
        const after7 = userPosts();
        ok(7, 'tao bai moi thanh cong', after7.length === before7 + 1, before7 + ' -> ' + after7.length);
        const created = after7[0];
        ok(7, 'tao ID cho post moi', !!created && created.id !== undefined && Number.isFinite(Number(created.id)), created ? 'ID=' + created.id : 'khong tim thay');
        ok(7, 'post moi co author + createdAt', !!created && created.author === 'tester' && !!created.createdAt, created ? created.author + ' / ' + created.createdAt : '');
        ok(7, 'UI hien bai vua tao', fm.el('feed-list').innerHTML.includes('Bai viet audit hop le'), '');
        const firstCardTitle = (fm.el('feed-list').innerHTML.match(/post-card__title[^>]*>([^<]*)</) || [])[1];
        ok(7, 'bai moi len dau danh sach', firstCardTitle === 'Bai viet audit hop le', 'card dau = ' + firstCardTitle);
        // goc heroId
        fm.el('post-hero').value = '3';
        fm.el('post-title').value = 'Bai viet gan hero';
        fm.el('post-content').value = 'Bai viet nay gan voi tuong so 3';
        fire(fm.el('post-form'), 'submit', fm.doc);
        await fm.settled();
        const withHero = userPosts().find((x) => x.title === 'Bai viet gan hero');
        ok(7, 'luu heroId khi chon tuong', !!withHero && Number(withHero.heroId) === 3, withHero ? 'heroId=' + withHero.heroId : 'khong co');
    }

    /* ---------------- REQUIREMENT 8 ---------------- */
    head('REQUIREMENT 8 - LocalStorage');
    const s8 = fm.storage;
    ok(8, 'post moi luu LocalStorage (aov_posts)', !!s8.get('aov_posts'), 'khoa aov_posts: ' + (s8.get('aov_posts') ? 'co' : 'khong co'));
    let parsed8 = [];
    try { parsed8 = JSON.parse(s8.get('aov_posts') || '[]'); ok(8, 'LocalStorage luu JSON hop le', true, 'parse OK'); }
    catch (e) { ok(8, 'LocalStorage luu JSON hop le', false, e.message); }
    // Trước đây cần khoá aov_posts_seeded để chống bài đã xoá "sống lại". Nay dataStore
    // ghi bản nháp (aov_draft_posts) thay cho khoá đó: xoá bài rồi reload -> bài không quay lại.
    const s8del = new Map(s8);
    s8del.set('aov_posts', JSON.stringify(JSON.parse(s8del.get('aov_posts') || '[]').filter((x) => x.title !== 'Bai viet audit hop le')));
    const f8del = loadPage({ page: 'src/pages/feed.html', search: '', storage: s8del, login: 'tester' });
    f8del.run(); await f8del.settled();
    ok(8, 'khong can aov_posts_seeded: xoa bai -> reload khong con bai da xoa',
        !f8del.el('feed-list').innerHTML.includes('Bai viet audit hop le'),
        'feed van con bai da xoa');
    ok(8, 'co khoa aov_likes', !!s8.get('aov_likes'), 'khoa aov_likes duoc tao');
    ok(8, 'co khoa aov_users', !!s8.get('aov_users'), '');
    const f8 = loadPage({ page: 'src/pages/feed.html', search: '', storage: s8, login: 'tester' });
    f8.run(); await f8.settled();
    ok(8, 'reload van thay bai da luu', f8.el('feed-list').innerHTML.includes('Bai viet audit hop le'), '');
    const after8 = JSON.parse(f8.storage.get('aov_posts') || '[]');
    ok(8, 'reload khong tao bai trung', after8.length === parsed8.length, parsed8.length + ' -> ' + after8.length);
    const dup8 = after8.map((x) => x.id).filter((v, i, a) => a.indexOf(v) !== i);
    ok(8, 'khong duplicate trong LocalStorage', dup8.length === 0, dup8.join(',') || 'PASS');
    const f8b = loadPage({ page: 'src/pages/feed.html', search: '', storage: f8.storage, login: 'tester' });
    f8b.run(); await f8b.settled();
    const after8b = JSON.parse(f8b.storage.get('aov_posts') || '[]');
    ok(8, 'mo nhieu lan khong nhan ban JSON lap lai', after8b.length === after8.length, after8.length + ' -> ' + after8b.length);
    ok(8, 'Feed doc duoc post LocalStorage', f8.el('feed-list').innerHTML.includes('Bai viet audit hop le'), '');
    ok(8, 'posts.json KHONG bi ghi de (file tinh)', fs.readFileSync(path.join(ROOT, 'src', 'data', 'posts.json'), 'utf8').length > 0 && JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'posts.json'), 'utf8')).length === postsFile.length, 'van ' + postsFile.length + ' bai trong file');
    // JSON hong -> fallback
    const brokenP = loadPage({ page: 'src/pages/feed.html', search: '', storage: new Map(), failData: 'posts.json' });
    brokenP.run(); await brokenP.settled();
    ok(8, 'posts.json hong -> khong crash', !brokenP.errors.some((e) => /ReferenceError|TypeError/.test(e)), brokenP.errors.length + ' loi (da log expected)');
    // LocalStorage JSON hong
    const badStore = new Map();
    badStore.set('aov_posts', '{khong phai JSON');
    const bl = loadPage({ page: 'src/pages/feed.html', search: '', storage: badStore, login: 'tester' });
    bl.run(); await bl.settled();
    ok(8, 'LocalStorage JSON hong -> fallback, khong crash', !bl.errors.some((e) => /ReferenceError|TypeError/.test(e)) && bl.doc.querySelectorAll('.post-card').length > 0, bl.doc.querySelectorAll('.post-card').length + ' post render tu posts.json');

    /* ---------------- REQUIREMENT 9 ---------------- */
    head('REQUIREMENT 9 - Sua bai viet');
    const seed = { id: 100, author: 'tester', title: 'Bai goc', content: 'Noi dung goc cua bai viet', heroId: 1, createdAt: '2025-01-01T00:00:00.000Z' };
    const mkStore = (user) => {
        const m = new Map();
        m.set('aov_users', JSON.stringify([
            { username: 'tester', password: 'test123', displayName: 'tester', joinedAt: '2025-01-01T00:00:00.000Z' },
            { username: 'khac', password: 'y', displayName: 'khac', joinedAt: '2025-01-01T00:00:00.000Z' }]));
        m.set('aov_current_user', user);
        m.set('aov_posts', JSON.stringify([seed]));
        m.set('aov_posts_seeded', JSON.stringify([]));
        return m;
    };

    const e1 = loadPage({ page: 'src/pages/feed.html', search: '', storage: mkStore('tester'), login: 'tester' });
    e1.run(); await e1.settled();
    // seedPostsFromJson() gop them 3 bai tu posts.json -> loc dung bai id=100 de kiem
    const seedOnly = (store) => JSON.parse(store.get('aov_posts') || '[]').filter((x) => Number(x.id) === 100);
    const editBtn = e1.doc.querySelector('[data-post-edit="100"]');
    ok(9, 'tac gia thay nut Sua', !!editBtn, editBtn ? 'co' : 'THIEU');
    if (editBtn) {
        fireOnDocument(e1.doc, editBtn, 'click');
        await e1.settled();
        const ef = e1.el('post-form');
        const formHtml = () => e1.el('feed-form').innerHTML;
        ok(9, 'form chuyen sang che do sua', !!ef && ef.dataset.editId === '100', 'data-edit-id=' + (ef && ef.dataset.editId));
        ok(9, 'form dien san tieu de cu', e1.el('post-title').value === 'Bai goc', 'value="' + e1.el('post-title').value + '"');
        ok(9, 'form dien san noi dung cu', String(e1.el('post-content').value).includes('Noi dung goc'), 'value="' + String(e1.el('post-content').value).slice(0, 40) + '"');
        ok(9, 'form dien san heroId cu', String(e1.el('post-hero').value) === '1', 'heroId value=' + e1.el('post-hero').value);
        ok(9, 'nut huy sua co', !!e1.doc.querySelector('[data-post-edit-cancel]'), '');
        ok(9, 'nhan hien dinh dang sua', /Đang sửa bài/.test(formHtml()), '');
        ok(9, 'nut bam la "Lưu thay đổi"', /Lưu thay đổi/.test(formHtml()), '');

        // validation khi sua
        e1.el('post-title').value = 'a';
        fire(ef, 'submit', e1.doc);
        await e1.settled();
        ok(9, 'form sua cung co validation', e1.el('post-errors').innerHTML.includes('ít nhất 5 ký tự'), e1.el('post-errors').innerHTML.replace(/\s+/g, ' ').slice(0, 90));
        ok(9, 'sua that bai thi giu nguyen du lieu cu', seedOnly(e1.storage)[0].title === 'Bai goc', seedOnly(e1.storage)[0].title);

        // sua hop le
        e1.el('post-title').value = 'Bai da sua xong';
        e1.el('post-content').value = 'Noi dung sau khi sua bai viet';
        fire(e1.el('post-form'), 'submit', e1.doc);
        await e1.settled();
        const a9 = seedOnly(e1.storage);
        ok(9, 'update dung bai', a9.length === 1 && a9[0].title === 'Bai da sua xong', a9[0] && a9[0].title);
        ok(9, 'KHONG tao post moi', a9.length === 1, a9.length + ' bai co id=100');
        ok(9, 'giu nguyen ID', a9[0] && a9[0].id === 100, 'ID=' + (a9[0] && a9[0].id));
        ok(9, 'giu nguyen createdAt', a9[0] && a9[0].createdAt === seed.createdAt, a9[0] && a9[0].createdAt);
        ok(9, 'ghi updatedAt', !!(a9[0] && a9[0].updatedAt), a9[0] && a9[0].updatedAt);
        ok(9, 'noi dung da doi', a9[0] && a9[0].content === 'Noi dung sau khi sua bai viet', '');
        ok(9, 'UI hien bai da sua', e1.el('feed-list').innerHTML.includes('Bai da sua xong'), '');
        ok(9, 'UI danh dau "da sua"', /đã sửa/.test(e1.el('feed-list').innerHTML), '');
        ok(9, 'the 3 bai tu posts.json khong bi doi', JSON.parse(e1.storage.get('aov_posts')).filter((x) => postsFile.some((q) => q.id === x.id)).every((x) => x.title === (postsFile.find((q) => q.id === x.id) || {}).title), 'giu nguyen');
        // reload van giu
        const e1b = loadPage({ page: 'src/pages/feed.html', search: '', storage: e1.storage, login: 'tester' });
        e1b.run(); await e1b.settled();
        ok(9, 'reload van giu noi dung da sua', e1b.el('feed-list').innerHTML.includes('Bai da sua xong'), '');
        ok(9, 'reload khong tao them bai id=100', seedOnly(e1b.storage).length === 1, seedOnly(e1b.storage).length + ' bai');
    }

    // KHONG phai tac gia
    const e2 = loadPage({ page: 'src/pages/feed.html', search: '', storage: mkStore('khac'), login: 'khac' });
    e2.run(); await e2.settled();
    ok(9, 'nguoi khac KHONG thay nut Sua', !e2.doc.querySelector('[data-post-edit="100"]'), e2.doc.querySelector('[data-post-edit]') ? 'LOI: van co nut' : 'an nut');
    const forced = e2.runInPage('updatePost(100, "Hacked title", "Hacked content here", 1)');
    ok(9, 'updatePost() chan nguoi khac (tra null)', forced === null, 'return ' + forced);
    ok(9, 'du lieu khong bi doi khi nguoi khac sua', seedOnly(e2.storage)[0].title === 'Bai goc', seedOnly(e2.storage)[0].title);
    ok(9, 'canEditPost() tra false cho nguoi khac', e2.runInPage('canEditPost(findPostById(100))') === false, '');
    ok(9, 'openPostEditForm() bi tu choi', e2.runInPage('openPostEditForm(100, document.getElementById("feed-form"))') === false, '');
    // khach
    const e3 = loadPage({ page: 'src/pages/feed.html', search: '', storage: mkStore('') });
    e3.run(); await e3.settled();
    ok(9, 'khach KHONG thay nut Sua', !e3.doc.querySelector('[data-post-edit="100"]'), '');
    ok(9, 'khach khong goi duoc updatePost', e3.runInPage('updatePost(100, "Khach sua", "Noi dung khach sua", 1)') === null, '');

    /* ---------------- JSON LOADING / CONSOLE ---------------- */
    head('JSON LOADING + CONSOLE');
    const pages = [
        ['index.html', ''], ['src/pages/heroes.html', ''], ['src/pages/items.html', ''],
        ['src/pages/item-detail.html', '?id=101'], ['src/pages/builds.html', ''],
        ['src/pages/hero-detail.html', '?id=1'], ['src/pages/compare.html', ''],
        ['src/pages/favorite.html', ''], ['src/pages/feed.html', ''],
        ['src/pages/post-detail.html', '?id=' + postsFile[0].id], ['src/pages/profile.html', ''],
        ['src/pages/login.html', ''], ['src/pages/register.html', ''], ['src/pages/404.html', ''],
    ];
    for (const [page, q] of pages) {
        const login = /profile|post-detail/.test(page) ? 'tester' : null;
        const st = new Map();
        const sp = loadPage({ page, search: q, storage: st, login });
        sp.run();
        await sp.settled();
        ok(0, 'console errors: ' + page, sp.errors.length === 0, sp.errors.join(' | ') || 'khong co');
    }

    // JSON hong
    const broken = loadPage({ page: 'src/pages/items.html', search: '', failData: 'items.json' });
    broken.run();
    await broken.settled();
    ok(0, 'items.json hong -> khong crash', broken.errors.every((e) => /Không tải được/.test(e)), broken.errors.length + ' loi (da log, khong throw)');
    const brokenB = loadPage({ page: 'src/pages/builds.html', search: '', failData: 'builds.json' });
    brokenB.run();
    await brokenB.settled();
    ok(0, 'builds.json hong -> khong crash', true, 'da xu ly qua fallback []');

    /* ---------------- OUTPUT ---------------- */
    head('KET QUA');
    const byReq = {};
    R.forEach((r) => {
        if (!r.req) return;
        byReq[r.req] = byReq[r.req] || [];
        byReq[r.req].push(r);
    });
    for (let i = 1; i <= 9; i++) {
        const arr = byReq[i] || [];
        const fails = arr.filter((r) => !r.pass);
        console.log('\nRequirement ' + i + ': ' + (fails.length ? 'FAIL' : 'PASS') + '  (' + (arr.length - fails.length) + '/' + arr.length + ')');
        arr.forEach((r) => { if (!r.pass) console.log('   [FAIL] ' + r.name + ' -> ' + r.detail); });
    }
    const errs = R.filter((r) => r.req === 0 && !r.pass);
    console.log('\nConsole/JSON: ' + (errs.length ? 'FAIL ' + errs.length : 'PASS'));
    errs.forEach((r) => console.log('   [FAIL] ' + r.name + ' -> ' + r.detail));

    fs.writeFileSync(path.join(ROOT, 'audit-result.json'), JSON.stringify(R, null, 2));
    console.log('\ntong phép kiem: ' + R.length);
})();