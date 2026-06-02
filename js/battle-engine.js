// ============================================================
// battle-engine.js — 战斗推演核心（纯逻辑/状态管理）
// ============================================================

import { dataLoaded, isBossifiable } from './csv-loader.js';
import { showToast, collectPokemonBase, getSpritePokemon, getSkillDisplay, updateHPDisplay } from './utils.js';
import { renderMarksStatus, updateMsActivePokemon, collectContainer } from './status-system.js';
import { store } from './store.js';

// ===== 对战全局状态 =====
export const battle = {
  battle_id: Date.now(),
  turns: []
};
export let currentTurnNumber = 1;
export let turnData = null;

// 追踪行动类型，用于 switch 清空/恢复状态
export let _prevPActionType = 'use_skill';
export let _prevOActionType = 'use_skill';
export let _msBackup = { pStatus: null, oStatus: null };

// 从外部（battle-view）修改状态追踪变量的 setter
export function setPrevPActionType(v) { _prevPActionType = v; }
export function setPrevOActionType(v) { _prevOActionType = v; }
export function setMsBackupP(v) { _msBackup.pStatus = v; }
export function setMsBackupO(v) { _msBackup.oStatus = v; }

// 阵容配置引用（由主模块设置）
let _teamConfigRef = null;
export function setTeamConfigRef(ref) { _teamConfigRef = ref; }

export function getTeamConfigRef() { return _teamConfigRef; }

// ===== 引用导出（供 file-io 使用） =====
export function getBattleRef() { return battle; }

// ===== 状态初始化 =====
export function initTurnData() {
  turnData = {
    turn_number: currentTurnNumber,
    game_state: {
      player_hp: parseInt(document.getElementById('playerHP').value) || 4,
      opponent_hp: parseInt(document.getElementById('opponentHP').value) || 4
    },
    player: {
      active_pokemon: null,
      reserve_pokemon: [],
      known_pokemon: {}
    },
    opponent: {
      active_pokemon: null,
      reserve_pokemon: [],
      known_pokemon: {}
    },
    action: {
      player_action: null,
      opponent_action: null
    },
    outcome: {
      player: null,
      opponent: null
    },
    pMarks: [],
    oMarks: [],
    opponent_reserve_known: true
  };
}

export function newBattle() {
  if (battle.turns.length > 0) {
    // 尝试弹窗确认，如果不支持（Control UI 等环境）则直接执行
    try {
      if (!confirm('当前对战未保存，确定新建？')) return;
    } catch(e) { /* confirm not supported */ }
  }
  document.getElementById('battleView').style.display = 'none';
  document.getElementById('teamConfigView').style.display = 'block';
  battle.battle_id = Date.now();
  battle.turns = [];
}

export function backToTeamConfig() {
  try {
    if (!confirm('返回配置将丢失当前对战进度，确定？')) return;
  } catch(e) { /* confirm not supported */ }
  document.getElementById('battleView').style.display = 'none';
  document.getElementById('teamConfigView').style.display = 'block';
}

// ===== 进入对战 =====
export function enterBattle() {
  if (!dataLoaded) { showToast('数据加载中，请稍候...', 'error'); return; }
  window.collectTeamConfig && window.collectTeamConfig();

  const config = _teamConfigRef;
  if (!config) { showToast('阵容配置未就绪', 'error'); return; }

  // ===== 校验我方阵容 =====
  const pPets = config.player.pets;
  const pValid = pPets.length === 6 && pPets.every(p => p.name && p.hp != null && p.hp > 0);
  if (!pValid) {
    const emptyNames = pPets.filter(p => !p.name).length;
    const noHp = pPets.filter(p => p.name && (p.hp == null || p.hp <= 0)).map(p => p.name);
    let msg = '';
    if (emptyNames > 0) msg += '缺少 ' + emptyNames + ' 只精灵，';
    if (noHp.length > 0) msg += noHp.join('、') + ' 血量未填写或<=0，';
    showToast((msg || '阵容不完整') + '请完善后再进入对战', 'error');
    return;
  }

  // ===== 校验敌方阵容 =====
  const eMode = config.enemy.mode;
  const ePets = config.enemy.pets;
  if (eMode === 'known') {
    const eValid = ePets.length === 6 && ePets.every(p => p.name);
    if (!eValid) {
      const empty = ePets.filter(p => !p.name).length;
      showToast('敌方已知阵容缺少 ' + empty + ' 只精灵，请填满 6 只', 'error');
      return;
    }
  } else if (eMode === 'unknown') {
    const eStarter = ePets[config.enemy.starterIdx];
    if (!eStarter || !eStarter.name) {
      showToast('敌方未知阵容请至少选择一只首发精灵', 'error');
      return;
    }
  }

  battle.battle_id = Date.now();
  battle.turns = [];
  currentTurnNumber = 1;
  initTurnData();

  // 我方首发
  const starter = config.player.pets[config.player.starterIdx];
  fillPlayerActiveSlot(starter);

  // 我方后备
  const reservePets = [];
  for (let i = 0; i < 6; i++) {
    if (i === config.player.starterIdx) continue;
    const pet = config.player.pets[i];
    if (pet.name) reservePets.push(pet);
  }
  turnData.player.reserve_pokemon = reservePets.map(pet => {
    const base = collectPokemonBase(pet.name);
    return {
      ...base,
      name: pet.name,
      current_hp: pet.hp || 0,
      max_hp: pet.hp || 0,
      current_energy: 10,
      max_energy: 10,
      status: [],
      can_bossify: pet.canBossify ? true : false,
      skills: (pet.skills||[]).filter(s => s && (typeof s === 'object' ? s.name : s)).map(s => {
        const sName = (typeof s === 'object' && s !== null) ? (s.name || '') : (s || '');
        const d = getSkillDisplay(sName);
        return { name: sName, type: d ? d.type : '', category: d ? d.category : '', power: d ? d.power : '', energy: d ? d.energy : '', effect: d ? d.effect : '' };
      })
    };
  });
  renderPlayerReserve();

  // 敌方
  if (config.enemy.mode === 'unknown') {
    if (!config.enemy.pets[0] || !config.enemy.pets[0].name) {
      showToast('未知阵容模式下请至少选择一只敌方首发精灵', 'error');
      return;
    }
  }
  if (config.enemy.mode === 'known') {
    document.getElementById('oReserveKnown').checked = true;
    document.getElementById('oReserveUnknown').checked = false;
    document.getElementById('oReserveKnown').disabled = true;
    document.getElementById('oReserveUnknown').disabled = true;
    turnData.opponent_reserve_known = true;

    const eStarter = config.enemy.pets[config.enemy.starterIdx];
    fillOpponentActiveSlot(eStarter);

    const oReservePets = [];
    for (let i = 0; i < 6; i++) {
      if (i === config.enemy.starterIdx) continue;
      const pet = config.enemy.pets[i];
      if (pet.name) oReservePets.push(pet);
    }
    turnData.opponent.reserve_pokemon = oReservePets.map(pet => {
      const base = collectPokemonBase(pet.name);
      return {
        ...base,
        name: pet.name,
        current_hp_percentage: 100,
        max_hp_percentage: 100,
        current_energy: 10,
        max_energy: 10,
        known_skills: [],
        can_bossify: pet.canBossify ? true : false
      };
    });
    renderOpponentReserve();
    renderOpponentSkills();
    document.getElementById('opponentReserveInputArea').style.display = 'none';
    document.getElementById('opponentReserveDisplayArea').style.display = 'block';
  } else {
    document.getElementById('oReserveUnknown').checked = true;
    document.getElementById('oReserveKnown').checked = false;
    turnData.opponent_reserve_known = false;
    document.getElementById('oReserveKnown').disabled = true;
    document.getElementById('oReserveUnknown').disabled = true;

    // 未知阵容：必须有首发精灵
    const eStarter = config.enemy.pets[0];
    if (eStarter && eStarter.name) {
      fillOpponentActiveSlot(eStarter);
    }

    document.getElementById('opponentReserveInputArea').style.display = 'none';
    document.getElementById('opponentReserveDisplayArea').style.display = 'none';
    const grid = document.getElementById('opponentReserveGrid');
    if (grid) {
      grid.innerHTML = '<div style="background:#faf3e5;border-radius:6px;padding:16px;text-align:center;color:#666;font-size:13px;border:1px dashed #d8c29b">❓ 敌方后备未知 — 换宠时手动录入精灵</div>';
    }
  }

  // UI 更新
  document.getElementById('turnBadge').textContent = '1';
  document.getElementById('turnLabel').textContent = '第 1 回合';
  document.getElementById('battleIdLabel').textContent = '对战 #' + battle.battle_id;
  document.getElementById('playerHP').value = 4;
  document.getElementById('opponentHP').value = 4;
  document.getElementById('playerHP').readOnly = true;
  document.getElementById('opponentHP').readOnly = true;
  updateHPDisplay();

  renderTurn();
  window.updateOutcomeResult && window.updateOutcomeResult();

  initTurn1Outcome();
  
  document.getElementById('btnNext').disabled = false;

  document.getElementById('teamConfigView').style.display = 'none';
  document.getElementById('battleView').style.display = 'block';

  showToast('阵容已就绪，进入第 1 回合！', 'success');

  turnData.pMarks = [];
  turnData.oMarks = [];
  // 给初始精灵添加空状态数组
  if (turnData.player.active_pokemon) turnData.player.active_pokemon.status = [];
  if (turnData.opponent.active_pokemon) turnData.opponent.active_pokemon.status = [];
  _msBackup.pStatus = null;
  _msBackup.oStatus = null;
  _prevPActionType = 'use_skill';
  _prevOActionType = 'use_skill';
  renderMarksStatus([], [], turnData.player.active_pokemon ? turnData.player.active_pokemon.status || [] : [], turnData.opponent.active_pokemon ? turnData.opponent.active_pokemon.status || [] : []);
  const eStarterName = (config.enemy.mode === 'known' && config.enemy.pets[config.enemy.starterIdx])
    ? config.enemy.pets[config.enemy.starterIdx].name : '?';
  updateMsActivePokemon(starter.name || '-', eStarterName || '-');

  store.emit('battle:started', { battle });
}

function fillPlayerActiveSlot(pet) {
  document.getElementById('pName').value = pet.name || '';
  const pNameEl = document.getElementById('pName');
  if (pNameEl) {
    pNameEl.dataset.canBossify = pet.canBossify ? 'true' : 'false';
    pNameEl.dataset.bossName = pet.canBossify ? (isBossifiable(pet.name) || '') : '';
  }
  document.getElementById('pMaxHP').value = pet.hp || '';
  document.getElementById('pCurrHP').value = pet.hp || '';
  document.getElementById('pMaxEnergy').value = 10;
  document.getElementById('pCurrEnergy').value = 10;
  (pet.skills||[]).forEach((s, i) => {
    if (i < 4) {
      const el = document.getElementById('pSkill' + i);
      if (el) {
        const sName = (typeof s === 'object' && s !== null) ? (s.name || '') : (s || '');
        el.value = sName;
        if (sName) {
          window.updateSkillInfoDisplay && window.updateSkillInfoDisplay(sName, 'pSkillInfo' + i);
          const icon = document.getElementById('pSkill' + i + 'Icon');
          const url = window.getImageURL && window.getImageURL(sName, 'skill');
          if (url && icon) icon.src = url;
        }
      }
    }
  });
  window.autoFillPlayer && window.autoFillPlayer();
  const spriteBox = document.getElementById('playerSpriteBox');
  if (spriteBox) window.updateSpriteImage && window.updateSpriteImage(spriteBox, pet.name);
  window.updateOcMaxHpDisplay && window.updateOcMaxHpDisplay();
}

function fillOpponentActiveSlot(pet) {
  document.getElementById('oName').value = pet.name || '';
  const oNameEl = document.getElementById('oName');
  if (oNameEl) {
    oNameEl.dataset.canBossify = pet.canBossify ? 'true' : 'false';
    oNameEl.dataset.bossName = pet.canBossify ? (isBossifiable(pet.name) || '') : '';
  }
  document.getElementById('oCurrHP').value = 100;
  document.getElementById('oMaxHP').value = 100;
  document.getElementById('oCurrEnergy').value = 10;
  document.getElementById('oMaxEnergy').value = 10;
  window.autoFillOpponent && window.autoFillOpponent();
  const spriteBox = document.getElementById('opponentSpriteBox');
  if (spriteBox) window.updateSpriteImage && window.updateSpriteImage(spriteBox, pet.name);
}

function initTurn1Outcome() {
  const pNewHp = document.getElementById('pCurrHP').value || '';
  const oNewHp = document.getElementById('oCurrHP').value || '';
  document.getElementById('ocPHp').value = pNewHp;
  document.getElementById('ocPrevPHp').textContent = pNewHp || '-';
  document.getElementById('ocPEnergy').value = document.getElementById('pCurrEnergy').value || '';
  document.getElementById('ocPDmg').value = '0';
  document.getElementById('ocOHp').value = oNewHp;
  document.getElementById('ocPrevOHp').textContent = oNewHp || '-';
  document.getElementById('ocOEnergy').value = document.getElementById('oCurrEnergy').value || '';
  document.getElementById('ocODmg').value = '0';
}

// ===== 回合数据收集 =====
export function collectTurnData() {
  var outcome = collectOutcome();
  var pDeadName = document.getElementById('pName').value.trim();
  var oDeadName = document.getElementById('oName').value.trim();

  // 收集复活信息（用原始精灵名，不是替换后的 ocPlayerPokemon）
  var pReviveInfo = [];
  if (outcome.player.is_dead && document.getElementById('ocPResurrect').value === 'true') {
    pReviveInfo.push({
      name: pDeadName || outcome.player.active_pokemon,
      revive_after_turns: parseInt(document.getElementById('ocPResurrectAfter').value) || 3
    });
  }
  var oReviveInfo = [];
  if (outcome.opponent.is_dead && document.getElementById('ocOResurrect').value === 'true') {
    oReviveInfo.push({
      name: oDeadName || outcome.opponent.active_pokemon,
      revive_after_turns: parseInt(document.getElementById('ocOResurrectAfter').value) || 3
    });
  }

  return {
    turn_number: currentTurnNumber,
    game_state: {
      player_hp: parseInt(document.getElementById('playerHP').value) || 4,
      opponent_hp: parseInt(document.getElementById('opponentHP').value) || 4
    },
    player: collectPlayerData(),
    opponent: collectOpponentData(),
    action: collectActions(),
    outcome: outcome,
    opponent_reserve_known: (document.querySelector('input[name="opponentReserveMode"]:checked') || {}).value === 'known',
    player_revive_info: pReviveInfo,
    opponent_revive_info: oReviveInfo,
    // 换宠时保存旧活跃精灵的持久状态（仅冻结/萌化，其他状态随下场清除）
    _player_old_status: (function(){ try { return (_msBackup.pStatus || []).filter(function(s){ return ['冻结','萌化'].includes(s.name); }); } catch(e){ return []; } })(),
    _opponent_old_status: (function(){ try { return (_msBackup.oStatus || []).filter(function(s){ return ['冻结','萌化'].includes(s.name); }); } catch(e){ return []; } })()
  };
}

function collectPlayerData() {
  const name = document.getElementById('pName').value.trim();
  const pNameEl = document.getElementById('pName');
  const base = collectPokemonBase(name);
  const active = {
    ...base,
    current_hp: parseInt(document.getElementById('pCurrHP').value) || 0,
    max_hp: parseInt(document.getElementById('pMaxHP').value) || null,
    current_energy: parseInt(document.getElementById('pCurrEnergy').value) || 0,
    max_energy: parseInt(document.getElementById('pMaxEnergy').value) || 0,
    status: collectContainer('pStatusContainer'),
    can_bossify: pNameEl ? pNameEl.dataset.canBossify === 'true' : false,
    boss_name: pNameEl ? (pNameEl.dataset.bossName || '') : '',
    skills: []
  };
  for (let i = 0; i < 4; i++) {
    const sn = document.getElementById('pSkill' + i).value.trim();
    if (sn) {
      const d = getSkillDisplay(sn);
      active.skills.push({ name: sn, type: d ? d.type : '', category: d ? d.category : '', power: d ? d.power : '', energy: d ? d.energy : '', effect: d ? d.effect : '' });
    }
  }

  const reserve = [];
  const tReserves = (turnData && turnData.player.reserve_pokemon) || [];
  tReserves.forEach(r => {
    if (!r.name) return;
    const rb = collectPokemonBase(r.name);
    const rSkills = (r.skills||[]).map(s => {
      var sn = typeof s === 'string' ? s : (s.name || '');
      if (sn) { var d = getSkillDisplay(sn); return { name: sn, type: d ? d.type : '', category: d ? d.category : '', power: d ? d.power : '', energy: d ? d.energy : '', effect: d ? d.effect : '' }; }
      return null;
    }).filter(Boolean);
    reserve.push({ ...rb, current_hp: r.current_hp, max_hp: r.max_hp, current_energy: r.current_energy || 0, max_energy: r.max_energy || 0, status: r.status || [], skills: rSkills, revive_timer: r.revive_timer || 0, can_bossify: r.can_bossify ? true : false, boss_name: r.boss_name || (isBossifiable(r.name) || '') });
  });
  return { active_pokemon: active, reserve_pokemon: reserve };
}

function collectOpponentData() {
  const name = document.getElementById('oName').value.trim();
  const base = collectPokemonBase(name);

  function hasSkill(arr, name) {
    return arr.some(s => { const sn = typeof s === 'string' ? s : s.name; return sn === name; });
  }
  function toSkillObj(name) {
    const d = getSkillDisplay(name);
    return { name, type: d ? d.type : '', category: d ? d.category : '', power: d ? d.power : '', energy: d ? d.energy : '', effect: d ? d.effect : '' };
  }

  let known_skills = [];
  if (turnData && turnData.opponent.active_pokemon && turnData.opponent.active_pokemon.known_skills) {
    (turnData.opponent.active_pokemon.known_skills || []).forEach(s => {
      if (typeof s === 'string') known_skills.push(toSkillObj(s));
      else known_skills.push(s);
    });
  }
  const newSkill = document.getElementById('oActionSkillManual');
  if (newSkill && newSkill.value.trim()) {
    const s = newSkill.value.trim();
    if (!hasSkill(known_skills, s) && window.SKILLS_DB && window.SKILLS_DB[s]) known_skills.push(toSkillObj(s));
  }
  const oActionType = document.getElementById('oActionType').value;
  if (oActionType === 'use_skill') {
    const sel = document.getElementById('oActionSkill');
    if (sel && sel.value && sel.value !== '__new__' && sel.value !== '') {
      if (!hasSkill(known_skills, sel.value)) known_skills.push(toSkillObj(sel.value));
    }
  }

  const oNameEl = document.getElementById('oName');
  const active = {
    ...base,
    current_hp_percentage: parseInt(document.getElementById('oCurrHP').value) || 0,
    max_hp_percentage: parseInt(document.getElementById('oMaxHP').value) || 100,
    current_energy: parseInt(document.getElementById('oCurrEnergy').value) || 0,
    max_energy: parseInt(document.getElementById('oMaxEnergy').value) || 0,
    status: collectContainer('oStatusContainer'),
    can_bossify: oNameEl ? oNameEl.dataset.canBossify === 'true' : false,
    boss_name: oNameEl ? (oNameEl.dataset.bossName || '') : '',
    known_skills
  };

  const mode = document.querySelector('input[name="opponentReserveMode"]:checked');
  const isKnown = mode && mode.value === 'known';
  const reserve = [];
  if (isKnown) {
    const r0 = document.getElementById('oReserveName0');
    if (r0) {
      for (let i = 0; i < 5; i++) {
        const rn = document.getElementById('oReserveName' + i);
        if (!rn || !rn.value.trim()) continue;
        const rb = collectPokemonBase(rn.value.trim());
        const bossName = isBossifiable(rn.value.trim());
        reserve.push({ ...rb, current_hp_percentage: null, max_hp_percentage: null, current_energy: null, max_energy: null, status: [], known_skills: [], can_bossify: !!bossName, boss_name: bossName || '' });
      }
    } else if (turnData && turnData.opponent.reserve_pokemon) {
      turnData.opponent.reserve_pokemon.forEach(r => reserve.push({...r}));
    }
  } else {
    if (turnData && turnData.opponent.reserve_pokemon) {
      turnData.opponent.reserve_pokemon.forEach(r => reserve.push({...r}));
    }
  }
  return { active_pokemon: active, reserve_pokemon: reserve, reserve_known: isKnown };
}

function collectActions() {
  const pAction = { type: document.getElementById('pActionType').value };
  if (pAction.type === 'use_skill') {
    pAction.skill_name = document.getElementById('pActionSkill') ? document.getElementById('pActionSkill').value : '';
    const extraRadio = document.querySelector('input[name="pExtraAction"]:checked');
    const extraVal = extraRadio ? extraRadio.value : 'none';
    if (extraVal === 'switch_after') {
      const sel = document.getElementById('pActionSwitchAfter');
      if (sel && sel.value) pAction.switch_after_to = sel.value;
    }
  } else if (pAction.type === 'switch') {
    pAction.switch_to = document.getElementById('pActionSkill') ? document.getElementById('pActionSkill').value : '';
  }

  const oAction = { type: document.getElementById('oActionType').value };
  if (oAction.type === 'use_skill') {
    let skill = '';
    if (document.getElementById('oActionSkill')) skill = document.getElementById('oActionSkill').value;
    const manual = document.getElementById('oActionSkillManual');
    if (manual && manual.value.trim()) skill = manual.value.trim();
    oAction.skill_name = skill;
    const oExtraRadio = document.querySelector('input[name="oExtraAction"]:checked');
    const oExtraVal = oExtraRadio ? oExtraRadio.value : 'none';
    if (oExtraVal === 'switch_after') {
      const sel = document.getElementById('oActionSwitchAfter');
      const newInput = document.getElementById('oActionSwitchAfterNew');
      if (newInput && newInput.value.trim()) {
        oAction.switch_after_to = newInput.value.trim();
      } else if (sel && sel.value) {
        oAction.switch_after_to = sel.value;
      }
    }
  } else if (oAction.type === 'switch') {
    let target = '';
    if (document.getElementById('oActionSkill')) target = document.getElementById('oActionSkill').value;
    const manualNew = document.getElementById('oActionSwitchNew');
    if (manualNew && manualNew.value.trim()) target = manualNew.value.trim();
    if (target === '__new__' && manualNew) target = manualNew.value.trim();
    oAction.switch_to = target || '';
  }
  return { player_action: pAction, opponent_action: oAction };
}

function collectOutcome() {
  const pName = document.getElementById('ocPlayerPokemon').textContent;
  const oName = document.getElementById('ocOpponentPokemon').textContent;
  const maxHpEl = document.getElementById('ocPMaxHpDisplay');
  const activeMaxHp = maxHpEl && maxHpEl.textContent !== '-' ? (parseInt(maxHpEl.textContent) || null) : null;

  return {
    player: {
      active_pokemon: pName !== '-' ? pName : (document.getElementById('pName').value.trim() || ''),
      current_hp: parseInt(document.getElementById('ocPHp').value) || 0,
      max_hp: activeMaxHp,
      current_energy: parseInt(document.getElementById('ocPEnergy').value) || 0,
      damage_received: parseInt(document.getElementById('ocPDmg').value) || 0,
      is_dead: document.getElementById('ocPDead').value === 'true',
      action_result: document.getElementById('ocPResult').textContent,
      marks: collectContainer('pMarksContainer')
    },
    opponent: {
      active_pokemon: oName !== '-' ? oName : (document.getElementById('oName').value.trim() || ''),
      current_hp_percentage: parseInt(document.getElementById('ocOHp').value) || 0,
      max_hp_percentage: 100,
      current_energy: parseInt(document.getElementById('ocOEnergy').value) || 0,
      damage_received: parseInt(document.getElementById('ocODmg').value) || 0,
      is_dead: document.getElementById('ocODead').value === 'true',
      action_result: document.getElementById('ocOResult').textContent,
      marks: collectContainer('oMarksContainer')
    }
  };
}

// ===== 确认并进入下一回合 =====
export async function confirmAndNextTurn() {
  if (!dataLoaded) {
    showToast('数据加载中，请稍候...', 'error');
    return;
  }

  const turn = collectTurnData();
  battle.turns.push(turn);

  const { saveTurn } = await import('./file-io.js');
  const saveOk = await saveTurn(turn);

  // 精灵阵亡扣血
  const pDead = document.getElementById('ocPDead').value === 'true';
  const oDead = document.getElementById('ocODead').value === 'true';
  if (pDead) {
    const deduct = parseInt(document.getElementById('ocPDeduction').value) || 1;
    const pHP = parseInt(document.getElementById('playerHP').value) || 4;
    document.getElementById('playerHP').value = Math.max(0, pHP - deduct);
    updateHPDisplay();
  }
  if (oDead) {
    const deduct = parseInt(document.getElementById('ocODeduction').value) || 1;
    const oHP = parseInt(document.getElementById('opponentHP').value) || 4;
    document.getElementById('opponentHP').value = Math.max(0, oHP - deduct);
    updateHPDisplay();
  }

  // 胜负判定
  const finalPlayerHP = parseInt(document.getElementById('playerHP').value);
  const finalOpponentHP = parseInt(document.getElementById('opponentHP').value);
  const gameOver = finalPlayerHP === 0 || finalOpponentHP === 0;

  if (gameOver) {
    const winner = finalPlayerHP > 0 ? '🎉 我方获胜！' : (finalOpponentHP > 0 ? '💀 敌方获胜！' : '🤝 平局！');
    showToast('比赛结束 — ' + winner, 'info');
    document.getElementById('btnNext').disabled = true;
    
    document.getElementById('turnBadge').textContent = currentTurnNumber + ' (已结束)';
    store.emit('battle:ended', { winner, battle });
    return;
  }

  if (saveOk) {
    showToast('回合 ' + currentTurnNumber + ' 已保存', 'success');
    const aiCheck = document.getElementById('aiAutoAnalyze');
    if (aiCheck && aiCheck.checked) {
      const { runAIAnalysis } = await import('./ai-client.js');
      runAIAnalysis();
    }
  } else {
    showToast('⚠️ 回合数据未保存（可点💾手动保存）', 'error');
  }

  currentTurnNumber++;
  inheritFromOutcome(turn);
  advanceReviveTimers();

  document.getElementById('turnBadge').textContent = currentTurnNumber;
  document.getElementById('turnLabel').textContent = '第 ' + currentTurnNumber + ' 回合';
  
  document.getElementById('ocPlayerPokemon').textContent = turnData.player.active_pokemon ? turnData.player.active_pokemon.name : '-';
  document.getElementById('ocOpponentPokemon').textContent = turnData.opponent.active_pokemon ? turnData.opponent.active_pokemon.name : '-';

  renderTurn();
  window.updateOutcomeResult && window.updateOutcomeResult();

  // 重置行动选择
  document.getElementById('pActionType').value = 'use_skill';
  document.getElementById('oActionType').value = 'use_skill';
  const pExtraNone = document.querySelector('input[name="pExtraAction"][value="none"]');
  if (pExtraNone) pExtraNone.checked = true;
  const oExtraNone = document.querySelector('input[name="oExtraAction"][value="none"]');
  if (oExtraNone) oExtraNone.checked = true;
  window.updatePlayerActionUI && window.updatePlayerActionUI();
  window.updateOpponentActionUI && window.updateOpponentActionUI();

  // 预填结算字段
  var pNewHp = document.getElementById('pCurrHP').value || '';
  var oNewHp = document.getElementById('oCurrHP').value || '';
  document.getElementById('ocPHp').value = pNewHp;
  document.getElementById('ocPrevPHp').textContent = pNewHp || '-';
  document.getElementById('ocPEnergy').value = document.getElementById('pCurrEnergy').value || '';
  document.getElementById('ocPDmg').value = '0';
  document.getElementById('ocOHp').value = oNewHp;
  document.getElementById('ocPrevOHp').textContent = oNewHp || '-';
  document.getElementById('ocOEnergy').value = document.getElementById('oCurrEnergy').value || '';
  document.getElementById('ocODmg').value = '0';
  document.getElementById('ocPDead').value = 'false';
  document.getElementById('ocPDeduction').disabled = true;
  document.getElementById('ocPDeduction').style.display = 'none';
  var _pdD=document.getElementById('ocPDeductionDisplay'); if(_pdD)_pdD.style.display='';
  document.getElementById('ocPReplaceWith').disabled = true;
  document.getElementById('ocPReplaceWith').value = '';
  document.getElementById('ocPReplaceWith').innerHTML = '<option value="">-- 选择 --</option>';
  document.getElementById('ocODead').value = 'false';
  document.getElementById('ocODeduction').disabled = true;
  document.getElementById('ocODeduction').style.display = 'none';
  var _odD=document.getElementById('ocODeductionDisplay'); if(_odD)_odD.style.display='';
  document.getElementById('ocOReplaceWith').disabled = true;
  document.getElementById('ocOReplaceWith').value = '';
  document.getElementById('ocOReplaceWith').innerHTML = '<option value="">-- 选择 --</option>';
  // 复活字段复位
  document.getElementById('ocPResurrect').value = 'false';
  document.getElementById('ocPResurrect').disabled = true;
  document.getElementById('ocPResurrectAfter').value = 3;
  document.getElementById('ocPResurrectAfter').disabled = true;
  document.getElementById('ocPResurrectAfter').style.display = 'none';
  var _prD=document.getElementById('ocPResurrectAfterDisplay'); if(_prD)_prD.style.display='';
  document.getElementById('ocOResurrect').value = 'false';
  document.getElementById('ocOResurrect').disabled = true;
  document.getElementById('ocOResurrectAfter').value = 3;
  document.getElementById('ocOResurrectAfter').disabled = true;
  document.getElementById('ocOResurrectAfter').style.display = 'none';
  var _orD=document.getElementById('ocOResurrectAfterDisplay'); if(_orD)_orD.style.display='';

  showToast('进入第 ' + currentTurnNumber + ' 回合', 'info');
  store.emit('battle:turn', { turnNumber: currentTurnNumber, battle });
}

// ===== 回合状态继承 =====
export function inheritFromOutcome(prevTurn) {
  initTurnData();
  turnData.game_state.player_hp = parseInt(document.getElementById('playerHP').value) || 4;
  turnData.game_state.opponent_hp = parseInt(document.getElementById('opponentHP').value) || 4;

  const prevKnown = prevTurn.opponent_reserve_known;
  if (prevKnown !== undefined) {
    turnData.opponent_reserve_known = prevKnown;
    document.getElementById('oReserveKnown').checked = prevKnown;
    document.getElementById('oReserveUnknown').checked = !prevKnown;
  }

  const pOutcome = prevTurn.outcome.player;
  const pAction = prevTurn.action.player_action;
  if (pOutcome.active_pokemon) {
    const base = collectPokemonBase(pOutcome.active_pokemon);
    let pSkills = [];
    if (pAction.type === 'switch' || (pAction.type === 'use_skill' && pAction.switch_after_to)) {
      const found = (prevTurn.player.reserve_pokemon || []).find(r => r.name === pOutcome.active_pokemon);
      pSkills = (found && found.skills) || [];
    } else {
      pSkills = prevTurn.player.active_pokemon.skills || [];
    }
    turnData.player.active_pokemon = {
      ...base,
      name: pOutcome.active_pokemon,
      current_hp: pOutcome.current_hp,
      max_hp: pOutcome.max_hp,
      current_energy: pOutcome.current_energy,
      max_energy: prevTurn.player.active_pokemon.max_energy,
      can_bossify: prevTurn.player.active_pokemon ? prevTurn.player.active_pokemon.can_bossify : false,
      boss_name: prevTurn.player.active_pokemon ? (prevTurn.player.active_pokemon.boss_name || '') : '',
      skills: pSkills,
      status: prevTurn.player.active_pokemon ? prevTurn.player.active_pokemon.status || [] : []
    };
  }

  const prevReserve = prevTurn.player.reserve_pokemon || [];
  const isSwitchAfter = pAction.type === 'use_skill' && pAction.switch_after_to;
  if (pAction.type === 'switch' || isSwitchAfter) {
    const switchedTo = isSwitchAfter ? pAction.switch_after_to : pAction.switch_to;
    const oldActive = prevTurn.player.active_pokemon.name;
    turnData.player.reserve_pokemon = prevReserve.map(r => r.name === switchedTo ? null : r).filter(Boolean);
    if (oldActive) {
      const oldBase = collectPokemonBase(oldActive);
      turnData.player.reserve_pokemon.push({
        name: oldActive, ...oldBase,
        current_hp: prevTurn.player.active_pokemon.current_hp,
        max_hp: prevTurn.player.active_pokemon.max_hp,
        current_energy: prevTurn.player.active_pokemon.current_energy,
        max_energy: prevTurn.player.active_pokemon.max_energy,
        can_bossify: prevTurn.player.active_pokemon.can_bossify ? true : false,
        boss_name: prevTurn.player.active_pokemon.boss_name || (isBossifiable(oldActive) || ''),
        skills: prevTurn.player.active_pokemon.skills || [],
        status: prevTurn._player_old_status || prevTurn.player.active_pokemon.status || []
      });
    }
    if (switchedTo && switchedTo !== '__new__') {
      const newBase = collectPokemonBase(switchedTo);
      const foundInReserve = prevReserve.find(r => r.name === switchedTo);
      turnData.player.active_pokemon = {
        ...newBase,
        name: switchedTo,
        current_hp: pOutcome.current_hp != null ? pOutcome.current_hp : (foundInReserve ? foundInReserve.current_hp : 100),
        max_hp: foundInReserve ? foundInReserve.max_hp : 100,
        current_energy: pOutcome.current_energy != null ? pOutcome.current_energy : (foundInReserve ? foundInReserve.current_energy : 10),
        max_energy: foundInReserve ? foundInReserve.max_energy : 10,
        can_bossify: foundInReserve ? (foundInReserve.can_bossify ? true : false) : false,
        boss_name: foundInReserve ? (foundInReserve.boss_name || (isBossifiable(switchedTo) || '')) : '',
        skills: foundInReserve ? foundInReserve.skills : (turnData.player.active_pokemon.skills || []),
        status: foundInReserve ? foundInReserve.status || [] : (prevTurn.player.active_pokemon ? prevTurn.player.active_pokemon.status || [] : [])
      };
    }
  } else {
    turnData.player.reserve_pokemon = prevReserve.map(r => ({...r}));
  }

  // ===== 阵亡处理：推断死者与替换精灵 =====
  // 如果 action 是换宠，死者是换上来的那只；否则是回合开始时的活跃精灵
  var pSwitchedIn = (pAction.type === 'switch') ? (pAction.switch_to || '') :
    (pAction.type === 'use_skill' && pAction.switch_after_to) ? pAction.switch_after_to : '';
  var pDeadName = pSwitchedIn ? pSwitchedIn :
    (prevTurn.player.active_pokemon ? prevTurn.player.active_pokemon.name : null);
  var pOutcomeActive = pOutcome.active_pokemon || '';
  // 替换精灵 = outcome.active 与死者不同时取 outcome.active
  var pDeathReplace = (pOutcome.is_dead && pDeadName && pOutcomeActive !== pDeadName) ? pOutcomeActive : '';
  if (pOutcome.is_dead && pDeadName) {
    if (pDeathReplace && pDeathReplace !== '__manual__' && pDeadName !== pDeathReplace) {
      var replaceFound = turnData.player.reserve_pokemon.find(function(r){ return r.name === pDeathReplace; });
      turnData.player.reserve_pokemon = turnData.player.reserve_pokemon.filter(function(r){ return r.name !== pDeathReplace; });
      if (replaceFound) {
        var rb = collectPokemonBase(pDeathReplace);
        turnData.player.active_pokemon = {
          ...rb,
          name: pDeathReplace,
          current_hp: replaceFound.current_hp,
          max_hp: replaceFound.max_hp,
          current_energy: replaceFound.current_energy || 0,
          max_energy: replaceFound.max_energy || 10,
          can_bossify: replaceFound.can_bossify ? true : false,
          boss_name: replaceFound.boss_name || (isBossifiable(pDeathReplace) || ''),
          skills: replaceFound.skills || [],
          status: replaceFound.status || []
        };
      } else {
        // 替换精灵不在后备（手动输入），强行设为 active
        var rb2 = collectPokemonBase(pDeathReplace);
        turnData.player.active_pokemon = {
          ...rb2,
          name: pDeathReplace,
          current_hp: pOutcome.current_hp || 100,
          max_hp: pOutcome.max_hp || 100,
          current_energy: pOutcome.current_energy || 10,
          max_energy: 10,
          can_bossify: !!isBossifiable(pDeathReplace),
          boss_name: isBossifiable(pDeathReplace) || '',
          skills: [],
          status: []
        };
      }
    }
    // 始终：阵亡精灵（HP=0）加入后备
    // 技能/血量取自死者上场时的状态（切换上场则取预备数据，否则取本回合活跃数据）
    if (!turnData.player.reserve_pokemon.some(function(r){ return r.name === pDeadName; })) {
      var pDeadReserveEntry = pSwitchedIn ? (prevTurn.player.reserve_pokemon||[]).find(function(r){return r.name===pSwitchedIn;}) : null;
      var pPrevAct = prevTurn.player.active_pokemon;
      // 死者自己的数据：切换上场取预备数据，否则取本回合活跃数据
      var _hp = 0, _maxHp = 0, _energy = 0, _maxEnergy = 10, _skills = [];
      if (pDeadReserveEntry) {
        _maxHp = pDeadReserveEntry.max_hp || 0;
        _maxEnergy = pDeadReserveEntry.max_energy || 10;
        _skills = pDeadReserveEntry.skills || [];
      } else if (pPrevAct) {
        _maxHp = pPrevAct.max_hp || 0;
        _maxEnergy = pPrevAct.max_energy || 10;
        _skills = pPrevAct.skills || [];
      }
      var _status = [];
      if (pDeadReserveEntry) {
        _status = pDeadReserveEntry.status || [];
      } else if (pPrevAct) {
        _status = pPrevAct.status || [];
      }
      var db = pPrevAct ? collectPokemonBase(pDeadName) : {};
      turnData.player.reserve_pokemon.push({
        name: pDeadName, ...db,
        current_hp: 0,
        max_hp: _maxHp,
        current_energy: 0,
        max_energy: _maxEnergy,
        can_bossify: pDeadReserveEntry ? (pDeadReserveEntry.can_bossify ? true : false) : (pPrevAct ? (pPrevAct.can_bossify ? true : false) : !!isBossifiable(pDeadName)),
        boss_name: pDeadReserveEntry ? (pDeadReserveEntry.boss_name || '') : (pPrevAct ? (pPrevAct.boss_name || '') : (isBossifiable(pDeadName) || '')),
        skills: _skills,
        status: _status
      });
    }
  }

  turnData.player.reserve_pokemon.forEach(r => {
    if (r.name && (!r.ability_name || !r.type)) {
      Object.assign(r, collectPokemonBase(r.name));
    }
  });

  // ===== 从 player_revive_info 给新阵亡精灵设置复活计时 =====
  (prevTurn.player_revive_info || []).forEach(function(ri) {
    var deadEntry = turnData.player.reserve_pokemon.find(function(dr) {
      return dr.name === ri.name && (dr.current_hp === 0 || dr.current_hp === null || dr.current_hp === undefined);
    });
    if (deadEntry) {
      deadEntry.revive_timer = ri.revive_after_turns || 3;
    }
  });

  const oOutcome = prevTurn.outcome.opponent;
  const oAction = prevTurn.action.opponent_action;
  if (oOutcome.active_pokemon) {
    const base = collectPokemonBase(oOutcome.active_pokemon);
    let knownSkills = [];
    if (oAction.type === 'switch' || (oAction.type === 'use_skill' && oAction.switch_after_to)) {
      const found = (prevTurn.opponent.reserve_pokemon || []).find(r => r.name === oOutcome.active_pokemon);
      knownSkills = (found && found.known_skills) || [];
    } else {
      knownSkills = prevTurn.opponent.active_pokemon.known_skills || [];
    }
    turnData.opponent.active_pokemon = {
      ...base,
      name: oOutcome.active_pokemon,
      current_hp_percentage: oOutcome.current_hp_percentage,
      max_hp_percentage: oOutcome.max_hp_percentage,
      current_energy: oOutcome.current_energy,
      max_energy: prevTurn.opponent.active_pokemon.max_energy,
      can_bossify: prevTurn.opponent.active_pokemon ? prevTurn.opponent.active_pokemon.can_bossify : false,
      boss_name: prevTurn.opponent.active_pokemon ? (prevTurn.opponent.active_pokemon.boss_name || '') : '',
      known_skills: knownSkills,
      status: prevTurn.opponent.active_pokemon ? prevTurn.opponent.active_pokemon.status || [] : []
    };
  }

  const prevOReserve = prevTurn.opponent.reserve_pokemon || [];
  const isOSwitchAfter = oAction.type === 'use_skill' && oAction.switch_after_to;
  if (oAction.type === 'switch' || isOSwitchAfter) {
    const switchedTo = isOSwitchAfter ? oAction.switch_after_to : oAction.switch_to;
    const oldActive = prevTurn.opponent.active_pokemon.name;
    turnData.opponent.reserve_pokemon = prevOReserve.map(r => r.name === switchedTo ? null : r).filter(Boolean);
    if (oldActive) {
      const oldBase = collectPokemonBase(oldActive);
      turnData.opponent.reserve_pokemon.push({
        name: oldActive, ...oldBase,
        current_hp_percentage: prevTurn.opponent.active_pokemon.current_hp_percentage,
        max_hp_percentage: prevTurn.opponent.active_pokemon.max_hp_percentage,
        current_energy: prevTurn.opponent.active_pokemon.current_energy,
        max_energy: prevTurn.opponent.active_pokemon.max_energy,
        can_bossify: prevTurn.opponent.active_pokemon.can_bossify ? true : false,
        boss_name: prevTurn.opponent.active_pokemon.boss_name || (isBossifiable(oldActive) || ''),
        known_skills: prevTurn.opponent.active_pokemon.known_skills || [],
        status: prevTurn._opponent_old_status || prevTurn.opponent.active_pokemon.status || []
      });
    }
    const existedInPrevReserve = prevOReserve.some(r => r.name === switchedTo) || switchedTo === oldActive;
    if (!existedInPrevReserve && switchedTo && switchedTo !== '__new__') {
      const base = collectPokemonBase(switchedTo);
      const bossName = isBossifiable(switchedTo);
      turnData.opponent.reserve_pokemon.push({ ...base, current_hp_percentage: null, max_hp_percentage: null, can_bossify: !!bossName, boss_name: bossName || '' });
    }
    if (switchedTo && switchedTo !== '__new__') {
      const newBase = collectPokemonBase(switchedTo);
      const foundInReserve = prevOReserve.find(r => r.name === switchedTo);
      turnData.opponent.active_pokemon = {
        ...newBase,
        name: switchedTo,
        current_hp_percentage: oOutcome.current_hp_percentage != null ? oOutcome.current_hp_percentage : (foundInReserve ? foundInReserve.current_hp_percentage : 100),
        max_hp_percentage: foundInReserve ? foundInReserve.max_hp_percentage : 100,
        current_energy: oOutcome.current_energy != null ? oOutcome.current_energy : (foundInReserve ? foundInReserve.current_energy : 10),
        max_energy: foundInReserve ? foundInReserve.max_energy : 10,
        can_bossify: foundInReserve ? (foundInReserve.can_bossify ? true : false) : false,
        boss_name: foundInReserve ? (foundInReserve.boss_name || (isBossifiable(switchedTo) || '')) : '',
        known_skills: foundInReserve ? foundInReserve.known_skills : (turnData.opponent.active_pokemon.known_skills || []),
        status: foundInReserve ? foundInReserve.status || [] : (prevTurn.opponent.active_pokemon ? prevTurn.opponent.active_pokemon.status || [] : [])
      };
    }
  } else {
    turnData.opponent.reserve_pokemon = prevOReserve.map(r => ({...r}));
  }

  // ===== 敌方阵亡处理 =====
  var oSwitchedIn = (oAction.type === 'switch') ? (oAction.switch_to || '') :
    (oAction.type === 'use_skill' && oAction.switch_after_to) ? oAction.switch_after_to : '';
  var oDeadName = oSwitchedIn ? oSwitchedIn :
    (prevTurn.opponent.active_pokemon ? prevTurn.opponent.active_pokemon.name : null);
  var oOutcomeActive = oOutcome.active_pokemon || '';
  var oDeathReplace = (oOutcome.is_dead && oDeadName && oOutcomeActive !== oDeadName) ? oOutcomeActive : '';
  if (oOutcome.is_dead && oDeadName) {
    if (oDeathReplace && oDeathReplace !== '__manual__' && oDeadName !== oDeathReplace) {
      var oReplaceFound = turnData.opponent.reserve_pokemon.find(function(r){ return r.name === oDeathReplace; });
      turnData.opponent.reserve_pokemon = turnData.opponent.reserve_pokemon.filter(function(r){ return r.name !== oDeathReplace; });
      if (oReplaceFound) {
        var ob = collectPokemonBase(oDeathReplace);
        turnData.opponent.active_pokemon = {
          ...ob,
          name: oDeathReplace,
          current_hp_percentage: oReplaceFound.current_hp_percentage,
          max_hp_percentage: oReplaceFound.max_hp_percentage || 100,
          current_energy: oReplaceFound.current_energy || 0,
          max_energy: oReplaceFound.max_energy || 10,
          can_bossify: oReplaceFound.can_bossify ? true : false,
          boss_name: oReplaceFound.boss_name || (isBossifiable(oDeathReplace) || ''),
          known_skills: oReplaceFound.known_skills || [],
          status: oReplaceFound.status || []
        };
      } else {
        var ob2 = collectPokemonBase(oDeathReplace);
        turnData.opponent.active_pokemon = {
          ...ob2,
          name: oDeathReplace,
          current_hp_percentage: oOutcome.current_hp_percentage || 100,
          max_hp_percentage: 100,
          current_energy: oOutcome.current_energy || 10,
          max_energy: 10,
          can_bossify: !!isBossifiable(oDeathReplace),
          boss_name: isBossifiable(oDeathReplace) || '',
          known_skills: [],
          status: []
        };
      }
    }
    if (!turnData.opponent.reserve_pokemon.some(function(r){ return r.name === oDeadName; })) {
      // 死者数据：切换上场取预备条目，否则取本回合活跃数据
      var oDeadReserveEntry = oSwitchedIn ? (prevTurn.opponent.reserve_pokemon||[]).find(function(r){return r.name===oSwitchedIn;}) : null;
      var oPrevAct = prevTurn.opponent.active_pokemon;
      var _oHpPct = 0, _oMaxHpPct = 100, _oEnergy = 0, _oMaxEnergy = 10, _oSkills = [];
      if (oDeadReserveEntry) {
        _oMaxHpPct = oDeadReserveEntry.max_hp_percentage || 100;
        _oMaxEnergy = oDeadReserveEntry.max_energy || 10;
        _oSkills = oDeadReserveEntry.known_skills || [];
      } else if (oPrevAct) {
        _oMaxHpPct = oPrevAct.max_hp_percentage || 100;
        _oMaxEnergy = oPrevAct.max_energy || 10;
        _oSkills = oPrevAct.known_skills || [];
      }
      var _oStatus = [];
      if (oDeadReserveEntry) {
        _oStatus = oDeadReserveEntry.status || [];
      } else if (oPrevAct) {
        _oStatus = oPrevAct.status || [];
      }
      var dbO = oPrevAct ? collectPokemonBase(oDeadName) : {};
      turnData.opponent.reserve_pokemon.push({
        name: oDeadName, ...dbO,
        current_hp_percentage: 0,
        max_hp_percentage: _oMaxHpPct,
        current_energy: 0,
        max_energy: _oMaxEnergy,
        can_bossify: oDeadReserveEntry ? (oDeadReserveEntry.can_bossify ? true : false) : (oPrevAct ? (oPrevAct.can_bossify ? true : false) : !!isBossifiable(oDeadName)),
        boss_name: oDeadReserveEntry ? (oDeadReserveEntry.boss_name || '') : (oPrevAct ? (oPrevAct.boss_name || '') : (isBossifiable(oDeadName) || '')),
        known_skills: _oSkills,
        status: _oStatus
      });
    }
  }

  turnData.opponent.reserve_pokemon.forEach(r => {
    if (r.name && (!r.ability_name || !r.type)) {
      Object.assign(r, collectPokemonBase(r.name));
    }
  });

  // ===== 从 opponent_revive_info 给敌方新阵亡精灵设置复活计时 =====
  (prevTurn.opponent_revive_info || []).forEach(function(ri) {
    var oDeadEntry = turnData.opponent.reserve_pokemon.find(function(dr) {
      return dr.name === ri.name && (dr.current_hp_percentage === 0 || dr.current_hp_percentage === null || dr.current_hp_percentage === undefined);
    });
    if (oDeadEntry) {
      oDeadEntry.revive_timer = ri.revive_after_turns || 3;
    }
  });

  // 继承印记（全局）+ 状态（在精灵身上，通过 renderMarksStatus 取 active 的）
  function copyMs(arr) { return (arr||[]).map(x => ({name: x.name, stacks: x.stacks, desc: x.desc, type: x.type || ''})); }
  turnData.pMarks = copyMs(prevTurn.outcome.player && prevTurn.outcome.player.marks);
  turnData.oMarks = copyMs(prevTurn.outcome.opponent && prevTurn.outcome.opponent.marks);
  _msBackup.pStatus = null;
  _msBackup.oStatus = null;
  _prevPActionType = 'use_skill';
  _prevOActionType = 'use_skill';
  var pStat = turnData.player.active_pokemon ? turnData.player.active_pokemon.status || [] : [];
  var oStat = turnData.opponent.active_pokemon ? turnData.opponent.active_pokemon.status || [] : [];
  renderMarksStatus(turnData.pMarks, turnData.oMarks, pStat, oStat);
  updateMsActivePokemon(
    turnData.player.active_pokemon ? turnData.player.active_pokemon.name : '-',
    turnData.opponent.active_pokemon ? turnData.opponent.active_pokemon.name : '-'
  );
}

// ===== 复活计时器推进（每回合开始时调用，只用于正常回合推进，不用于读档） =====
export function advanceReviveTimers() {
  if (!turnData) return;
  // 我方
  (turnData.player.reserve_pokemon || []).forEach(r => {
    if (r.revive_timer && r.revive_timer > 0) {
      r.revive_timer--;
      if (r.revive_timer === 0) {
        r.current_hp = r.max_hp || 100;
        r.current_energy = 10;
        delete r.revive_timer;
      }
    }
  });
  // 敌方
  (turnData.opponent.reserve_pokemon || []).forEach(r => {
    if (r.revive_timer && r.revive_timer > 0) {
      r.revive_timer--;
      if (r.revive_timer === 0) {
        r.current_hp_percentage = 100;
        r.current_energy = 10;
        delete r.revive_timer;
      }
    }
  });
}

// ===== 渲染代理（调用 UI 模块函数） =====
export function renderTurn() {
  renderPlayerReserve();
  renderPlayerActive();
  renderOpponentReserve();
  renderOpponentActive();
      window.renderActions && window.renderActions();
  window.renderOutcome && window.renderOutcome();
  window.syncActiveToOutcome && window.syncActiveToOutcome();
  updateHPDisplay();
  window.updateDamageAuto && window.updateDamageAuto();
  if (turnData) {
    var _pS = turnData.player.active_pokemon ? turnData.player.active_pokemon.status || [] : [];
    var _oS = turnData.opponent.active_pokemon ? turnData.opponent.active_pokemon.status || [] : [];
    renderMarksStatus(turnData.pMarks || [], turnData.oMarks || [], _pS, _oS);
    updateMsActivePokemon(
      turnData.player.active_pokemon ? turnData.player.active_pokemon.name : '-',
      turnData.opponent.active_pokemon ? turnData.opponent.active_pokemon.name : '-'
    );
  }
}

// ===== UI 渲染函数（从 battle-view 调用） =====
// 这些在 battle-view.js 中定义，通过 window 导出供引擎调用

export function renderPlayerReserve() {
  const grid = document.getElementById('playerReserveGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const slot = document.createElement('div');
    slot.className = 'reserve-slot';
    slot.innerHTML = `
      <div class="slot-header">
        <div class="slot-img" id="pReserveImg${i}"><span style="color:#666">#${i+1}</span></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600" id="pReserveName${i}">—</div>
          <div style="font-size:11px;color:#7b6953" id="pReserveAbilityLine${i}"></div>
        </div>
      </div>
      <div style="font-size:11px;color:#7b6953;margin:4px 0" id="pReserveHpDisplay${i}">🩸 HP: — / —</div>
      <div style="font-size:11px;color:#7b6953;margin:2px 0" id="pReserveEnDisplay${i}">⚡ 能量: — / —</div>
      <div style="font-size:11px;color:#f39c12;margin:2px 0;display:none" id="pReserveRevive${i}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px" id="pReserveSkillsContainer${i}"></div>
    `;
    grid.appendChild(slot);
    if (turnData && turnData.player.reserve_pokemon && turnData.player.reserve_pokemon[i]) {
      populateReserveSlot('player', i, turnData.player.reserve_pokemon[i]);
    }
  }
}

function populateReserveSlot(side, idx, r) {
  const prefix = side.charAt(0);
  const nameEl = document.getElementById(prefix + 'ReserveName' + idx);
  if (nameEl) {
    nameEl.textContent = (r.name || '—');
  }
  const hpEl = document.getElementById(prefix + 'ReserveHpDisplay' + idx);
  if (hpEl) hpEl.textContent = '🩸 HP: ' + (r.current_hp != null ? r.current_hp : '—') + ' / ' + (r.max_hp != null ? r.max_hp : '—');
  const enEl = document.getElementById(prefix + 'ReserveEnDisplay' + idx);
  if (enEl) enEl.textContent = '⚡ 能量: ' + (r.current_energy != null ? r.current_energy : '—') + ' / ' + (r.max_energy != null ? r.max_energy : '—');
  const abilEl = document.getElementById(prefix + 'ReserveAbilityLine' + idx);
  if (abilEl) {
    const abilityName = r.ability_name || '';
    const abilityDesc = r.ability_desc || '';
    abilEl.innerHTML = abilityName ? '⚡ ' + abilityName + (abilityDesc ? ' <span style="color:#666;font-size:10px">— ' + abilityDesc + '</span>' : '') : '';
  }
  // 复活倒计时显示
  var reviveEl = document.getElementById(prefix + 'ReserveRevive' + idx);
  if (reviveEl) {
    if (r.revive_timer && r.revive_timer > 0) {
      reviveEl.textContent = '⏳ 还有 ' + r.revive_timer + ' 回合复活';
      reviveEl.style.display = 'block';
    } else {
      reviveEl.style.display = 'none';
    }
  }
  if (r.name) {
    const imgContainer = document.getElementById(prefix + 'ReserveImg' + idx);
    if (imgContainer) {
      imgContainer.innerHTML = '';
      window.updateSpriteImage && window.updateSpriteImage(imgContainer, r.name);
    }
  }
  const skillsContainer = document.getElementById(prefix + 'ReserveSkillsContainer' + idx);
  if (skillsContainer) {
    skillsContainer.innerHTML = '';
    if (r.skills && Array.isArray(r.skills)) {
      r.skills.forEach(s => {
        const sn = typeof s === 'string' ? s : (s.name || '');
        if (!sn) return;
        const d = getSkillDisplay(sn);
        const tag = document.createElement('span');
        tag.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:3px 6px;background:#faf3e5;border-radius:4px;margin:2px;font-size:11px;white-space:nowrap';
        const iconUrl = window.getImageURL && window.getImageURL(sn, 'skill');
        if (iconUrl) {
          const icon = document.createElement('img');
          icon.src = iconUrl;
          icon.style.cssText = 'width:16px;height:16px;border-radius:2px;flex-shrink:0';
          tag.appendChild(icon);
        }
        const nm = document.createElement('span');
        nm.style.color = '#b09e82';
        nm.textContent = sn;
        tag.appendChild(nm);
        if (d) {
          const catSpan = document.createElement('span');
          catSpan.style.cssText = 'font-size:10px;font-weight:600;color:' + (d.category === '状态' ? '#2ecc71' : '#3498db');
          catSpan.textContent = d.category;
          tag.appendChild(catSpan);
          const pSpan = document.createElement('span');
          pSpan.style.cssText = 'font-size:10px;color:#f39c12';
          pSpan.textContent = '⚡' + d.power;
          tag.appendChild(pSpan);
          const eSpan = document.createElement('span');
          eSpan.style.cssText = 'font-size:10px;color:#c9952e';
          eSpan.textContent = '🔋' + d.energy;
          tag.appendChild(eSpan);
        }
        skillsContainer.appendChild(tag);
      });
    }
    if (skillsContainer.children.length === 0) {
      skillsContainer.innerHTML = '<span style="font-size:11px;color:#555">暂无技能</span>';
    }
  }
}

export function renderPlayerActive() {
  if (!turnData) initTurnData();
  const active = turnData.player.active_pokemon;
  if (active) {
    document.getElementById('pName').value = active.name || '';
    const pNameEl = document.getElementById('pName');
    if (pNameEl) {
      pNameEl.dataset.canBossify = active.can_bossify ? 'true' : 'false';
      pNameEl.dataset.bossName = active.boss_name || '';
    }
  }
  if (currentTurnNumber > 1) {
    document.getElementById('pType').value = active.type || '';
    document.getElementById('pCurrHP').value = active.current_hp != null ? active.current_hp : '';
    document.getElementById('pMaxHP').value = active.max_hp != null ? active.max_hp : '';
    document.getElementById('pCurrEnergy').value = active.current_energy != null ? active.current_energy : '';
    document.getElementById('pMaxEnergy').value = active.max_energy != null ? active.max_energy : '';
    document.getElementById('pAbility').value = active.ability_name || '';
    document.getElementById('pAbilityDesc').value = active.ability_desc || '';
    document.getElementById('pStrong').value = active.strong_against || '';
    document.getElementById('pWeak').value = active.weak_to || '';
    document.getElementById('pResists').value = active.resists || '';
    document.getElementById('pResisted').value = active.resisted_by || '';
    if (active.skills) {
      active.skills.forEach((s, i) => {
        if (i < 4) {
          const el = document.getElementById('pSkill' + i);
          if (el) {
            el.value = typeof s === 'string' ? s : (s.name || '');
            const skillName = typeof s === 'string' ? s : (s.name || '');
            if (skillName) window.updateSkillInfoDisplay && window.updateSkillInfoDisplay(skillName, 'pSkillInfo' + i);
          }
        }
      });
    }
    const spriteBox = document.getElementById('playerSpriteBox');
    if (spriteBox && active.name) window.updateSpriteImage && window.updateSpriteImage(spriteBox, active.name);
  }
  if (!document.getElementById('pMaxEnergy').value) document.getElementById('pMaxEnergy').value = 10;
  if (!document.getElementById('pCurrEnergy').value) document.getElementById('pCurrEnergy').value = 10;
  window.updatePlayerActionUI && window.updatePlayerActionUI();
  window.updateOcMaxHpDisplay && window.updateOcMaxHpDisplay();
}

export function renderOpponentActive() {
  if (!turnData) initTurnData();
  const active = turnData.opponent.active_pokemon;
  if (active) {
    document.getElementById('oName').value = active.name || '';
    const oNameEl = document.getElementById('oName');
    if (oNameEl) {
      oNameEl.dataset.canBossify = active.can_bossify ? 'true' : 'false';
      oNameEl.dataset.bossName = active.boss_name || '';
    }
    document.getElementById('oType').value = active.type || '';
    document.getElementById('oCurrHP').value = active.current_hp_percentage != null ? active.current_hp_percentage : '';
    document.getElementById('oMaxHP').value = active.max_hp_percentage != null ? active.max_hp_percentage : '';
    document.getElementById('oCurrEnergy').value = active.current_energy != null ? active.current_energy : '';
    document.getElementById('oMaxEnergy').value = active.max_energy != null ? active.max_energy : '';
    document.getElementById('oAbility').value = active.ability_name || '';
    document.getElementById('oAbilityDesc').value = active.ability_desc || '';
    document.getElementById('oStrong').value = active.strong_against || '';
    document.getElementById('oWeak').value = active.weak_to || '';
    document.getElementById('oResists').value = active.resists || '';
    document.getElementById('oResisted').value = active.resisted_by || '';
    const spriteBox = document.getElementById('opponentSpriteBox');
    if (spriteBox && active.name) window.updateSpriteImage && window.updateSpriteImage(spriteBox, active.name);
  }
  if (!document.getElementById('oMaxEnergy').value) document.getElementById('oMaxEnergy').value = 10;
  if (!document.getElementById('oCurrEnergy').value) document.getElementById('oCurrEnergy').value = 10;
  renderOpponentSkills();
  window.updateOpponentActionUI && window.updateOpponentActionUI();
}

export function renderOpponentSkills() {
  const skills = (turnData && turnData.opponent.active_pokemon && turnData.opponent.active_pokemon.known_skills) || [];
  for (let i = 0; i < 4; i++) {
    const input = document.getElementById('oSkill' + i);
    const info = document.getElementById('oSkillInfo' + i);
    const icon = document.getElementById('oSkill' + i + 'Icon');
    const s = skills[i];
    if (s) {
      const skillName = typeof s === 'string' ? s : (s.name || s);
      const display = getSkillDisplay(skillName);
      if (input) input.value = skillName;
      if (icon && display) {
        const url = window.getImageURL && window.getImageURL(skillName, 'skill');
        icon.src = url || '';
      }
      if (info && display) {
        const catClass = display.category === '状态' ? 'color:#2ecc71' : 'color:#3498db';
        info.innerHTML = '<span style="' + catClass + ';font-weight:600">' + display.category + '</span>' +
          ' &nbsp;威力:<span style="color:#f39c12">' + display.power + '</span>' +
          ' &nbsp;耗能:<span style="color:#c9952e">' + display.energy + '</span>';
      } else if (info) {
        info.textContent = '';
      }
    } else {
      if (input) input.value = '未知';
      if (icon) icon.src = '';
      if (info) info.textContent = '';
    }
  }
}

export function renderOpponentReserve() {
  const mode = document.querySelector('input[name="opponentReserveMode"]:checked');
  const isKnown = mode && mode.value === 'known';
  const hasSaved = battle.turns.length > 0;
  const config = _teamConfigRef;
  const fromTeamConfig = !hasSaved && (document.getElementById('oReserveKnown').disabled || config?.enemy?.mode === 'known' || config?.enemy?.mode === 'unknown');
  const fromTeamConfigKnown = !hasSaved && config?.enemy?.mode === 'known';

  document.getElementById('oReserveKnown').disabled = hasSaved || fromTeamConfig;
  document.getElementById('oReserveUnknown').disabled = hasSaved || fromTeamConfig;

  const inputArea = document.getElementById('opponentReserveInputArea');
  if (inputArea) {
    inputArea.style.display = (fromTeamConfigKnown || fromTeamConfig || hasSaved) ? 'none' : 'block';
  }

  const grid = document.getElementById('opponentReserveGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!hasSaved && !fromTeamConfigKnown) {
    if (!isKnown) {
      const msg = document.createElement('div');
      msg.style.cssText = 'background:#faf3e5;border-radius:6px;padding:16px;text-align:center;color:#666;font-size:13px;border:1px dashed #d8c29b';
      msg.textContent = '❓ 敌方后备未知 — 换宠时手动输入精灵名即可';
      grid.appendChild(msg);
    } else {
      for (let i = 0; i < 5; i++) {
        const slot = document.createElement('div');
        slot.className = 'reserve-slot';
        slot.innerHTML = `
          <div class="slot-header">
            <div class="slot-img" id="oReserveImg${i}"><span style="color:#666">#${i+1}</span></div>
            <input list="spriteList" id="oReserveName${i}" placeholder="精灵名" style="flex:1" oninput="window.autoFillOpponentReserve(${i})">
          </div>
          <div style="font-size:11px;color:#7bed9f" id="oReserveAbility${i}"></div>
          <div style="font-size:10px;color:#7b6953;margin:3px 0" id="oReserveAbilityDesc${i}"></div>
        `;
        grid.appendChild(slot);
        if (turnData && turnData.opponent.reserve_pokemon && turnData.opponent.reserve_pokemon[i]) {
          const r = turnData.opponent.reserve_pokemon[i];
          const nameInput = document.getElementById('oReserveName' + i);
          if (nameInput) nameInput.value = r.name || '';
          if (r.name) {
            const imgContainer = document.getElementById('oReserveImg' + i);
            if (imgContainer) {
              imgContainer.innerHTML = '';
              window.updateSpriteImage && window.updateSpriteImage(imgContainer, r.name);
            }
            const abil = document.getElementById('oReserveAbility' + i);
            const abilDesc = document.getElementById('oReserveAbilityDesc' + i);
            if (abil) abil.textContent = '⚡ ' + (r.ability_name || '');
            if (abilDesc) abilDesc.textContent = r.ability_desc || '';
          }
        }
      }
    }
  }
  renderOpponentReserveDisplay();
}

function renderOpponentReserveDisplay() {
  const displayArea = document.getElementById('opponentReserveDisplayArea');
  const grid = document.getElementById('opponentReserveDisplayGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const allReserves = (turnData && turnData.opponent.reserve_pokemon) || [];
  const activeName = turnData && turnData.opponent.active_pokemon && turnData.opponent.active_pokemon.name;
  // 过滤掉活跃精灵，但保留阵亡/复活中的精灵（HP=0 或 revive_timer>0）
  const reserves = activeName ? allReserves.filter(r => r.name !== activeName || r.current_hp_percentage === 0 || r.revive_timer > 0) : allReserves;
  const hasDisplay = reserves.length > 0;
  if (displayArea) displayArea.style.display = hasDisplay ? 'block' : 'none';
  if (!hasDisplay) return;

  reserves.forEach((r, i) => {
    const slot = document.createElement('div');
    slot.className = 'reserve-slot';
    const hpText = (r.current_hp_percentage != null && r.max_hp_percentage != null) ? r.current_hp_percentage + '% / ' + r.max_hp_percentage + '%' : '— / —';
    const enText = (r.current_energy != null && r.max_energy != null) ? r.current_energy + ' / ' + r.max_energy : '— / —';
    const abilName = r.ability_name || '';
    const abilDesc = r.ability_desc || '';
    const abilHtml = abilName ? '⚡ ' + abilName + (abilDesc ? ' <span style="color:#666;font-size:10px">— ' + abilDesc + '</span>' : '') : '';
    const knownSkills = (r.known_skills && r.known_skills.length > 0)
      ? r.known_skills.map(buildSkillTag).join('') : '<span style="font-size:11px;color:#555">暂无已知技能</span>';
    
    slot.innerHTML = `
      <div class="slot-header">
        <div class="slot-img" id="oResDisplayImg${i}"><span style="color:#666">#${i+1}</span></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${r.name || '未知'}</div>
          <div style="font-size:11px;color:#7b6953">${abilHtml}</div>
        </div>
      </div>
      <div style="font-size:11px;color:#7b6953;margin:4px 0">🩸 HP: ${hpText}</div>
      <div style="font-size:11px;color:#7b6953;margin:2px 0">⚡ 能量: ${enText}</div>
      ${r.revive_timer && r.revive_timer > 0 ? '<div style="font-size:11px;color:#f39c12;margin:2px 0">⏳ 还有 ' + r.revive_timer + ' 回合复活</div>' : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px">${knownSkills}</div>
    `;
    grid.appendChild(slot);
    if (r.name) {
      const imgContainer = document.getElementById('oResDisplayImg' + i);
      if (imgContainer) {
        imgContainer.innerHTML = '';
        window.updateSpriteImage && window.updateSpriteImage(imgContainer, r.name);
      }
    }
  });
}

function buildSkillTag(s) {
  const sn = typeof s === 'string' ? s : (s.name || '');
  const d = getSkillDisplay(sn);
  if (!d) return '<span style="font-size:11px;color:#b09e82;display:inline-flex;align-items:center;gap:3px;padding:3px 6px;background:#faf3e5;border-radius:4px;margin:2px">' + sn + '</span>';
  const catClr = d.category === '状态' ? '#2ecc71' : '#3498db';
  const iconUrl = window.getImageURL && window.getImageURL(sn, 'skill');
  const iconHtml = iconUrl ? '<img src="' + iconUrl + '" style="width:16px;height:16px;border-radius:2px;flex-shrink:0">' : '';
  return '<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 6px;background:#faf3e5;border-radius:4px;margin:2px;white-space:nowrap">' +
    iconHtml +
    '<span style="font-size:11px;color:#b09e82">' + sn + '</span>' +
    '<span style="font-size:10px;font-weight:600;color:' + catClr + '">' + d.category + '</span>' +
    '<span style="font-size:10px;color:#f39c12">⚡' + d.power + '</span>' +
    '<span style="font-size:10px;color:#c9952e">🔋' + d.energy + '</span>' +
    '</span>';
}

export function prevTurn() {}

// ===== 敌方后备模式切换 =====
export function toggleOpponentReserveMode() {
  const mode = document.querySelector('input[name="opponentReserveMode"]:checked');
  if (turnData && mode) {
    turnData.opponent_reserve_known = mode.value === 'known';
  }
  renderOpponentReserve();
}

// ===== 导出到 window（供 onclick 使用） =====
window.enterBattle = enterBattle;
window.newBattle = newBattle;
window.backToTeamConfig = backToTeamConfig;
window.confirmAndNextTurn = confirmAndNextTurn;
window.initTurnData = initTurnData;
window.toggleOpponentReserveMode = toggleOpponentReserveMode;
