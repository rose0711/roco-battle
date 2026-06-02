// ============================================================
// file-io.js — 存档/读档（File System Access API）
// ============================================================

import { showToast } from './utils.js';
import { dataLoaded } from './csv-loader.js';

// ===== 对战存档 =====
let dirHandle = null;
let _battleRef = null;

/** 回调函数：载入存档后需要恢复状态 */
let _onLoadCallback = null;

export function setBattleRef(ref) {
  _battleRef = ref;
}

export function setOnLoadCallback(fn) {
  _onLoadCallback = fn;
}

async function saveBattleToFile() {
  const battle = _battleRef;
  if (!battle) throw new Error('battle ref not set');
  const json = JSON.stringify(battle, null, 2);
  if (!dirHandle) {
    dirHandle = await window.showDirectoryPicker({ id: 'battle-saves' });
  }
  const fileName = 'battle_' + battle.battle_id + '.json';
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(json);
  await writable.close();
}

export async function saveBattle() {
  if (!dataLoaded) { showToast('数据未就绪', 'error'); return; }
  try {
    await saveBattleToFile();
    showToast('已保存', 'success');
  } catch(e) {
    showToast('保存失败: ' + e.message, 'error');
  }
}

export async function loadBattle() {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON 存档', accept: { 'application/json': ['.json'] } }]
    });
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (_onLoadCallback) {
      await _onLoadCallback(data);
    }
    return data;
  } catch(e) {
    if (e.name !== 'AbortError') {
      showToast('载入失败: ' + e.message, 'error');
    }
    return null;
  }
}

/**
 * 保存回合——尝试写入目录，失败则 fallback 为下载
 */
export async function saveTurn(turnData) {
  const battle = _battleRef;
  if (!battle) return false;
  try {
    await saveBattleToFile();
    return true;
  } catch(e) {
    try {
      const json = JSON.stringify(battle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'battle_' + battle.battle_id + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      return true;
    } catch(e2) {
      console.warn('Save fallback failed:', e2);
      return false;
    }
  }
}

/** 对战数据引用同步到全局（供旧代码访问） */
export function syncDirHandle(battleArg) {
  _battleRef = battleArg;
}
