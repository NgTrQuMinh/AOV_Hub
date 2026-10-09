/**
 * run-tests.cjs - Chạy toàn bộ bộ test của dự án (tools/test-*.cjs) rồi báo tổng kết.
 *
 * Chạy: node tools/run-tests.cjs   (hoặc npm test)
 *
 * Mỗi test file tự đặt process.exitCode = 1 khi có check fail nên runner chỉ cần
 * nhìn exit code, không phải dò chuỗi đầu ra.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => /^test-.*\.cjs$/.test(f)).sort();

const failed = [];
let passed = 0;

for (const file of files) {
    const label = '[' + file + ']';
    const result = spawnSync(process.execPath, [path.join(dir, file)], {
        stdio: 'inherit',
        timeout: 120000,
    });

    if (result.signal === 'SIGTERM') {
        failed.push(file);
        console.log('\n' + label + ' TIMEOUT');
    } else if (result.status === 0) {
        passed++;
        console.log('\n' + label + ' PASS');
    } else {
        failed.push(file);
        console.log('\n' + label + ' FAIL (exit ' + result.status + ')');
    }
}

console.log('\n\n===== TONG KET =====');
console.log('test files: ' + files.length + ' | PASS: ' + passed + ' | FAIL: ' + failed.length);
if (failed.length) {
    console.log('FAILED: ' + failed.join(', '));
    process.exitCode = 1;
} else {
    console.log('TAT CA TEST DEU DAT');
}