/**
 * vite.config.js - Cấu hình Vite + API quản lý tướng
 *
 * Trình duyệt không tự ghi được vào file trong dự án, nên thao tác thêm / sửa / xoá
 * tướng của admin được gửi tới API nội bộ dưới đây; API đọc/ghi thẳng vào
 * src/data/heroes.json. Chạy bằng `npm run dev` (hoặc `npm run preview`).
 *
 *   GET    /api/heroes        -> danh sách tướng trong heroes.json
 *   POST   /api/heroes        -> thêm tướng (server tự cấp id kế tiếp), trả tướng mới
 *   PUT    /api/heroes/:id    -> sửa tướng theo id, trả tướng sau khi sửa
 *   DELETE /api/heroes/:id    -> xoá tướng theo id
 *
 * Dữ liệu gửi lên đã được validateHeroForm() kiểm tra ở trình duyệt; server chuẩn hoá
 * lại lần nữa để không bao giờ ghi dữ liệu sai kiểu vào file.
 *
 * Lưu ý: file heroes.json nằm trong vùng Vite theo dõi, mỗi lần ghi sẽ kích hoạt tải
 * lại trang. server.watch.ignored tắt việc đó để form quản trị không bị reset sau khi lưu.
 */
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const heroesFile = path.join(rootDir, 'src', 'data', 'heroes.json');

const HERO_ROLES = ['Xạ thủ', 'Sát thủ', 'Pháp sư', 'Đấu sĩ', 'Đỡ đòn', 'Trợ thủ'];
const HERO_STAT_KEYS = ['hp', 'attack', 'defense', 'speed'];

/** Chuẩn hoá id về chuỗi để so sánh ("9001" và 9001 là một). */
function normalizeId(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value).trim();
}

function readHeroes() {
    try {
        const list = JSON.parse(fs.readFileSync(heroesFile, 'utf8'));
        return Array.isArray(list) ? list : [];
    } catch (error) {
        console.error('[aov-heroes-api] Không đọc được heroes.json:', error.message);
        return [];
    }
}

function writeHeroes(heroes) {
    fs.writeFileSync(heroesFile, JSON.stringify(heroes, null, 2) + '\n', 'utf8');
}

function nextId(heroes) {
    const max = heroes.reduce((current, hero) => {
        const id = Number(hero && hero.id);
        return Number.isFinite(id) && id > current ? id : current;
    }, 0);

    return Math.floor(max) + 1;
}

/**
 * Làm sạch dữ liệu tướng do trình duyệt gửi lên để chỉ ghi các trường hợp lệ.
 * Trả null nếu thiếu tên (không thể tạo tướng rác).
 */
function sanitizeHero(input, fallbackId) {
    const source = input && typeof input === 'object' ? input : {};

    const name = String(source.name === undefined ? '' : source.name).trim();
    if (!name) return null;

    const rawStats = source.stats && typeof source.stats === 'object' ? source.stats : {};
    const stats = {};
    HERO_STAT_KEYS.forEach((key) => {
        const value = Number(rawStats[key]);
        stats[key] = Number.isFinite(value) && value >= 0 ? value : 0;
    });

    const skills = (Array.isArray(source.skills) ? source.skills : [])
        .map((skill) => {
            const row = skill && typeof skill === 'object' ? skill : {};
            const cooldown = Number(row.cooldown);
            return {
                name: String(row.name === undefined ? '' : row.name).trim(),
                type: String(row.type === undefined ? '' : row.type).trim(),
                description: String(row.description === undefined ? '' : row.description).trim(),
                cooldown: Number.isFinite(cooldown) && cooldown >= 0 ? cooldown : 0,
            };
        })
        .filter((skill) => skill.name)
        .slice(0, 3);

    const recommendedBuild = (Array.isArray(source.recommendedBuild) ? source.recommendedBuild : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id >= 0);

    const difficulty = Number(source.difficulty);
    const role = (Array.isArray(source.role) ? source.role : [])
        .map((item) => String(item).trim())
        .filter((item) => HERO_ROLES.includes(item));

    return {
        id: fallbackId,
        name,
        alias: String(source.alias === undefined ? '' : source.alias).trim(),
        image: String(source.image === undefined ? '' : source.image).trim(),
        role,
        difficulty: Number.isFinite(difficulty) ? difficulty : 2,
        stats,
        skills,
        recommendedBuild,
    };
}

function readJsonBody(req) {
    return new Promise((resolve) => {
        let raw = '';

        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
}

/** Middleware xử lý mọi request /api/heroes. */
function heroesApiMiddleware() {
    return async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname.replace(/\/+$/, '');

        if (pathname !== '/api/heroes' && !pathname.startsWith('/api/heroes/')) {
            next();
            return;
        }

        const id = pathname.startsWith('/api/heroes/')
            ? decodeURIComponent(pathname.slice('/api/heroes/'.length))
            : '';

        try {
            if (req.method === 'GET' && !id) {
                sendJson(res, 200, readHeroes());
                return;
            }

            if (req.method === 'POST' && !id) {
                const body = await readJsonBody(req);
                if (!body) {
                    sendJson(res, 400, { error: 'JSON không hợp lệ' });
                    return;
                }

                const heroes = readHeroes();
                const hero = sanitizeHero(body, nextId(heroes));
                if (!hero) {
                    sendJson(res, 400, { error: 'Thiếu tên tướng' });
                    return;
                }

                heroes.push(hero);
                writeHeroes(heroes);
                sendJson(res, 201, hero);
                return;
            }

            if (req.method === 'PUT' && id) {
                const body = await readJsonBody(req);
                if (!body) {
                    sendJson(res, 400, { error: 'JSON không hợp lệ' });
                    return;
                }

                const heroes = readHeroes();
                const index = heroes.findIndex((hero) => normalizeId(hero.id) === normalizeId(id));
                if (index === -1) {
                    sendJson(res, 404, { error: 'Không tìm thấy tướng' });
                    return;
                }

                const updated = sanitizeHero(body, heroes[index].id);
                if (!updated) {
                    sendJson(res, 400, { error: 'Thiếu tên tướng' });
                    return;
                }

                updated.id = heroes[index].id;
                updated.updatedAt = new Date().toISOString();
                heroes[index] = updated;
                writeHeroes(heroes);
                sendJson(res, 200, updated);
                return;
            }

            if (req.method === 'DELETE' && id) {
                const heroes = readHeroes();
                const remaining = heroes.filter((hero) => normalizeId(hero.id) !== normalizeId(id));

                if (remaining.length === heroes.length) {
                    sendJson(res, 404, { error: 'Không tìm thấy tướng' });
                    return;
                }

                writeHeroes(remaining);
                sendJson(res, 200, { ok: true });
                return;
            }

            sendJson(res, 405, { error: 'Phương thức không được hỗ trợ' });
        } catch (error) {
            console.error('[aov-heroes-api] Lỗi:', error);
            sendJson(res, 500, { error: 'Lỗi máy chủ' });
        }
    };
}

export default defineConfig({
    server: {
        // heroes.json được API ghi trực tiếp; tắt theo dõi để không reload trang sau mỗi lần lưu.
        watch: {
            ignored: ['**/src/data/heroes.json'],
        },
    },
    plugins: [
        {
            name: 'aov-heroes-api',
            configureServer(server) {
                server.middlewares.use(heroesApiMiddleware());
            },
            configurePreviewServer(server) {
                server.middlewares.use(heroesApiMiddleware());
            },
        },
    ],
});
