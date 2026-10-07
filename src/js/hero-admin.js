/**
 * hero-admin.js - Trang quản lý tướng (src/pages/hero-admin.html)
 *
 * Nhiệm vụ: giúp quản trị viên (tài khoản có role === 'admin') CRUD tướng:
 *   - thêm tướng mới: createHero() (heroData.js)
 *   - sửa tướng đã có: updateHero() — giữ nguyên id, cập nhật nội dung
 *   - xoá tướng: deleteHero() — cũng dọn yêu thích / lịch sử / so sánh của tướng đó
 *   - chọn ảnh qua File Explorer (input file) thay vì gõ tay link: đọc bằng FileReader,
 *     cắt giữa về tỉ lệ 1:1 rồi nén về HERO_IMAGE_MAX_EDGE px rồi lưu data URL,
 *     có ảnh xem trước và nút Xoá ảnh
 *   - form thêm / sửa: vai trò chỉ chọn được 1 (radio), chỉ số bị chặn trên theo
 *     HERO_STAT_LIMITS (hp < 10000, sát thương / giáp / tốc độ < 1000),
 *     form luôn mở sẵn HERO_SKILL_MAX (3) ô kỹ năng cố định (Chiêu 1 / 2 / 3 theo
 *     thứ tự dòng, select disabled — không cho tự chọn, không nút Thêm / Xoá dòng),
 *     hồi chiêu phải nhỏ hơn HERO_SKILL_COOLDOWN_MAX (60 giây)
 *   - xem bảng TẤT CẢ tướng với id, tên, vai trò, độ khó, thao tác Sửa / Xóa
 *   - tìm nhanh theo tên tướng
 *
 * Quyền truy cập (giống trang Quản trị bài viết admin.js):
 *   - requireAdmin() trong auth.js chặn ở đầu <body> của hero-admin.html.
 *   - Dù vậy initHeroAdminPage() vẫn kiểm tra lại isAdmin() trước khi vẽ form và
 *     bảng, để không bao giờ lộ dữ liệu quản trị nếu giao diện chưa kịp điều hướng
 *     (fail-closed).
 *   - Tầng dữ liệu cũng chặn: createHero()/updateHero()/deleteHero() trong heroData.js
 *     đều gọi canManageHeroes() nên gọi thẳng từ console cũng không sửa được.
 *
 * Dữ liệu: dùng đúng lớp dữ liệu tướng (heroData.js) nên thao tác ở đây thấy ngay
 * trên mọi trang đọc qua loadHeroes() (Danh sách tướng, Chi tiết, So sánh, Yêu thích,
 * Build, Feed, Trang chủ...).
 *
 * Dùng lại của nhóm khác: requireAdmin()/isAdmin()/renderErrors()/renderSuccess() (auth.js),
 * escapeHtml()/renderNotFound()/DIFFICULTY_LABEL (components.js),
 * matchKeyword()/debounce() (search.js),
 * getStoredHeroes()/findHeroById()/validateHeroForm()/createHero()/updateHero()/
 * deleteHero()/HERO_ROLES/HERO_DIFFICULTIES/HERO_STAT_KEYS/HERO_STAT_LIMITS/
 * HERO_SKILL_TYPES/HERO_SKILL_MAX/HERO_SKILL_COOLDOWN_MAX (heroData.js).
 */

/** Từ khoá đang gõ trong ô tìm kiếm; lưu trong bộ nhớ, không ghi lên URL. */
let heroAdminKeyword = '';

/** Nhãn tiếng Việt cho 4 chỉ số trong form (hero.js có nhãn riêng nhưng trang này không nạp hero.js). */
const HERO_ADMIN_STAT_LABELS = {
    hp: 'Máu',
    attack: 'Sát thương',
    defense: 'Giáp',
    speed: 'Tốc độ',
};

/** Dòng kỹ năng trống — dùng để luôn đủ HERO_SKILL_MAX ô khi dựng form. */
const HERO_SKILL_EMPTY_ROW = { name: '', type: '', description: '', cooldown: '' };

/**
 * Bổ sung dòng kỹ năng trống cho tới khi đủ HERO_SKILL_MAX dòng — form thêm mới
 * và form sửa đều luôn mở sẵn đúng 3 ô (Chiêu 1 / 2 / 3), không nút Thêm/Xoá dòng.
 * @param {Array} [skills] danh sách dòng đã có (không làm thay đổi mảng gốc).
 * @returns {Array}
 */
function padHeroSkillRows(skills) {
    const rows = Array.isArray(skills) ? skills.slice() : [];
    while (rows.length < HERO_SKILL_MAX) rows.push(Object.assign({}, HERO_SKILL_EMPTY_ROW));
    return rows;
}

/** Bề cạnh dài nhất (px) của ảnh sau khi nén — giữ data URL nhỏ để vừa LocalStorage. */
const HERO_IMAGE_MAX_EDGE = 512;

/** Chất lượng JPEG khi nén ảnh chọn từ máy (ảnh PNG được giữ nguyên định dạng). */
const HERO_IMAGE_JPEG_QUALITY = 0.85;

/* ---------- Tìm kiếm & bảng ---------- */

/**
 * Toàn bộ tướng đang lưu (đã merge với data/heroes.json khi khởi tạo trang).
 * @returns {Array}
 */
function getHeroAdminHeroes() {
    return getStoredHeroes();
}

/**
 * Tướng khớp với từ khoá đang gõ (so khớp theo tên, không phân biệt hoa/thường
 * và không phân biệt dấu tiếng Việt nhờ matchKeyword).
 * @returns {Array}
 */
function getHeroAdminFilteredHeroes() {
    const keyword = String(heroAdminKeyword || '').trim();
    const heroes = getHeroAdminHeroes();

    if (!keyword) return heroes;

    return heroes.filter((hero) => matchKeyword(hero.name, keyword));
}

/**
 * Vẽ thanh công cụ: ô tìm theo tên + nút "Thêm tướng".
 * Tái dùng class filter-bar / filter-bar__keyword như trang Quản trị bài viết.
 * @returns {Element|null} vùng chứa thanh công cụ, null nếu trang không có.
 */
function renderHeroAdminToolbar() {
    const toolbar = document.getElementById('hero-admin-toolbar');
    if (!toolbar) return null;

    toolbar.innerHTML = `
        <div class="filter-bar">
            <input
                type="search"
                class="filter-bar__keyword"
                id="hero-admin-keyword"
                placeholder="Tìm tướng theo tên..."
                aria-label="Tìm tướng theo tên"
            >
            <button type="button" class="btn btn-primary btn-sm" data-hero-add>Thêm tướng</button>
        </div>
    `;

    const keywordInput = toolbar.querySelector('#hero-admin-keyword');
    if (!keywordInput) return toolbar;

    // Gán sau innerHTML để không mất từ khoá đang tìm khi vẽ lại công cụ.
    keywordInput.value = heroAdminKeyword;

    // Gõ liên tục thì chỉ lọc lại sau khi ngừng gõ, tránh vẽ lại bảng mỗi ký tự.
    keywordInput.addEventListener('input', debounce(() => {
        heroAdminKeyword = keywordInput.value;
        renderHeroAdminTable();
    }, 200));

    return toolbar;
}

/**
 * Vẽ một dòng tướng trong bảng quản trị.
 * Mọi dữ liệu từ LocalStorage đều đi qua escapeHtml() trước khi đưa vào innerHTML.
 * @param {object} hero
 * @returns {string} HTML string
 */
function renderHeroAdminRow(hero) {
    const roles = (hero.role || []).map((role) => escapeHtml(role)).join(', ');
    const difficultyText = DIFFICULTY_LABEL[hero.difficulty] || `Độ khó ${hero.difficulty}`;

    return `
        <tr data-hero-id="${escapeHtml(hero.id)}">
            <td>${escapeHtml(hero.id)}</td>
            <td>
                <a href="${BASE_PATH}src/pages/hero-detail.html?id=${encodeURIComponent(hero.id)}">${escapeHtml(hero.name)}</a>
            </td>
            <td>${roles}</td>
            <td>${escapeHtml(difficultyText)}</td>
            <td>${(Array.isArray(hero.skills) ? hero.skills.length : 0)} chiêu</td>
            <td>
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-hero-edit="${escapeHtml(hero.id)}"
                >Sửa</button>
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-hero-delete="${escapeHtml(hero.id)}"
                >Xóa</button>
            </td>
        </tr>
    `;
}

/**
 * Vẽ bảng tướng theo từ khoá đang gõ.
 * Không tướng nào khớp thì hiện renderNotFound() thay cho bảng, giống trang Quản trị.
 */
function renderHeroAdminTable() {
    const tableBox = document.getElementById('hero-admin-list');
    if (!tableBox) return;

    const total = getHeroAdminHeroes().length;
    const heroes = getHeroAdminFilteredHeroes();
    const countEl = document.getElementById('hero-admin-count');

    // Có từ khoá thì báo "đang xem / tổng", không có thì chỉ báo tổng số tướng.
    if (countEl) {
        countEl.textContent = heroAdminKeyword.trim()
            ? `${heroes.length} / ${total} tướng`
            : `${total} tướng`;
    }

    if (!heroes.length) {
        tableBox.innerHTML = renderNotFound(
            total ? 'Không có tướng nào khớp từ khoá đang tìm.' : 'Chưa có tướng nào trong hệ thống.',
        );
        return;
    }

    tableBox.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Tên tướng</th>
                    <th>Vai trò</th>
                    <th>Độ khó</th>
                    <th>Kỹ năng</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>
                ${heroes.map(renderHeroAdminRow).join('')}
            </tbody>
        </table>
    `;
}

/* ---------- Form thêm / sửa tướng ---------- */

/**
 * Một dòng nhập kỹ năng (dùng trong #hero-skill-rows).
 * Một dòng kỹ năng: tên / mô tả / hồi chiêu đọc từ thuộc tính data-skill-* nên giữ
 * giá trị cũ được mỗi lần vẽ lại form khi thêm hoặc bớt một dòng.
 * Loại chiêu KHÔNG cho tự chọn: khoá cứng theo vị trí dòng (select disabled) —
 * dòng 1 -> Chiêu 1, dòng 2 -> Chiêu 2, dòng 3 -> Chiêu 3, đúng thứ tự dữ liệu
 * tướng lưu trong heroes.json; submit vẫn đọc được giá trị của select bị tắt.
 * Dòng để trống (không tên / mô tả / hồi chiêu) vẫn bị validateHeroForm bỏ qua.
 * @param {object} [skill]
 * @param {number} [index] vị trí dòng (0-based) — quyết định loại chiêu hiển thị.
 * @returns {string} HTML string
 */
function renderHeroSkillRow(skill, index) {
    const row = skill && typeof skill === 'object' ? skill : {};
    const positionType = HERO_SKILL_TYPES[index] || HERO_SKILL_TYPES[0];
    const typeOptions = HERO_SKILL_TYPES.map((type) => `
            <option value="${escapeHtml(type)}"${type === positionType ? ' selected' : ''}>${escapeHtml(type)}</option>`).join('');

    return `
        <div class="hero-skill-row" data-skill-row>
            <input type="text" data-skill-name placeholder="Tên kỹ năng" aria-label="Tên kỹ năng" value="${escapeHtml(row.name)}">
            <select data-skill-type aria-label="Loại kỹ năng (cố định theo thứ tự dòng)" disabled>${typeOptions}
            </select>
            <input type="text" data-skill-desc placeholder="Mô tả" aria-label="Mô tả kỹ năng" value="${escapeHtml(row.description)}">
            <input type="number" min="0" max="${HERO_SKILL_COOLDOWN_MAX - 1}" step="any" data-skill-cooldown placeholder="Hồi chiêu (giây, từ 0 đến ${HERO_SKILL_COOLDOWN_MAX - 1})" aria-label="Hồi chiêu" value="${escapeHtml(row.cooldown)}">
        </div>
    `;
}

/**
 * Giá trị mặc định của form THÊM tướng mới (HERO_SKILL_MAX dòng kỹ năng trống,
 * độ khó Trung bình).
 * @returns {object}
 */
function defaultHeroFormValues() {
    return {
        name: '',
        image: '',
        roles: [],
        difficulty: 2,
        stats: { hp: '', attack: '', defense: '', speed: '' },
        skills: padHeroSkillRows([]),
        recommendedBuild: [],
    };
}

/**
 * Chuyển một tướng đang lưu thành dữ liệu điền sẵn cho form SỬA.
 * @param {object} hero
 * @returns {object}
 */
function heroFormValuesFromHero(hero) {
    const stats = hero.stats && typeof hero.stats === 'object' ? hero.stats : {};

    return {
        name: hero.name || '',
        image: hero.image || '',
        roles: Array.isArray(hero.role) ? hero.role.slice() : [],
        difficulty: hero.difficulty,
        stats: HERO_STAT_KEYS.reduce((result, key) => {
            const value = stats[key];
            result[key] = value === undefined || value === null ? '' : value;
            return result;
        }, {}),
        skills: padHeroSkillRows(Array.isArray(hero.skills)
            ? hero.skills.map((skill) => Object.assign({}, HERO_SKILL_EMPTY_ROW, skill))
            : []),
        recommendedBuild: Array.isArray(hero.recommendedBuild) ? hero.recommendedBuild.slice() : [],
    };
}

/**
 * Đọc toàn bộ dữ liệu form đang mở (tên, ảnh, vai trò đã tick, độ khó, chỉ số,
 * từng dòng kỹ năng, trang bị đề xuất) về một object cùng schema với validateHeroForm.
 *
 * @param {Element} form thẻ <form id="hero-form">.
 * @returns {object}
 */
function readHeroFormValues(form) {
    const valueOf = (root, selector) => {
        const el = root.querySelector(selector);
        return el ? el.value : '';
    };

    const stats = {};
    HERO_STAT_KEYS.forEach((key) => {
        stats[key] = valueOf(form, `#hero-stat-${key}`);
    });

    const skills = Array.from(form.querySelectorAll('[data-skill-row]')).map((row) => ({
        name: valueOf(row, '[data-skill-name]'),
        type: valueOf(row, '[data-skill-type]'),
        description: valueOf(row, '[data-skill-desc]'),
        cooldown: valueOf(row, '[data-skill-cooldown]'),
    }));

    const roles = Array.from(form.querySelectorAll('input[name="hero-role"]'))
        .filter((input) => input.checked)
        .map((input) => input.value);

    return {
        name: valueOf(form, '#hero-name'),
        image: valueOf(form, '#hero-image'),
        roles,
        difficulty: valueOf(form, '#hero-difficulty'),
        stats,
        skills,
        recommendedBuild: valueOf(form, '#hero-build'),
    };
}

/**
 * Vẽ ảnh xem trước trong form (thay src của #hero-image-preview).
 * @param {Element} form thẻ <form id="hero-form">.
 * @param {string} image data URL hoặc đường dẫn ảnh (rỗng thì xoá ảnh xem trước).
 */
function renderHeroImagePreview(form, image) {
    const preview = form.querySelector('#hero-image-preview');
    if (!preview) return;

    preview.innerHTML = image
        ? `<img src="${escapeHtml(imageUrl(image))}" alt="Ảnh xem trước">`
        : '';
}

/**
 * Đọc file người dùng chọn trong File Explorer thành data URL bằng FileReader.
 * @param {File} file
 * @returns {Promise<string>} data URL (vd: "data:image/png;base64,...").
 */
function readHeroImageFile(file) {
    return new Promise((resolve, reject) => {
        if (typeof FileReader === 'undefined') {
            reject(new Error('Trình duyệt không hỗ trợ FileReader.'));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Không đọc được file.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Cắt ảnh đã chọn về tỉ lệ 1:1 (cắt giữa theo cạnh ngắn nhất, phần dư bị bỏ)
 * rồi thu nhỏ cạnh dài nhất về HERO_IMAGE_MAX_EDGE px để data URL đủ nhỏ cho LocalStorage.
 * Ảnh PNG giữ nguyên định dạng (giữ trong suốt), ảnh khác nén JPEG.
 * Không cắt/nén được (môi trường thiếu Image/canvas, ảnh lỗi...) thì giữ nguyên data URL gốc.
 *
 * @param {string} dataUrl ảnh gốc sau khi FileReader đọc được.
 * @param {string} fileType MIME type của file (vd: "image/png").
 * @returns {Promise<string>} data URL cuối cùng đưa vào ô nhập ảnh (vuông 1:1 nếu cắt được).
 */
function shrinkHeroImage(dataUrl, fileType) {
    return new Promise((resolve) => {
        if (typeof Image === 'undefined') {
            resolve(dataUrl);
            return;
        }

        const image = new Image();
        image.onload = () => {
            try {
                const width = image.naturalWidth || image.width || 0;
                const height = image.naturalHeight || image.height || 0;
                if (!width || !height) {
                    resolve(dataUrl);
                    return;
                }

                // Ép 1:1: cắt giữa theo cạnh ngắn nhất, sau đó mới thu nhỏ về
                // HERO_IMAGE_MAX_EDGE px (ảnh nhỏ hơn cũng đi qua canvas để bảo đảm vuông).
                const side = Math.min(width, height);
                const size = Math.min(side, HERO_IMAGE_MAX_EDGE);
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;

                const context = canvas.getContext && canvas.getContext('2d');
                if (!context) {
                    resolve(dataUrl);
                    return;
                }

                context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);

                const isPng = String(fileType || '').indexOf('image/png') === 0
                    || String(dataUrl).indexOf('data:image/png') === 0;
                const output = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', HERO_IMAGE_JPEG_QUALITY);

                // Ảnh đã qua cắt 1:1 nên luôn dùng bản canvas, không so độ dài nữa
                // (so lại thì ảnh gốc không vuông sẽ được giữ nguyên).
                resolve(output || dataUrl);
            } catch (error) {
                resolve(dataUrl);
            }
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
    });
}

/**
 * Gắn sự kiện cho ô chọn file ảnh của form: đổi file là đọc -> nén -> ghi vào
 * ô #hero-image + ảnh xem trước. Gọi sau mỗi lần renderHeroAdminForm() vì innerHTML
 * tạo node mới (đúng cách gắn listener submit ngay bên dưới).
 *
 * @param {Element} form thẻ <form id="hero-form">.
 */
function attachHeroImagePicker(form) {
    const fileInput = form.querySelector('#hero-image-file');
    if (!fileInput) return;

    fileInput.addEventListener('change', async () => {
        const errorBox = form.querySelector('#hero-form-errors');
        const imageInput = form.querySelector('#hero-image');
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        // Chặn file lạ khi hệ điều hành vẫn cho chọn (accept chỉ là gợi ý của hộp thoại).
        if (file.type && file.type.indexOf('image/') !== 0) {
            renderErrors(errorBox, ['Bạn chỉ được chọn file ảnh (JPG, PNG, WebP...).']);
            fileInput.value = '';
            return;
        }

        try {
            const rawDataUrl = await readHeroImageFile(file);
            const finalDataUrl = await shrinkHeroImage(rawDataUrl, file.type);

            if (imageInput) imageInput.value = finalDataUrl;
            renderHeroImagePreview(form, finalDataUrl);
            renderErrors(errorBox, []);
        } catch (error) {
            renderErrors(errorBox, ['Không đọc được file ảnh. Hãy chọn một ảnh khác.']);
        }
    });
}

/**
 * Render form thêm / sửa tướng.
 * Dùng chung cho cả hai chế độ nên không có form riêng cho việc sửa:
 *   - renderHeroAdminForm()            -> form thêm mới (trống)
 *   - renderHeroAdminForm(heroToEdit)  -> form sửa, tự điền sẵn dữ liệu cũ
 *
 * Trạng thái đang sửa được ghi ở data-edit-id của chính thẻ <form>, nên handler
 * submit chỉ cần đọc lại thuộc tính này (đúng cách renderPostForm của feed.js).
 *
 * @param {object} [editingHero] tướng cần sửa, bỏ trống nếu đang thêm mới.
 */
function renderHeroAdminForm(editingHero) {
    const box = document.getElementById('hero-admin-form');
    if (!box) return;

    const editing = editingHero || null;
    const values = editing ? heroFormValuesFromHero(editing) : defaultHeroFormValues();

    // Radio: mỗi tướng chỉ giữ 1 vai trò — dữ liệu cũ có 2 vai trò thì lấy vai trò đầu.
    const checkedRole = values.roles[0] || '';
    const rolesHtml = HERO_ROLES.map((role) => `
        <label class="hero-role-option">
            <input type="radio" name="hero-role" value="${escapeHtml(role)}"${checkedRole === role ? ' checked' : ''}>
            ${escapeHtml(role)}
        </label>
    `).join('');

    const statsHtml = HERO_STAT_KEYS.map((key) => `
        <div class="hero-stat-field">
            <label for="hero-stat-${key}">${escapeHtml(HERO_ADMIN_STAT_LABELS[key] || key)}</label>
            <input type="number" min="0" max="${HERO_STAT_LIMITS[key] - 1}" step="any" id="hero-stat-${key}" value="${escapeHtml(values.stats[key])}">
        </div>
    `).join('');

    const difficultyHtml = HERO_DIFFICULTIES.map((level) => `
        <option value="${level}"${String(values.difficulty) === String(level) ? ' selected' : ''}>${escapeHtml(DIFFICULTY_LABEL[level] || `Độ khó ${level}`)}</option>
    `).join('');

    box.innerHTML = `
        <form class="feed-form${editing ? ' is-editing' : ''}" id="hero-form" novalidate${editing ? ` data-edit-id="${escapeHtml(editing.id)}"` : ''}>
            <h2>${editing ? 'Sửa tướng' : 'Thêm tướng mới'}</h2>
            ${editing ? `<p class="feed-form__hint">Đang sửa tướng “${escapeHtml(editing.name)}” (mã ${escapeHtml(editing.id)}). Thay đổi sẽ ghi đè tướng cũ, giữ nguyên id.</p>` : ''}
            <div id="hero-form-errors"></div>

            <div class="form-group">
                <label for="hero-name">Tên tướng *</label>
                <input type="text" id="hero-name" placeholder="Ví dụ: Valhein" value="${escapeHtml(values.name)}">
            </div>

            <div class="form-group">
                <label for="hero-image">Ảnh tướng</label>
                <div class="hero-image-field">
                    <input
                        type="text"
                        id="hero-image"
                        readonly
                        placeholder="Chưa chọn ảnh — nhấn vào ô này để chọn từ máy"
                        value="${escapeHtml(values.image)}"
                        aria-describedby="hero-image-hint"
                    >
                    <input type="file" id="hero-image-file" accept="image/*" hidden>
                    <button type="button" class="btn btn-outline btn-sm" data-hero-pick-image>Chọn ảnh...</button>
                    <button type="button" class="btn btn-outline btn-sm" data-hero-clear-image>Xoá ảnh</button>
                </div>
                <div id="hero-image-preview">${values.image ? `<img src="${escapeHtml(imageUrl(values.image))}" alt="Ảnh xem trước">` : ''}</div>
                <p class="hero-image-hint" id="hero-image-hint">Nhấn vào ô ảnh hoặc nút “Chọn ảnh...” để mở File Explorer, chọn ảnh từ máy (JPG, PNG...). Ảnh được cắt giữa về tỉ lệ 1:1 và nén về ${HERO_IMAGE_MAX_EDGE}px trước khi lưu, không cần dán link.</p>
            </div>

            <div class="form-group">
                <label>Vai trò * (mỗi tướng 1 vai trò)</label>
                <div class="hero-role-options">${rolesHtml}</div>
            </div>

            <div class="form-group">
                <label for="hero-difficulty">Độ khó *</label>
                <select id="hero-difficulty">${difficultyHtml}</select>
            </div>

            <div class="form-group">
                <label>Chỉ số cơ bản * (Máu &lt; 10000, chỉ số còn lại &lt; 1000)</label>
                <div class="hero-stat-grid">${statsHtml}</div>
            </div>

            <div class="form-group">
                <label>Bộ kỹ năng (3 chiêu cố định)</label>
                <div id="hero-skill-rows">${values.skills.map(renderHeroSkillRow).join('')}</div>
            </div>

            <div class="form-group">
                <label for="hero-build">Trang bị đề xuất</label>
                <input type="text" id="hero-build" placeholder="101, 102, 103 (mã trang bị, cách nhau dấu phẩy)" value="${escapeHtml((values.recommendedBuild || []).join(', '))}">
            </div>

            <div class="feed-form__actions">
                <button type="submit" class="btn btn-primary">${editing ? 'Lưu thay đổi' : 'Thêm tướng'}</button>
                ${editing ? '<button type="button" class="btn btn-outline" data-hero-cancel>Huỷ</button>' : ''}
            </div>
        </form>
    `;

    const form = box.querySelector('#hero-form');
    if (!form) return;

    attachHeroImagePicker(form);

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const input = readHeroFormValues(form);
        const checked = validateHeroForm(input);
        const errorBox = form.querySelector('#hero-form-errors');

        renderErrors(errorBox, checked.errors);
        if (!checked.valid) return;

        const editId = form.dataset.editId;

        if (editId) {
            // Sửa tướng cũ: giữ nguyên id, chỉ đổi nội dung.
            const updated = updateHero(editId, input);
            if (!updated) {
                renderErrors(errorBox, ['Không lưu được tướng. Bạn cần đăng nhập bằng tài khoản quản trị viên.']);
                return;
            }

            // Vẽ lại form ở chế độ sửa với dữ liệu vừa lưu rồi báo thành công.
            renderHeroAdminForm(updated);
            renderSuccess(
                document.getElementById('hero-admin-form').querySelector('#hero-form-errors'),
                `Đã cập nhật tướng "${updated.name}".`,
            );
            renderHeroAdminTable();
            return;
        }

        const created = createHero(input);
        if (!created) {
            renderErrors(errorBox, ['Không lưu được tướng. Hãy thử lại hoặc kiểm tra dung lượng trình duyệt.']);
            return;
        }

        // Thêm xong thì quay về form trống để sẵn sàng thêm tướng tiếp theo.
        renderHeroAdminForm(null);
        renderSuccess(
            document.getElementById('hero-admin-form').querySelector('#hero-form-errors'),
            `Đã thêm tướng "${created.name}" (mã ${created.id}).`,
        );
        renderHeroAdminTable();
    });
}

/* ---------- Thông báo khi không có quyền ---------- */

/**
 * Thông báo cho người dùng không có quyền (đã đăng nhập nhưng không phải admin).
 * Không vẽ form, không vẽ bảng, không đụng dữ liệu.
 */
function renderHeroAdminDenied() {
    const formBox = document.getElementById('hero-admin-form');
    if (formBox) formBox.innerHTML = '';

    const toolbar = document.getElementById('hero-admin-toolbar');
    if (toolbar) toolbar.innerHTML = '';

    const tableBox = document.getElementById('hero-admin-list');
    if (!tableBox) return;

    tableBox.innerHTML = `
        <div class="post-detail-empty">
            ${renderNotFound('Bạn không có quyền truy cập trang Quản lý tướng.')}
            <p class="post-detail-empty__actions">
                <a class="btn btn-outline" href="${BASE_PATH}index.html">← Về trang chủ</a>
            </p>
        </div>
    `;
}

/* ---------- Khởi tạo trang ---------- */

/**
 * Khởi tạo trang quản lý tướng.
 * Chạy tự thoát nếu trang không có #hero-admin-list để file này có thể nạp thừa
 * ở trang khác mà không làm hỏng trang đó.
 */
async function initHeroAdminPage() {
    const tableBox = document.getElementById('hero-admin-list');
    if (!tableBox) return;

    // requireAdmin() đã được gọi sớm ở đầu hero-admin.html. Ở đây chỉ kiểm tra
    // lại bằng isAdmin() sau khi chờ usersReady (tức aov_users chắc chắn đã có role),
    // vẫn fail-closed: không xác minh được là admin thì không vẽ gì cả.
    await usersReady;

    if (typeof isAdmin !== 'function' || !isAdmin()) {
        renderHeroAdminDenied();
        return;
    }

    // Tướng mẫu trong data/heroes.json phải được merge vào aov_heroes trước
    // thì bảng mới đầy đủ (cùng cách mọi trang đọc tướng đang làm).
    await loadHeroes();

    renderHeroAdminForm(null);
    renderHeroAdminToolbar();
    renderHeroAdminTable();
}

/* ---------- Sự kiện thêm / sửa / xoá ---------- */

/*
 * Form và bảng đều được vẽ động bằng innerHTML nên không gắn sự kiện cho từng nút,
 * mà gắn một lần ở cấp document rồi dò theo data attribute (event delegation),
 * đúng cách admin.js xử lý nút ẩn / xoá bài.
 */
document.addEventListener('click', (event) => {
    // Nút "Thêm tướng" trên thanh công cụ: quay về form trống.
    const addBtn = event.target.closest('[data-hero-add]');
    if (addBtn) {
        renderHeroAdminForm(null);
        const formBox = document.getElementById('hero-admin-form');
        if (formBox && formBox.scrollIntoView) formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    // Nút "Huỷ" trong form sửa: bỏ thay đổi, về form thêm mới.
    const cancelBtn = event.target.closest('[data-hero-cancel]');
    if (cancelBtn) {
        renderHeroAdminForm(null);
        return;
    }

    /*
     * Bấm vào ô ảnh (readonly) hoặc nút "Chọn ảnh...": mở File Explorer thay vì
     * cho gõ tay link. Gọi .click() lên <input type="file"> ẩn là cách chuẩn để
     * mở hộp thoại chọn file của hệ điều hành.
     */
    const pickImageBtn = event.target.closest('[data-hero-pick-image]');
    const imageField = event.target.closest('#hero-image');
    if (pickImageBtn || imageField) {
        const form = document.getElementById('hero-form');
        const fileInput = form && form.querySelector('#hero-image-file');
        if (fileInput && typeof fileInput.click === 'function') fileInput.click();
        return;
    }

    // Nút "Xoá ảnh": bỏ ảnh đang chọn trên form (mới ghi vào tướng khi bấm thêm/sửa).
    const clearImageBtn = event.target.closest('[data-hero-clear-image]');
    if (clearImageBtn) {
        const form = document.getElementById('hero-form');
        if (!form) return;

        const imageInput = form.querySelector('#hero-image');
        const fileInput = form.querySelector('#hero-image-file');
        if (imageInput) imageInput.value = '';
        if (fileInput) fileInput.value = '';
        renderHeroImagePreview(form, '');
        return;
    }

    // Nút "Sửa": mở form ở chế độ sửa, điền sẵn dữ liệu của tướng đó.
    const editBtn = event.target.closest('[data-hero-edit]');
    if (editBtn) {
        const hero = findHeroById(editBtn.dataset.heroEdit);
        if (!hero) {
            alert('Không tìm thấy tướng cần sửa.');
            return;
        }

        renderHeroAdminForm(hero);
        const formBox = document.getElementById('hero-admin-form');
        if (formBox && formBox.scrollIntoView) formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    // Nút "Xóa": hỏi lại rồi xoá hẳn tướng (deleteHero() tự kiểm tra quyền).
    const deleteBtn = event.target.closest('[data-hero-delete]');
    if (deleteBtn) {
        const hero = findHeroById(deleteBtn.dataset.heroDelete);
        if (!hero) {
            alert('Không tìm thấy tướng cần xóa.');
            return;
        }

        if (!confirm(`Xóa vĩnh viễn tướng "${hero.name}"? Yêu thích, lịch sử và so sánh của tướng này cũng sẽ bị dọn.`)) return;

        if (!deleteHero(hero.id)) {
            alert('Không xóa được tướng. Bạn cần đăng nhập bằng tài khoản quản trị viên.');
            return;
        }

        // Đang sửa đúng tướng vừa bị xoá thì quay về form thêm mới.
        const form = document.getElementById('hero-form');
        if (form && form.dataset.editId && normalizeHeroId(form.dataset.editId) === normalizeHeroId(hero.id)) {
            renderHeroAdminForm(null);
        }

        renderHeroAdminTable();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initHeroAdminPage();
    } catch (error) {
        console.error('Không khởi tạo được trang Quản lý tướng', error);
    }
});
