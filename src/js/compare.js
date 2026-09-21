/**
 * compare.js - Trang So sánh Tướng (pages/compare.html)
 * Phụ trách: Người 4 (TV4)
 *
 * Dùng lại của TV1: loadData(), renderNotFound(), escapeHtml().
 * Lưu lựa chọn vào aov_compare qua storage.js (tối đa 2 tướng).
 */

let compareHeroes = [];

/* Các chỉ số đem ra so sánh: càng cao càng tốt */
const COMPARE_FIELDS = [
    { key: 'hp', label: 'Máu' },
    { key: 'attack', label: 'Công vật lý' },
    { key: 'defense', label: 'Giáp' },
    { key: 'speed', label: 'Tốc chạy' },
];

async function initComparePage() {
    const selectBox = document.getElementById('compare-select');
    if (!selectBox) return;

    compareHeroes = await loadData(DATA_PATH.heroes);

    const saved = getCompare();
    const firstId = saved[0] || '';
    const secondId = saved[1] || '';

    selectBox.className = 'compare-select';
    selectBox.innerHTML = `
        <div class="compare-select__group">
            <label for="compare-hero-1">Tướng 1</label>
            ${renderHeroOptions('compare-hero-1', firstId)}
        </div>
        <span class="compare-select__vs">VS</span>
        <div class="compare-select__group">
            <label for="compare-hero-2">Tướng 2</label>
            ${renderHeroOptions('compare-hero-2', secondId)}
        </div>
        <button type="button" class="btn btn-outline btn-sm" id="compare-clear">Xoá lựa chọn</button>
    `;

    document.getElementById('compare-hero-1').addEventListener('change', onCompareChange);
    document.getElementById('compare-hero-2').addEventListener('change', onCompareChange);
    document.getElementById('compare-clear').addEventListener('click', () => {
        clearCompare();
        document.getElementById('compare-hero-1').value = '';
        document.getElementById('compare-hero-2').value = '';
        renderCompareTable();
    });

    renderCompareTable();
}

function renderHeroOptions(selectId, selectedId) {
    const options = compareHeroes
        .map((hero) => `
            <option value="${hero.id}" ${Number(selectedId) === hero.id ? 'selected' : ''}>
                ${escapeHtml(hero.name)}
            </option>
        `).join('');

    return `
        <select class="filter-bar__select" id="${selectId}">
            <option value="">-- Chọn tướng --</option>
            ${options}
        </select>
    `;
}

function onCompareChange() {
    const firstId = document.getElementById('compare-hero-1').value;
    const secondId = document.getElementById('compare-hero-2').value;

    setCompare([firstId, secondId].filter(Boolean));
    renderCompareTable();
}

function renderCompareTable() {
    const container = document.getElementById('compare-table');
    if (!container) return;

    const selected = getCompare()
        .map((id) => compareHeroes.find((hero) => hero.id === Number(id)))
        .filter(Boolean);

    if (selected.length < 2) {
        container.innerHTML = renderNotFound('Hãy chọn đủ 2 tướng để bắt đầu so sánh.');
        return;
    }

    const [heroA, heroB] = selected;

    const rows = COMPARE_FIELDS.map((field) => {
        const valueA = (heroA.stats || {})[field.key] || 0;
        const valueB = (heroB.stats || {})[field.key] || 0;

        return `
            <tr>
                <td class="${valueA > valueB ? 'is-better' : ''}">${valueA}</td>
                <th>${field.label}</th>
                <td class="${valueB > valueA ? 'is-better' : ''}">${valueB}</td>
            </tr>
        `;
    }).join('');

    const difficultyRow = `
        <tr>
            <td>${DIFFICULTY_LABEL[heroA.difficulty] || '-'}</td>
            <th>Độ khó</th>
            <td>${DIFFICULTY_LABEL[heroB.difficulty] || '-'}</td>
        </tr>
        <tr>
            <td>${(heroA.role || []).join(', ')}</td>
            <th>Vai trò</th>
            <td>${(heroB.role || []).join(', ')}</td>
        </tr>
    `;

    container.innerHTML = `
        <div class="compare-head">
            ${renderCompareCard(heroA)}
            <span class="compare-head__vs" aria-hidden="true">⚔️</span>
            ${renderCompareCard(heroB)}
        </div>

        <table class="compare-table">
            <caption class="sr-only">Bảng so sánh chỉ số hai tướng</caption>
            <tbody>
                ${rows}
                ${difficultyRow}
            </tbody>
        </table>
        <p class="compare-note">Ô được tô vàng là chỉ số cao hơn ở cùng hàng.</p>
    `;
}

function renderCompareCard(hero) {
    return `
        <a class="compare-head__hero" href="/pages/hero-detail.html?id=${hero.id}">
            <img src="/assets/images/${hero.image}" alt="${escapeHtml(hero.name)}" onerror="handleImageError(this)">
            <h3>${escapeHtml(hero.name)}</h3>
        </a>
    `;
}

document.addEventListener('DOMContentLoaded', initComparePage);
