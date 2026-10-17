/**
 * HD06-b - build-submit.js
 * Phụ trách: Logic trang gửi build hướng dẫn (src/pages/build-submit.html)
 * - Kiểm tra đăng nhập/banned, tải tướng/trang bị, chọn giai đoạn, mẹo chơi
 * - Validate, kiểm duyệt nội dung (nếu hàm có sẵn), lưu vào localStorage 'aov_build_submissions'
 * - Không ghi src/data/*.json, không đụng CSS
 *
 * Hàm dùng lại: getCurrentUser/isLoggedIn/isUserBanned (auth.js), escapeHtml/imageUrl (components.js),
 * loadHeroes() (heroData.js), loadData(DATA_PATH.items) (loadData.js/config.js).
 */
(function () {
    const PHASE_NAMES = ['Đầu trận', 'Giữa trận', 'Cuối trận'];
    const MAX_ITEMS_PER_PHASE = 3;
    const MAX_ITEMS_TOTAL = 6;
    const MAX_TIPS = 5;
    const MAX_TIP_LEN = 150;
    const MAX_NAME = 60;
    const MIN_NAME = 2;
    const MAX_PLAYSTYLE = 500;
    const MIN_PLAYSTYLE = 10;
    const MAX_SKILLORDER = 120;
    const MAX_PHASENOTE = 200;
    const SUBMISSIONS_KEY = 'aov_build_submissions';
    const MAX_PENDING_PER_USER = 3;
    const MODERATION_MAX_LEN_TOTAL = 5000;

    function q(id) {
        return document.getElementById(id);
    }

    function hasClassify() {
        return typeof classifyContent === 'function';
    }

    function hasModerateContent() {
        return typeof moderateContent === 'function';
    }

    function gatherText() {
        const parts = [];
        const name = q('bs-name');
        const playstyle = q('bs-playstyle');
        const skillOrder = q('bs-skill-order');
        const phase0Note = q('bs-phase-0-note');
        const phase1Note = q('bs-phase-1-note');
        const phase2Note = q('bs-phase-2-note');
        if (name && name.value) parts.push(name.value);
        if (playstyle && playstyle.value) parts.push(playstyle.value);
        if (skillOrder && skillOrder.value) parts.push(skillOrder.value);
        if (phase0Note && phase0Note.value) parts.push(phase0Note.value);
        if (phase1Note && phase1Note.value) parts.push(phase1Note.value);
        if (phase2Note && phase2Note.value) parts.push(phase2Note.value);
        const tips = document.querySelectorAll('#bs-tips-list input');
        tips.forEach((t) => {
            if (t.value) parts.push(t.value);
        });
        return parts.join(' ');
    }

    function passesModeration() {
        if (!hasClassify()) return true;
        try {
            const texts = [gatherText()];
            const res = classifyContent(texts.join('\n'), (typeof getBannedEntries === 'function') ? getBannedEntries() : []);
            if (res && typeof res.level === 'number' && res.level > 1) return false;
        } catch (e) {
            return true;
        }
        return true;
    }

    function getCurrentUsername() {
        if (typeof getCurrentUser === 'function') return getCurrentUser();
        try {
            return localStorage.getItem('aov_current_user');
        } catch (e) {
            return null;
        }
    }

    function isUserBannedSafe(username) {
        if (typeof isUserBanned === 'function') {
            try {
                return isUserBanned(username);
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    function isLoggedInSafe() {
        const u = getCurrentUsername();
        if (!u) return false;
        if (isUserBannedSafe(u)) return false;
        return true;
    }

    function loadSubmissions() {
        try {
            const raw = localStorage.getItem(SUBMISSIONS_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveSubmissions(list) {
        try {
            localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(list));
            return true;
        } catch (e) {
            return false;
        }
    }

    function escapeHtmlSafe(v) {
        if (typeof escapeHtml === 'function') return escapeHtml(v);
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function imageUrlSafe(v) {
        if (typeof imageUrl === 'function') return imageUrl(v);
        return String(v || '');
    }

    let heroesList = [];
    let itemsList = [];
    let selectedItemsByPhase = [[], [], []];

    function updatePreview() {
        const el = q('bs-items-preview');
        if (!el) return;
        let html = '';
        for (let p = 0; p < 3; p++) {
            const list = selectedItemsByPhase[p];
            list.forEach((it) => {
                html += '<span class="build-submit-preview__item">' +
                    '<img src="' + imageUrlSafe(it.image) + '" alt="' + escapeHtmlSafe(it.name) + '">' +
                    '<span>' + escapeHtmlSafe(it.name) + '</span>' +
                    '</span>';
            });
        }
        el.innerHTML = html;
    }

    function countTotalSelected() {
        return selectedItemsByPhase[0].length + selectedItemsByPhase[1].length + selectedItemsByPhase[2].length;
    }

    function renderItems() {
        for (let p = 0; p < 3; p++) {
            const cont = q('bs-phase-' + p + '-items');
            if (!cont) continue;
            cont.innerHTML = '';
            const filterInput = document.createElement('input');
            filterInput.type = 'text';
            filterInput.placeholder = 'Lọc trang bị...';
            filterInput.className = 'build-submit-filter';
            cont.appendChild(filterInput);
            const grid = document.createElement('div');
            grid.className = 'build-submit-items-grid';
            cont.appendChild(grid);
            itemsList.forEach((it) => {
                const id = 'bs-item-' + p + '-' + it.id;
                const wrapper = document.createElement('label');
                wrapper.className = 'build-submit-item';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = it.id;
                cb.id = id;
                const inPhase = selectedItemsByPhase[p].some((x) => x.id === it.id);
                cb.checked = inPhase;
                cb.addEventListener('change', function () {
                    if (this.checked) {
                        if (countTotalSelected() >= MAX_ITEMS_TOTAL) {
                            this.checked = false;
                            return;
                        }
                        if (selectedItemsByPhase[p].length >= MAX_ITEMS_PER_PHASE) {
                            this.checked = false;
                            return;
                        }
                        if (!selectedItemsByPhase[p].some((x) => x.id === it.id)) {
                            selectedItemsByPhase[p].push(it);
                        }
                    } else {
                        selectedItemsByPhase[p] = selectedItemsByPhase[p].filter((x) => x.id !== it.id);
                    }
                    updatePreview();
                });
                wrapper.appendChild(cb);
                const img = document.createElement('img');
                img.src = imageUrlSafe(it.image);
                img.alt = escapeHtmlSafe(it.name);
                wrapper.appendChild(img);
                const span = document.createElement('span');
                span.textContent = it.name;
                wrapper.appendChild(span);
                grid.appendChild(wrapper);
            });
            filterInput.addEventListener('input', function () {
                const v = this.value.toLowerCase();
                grid.querySelectorAll('.build-submit-item').forEach((el) => {
                    const name = el.querySelector('span');
                    const txt = name ? name.textContent.toLowerCase() : '';
                    el.style.display = txt.indexOf(v) >= 0 ? '' : 'none';
                });
            });
        }
        updatePreview();
    }

    function renderTips() {
        const list = q('bs-tips-list');
        const addBtn = q('bs-tip-add');
        if (!list || !addBtn) return;
        list.innerHTML = '';
        for (let i = 0; i < MAX_TIPS; i++) {
            const wrap = document.createElement('div');
            wrap.className = 'build-submit-tip';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.maxLength = MAX_TIP_LEN;
            wrap.appendChild(inp);
            const del = document.createElement('button');
            del.type = 'button';
            del.textContent = 'Xóa';
            del.addEventListener('click', function () {
                wrap.remove();
                updateAddTip();
            });
            wrap.appendChild(del);
            list.appendChild(wrap);
        }
        updateAddTip();
        addBtn.onclick = function () {
            const tips = list.querySelectorAll('.build-submit-tip');
            if (tips.length < MAX_TIPS) {
                const wrap = document.createElement('div');
                wrap.className = 'build-submit-tip';
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.maxLength = MAX_TIP_LEN;
                wrap.appendChild(inp);
                const del = document.createElement('button');
                del.type = 'button';
                del.textContent = 'Xóa';
                del.addEventListener('click', function () {
                    wrap.remove();
                    updateAddTip();
                });
                wrap.appendChild(del);
                list.appendChild(wrap);
            }
            updateAddTip();
        };
    }

    function updateAddTip() {
        const list = q('bs-tips-list');
        const addBtn = q('bs-tip-add');
        if (!list || !addBtn) return;
        const tips = list.querySelectorAll('.build-submit-tip');
        addBtn.disabled = tips.length >= MAX_TIPS;
    }

    function clearErrors() {
        document.querySelectorAll('.form-error').forEach((el) => {
            el.hidden = true;
            el.textContent = '';
        });
    }

    function showError(name, msg) {
        const el = document.querySelector('[data-error-for="' + name + '"]');
        if (el) {
            el.hidden = false;
            el.textContent = msg;
            return el;
        }
        return null;
    }

    function validate() {
        clearErrors();
        const heroSel = q('bs-hero');
        const nameInp = q('bs-name');
        const laneSel = q('bs-lane');
        const playstyle = q('bs-playstyle');
        const skillOrder = q('bs-skill-order');
        const phase0Note = q('bs-phase-0-note');
        const phase1Note = q('bs-phase-1-note');
        const phase2Note = q('bs-phase-2-note');
        if (!heroSel || !heroSel.value) {
            const el = showError('hero', 'Vui lòng chọn tướng.');
            if (el) el.focus();
            return false;
        }
        const nameVal = nameInp && nameInp.value ? nameInp.value.trim() : '';
        if (nameVal.length < MIN_NAME || nameVal.length > MAX_NAME) {
            const el = showError('name', 'Tên build phải từ 2 đến 60 ký tự.');
            if (el) el.focus();
            return false;
        }
        if (!laneSel || !laneSel.value) {
            const el = showError('lane', 'Vui lòng chọn đường.');
            if (el) el.focus();
            return false;
        }
        const playVal = playstyle && playstyle.value ? playstyle.value.trim() : '';
        if (playVal.length < MIN_PLAYSTYLE || playVal.length > MAX_PLAYSTYLE) {
            const el = showError('playstyle', 'Lối chơi phải từ 10 đến 500 ký tự.');
            if (el) el.focus();
            return false;
        }
        const skillVal = skillOrder && skillOrder.value ? skillOrder.value.trim() : '';
        if (skillVal.length > MAX_SKILLORDER) {
            const el = showError('skillOrder', 'Thứ tự nâng kỹ năng tối đa 120 ký tự.');
            if (el) el.focus();
            return false;
        }
        const total = countTotalSelected();
        if (total < 3 || total > MAX_ITEMS_TOTAL) {
            alert('Cần chọn từ 3 đến 6 trang bị tổng cộng.');
            return false;
        }
        const p0n = phase0Note && phase0Note.value ? phase0Note.value.trim() : '';
        const p1n = phase1Note && phase1Note.value ? phase1Note.value.trim() : '';
        const p2n = phase2Note && phase2Note.value ? phase2Note.value.trim() : '';
        if (p0n.length > MAX_PHASENOTE || p1n.length > MAX_PHASENOTE || p2n.length > MAX_PHASENOTE) {
            showError('phase0Note', p0n.length > MAX_PHASENOTE ? 'Ghi chú tối đa 200 ký tự.' : '');
            showError('phase1Note', p1n.length > MAX_PHASENOTE ? 'Ghi chú tối đa 200 ký tự.' : '');
            showError('phase2Note', p2n.length > MAX_PHASENOTE ? 'Ghi chú tối đa 200 ký tự.' : '');
            return false;
        }
        if (!passesModeration()) {
            alert('Nội dung chứa từ ngữ không phù hợp. Vui lòng chỉnh sửa lại.');
            return false;
        }
        return true;
    }

    async function init() {
        const gate = q('build-submit-gate');
        const form = q('build-submit-form');
        const u = getCurrentUsername();
        if (!isLoggedInSafe() || !u) {
            if (gate) gate.hidden = false;
            if (form) form.hidden = true;
            return;
        }
        if (gate) gate.hidden = true;
        if (form) form.hidden = false;
        try {
            if (typeof loadHeroes === 'function') {
                heroesList = await loadHeroes();
            } else if (typeof loadData === 'function' && typeof DATA_PATH !== 'undefined') {
                heroesList = await loadData(DATA_PATH.heroes);
            } else {
                heroesList = [];
            }
        } catch (e) {
            heroesList = [];
        }
        try {
            if (typeof loadData === 'function' && typeof DATA_PATH !== 'undefined') {
                itemsList = await loadData(DATA_PATH.items);
            } else {
                itemsList = [];
            }
        } catch (e) {
            itemsList = [];
        }
        const heroSel = q('bs-hero');
        if (heroSel) {
            heroSel.innerHTML = '<option value="">-- Chọn tướng --</option>';
            heroesList
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'))
                .forEach((h) => {
                    const opt = document.createElement('option');
                    opt.value = h.id;
                    opt.textContent = h.name || h.id;
                    heroSel.appendChild(opt);
                });
        }
        const laneSel = q('bs-lane');
        if (laneSel && laneSel.options.length <= 1) {
            laneSel.innerHTML = '<option value="">-- Chọn đường --</option>' +
                '<option value="Đường Rồng">Đường Rồng</option>' +
                '<option value="Rừng">Rừng</option>' +
                '<option value="Đường Giữa">Đường Giữa</option>' +
                '<option value="Đường Trên">Đường Trên</option>';
        }
        renderItems();
        renderTips();
        if (form) {
            form.onsubmit = function (e) {
                e.preventDefault();
                if (!validate()) return;
                const username = getCurrentUsername();
                const subs = loadSubmissions();
                const pendingCount = subs.filter((s) => s.author === username && s.status === 'pending').length;
                if (pendingCount >= MAX_PENDING_PER_USER) {
                    alert('Bạn đã có 3 build đang chờ duyệt. Vui lòng chờ duyệt xong trước khi gửi thêm.');
                    return;
                }
                const nameVal = (q('bs-name') && q('bs-name').value) ? q('bs-name').value.trim() : '';
                const playVal = (q('bs-playstyle') && q('bs-playstyle').value) ? q('bs-playstyle').value.trim() : '';
                const skillVal = (q('bs-skill-order') && q('bs-skill-order').value) ? q('bs-skill-order').value.trim() : '';
                const p0n = (q('bs-phase-0-note') && q('bs-phase-0-note').value) ? q('bs-phase-0-note').value.trim() : '';
                const p1n = (q('bs-phase-1-note') && q('bs-phase-1-note').value) ? q('bs-phase-1-note').value.trim() : '';
                const p2n = (q('bs-phase-2-note') && q('bs-phase-2-note').value) ? q('bs-phase-2-note').value.trim() : '';
                const tipInputs = document.querySelectorAll('#bs-tips-list input');
                const tipsArr = [];
                tipInputs.forEach((t) => {
                    const v = t.value.trim();
                    if (v) tipsArr.push(v.slice(0, MAX_TIP_LEN));
                });
                const itemsFlat = [];
                for (let p = 0; p < 3; p++) {
                    selectedItemsByPhase[p].forEach((it) => itemsFlat.push(Number(it.id)));
                }
                const record = {
                    id: 'bs_' + Date.now(),
                    heroId: Number(q('bs-hero').value),
                    name: nameVal,
                    lane: q('bs-lane').value,
                    playstyle: playVal,
                    items: itemsFlat,
                    phases: [
                        { name: PHASE_NAMES[0], items: selectedItemsByPhase[0].map((x) => Number(x.id)), note: p0n },
                        { name: PHASE_NAMES[1], items: selectedItemsByPhase[1].map((x) => Number(x.id)), note: p1n },
                        { name: PHASE_NAMES[2], items: selectedItemsByPhase[2].map((x) => Number(x.id)), note: p2n }
                    ],
                    skillOrder: skillVal,
                    tips: tipsArr,
                    author: username,
                    createdAt: new Date().toISOString(),
                    status: 'pending'
                };
                subs.push(record);
                if (!saveSubmissions(subs)) {
                    alert('Không thể lưu build. Vui lòng thử lại.');
                    return;
                }
                form.hidden = true;
                const res = q('build-submit-result');
                if (res) {
                    res.hidden = false;
                    res.innerHTML = '<p>Đã gửi, chờ admin duyệt</p><p><a href="builds.html">Xem danh sách build</a> | <button type="button" id="bs-resend">Gửi build khác</button></p>';
                    const resend = q('bs-resend');
                    if (resend) {
                        resend.onclick = function () {
                            form.reset();
                            selectedItemsByPhase = [[], [], []];
                            renderItems();
                            renderTips();
                            res.hidden = true;
                            form.hidden = false;
                        };
                    }
                }
            };
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

