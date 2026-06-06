// ============================================================
// main.js — 应用入口
// ============================================================

// ===== 1. 基础层 =====
import { loadAllData, buildDatalists, dataLoaded } from './csv-loader.js';
import { showToast, autoFillSkill, getImageURL, updateSkillInfoDisplay, updateSpriteImage, toggleSection, updateHPDisplay } from './utils.js';
import { store } from './store.js';

// ===== 2. 状态管理 & 核心引擎 =====
import { battle, turnData, currentTurnNumber, initTurnData, setTeamConfigRef, getTeamConfigRef, getBattleRef, renderTurn, renderPlayerReserve, renderPlayerActive, renderOpponentActive, renderOpponentReserve, renderOpponentSkills, inheritFromOutcome } from './battle-engine.js';

// ===== 3. 视图模块 =====
import { teamConfig, renderTeamConfigSlots, collectTeamConfig } from './team-config-view.js';
import {
  autoFillPlayer, autoFillOpponent, autoFillOpponentReserve,
  updatePlayerActionUI, updateOpponentActionUI, toggleOpponentSwitchManual, addOpponentSkill,
  updateOutcomeResult, updateDamageAuto, updateOcMaxHpDisplay,
  syncSideToOutcome, syncActiveToOutcome, renderOutcome, renderActions, refreshOutcome,
  toggleDeathRow, clearOutcomeFields
} from './battle-view.js';

// ===== 4. 文件 IO & AI =====
import { setBattleRef as setFileIoBattleRef, setOnLoadCallback } from './file-io.js';
import {
  setBattleRef as setAiBattleRef,
  setTeamConfigRef as setAiTeamConfigRef,
  setTurnDataRef as setAiTurnDataRef,
  populateModels, onProviderChange, hookProviderSync, loadAIKey,
  runAIAnalysis, clearAIResult, runTeamAnalysis, runTeamAnalysisPrecise,
  setTrialMode, initTrialMode, toggleTrial, clearSavedAIKeys
} from './ai-client.js';

// ===== 5. 印记 & 状态 =====
import { renderMarksStatus, updateMsActivePokemon, collectContainer } from './status-system.js';

// ===== 初始化：设置跨模块引用 =====
setTeamConfigRef(teamConfig);
setFileIoBattleRef(battle);
setAiBattleRef(battle);
setAiTeamConfigRef(teamConfig);

// 初始化试用模式（从 sessionStorage 恢复）
initTrialMode();

// 载入存档后的状态恢复回调
setOnLoadCallback(async function(data) {
  // 清空当前对战，载入存档数据
  battle.battle_id = data.battle_id;
  battle.turns = data.turns;
  currentTurnNumber = battle.turns.length + 1;
  document.getElementById('turnBadge').textContent = currentTurnNumber;
  document.getElementById('turnLabel').textContent = '第 ' + currentTurnNumber + ' 回合';
  document.getElementById('battleIdLabel').textContent = '对战 #' + battle.battle_id;

  document.getElementById('teamConfigView').style.display = 'none';
  document.getElementById('battleView').style.display = 'block';

  if (battle.turns.length > 0) {
    const lastTurn = battle.turns[battle.turns.length - 1];
    document.getElementById('playerHP').value = lastTurn.game_state.player_hp;
    document.getElementById('opponentHP').value = lastTurn.game_state.opponent_hp;
    inheritFromOutcome(lastTurn);
    renderTurn();
    window.updateOutcomeResult && window.updateOutcomeResult();
    document.getElementById('ocPrevPHp').textContent = document.getElementById('pCurrHP').value || '-';
    document.getElementById('ocPrevOHp').textContent = document.getElementById('oCurrHP').value || '-';
    document.getElementById('btnPrev').disabled = false;
  }

  showToast('载入成功，共 ' + battle.turns.length + ' 回合', 'success');
  updateHPDisplay();
});

// 导出 CSS 需要的函数到 window
window.updateSkillInfoDisplay = updateSkillInfoDisplay;
window.getImageURL = getImageURL;
window.updateSpriteImage = updateSpriteImage;
window.toggleSection = toggleSection;
window.updateHPDisplay = updateHPDisplay;
window.autoFillSkill = autoFillSkill;
window.updateOutcomeResult = updateOutcomeResult;

window.runAIAnalysis = runAIAnalysis;
window.clearAIResult = clearAIResult;
window.runTeamAnalysis = runTeamAnalysis;
window.runTeamAnalysisPrecise = runTeamAnalysisPrecise;
window.toggleTrial = toggleTrial;
window.clearSavedAIKeys = clearSavedAIKeys;
window.onProviderChange = onProviderChange;
window.renderMarksStatus = renderMarksStatus;
window.updateMsActivePokemon = updateMsActivePokemon;
window.collectContainer = collectContainer;
window.SKILLS_DB = SKILLS_DB;  // for addOpponentSkill check

// ===== 导出 CSV 数据供 battle-view/ai-client 通过 window 访问 =====
import { SKILLS_DB } from './csv-loader.js';

// ===== 应用启动 =====
async function init() {
  try {
    await loadAllData();
    buildDatalists();

    renderTeamConfigSlots();
    initTurnData();
    document.getElementById('turnBadge').textContent = '1';
    clearOutcomeFields();

    // 初始化 AI 模型选择
    populateModels('ai');
    populateModels('tcAi');
    loadAIKey('aiApiKey', 'aiProvider', 'aiRememberKey');
    loadAIKey('tcAiApiKey', 'tcAiProvider', 'tcAiRememberKey');
    hookProviderSync('ai');
    hookProviderSync('tcAi');

    // 设置 turnData 引用供 ai-client 使用
    // 通过定期同步（或直接引用）保持最新
    // 由于 turnData 是源码级引用（import 获取的是模块内变量引用），
    // 在 battle-engine 中更新后，ai-client 需要能访问最新值
    // 简单方案：每次访问前重新获取
    // 更好的方案：使用 getter
    Object.defineProperty(window, '_turnDataRef', {
      get: () => turnData,
      configurable: true
    });
    setAiTurnDataRef(turnData);

    showToast('数据加载完成', 'success');
  } catch(e) {
    showToast('数据加载失败: ' + e.message, 'error');
  }
}

// DOMContentLoaded 时启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
