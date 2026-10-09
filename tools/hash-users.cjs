/**
 * hash-users.cjs - Băm sẵn tài khoản mẫu trong src/data/users.json
 *
 * Với mỗi user còn trường `password` thô:
 *   - tạo salt ngẫu nhiên 16 byte (hex)
 *   - passwordHash = PBKDF2-SHA256(100000 vòng, 32 byte, hex) bằng crypto.subtle
 *     của Node (webcrypto, CÙNG thuật toán/tham số với hashPassword trong auth.js)
 *   - ghi { salt, passwordHash }, XÓA trường `password`
 *
 * Duy trì đúng kiểu xuống dòng của file (CRLF như hiện tại) và indent 4 dấu cách.
 *
 * Không in mật khẩu ra console.
 *
 * Chạy một lần:  node tools/hash-users.cjs
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.resolve(__dirname, '..', 'src', 'data', 'users.json');

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Salt ngẫu nhiên 16 byte -> hex. */
function randomSaltHex() {
    const bytes = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('hex');
}

/** PBKDF2-SHA256: 100000 vòng, 32 byte, hex (khớp auth.js/hashPassword). */
async function hashPassword(password, saltHex) {
    if (typeof password !== 'string' || !password) {
        throw new TypeError('hashPassword: mật khẩu phải là chuỗi không rỗng');
    }
    if (typeof saltHex !== 'string' || !/^[0-9a-f]+$/i.test(saltHex)) {
        throw new TypeError('hashPassword: saltHex phải là chuỗi hex hợp lệ');
    }

    const salt = Uint8Array.from(Buffer.from(saltHex, 'hex'));
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
        keyMaterial,
        HASH_BYTES * 8
    );
    return Buffer.from(new Uint8Array(bits)).toString('hex');
}

/** Ghi lại file giữ đúng kiểu xuống dòng cũ (LF hay CRLF) và indent 4 dấu cách. */
function writeJsonPreservingStyle(filePath, value) {
    const text = JSON.stringify(value, null, 4) + '\n';
    const old = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const eol = old.includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(filePath, text.replace(/\r?\n/g, eol));
}

(async () => {
    if (!globalThis.crypto || !crypto.subtle) {
        console.error('Cần Node có webcrypto (globalThis.crypto.subtle). Dừng lại.');
        process.exitCode = 1;
        return;
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (!Array.isArray(users)) {
        console.error('src/data/users.json phải là mảng. Dừng lại.');
        process.exitCode = 1;
        return;
    }

    let processed = 0;
    let rawRemain = 0;

    for (const user of users) {
        if (user && typeof user === 'object') {
            if (Object.prototype.hasOwnProperty.call(user, 'password')) {
                const saltHex = randomSaltHex();
                user.passwordHash = await hashPassword(user.password, saltHex);
                user.salt = saltHex;
                delete user.password;
                processed += 1;
            } else if (!user.passwordHash || !user.salt) {
                // Tài khoản chưa có hash cũng không có mật khẩu thô -> không tự sửa.
                rawRemain += 1;
            }
        }
    }

    writeJsonPreservingStyle(USERS_FILE, users);

    console.log(`Đã băm ${processed} tài khoản. Còn ${rawRemain} tài khoản chưa đủ salt/passwordHash (để nguyên).`);
    if (processed === 0) {
        console.log('Không có mật khẩu thô nào trong users.json.');
    }
})();