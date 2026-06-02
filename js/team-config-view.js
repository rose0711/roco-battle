// ============================================================
// team-config-view.js — 阵容配置视图
// ============================================================

import { dataLoaded, allSpriteNames, isBossifiable } from './csv-loader.js';
import { showToast, htmlEscape, getSpritePokemon, getSpriteImageURL, getImageURL, getSkillDisplay, updateSpriteImage } from './utils.js';

// ===== 阵容配置状态 =====
export const teamConfig = {
  player: {
    pets: [],
    starterIdx: 0,
    teamName: '我的阵容',
    analysis: ''
  },
  enemy: {
    mode: 'known',
    pets: [],
    starterIdx: 0,
    teamName: '敌方阵容'
  }
};

// ===== 渲染阵容槽位 =====
export function renderTeamConfigSlots() {
  const playerGrid = document.getElementById('playerConfigGrid');
  if (!playerGrid) return;
  playerGrid.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const card = document.createElement('div');
    card.className = 'tc-card' + (teamConfig.player.starterIdx === i ? ' starter' : '');
    const existing = teamConfig.player.pets[i] || {name:'', hp:'', skills:['','','',''], ability:'', ability_effect:''};
    card.innerHTML = `
      <button class="star-btn${teamConfig.player.starterIdx === i ? ' active' : ''}" onclick="window.setPlayerStarter(${i})">★</button>
      <div style="font-size:11px;color:#7b6953;margin-bottom:4px">#${i+1} ${teamConfig.player.starterIdx === i ? '★首发' : ''}</div>
      <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:4px">
        <div class="sprite-box" id="tcPSprite${i}" style="width:60px;height:60px;border-radius:6px;background:#f3ead8;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #d8c29b;flex-shrink:0"><span style="color:#555;font-size:11px">🖼</span></div>
        <div style="flex:1;min-width:0">
          <div class="tc-name-row">
            <div class="name-wrap">
              <label class="card-label">精灵名</label>
              <input list="spriteList" id="tcPName${i}" value="${htmlEscape(existing.name)}" placeholder="输入精灵名..." oninput="window.tcAutoFillPlayer(${i})">
            </div>
            <div class="hp-wrap">
              <label class="card-label">HP</label>
              <input type="number" id="tcPHp${i}" value="${existing.hp || ''}" placeholder="血量">
            </div>
          </div>
          <div id="tcPAbility${i}" style="font-size:11px;color:#7bed9f;min-height:30px;line-height:1.4"></div>
          <div id="tcPBossifyRow${i}" style="display:none;align-items:center;gap:6px;font-size:12px;margin-top:4px">
            <span style="font-size:14px">👑</span>
            <label style="color:#f39c12;cursor:pointer;display:flex;align-items:center;gap:4px">
              <input type="checkbox" id="tcPBossify${i}" style="width:14px;height:14px;cursor:pointer" ${existing.canBossify ? 'checked' : ''}>
              可首领化 → <span id="tcPBossifyTarget${i}" style="color:#c9952e;font-weight:600">${existing.canBossify ? htmlEscape(isBossifiable(existing.name) || '') : ''}</span>
            </label>
          </div>
        </div>
      </div>
      <div class="tc-skills">
        ${[0,1,2,3].map(si => {
          const raw = existing.skills[si];
          const sv = (typeof raw === 'object' && raw !== null) ? (raw.name || '') : (raw || '');
          return '<div style="display:flex;gap:3px;align-items:flex-start"><div style="width:18px;height:18px;border-radius:3px;background:#f3ead8;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center" id="tcPSkillIcon' + i + '_' + si + '"></div><div style="flex:1"><input list="skillList" id="tcPSkill' + i + '_' + si + '" value="' + htmlEscape(sv) + '" placeholder="技能' + (si+1) + '" oninput="window.tcAutoFillSkill(' + i + ',' + si + ')"><div id="tcPSkill' + i + '_' + si + 'Info" class="tc-skill-info"></div></div></div>';
        }).join('\n')}
      </div>
    `;
    playerGrid.appendChild(card);
    if (existing.name) tcAutoFillPlayer(i);
    const skillNames = (existing.skills || []).map(s => (typeof s === 'object' && s !== null) ? (s.name || '') : (s || ''));
    skillNames.forEach((sn, si) => { if (sn) tcAutoFillSkill(i, si); });
  }
  renderEnemyConfigSlots();
}

export function renderEnemyConfigSlots() {
  const wrapper = document.getElementById('tcEnemyGridWrapper');
  if (!wrapper) return;
  const modeRadio = document.querySelector('input[name="tcEnemyMode"]:checked');
  const isKnown = modeRadio && modeRadio.value === 'known';
  wrapper.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'tc-grid';
  const count = isKnown ? 6 : 1;
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'tc-card' + (teamConfig.enemy.starterIdx === i ? ' starter' : '');
    const existing = teamConfig.enemy.pets[i] || {name:''};
    card.innerHTML = `
      <button class="star-btn${teamConfig.enemy.starterIdx === i ? ' active' : ''}" onclick="window.setEnemyStarter(${i})">★</button>
      <div style="font-size:11px;color:#7b6953;margin-bottom:4px">#${i+1} ${teamConfig.enemy.starterIdx === i ? '★首发' : ''}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
        <div class="sprite-box" id="tcESprite${i}" style="width:50px;height:50px;border-radius:6px;background:#f3ead8;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #d8c29b;flex-shrink:0"><span style="color:#555;font-size:11px">🖼</span></div>
        <div style="flex:1;min-width:0">
          <label class="card-label">精灵名</label>
          <input list="spriteList" id="tcEName${i}" value="${htmlEscape(existing.name)}" placeholder="输入精灵名..." oninput="window.tcAutoFillEnemy(${i})">
        </div>
      </div>
      <div style="font-size:11px;color:#7b6953">${isKnown ? 'HP: 100% (自动)' : 'HP: 100% — 首发精灵（其余未知）'}</div>
      <div id="tcEBossifyRow${i}" style="display:none;align-items:center;gap:6px;font-size:12px;margin-top:4px">
        <span style="font-size:14px">👑</span>
        <label style="color:#f39c12;cursor:pointer;display:flex;align-items:center;gap:4px">
          <input type="checkbox" id="tcEBossify${i}" style="width:14px;height:14px;cursor:pointer" ${existing.canBossify ? 'checked' : ''}>
          可首领化 → <span id="tcEBossifyTarget${i}" style="color:#c9952e;font-weight:600">${existing.canBossify ? htmlEscape(isBossifiable(existing.name) || '') : ''}</span>
        </label>
      </div>
    `;
    grid.appendChild(card);
  }
  wrapper.appendChild(grid);
  for (let i = 0; i < count; i++) {
    const existing = teamConfig.enemy.pets[i] || {name:''};
    if (existing.name) tcAutoFillEnemy(i);
  }
}

// ===== Auto-fill 函数 =====
function updateTcSprite(container, name) {
  const url = getSpriteImageURL(name);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = name;
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
    img.onerror = function() {
      this.style.display = 'none';
      const span = document.createElement('span');
      span.style.cssText = 'color:#555;font-size:11px';
      span.textContent = '🖼';
      container.appendChild(span);
    };
    container.appendChild(img);
  } else {
    container.innerHTML = '<span style="color:#555;font-size:11px">🖼</span>';
  }
}

function updateBossToggleRow(side, idx, name) {
  const prefix = side === 'P' ? 'tcP' : 'tcE';
  const row = document.getElementById(prefix + 'BossifyRow' + idx);
  const chk = document.getElementById(prefix + 'Bossify' + idx);
  const targetEl = document.getElementById(prefix + 'BossifyTarget' + idx);
  if (!row || !chk || !targetEl) return;
  const bossName = isBossifiable(name);
  if (bossName) {
    row.style.display = 'flex';
    targetEl.textContent = bossName;
    // 如果之前没有设置 canBossify 或 name 改变，重置勾选
    const config = side === 'P' ? teamConfig.player : teamConfig.enemy;
    const prev = config.pets[idx];
    if (!prev || prev.name !== name) {
      chk.checked = false;
    }
  } else {
    row.style.display = 'none';
    chk.checked = false;
    targetEl.textContent = '';
  }
}

export function tcAutoFillPlayer(idx) {
  const el = document.getElementById('tcPName' + idx);
  const name = el ? el.value.trim() : '';
  const abilityEl = document.getElementById('tcPAbility' + idx);
  if (!abilityEl) return;
  if (!name) { abilityEl.textContent = ''; updateBossToggleRow('P', idx, ''); return; }
  updateBossToggleRow('P', idx, name);
  const poke = getSpritePokemon(name);
  if (poke) {
    abilityEl.innerHTML = '⚡ <strong>' + htmlEscape(poke.ability_name) + '</strong>' +
      (poke.ability_desc ? '<br><span style="font-size:10px;color:#b09e82">' + htmlEscape(poke.ability_desc) + '</span>' : '');
  } else {
    const existing = teamConfig.player.pets[idx];
    if (existing && (existing.ability || existing.ability_effect)) {
      abilityEl.innerHTML = '⚡ <strong>' + htmlEscape(existing.ability || '') + '</strong>' +
        (existing.ability_effect ? '<br><span style="font-size:10px;color:#b09e82">' + htmlEscape(existing.ability_effect) + '</span>' : '');
    } else {
      abilityEl.textContent = '';
    }
  }
  const spriteBox = document.getElementById('tcPSprite' + idx);
  if (spriteBox) {
    spriteBox.innerHTML = '';
    if (name) updateTcSprite(spriteBox, name);
    else spriteBox.innerHTML = '<span style="color:#555;font-size:11px">🖼</span>';
  }
  if (idx === teamConfig.player.starterIdx) updateStarterDisplay();
}

export function tcAutoFillEnemy(idx) {
  const el = document.getElementById('tcEName' + idx);
  const name = el ? el.value.trim() : '';
  updateBossToggleRow('E', idx, name);
  const spriteBox = document.getElementById('tcESprite' + idx);
  if (spriteBox) {
    spriteBox.innerHTML = '';
    if (name) updateTcSprite(spriteBox, name);
    else spriteBox.innerHTML = '<span style="color:#555;font-size:11px">🖼</span>';
  }
  if (idx === teamConfig.enemy.starterIdx) updateStarterDisplay();
}

export function tcAutoFillSkill(idx, si) {
  const el = document.getElementById('tcPSkill' + idx + '_' + si);
  if (!el) return;
  const name = el.value.trim();
  const infoEl = document.getElementById('tcPSkill' + idx + '_' + si + 'Info');
  if (!infoEl) return;
  if (!name) { infoEl.textContent = ''; return; }
  const display = getSkillDisplay(name);
  if (!display) { infoEl.textContent = ''; return; }
  const catClass = display.category === '状态' ? 'color:#2ecc71' : 'color:#3498db';
  infoEl.innerHTML = '<span style="' + catClass + ';font-weight:600">' + display.category + '</span>' +
    ' &nbsp;威力:<span style="color:#f39c12">' + display.power + '</span>' +
    ' &nbsp;耗能:<span style="color:#c9952e">' + display.energy + '</span>' +
    (display.effect ? '<br><span style="font-size:10px;color:#b09e82">' + htmlEscape(display.effect) + '</span>' : '');
  el.dataset.skillName = display.name || '';
  el.dataset.skillType = display.type || '';
  el.dataset.skillCategory = display.category || '';
  el.dataset.skillPower = display.power || '';
  el.dataset.skillEnergy = display.energy || '';
  el.dataset.skillEffect = display.effect || '';
  const iconContainer = document.getElementById('tcPSkillIcon' + idx + '_' + si);
  if (iconContainer) {
    const url = getImageURL(name, 'skill');
    if (url) iconContainer.innerHTML = '<img src="' + url + '" style="max-width:100%;max-height:100%" alt="">';
  }
}

// ===== 首发设置 =====
export function setPlayerStarter(idx) {
  teamConfig.player.starterIdx = idx;
  const cards = document.querySelectorAll('#playerConfigGrid .tc-card');
  cards.forEach((c, i) => {
    c.classList.toggle('starter', i === idx);
    const btn = c.querySelector('.star-btn');
    if (btn) btn.classList.toggle('active', i === idx);
    const labelDiv = c.querySelector('div[style*="font-size:11px;color:#7b6953;margin-bottom"]');
    if (labelDiv) labelDiv.textContent = '#' + (i+1) + (i === idx ? ' ★首发' : '');
  });
  updateStarterDisplay();
}

export function setEnemyStarter(idx) {
  teamConfig.enemy.starterIdx = idx;
  const cards = document.querySelectorAll('#tcEnemyGridWrapper .tc-card');
  cards.forEach((c, i) => {
    c.classList.toggle('starter', i === idx);
    const btn = c.querySelector('.star-btn');
    if (btn) btn.classList.toggle('active', i === idx);
    const labelDiv = c.querySelector('div[style*="font-size:11px;color:#7b6953;margin-bottom"]');
    if (labelDiv) labelDiv.textContent = '#' + (i+1) + (i === idx ? ' ★首发' : '');
  });
  updateStarterDisplay();
}

// ===== 更新首发显示 =====
export function updateStarterDisplay() {
  // 我方
  const pStarterName = teamConfig.player.pets[teamConfig.player.starterIdx]?.name || '';
  const pEl = document.getElementById('playerStarterDisplay');
  if (pEl) {
    pEl.textContent = pStarterName ? '首发：' + pStarterName : '';
  }
  // 敌方
  const eStarterName = teamConfig.enemy.pets[teamConfig.enemy.starterIdx]?.name || '';
  const eEl = document.getElementById('enemyStarterDisplay');
  if (eEl) {
    eEl.textContent = eStarterName ? '首发：' + eStarterName : '';
  }
}

// ===== 敌方模式切换 =====
export function toggleTcEnemyMode() {
  const mode = document.querySelector('input[name="tcEnemyMode"]:checked');
  const isKnown = mode && mode.value === 'known';
  teamConfig.enemy.mode = isKnown ? 'known' : 'unknown';
  renderEnemyConfigSlots();
  if (isKnown) {
    requestAnimationFrame(() => {
      for (let i = 0; i < 6; i++) {
        if (teamConfig.enemy.pets[i] && teamConfig.enemy.pets[i].name) tcAutoFillEnemy(i);
      }
    });
  }
}

// ===== 收集阵容配置 =====
export function collectTeamConfig() {
  const pPets = [];
  for (let i = 0; i < 6; i++) {
    const name = (document.getElementById('tcPName' + i) || {}).value || '';
    const hp = parseInt((document.getElementById('tcPHp' + i) || {}).value) || null;
    const poke = name ? getSpritePokemon(name.trim()) : null;
    const skills = [];
    for (let si = 0; si < 4; si++) {
      const el = document.getElementById('tcPSkill' + i + '_' + si);
      const sName = el ? el.value.trim() : '';
      if (sName) {
        skills.push({
          name: el.dataset.skillName || sName,
          type: el.dataset.skillType || '',
          category: el.dataset.skillCategory || '',
          power: el.dataset.skillPower || '',
          energy: el.dataset.skillEnergy || '',
          effect: el.dataset.skillEffect || ''
        });
      } else {
        skills.push({ name: '', type: '', category: '', power: '', energy: '', effect: '' });
      }
    }
    const bossCheck = document.getElementById('tcPBossify' + i);
    pPets.push({
      name: name.trim(),
      hp: hp,
      ability: poke ? (poke.ability_name || '') : '',
      ability_effect: poke ? (poke.ability_desc || '') : '',
      skills,
      canBossify: bossCheck ? bossCheck.checked : false
    });
  }
  teamConfig.player.pets = pPets;

  const mode = document.querySelector('input[name="tcEnemyMode"]:checked');
  teamConfig.enemy.mode = mode ? mode.value : 'unknown';
  const ePets = [];
  for (let i = 0; i < 6; i++) {
    const name = (document.getElementById('tcEName' + i) || {}).value || '';
    const bossCheck = document.getElementById('tcEBossify' + i);
    ePets.push({ name: name.trim(), canBossify: bossCheck ? bossCheck.checked : false });
  }
  teamConfig.enemy.pets = ePets;
}

// ===== 存档函数 =====
export async function savePlayerTeam() {
  if (!dataLoaded) { showToast('数据未就绪', 'error'); return; }
  collectTeamConfig();
  const analysisEl = document.getElementById('tcTeamAnalysis');
  teamConfig.player.analysis = analysisEl ? analysisEl.value : '';
  const teamName = (document.getElementById('playerTeamName') || {}).value || '我的阵容';
  teamConfig.player.teamName = teamName;
  const safeName = teamName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'unnamed';
  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: 'player_' + safeName + '.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify({ player: teamConfig.player }, null, 2));
    await writable.close();
    showToast('我方阵容已保存', 'success');
  } catch(e) {
    if (e.name !== 'AbortError') showToast('保存失败: ' + e.message, 'error');
  }
}

export async function saveEnemyTeam() {
  if (!dataLoaded) { showToast('数据未就绪', 'error'); return; }
  const mode = document.querySelector('input[name="tcEnemyMode"]:checked');
  teamConfig.enemy.mode = mode ? mode.value : 'unknown';
  const ePets = [];
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('tcEName' + i);
    ePets.push({ name: el ? el.value.trim() : '' });
  }
  teamConfig.enemy.pets = ePets;
  const teamName = (document.getElementById('enemyTeamName') || {}).value || '敌方阵容';
  teamConfig.enemy.teamName = teamName;
  const safeName = teamName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'unnamed';
  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: 'enemy_' + safeName + '.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify({
      enemy: { mode: teamConfig.enemy.mode, pets: teamConfig.enemy.pets, starterIdx: teamConfig.enemy.starterIdx, teamName }
    }, null, 2));
    await writable.close();
    showToast('敌方阵容已保存', 'success');
  } catch(e) {
    if (e.name !== 'AbortError') showToast('保存失败: ' + e.message, 'error');
  }
}

export async function loadPlayerTeam() {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.player || !data.player.pets || data.player.pets.length !== 6) {
      showToast('存档格式不正确（缺少 player.pets）', 'error');
      return;
    }
    data.player.pets.forEach(pet => {
      if (pet.skills && pet.skills.length > 0 && typeof pet.skills[0] === 'string') {
        pet.skills = pet.skills.map(s => typeof s === 'string' ? { name: s, type: '', category: '', power: '', energy: '', effect: '' } : s);
      }
      while (pet.skills.length < 4) pet.skills.push({ name: '', type: '', category: '', power: '', energy: '', effect: '' });
      if (!pet.ability && pet.name) {
        const poke = getSpritePokemon(pet.name);
        if (poke) { pet.ability = poke.ability_name || ''; pet.ability_effect = poke.ability_desc || ''; }
      }
    });
    teamConfig.player = data.player;
    renderTeamConfigSlots();
    const nameInput = document.getElementById('playerTeamName');
    if (nameInput && data.player.teamName) nameInput.value = data.player.teamName;
    const analysisEl = document.getElementById('tcTeamAnalysis');
    if (analysisEl && data.player.analysis) analysisEl.value = data.player.analysis;
    showToast('我方阵容载入成功', 'success');
  } catch(e) {
    if (e.name !== 'AbortError') showToast('载入失败: ' + e.message, 'error');
  }
}

export async function loadEnemyTeam() {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.enemy || !data.enemy.pets || data.enemy.pets.length !== 6) {
      showToast('存档格式不正确（缺少 enemy.pets）', 'error');
      return;
    }
    teamConfig.enemy = data.enemy;
    const knownRadio = document.querySelector('input[name="tcEnemyMode"][value="known"]');
    const unknownRadio = document.querySelector('input[name="tcEnemyMode"][value="unknown"]');
    if (knownRadio && unknownRadio) {
      knownRadio.checked = data.enemy.mode === 'known';
      unknownRadio.checked = data.enemy.mode !== 'known';
    }
    renderEnemyConfigSlots();
    const nameInput = document.getElementById('enemyTeamName');
    if (nameInput && data.enemy.teamName) nameInput.value = data.enemy.teamName;
    requestAnimationFrame(() => {
      for (let i = 0; i < 6; i++) {
        if (teamConfig.enemy.pets[i] && teamConfig.enemy.pets[i].name) tcAutoFillEnemy(i);
      }
    });
    showToast('敌方阵容载入成功', 'success');
  } catch(e) {
    if (e.name !== 'AbortError') showToast('载入失败: ' + e.message, 'error');
  }
}

// ===== 导出到 window（供 onclick 使用） =====
window.collectTeamConfig = collectTeamConfig;
window.savePlayerTeam = savePlayerTeam;
window.saveEnemyTeam = saveEnemyTeam;
window.loadPlayerTeam = loadPlayerTeam;
window.loadEnemyTeam = loadEnemyTeam;
window.renderTeamConfigSlots = renderTeamConfigSlots;
window.renderEnemyConfigSlots = renderEnemyConfigSlots;
window.tcAutoFillPlayer = tcAutoFillPlayer;
window.tcAutoFillEnemy = tcAutoFillEnemy;
window.tcAutoFillSkill = tcAutoFillSkill;
window.setPlayerStarter = setPlayerStarter;
window.setEnemyStarter = setEnemyStarter;
window.updateStarterDisplay = updateStarterDisplay;
window.toggleTcEnemyMode = toggleTcEnemyMode;
