/**
 * Test cho trang Feed (src/pages/feed.html + src/js/feed.js).
 *
 * Mô phỏng DOM tối giản trong Node để kiểm tra thật sự hành vi của feed.js:
 *   - load trang Feed (khách / đã đăng nhập)
 *   - render danh sách bài viết từ src/data/posts.json
 *   - bài người dùng đăng được lưu vào LocalStorage và lên đầu danh sách
 *   - KHÔNG duplicate khi ghép posts.json + LocalStorage (kể cả khi reload nhiều lần)
 *   - mỗi bài viết có id riêng
 *   - thích / bỏ thích, trạng thái giữ được sau reload
 *   - bình luận, lưu LocalStorage, giữ được sau reload
 *   - nhiều bài viết, xoá bài viết
 *
 * "Reload" được mô phỏng bằng cách mở lại trang với CÙNG một Map localStorage.
 *
 * Chạy: node tools/test-feed-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/feed.html';
const POSTS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/posts.json'), 'utf8'));

const KEYS = { posts: 'aov_posts', seeded: 'aov_posts_seeded', comments: 'aov_comments', likes: 'aov_likes' };

/** id về chuỗi để so sánh: "9001" và 9001 phải bằng nhau. */
function idOf(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value);
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

/* ================= Trợ giúp đọc kết quả render ================= */

/** Mở trang Feed và chờ render xong. */
async function openFeed(options = {}) {
    const page = loadPage(Object.assign({ page: PAGE }, options));
    page.run();
    await page.settled();
    return page;
}

/** Mở lại trang với cùng localStorage => giống bấm F5. */
async function reloadFeed(page, options = {}) {
    return openFeed(Object.assign({ storage: page.storage, login: page.login }, options));
}

/** Mở trang ở trạng thái khách (đã xoá aov_current_user khỏi storage truyền vào). */
async function openFeedAsGuest(storage) {
    const copy = new Map(storage);
    copy.delete('aov_current_user');
    return openFeed({ storage: copy });
}

/** Đọc các thẻ bài viết đang render ra DOM (đã giải mã HTML entity do escapeHtml sinh ra). */
function readPosts(listEl) {
    const html = listEl.innerHTML;

    return html
        .split('<article class="post-card"')
        .slice(1)
        .map((block) => ({
            id: (block.match(/data-post-id="([^"]*)"/) || [])[1] || '',
            title: unescapeHtml((block.match(/post-card__title">([^<]*)</) || [])[1] || ''),
            author: unescapeHtml((block.match(/post-card__meta">\s*([^<\n]*?)\s*·/) || [])[1] || ''),
            content: unescapeHtml((block.match(/post-card__content">([\s\S]*?)<\/p>/) || [])[1] || ''),
            likeButton: (block.match(/data-post-like="[^"]*"[\s\S]*?aria-pressed="([^"]*)"/) || [])[1] || '',
            likeCount: Number((block.match(/♥ Thích \((\d+)\)/) || [])[1]),
            commentCount: Number((block.match(/💬 (\d+) bình luận/) || [])[1]),
            heroLink: (block.match(/hero-detail\.html\?id=(\d+)/) || [])[1] || '',
            comments: block.split('<li class="comment">').slice(1).map((comment) => ({
                author: unescapeHtml((comment.match(/<strong>([^<]*)<\/strong>/) || [])[1] || ''),
                content: unescapeHtml((comment.match(/<p>([\s\S]*?)<\/p>/) || [])[1] || ''),
            })),
            hasCommentForm: block.includes('data-comment-form='),
        }));
}

function likeButtonOf(page, postId) {
    return page.el('feed-list').querySelector(`[data-post-like="${postId}"]`);
}

function commentFormOf(page, postId) {
    return page.el('feed-list').querySelector(`[data-comment-form="${postId}"]`);
}

async function clickLike(page, postId) {
    const button = likeButtonOf(page, postId);
    if (!button) throw new Error('Không tìm thấy nút thích của bài ' + postId);
    fire(button, 'click', page.doc);
    await page.settled();
}

async function sendComment(page, postId, text) {
    const form = commentFormOf(page, postId);
    if (!form) throw new Error('Không tìm thấy ô bình luận của bài ' + postId);
    form.querySelector('input').value = text;
    fire(form, 'submit', page.doc);
    await page.settled();
}

async function createPost(page, title, content, heroId = '') {
    page.el('post-title').value = title;
    page.el('post-content').value = content;
    page.el('post-hero').value = heroId;

    const form = page.el('post-form');
    fire(form, 'submit', page.doc);
    await page.settled();
}

/* ================= Test ================= */

(async () => {
    console.log('Dữ liệu src/data/posts.json: ' + POSTS_JSON.length + ' bài viết');
    console.log('id trong JSON: ' + POSTS_JSON.map((post) => post.id).join(', '));

    /* ---------- 1. Load trang Feed ---------- */
    section('1. Load trang Feed');
    const guest = await openFeed();

    check('không có lỗi JS khi mở trang', guest.errors.length === 0, guest.errors.join(' | '));
    check('khách thấy nhắc đăng nhập để đăng bài',
        guest.el('feed-form').innerHTML.includes('Bạn cần đăng nhập để đăng bài và bình luận.'));
    check('khách không có form đăng bài', !guest.el('feed-form').innerHTML.includes('id="post-form"'));
    check('khách không có ô bình luận', readPosts(guest.el('feed-list')).every((post) => !post.hasCommentForm));

    /* ---------- 2. Render bài viết từ posts.json ---------- */
    section('2. Render danh sách bài viết từ posts.json');
    const posts = readPosts(guest.el('feed-list'));

    check(`render đủ ${POSTS_JSON.length} bài viết từ posts.json`, posts.length === POSTS_JSON.length, `thực tế: ${posts.length}`);
    check('thứ tự bài viết khớp posts.json',
        posts.map((post) => post.title).join('|') === POSTS_JSON.map((post) => post.title).join('|'),
        posts.map((post) => post.title).join(' | '));
    check('mỗi bài hiện đúng tác giả',
        posts.every((post, index) => post.author === POSTS_JSON[index].author),
        posts.map((post) => post.author).join(', '));
    check('mỗi bài hiện đúng nội dung',
        posts.every((post, index) => post.content === POSTS_JSON[index].content));
    check('mỗi bài hiện ngày đăng định dạng dd/MM/yyyy HH:mm',
        posts.every((post) => /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(guest.el('feed-list').innerHTML)));
    check('bài gắn tướng thì có link sang hero-detail',
        posts.filter((post) => post.heroLink).length === POSTS_JSON.filter((post) => post.heroId).length,
        posts.map((post) => post.heroLink).join(', '));
    check('mỗi bài có 0 lượt thích và 0 bình luận lúc đầu',
        posts.every((post) => post.likeCount === 0 && post.commentCount === 0));

    /* ---------- 3. Mỗi bài viết có ID ---------- */
    section('3. Mỗi bài viết có id');
    const renderedIds = posts.map((post) => post.id);
    const storedIds = guest.readKey(KEYS.posts).map((post) => idOf(post.id));

    check('mọi thẻ bài viết đều có data-post-id', renderedIds.every(Boolean), renderedIds.join(', '));
    check('id trên DOM khớp id lưu trong aov_posts',
        renderedIds.slice().sort().join(',') === storedIds.slice().sort().join(','),
        `DOM: ${renderedIds.join(',')} | storage: ${storedIds.join(',')}`);
    check('id không trùng nhau', new Set(renderedIds).size === renderedIds.length, renderedIds.join(', '));
    check('aov_posts lưu đủ id của posts.json',
        POSTS_JSON.every((post) => storedIds.includes(idOf(post.id))), storedIds.join(', '));
    check('aov_posts_seeded ghi lại id từng nạp từ JSON',
        JSON.stringify(guest.readKey(KEYS.seeded).map(idOf).sort()) === JSON.stringify(POSTS_JSON.map((post) => idOf(post.id)).sort()),
        JSON.stringify(guest.readKey(KEYS.seeded)));

    /* ---------- 4. Reload không nhân bản bài viết ---------- */
    section('4. Reload không duplicate (JSON + LocalStorage)');
    const reloaded = await reloadFeed(guest);
    const afterReload = readPosts(reloaded.el('feed-list'));

    check('reload lần 1 vẫn đúng số bài viết', afterReload.length === POSTS_JSON.length, `thực tế: ${afterReload.length}`);
    check('reload lần 1 không có id trùng', new Set(afterReload.map((p) => p.id)).size === afterReload.length);
    check('reload lần 2 vẫn đúng số bài viết', readPosts((await reloadFeed(reloaded)).el('feed-list')).length === POSTS_JSON.length);
    check('không có lỗi JS khi reload', reloaded.errors.length === 0, reloaded.errors.join(' | '));

    // posts.json thêm bài mới giữa hai lần mở trang -> phải merge thêm, không nhân bản bài cũ
    // (id cố ý nằm ngoài dải id đang có trong posts.json để mô phỏng "file thêm bài mới")
    const extraPost = {
        id: 9011,
        author: 'aovfan',
        title: 'Bài mới thêm vào posts.json',
        content: 'Bài này xuất hiện sau khi cập nhật data/posts.json.',
        heroId: 2,
        createdAt: '2025-04-01T08:00:00.000Z',
    };
    const merged = await reloadFeed(reloaded, { data: { 'posts.json': POSTS_JSON.concat(extraPost) } });
    const mergedPosts = readPosts(merged.el('feed-list'));

    check('posts.json thêm bài mới -> feed tự thêm bài đó', mergedPosts.length === POSTS_JSON.length + 1, `thực tế: ${mergedPosts.length}`);
    check('bài mới nằm cuối danh sách, không đẩy bài cũ', mergedPosts[mergedPosts.length - 1].title === extraPost.title, mergedPosts.map((p) => p.title).join(' | '));
    check('bài cũ không bị nhân bản khi merge', new Set(mergedPosts.map((p) => p.id)).size === mergedPosts.length);

    // Xoá 1 bài rồi reload -> bài đã xoá không được "sống lại"
    const mergedStorage = merged.storage;
    const seededNow = merged.readKey(KEYS.seeded).map(idOf);
    const firstJsonId = idOf(POSTS_JSON[0].id);
    mergedStorage.set(KEYS.posts, JSON.stringify(
        merged.readKey(KEYS.posts).filter((post) => idOf(post.id) !== firstJsonId)
    ));

    const afterDeleteJsonPost = await reloadFeed(merged);
    const survived = readPosts(afterDeleteJsonPost.el('feed-list'));

    check('xoá bài từ posts.json rồi reload -> bài không quay lại',
        !survived.some((post) => post.id === firstJsonId) && survived.length === POSTS_JSON.length,
        `còn ${survived.length} bài: ${survived.map((p) => p.id).join(', ')}`);
    check('aov_posts_seeded vẫn nhớ các id đã nạp', seededNow.includes(firstJsonId), seededNow.join(', '));

    // posts.json tải lỗi -> không mất bài đang có, không báo lỗi
    const brokenJson = await reloadFeed(afterDeleteJsonPost, { failData: ['posts.json'] });
    check('posts.json tải lỗi -> vẫn hiện bài đang lưu',
        readPosts(brokenJson.el('feed-list')).length === survived.length,
        `thực tế: ${readPosts(brokenJson.el('feed-list')).length} bài, cần ${survived.length}`);
    check('posts.json tải lỗi -> không ném lỗi ra ngoài', brokenJson.errors.filter((e) => !e.startsWith('console.error')).length === 0, brokenJson.errors.join(' | '));

    // Dữ liệu LocalStorage hỏng -> không làm sập trang
    const badStorage = new Map([[KEYS.posts, '{khong phai json']]);
    const brokenStore = await openFeed({ storage: badStorage, failData: ['posts.json'] });
    check('aov_posts hỏng + posts.json lỗi -> hiện thông báo chưa có bài viết',
        brokenStore.el('feed-list').innerHTML.includes('Chưa có bài viết nào'), brokenStore.el('feed-list').innerHTML.slice(0, 120));
    check('aov_posts hỏng -> không ném lỗi ra ngoài', brokenStore.errors.filter((e) => !e.startsWith('console.error')).length === 0, brokenStore.errors.join(' | '));

    /* ---------- 5. Người dùng đăng bài (lưu vào LocalStorage) ---------- */
    section('5. Đăng bài mới từ LocalStorage');
    const user = await openFeed({ login: 'player1' });

    check('đã đăng nhập thì có form đăng bài', user.el('feed-form').innerHTML.includes('id="post-form"'));
    check('form có ô tiêu đề / nội dung / chọn tướng',
        ['post-title', 'post-content', 'post-hero'].every((id) => user.el(id)));
    check('mỗi bài viết có ô bình luận khi đã đăng nhập',
        readPosts(user.el('feed-list')).every((post) => post.hasCommentForm));

    // Bài quá ngắn bị chặn
    await createPost(user, 'abc', 'ngan');
    check('tiêu đề < 5 ký tự -> báo lỗi, không tạo bài',
        user.el('post-errors').innerHTML.includes('Tiêu đề phải có ít nhất 5 ký tự.')
        && readPosts(user.el('feed-list')).length === POSTS_JSON.length,
        user.el('post-errors').innerHTML);

    await createPost(user, 'Mẹo lên tướng đỡ đòn', 'Lên level 6 rồi mới đi giao tranh, đừng đi vào rừng sớm quá.', '3');
    const withNewPost = readPosts(user.el('feed-list'));
    const newPost = withNewPost[0];

    check('bài mới nằm đầu danh sách', newPost.title === 'Mẹo lên tướng đỡ đòn', withNewPost.map((p) => p.title).join(' | '));
    check('bài mới có tác giả là user đang đăng nhập', newPost.author === 'player1', newPost.author);
    check('bài mới có id riêng, không trùng id bài trong JSON',
        newPost.id && !POSTS_JSON.some((post) => String(post.id) === newPost.id), newPost.id);
    check('bài mới hiện nội dung đúng', newPost.content === 'Lên level 6 rồi mới đi giao tranh, đừng đi vào rừng sớm quá.', newPost.content);
    check('bài mới gắn đúng tướng đã chọn', newPost.heroLink === '3', newPost.heroLink);
    check('tổng số bài = JSON + 1 bài của user', withNewPost.length === POSTS_JSON.length + 1);
    check('bài trong JSON không bị mất', withNewPost.slice(1).map((p) => p.title).join('|') === POSTS_JSON.map((p) => p.title).join('|'));

    const storedAfterCreate = user.readKey(KEYS.posts);
    check('bài mới được lưu vào aov_posts',
        storedAfterCreate.length === POSTS_JSON.length + 1
        && storedAfterCreate[0].author === 'player1'
        && storedAfterCreate[0].title === 'Mẹo lên tướng đỡ đòn');
    check('bài mới lưu đủ trường id/author/title/content/heroId/createdAt',
        ['id', 'author', 'title', 'content', 'heroId', 'createdAt'].every((key) => key in storedAfterCreate[0])
        && !Number.isNaN(Date.parse(storedAfterCreate[0].createdAt)),
        JSON.stringify(storedAfterCreate[0]));
    check('mọi bài trong aov_posts đều có id khác nhau',
        new Set(storedAfterCreate.map((post) => idOf(post.id))).size === storedAfterCreate.length);

    const userReloaded = await reloadFeed(user);
    check('reload -> bài của user vẫn còn và vẫn ở đầu',
        readPosts(userReloaded.el('feed-list'))[0].title === 'Mẹo lên tướng đỡ đòn');
    check('reload -> không nhân bản bài của user',
        readPosts(userReloaded.el('feed-list')).length === POSTS_JSON.length + 1);

    /* ---------- 6. Nhiều bài viết ---------- */
    section('6. Nhiều bài viết');
    const many = await openFeed({ login: 'player1' });
    await createPost(many, 'Bài số hai của tôi', 'Nội dung bài thứ hai đủ dài để được đăng.');
    await createPost(many, 'Bài số ba của tôi', 'Nội dung bài thứ ba đủ dài để được đăng.');
    const manyPosts = readPosts(many.el('feed-list'));

    check('đăng 2 bài nữa -> tổng 5 bài', manyPosts.length === POSTS_JSON.length + 2, `thực tế: ${manyPosts.length}`);
    check('bài mới nhất nằm trên cùng, thứ tự ngược thời gian đăng',
        manyPosts.slice(0, 2).map((p) => p.title).join('|') === 'Bài số ba của tôi|Bài số hai của tôi',
        manyPosts.map((p) => p.title).join(' | '));
    check('3 bài của user có id khác nhau',
        new Set(manyPosts.slice(0, 3).map((p) => p.id)).size === 3, manyPosts.slice(0, 3).map((p) => p.id).join(', '));
    check('5 bài có id hoàn toàn khác nhau',
        new Set(manyPosts.map((p) => p.id)).size === manyPosts.length);
    check('reload -> vẫn đủ 5 bài, không trùng',
        readPosts((await reloadFeed(many)).el('feed-list')).length === POSTS_JSON.length + 2);

    /* ---------- 7. Like / Unlike ---------- */
    section('7. Thích / bỏ thích');
    const targetId = String(POSTS_JSON[0].id);
    const liked = await openFeed({ login: 'player1' });

    check('nút thích ban đầu 0 lượt, chưa active',
        readPosts(liked.el('feed-list'))[0].likeCount === 0 && readPosts(liked.el('feed-list'))[0].likeButton === 'false');

    await clickLike(liked, targetId);
    let state = readPosts(liked.el('feed-list')).find((post) => post.id === targetId);

    check('click thích -> số lượt thích tăng lên 1', state.likeCount === 1, `thực tế: ${state.likeCount}`);
    check('click thích -> nút chuyển sang trạng thái active', state.likeButton === 'true', state.likeButton);
    check('click thích -> lưu vào aov_likes',
        JSON.stringify(liked.readKey(KEYS.likes)[targetId]) === JSON.stringify(['player1']),
        JSON.stringify(liked.readKey(KEYS.likes)));

    const likedReloaded = await reloadFeed(liked);
    const keptState = readPosts(likedReloaded.el('feed-list')).find((post) => post.id === targetId);

    check('reload -> vẫn còn 1 lượt thích', keptState.likeCount === 1, `thực tế: ${keptState.likeCount}`);
    check('reload -> nút thích vẫn active', keptState.likeButton === 'true', keptState.likeButton);

    // Hai người thích cùng một bài (chụp lại trạng thái lúc player1 đang thích)
    const likedStateStorage = new Map(likedReloaded.storage);
    const other = await openFeed({ login: 'nguoi2', storage: likedStateStorage });
    await clickLike(other, targetId);
    const shared = readPosts(other.el('feed-list')).find((post) => post.id === targetId);

    check('người khác thích cùng bài -> tổng 2 lượt', shared.likeCount === 2, `thực tế: ${shared.likeCount}`);
    check('người khác thích -> lượt của người trước vẫn còn',
        JSON.stringify(other.readKey(KEYS.likes)[targetId].slice().sort()) === JSON.stringify(['nguoi2', 'player1']),
        JSON.stringify(other.readKey(KEYS.likes)[targetId]));
    check('người khác thích -> nút thích của họ active', shared.likeButton === 'true', shared.likeButton);

    const firstUserAgain = await openFeed({ login: 'player1', storage: new Map(other.storage) });
    check('người trước reload vẫn thấy lượt thích của riêng mình',
        readPosts(firstUserAgain.el('feed-list')).find((post) => post.id === targetId).likeButton === 'true');

    await clickLike(likedReloaded, targetId);
    state = readPosts(likedReloaded.el('feed-list')).find((post) => post.id === targetId);

    check('click lần 2 -> bỏ thích, số lượt về 0', state.likeCount === 0, `thực tế: ${state.likeCount}`);
    check('click lần 2 -> nút thôi active', state.likeButton === 'false', state.likeButton);
    check('bỏ thích -> aov_likes không còn user đó',
        !(likedReloaded.readKey(KEYS.likes)[targetId] || []).includes('player1'),
        JSON.stringify(likedReloaded.readKey(KEYS.likes)));
    check('reload sau khi bỏ thích -> vẫn 0 lượt thích',
        readPosts((await reloadFeed(likedReloaded)).el('feed-list')).find((post) => post.id === targetId).likeCount === 0);

    const guestLike = await openFeedAsGuest(likedReloaded.storage);
    const beforeGuest = JSON.stringify(guestLike.readKey(KEYS.likes));
    fire(likeButtonOf(guestLike, targetId), 'click', guestLike.doc);
    await guestLike.settled();

    check('khách bấm thích -> báo phải đăng nhập', guestLike.alerts.length === 1, JSON.stringify(guestLike.alerts));
    check('khách bấm thích -> không đổi dữ liệu', JSON.stringify(guestLike.readKey(KEYS.likes)) === beforeGuest);

    /* ---------- 8. Bình luận ---------- */
    section('8. Bình luận');
    const commentTarget = String(POSTS_JSON[1].id);
    const talker = await openFeed({ login: 'player1' });

    await sendComment(talker, commentTarget, '   ');
    check('bình luận rỗng -> không tạo bình luận',
        readPosts(talker.el('feed-list')).find((post) => post.id === commentTarget).commentCount === 0
        && !talker.readKey(KEYS.comments),
        JSON.stringify(talker.readKey(KEYS.comments)));

    await sendComment(talker, commentTarget, 'Bài này rất hữu ích, cảm ơn tác giả!');
    let commented = readPosts(talker.el('feed-list')).find((post) => post.id === commentTarget);

    check('gửi bình luận -> bình luận hiện ra', commented.comments.length === 1 && commented.comments[0].content === 'Bài này rất hữu ích, cảm ơn tác giả!', JSON.stringify(commented.comments));
    check('gửi bình luận -> hiện tên người gửi', commented.comments[0].author === 'player1', commented.comments[0].author);
    check('gửi bình luận -> số bình luận trên thẻ bài tăng lên 1', commented.commentCount === 1, `thực tế: ${commented.commentCount}`);
    check('gửi bình luận -> lưu vào aov_comments kèm postId',
        talker.readKey(KEYS.comments).length === 1
        && String(talker.readKey(KEYS.comments)[0].postId) === commentTarget,
        JSON.stringify(talker.readKey(KEYS.comments)));
    check('ô nhập bình luận được xoá sau khi gửi', commentFormOf(talker, commentTarget).querySelector('input').value === '');
    check('con trỏ quay lại ô bình luận của bài vừa gửi',
        commentFormOf(talker, commentTarget).querySelector('input').focused === true);

    const commentReloaded = await reloadFeed(talker);
    const keptComment = readPosts(commentReloaded.el('feed-list')).find((post) => post.id === commentTarget);

    check('reload -> bình luận vẫn còn', keptComment.comments.length === 1 && keptComment.commentCount === 1, JSON.stringify(keptComment.comments));

    // Gửi liên tiếp 3 bình luận: id phải khác nhau
    await sendComment(commentReloaded, commentTarget, 'Bình luận thứ hai');
    await sendComment(commentReloaded, commentTarget, 'Bình luận thứ ba');
    const allComments = commentReloaded.readKey(KEYS.comments);

    check('gửi 3 bình luận -> lưu đủ 3', allComments.length === 3, `thực tế: ${allComments.length}`);
    check('3 bình luận có id khác nhau (không trùng Date.now)',
        new Set(allComments.map((row) => String(row.id))).size === 3,
        allComments.map((row) => row.id).join(', '));
    check('hiển thị đủ 3 bình luận theo thứ tự đã gửi',
        readPosts(commentReloaded.el('feed-list')).find((post) => post.id === commentTarget).comments
            .map((row) => row.content).join('|') === 'Bài này rất hữu ích, cảm ơn tác giả!|Bình luận thứ hai|Bình luận thứ ba');

    // Bình luận của người khác vẫn hiện, và xoá được bình luận của mình
    const guestView = await openFeedAsGuest(commentReloaded.storage);
    check('khách vẫn thấy bình luận của người khác',
        readPosts(guestView.el('feed-list')).find((post) => post.id === commentTarget).comments.length === 3);
    check('khách không thấy nút xoá bình luận',
        !guestView.el('feed-list').innerHTML.includes('data-comment-delete'));

    const ownCommentId = allComments[0].id;
    fire(commentReloaded.el('feed-list').querySelector(`[data-comment-delete="${ownCommentId}"]`), 'click', commentReloaded.doc);
    await commentReloaded.settled();

    check('xoá bình luận của mình -> bình luận biến mất',
        !commentReloaded.readKey(KEYS.comments).some((row) => String(row.id) === String(ownCommentId))
        && readPosts(commentReloaded.el('feed-list')).find((post) => post.id === commentTarget).comments.length === 2);
    check('xoá 1 bình luận không ảnh hưởng bình luận khác',
        commentReloaded.readKey(KEYS.comments).length === 2);
    check('reload sau khi xoá bình luận -> vẫn còn 2 bình luận',
        readPosts((await reloadFeed(commentReloaded)).el('feed-list'))
            .find((post) => post.id === commentTarget).comments.length === 2);

    /* ---------- 9. Xoá bài viết ---------- */
    section('9. Xoá bài viết');
    const del = await openFeed({ login: 'player1' });
    await createPost(del, 'Bài viết để test xoá', 'Nội dung bài viết này sẽ bị xoá ngay sau khi tạo.');
    const ownPostId = readPosts(del.el('feed-list'))[0].id;

    await sendComment(del, ownPostId, 'Bình luận của chính bài mình xoá');
    await clickLike(del, ownPostId);
    check('bài của user có bình luận + lượt thích trước khi xoá',
        del.readKey(KEYS.comments).length === 1 && del.readKey(KEYS.likes)[ownPostId]);

    fire(del.el('feed-list').querySelector(`[data-post-delete="${ownPostId}"]`), 'click', del.doc);
    await del.settled();
    const afterDelete = readPosts(del.el('feed-list'));

    check('xoá bài của mình -> bài biến mất khỏi feed',
        !afterDelete.some((post) => post.id === ownPostId) && afterDelete.length === POSTS_JSON.length,
        afterDelete.map((post) => post.id).join(', '));
    check('xoá bài -> xoá luôn bình luận của bài đó', del.readKey(KEYS.comments).length === 0, JSON.stringify(del.readKey(KEYS.comments)));
    check('xoá bài -> xoá luôn lượt thích của bài đó', !del.readKey(KEYS.likes)[ownPostId], JSON.stringify(del.readKey(KEYS.likes)));
    check('xoá bài của user rồi reload -> bài không quay lại',
        readPosts((await reloadFeed(del)).el('feed-list')).length === POSTS_JSON.length);

    const otherView = await openFeed({ login: 'nguoi2', storage: new Map(del.storage) });
    check('người khác không thấy nút xoá bài của người này',
        !otherView.el('feed-list').innerHTML.includes('data-post-delete'));

    /* ---------- 10. Chốt ---------- */
    section('10. Không lỗi JS');
    const allPages = [guest, reloaded, merged, user, many, liked, talker, commentReloaded, del];
    const jsErrors = allPages.flatMap((page) => page.errors.filter((error) => !error.startsWith('console.error')));

    check('không trang nào ném lỗi JavaScript', jsErrors.length === 0, jsErrors.join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();

function normalize(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value);
}
