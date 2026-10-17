/**
 * build-submit.js - Trang Gửi hướng dẫn build (pages/build-submit.html)
 * Phụ trách: Người 2 (TV2)
 *
 * NHIỆM VỤ HD06 - Giao diện + logic form cho người dùng gửi hướng dẫn build của riêng họ.
 *   - Khách: hiện lời mời đăng nhập (giống form đăng bài ở feed.js).
 *   - Đã đăng nhập: form chọn tướng, tên hướng dẫn, đường đi, lối chơi, trang bị (tối đa 6),
 *     mô tả, thứ tự nâng kỹ năng và mẹo chơi.
 *   - validateBuildSubmission() kiểm tra dữ liệu (tướng/đường/trang bị phải có thật).
 *   - addBuildSubmission() (storage.js) lưu vào LocalStorage aov_build_submissions;
 *     build cộng đồng hiện lại ở mục "Build cộng đồng" (build.js) và mở được ở build-detail.html.
 *
 * Dùng lại: loadData()/DATA_PATH/BASE_PATH (loadData.js, config.js), loadHeroes() (heroData.js),
 * escapeHtml()/imageUrl()/handleImageError() (components.js), auth.js (isLoggedIn/getCurrentUser),
 * storage.js (getBuildSubmissions/addBuildSubmission/toStorageId).
 */

/** Thứ tự đường đi gợi ý (khớp build.js để form và bộ lọc dùng cùng bộ giá trị). */
const BUILD_SUBMIT_LANES = ['Đường Rồng', 'Rừng', 'Đường Giữa', 'Đường Trên'];

/** Giới hạn nhập liệu của form gửi build. */
const BUILD_SUBMIT_NAME_MIN = 2;
const BUILD_SUBMIT_DESC_MIN = 10;
const BUILD_SUBMIT_ITEMS_MAX = 6;

/** Dữ liệu tướng / trang bị nạp một lần cho cả trang. */
let submitHeroes = [];
let submitItems = [];

document.addEventListener('DOMContentLoaded', initBuildSubmitPage);

async function initBuildSubmitPage() {
    const formBox = document.getElementById('build-submit-form');
    if (!formBox) return;

    submitHeroes = await loadHeroes();
    submitItems = await loadData(DATA_PATH.items);

    if (!Array.isArray(submitHeroes)) submitHeroes = [];
    if (!Array.isArray(submitItems)) submitItems = [];

    renderBuildSubmitForm();
    renderSubmittedBuildList();
}

/**
 * Vẽ form gửi build, hoặc lời mời đăng nhập khi là khách.
 * @param {object} [savedBuild] build vừa gửi thành công (hiện thông báo + link xem lại).
 */
function renderBuildSubmitForm(savedBuild) {
    const box = document.getElementById('build-submit-form');
    if (!box) return;

    if (!isLoggedIn()) {
        box.innerHTML = `
            <div class="build-submit build-submit--guest">
                <p>Bạn cần đăng nhập để gửi hướng dẫn build của riêng mình.</p>
                <a class="btn btn-primary" href="${BASE_PATH}src/pages/login.html">Đăng nhập</a>
            </div>
        `;
        return;
    }

    const messageHtml = savedBuild
        ? `<p class="build-submit__message" role="status">
                Đã gửi hướng dẫn "${escapeHtml(savedBuild.name)}".
                <a href="${BASE_PATH}src/pages/build-detail.html?id=${escapeHtml(savedBuild.id)}">Xem hướng dẫn vừa gửi</a>
           </p>`
        : '';

    box.innerHTML = `
        <form class="build-submit" id="build-submit-form-el" novalidate>
            ${messageHtml}
            <div class="build-submit__errors" data-build-submit-errors hidden></div>

            <label class="build-submit__field">
                <span>Tướng <em>*</em></span>
                <select id="build-submit-hero" required>
                    <option value="">-- Chọn tướng --</option>
                    ${submitHeroes.map((hero) => `<option value="${escapeHtml(hero.id)}">${escapeHtml(hero.name)}</option>`).join('')}
                </select>
            </label>

            <label class="build-submit__field">
                <span>Tên hướng dẫn <em>*</em></span>
                <input id="build-submit-name" type="text" maxlength="80" placeholder="VD: Build sát thương chuẩn" required>
            </label>

            <label class="build-submit__field">
                <span>Đường đi <em>*</em></span>
                <select id="build-submit-lane" required>
                    <option value="">-- Chọn đường --</option>
                    ${BUILD_SUBMIT_LANES.map((lane) => `<option value="${escapeHtml(lane)}">${escapeHtml(lane)}</option>`).join('')}
                </select>
            </label>

            <label class="build-submit__field">
                <span>Lối chơi</span>
                <input id="build-submit-playstyle" type="text" maxlength="200" placeholder="VD: bám tuyến sau, cấu rỉa rồi vào giao tranh">
            </label>

            <fieldset class="build-submit__field build-submit__items">
                <legend>Trang bị (chọn tối đa ${BUILD_SUBMIT_ITEMS_MAX}) <em>*</em></legend>
                <p class="build-submit__hint">Đã chọn <strong data-build-submit-count>0</strong>/${BUILD_SUBMIT_ITEMS_MAX}</p>
                <div class="build-submit__item-grid">
                    ${submitItems.map((item) => `
                        <label class="build-submit__item">
                            <input type="checkbox" name="build-submit-item" value="${escapeHtml(item.id)}" data-build-submit-item>
                            <img src="${imageUrl(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="handleImageError(this)">
                            <span>${escapeHtml(item.name)}</span>
                        </label>
                    `).join('')}
                </div>
            </fieldset>

            <label class="build-submit__field">
                <span>Mô tả / hướng dẫn <em>*</em></span>
                <textarea id="build-submit-desc" rows="5" placeholder="Cách lên đồ, thời điểm giao tranh, lưu ý khi đối đầu..." required></textarea>
            </label>

            <label class="build-submit__field">
                <span>Thứ tự nâng kỹ năng</span>
                <input id="build-submit-skill" type="text" maxlength="120" placeholder="VD: Chiêu 1 > Chiêu 2 > Chiêu 3">
            </label>

            <label class="build-submit__field">
                <span>Mẹo chơi (mỗi dòng một mẹo)</span>
                <textarea id="build-submit-tips" rows="3" placeholder="Mỗi dòng là một mẹo chơi"></textarea>
            </label>

            <div class="build-submit__actions">
                <button type="submit" class="btn btn-primary">Gửi hướng dẫn</button>
                <button type="reset" class="btn btn-outline">Nhập lại</button>
            </div>
        </form>
    `;

    const form = box.querySelector('#build-submit-form-el');
    if (!form) return;

    form.addEventListener('submit', handleBuildSubmitFormSubmit);
    form.addEventListener('change', (event) => {
        const target = event.target;
        if (target && typeof target.matches === 'function' && target.matches('[data-build-submit-item]')) {
            updateBuildSubmitItemCount(form);
        }
    });
}

/** Đọc giá trị text của một trường trong form (rỗng nếu không có). */
function readBuildSubmitField(form, selector) {
    const field = form && typeof form.querySelector === 'function' ? form.querySelector(selector) : null;
    return field ? String(field.value || '') : '';
}

/** Danh sách checkbox trang bị đang được tick, theo thứ tự trong DOM. */
function getCheckedSubmitItems(form) {
    const inputs = form && typeof form.querySelectorAll === 'function'
        ? form.querySelectorAll('[data-build-submit-item]')
        : [];

    return Array.prototype.slice.call(inputs).filter((input) => input.checked);
}

/**
 * Cập nhật bộ đếm trang bị + chặn tick quá BUILD_SUBMIT_ITEMS_MAX ô.
 * @param {HTMLFormElement} form
 */
function updateBuildSubmitItemCount(form) {
    let checked = getCheckedSubmitItems(form);

    if (checked.length > BUILD_SUBMIT_ITEMS_MAX) {
        // Bỏ tick những ô vượt quá giới hạn (giữ nguyên các ô chọn trước).
        checked.slice(BUILD_SUBMIT_ITEMS_MAX).forEach((input) => { input.checked = false; });
        checked = checked.slice(0, BUILD_SUBMIT_ITEMS_MAX);
    }

    const counter = form && typeof form.querySelector === 'function'
        ? form.querySelector('[data-build-submit-count]')
        : null;
    if (counter) counter.textContent = String(checked.length);
}

/** Hiện danh sách lỗi (hoặc ẩn đi khi không còn lỗi) trong form. */
function renderBuildSubmitErrors(form, errors) {
    const box = form && typeof form.querySelector === 'function'
        ? form.querySelector('[data-build-submit-errors]')
        : null;
    if (!box) return;

    box.hidden = !errors.length;
    box.innerHTML = errors.length
        ? `<ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`
        : '';
}

/**
 * Kiểm tra dữ liệu form gửi build. Tách riêng để test được mà không cần DOM.
 * @param {object} values - { heroId, name, lane, playstyle, items[], description, skillOrder, tips[] }
 * @param {{ heroes?: object[], items?: object[], author?: string }} [context]
 * @returns {{ valid: boolean, errors: string[], values: object }}
 */
function validateBuildSubmission(values, context) {
    const options = context || {};
    const heroes = Array.isArray(options.heroes) ? options.heroes : [];
    const items = Array.isArray(options.items) ? options.items : [];
    const author = String(options.author === undefined || options.author === null ? '' : options.author).trim();
    const source = values && typeof values === 'object' ? values : {};

    const errors = [];

    if (!author) errors.push('Bạn cần đăng nhập để gửi hướng dẫn build.');

    const heroId = toStorageId(source.heroId);
    const hero = heroes.find((row) => String(row.id) === String(heroId));
    if (heroId === null) errors.push('Vui lòng chọn tướng cho hướng dẫn.');
    else if (!hero) errors.push('Tướng bạn chọn không có trong dữ liệu.');

    const name = String(source.name || '').trim();
    if (!name) errors.push('Tên hướng dẫn không được để trống.');
    else if (name.length < BUILD_SUBMIT_NAME_MIN) errors.push(`Tên hướng dẫn phải có ít nhất ${BUILD_SUBMIT_NAME_MIN} ký tự.`);

    const lane = String(source.lane || '').trim();
    if (!BUILD_SUBMIT_LANES.includes(lane)) errors.push('Vui lòng chọn đường đi cho hướng dẫn.');

    const itemIds = (Array.isArray(source.items) ? source.items : [])
        .map((id) => toStorageId(id))
        .filter((id) => id !== null);
    const realItemIds = itemIds.filter((id) => items.some((item) => String(item.id) === String(id)));
    if (!realItemIds.length) errors.push('Chọn ít nhất một trang bị cho hướng dẫn.');
    else if (realItemIds.length > BUILD_SUBMIT_ITEMS_MAX) errors.push(`Chỉ được chọn tối đa ${BUILD_SUBMIT_ITEMS_MAX} trang bị.`);

    const description = String(source.description || '').trim();
    if (!description) errors.push('Mô tả hướng dẫn không được để trống.');
    else if (description.length < BUILD_SUBMIT_DESC_MIN) errors.push(`Mô tả phải có ít nhất ${BUILD_SUBMIT_DESC_MIN} ký tự.`);

    const tips = (Array.isArray(source.tips) ? source.tips : [])
        .map((tip) => String(tip || '').trim())
        .filter(Boolean);

    return {
        valid: errors.length === 0,
        errors,
        values: {
            heroId: hero ? hero.id : heroId,
            name,
            lane,
            playstyle: String(source.playstyle || '').trim(),
            items: realItemIds,
            description,
            skillOrder: String(source.skillOrder || '').trim(),
            tips,
            author,
        },
    };
}

/** Xử lý submit form: validate -> lưu LocalStorage -> vẽ lại thông báo + danh sách đã gửi. */
function handleBuildSubmitFormSubmit(event) {
    event.preventDefault();

    const form = event.target;
    const values = {
        heroId: readBuildSubmitField(form, '#build-submit-hero'),
        name: readBuildSubmitField(form, '#build-submit-name'),
        lane: readBuildSubmitField(form, '#build-submit-lane'),
        playstyle: readBuildSubmitField(form, '#build-submit-playstyle'),
        items: getCheckedSubmitItems(form).map((input) => input.value),
        description: readBuildSubmitField(form, '#build-submit-desc'),
        skillOrder: readBuildSubmitField(form, '#build-submit-skill'),
        tips: readBuildSubmitField(form, '#build-submit-tips').split('\n'),
    };

    const result = validateBuildSubmission(values, {
        heroes: submitHeroes,
        items: submitItems,
        author: getCurrentUser(),
    });

    if (!result.valid) {
        renderBuildSubmitErrors(form, result.errors);
        return;
    }

    const saved = addBuildSubmission(result.values);
    if (!saved) {
        renderBuildSubmitErrors(form, ['Không lưu được hướng dẫn. Bộ nhớ trình duyệt có thể đã đầy hoặc bị chặn.']);
        return;
    }

    renderBuildSubmitForm(saved);
    renderSubmittedBuildList();
}

/** Danh sách hướng dẫn do người đang đăng nhập gửi (mục "Hướng dẫn bạn đã gửi"). */
function renderSubmittedBuildList() {
    const section = document.getElementById('build-submit-mine');
    const listContainer = document.getElementById('build-submit-list');
    if (!listContainer) return;

    const user = String(getCurrentUser() || '').trim();
    const mine = typeof getBuildSubmissions === 'function'
        ? getBuildSubmissions().filter((row) => String(row.author || '').trim() === user)
        : [];

    if (section) section.hidden = mine.length === 0;
    listContainer.innerHTML = mine.map(renderSubmittedBuildCard).join('');
}

/**
 * Thẻ tóm tắt một hướng dẫn đã gửi, có link mở trang chi tiết.
 * @param {object} build
 * @returns {string}
 */
function renderSubmittedBuildCard(build) {
    const hero = submitHeroes.find((row) => String(row.id) === String(build.heroId));
    const heroName = hero ? hero.name : 'Tướng chưa xác định';
    const cardItems = (build.items || [])
        .map((id) => submitItems.find((item) => String(item.id) === String(id)))
        .filter(Boolean);
    const href = `${BASE_PATH}src/pages/build-detail.html?id=${escapeHtml(build.id)}`;

    return `
        <article class="build-card build-card--community">
            <div class="build-card__body">
                <h2 class="build-card__name">${escapeHtml(build.name)}</h2>
                <div class="build-card__facts">
                    <span class="badge">${escapeHtml(heroName)}</span>
                    ${build.lane ? `<span class="badge build-card__lane">${escapeHtml(build.lane)}</span>` : ''}
                    <span class="build-card__fact">${cardItems.length} trang bị</span>
                </div>
                ${build.description ? `<p>${escapeHtml(build.description)}</p>` : ''}
                <div class="build-card__actions">
                    <a class="build-card__link" href="${href}">Xem hướng dẫn <span aria-hidden="true">→</span></a>
                </div>
            </div>
        </article>
    `;
}
