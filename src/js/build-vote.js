/**
 * build-vote.js - Nút bình chọn "Hữu ích" cho hướng dẫn build (HD07)
 * Phụ trách: Người 2 (TV2)
 *
 * Dùng chung cho cả trang danh sách (pages/builds.html) và trang chi tiết
 * (pages/build-detail.html) nên tách riêng khỏi build.js / build-detail.js:
 *   - renderBuildVoteButton(buildId, { compact }) -> HTML nút
 *   - refreshBuildVoteButtons(root)               -> đồng bộ trạng thái + số lượt
 *   - handleBuildVoteClick(button)                -> bật/tắt 1 phiếu (cần đăng nhập)
 *
 * Dữ liệu nằm ở LocalStorage qua storage.js (aov_build_votes = { buildId: [username] });
 * ràng buộc "mỗi người 1 lượt/build" do toggleBuildVote() bảo đảm.
 *
 * Khách bấm nút -> báo cần đăng nhập (giống nút Thích ở Feed), không ghi dữ liệu.
 *
 * Nạp sau: components.js (escapeHtml), auth.js (getCurrentUser), storage.js
 * (getBuildVoteCount/hasVotedBuild/toggleBuildVote).
 */

/** Nhãn hiển thị của nút bình chọn. */
const BUILD_VOTE_LABEL = 'Hữu ích';

/** Username đang đăng nhập (rỗng khi là khách). */
function buildVoteCurrentUser() {
    return typeof getCurrentUser === 'function' ? (getCurrentUser() || '') : '';
}

/**
 * HTML nút bình chọn "Hữu ích" cho một build.
 * @param {number|string} buildId
 * @param {{ compact?: boolean }} [options] compact = nút nhỏ gắn trong thẻ build.
 * @returns {string}
 */
function renderBuildVoteButton(buildId, options) {
    const compact = Boolean(options && options.compact);
    const voted = hasVotedBuild(buildId, buildVoteCurrentUser());
    const count = getBuildVoteCount(buildId);
    const classes = ['btn-vote-build'];
    if (compact) classes.push('btn-vote-build--compact');
    if (voted) classes.push('is-active');

    return `
        <button type="button" class="${classes.join(' ')}" data-build-vote="${escapeHtml(buildId)}" aria-pressed="${voted}" title="Bình chọn hướng dẫn này hữu ích">
            <span class="btn-vote-build__icon" aria-hidden="true">👍</span>
            <span class="btn-vote-build__label">${BUILD_VOTE_LABEL}</span>
            <span class="btn-vote-build__count">${count}</span>
        </button>
    `;
}

/**
 * Đồng bộ mọi nút bình chọn đang có trong DOM với dữ liệu LocalStorage:
 * tô sáng nút đã bình chọn và cập nhật số lượt.
 * @param {Element|Document} [root] vùng chứa, mặc định toàn trang.
 */
function refreshBuildVoteButtons(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    const user = buildVoteCurrentUser();

    scope.querySelectorAll('[data-build-vote]').forEach((button) => {
        const buildId = button.dataset ? button.dataset.buildVote : '';
        const voted = hasVotedBuild(buildId, user);

        button.classList.toggle('is-active', voted);
        button.setAttribute('aria-pressed', String(voted));

        const countEl = button.querySelector('.btn-vote-build__count');
        if (countEl) countEl.textContent = String(getBuildVoteCount(buildId));
    });
}

/**
 * Xử lý bấm nút bình chọn: khách thì báo đăng nhập, người dùng thì bật/tắt phiếu.
 * @param {Element} button
 * @returns {boolean} true nếu có ghi dữ liệu (đã đăng nhập + toggle thành công).
 */
function handleBuildVoteClick(button) {
    const buildId = button && button.dataset ? button.dataset.buildVote : '';
    if (!buildId) return false;

    const user = buildVoteCurrentUser();
    if (!user) {
        alert('Bạn cần đăng nhập để bình chọn hữu ích cho build.');
        return false;
    }

    const result = toggleBuildVote(buildId, user);
    if (!result) return false;

    refreshBuildVoteButtons();
    return true;
}

/* Event delegation ở cấp document: nút được render động nên không gắn riêng. */
document.addEventListener('click', (event) => {
    const button = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('[data-build-vote]')
        : null;
    if (!button) return;

    handleBuildVoteClick(button);
});

document.addEventListener('DOMContentLoaded', () => refreshBuildVoteButtons());
