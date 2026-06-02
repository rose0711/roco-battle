// ============================================================
// status-system.js — 印记 & 状态管理
// ============================================================

import { MARKS_DB, STATUS_DB } from './csv-loader.js';

// 印记/状态描述查询
function msDesc(name, db) {
  const entry = db[name];
  return entry ? entry['desc'] : '';
}

/**
 * 查询类型标签文字（正面/负面），统查印记和状态
 * marks: positive → 正面, negative → 负面
 * status: buff → 正面, debuff → 负面
 */
function getEntryType(name, listId) {
  if (listId === 'marksList') {
    const entry = MARKS_DB[name];
    if (!entry) return '';
    return entry['type'] === 'positive' ? 'positive' : (entry['type'] === 'negative' ? 'negative' : '');
  }
  if (listId === 'statusList') {
    const entry = STATUS_DB[name];
    if (!entry) return '';
    return entry['type'] === 'buff' ? 'positive' : (entry['type'] === 'debuff' ? 'negative' : '');
  }
  return '';
}

/** type 原始值 → 显示文字 */
function typeLabel(raw) {
  if (raw === 'positive') return '正面';
  if (raw === 'negative') return '负面';
  return '';
}

/** type 原始值 → CSS class */
function typeClass(raw) {
  if (raw === 'positive') return 'mark-type-positive';
  if (raw === 'negative') return 'mark-type-negative';
  return '';
}

/** 获取类型标签 HTML */
function getTypeBadgeHtml(name, listId) {
  const t = getEntryType(name, listId);
  if (!t) return '';
  return '<span class="mark-type-badge ' + typeClass(t) + '">' + typeLabel(t) + '</span>';
}

/**
 * 向指定容器添加一行印记或状态
 */
function addMsRow(containerId, listId, name, stacks, desc, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'ms-row';
  row.style.cssText = 'margin-bottom:6px;background:#faf3e5;border-radius:4px;padding:6px 8px;border:1px solid #e4dbca';

  // 自动补全 desc 和 type
  if (desc === undefined) {
    const db = (listId === 'marksList') ? MARKS_DB : STATUS_DB;
    desc = msDesc(name, db);
  }
  const currentType = (type !== undefined) ? type : getEntryType(name, listId);
  const badgeHtml = currentType
    ? '<span class="mark-type-badge ' + typeClass(currentType) + '">' + typeLabel(currentType) + '</span>'
    : '';

  const placeholder = (listId === 'marksList') ? '印记名...' : '状态名...';
  row.innerHTML =
    '<div style="display:flex;gap:8px;align-items:center">' +
      '<input list="' + listId + '" class="ms-name" placeholder="' + placeholder + '" value="' + (name||'') + '" style="flex:3;padding:5px 8px;border:1px solid #d8c29b;border-radius:4px;background:#faf3e5;color:#3f3528;font-size:13px" oninput="window.updateMsDesc(this)">' +
      '<input type="number" class="ms-stacks" min="1" value="' + (stacks||1) + '" style="width:55px;padding:5px 8px;border:1px solid #d8c29b;border-radius:4px;background:#faf3e5;color:#3f3528;font-size:13px;text-align:center">' +
      '<span style="font-size:12px;color:#7b6953">层</span>' +
      '<button class="btn btn-sm btn-danger" onclick="this.parentElement.parentElement.remove()">✕</button>' +
    '</div>' +
    '<div class="ms-type-desc" style="font-size:11px;padding:3px 4px 0 4px;min-height:16px">' + badgeHtml + '<span class="ms-desc" style="color:#7bed9f">' + (desc||'') + '</span></div>';
  container.appendChild(row);
}

// 导出供其他模块使用的快捷函数
export function addPMarkRow(name, stacks, desc, type) { addMsRow('pMarksContainer', 'marksList', name, stacks, desc, type); }
export function addOMarkRow(name, stacks, desc, type) { addMsRow('oMarksContainer', 'marksList', name, stacks, desc, type); }
export function addPStatusRow(name, stacks, desc, type) { addMsRow('pStatusContainer', 'statusList', name, stacks, desc, type); }
export function addOStatusRow(name, stacks, desc, type) { addMsRow('oStatusContainer', 'statusList', name, stacks, desc, type); }

/** 更新印记/状态描述 + 类型标签 */
export function updateMsDesc(input) {
  const row = input.closest('.ms-row');
  if (!row) return;
  const name = input.value.trim();
  const listId = input.getAttribute('list');

  // 更新描述
  const db = (listId === 'marksList') ? MARKS_DB : STATUS_DB;
  const descEl = row.querySelector('.ms-desc');
  if (descEl) descEl.textContent = msDesc(name, db);

  // 更新类型标签
  const typeContainer = row.querySelector('.ms-type-desc');
  if (typeContainer) {
    const t = getEntryType(name, listId);
    const badgeHtml = t
      ? '<span class="mark-type-badge ' + typeClass(t) + '">' + typeLabel(t) + '</span>'
      : '';
    const existingDesc = typeContainer.querySelector('.ms-desc');
    const descText = existingDesc ? existingDesc.textContent : '';
    typeContainer.innerHTML = badgeHtml + '<span class="ms-desc" style="color:#7bed9f">' + descText + '</span>';
  }
}

/** 收集容器中所有印记/状态数据（含 type） */
export function collectContainer(containerId) {
  const items = [];
  const isMarks = containerId === 'pMarksContainer' || containerId === 'oMarksContainer';
  const listId = isMarks ? 'marksList' : 'statusList';
  document.querySelectorAll('#' + containerId + ' .ms-row').forEach(row => {
    const name = row.querySelector('.ms-name').value.trim();
    const stacks = parseInt(row.querySelector('.ms-stacks').value) || 1;
    const descEl = row.querySelector('.ms-desc');
    const desc = descEl ? descEl.textContent : '';
    if (name) {
      const type = getEntryType(name, listId);
      items.push({name, stacks, desc, type});
    }
  });
  return items;
}

/** 渲染印记/状态 UI */
export function renderMarksStatus(pMarks, oMarks, pStatus, oStatus) {
  const pmc = document.getElementById('pMarksContainer');
  if (pmc) {
    pmc.innerHTML = '';
    if (pMarks) pMarks.forEach(m => addPMarkRow(m.name, m.stacks, m.desc, m.type));
  }
  const omc = document.getElementById('oMarksContainer');
  if (omc) {
    omc.innerHTML = '';
    if (oMarks) oMarks.forEach(m => addOMarkRow(m.name, m.stacks, m.desc, m.type));
  }
  const pc = document.getElementById('pStatusContainer');
  if (pc) {
    pc.innerHTML = '';
    if (pStatus) pStatus.forEach(s => addPStatusRow(s.name, s.stacks, s.desc, s.type));
  }
  const oc = document.getElementById('oStatusContainer');
  if (oc) {
    oc.innerHTML = '';
    if (oStatus) oStatus.forEach(s => addOStatusRow(s.name, s.stacks, s.desc, s.type));
  }
}

/** 更新印记/状态区显示的当前精灵名 */
export function updateMsActivePokemon(pName, oName) {
  const el = document.getElementById('msActivePokemon');
  if (el) el.textContent = pName || '-';
  const el2 = document.getElementById('msOpponentPokemon');
  if (el2) el2.textContent = oName || '-';
}

// ===== 导出到 window（供 onclick 使用） =====
window.addPMarkRow = addPMarkRow;
window.addOMarkRow = addOMarkRow;
window.addPStatusRow = addPStatusRow;
window.addOStatusRow = addOStatusRow;
window.updateMsDesc = updateMsDesc;
