// ============================================================
// utils.js — 工具函数 & 数据查询
// ============================================================

import { SKILLS_DB, SPRITES_DB, URLS_DB, PATH_TO_URL, LOCAL_PATHS } from './csv-loader.js';

// ===== HTML 转义 =====
export function htmlEscape(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== 试用模式 UI 切换 =====
export function toggleTrialUI(enabled) {
  // API Key 整列 → 隐藏
  document.querySelectorAll('.api-key-col').forEach(el => {
    el.style.display = enabled ? 'none' : '';
  });

  // 阵容分析区：Provider/Model 整列 → 隐藏，组合文本 → 显示
  document.querySelectorAll('.tc-provider-col, .tc-model-col').forEach(el => {
    el.style.display = enabled ? 'none' : '';
  });
  document.querySelectorAll('.trial-mode-combo').forEach(el => {
    el.style.display = enabled ? 'inline' : 'none';
  });

  // AI 策略分析区：Provider/Model 下拉框 → 隐藏，静态文本 → 显示
  document.querySelectorAll('#aiProvider, #aiModel').forEach(el => {
    el.style.display = enabled ? 'none' : '';
  });
  document.querySelectorAll('.trial-provider-text, .trial-model-text').forEach(el => {
    el.style.display = enabled ? '' : 'none';
  });

  // 试用 badge
  document.querySelectorAll('.trial-badge').forEach(el => {
    el.style.display = enabled ? '' : 'none';
  });
}

// ===== Toast 通知 =====
export function showToast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + type + ' show';
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ===== 属性标签 CSS 类名 =====
export function typeClass(type) {
  const map = {
    '光系':'light','冰系':'ice','地系':'ground','幻系':'illusion','幽系':'ghost',
    '恶系':'dark','普通系':'normal','机械系':'mechanical','武系':'fighting',
    '毒系':'poison','水系':'water','火系':'fire','电系':'electric','翼系':'wind',
    '草系':'grass','萌系':'cute','虫系':'bug','龙系':'dragon'
  };
  return map[type] || 'normal';
}

// ===== 折叠/展开区块 =====
export function toggleSection(titleEl) {
  const body = titleEl.nextElementSibling;
  if (!body) return;
  body.classList.toggle('active');
  titleEl.classList.toggle('collapsed');
}

// ===== HP 显示更新 =====
export function updateHPDisplay() {
  const p = parseInt(document.getElementById('playerHP').value) || 4;
  const o = parseInt(document.getElementById('opponentHP').value) || 4;
  const pHearts = document.getElementById('playerHearts');
  const oHearts = document.getElementById('opponentHearts');
  if (!pHearts || !oHearts) return;
  pHearts.innerHTML = '';
  oHearts.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    pHearts.innerHTML += i < p ? '<span class="alive">❤️</span>' : '<span class="lost">🖤</span>';
    oHearts.innerHTML += i < o ? '<span class="alive">❤️</span>' : '<span class="lost">🖤</span>';
  }
}

// ===== 精灵数据查询 =====
export function getSpritePokemon(name) {
  if (!name) return null;
  const s = SPRITES_DB[name];
  if (!s) return null;
  return {
    name: s['name'],
    type: s['attributes'],
    ability_name: s['ability_name'],
    ability_desc: s['ability_desc'],
    strong_against: s['strong_against'],
    weak_to: s['weak_to'],
    resists: s['resists'],
    resisted_by: s['resisted_by'],
    skills: s['skills'] ? s['skills'].split(';').map(x => x.trim()).filter(Boolean) : [],
    image: s['image'] || ''
  };
}

// ===== 技能信息查询 =====
export function getSkillInfo(name) {
  if (!name) return null;
  const s = SKILLS_DB[name];
  if (!s) return null;
  return {
    name: s['技能名'],
    type: s['属性'],
    category: s['类型'],
    power: s['威力'],
    energy: s['耗能'],
    effect: s['效果描述']
  };
}

export function getSkillCategory(csvType) {
  const map = {'变化':'状态','魔攻':'攻击','物攻':'攻击'};
  return map[csvType] || csvType || '';
}

export function getSkillDisplay(name) {
  const info = getSkillInfo(name);
  if (!info) return null;
  return {
    name: info.name,
    type: info.type,
    category: getSkillCategory(info.category),
    power: info.power,
    energy: info.energy,
    effect: info.effect
  };
}

// ===== 本地图片路径查询（完全本地化，不走网络） =====

/**
 * 根据名字和类型查本地图片路径
 * 返回相对于 app/ 目录的路径（如 ../images/skills/猛烈撞击.png）
 * 优先级：type:name 精确查询 > 纯名称查询 > PATH_TO_URL 回退
 */
export function getImageURL(nameOrPath, type) {
  // 第一优先：按 type:name 组合键精确匹配
  if (type) {
    const key = type + ':' + nameOrPath;
    const p = LOCAL_PATHS[key];
    if (p) return p;
  }
  // 第二优先：仅按名称在 URLS_DB 中查找 local_path
  const u = URLS_DB[nameOrPath];
  if (u && u['local_path']) return u['local_path'];
  // 第三优先：如果 nameOrPath 本身是一个路径片段，尝试直接拼接
  if (PATH_TO_URL[nameOrPath]) return nameOrPath;
  return '';
}

/**
 * 根据精灵名获取本地精灵图像路径
 * 优先用 local_path 索引，降级到 sprites.csv 的 image 字段拼接
 */
export function getSpriteImageURL(name) {
  // 第一优先：精确按 sprite:名称 查找
  const key = 'sprite:' + name;
  const p = LOCAL_PATHS[key];
  if (p) return p;
  // 第二优先：从 sprites.csv 的 image 字段拼接
  const poke = getSpritePokemon(name);
  if (poke && poke.image) {
    // sprites.csv 中的 image 已是 images/sprites/xxx.png 格式
    return poke.image;
  }
  return '';
}

// ===== 精灵图片更新 =====
export function updateSpriteImage(container, name) {
  if (!container) return;
  const oldImg = container.querySelector('img');
  if (oldImg) oldImg.remove();
  const oldSpan = container.querySelector('.no-img');
  if (oldSpan) oldSpan.remove();

  let url = getSpriteImageURL(name);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = name;
    img.onerror = function() {
      this.style.display = 'none';
      const span = document.createElement('span');
      span.className = 'no-img';
      span.textContent = name;
      container.appendChild(span);
    };
    container.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'no-img';
    span.textContent = name || '🖼';
    container.appendChild(span);
  }
}

// ===== 技能信息显示更新 =====
export function updateSkillInfoDisplay(name, infoElId) {
  const el = document.getElementById(infoElId);
  if (!el) return;
  const display = getSkillDisplay(name);
  if (!display) { el.textContent = ''; return; }
  const catClass = display.category === '状态' ? 'color:#2ecc71' : 'color:#3498db';
  el.innerHTML = '<span style="' + catClass + ';font-weight:600">' + display.category + '</span>' +
    ' &nbsp;威力:<span style="color:#f39c12">' + display.power + '</span>' +
    ' &nbsp;耗能:<span style="color:#c9952e">' + display.energy + '</span>';
}

// ===== Auto-fill 技能信息 =====
export function autoFillSkill(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const name = el.value.trim();
  const skill = getSkillInfo(name);
  if (!skill) {
    const infoEl = document.getElementById(inputId.replace('Skill','SkillInfo'));
    if (infoEl) infoEl.textContent = '';
    return;
  }
  let idx = -1;
  if (inputId.startsWith('pSkill')) idx = parseInt(inputId.replace('pSkill', ''));
  if (idx >= 0) {
    const icon = document.getElementById('pSkill' + idx + 'Icon');
    const url = getImageURL(name, 'skill');
    if (url && icon) icon.src = url;
    updateSkillInfoDisplay(name, 'pSkillInfo' + idx);
  }
  if (inputId.includes('ReserveSkill')) {
    const infoId = inputId + 'Info';
    updateSkillInfoDisplay(name, infoId);
  }
}

/**
 * 精灵基础信息收集（用于 turnData 数据结构）
 */
export function collectPokemonBase(name) {
  const poke = getSpritePokemon(name);
  return {
    name: name,
    type: poke ? poke.type : '',
    ability_name: poke ? poke.ability_name : '',
    ability_desc: poke ? poke.ability_desc : '',
    strong_against: poke ? poke.strong_against : '',
    weak_to: poke ? poke.weak_to : '',
    resists: poke ? poke.resists : '',
    resisted_by: poke ? poke.resisted_by : ''
  };
}
