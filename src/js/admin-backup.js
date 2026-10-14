/**
 * admin-backup.js - Mục "Sao lưu và khôi phục" trong tab "Dữ liệu" (CM04)
 *
 * Trang: src/pages/admin.html?tab=data. admin-shell.js nạp ĐỘNG file này khi mở
 * tab "Dữ liệu", rồi gọi renderAdminBackupSection() để vẽ phần thân mục.
 *
 * DANH SÁCH TRẮNG của tệp sao lưu:
 *   - collections: posts, comments, likes (KHÔNG BAO GIỜ users).
 *   - storage: aov_mod_settings, aov_admin_log, aov_favorites, aov_history, aov_compare.
 *   - heroes: chỉ XUẤT để tham khảo, TUYỆT ĐỐI KHÔNG khôi phục.
 * KHÔNG xuất tài khoản, mật khẩu/salt hay phiên đăng nhập; khi khôi phục cũng bỏ qua.
 * CHỈ admin dùng được. Mọi tên toàn cục có tiền tố adminBackup.
 *
 * Phụ thuộc (kiểm tra typeof trước khi gọi): dataStore.js (getCollection/setCollection/
 * whenDataSaved), storage.js (getStore/setStore), adminlog.js (logAdminAction),
 * auth.js (isAdmin/getCurrentUser), heroData.js (getCachedHeroes/loadHeroes),
 * admin-shell.js (registerAdminSection).
 */

/* ---------- Hằng số: danh sách trắng + giới hạn ---------- */

const adminBackupApp = 'aov-hub-backup';
const adminBackupVersion = 1;
const adminBackupMaxBytes = 5 * 1024 * 1024;

/** Bộ sưu tập được sao lưu (không bao giờ có users). */
const adminBackupCollectionNames = ['posts', 'comments', 'likes'];

/** Key LocalStorage được sao lưu. */
const adminBackupStorageKeys = [
    'aov_mod_settings',
    'aov_admin_log',
    'aov_favorites',
    'aov_history',
    'aov_compare',
];

/** Kiểu cơ bản đúng của từng key storage. */
const adminBackupStorageTypes = {
    aov_mod_settings: 'object',
    aov_admin_log: 'array',
    aov_favorites: 'object',
    aov_history: 'array',
    aov_compare: 'array',
};

/** Mốc riêng để nhận biết key chưa tồn tại khi gọi getStore(). */
const adminBackupMissing = {};

/* ---------- Tiện ích nội bộ ---------- */

/** Thoát ký tự HTML cho chuỗi hiển thị (ưu tiên escapeHtml của components.js). */
function adminBackupEscape(value) {
    if (typeof escapeHtml === 'function') {
        try {
            return escapeHtml(value);
        } catch (error) {
            // Rơi xuống bản dự phòng.
        }
    }

    if (value === null || value === undefined) return '';

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** object thường (không phải mảng/null). */
function adminBackupIsPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Bản sao sâu qua JSON (dữ liệu ở đây luôn là JSON thuần). */
function adminBackupDeepClone(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return value;
    }
}

/** Số byte ước lượng của một chuỗi (UTF-8); thiếu TextEncoder thì ước lượng *2. */
function adminBackupTextBytes(text) {
    try {
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(String(text)).length;
    } catch (error) {
        // Rơi xuống ước lượng bên dưới.
    }

    return String(text).length * 2;
}

/** Quét đệ quy tìm khóa cấm (chốt chặn an toàn). */
function adminBackupHasForbidden(value) {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((item) => adminBackupHasForbidden(item));

    for (const key of Object.keys(value)) {
        if (key === 'users' || key === 'passwordHash' || key === 'salt') return true;
        if (adminBackupHasForbidden(value[key])) return true;
    }

    return false;
}

/** Tên tệp tải về: aov-hub-backup-YYYYMMDD-HHmm.json. */
function adminBackupFileName(date) {
    try {
        const d = date instanceof Date ? date : new Date();
        const pad = (n) => (n < 10 ? '0' + n : String(n));

        return 'aov-hub-backup-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
            + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    } catch (error) {
        return 'aov-hub-backup.json';
    }
}

/* ---------- 1. Dựng tệp sao lưu ---------- */

/**
 * Dựng object sao lưu theo danh sách trắng. Chỉ admin mới chạy.
 * @returns {Promise<object|null>} object sao lưu, hoặc null nếu không phải admin / lỗi.
 */
async function adminBackupBuild() {
    try {
        if (typeof isAdmin !== 'function' || !isAdmin()) return null;

        const collections = {};
        adminBackupCollectionNames.forEach((name) => {
            let value = name === 'likes' ? {} : [];
            try {
                if (typeof getCollection === 'function') {
                    const current = getCollection(name);
                    if (name === 'likes' && adminBackupIsPlainObject(current)) value = current;
                    else if (name !== 'likes' && Array.isArray(current)) value = current;
                }
            } catch (error) {
                // Giữ giá trị rỗng.
            }
            collections[name] = adminBackupDeepClone(value);
        });

        const storage = {};
        adminBackupStorageKeys.forEach((key) => {
            try {
                if (typeof getStore !== 'function') return;
                const value = getStore(key, adminBackupMissing);
                if (value === adminBackupMissing) return;
                storage[key] = adminBackupDeepClone(value);
            } catch (error) {
                // Bỏ qua key đọc lỗi.
            }
        });

        let heroes = [];
        try {
            if (typeof getCachedHeroes === 'function') heroes = getCachedHeroes();
            else if (typeof loadHeroes === 'function') heroes = await loadHeroes();
            if (!Array.isArray(heroes)) heroes = [];
        } catch (error) {
            heroes = [];
        }

        const backup = {
            app: adminBackupApp,
            version: adminBackupVersion,
            exportedAt: new Date().toISOString(),
            exportedBy: typeof getCurrentUser === 'function' ? String(getCurrentUser() || '') : '',
            collections: collections,
            storage: storage,
            heroes: adminBackupDeepClone(heroes),
        };

        // Chốt chặn an toàn cuối cùng: tuyệt đối không để lọt tài khoản/mật khẩu.
        if (adminBackupHasForbidden(backup)) return null;

        return backup;
    } catch (error) {
        return null;
    }
}

/* ---------- 2. Kiểm tra tệp nhập ---------- */

/** Kết quả lỗi chuẩn cho adminBackupValidate(). */
function adminBackupError(message) {
    return {
        ok: false,
        error: String(message || 'Tệp sao lưu không hợp lệ.'),
        data: null,
        summary: { posts: 0, comments: 0, likes: 0, storageKeys: [], hasHeroes: false, ignored: [] },
    };
}

/**
 * Kiểm tra chuỗi JSON của tệp sao lưu.
 * @param {string} text
 * @returns {{ ok: boolean, error: string, data: object|null, summary: object }}
 */
function adminBackupValidate(text) {
    try {
        if (typeof text !== 'string' || !text.trim()) return adminBackupError('Bạn chưa chọn tệp sao lưu.');
        if (adminBackupTextBytes(text) > adminBackupMaxBytes) return adminBackupError('Tệp quá lớn (giới hạn 5 MB).');

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            return adminBackupError('Tệp không phải JSON hợp lệ.');
        }

        if (!adminBackupIsPlainObject(parsed)) return adminBackupError('Nội dung tệp không đúng định dạng sao lưu.');
        if (parsed.app !== adminBackupApp) return adminBackupError('Tệp này không phải bản sao lưu của AOV HUB.');
        if (parsed.version !== adminBackupVersion) return adminBackupError('Phiên bản sao lưu không được hỗ trợ.');

        const rawCollections = parsed.collections;
        if (!adminBackupIsPlainObject(rawCollections)) return adminBackupError('Tệp thiếu mục "collections".');

        if (!Array.isArray(rawCollections.posts)) return adminBackupError('Trường "posts" phải là mảng.');
        if (!Array.isArray(rawCollections.comments)) return adminBackupError('Trường "comments" phải là mảng.');
        if (!adminBackupIsPlainObject(rawCollections.likes)) return adminBackupError('Trường "likes" phải là object.');

        const ignored = [];

        // Bỏ qua users và mọi bộ sưu tập lạ (chỉ ghi nhận, không báo lỗi).
        Object.keys(rawCollections).forEach((name) => {
            if (name === 'posts' || name === 'comments' || name === 'likes') return;
            ignored.push(name);
        });

        // storage: chỉ nhận key trong danh sách trắng; key lạ bỏ qua.
        const rawStorage = adminBackupIsPlainObject(parsed.storage) ? parsed.storage : {};
        const storage = {};
        let storageError = '';

        Object.keys(rawStorage).forEach((key) => {
            if (adminBackupStorageKeys.indexOf(key) === -1) {
                ignored.push(key);
                return;
            }

            const kind = adminBackupStorageTypes[key];
            const value = rawStorage[key];
            const valid = kind === 'array' ? Array.isArray(value) : adminBackupIsPlainObject(value);

            if (!valid) {
                if (!storageError) storageError = 'Cài đặt "' + key + '" sai kiểu.';
                return;
            }

            storage[key] = adminBackupDeepClone(value);
        });

        if (storageError) return adminBackupError(storageError);

        const uniqueIgnored = [];
        ignored.forEach((name) => {
            if (uniqueIgnored.indexOf(name) === -1) uniqueIgnored.push(name);
        });

        const data = {
            collections: {
                posts: adminBackupDeepClone(rawCollections.posts),
                comments: adminBackupDeepClone(rawCollections.comments),
                likes: adminBackupDeepClone(rawCollections.likes),
            },
            storage: storage,
        };

        return {
            ok: true,
            error: '',
            data: data,
            summary: {
                posts: data.collections.posts.length,
                comments: data.collections.comments.length,
                likes: Object.keys(data.collections.likes).length,
                storageKeys: Object.keys(storage),
                hasHeroes: Array.isArray(parsed.heroes) && parsed.heroes.length > 0,
                ignored: uniqueIgnored,
            },
        };
    } catch (error) {
        return adminBackupError('Không đọc được tệp sao lưu.');
    }
}

/* ---------- 3. Áp dụng khôi phục ---------- */

/**
 * Ghi đè dữ liệu hiện tại bằng dữ liệu đã kiểm tra. Chỉ admin, bỏ qua users/heroes.
 * @param {object} data kết quả .data của adminBackupValidate().
 * @returns {Promise<{ ok: boolean, error: string, applied: object }>}
 */
async function adminBackupApply(data) {
    const empty = { posts: 0, comments: 0, likes: 0, storageKeys: [] };

    try {
        if (typeof isAdmin !== 'function' || !isAdmin()) {
            return { ok: false, error: 'Chỉ quản trị viên được khôi phục.', applied: empty };
        }

        if (!adminBackupIsPlainObject(data)) {
            return { ok: false, error: 'Dữ liệu khôi phục không hợp lệ.', applied: empty };
        }

        if (typeof setCollection !== 'function') {
            return { ok: false, error: 'Thiếu dataStore.js nên không khôi phục được.', applied: empty };
        }

        const collections = adminBackupIsPlainObject(data.collections) ? data.collections : {};
        const applied = { posts: 0, comments: 0, likes: 0, storageKeys: [] };

        // Ghi đủ 3 bộ; một bộ thất bại thì dừng ngay và báo.
        for (const name of adminBackupCollectionNames) {
            const fallback = name === 'likes' ? {} : [];
            let value = Object.prototype.hasOwnProperty.call(collections, name) ? collections[name] : fallback;

            const valid = name === 'likes' ? adminBackupIsPlainObject(value) : Array.isArray(value);
            if (!valid) value = fallback;

            if (!setCollection(name, value)) {
                return { ok: false, error: 'Không ghi được bộ "' + name + '".', applied: applied };
            }

            applied[name] = name === 'likes' ? Object.keys(value).length : value.length;
        }

        // Ghi storage (chỉ các key trong danh sách trắng).
        const storage = adminBackupIsPlainObject(data.storage) ? data.storage : {};
        if (typeof setStore === 'function') {
            adminBackupStorageKeys.forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(storage, key)) return;
                try {
                    if (setStore(key, storage[key])) applied.storageKeys.push(key);
                } catch (error) {
                    // Bỏ qua key ghi lỗi.
                }
            });
        }

        if (typeof whenDataSaved === 'function') {
            try {
                await whenDataSaved();
            } catch (error) {
                // Không chờ được hàng đợi ghi cũng không sao.
            }
        }

        if (typeof logAdminAction === 'function') {
            try {
                logAdminAction('backup.import', 'backup', '',
                    'Khôi phục ' + applied.posts + ' bài viết, ' + applied.comments + ' bình luận');
            } catch (error) {
                // Nhật ký chỉ là tiện ích.
            }
        }

        return { ok: true, error: '', applied: applied };
    } catch (error) {
        return { ok: false, error: 'Không khôi phục được dữ liệu.', applied: empty };
    }
}

/* ---------- 4. Giao diện ---------- */

/** Ghi một khối .admin-notice vào container (thoát nội dung). */
function adminBackupSetNotice(container, kind, text) {
    try {
        if (!container) return;
        container.innerHTML = '<div class="admin-notice admin-notice--' + adminBackupEscape(kind) + '">'
            + adminBackupEscape(text) + '</div>';
    } catch (error) {
        // Không đặt được thông báo cũng không sao.
    }
}

/** Một ô số liệu .admin-stat. */
function adminBackupStatHtml(value, label) {
    return '<div class="admin-stat">'
        + '<div class="admin-stat__value">' + adminBackupEscape(String(value)) + '</div>'
        + '<div class="admin-stat__label">' + adminBackupEscape(label) + '</div>'
        + '</div>';
}

/** Đọc chữ từ File (file.text() trước, không thì FileReader). */
function adminBackupReadFile(file) {
    return new Promise((resolve) => {
        try {
            if (file && typeof file.text === 'function') {
                file.text().then((text) => resolve(typeof text === 'string' ? text : '')).catch(() => resolve(''));
                return;
            }

            if (typeof FileReader === 'function') {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                reader.onerror = () => resolve('');
                reader.readAsText(file);
                return;
            }

            resolve('');
        } catch (error) {
            resolve('');
        }
    });
}

/** Vẽ bản xem trước + ô xác nhận + nút Khôi phục/Hủy. */
function adminBackupRenderPreview(preview, result) {
    try {
        if (!preview) return;

        const summary = result.summary || {};
        const storageKeys = Array.isArray(summary.storageKeys) ? summary.storageKeys : [];
        const ignored = Array.isArray(summary.ignored) ? summary.ignored : [];

        const stats = '<div class="admin-stats">'
            + adminBackupStatHtml(summary.posts || 0, 'Bài viết')
            + adminBackupStatHtml(summary.comments || 0, 'Bình luận')
            + adminBackupStatHtml(summary.likes || 0, 'Bài có lượt thích')
            + adminBackupStatHtml(storageKeys.length, 'Nhóm cài đặt')
            + '</div>';

        const ignoredLine = ignored.length
            ? '<p class="admin-section__desc">Bỏ qua: ' + adminBackupEscape(ignored.join(', ')) + '.</p>'
            : '';

        const heroesLine = summary.hasHeroes
            ? '<p class="admin-section__desc">Danh sách tướng trong tệp sẽ KHÔNG được khôi phục.</p>'
            : '';

        const warn = '<div class="admin-notice admin-notice--warn">'
            + 'Khôi phục sẽ GHI ĐÈ bài viết, bình luận, lượt thích và cài đặt hiện tại. '
            + 'Nên xuất sao lưu hiện tại trước.'
            + '</div>';

        const confirm = '<label class="admin-settings__toggle">'
            + '<input type="checkbox" data-admin-backup-confirm>'
            + 'Tôi hiểu dữ liệu hiện tại sẽ bị ghi đè'
            + '</label>';

        const actions = '<div class="admin-toolbar">'
            + '<button type="button" class="btn btn-primary" data-admin-backup-apply disabled>Khôi phục</button>'
            + '<button type="button" class="btn btn-outline" data-admin-backup-cancel>Hủy</button>'
            + '</div>';

        preview.innerHTML = stats + ignoredLine + heroesLine + warn + confirm + actions;

        const checkbox = typeof preview.querySelector === 'function'
            ? preview.querySelector('[data-admin-backup-confirm]') : null;
        const applyBtn = typeof preview.querySelector === 'function'
            ? preview.querySelector('[data-admin-backup-apply]') : null;
        const cancelBtn = typeof preview.querySelector === 'function'
            ? preview.querySelector('[data-admin-backup-cancel]') : null;

        if (checkbox && applyBtn && typeof checkbox.addEventListener === 'function') {
            checkbox.addEventListener('change', () => {
                try {
                    if (checkbox.checked) {
                        if (typeof applyBtn.removeAttribute === 'function') applyBtn.removeAttribute('disabled');
                        else applyBtn.disabled = false;
                    } else if (typeof applyBtn.setAttribute === 'function') {
                        applyBtn.setAttribute('disabled', '');
                    } else {
                        applyBtn.disabled = true;
                    }
                } catch (error) {
                    // Bỏ qua.
                }
            });
        }

        if (applyBtn && typeof applyBtn.addEventListener === 'function') {
            applyBtn.addEventListener('click', () => {
                adminBackupRunApply(preview, result.data);
            });
        }

        if (cancelBtn && typeof cancelBtn.addEventListener === 'function') {
            cancelBtn.addEventListener('click', () => {
                try {
                    preview.innerHTML = '';
                } catch (error) {
                    // Bỏ qua.
                }
            });
        }
    } catch (error) {
        adminBackupSetNotice(preview, 'danger', 'Không hiển thị được bản xem trước.');
    }
}

/** Xử lý khi người dùng chọn tệp. */
async function adminBackupHandleFile(body, input) {
    const msg = typeof body.querySelector === 'function' ? body.querySelector('[data-admin-backup-restore-msg]') : null;
    const preview = typeof body.querySelector === 'function' ? body.querySelector('[data-admin-backup-preview]') : null;

    try {
        if (preview) preview.innerHTML = '';

        const file = input && input.files ? input.files[0] : null;
        if (!file) return;

        const text = await adminBackupReadFile(file);
        const result = adminBackupValidate(text);

        if (!result.ok) {
            adminBackupSetNotice(msg, 'danger', result.error || 'Tệp không hợp lệ.');
            return;
        }

        if (msg) msg.innerHTML = '';
        adminBackupRenderPreview(preview, result);
    } catch (error) {
        adminBackupSetNotice(msg, 'danger', 'Không đọc được tệp sao lưu.');
    }
}

/** Xử lý nút "Xuất sao lưu". */
async function adminBackupRunExport(body) {
    const msg = typeof body.querySelector === 'function' ? body.querySelector('[data-admin-backup-export-msg]') : null;

    try {
        const data = await adminBackupBuild();
        if (!data) {
            adminBackupSetNotice(msg, 'danger', 'Chỉ quản trị viên được xuất sao lưu.');
            return;
        }

        const canDownload = typeof Blob === 'function'
            && typeof URL !== 'undefined'
            && typeof URL.createObjectURL === 'function'
            && typeof document !== 'undefined'
            && typeof document.createElement === 'function';

        if (!canDownload) {
            adminBackupSetNotice(msg, 'warn', 'Trình duyệt này không hỗ trợ tải file.');
            return;
        }

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = adminBackupFileName(new Date());

        try {
            if (document.body && typeof document.body.appendChild === 'function') document.body.appendChild(link);
            if (typeof link.click === 'function') link.click();
            if (document.body && typeof document.body.removeChild === 'function') document.body.removeChild(link);
        } catch (error) {
            // Bỏ qua: vẫn thu hồi URL bên dưới.
        }

        try {
            setTimeout(() => { URL.revokeObjectURL(url); }, 0);
        } catch (error) {
            // Bỏ qua.
        }

        if (typeof logAdminAction === 'function') {
            try {
                logAdminAction('backup.export', 'backup', '', 'Xuất sao lưu');
            } catch (error) {
                // Nhật ký chỉ là tiện ích.
            }
        }

        const posts = Array.isArray(data.collections.posts) ? data.collections.posts.length : 0;
        const comments = Array.isArray(data.collections.comments) ? data.collections.comments.length : 0;
        const likes = data.collections.likes ? Object.keys(data.collections.likes).length : 0;
        const settings = data.storage ? Object.keys(data.storage).length : 0;

        adminBackupSetNotice(msg, 'success',
            'Đã xuất ' + posts + ' bài viết, ' + comments + ' bình luận, ' + likes + ' bài có lượt thích, ' + settings + ' nhóm cài đặt.');
    } catch (error) {
        adminBackupSetNotice(msg, 'danger', 'Không xuất được sao lưu.');
    }
}

/** Xử lý nút "Khôi phục". */
async function adminBackupRunApply(preview, data) {
    try {
        const result = await adminBackupApply(data);
        if (!preview) return;

        if (!result.ok) {
            adminBackupSetNotice(preview, 'danger', result.error || 'Không khôi phục được.');
            return;
        }

        preview.innerHTML = '<div class="admin-notice admin-notice--success">'
            + 'Đã khôi phục ' + adminBackupEscape(String(result.applied.posts)) + ' bài viết, '
            + adminBackupEscape(String(result.applied.comments)) + ' bình luận.'
            + '</div>'
            + '<p class="admin-section__desc">Tải lại trang để thấy dữ liệu mới.</p>'
            + '<div class="admin-toolbar">'
            + '<button type="button" class="btn btn-primary" data-admin-backup-reload>Tải lại trang</button>'
            + '</div>';

        const reloadBtn = typeof preview.querySelector === 'function'
            ? preview.querySelector('[data-admin-backup-reload]') : null;

        if (reloadBtn && typeof reloadBtn.addEventListener === 'function') {
            reloadBtn.addEventListener('click', () => {
                try {
                    if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
                } catch (error) {
                    // Bỏ qua.
                }
            });
        }

        if (typeof dataStoreRefreshBar === 'function') {
            try {
                dataStoreRefreshBar();
            } catch (error) {
                // Bỏ qua.
            }
        }
    } catch (error) {
        adminBackupSetNotice(preview, 'danger', 'Không khôi phục được.');
    }
}

/** HTML khung của mục (không gồm tiêu đề do shell vẽ). */
function adminBackupSectionHtml() {
    return ''
        + '<p class="admin-section__desc">'
        + 'Tệp sao lưu gồm bài viết, bình luận, lượt thích, cài đặt kiểm duyệt, nhật ký quản trị '
        + 'và danh sách tướng (chỉ để tham khảo, KHÔNG khôi phục). '
        + 'Tệp KHÔNG chứa tài khoản người dùng, mật khẩu hay phiên đăng nhập.'
        + '</p>'
        + '<div data-admin-backup-export-msg></div>'
        + '<div class="admin-toolbar">'
        + '<button type="button" class="btn btn-primary" data-admin-backup-export>Xuất sao lưu</button>'
        + '</div>'
        + '<p class="admin-section__desc">Khôi phục từ tệp đã xuất:</p>'
        + '<div class="admin-field">'
        + '<label class="admin-field__label" for="admin-backup-file">Chọn tệp JSON</label>'
        + '<input type="file" id="admin-backup-file" accept="application/json,.json" data-admin-backup-file>'
        + '</div>'
        + '<div data-admin-backup-restore-msg></div>'
        + '<div data-admin-backup-preview></div>';
}

/** Gắn sự kiện cho khung vừa vẽ (phần tử luôn mới nên không sợ gắn trùng). */
function adminBackupBind(body) {
    try {
        if (typeof body.querySelector !== 'function') return;

        const exportBtn = body.querySelector('[data-admin-backup-export]');
        if (exportBtn && typeof exportBtn.addEventListener === 'function') {
            exportBtn.addEventListener('click', () => { adminBackupRunExport(body); });
        }

        const fileInput = body.querySelector('[data-admin-backup-file]');
        if (fileInput && typeof fileInput.addEventListener === 'function') {
            fileInput.addEventListener('change', () => { adminBackupHandleFile(body, fileInput); });
        }
    } catch (error) {
        // Không gắn được sự kiện cũng không làm hỏng mục.
    }
}

/**
 * Vẽ mục "Sao lưu và khôi phục" vào phần thân .admin-section__body.
 * @param {Element} body container do admin-shell.js cung cấp.
 * @returns {Promise<void>}
 */
async function renderAdminBackupSection(body) {
    try {
        if (!body) return;

        if (typeof isAdmin !== 'function' || !isAdmin()) {
            body.innerHTML = '<p class="admin-empty">Chỉ quản trị viên được sao lưu.</p>';
            return;
        }

        body.innerHTML = adminBackupSectionHtml();
        adminBackupBind(body);
    } catch (error) {
        try {
            body.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được mục sao lưu.'
                + '</div>';
        } catch (innerError) {
            // Bỏ qua.
        }
    }
}

// Đăng ký mục vào tab "Dữ liệu" (chỉ có tác dụng khi admin-shell.js đã nạp).
if (typeof registerAdminSection === 'function') {
    registerAdminSection('data', 'backup', 'Sao lưu và khôi phục', renderAdminBackupSection);
}
