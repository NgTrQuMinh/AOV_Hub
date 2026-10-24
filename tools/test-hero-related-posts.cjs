/**
 * test-hero-related-posts.cjs - Kiểm tra khu "Bài viết về tướng này"
 * ở trang Chi tiết tướng (src/pages/hero-detail.html + src/js/hero.js).
 *
 * Phạm vi:
 *   - bài viết cùng heroId được hiển thị, bài của tướng khác bị loại;
 *   - bài chờ duyệt / bị từ chối / bị ẩn không lọt ra với người xem không phải tác giả;
 *   - tác giả vẫn thấy bài của mình theo đúng isPostVisibleForViewer();
 *   - link mở đúng post-detail.html?id=<postId>;
 *   - tướng chưa có bài viết vẫn hiển thị thông báo thân thiện;
 *   - dữ liệu thiếu heroId / id / dữ liệu hỏng được bỏ qua an toàn;
 *   - tiêu đề và nội dung độc hại được escape.
 *
 * Chạy: node tools/test-hero-related-posts.cjs
 */
const { loadPage, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/hero-detail.html';

const POSTS = [
    {
        id: 101,
        author: 'alice',
        title: 'Cách lên đồ cho tướng 1',
        content: 'Nội dung bài viết cùng tướng, cũ hơn.',
        heroId: 1,
        category: 'Build trang bị',
        createdAt: '2025-03-01T10:00:00.000Z',
        status: 'approved',
    },
    {
        id: 102,
        author: 'bob',
        title: 'Bài của tướng khác',
        content: 'Không được xuất hiện ở trang tướng 1.',
        heroId: 2,
        category: 'Mẹo chơi',
        createdAt: '2025-03-02T10:00:00.000Z',
        status: 'approved',
    },
    {
        id: 103,
        author: 'demo',
        title: 'Bài đang chờ duyệt',
        content: 'Chỉ tác giả được thấy.',
        heroId: 1,
        category: 'Thảo luận',
        createdAt: '2025-03-05T10:00:00.000Z',
        status: 'pending',
    },
    {
        id: 104,
        author: 'demo',
        title: 'Bài đã bị ẩn',
        content: 'Chỉ tác giả được thấy.',
        heroId: 1,
        category: 'Hỏi đáp',
        createdAt: '2025-03-06T10:00:00.000Z',
        hidden: true,
    },
    {
        id: 105,
        author: 'bob',
        title: 'Bài không gắn tướng',
        content: 'heroId rỗng nên phải bị loại.',
        heroId: null,
        category: 'Thảo luận',
        createdAt: '2025-03-03T10:00:00.000Z',
        status: 'approved',
    },
    {
        id: 106,
        author: 'carol',
        title: 'Bài mới nhất của tướng 1',
        content: 'Nội dung bài viết cùng tướng, mới hơn.',
        heroId: 1,
        category: 'Mẹo chơi',
        createdAt: '2025-04-01T10:00:00.000Z',
        status: 'approved',
    },
    {
        id: 107,
        author: 'bob',
        title: 'Bài bị từ chối',
        content: 'Không đủ điều kiện hiển thị.',
        heroId: 1,
        category: 'Thảo luận',
        createdAt: '2025-03-04T10:00:00.000Z',
        status: 'rejected',
    },
    null,
    { author: 'no-id', title: 'Thiếu id', heroId: 1 },
    { id: 'bad-hero', author: 'no-hero', title: 'heroId sai kiểu', heroId: 'abc' },
];

/* ================= Test runner ================= */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + name);
    } else {
        failures.push(name + (detail ? ` - ${detail}` : ''));
        console.log('  FAIL  ' + name + (detail ? `\n        ${detail}` : ''));
    }
}

function section(title) {
    console.log('\n== ' + title + ' ==');
}

/* ================= Mở trang ================= */

async function openHero(search = '?id=1', options = {}) {
    const page = loadPage(Object.assign({
        page: PAGE,
        search,
        data: { 'posts.json': POSTS },
    }, options));
    page.run();
    await page.settled();
    return page;
}

function readHeroPosts(page) {
    const html = page.el('hero-detail').innerHTML;
    const sectionHtml = (html.match(/<section class="hero-posts"[\s\S]*?<\/section>/) || [''])[0];
    const cards = sectionHtml
        .split('<article class="hero-post-card"')
        .slice(1)
        .map((block) => ({
            id: (block.match(/data-post-id="([^"]*)"/) || [])[1] || '',
            href: (block.match(/<h3 class="hero-post-card__title">\s*<a href="([^"]*)"/) || [])[1] || '',
            title: unescapeHtml((block.match(/<a href="[^"]*">([\s\S]*?)<\/a>/) || [])[1] || ''),
            author: unescapeHtml((block.match(/hero-post-card__author">([^<]*)</) || [])[1] || ''),
            excerpt: unescapeHtml((block.match(/hero-post-card__excerpt">([\s\S]*?)<\/p>/) || [])[1] || ''),
        }));

    return {
        hasSection: sectionHtml.includes('Bài viết về tướng này'),
        empty: sectionHtml.includes('Chưa có bài viết nào về tướng này'),
        cards,
        html: sectionHtml,
    };
}

/* ================= Tests ================= */

(async () => {
    section('1. Người xem khách: chỉ thấy bài đủ điều kiện của đúng tướng');

    const guest = await openHero('?id=1');
    const guestPosts = readHeroPosts(guest);

    check('có khu "Bài viết về tướng này"', guestPosts.hasSection, guestPosts.html.slice(0, 120));
    check('chỉ hiện 2 bài approved của tướng 1',
        guestPosts.cards.length === 2,
        `thực tế: ${guestPosts.cards.map((card) => card.id).join(', ')}`);
    check('bài của tướng khác bị loại',
        !guestPosts.cards.some((card) => card.id === '102'));
    check('bài pending bị loại với khách',
        !guestPosts.cards.some((card) => card.id === '103'));
    check('bài bị ẩn bị loại với khách',
        !guestPosts.cards.some((card) => card.id === '104'));
    check('bài bị từ chối bị loại với khách',
        !guestPosts.cards.some((card) => card.id === '107'));
    check('bài thiếu heroId bị loại',
        !guestPosts.cards.some((card) => card.id === '105'));
    check('bài thiếu id / dữ liệu hỏng bị bỏ qua',
        !guestPosts.cards.some((card) => card.id === '' || card.id === 'undefined'));
    check('sắp xếp mới nhất trước',
        guestPosts.cards.map((card) => card.id).join(',') === '106,101',
        guestPosts.cards.map((card) => card.id).join(','));
    check('có tiêu đề, tác giả và đoạn trích',
        guestPosts.cards[0].title === 'Bài mới nhất của tướng 1'
        && guestPosts.cards[0].author === 'carol'
        && guestPosts.cards[0].excerpt.includes('Nội dung bài viết cùng tướng'));
    check('link trỏ đúng post-detail.html?id=<postId>',
        guestPosts.cards.every((card) => card.href === `/src/pages/post-detail.html?id=${card.id}`),
        guestPosts.cards.map((card) => card.href).join(' | '));

    section('2. Tác giả đăng nhập: thấy thêm bài của chính mình');

    const author = await openHero('?id=1', { login: 'demo' });
    const authorPosts = readHeroPosts(author);

    check('tác giả thấy bài pending của mình',
        authorPosts.cards.some((card) => card.id === '103'));
    check('tác giả thấy bài bị ẩn của mình',
        authorPosts.cards.some((card) => card.id === '104'));
    check('không thấy bài pending của người khác (nếu có) và bài tướng khác',
        !authorPosts.cards.some((card) => card.id === '102' || card.id === '107'));
    check('số bài của tác giả là 4',
        authorPosts.cards.length === 4,
        `thực tế: ${authorPosts.cards.map((card) => card.id).join(', ')}`);

    section('3. Tướng không có bài viết');

    const emptyPage = await openHero('?id=1', {
        data: { 'posts.json': [POSTS[1]] },
    });
    const emptyPosts = readHeroPosts(emptyPage);

    check('vẫn có khu bài viết', emptyPosts.hasSection);
    check('hiện thông báo thân thiện', emptyPosts.empty);
    check('không render thẻ bài nào', emptyPosts.cards.length === 0);

    section('4. Hàm getPostsByHero()');

    const apiPage = await openHero('?id=1');
    check('getPostsByHero(1) trả đúng id bài đủ điều kiện',
        apiPage.runInPage('JSON.stringify(getPostsByHero(1).map((post) => post.id))') === '[106,101]',
        apiPage.runInPage('JSON.stringify(getPostsByHero(1).map((post) => post.id))'));
    check('getPostsByHero(2) trả bài của tướng 2',
        apiPage.runInPage('JSON.stringify(getPostsByHero(2).map((post) => post.id))') === '[102]');
    check('getPostsByHero() với heroId rỗng trả mảng rỗng',
        apiPage.runInPage('JSON.stringify(getPostsByHero(""))') === '[]');
    check('getPostsByHero() với heroId không tồn tại trả mảng rỗng',
        apiPage.runInPage('JSON.stringify(getPostsByHero("99999"))') === '[]');

    section('5. Escape dữ liệu độc hại');

    const evilPage = await openHero('?id=1', {
        data: {
            'posts.json': [{
                id: 201,
                author: '<b>evil</b>',
                title: '<img src=x onerror=alert(1)>',
                content: '<script>alert(1)</script>',
                heroId: 1,
                category: 'Thảo luận',
                createdAt: '2025-04-02T10:00:00.000Z',
                status: 'approved',
            }],
        },
    });
    const evilPosts = readHeroPosts(evilPage);

    check('không render thẻ <img> từ tiêu đề',
        !evilPosts.html.includes('<img src=x onerror') && evilPosts.html.includes('&lt;img src=x'));
    check('không render <script> từ nội dung',
        !evilPosts.html.includes('<script>alert(1)</script>') && evilPosts.html.includes('&lt;script&gt;'));
    check('tác giả độc hại được escape',
        !evilPosts.html.includes('<b>evil</b>') && evilPosts.html.includes('&lt;b&gt;evil&lt;/b&gt;'));

    section('6. Trang tướng không tồn tại vẫn hoạt động');

    const missingHero = await openHero('?id=99999');
    check('hiện thông báo tướng không tồn tại',
        missingHero.el('hero-detail').innerHTML.includes('Tướng không tồn tại!'));

    console.log(`\n${passed} PASS, ${failures.length} FAIL`);

    if (failures.length) {
        console.log('\nCác test lỗi:');
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
