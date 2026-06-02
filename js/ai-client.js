// ============================================================
// ai-client.js — AI API 调用封装
// ============================================================

import { PROVIDER_MODELS, DEFAULT_BATTLE_PROMPT, DEFAULT_TEAM_PROMPT } from './config.js';
import { dataLoaded, BOSSED_DB } from './csv-loader.js';
import { showToast, htmlEscape } from './utils.js';
import { collectPokemonBase } from './utils.js';
import { store } from './store.js';
import { getSkillDisplay } from './utils.js';

// ===== 当前 battle 引用（由主模块设置） =====
let _battleRef = null;
let _teamConfigRef = null;
let _turnDataRef = null;

export function setBattleRef(ref) { _battleRef = ref; }
export function setTeamConfigRef(ref) { _teamConfigRef = ref; }
export function setTurnDataRef(ref) { _turnDataRef = ref; }

// ===== Provider & Model 管理 =====
export function populateModels(prefix) {
  const providerEl = document.getElementById(prefix + 'Provider');
  const modelEl = document.getElementById(prefix + 'Model');
  if (!providerEl || !modelEl) return;
  const provider = providerEl.value;
  const models = PROVIDER_MODELS[provider] || [];
  modelEl.innerHTML = models.map(m => '<option value="' + m.value + '">' + m.label + '</option>').join('');
}

export function onProviderChange(prefix) {
  populateModels(prefix);
  const providerEl = document.getElementById(prefix + 'Provider');
  const keyInput = document.getElementById(prefix + 'ApiKey');
  const checkbox = document.getElementById(prefix + 'RememberKey');
  if (!keyInput || !providerEl) return;
  try {
    const saved = localStorage.getItem('saved_ai_' + providerEl.value);
    if (saved) {
      keyInput.value = saved;
      if (checkbox) checkbox.checked = true;
    } else {
      keyInput.value = '';
      if (checkbox) checkbox.checked = false;
    }
  } catch(e) {}
}

function maybeSaveAIKey(inputId, checkboxId, providerId) {
  const remember = document.getElementById(checkboxId);
  if (!remember || !remember.checked) return;
  const key = document.getElementById(inputId);
  const providerEl = document.getElementById(providerId);
  if (key && key.value.trim() && providerEl) {
    try { localStorage.setItem('saved_ai_' + providerEl.value, key.value.trim()); } catch(e) {}
  }
}

export function loadAIKey(inputId, providerId, checkboxId) {
  const providerEl = document.getElementById(providerId);
  const key = document.getElementById(inputId);
  const checkbox = document.getElementById(checkboxId);
  if (!key || !providerEl) return;
  try {
    const saved = localStorage.getItem('saved_ai_' + providerEl.value);
    if (saved) {
      key.value = saved;
      if (checkbox) checkbox.checked = true;
    }
  } catch(e) {}
}

export function hookProviderSync(prefix) {
  const providerEl = document.getElementById(prefix + 'Provider');
  const keyInput = document.getElementById(prefix + 'ApiKey');
  const checkbox = document.getElementById(prefix + 'RememberKey');
  if (!providerEl) return;
  providerEl.addEventListener('change', function() {
    onProviderChange(prefix);
  });
  if (keyInput) {
    keyInput.addEventListener('blur', function() {
      maybeSaveAIKey(prefix + 'ApiKey', prefix + 'RememberKey', prefix + 'Provider');
    });
  }
  if (checkbox) {
    checkbox.addEventListener('change', function() {
      if (checkbox.checked) maybeSaveAIKey(prefix + 'ApiKey', prefix + 'RememberKey', prefix + 'Provider');
    });
  }
}

export function getAIProvider(model) {
  if (model.startsWith('deepseek-')) return 'deepseek';
  return 'dashscope';
}

// ===== API 调用 =====
export async function callAI(prompt, apiKey, model) {
  const provider = getAIProvider(model);

  if (provider === 'deepseek') {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error('请求失败 ('+resp.status+'): '+(data.error?.message || data.error?.code || JSON.stringify(data)));
    }
    return data.choices?.[0]?.message?.content || JSON.stringify(data);
  }

  // DashScope
  const resp = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
    body: JSON.stringify({ model, input: { prompt } })
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error('请求失败 ('+resp.status+'): '+(data.message||data.code||JSON.stringify(data)));
  }
  return data.output && data.output.text ? data.output.text
    : (data.output && data.output.choices && data.output.choices[0] && data.output.choices[0].message ? data.output.choices[0].message.content
      : JSON.stringify(data));
}

async function testAI(apiKey, model) {
  const provider = getAIProvider(model);
  if (provider === 'deepseek') {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: '你好' }] })
    });
    if (!resp.ok) throw new Error('连接失败: '+resp.status);
    return;
  }
  const resp = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
    body: JSON.stringify({ model, input: { prompt: '你好' } })
  });
  if (!resp.ok) throw new Error('连接失败: '+resp.status);
}

// ===== Prompt 文件加载 =====
async function loadPromptFile(fileName, fallbackText) {
  try {
    const resp = await fetch(fileName);
    if (!resp.ok) throw new Error('Not found');
    return await resp.text();
  } catch(e) {
    return fallbackText;
  }
}

// ===== 战场快照构建 =====
function buildBattleSnapshot() {
  const battle = _battleRef;
  if (!battle) return null;
  const lastTurn = battle.turns[battle.turns.length - 1];
  if (!lastTurn) return null;
  const o = lastTurn.outcome, pO = o.player, oO = o.opponent;

  function ex(p, key) {
    const list = p ? (p[key] || p.skills || []) : [];
    if (!Array.isArray(list)) return [];
    return list.map(s => ({'技能名':s.name||'?','系别':s.type||'?','类别':s.category||'?','威力':s.power||'?','能耗':s.energy||'?','效果':s.effect||'?'}));
  }

  const aN = pO.active_pokemon;
  const aD = lastTurn.player.active_pokemon.name === aN ? lastTurn.player.active_pokemon : (lastTurn.player.reserve_pokemon||[]).find(p=>p.name===aN)||null;
  const oaN = oO.active_pokemon;
  const oaD = lastTurn.opponent.active_pokemon.name === oaN ? lastTurn.opponent.active_pokemon : null;

  function fmtStatus(list) {
    return (list||[]).map(s => {
      // marks: positive/negative, status: buff/debuff
      var isPositive = s.type === 'positive' || s.type === 'buff';
      var isNegative = s.type === 'negative' || s.type === 'debuff';
      var prefix = isPositive ? '[正面] ' : (isNegative ? '[负面] ' : '');
      var label = prefix + s.name + ' ' + s.stacks + '层';
      if (s.desc) label += ' — ' + s.desc;
      return {[s.name]: label};
    });
  }

  return {
    '当前回合数': lastTurn.turn_number,
    '我方战场印记': fmtStatus(pO.marks),
    '敌方战场印记': fmtStatus(oO.marks),
    '我方当前在场精灵': {
      '名字': aN, '属性': aD ? aD.type : '?',
      '血脉特性': aD ? '【'+aD.ability_name+'】: '+aD.ability_desc : '?',
      '当前血量': pO.current_hp, '最大血量': pO.max_hp, '能量': pO.current_energy + ' / ' + (pO.max_energy || 10),
      '身上状态': fmtStatus(lastTurn.player.active_pokemon ? lastTurn.player.active_pokemon.status : []),
      '可选技能面板': ex(aD, 'skills')
    },
    '我方备战席剩余精灵': (lastTurn.player.reserve_pokemon||[]).filter(p=>p.name!==aN).map(p=>({
      '名字': p.name, '属性': p.type,
      '血脉特性': '【'+(p.ability_name||'')+'】: '+(p.ability_desc||''),
      '当前血量': p.current_hp, '最大血量': p.max_hp,
      '自身状态': fmtStatus(p.status||[]),
      '复活状态': p.revive_timer && p.revive_timer > 0 ? '⏳还有' + p.revive_timer + '回合复活' : '无',
      '可选技能面板': ex(p, 'skills')
    })).concat(aN && aD && lastTurn.player.active_pokemon.name!==aN ? [{
      '名字': lastTurn.player.active_pokemon.name, '属性': lastTurn.player.active_pokemon.type,
      '血脉特性': '【'+lastTurn.player.active_pokemon.ability_name+'】: '+lastTurn.player.active_pokemon.ability_desc,
      '当前血量': lastTurn.player.active_pokemon.current_hp,
      '自身状态': fmtStatus(lastTurn.player.active_pokemon.status||[]),
      '可选技能面板': ex(lastTurn.player.active_pokemon, 'skills')
    }] : []),
    '敌方当前在场精灵': {
      '名字': oaN, '属性': oaD ? oaD.type : '?',
      '血脉特性': oaD ? '【'+oaD.ability_name+'】: '+oaD.ability_desc : '?',
      '当前血量百分比': oO.current_hp_percentage+'%', '能量': oO.current_energy + ' / 10',
      '身上状态': fmtStatus(lastTurn.opponent.active_pokemon ? lastTurn.opponent.active_pokemon.status : []),
      '可选技能面板': ex(oaD, 'known_skills')
    },
    '敌方备战席剩余精灵': (function(){
      const eReserves = (lastTurn.opponent.reserve_pokemon||[]).filter(p=>p.name!==oaN);
      if (eReserves.length === 0 && !_turnDataRef?.opponent_reserve_known) {
        return [{ '提示': '敌方后备尚未知，将在后续回合换宠时逐步发现' }];
      }
      return eReserves.map(p=>({
        '名字': p.name, '属性': p.type||'?',
        '血脉特性': p.ability_name ? '【'+p.ability_name+'】: '+(p.ability_desc||'') : '?',
        '当前血量百分比': p.current_hp_percentage!=null ? p.current_hp_percentage+'%' : '?',
        '自身状态': fmtStatus(p.status||[]),
        '复活状态': p.revive_timer && p.revive_timer > 0 ? '⏳还有' + p.revive_timer + '回合复活' : '无',
        '可选技能面板': ex(p, 'known_skills')
      }));
    })(),
    '上回合博弈结果反馈': {
      '我方动作': lastTurn.action?.player_action
        ? (lastTurn.action.player_action.type==='use_skill' ? '释放技能'+lastTurn.action.player_action.skill_name : lastTurn.action.player_action.type==='wish_strike' ? '愿力冲击' : '换宠'+(lastTurn.action.player_action.switch_to||'?'))
        : '?',
      '敌方动作效果': oO.action_result || '无'
    }
  };
}

// ===== 计时器 =====
function startWaitTimer(el, prefix, isTextarea) {
  let elapsed = 0;
  const interval = setInterval(() => {
    elapsed++;
    const text = prefix + elapsed + 's)…';
    if (isTextarea) {
      el.value = text;
    } else {
      el.innerHTML = '<span style="color:#7bed9f">' + text + '</span>';
    }
  }, 1000);
  return () => clearInterval(interval);
}

// ===== Battle AI =====
function setAIResult(text, color) {
  const el = document.getElementById('aiResultArea');
  if (!el) return;
  el.innerHTML = text;
  if (color) el.style.color = color; else el.style.color = '#3f3528';
}

export async function runAIAnalysis() {
  maybeSaveAIKey('aiApiKey', 'aiRememberKey', 'aiProvider');
  const apiKey = document.getElementById('aiApiKey').value.trim();
  if (!apiKey) { setAIResult('⚠️ 请先填写 API Key','#c9952e'); return; }
  if (!_battleRef || _battleRef.turns.length === 0) { setAIResult('⚠️ 还没有回合数据','#f39c12'); return; }

  const waitEl = document.getElementById('aiResultArea');
  const stopWait = startWaitTimer(waitEl, '⏳ AI 分析中 (', false);

  const snapshot = buildBattleSnapshot();
  if (!snapshot) { stopWait(); setAIResult('⚠️ 无法构建战场快照','#c9952e'); return; }

  const template = await loadPromptFile('data/prompt_battle_ai.txt', DEFAULT_BATTLE_PROMPT);
  let teamAnalysisText = (_teamConfigRef?.player?.analysis) || '';

  // 补充首领化信息到阵容分析
  const pPets = _teamConfigRef?.player?.pets || [];
  const bossablePets = pPets.filter(p => p.canBossify && p.name && BOSSED_DB[p.name]);
  if (bossablePets.length > 0) {
    teamAnalysisText += '\n\n【👑 可首领化精灵】\n';
    bossablePets.forEach(p => {
      const entry = BOSSED_DB[p.name];
      const bossName = entry.boss_name || '';
      const bossAbility = entry.boss_ability_desc || '';
      teamAnalysisText += p.name + ' 可首领化为 ' + bossName + '\n';
      teamAnalysisText += '  · 首领特性: ' + bossAbility + '\n';
    });
  }

  const prompt = template
    .replace('{{SNAPSHOT}}', JSON.stringify(snapshot, null, 2))
    .replace('{{TEAM_ANALYSIS}}', teamAnalysisText);

  try {
    const text = await callAI(prompt, apiKey, document.getElementById('aiModel').value);
    stopWait();
    setAIResult(text.replace(/\n/g,'<br>').replace(/【/g,'<b>【').replace(/】/g,'】</b>'), '#3f3528');
  } catch(e) {
    stopWait();
    setAIResult('❌ '+e.message,'#c9952e');
  }
}

export function clearAIResult() {
  setAIResult('等待下一回合保存后自动生成分析...','#b09e82');
}

export async function testAIConnection() {
  maybeSaveAIKey('aiApiKey', 'aiRememberKey', 'aiProvider');
  const apiKey = document.getElementById('aiApiKey').value.trim();
  if (!apiKey) { showToast('请先填写 API Key','error'); return; }
  try {
    await testAI(apiKey, document.getElementById('aiModel').value);
    showToast('连接成功 ✓','success');
  } catch(e) {
    showToast(e.message,'error');
  }
}

// ===== Team AI =====
export async function runTeamAnalysis() {
  const tcKeyEl = document.getElementById('tcAiApiKey');
  if (!tcKeyEl.value.trim()) {
    const battleKey = document.getElementById('aiApiKey').value.trim();
    if (battleKey) tcKeyEl.value = battleKey;
  }
  maybeSaveAIKey('tcAiApiKey', 'tcAiRememberKey', 'tcAiProvider');
  const apiKey = tcKeyEl.value.trim();
  if (!apiKey) { showToast('请先填写 API Key','error'); return; }

  // collect team config from the module
  window.collectTeamConfig && window.collectTeamConfig();
  const pets = (_teamConfigRef?.player?.pets) || [];
  const hasAny = pets.some(p => p.name);
  if (!hasAny) { showToast('请至少配置一只我方精灵','error'); return; }

  const teamLines = pets.filter(p => p.name).map((p, i) => {
    const skillsText = (p.skills||[]).filter(s => s && s.name).map(s =>
      '    - ' + s.name + ' [' + (s.category || '?') + '] 威力:' + (s.power || '?') + ' 耗能:' + (s.energy || '?') + (s.effect ? ' → ' + s.effect : '')
    ).join('\n');
    // 首领化信息
    let bossLine = '';
    if (p.canBossify && p.name) {
      const bossEntry = BOSSED_DB[p.name];
      if (bossEntry) {
        const bossName = bossEntry.boss_name || '';
        const bossAbilityDesc = bossEntry.boss_ability_desc || '';
        bossLine = '    👑 可首领化为 ' + bossName + ' → 特性: ' + bossAbilityDesc;
      }
    }
    return (i+1) + '. ' + p.name + ' | ' + (p.ability || '无特性') + (p.ability_effect ? ': ' + p.ability_effect : '') +
      '\n' + (bossLine ? bossLine + '\n' : '') + skillsText;
  }).join('\n');

  const teamTemplate = await loadPromptFile('data/prompt_team_ai.txt', DEFAULT_TEAM_PROMPT);
  const prompt = teamTemplate.replace('{{TEAM_LINES}}', teamLines);

  const textarea = document.getElementById('tcTeamAnalysis');
  if (!textarea) return;
  const stopWait = startWaitTimer(textarea, '⏳ AI 生成分析中 (', true);

  try {
    const text = await callAI(prompt, apiKey, document.getElementById('tcAiModel').value);
    stopWait();
    textarea.value = text;
    showToast('阵容分析已生成','success');
  } catch(e) {
    stopWait();
    textarea.value = '❌ 生成失败: ' + e.message;
    showToast('AI 生成失败: ' + e.message,'error');
  }
}

export async function testTeamAIConnection() {
  const tcKeyEl = document.getElementById('tcAiApiKey');
  if (!tcKeyEl.value.trim()) {
    const battleKey = document.getElementById('aiApiKey').value.trim();
    if (battleKey) tcKeyEl.value = battleKey;
  }
  maybeSaveAIKey('tcAiApiKey', 'tcAiRememberKey', 'tcAiProvider');
  const apiKey = tcKeyEl.value.trim();
  if (!apiKey) { showToast('请先填写 API Key','error'); return; }
  try {
    await testAI(apiKey, document.getElementById('tcAiModel').value);
    showToast('连接成功 ✓','success');
  } catch(e) {
    showToast(e.message,'error');
  }
}
