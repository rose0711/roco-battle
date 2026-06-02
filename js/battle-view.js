// ============================================================
// battle-view.js — 对战视图（本地 auto-fill、行动 UI、结算）
// ============================================================

import { showToast, toggleSection, updateHPDisplay, autoFillSkill, updateSkillInfoDisplay, getImageURL, updateSpriteImage, collectPokemonBase, getSpritePokemon, getSkillInfo, getSkillDisplay } from './utils.js';
import { SKILLS_DB } from './csv-loader.js';
import { renderMarksStatus, collectContainer, updateMsActivePokemon, addPStatusRow, addOStatusRow } from './status-system.js';
import { turnData, _prevPActionType, _prevOActionType, _msBackup, currentTurnNumber, renderOpponentSkills, setPrevPActionType, setPrevOActionType, setMsBackupP, setMsBackupO } from './battle-engine.js';
import { store } from './store.js';

// ===== 首领化图标更新 =====
// ===== Auto-fill 精灵信息 =====
export function autoFillPlayer() {
  const name = document.getElementById('pName').value.trim();
  const poke = getSpritePokemon(name);
  if (!poke) return;
  document.getElementById('pType').value = poke.type || '';
  document.getElementById('pAbility').value = poke.ability_name || '';
  document.getElementById('pAbilityDesc').value = poke.ability_desc || '';
  document.getElementById('pStrong').value = poke.strong_against || '';
  document.getElementById('pWeak').value = poke.weak_to || '';
  document.getElementById('pResists').value = poke.resists || '';
  document.getElementById('pResisted').value = poke.resisted_by || '';
  const spriteBox = document.getElementById('playerSpriteBox');
  if (spriteBox) updateSpriteImage(spriteBox, name);
}

export function autoFillOpponent() {
  const name = document.getElementById('oName').value.trim();
  const poke = getSpritePokemon(name);
  if (!poke) return;
  document.getElementById('oType').value = poke.type || '';
  document.getElementById('oAbility').value = poke.ability_name || '';
  document.getElementById('oAbilityDesc').value = poke.ability_desc || '';
  document.getElementById('oStrong').value = poke.strong_against || '';
  document.getElementById('oWeak').value = poke.weak_to || '';
  document.getElementById('oResists').value = poke.resists || '';
  document.getElementById('oResisted').value = poke.resisted_by || '';
  const spriteBox = document.getElementById('opponentSpriteBox');
  if (spriteBox) updateSpriteImage(spriteBox, name);
}

export function autoFillOpponentReserve(idx) {
  const el = document.getElementById('oReserveName' + idx);
  const name = el ? el.value.trim() : '';
  const abil = document.getElementById('oReserveAbility' + idx);
  const abilDesc = document.getElementById('oReserveAbilityDesc' + idx);
  if (!name) {
    if (abil) abil.textContent = '';
    if (abilDesc) abilDesc.textContent = '';
    return;
  }
  const imgContainer = document.getElementById('oReserveImg' + idx);
  if (imgContainer) {
    imgContainer.innerHTML = '';
    updateSpriteImage(imgContainer, name);
  }
  const poke = getSpritePokemon(name);
  if (poke) {
    if (abil) abil.textContent = '⚡ ' + (poke.ability_name || '');
    if (abilDesc) abilDesc.textContent = poke.ability_desc || '';
  }
}

// ===== 阵亡处理 =====
// 填充替换上场下拉
export function populateDeathReplaceDropdown(side) {
  const isPlayer = side === 'P';
  const sel = document.getElementById('oc' + side + 'ReplaceWith');
  if (!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">-- 选择 --</option>';

  const reserves = isPlayer
    ? (turnData && turnData.player.reserve_pokemon || [])
    : (turnData && turnData.opponent.reserve_pokemon || []);

  // 敌方未知阵容 → 专用选项
  if (!isPlayer && !turnData.opponent_reserve_known && reserves.length === 0) {
    sel.innerHTML += '<option value="__manual__">🆕 未知精灵（下方手动输入）</option>';
    sel.innerHTML += '<option value="" disabled>— 或在下拉外手动录入 —</option>';
    sel.value = prevVal || '';
    return;
  }

  reserves.forEach(r => {
    const hp = isPlayer ? r.current_hp : r.current_hp_percentage;
    if (hp !== null && hp !== undefined && hp > 0 && r.name) {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name + ' (HP: ' + hp + (isPlayer ? '' : '%') + ')';
      sel.appendChild(opt);
    }
  });

  if (sel.options.length <= 1) {
    sel.innerHTML += '<option value="" disabled>⚠ 无可上场后备</option>';
  }
  sel.value = prevVal || '';
}

// ===== 复活处理 =====
export function toggleResurrectRow(side) {
  const willResurrect = document.getElementById('oc' + side + 'Resurrect').value === 'true';
  const afterInput = document.getElementById('oc' + side + 'ResurrectAfter');
  const afterDisplay = document.getElementById('oc' + side + 'ResurrectAfterDisplay');
  if (afterInput) { afterInput.disabled = !willResurrect; afterInput.style.display = willResurrect ? '' : 'none'; }
  if (afterDisplay) afterDisplay.style.display = willResurrect ? 'none' : '';
}

// 替换上场变更时自动预填结算 HP/能量
let _deathReplaceUpdating = false;  // 防止 onDeathReplaceChange <-> updateOutcomeResult 循环

// 从 DOM 后备显示区读取精灵数据（比 turnData 更可靠，用户看到什么就读到什么）
function getReserveFromDOM(side, name) {
  const prefix = side === 'P' ? 'p' : 'o';
  for (let i = 0; i < 5; i++) {
    const nameEl = document.getElementById(prefix + 'ReserveName' + i);
    if (nameEl && nameEl.textContent.trim() === name) {
      const hpEl = document.getElementById(prefix + 'ReserveHpDisplay' + i);
      const enEl = document.getElementById(prefix + 'ReserveEnDisplay' + i);
      let hp = null, maxHp = null, energy = null;
      if (hpEl) {
        const m = hpEl.textContent.match(/HP:\s*([\d.]+)\s*\/\s*([\d.]+)/);
        if (m) { hp = parseInt(m[1]); maxHp = parseInt(m[2]); }
      }
      if (enEl) {
        const m = enEl.textContent.match(/能量:\s*([\d.]+)\s*\/\s*([\d.]+)/);
        if (m) energy = parseInt(m[1]);
      }
      return { hp, maxHp, energy };
    }
  }
  return null;
}

export function onDeathReplaceChange(side) {
  const isPlayer = side === 'P';
  const replaceName = document.getElementById('oc' + side + 'ReplaceWith').value;
  if (!replaceName || replaceName === '__manual__') return;

  // 优先从 DOM 读取（用户看到什么就用什么）
  const fromDom = getReserveFromDOM(side, replaceName);

  if (isPlayer) {
    let hp = '', maxHp = '-', energy = '';
    if (fromDom) {
      hp = fromDom.hp != null ? fromDom.hp : '';
      maxHp = fromDom.maxHp != null ? fromDom.maxHp : '-';
      energy = fromDom.energy != null ? fromDom.energy : '';
    } else {
      // 降级到 turnData
      const reserves = (turnData && turnData.player.reserve_pokemon) || [];
      const found = reserves.find(r => r.name === replaceName);
      if (found) {
        hp = found.current_hp != null ? found.current_hp : '';
        maxHp = found.max_hp != null ? found.max_hp : '-';
        energy = found.current_energy != null ? found.current_energy : '';
      }
    }
    document.getElementById('ocPHp').value = hp;
    document.getElementById('ocPrevPHp').textContent = hp !== '' ? hp : '-';
    document.getElementById('ocPEnergy').value = energy;
    const maxEl = document.getElementById('ocPMaxHpDisplay');
    if (maxEl) maxEl.textContent = maxHp;
    document.getElementById('ocPlayerPokemon').textContent = replaceName;
  } else {
    let hp = '', energy = '';
    if (fromDom) {
      hp = fromDom.hp != null ? fromDom.hp : '';
      energy = fromDom.energy != null ? fromDom.energy : '';
    } else {
      const reserves = (turnData && turnData.opponent.reserve_pokemon) || [];
      const found = reserves.find(r => r.name === replaceName);
      if (found) {
        hp = found.current_hp_percentage != null ? found.current_hp_percentage : '';
        energy = found.current_energy != null ? found.current_energy : '';
      }
    }
    document.getElementById('ocOHp').value = hp;
    document.getElementById('ocPrevOHp').textContent = hp !== '' ? hp : '-';
    document.getElementById('ocOEnergy').value = energy;
    document.getElementById('ocOpponentPokemon').textContent = replaceName;
  }
  updateDamageAuto();
  if (!_deathReplaceUpdating) {
    window.updateOutcomeResult && window.updateOutcomeResult();
  }
}

export function toggleDeathRow(side) {
  const isDead = document.getElementById('oc' + side + 'Dead').value === 'true';
  const deduction = document.getElementById('oc' + side + 'Deduction');
  const deductionDisplay = document.getElementById('oc' + side + 'DeductionDisplay');
  const replaceSel = document.getElementById('oc' + side + 'ReplaceWith');

  if (deduction) { deduction.disabled = !isDead; deduction.style.display = isDead ? '' : 'none'; }
  if (deductionDisplay) deductionDisplay.style.display = isDead ? 'none' : '';
  if (replaceSel) replaceSel.disabled = !isDead;

  // 复活联动：非阵亡时禁用并复位
  var resurrectEl = document.getElementById('oc' + side + 'Resurrect');
  var resurrectAfter = document.getElementById('oc' + side + 'ResurrectAfter');
  if (resurrectEl) resurrectEl.disabled = !isDead;
  if (resurrectAfter) { resurrectAfter.disabled = !isDead; if (!isDead) resurrectAfter.value = 3; }
  if (resurrectEl && !isDead) resurrectEl.value = 'false';

  if (isDead) {
    populateDeathReplaceDropdown(side);
  } else {
    if (replaceSel) {
      replaceSel.value = '';
      replaceSel.innerHTML = '<option value="">-- 选择 --</option>';
    }
    if (deduction) deduction.value = '1';
  }
  window.updateOutcomeResult && window.updateOutcomeResult();
}

// ===== 切换目标时显示该目标的印记/状态 =====
export function showSwitchTargetStatus(side) {
  var isP = side === 'P';
  var prefix = isP ? 'p' : 'o';
  var typeEl = document.getElementById(prefix + 'ActionType');
  if (!typeEl) return;
  // 主换宠和 switch_after 都处理
  var target = typeEl.value === 'switch' ? (document.getElementById(prefix + 'ActionSkill') || {}).value : '';
  if (!target && typeEl.value === 'use_skill') {
    var extraRadio = document.querySelector('input[name="' + prefix + 'ExtraAction"]:checked');
    if (extraRadio && extraRadio.value === 'switch_after') {
      target = (document.getElementById(prefix + 'ActionSwitchAfter') || {}).value || '';
    }
  }
  if (!target) return;
  var reserves = turnData && (isP ? turnData.player.reserve_pokemon : turnData.opponent.reserve_pokemon) || [];
  var entry = reserves.find(function(r){ return r.name === target; });
  if (!entry) return;
  var status = entry.status || [];
  var containerId = isP ? 'pStatusContainer' : 'oStatusContainer';
  var addFn = isP ? addPStatusRow : addOStatusRow;
  var container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = '';
    status.forEach(function(s){ addFn(s.name, s.stacks, s.desc, s.type); });
  }
}

// ===== 结算 HP 自动计算 =====
export function updateDamageAuto() {
  const pPrev = document.getElementById('ocPrevPHp');
  const pInit = pPrev ? parseInt(pPrev.textContent) : null;
  const pHpVal = document.getElementById('ocPHp').value;
  const pHp = pHpVal === '' ? 0 : (parseInt(pHpVal) || 0);
  const pDmg = document.getElementById('ocPDmg');
  if (pDmg && pInit !== null) {
    const dmg = pInit - pHp;
    pDmg.value = Math.max(0, isNaN(dmg) ? 0 : dmg);
  }

  const oPrev = document.getElementById('ocPrevOHp');
  const oInit = oPrev ? parseInt(oPrev.textContent) : null;
  const oHpVal = document.getElementById('ocOHp').value;
  const oHp = oHpVal === '' ? 0 : (parseInt(oHpVal) || 0);
  const oDmg = document.getElementById('ocODmg');
  if (oDmg && oInit !== null) {
    const dmg = oInit - oHp;
    oDmg.value = Math.max(0, isNaN(dmg) ? 0 : dmg);
  }
}

export function updateOcMaxHpDisplay() {
  const el = document.getElementById('ocPMaxHpDisplay');
  if (!el) return;
  const maxHp = document.getElementById('pMaxHP').value;
  el.textContent = maxHp || '-';
  updateDamageAuto();
}

export function syncSideToOutcome(side) {
  if (side === 'p') {
    const hp = document.getElementById('pCurrHP').value || '';
    document.getElementById('ocPHp').value = hp;
    document.getElementById('ocPrevPHp').textContent = hp || '-';
    document.getElementById('ocPEnergy').value = document.getElementById('pCurrEnergy').value || '';
  } else if (side === 'o') {
    const hp = document.getElementById('oCurrHP').value || '';
    document.getElementById('ocOHp').value = hp;
    document.getElementById('ocPrevOHp').textContent = hp || '-';
    document.getElementById('ocOEnergy').value = document.getElementById('oCurrEnergy').value || '';
  }
  updateDamageAuto();
}

export function syncActiveToOutcome() {
  syncSideToOutcome('p');
  syncSideToOutcome('o');
}

// ===== 结算面板渲染 =====
export function renderOutcome() {
  const pName = document.getElementById('pName').value.trim();
  const oName = document.getElementById('oName').value.trim();
  document.getElementById('ocPlayerPokemon').textContent = pName || '-';
  document.getElementById('ocOpponentPokemon').textContent = oName || '-';
  updateOutcomeResult();
}

function lookupReserve(side, name) {
  if (side === 'p' && turnData) {
    const found = (turnData.player.reserve_pokemon || []).find(r => r.name === name);
    if (found) {
      return { hp: found.current_hp, maxHp: found.max_hp, energy: found.current_energy };
    }
  } else if (side === 'o' && turnData) {
    const found = (turnData.opponent.reserve_pokemon || []).find(r => r.name === name);
    if (found) {
      return { hpPercent: found.current_hp_percentage, energy: found.current_energy };
    }
  }
  return null;
}

function applyReserveToOutcome(side, reserveInfo) {
  if (!reserveInfo) {
    if (side === 'p') {
      document.getElementById('ocPHp').value = '';
      document.getElementById('ocPrevPHp').textContent = '-';
      document.getElementById('ocPEnergy').value = '';
      document.getElementById('ocPMaxHpDisplay').textContent = '-';
    } else {
      document.getElementById('ocOHp').value = '';
      document.getElementById('ocPrevOHp').textContent = '-';
      document.getElementById('ocOEnergy').value = '';
    }
    updateDamageAuto();
    return;
  }
  if (side === 'p') {
    var hp = reserveInfo.hp;
    document.getElementById('ocPHp').value = hp;
    document.getElementById('ocPrevPHp').textContent = hp || '-';
    document.getElementById('ocPEnergy').value = reserveInfo.energy;
    document.getElementById('ocPMaxHpDisplay').textContent = reserveInfo.maxHp || '-';
  } else {
    var hp = reserveInfo.hpPercent != null && reserveInfo.hpPercent !== '' ? reserveInfo.hpPercent : '';
    document.getElementById('ocOHp').value = hp;
    document.getElementById('ocPrevOHp').textContent = hp || '-';
    document.getElementById('ocOEnergy').value = reserveInfo.energy != null && reserveInfo.energy !== '' ? reserveInfo.energy : '';
  }
  updateDamageAuto();
}

export function updateOutcomeResult() {
  const pAction = document.getElementById('pActionType').value;
  let pResult = '';
  if (pAction === 'switch') {
    const target = document.getElementById('pActionSkill') ? document.getElementById('pActionSkill').value || '未知' : '未知';
    pResult = '更换精灵–' + target + '登场';
    document.getElementById('ocPlayerPokemon').textContent = target;
    const res = lookupReserve('p', target);
    applyReserveToOutcome('p', res);
  } else if (pAction === 'recharge') {
    pResult = '回复5点能量';
    const pn = document.getElementById('pName').value.trim();
    if (pn) document.getElementById('ocPlayerPokemon').textContent = pn;
    updateOcMaxHpDisplay();
    syncSideToOutcome('p');
  } else if (pAction === 'wish_strike') {
    pResult = '愿力冲击-造成高额伤害，若敌方使用状态技能则我方必定先手且威力提升两倍';
    const pn = document.getElementById('pName').value.trim();
    if (pn) document.getElementById('ocPlayerPokemon').textContent = pn;
    updateOcMaxHpDisplay();
    syncSideToOutcome('p');
  } else {
    const skill = document.getElementById('pActionSkill') ? document.getElementById('pActionSkill').value : '';
    const extraRadio = document.querySelector('input[name="pExtraAction"]:checked');
    const extraVal = extraRadio ? extraRadio.value : 'none';
    let switchAfterTarget = '';
    let bossifyTarget = '';
    if (extraVal === 'switch_after') {
      const sel = document.getElementById('pActionSwitchAfter');
      if (sel && sel.value) switchAfterTarget = sel.value;
    } else if (extraVal === 'bossify') {
      const input = document.getElementById('pBossifyForm');
      if (input && input.value.trim()) bossifyTarget = input.value.trim();
    }
    if (skill) {
      const info = getSkillInfo(skill);
      pResult = info ? info.effect : '释放技能 ' + skill;
    }
    if (bossifyTarget) {
      pResult = (skill ? pResult + ' → ' : '') + '首领化·' + bossifyTarget;
      document.getElementById('ocPlayerPokemon').textContent = bossifyTarget;
      updateOcMaxHpDisplay();
      syncSideToOutcome('p');
    } else if (switchAfterTarget) {
      pResult += ' → 换' + switchAfterTarget + '登场';
      document.getElementById('ocPlayerPokemon').textContent = switchAfterTarget;
      const res = lookupReserve('p', switchAfterTarget);
      applyReserveToOutcome('p', res);
    } else {
      const pn = document.getElementById('pName').value.trim();
      if (pn) document.getElementById('ocPlayerPokemon').textContent = pn;
      updateOcMaxHpDisplay();
      syncSideToOutcome('p');
    }
  }
  // 追加阵亡替换描述（同时重新设置结算字段，覆盖 syncSideToOutcome 的干扰）
  const pDead = document.getElementById('ocPDead').value === 'true';
  if (pDead) {
    const pName_ = document.getElementById('ocPlayerPokemon').textContent;
    const pReplace = document.getElementById('ocPReplaceWith') ? document.getElementById('ocPReplaceWith').value : '';
    if (pReplace && pReplace !== '__manual__') {
      document.getElementById('ocPlayerPokemon').textContent = pReplace;
      // 重新填充 HP/能量（覆盖 syncSideToOutcome 的干扰）
      _deathReplaceUpdating = true;
      onDeathReplaceChange('P');
      _deathReplaceUpdating = false;
    }
    let deathInfo = (pName_ || '当前精灵') + '阵亡';
    if (pReplace && pReplace !== '__manual__') deathInfo += '→' + pReplace + '上场';
    pResult = (pResult && pResult !== '-' ? pResult + ' | ' : '') + deathInfo;
  }
  document.getElementById('ocPResult').textContent = pResult || '-';

  const oAction = document.getElementById('oActionType').value;
  let oResult = '';
  if (oAction === 'switch') {
    let target = '';
    const skillEl = document.getElementById('oActionSkill');
    if (skillEl) target = skillEl.value;
    const manualNew = document.getElementById('oActionSwitchNew');
    if (manualNew && manualNew.value.trim()) target = manualNew.value.trim();
    if (target === '__new__' || !target) target = manualNew ? manualNew.value.trim() : '';
    oResult = '更换精灵–' + (target || '未知') + '登场';
    document.getElementById('ocOpponentPokemon').textContent = target || '未知';
    let res = target ? lookupReserve('o', target) : null;
    // 新精灵（不在后备中）给默认值
    if (!res && target) {
      res = { hpPercent: 100, energy: 10 };
    }
    applyReserveToOutcome('o', res);
  } else if (oAction === 'recharge') {
    oResult = '回复5点能量';
    const on = document.getElementById('oName').value.trim();
    if (on) document.getElementById('ocOpponentPokemon').textContent = on;
    syncSideToOutcome('o');
  } else if (oAction === 'wish_strike') {
    oResult = '愿力冲击-造成高额伤害，若敌方使用状态技能则我方必定先手且威力提升两倍';
    const on = document.getElementById('oName').value.trim();
    if (on) document.getElementById('ocOpponentPokemon').textContent = on;
    syncSideToOutcome('o');
  } else {
    const skillEl = document.getElementById('oActionSkill');
    let skill = skillEl ? skillEl.value : '';
    const manual = document.getElementById('oActionSkillManual');
    if (manual && manual.value.trim()) skill = manual.value.trim();
    const oExtraRadio = document.querySelector('input[name="oExtraAction"]:checked');
    const oExtraVal = oExtraRadio ? oExtraRadio.value : 'none';
    let oSwitchAfterTarget = '';
    let oBossifyTarget = '';
    if (oExtraVal === 'switch_after') {
      const sel = document.getElementById('oActionSwitchAfter');
      const newInput = document.getElementById('oActionSwitchAfterNew');
      if (newInput && newInput.value.trim()) oSwitchAfterTarget = newInput.value.trim();
      else if (sel && sel.value) oSwitchAfterTarget = sel.value;
    } else if (oExtraVal === 'bossify') {
      const input = document.getElementById('oBossifyForm');
      if (input && input.value.trim()) oBossifyTarget = input.value.trim();
    }
    if (skill && skill !== '') {
      const info = getSkillInfo(skill);
      oResult = info ? info.effect : '释放技能 ' + skill;
    }
    if (oBossifyTarget) {
      oResult = (skill && skill !== '' ? oResult + ' → ' : '') + '首领化·' + oBossifyTarget;
      document.getElementById('ocOpponentPokemon').textContent = oBossifyTarget;
      syncSideToOutcome('o');
    } else if (oSwitchAfterTarget) {
      oResult = (skill && skill !== '' ? oResult + ' → ' : '') + '换' + oSwitchAfterTarget + '登场';
      document.getElementById('ocOpponentPokemon').textContent = oSwitchAfterTarget;
      const res = lookupReserve('o', oSwitchAfterTarget);
      applyReserveToOutcome('o', res);
    } else {
      const on = document.getElementById('oName').value.trim();
      if (on) document.getElementById('ocOpponentPokemon').textContent = on;
      syncSideToOutcome('o');
    }
  }
  // 追加敌方阵亡替换描述（同时重新设置结算字段）
  const oDead = document.getElementById('ocODead').value === 'true';
  if (oDead) {
    const oName_ = document.getElementById('ocOpponentPokemon').textContent;
    const oReplace = document.getElementById('ocOReplaceWith') ? document.getElementById('ocOReplaceWith').value : '';
    if (oReplace && oReplace !== '__manual__') {
      document.getElementById('ocOpponentPokemon').textContent = oReplace;
      _deathReplaceUpdating = true;
      onDeathReplaceChange('O');
      _deathReplaceUpdating = false;
    }
    let deathInfo = (oName_ || '当前精灵') + '阵亡';
    if (oReplace && oReplace !== '__manual__') deathInfo += '→' + oReplace + '上场';
    oResult = (oResult && oResult !== '-' ? oResult + ' | ' : '') + deathInfo;
  }
  document.getElementById('ocOResult').textContent = oResult || '-';

  const ocPoke = document.getElementById('ocPlayerPokemon').textContent;
  const ocOPoke = document.getElementById('ocOpponentPokemon').textContent;
  if (ocPoke && ocPoke !== '-') updateMsActivePokemon(ocPoke, ocOPoke);
}

export function clearOutcomeFields() {
  document.getElementById('ocPHp').value = '0';
  document.getElementById('ocPrevPHp').textContent = '0';
  document.getElementById('ocPEnergy').value = '0';
  document.getElementById('ocPDmg').value = '0';
  document.getElementById('ocPDead').value = 'false';
  document.getElementById('ocPDeduction').disabled = true;
  document.getElementById('ocPDeduction').style.display = 'none';
  var pDedDisp = document.getElementById('ocPDeductionDisplay');
  if (pDedDisp) pDedDisp.style.display = '';
  document.getElementById('ocPReplaceWith').disabled = true;
  document.getElementById('ocPReplaceWith').value = '';
  document.getElementById('ocPReplaceWith').innerHTML = '<option value="">-- 选择 --</option>';
  // 复活复位
  document.getElementById('ocPResurrect').value = 'false';
  document.getElementById('ocPResurrect').disabled = true;
  document.getElementById('ocPResurrectAfter').value = 3;
  document.getElementById('ocPResurrectAfter').disabled = true;
  document.getElementById('ocPResurrectAfter').style.display = 'none';
  var pResDisp = document.getElementById('ocPResurrectAfterDisplay');
  if (pResDisp) pResDisp.style.display = '';
  document.getElementById('ocOHp').value = '0';
  document.getElementById('ocPrevOHp').textContent = '0';
  document.getElementById('ocOEnergy').value = '0';
  document.getElementById('ocODmg').value = '0';
  document.getElementById('ocODead').value = 'false';
  document.getElementById('ocODeduction').disabled = true;
  document.getElementById('ocODeduction').style.display = 'none';
  var oDedDisp = document.getElementById('ocODeductionDisplay');
  if (oDedDisp) oDedDisp.style.display = '';
  document.getElementById('ocOReplaceWith').disabled = true;
  document.getElementById('ocOReplaceWith').value = '';
  document.getElementById('ocOReplaceWith').innerHTML = '<option value="">-- 选择 --</option>';
  // 敌方复活复位
  document.getElementById('ocOResurrect').value = 'false';
  document.getElementById('ocOResurrect').disabled = true;
  document.getElementById('ocOResurrectAfter').value = 3;
  document.getElementById('ocOResurrectAfter').disabled = true;
  document.getElementById('ocOResurrectAfter').style.display = 'none';
  var oResDisp = document.getElementById('ocOResurrectAfterDisplay');
  if (oResDisp) oResDisp.style.display = '';
  document.getElementById('ocPResult').textContent = '-';
  document.getElementById('ocOResult').textContent = '-';
  document.getElementById('ocPMaxHpDisplay').textContent = '-';
}

// ===== 检测后备精灵是否存活（HP > 0），优先从 DOM 读 =====
function isReserveAlive(side, name) {
  const prefix = side === 'P' ? 'p' : 'o';
  for (let i = 0; i < 5; i++) {
    const nameEl = document.getElementById(prefix + 'ReserveName' + i);
    if (nameEl && nameEl.textContent.trim() === name) {
      const hpEl = document.getElementById(prefix + 'ReserveHpDisplay' + i);
      if (hpEl) {
        const m = hpEl.textContent.match(/HP:\s*([\d.]+)/);
        if (m) return parseInt(m[1]) > 0;
      }
      return true;
    }
  }
  // 降级到 turnData
  const reserves = (turnData && (side === 'P' ? turnData.player : turnData.opponent).reserve_pokemon) || [];
  const found = reserves.find(r => r.name === name);
  if (found) {
    const hp = side === 'P' ? found.current_hp : found.current_hp_percentage;
    return hp === null || hp === undefined || hp > 0;
  }
  return true;
}

// ===== 更换行动类型时重置本侧阵亡字段 =====
function resetDeathFieldsForSide(side) {
  const deadEl = document.getElementById('oc' + side + 'Dead');
  if (deadEl) deadEl.value = 'false';
  const deduction = document.getElementById('oc' + side + 'Deduction');
  if (deduction) { deduction.disabled = true; deduction.value = '1'; }
  const replaceSel = document.getElementById('oc' + side + 'ReplaceWith');
  if (replaceSel) { replaceSel.disabled = true; replaceSel.value = ''; replaceSel.innerHTML = '<option value="">-- 选择 --</option>'; }
}

// ===== 行动 UI =====
export function updatePlayerActionUI() {
  resetDeathFieldsForSide('P');
  const type = document.getElementById('pActionType').value;
  const detail = document.getElementById('pActionDetail');

  // 切换行动类型时清空/恢复状态
  if (_prevPActionType !== type) {
    if (type === 'switch') {
      // 备份全部状态（含持久），清空 DOM，避免旧状态污染切换后的显示
      setMsBackupP(collectContainer('pStatusContainer'));
      document.getElementById('pStatusContainer').innerHTML = '';
    } else if (_prevPActionType === 'switch') {
      renderMarksStatus(collectContainer('pMarksContainer'), collectContainer('oMarksContainer'), _msBackup.pStatus || [], collectContainer('oStatusContainer'));
    }
    setPrevPActionType(type);
  }

  const extraArea = document.getElementById('pExtraActionArea');
  if (extraArea) extraArea.style.display = (type === 'use_skill') ? 'block' : 'none';

  if (type === 'use_skill') {
    let sel = '<select id="pActionSkill" onchange="updateOutcomeResult()">';
    for (let i = 0; i < 4; i++) {
      const val = document.getElementById('pSkill' + i).value.trim();
      if (val) sel += '<option value="' + val + '">' + val + '</option>';
    }
    sel += '</select>';
    detail.innerHTML = '<label>选择技能</label>' + sel;
  } else if (type === 'recharge') {
    detail.innerHTML = '<span style="font-size:12px;color:#7bed9f">⚡ 回复 5 点能量</span>';
  } else if (type === 'wish_strike') {
    detail.innerHTML = '<span style="font-size:12px;color:#f39c12">💥 愿力冲击 - 造成高额伤害，对状态技能先手且威力×2</span>';
  } else {
    let sel = '<select id="pActionSkill" onchange="updateOutcomeResult();window.showSwitchTargetStatus(\'P\')">';
    for (let i = 0; i < 5; i++) {
      const name = (document.getElementById('pReserveName' + i) || {}).textContent;
      if (name && name.trim() && isReserveAlive('P', name.trim())) {
        sel += '<option value="' + name.trim() + '">' + name.trim() + '</option>';
      }
    }
    sel += '</select>';
    detail.innerHTML = '<label>选择后备精灵</label>' + sel;
  }

  const extraRadio = document.querySelector('input[name="pExtraAction"]:checked');
  const extraVal = extraRadio ? extraRadio.value : 'none';
  const extraDetail = document.getElementById('pExtraActionDetail');
  if (extraDetail) {
    if (extraVal === 'switch_after') {
      let sel = '<select id="pActionSwitchAfter" onchange="updateOutcomeResult();window.showSwitchTargetStatus(\'P\')">';
      for (let i = 0; i < 5; i++) {
        const name = (document.getElementById('pReserveName' + i) || {}).textContent;
        if (name && name.trim() && isReserveAlive('P', name.trim())) {
          sel += '<option value="' + name.trim() + '">' + name.trim() + '</option>';
        }
      }
      sel += '</select>';
      extraDetail.innerHTML = '<label style="font-size:12px;color:#b09e82">更换为</label>' + sel;
      extraDetail.style.display = 'block';
    } else if (extraVal === 'bossify') {
      extraDetail.innerHTML = '<label style="font-size:12px;color:#b09e82">进化形态</label><input list="spriteList" id="pBossifyForm" placeholder="输入进化形态名..." style="width:100%;padding:5px 8px;border:1px solid #d8c29b;border-radius:4px;background:#faf3e5;color:#3f3528;font-size:13px;margin-top:3px" oninput="updateOutcomeResult()">' +
        '<div style="font-size:11px;color:#7b6953;margin-top:3px">技能 / 血量 / 能量不变，仅替换特性</div>';
      extraDetail.style.display = 'block';
    } else {
      extraDetail.style.display = 'none';
    }
  }
  updateOutcomeResult();
}

export function updateOpponentActionUI() {
  resetDeathFieldsForSide('O');
  const type = document.getElementById('oActionType').value;
  const detail = document.getElementById('oActionDetail');

  if (_prevOActionType !== type) {
    if (type === 'switch') {
      setMsBackupO(collectContainer('oStatusContainer'));
      document.getElementById('oStatusContainer').innerHTML = '';
    } else if (_prevOActionType === 'switch') {
      renderMarksStatus(collectContainer('pMarksContainer'), collectContainer('oMarksContainer'), collectContainer('pStatusContainer'), _msBackup.oStatus || []);
    }
    setPrevOActionType(type);
  }

  const extraArea = document.getElementById('oExtraActionArea');
  if (extraArea) extraArea.style.display = (type === 'use_skill') ? 'block' : 'none';

  if (type === 'recharge') {
    detail.innerHTML = '<span style="font-size:12px;color:#7bed9f">⚡ 回复 5 点能量</span>';
    updateOutcomeResult();
    return;
  }
  if (type === 'wish_strike') {
    detail.innerHTML = '<span style="font-size:12px;color:#f39c12">💥 愿力冲击 - 造成高额伤害，对状态技能先手且威力×2</span>';
    updateOutcomeResult();
    return;
  }

  if (type === 'use_skill') {
    let knownSkills = [];
    if (turnData && turnData.opponent.active_pokemon && turnData.opponent.active_pokemon.known_skills) {
      knownSkills = turnData.opponent.active_pokemon.known_skills;
    }
    let sel = '<select id="oActionSkill" onchange="updateOutcomeResult()">';
    if (knownSkills.length === 0) {
      sel += '<option value="">暂无已知技能（请在下方手动输入）</option>';
    } else {
      knownSkills.forEach(s => {
        const name = typeof s === 'string' ? s : (s.name || '');
        if (name) sel += '<option value="' + name + '">' + name + '</option>';
      });
    }
    sel += '</select>';
    detail.innerHTML = sel +
      '<div style="margin-top:4px;display:flex;gap:4px;align-items:center">' +
      '<input id="oActionSkillManual" list="skillList" placeholder="或手动输入新技能..." style="flex:1" oninput="window.autoFillSkill(\'oActionSkillManual\')">' +
      '<button class="btn btn-sm btn-primary" onclick="window.addOpponentSkill()">+ 记录</button></div>';
  } else {
    const mode = document.querySelector('input[name="opponentReserveMode"]:checked');
    const isKnown = mode && mode.value === 'known';
    let selHtml = '<label>选择后备 / 输入新精灵名</label><select id="oActionSkill" onchange="window.toggleOpponentSwitchManual();updateOutcomeResult();window.showSwitchTargetStatus(\'O\')">';
    selHtml += '<option value="">-- 选择 --</option>';
    const oReserves = (turnData && turnData.opponent.reserve_pokemon) || [];
    if (isKnown && oReserves.length > 0) {
      oReserves.forEach(r => { if (r.name && (r.current_hp_percentage === null || r.current_hp_percentage === undefined || r.current_hp_percentage > 0)) selHtml += '<option value="' + r.name + '">' + r.name + '</option>'; });
    } else if (isKnown) {
      for (let i = 0; i < 5; i++) {
        const el = document.getElementById('oReserveName' + i);
        if (el && el.value.trim() && isReserveAlive('O', el.value.trim())) selHtml += '<option value="' + el.value.trim() + '">' + el.value.trim() + '</option>';
      }
    }
    selHtml += '<option value="__new__">🆕 上场新精灵（手动输入）</option>';
    selHtml += '</select>';
    selHtml += '<div id="oSwitchManualContainer" style="margin-top:4px;display:none">';
    selHtml += '<input id="oActionSwitchNew" list="spriteList" placeholder="新精灵名字..." style="width:100%" oninput="window.updateOutcomeResult();window.showSwitchTargetStatus(\'O\')">';
    selHtml += '</div>';
    detail.innerHTML = selHtml;
  }

  const oExtraRadio = document.querySelector('input[name="oExtraAction"]:checked');
  const oExtraVal = oExtraRadio ? oExtraRadio.value : 'none';
  const oExtraDetail = document.getElementById('oExtraActionDetail');
  if (oExtraDetail) {
    if (oExtraVal === 'switch_after') {
      let sel = '<select id="oActionSwitchAfter" onchange="updateOutcomeResult();window.showSwitchTargetStatus(\'O\')"><option value="">-- 选择后备 --</option>';
      const mode = document.querySelector('input[name="opponentReserveMode"]:checked');
      const isKnown = mode && mode.value === 'known';
      if (isKnown) {
        // 优先从 turnData 读取敌方后备
        const oReserves = (turnData && turnData.opponent.reserve_pokemon) || [];
        if (oReserves.length > 0) {
          oReserves.forEach(function(r) { if (r.name && (r.current_hp_percentage === null || r.current_hp_percentage === undefined || r.current_hp_percentage > 0)) sel += '<option value="' + r.name + '">' + r.name + '</option>'; });
        } else {
          // 降级到从 DOM 读取（手动输入模式）
          for (let i = 0; i < 5; i++) {
            const el = document.getElementById('oReserveName' + i);
            if (el && el.value.trim() && isReserveAlive('O', el.value.trim())) sel += '<option value="' + el.value.trim() + '">' + el.value.trim() + '</option>';
          }
        }
      }
      sel += '</select>';
      sel += '<div style="display:flex;gap:4px;align-items:center;margin-top:4px">';
      sel += '<input id="oActionSwitchAfterNew" list="spriteList" placeholder="或手动输入新精灵名..." style="flex:1" oninput="window.autoFillSkill(\'oActionSwitchAfterNew\');updateOutcomeResult()">';
      sel += '</div>';
      oExtraDetail.innerHTML = '<label style="font-size:12px;color:#b09e82">更换为</label>' + sel;
      oExtraDetail.style.display = 'block';
    } else if (oExtraVal === 'bossify') {
      oExtraDetail.innerHTML = '<label style="font-size:12px;color:#b09e82">进化形态</label><input list="spriteList" id="oBossifyForm" placeholder="输入进化形态名..." style="width:100%;padding:5px 8px;border:1px solid #d8c29b;border-radius:4px;background:#faf3e5;color:#3f3528;font-size:13px;margin-top:3px" oninput="updateOutcomeResult()">' +
        '<div style="font-size:11px;color:#7b6953;margin-top:3px">技能 / 血量 / 能量不变，仅替换特性</div>';
      oExtraDetail.style.display = 'block';
    } else {
      oExtraDetail.style.display = 'none';
    }
  }
  updateOutcomeResult();
}

export function toggleOpponentSwitchManual() {
  const sel = document.getElementById('oActionSkill');
  const container = document.getElementById('oSwitchManualContainer');
  if (sel && container) container.style.display = (sel.value === '__new__' || sel.value === '') ? 'block' : 'none';
  updateOutcomeResult();
}

export function addOpponentSkill() {
  const manual = document.getElementById('oActionSkillManual').value.trim();
  if (!manual) { showToast('请输入技能名', 'error'); return; }
  if (!SKILLS_DB[manual]) { showToast('技能 "' + manual + '" 不存在于数据库', 'error'); return; }
  if (!turnData) {
    const { initTurnData } = require_or_global();
    initTurnData();
  }
  if (!turnData.opponent.active_pokemon) {
    turnData.opponent.active_pokemon = { name: document.getElementById('oName').value.trim() || '未知', known_skills: [] };
  }
  if (!turnData.opponent.active_pokemon.known_skills) turnData.opponent.active_pokemon.known_skills = [];
  const d = getSkillDisplay(manual);
  const skillObj = { name: manual, type: d ? d.type : '', category: d ? d.category : '', power: d ? d.power : '', energy: d ? d.energy : '', effect: d ? d.effect : '' };
  const alreadyExists = turnData.opponent.active_pokemon.known_skills.some(s => { const sn = typeof s === 'string' ? s : s.name; return sn === manual; });
  if (!alreadyExists) turnData.opponent.active_pokemon.known_skills.push(skillObj);
  renderOpponentSkills();
  updateOpponentActionUI();
  showToast('已记录技能: ' + manual, 'success');
}

// ===== 渲染代理函数 =====
export function renderActions() {
  updatePlayerActionUI();
  updateOpponentActionUI();
}

export function refreshOutcome() {
  renderOutcome();
}

// ===== 引用 engine 的状态变量（通过 live import binding 自动同步） =====

// ===== 导出到 window =====

window.autoFillPlayer = autoFillPlayer;
window.autoFillOpponent = autoFillOpponent;
window.autoFillOpponentReserve = autoFillOpponentReserve;
window.updatePlayerActionUI = updatePlayerActionUI;
window.updateOpponentActionUI = updateOpponentActionUI;
window.toggleOpponentSwitchManual = toggleOpponentSwitchManual;
window.addOpponentSkill = addOpponentSkill;
window.updateOutcomeResult = updateOutcomeResult;
window.updateDamageAuto = updateDamageAuto;
window.updateOcMaxHpDisplay = updateOcMaxHpDisplay;
window.syncSideToOutcome = syncSideToOutcome;
window.syncActiveToOutcome = syncActiveToOutcome;
window.renderOutcome = renderOutcome;
window.renderActions = renderActions;
window.refreshOutcome = refreshOutcome;
window.toggleDeathRow = toggleDeathRow;
window.populateDeathReplaceDropdown = populateDeathReplaceDropdown;
window.onDeathReplaceChange = onDeathReplaceChange;
window.clearOutcomeFields = clearOutcomeFields;
window.toggleResurrectRow = toggleResurrectRow;
window.showSwitchTargetStatus = showSwitchTargetStatus;
window.toggleSection = toggleSection;
window.updateHPDisplay = updateHPDisplay;
