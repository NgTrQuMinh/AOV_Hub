/**
 * admin-build-review.js - Mục "Build chờ duyệt" trong tab "Chờ duyệt" (HD06-f)
 * Trang: src/pages/admin.html?tab=pending (file này do admin-shell.js nạp động
 * qua trường scripts của tab 'pending': ['admin-pending.js', 'admin-build-review.js']).
 *
 * LUỒNG XỬ LÝ
 *   - Người dùng gửi build ở build-submit.html (localStorage 'aov_build_submissions',
 *     trạng thái 'pending') -> mục này liệt kê các bản gửi đang chờ, mới nhất trước,
 *     kèm đếm "Đang chờ / Đã duyệt / Đã từ chối" đọc lại cùng khóa.
 *   - "Duyệt"  -> tự GET /api/builds, tạo build mới (id = id số lớn nhất + 1, đúng
 *     schema builds.json, KHÔNG thêm trường lạ), PUT lại TOÀN BỘ mảng; CHỈ khi PUT
 *     thành công mới đổi bản gửi sang 'approved' (reviewedBy / reviewedAt / buildId),
 *     ghi nhật ký 'duyet-build' và vẽ lại + refreshAdminBadges().
 *   - "Từ chối" -> bản gửi sang 'rejected' (lý do KHÔNG bắt buộc), reviewedBy /
 *     reviewedAt, ghi nhật ký 'tu-choi-build' và vẽ lại.
 *   - Bản gửi có heroId không còn trong heroes.json hoặc có mã trang bị không tồn
 *     tại thì KHÔNG cho Duyệt: nút Duyệt disabled kèm dòng giải thích đỏ nhạt.
 *
 * VÌ SAO TỰ ĐỌC/ GHI /api/builds
 *   admin-shell.js khai báo scripts của tab 'pending' là ['admin-pending.js',
 *   'admin-build-review.js'] và KHÔNG nạp admin-builds.js, nên createBuild/
 *   nextBuildId/writeBuilds/canManageBuilds KHÔNG tồn tại ở trang này. File tự làm
 *   một bản riêng cùng cách admin-builds.js gọi GET/PUT /api/builds (2 route duy nhất
 *   của vite.config.js, server không cấp id nên client tự id rồi PUT cả mảng).
 *
 * VÌ SAO BỌC IIFE
 *   admin-pending.js cùng nằm trên trang và khai báo hàm cấp global (renderPendingRow,
 *   renderPendingSection, refreshPendingSection...). Nếu file này cũng khai báo
 *   const/function trùng tên ở cấp global sẽ ném SyntaxError làm hỏng CẢ tab 'pending'
 *   (trong đó có mục "Bài viết chờ duyệt"). Bọc (function () { ... })() nên mọi tên
 *   bên trong đều cục bộ, mục bài viết cũ không bị ảnh hưởng dù file này lỗi.
 *
 * PHÂN QUYỀN (quy ước phía trình duyệt, KHÔNG phải bảo mật thật)
 *   Không có backend nên "admin" chỉ là role trong users.json. Giao diện chỉ vẽ nội
 *   dung cho admin (renderSection kiểm tra isLoggedIn() + isAdmin()); approveSubmission/
 *   rejectSubmission kiểm tra lại quyền ở tầng hàm nên user thường gọi thẳng từ console
 *   cũng bị từ chối.
 *
 * GIỚI HẠN
 *   - Không backend thật: build chỉ ghi được vào src/data/builds.json khi "npm run dev"
 *     (vite.config.js) đang chạy; PUT lỗi thì hiện thông báo và KHÔNG đổi trạng thái.
 *   - localStorage hỏng / khóa thiếu thì coi như không có bản gửi.
 *   - Mọi hàm async đều bọc try/catch; lỗi trong file này không làm sập tab.
 *
 * DÙNG LẠI: registerAdminSection()/refreshAdminBadges() (admin-shell.js),
 * isLoggedIn()/isAdmin()/getCurrentUser() (auth.js), escapeHtml()/imageUrl()/
 * formatDateTime() (components.js), loadData()/DATA_PATH/BASE_PATH (loadData.js,
 * config.js), loadHeroes() (heroData.js), logAdminAction() (adminlog.js).
 *
 * KIỂM THỬ: window.AdminBuildReview = { getPendingSubmissions, approveSubmission,
 * rejectSubmission } — CHỈ để test gọi từ console, giao diện không dùng đối tượng này.
 */
(function () {
    'use strict';

    /* ---------- Hằng số ---------- */

    /** Khóa LocalStorage chứa các bản gửi build (cùng khóa với build-submit.js). */
    const REVIEW_SUBMISSIONS_KEY = 'aov_build_submissions';

    /** Địa chỉ API build (BASE_PATH khai báo trong config.js, luôn là "/"). */
    const REVIEW_BUILDS_API = (typeof BASE_PATH === 'string' && BASE_PATH ? BASE_PATH : '/') + 'api/builds';

    /** Tên 3 giai đoạn như bản gửi và như builds.json. */
    const REVIEW_PHASE_NAMES = ['Đầu trận', 'Giữa trận', 'Cuối trận'];

    /** Trạng thái bản gửi. */
    const REVIEW_STATUS_PENDING = 'pending';
    const REVIEW_STATUS_APPROVED = 'approved';
    const REVIEW_STATUS_REJECTED = 'rejected';

    /** Cờ chống bấm Duyệt / Từ chối hai lần trong lúc đang chờ API. */
    let reviewBusy = false;

    /** Bản tướng / trang bị tham chiếu, nạp lại mỗi lần vẽ mục. */
    let reviewHeroesCache = [];
    let reviewItemsCache = [];

    /* ---------- Thoát HTML / dữ liệu người dùng ---------- */

    /**
     * Thoát ký tự HTML trước khi ghép vào innerHTML.
     * Ưu tiên escapeHtml() của components.js; thiếu thì dùng bản dự phòng.
     * @param {*} value
     * @returns {string}
     */
    function escapeReviewHtml(value) {
        if (typeof escapeHtml === 'function') return escapeHtml(value);
        if (value === null || value === undefined) return '';

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * URL ảnh qua imageUrl() (components.js); thiếu thì trả chuỗi rỗng.
     * @param {*} value
     * @returns {string}
     */
    function reviewImageUrl(value) {
        if (typeof imageUrl === 'function') {
            try {
                return imageUrl(value);
            } catch (error) {
                return '';
            }
        }
        return '';
    }

    /* ---------- Đọc / ghi bản gửi (bọc try/catch) ---------- */

    /**
     * Đọc toàn bộ bản gửi từ LocalStorage.
     * Khóa hỏng hoặc không phải mảng -> coi như rỗng, không ném lỗi.
     * @returns {Array}
     */
    function loadSubmissions() {
        try {
            const raw = localStorage.getItem(REVIEW_SUBMISSIONS_KEY);
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Ghi lại toàn bộ mảng bản gửi.
     * @param {Array} list
     * @returns {boolean} true nếu lưu được.
     */
    function saveSubmissions(list) {
        try {
            localStorage.setItem(REVIEW_SUBMISSIONS_KEY, JSON.stringify(list));
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Các bản gửi đang chờ duyệt, mới nhất trước (createdAt giảm dần).
     * @returns {Array}
     */
    function getPendingSubmissions() {
        return loadSubmissions()
            .filter((entry) => entry && entry.status === REVIEW_STATUS_PENDING)
            .sort((a, b) => {
                const left = Date.parse(a && a.createdAt) || 0;
                const right = Date.parse(b && b.createdAt) || 0;
                return right - left;
            });
    }

    /**
     * Đếm bản gửi theo trạng thái để hiện ở đầu mục (đọc lại cùng khóa aov_build_submissions).
     * @returns {{ pending: number, approved: number, rejected: number }}
     */
    function countSubmissionsByStatus() {
        const counts = { pending: 0, approved: 0, rejected: 0 };

        loadSubmissions().forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            if (entry.status === REVIEW_STATUS_PENDING) counts.pending += 1;
            else if (entry.status === REVIEW_STATUS_APPROVED) counts.approved += 1;
            else if (entry.status === REVIEW_STATUS_REJECTED) counts.rejected += 1;
        });

        return counts;
    }

    /* ---------- Phân quyền (quy ước trình duyệt, không phải bảo mật thật) ---------- */

    /**
     * Người dùng hiện tại có quyền duyệt / từ chối build không.
     * Kiểm tra lại ở tầng hàm để gọi thẳng từ console với user thường cũng bị chặn.
     * @returns {boolean}
     */
    function canManageBuildReview() {
        return Boolean(
            typeof isLoggedIn === 'function'
            && isLoggedIn()
            && typeof isAdmin === 'function'
            && isAdmin(),
        );
    }

    /**
     * Tên admin đang thao tác (ghi vào reviewedBy).
     * @returns {string}
     */
    function currentAdminName() {
        if (typeof getCurrentUser === 'function') {
            try {
                return String(getCurrentUser() || '');
            } catch (error) {
                return '';
            }
        }
        return '';
    }

    /* ---------- Dữ liệu tham chiếu: tướng + trang bị ---------- */

    /**
     * Nạp danh sách tướng tham chiếu.
     * Ưu tiên loadHeroes() của heroData.js (kiểm tra typeof), thiếu thì loadData(DATA_PATH.heroes).
     * @returns {Promise<Array>}
     */
    async function loadHeroesReference() {
        try {
            if (typeof loadHeroes === 'function') {
                const list = await loadHeroes();
                if (Array.isArray(list)) return list;
            }
        } catch (error) {
            // Rơi xuống nhánh dự phòng bên dưới.
        }

        try {
            if (typeof loadData === 'function' && typeof DATA_PATH !== 'undefined') {
                const list = await loadData(DATA_PATH.heroes);
                if (Array.isArray(list)) return list;
            }
        } catch (error) {
            // Không đọc được: coi như rỗng.
        }

        return [];
    }

    /**
     * Nạp danh sách trang bị tham chiếu qua loadData(DATA_PATH.items).
     * @returns {Promise<Array>}
     */
    async function loadItemsReference() {
        try {
            if (typeof loadData === 'function' && typeof DATA_PATH !== 'undefined') {
                const list = await loadData(DATA_PATH.items);
                if (Array.isArray(list)) return list;
            }
        } catch (error) {
            // Không đọc được: coi như rỗng.
        }

        return [];
    }

    /**
     * Tìm tướng trong cache tham chiếu (so sánh về số).
     * @param {*} heroId
     * @returns {object|null}
     */
    function findReviewHero(heroId) {
        const id = Number(heroId);
        if (!Number.isFinite(id)) return null;
        return reviewHeroesCache.find((hero) => Number(hero && hero.id) === id) || null;
    }

    /**
     * Tìm trang bị trong cache tham chiếu (so sánh về số).
     * @param {*} itemId
     * @returns {object|null}
     */
    function findReviewItem(itemId) {
        const id = Number(itemId);
        if (!Number.isFinite(id)) return null;
        return reviewItemsCache.find((item) => Number(item && item.id) === id) || null;
    }

    /**
     * Toàn bộ mã trang bị mà một bản gửi tham chiếu (trang bị chính + 3 giai đoạn), không trùng.
     * @param {object} submission
     * @returns {number[]}
     */
    function collectSubmissionItemIds(submission) {
        const ids = [];
        const push = (value) => {
            const id = Number(value);
            if (Number.isFinite(id) && !ids.includes(id)) ids.push(id);
        };

        const source = submission && typeof submission === 'object' ? submission : {};
        (Array.isArray(source.items) ? source.items : []).forEach(push);
        (Array.isArray(source.phases) ? source.phases : []).forEach((phase) => {
            if (phase && Array.isArray(phase.items)) phase.items.forEach(push);
        });

        return ids;
    }

    /**
     * Lý do KHÔNG được duyệt một bản gửi (chuỗi rỗng nghĩa là duyệt được):
     * heroId không còn trong heroes.json hoặc có mã trang bị không tồn tại.
     * @param {object} submission
     * @returns {string}
     */
    function getApproveBlockReason(submission) {
        const source = submission && typeof submission === 'object' ? submission : {};

        if (!findReviewHero(source.heroId)) {
            return 'Tướng (mã ' + escapeReviewHtml(source.heroId) + ') không còn trong dữ liệu nên không thể duyệt.';
        }

        const missing = collectSubmissionItemIds(source).filter((id) => !findReviewItem(id));
        if (missing.length) {
            return 'Các trang bị sau không còn trong dữ liệu nên không thể duyệt: '
                + escapeReviewHtml(missing.join(', ')) + '.';
        }

        return '';
    }

    /* ---------- Thông báo trạng thái (role="status", không dùng alert/confirm) ---------- */

    /**
     * Tìm thân của chính mục "Build chờ duyệt" đang hiển thị.
     * @returns {Element|null}
     */
    function findReviewSectionBody() {
        if (typeof document === 'undefined') return null;

        try {
            return document.querySelector('[data-admin-section="pending-builds"] .admin-section__body');
        } catch (error) {
            return null;
        }
    }

    /**
     * Hiện thông báo trong vùng trạng thái của mục (textContent, không qua innerHTML).
     * @param {string} message nội dung; rỗng thì ẩn vùng.
     * @param {string} [kind] info | success | warn | danger.
     */
    function setReviewStatus(message, kind) {
        const body = findReviewSectionBody();
        if (!body) return;

        const statusEl = body.querySelector('[data-build-review-status]');
        if (!statusEl) return;

        if (!message) {
            statusEl.hidden = true;
            statusEl.textContent = '';
            return;
        }

        const modifier = ['success', 'warn', 'danger'].includes(kind) ? kind : 'info';
        statusEl.hidden = false;
        statusEl.className = 'admin-notice admin-notice--' + modifier;
        statusEl.textContent = message;
    }

    /* ---------- Gọi API /api/builds (bản riêng, không dùng admin-builds.js) ---------- */

    /**
     * Gửi yêu cầu tới API nội bộ và trả về dữ liệu JSON phản hồi.
     * @param {string} url
     * @param {object} [options] method / body.
     * @returns {Promise<object|null>} null nếu request lỗi hoặc HTTP lỗi.
     */
    async function requestBuildApi(url, options) {
        try {
            const response = await fetch(url, Object.assign({
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            }, options));

            if (!response.ok) {
                console.error('admin-build-review: API ' + url + ' trả về HTTP ' + response.status);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('admin-build-review: không gọi được API nội bộ (hãy chạy "npm run dev")', error);
            return null;
        }
    }

    /**
     * Đọc toàn bộ build hiện có từ GET /api/builds.
     * @returns {Promise<Array|null>} null nếu không đọc được (API không chạy).
     */
    async function fetchBuildsList() {
        const result = await requestBuildApi(REVIEW_BUILDS_API, { method: 'GET' });
        if (!result) return null;

        const list = Array.isArray(result)
            ? result
            : (result && Array.isArray(result.builds) ? result.builds : []);

        return list.filter((build) => build && typeof build === 'object');
    }

    /**
     * Ghi TOÀN BỘ mảng build vào builds.json qua PUT /api/builds.
     * @param {Array} list
     * @returns {Promise<boolean>} true nếu phản hồi có ok === true.
     */
    async function writeBuildsList(list) {
        const result = await requestBuildApi(REVIEW_BUILDS_API, {
            method: 'PUT',
            body: JSON.stringify(list),
        });

        return Boolean(result && result.ok === true);
    }

    /**
     * Id kế tiếp: id số lớn nhất đang có + 1 (server không tự cấp id).
     * @param {Array} list
     * @returns {number}
     */
    function nextReviewBuildId(list) {
        const max = (Array.isArray(list) ? list : []).reduce((current, build) => {
            const value = Number(build && build.id);
            return Number.isFinite(value) && value > current ? value : current;
        }, 0);

        return Math.floor(max) + 1;
    }

    /**
     * Dựng bản build mới từ một bản gửi ĐÃ duyệt, đúng schema builds.json
     * (id, heroId, name, lane, playstyle, items, description, phases, skillOrder,
     * tips, situational, counters, notes) — KHÔNG thêm author/status.
     * @param {object} submission
     * @param {number} buildId
     * @returns {object}
     */
    function buildFromSubmission(submission, buildId) {
        const source = submission && typeof submission === 'object' ? submission : {};

        const toNumberList = (value) => (Array.isArray(value) ? value : [])
            .map((entry) => Number(entry))
            .filter((id) => Number.isFinite(id));

        const phases = (Array.isArray(source.phases) ? source.phases : []).map((phase, index) => {
            const row = phase && typeof phase === 'object' ? phase : {};
            return {
                name: String(row.name || REVIEW_PHASE_NAMES[index] || ''),
                items: toNumberList(row.items),
                note: String(row.note || ''),
            };
        });

        return {
            id: buildId,
            heroId: Number(source.heroId),
            name: String(source.name || ''),
            lane: String(source.lane || ''),
            playstyle: String(source.playstyle || ''),
            items: toNumberList(source.items),
            description: '',
            phases: phases,
            skillOrder: String(source.skillOrder || ''),
            tips: Array.isArray(source.tips) ? source.tips.map((tip) => String(tip)) : [],
            situational: [],
            counters: [],
            // builds.json đang lưu notes là MẢNG chuỗi nên bản mới cũng là mảng (rỗng).
            notes: [],
        };
    }

    /* ---------- Nhật ký admin ---------- */

    /**
     * Ghi nhật ký nếu adminlog.js đã nạp; lỗi ghi nhật ký không được làm hỏng luồng.
     * @param {string} action 'duyet-build' | 'tu-choi-build'
     * @param {number|string} targetId id build mới (duyệt) hoặc id bản gửi (từ chối)
     * @param {string} detail mô tả phụ (tên build, lý do...)
     */
    function logReviewAction(action, targetId, detail) {
        if (typeof logAdminAction !== 'function') return;

        try {
            logAdminAction(action, 'build', targetId, detail);
        } catch (error) {
            console.warn('admin-build-review: không ghi được nhật ký admin', error);
        }
    }

    /* ---------- Duyệt / Từ chối ---------- */

    /**
     * Duyệt một bản gửi: PUT build mới vào builds.json TRƯỚC, đổi trạng thái bản gửi SAU.
     * Chỉ admin; PUT lỗi (API không chạy) thì báo lỗi và GIỮ NGUYÊN trạng thái 'pending'.
     * @param {string} submissionId
     * @returns {Promise<boolean>} true nếu đã duyệt thành công.
     */
    async function approveSubmission(submissionId) {
        if (!canManageBuildReview()) {
            setReviewStatus('Bạn không có quyền quản trị.', 'danger');
            return false;
        }

        if (reviewBusy) return false;
        reviewBusy = true;

        try {
            const submissions = loadSubmissions();
            const submission = submissions.find((entry) => String(entry && entry.id) === String(submissionId));

            if (!submission) {
                setReviewStatus('Không tìm thấy bản gửi build này.', 'danger');
                return false;
            }

            if (submission.status !== REVIEW_STATUS_PENDING) {
                setReviewStatus('Bản gửi này đã được xử lý rồi.', 'warn');
                return false;
            }

            // Tải lại tham chiếu rồi kiểm tra lần nữa trước khi ghi.
            if (!reviewHeroesCache.length) reviewHeroesCache = await loadHeroesReference();
            if (!reviewItemsCache.length) reviewItemsCache = await loadItemsReference();

            const blockReason = getApproveBlockReason(submission);
            if (blockReason) {
                setReviewStatus(blockReason, 'danger');
                return false;
            }

            const currentList = await fetchBuildsList();
            if (!currentList) {
                setReviewStatus('Không ghi được builds.json, hãy chạy npm run dev', 'danger');
                return false;
            }

            const newId = nextReviewBuildId(currentList);
            const created = buildFromSubmission(submission, newId);

            const saved = await writeBuildsList(currentList.concat(created));
            if (!saved) {
                // PUT lỗi: KHÔNG đổi trạng thái bản gửi.
                setReviewStatus('Không ghi được builds.json, hãy chạy npm run dev', 'danger');
                return false;
            }

            submission.status = REVIEW_STATUS_APPROVED;
            submission.reviewedBy = currentAdminName();
            submission.reviewedAt = new Date().toISOString();
            submission.buildId = newId;

            const persisted = saveSubmissions(submissions);

            logReviewAction('duyet-build', newId, String(submission.name || ''));

            await refreshReviewSection();
            if (typeof refreshAdminBadges === 'function') {
                try {
                    await refreshAdminBadges();
                } catch (error) {
                    // Không cập nhật được badge cũng không sao.
                }
            }

            if (persisted) {
                setReviewStatus('Đã duyệt build "' + String(submission.name || '') + '" (mã ' + newId
                    + ') và ghi vào builds.json.', 'success');
            } else {
                setReviewStatus('Đã ghi build (mã ' + newId
                    + ') vào builds.json nhưng KHÔNG lưu được trạng thái bản gửi vào LocalStorage.', 'warn');
            }

            return true;
        } catch (error) {
            console.warn('admin-build-review: lỗi khi duyệt build', error);
            setReviewStatus('Có lỗi xảy ra khi duyệt build. Trạng thái bản gửi không đổi.', 'danger');
            return false;
        } finally {
            reviewBusy = false;
        }
    }

    /**
     * Từ chối một bản gửi (lý do KHÔNG bắt buộc).
     * Chỉ admin; không đụng tới builds.json.
     * @param {string} submissionId
     * @param {string} [reason] lý do do admin nhập (để trống thì không lưu rejectReason).
     * @returns {Promise<boolean>} true nếu đã từ chối thành công.
     */
    async function rejectSubmission(submissionId, reason) {
        if (!canManageBuildReview()) {
            setReviewStatus('Bạn không có quyền quản trị.', 'danger');
            return false;
        }

        if (reviewBusy) return false;
        reviewBusy = true;

        try {
            const submissions = loadSubmissions();
            const submission = submissions.find((entry) => String(entry && entry.id) === String(submissionId));

            if (!submission) {
                setReviewStatus('Không tìm thấy bản gửi build này.', 'danger');
                return false;
            }

            if (submission.status !== REVIEW_STATUS_PENDING) {
                setReviewStatus('Bản gửi này đã được xử lý rồi.', 'warn');
                return false;
            }

            const cleanReason = String(reason || '').trim();

            submission.status = REVIEW_STATUS_REJECTED;
            if (cleanReason) submission.rejectReason = cleanReason;
            submission.reviewedBy = currentAdminName();
            submission.reviewedAt = new Date().toISOString();

            const persisted = saveSubmissions(submissions);

            logReviewAction(
                'tu-choi-build',
                String(submission.id || ''),
                String(submission.name || '') + (cleanReason ? ' — ' + cleanReason : ''),
            );

            await refreshReviewSection();
            if (typeof refreshAdminBadges === 'function') {
                try {
                    await refreshAdminBadges();
                } catch (error) {
                    // Không cập nhật được badge cũng không sao.
                }
            }

            if (persisted) {
                setReviewStatus('Đã từ chối build "' + String(submission.name || '') + '"'
                    + (cleanReason ? ' với lý do: ' + cleanReason : '') + '.', 'success');
            } else {
                setReviewStatus('Không lưu được trạng thái bản gửi vào LocalStorage.', 'warn');
            }

            return true;
        } catch (error) {
            console.warn('admin-build-review: lỗi khi từ chối build', error);
            setReviewStatus('Có lỗi xảy ra khi từ chối build.', 'danger');
            return false;
        } finally {
            reviewBusy = false;
        }
    }

    /* ---------- Giao diện ---------- */

    /**
     * Ảnh nhỏ của tướng (nếu có); thiếu imageUrl hoặc ảnh thì trả chuỗi rỗng.
     * @param {object} hero
     * @returns {string}
     */
    function heroThumbHtml(hero) {
        if (!hero) return '';
        const src = reviewImageUrl(hero.image);
        if (!src) return '';
        return '<img src="' + escapeReviewHtml(src) + '" width="24" height="24" alt=""> ';
    }

    /**
     * Liệt kê tên trang bị cho một danh sách mã; mã không tìm thấy thì hiện
     * "Không còn trong dữ liệu".
     * @param {number[]} ids
     * @returns {string} HTML đã escape.
     */
    function itemNamesHtml(ids) {
        if (!ids.length) return '<em>Không có</em>';

        return ids.map((id) => {
            const item = findReviewItem(id);
            return item
                ? escapeReviewHtml(item.name)
                : '<span>Mã ' + escapeReviewHtml(id) + ' — Không còn trong dữ liệu</span>';
        }).join(', ');
    }

    /**
     * Một hàng bảng cho bản gửi đang chờ.
     * Mọi dữ liệu từ LocalStorage đều qua escapeReviewHtml() trước khi ghép innerHTML.
     * @param {object} submission
     * @returns {string} HTML string
     */
    function renderReviewRow(submission) {
        const source = submission && typeof submission === 'object' ? submission : {};
        const id = escapeReviewHtml(source.id);
        const hero = findReviewHero(source.heroId);

        const heroCell = hero
            ? heroThumbHtml(hero) + escapeReviewHtml(hero.name)
            : '<span>Tướng (mã ' + escapeReviewHtml(source.heroId) + ') — Không còn trong dữ liệu</span>';

        const phasesHtml = (Array.isArray(source.phases) ? source.phases : []).map((phase) => {
            const row = phase && typeof phase === 'object' ? phase : {};
            const name = String(row.name || '');
            const items = Array.isArray(row.items) ? row.items : [];
            const note = String(row.note || '');

            return '<li><strong>' + escapeReviewHtml(name) + ':</strong> '
                + itemNamesHtml(items)
                + (note ? ' — <em>' + escapeReviewHtml(note) + '</em>' : '')
                + '</li>';
        }).join('');

        const tipsHtml = (Array.isArray(source.tips) ? source.tips : [])
            .map((tip) => '<li>' + escapeReviewHtml(tip) + '</li>')
            .join('');

        const blockReason = getApproveBlockReason(source);

        return `
            <tr data-build-review-row="${id}">
                <td>
                    <strong>${escapeReviewHtml(source.name)}</strong><br>
                    <span class="badge">${escapeReviewHtml(source.lane || '—')}</span>
                </td>
                <td>${heroCell}</td>
                <td>
                    ${escapeReviewHtml(source.author || '—')}<br>
                    ${escapeReviewHtml(formatReviewDateTime(source.createdAt))}
                </td>
                <td>
                    <p>${escapeReviewHtml(source.playstyle || '')}</p>
                    <ul>
                        ${phasesHtml || '<li><em>Không có dữ liệu giai đoạn.</em></li>'}
                    </ul>
                    <p><strong>Thứ tự kỹ năng:</strong> ${escapeReviewHtml(source.skillOrder || '—')}</p>
                    ${tipsHtml ? '<p><strong>Mẹo chơi:</strong></p><ul>' + tipsHtml + '</ul>' : ''}
                </td>
                <td>
                    ${blockReason ? '<p class="admin-notice admin-notice--danger">' + blockReason + '</p>' : ''}
                    <div class="admin-table__actions">
                        <input
                            type="text"
                            class="filter-bar__keyword"
                            data-build-review-reason="${id}"
                            placeholder="Lý do từ chối (không bắt buộc)"
                            aria-label="Lý do từ chối build ${id}"
                        >
                        <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            data-build-review-approve="${id}"
                            ${blockReason ? 'disabled' : ''}
                        >Duyệt</button>
                        <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            data-build-review-reject="${id}"
                        >Từ chối</button>
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Định dạng ngày gửi bằng formatDateTime() (components.js), thiếu thì tự làm.
     * @param {*} value
     * @returns {string}
     */
    function formatReviewDateTime(value) {
        if (typeof formatDateTime === 'function') {
            try {
                return formatDateTime(value);
            } catch (error) {
                // Rơi xuống cách phía dưới.
            }
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('vi-VN');
    }

    /**
     * Render nội dung mục "Build chờ duyệt" vào container do admin-shell.js cung cấp.
     * Không phải admin thì chỉ hiện thông báo; mọi lỗi đều được bắt trong này.
     * @param {Element} container vùng .admin-section__body.
     * @returns {Promise<void>}
     */
    async function renderReviewSection(container) {
        if (!container) return;

        try {
            if (!canManageBuildReview()) {
                container.innerHTML = '<p class="admin-empty">Chỉ quản trị viên mới xem được mục này.</p>';
                return;
            }

            const counts = countSubmissionsByStatus();
            reviewHeroesCache = await loadHeroesReference();
            reviewItemsCache = await loadItemsReference();

            const pending = getPendingSubmissions();

            const listHtml = pending.length
                ? '<div class="admin-table-wrap"><table class="admin-table">'
                    + '<thead><tr>'
                    + '<th>Build</th><th>Tướng</th><th>Tác giả / ngày gửi</th>'
                    + '<th>Nội dung gửi</th><th>Thao tác</th>'
                    + '</tr></thead>'
                    + '<tbody>' + pending.map(renderReviewRow).join('') + '</tbody>'
                    + '</table></div>'
                : '<p class="admin-empty">Không có build nào đang chờ duyệt.</p>';

            container.innerHTML = `
                <p class="admin-section__desc">Đang chờ: ${counts.pending} · Đã duyệt: ${counts.approved} · Đã từ chối: ${counts.rejected}</p>
                <div class="admin-notice" role="status" data-build-review-status hidden></div>
                ${listHtml}
            `;
        } catch (error) {
            console.warn('admin-build-review: không vẽ được mục Build chờ duyệt', error);
            container.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được mục Build chờ duyệt.'
                + '</div>';
        }
    }

    /**
     * Vẽ lại đúng mục "Build chờ duyệt" (không vẽ lại cả khung, không đụng mục bài viết).
     * @returns {Promise<void>}
     */
    async function refreshReviewSection() {
        const body = findReviewSectionBody();
        if (!body) return;
        await renderReviewSection(body);
    }

    /* ---------- Sự kiện (event delegation như admin-pending.js) ---------- */

    /*
     * Bảng vẽ động bằng innerHTML nên gắn một lần ở cấp document rồi dò theo data attribute.
     * Nằm trong IIFE nên dù file này nạp ở trang khác cũng không đụng handler của trang đó.
     */
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('click', (event) => {
            const target = event && event.target;
            if (!target || typeof target.closest !== 'function') return;

            const approveBtn = target.closest('[data-build-review-approve]');
            if (approveBtn) {
                approveSubmission(approveBtn.getAttribute('data-build-review-approve'));
                return;
            }

            const rejectBtn = target.closest('[data-build-review-reject]');
            if (rejectBtn) {
                const row = rejectBtn.closest('[data-build-review-row]');
                const input = row ? row.querySelector('[data-build-review-reason]') : null;
                rejectSubmission(
                    rejectBtn.getAttribute('data-build-review-reject'),
                    input ? input.value : '',
                );
            }
        });
    }

    /* ---------- Đăng ký mục với khung quản trị ---------- */

    // admin-shell.js nạp file này khi mở tab 'pending'; file nạp ở nơi khác (test) cũng chạy.
    if (typeof registerAdminSection === 'function') {
        registerAdminSection('pending', 'pending-builds', 'Build chờ duyệt', renderReviewSection);
    }

    // Chỉ để test gọi từ console, giao diện không dùng đối tượng này.
    if (typeof window !== 'undefined') {
        window.AdminBuildReview = {
            getPendingSubmissions: getPendingSubmissions,
            approveSubmission: approveSubmission,
            rejectSubmission: rejectSubmission,
        };
    }
})();
