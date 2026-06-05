// ============================================================
// config.js — 常量、默认值、API 配置
// ============================================================

/** API 提供商 → 可用模型映射 */
export const PROVIDER_MODELS = {
  dashscope: [
    { value: 'qwen-plus', label: 'qwen-plus' },
    { value: 'qwen-max', label: 'qwen-max' },
    { value: 'qwen-turbo', label: 'qwen-turbo' }
  ],
  deepseek: [
    { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    { value: 'deepseek-reasoner', label: 'deepseek-v4-pro' }
  ]
};

/** 试用模式 - Cloudflare Worker 代理地址（留空则不可用） */
export const TRIAL_WORKER_URL = 'https://bitter-limit-18b6.951026391.workers.dev';

/** CSV 文件路径映射（相对于 index.html） */
export const DATA_PATHS = {
  skills: 'data/skills.csv',
  sprites: 'data/sprites.csv',
  urls: 'data/urls.csv',
  marks: 'data/marks.csv',
  status: 'data/status.csv',
  bossed: 'data/Bossed.csv'
};

/** 默认 AI Prompt（文件不可用时 fallback） */
export const DEFAULT_BATTLE_PROMPT = `你是一个精通《洛克王国》对战的回合制游戏策略专家。
请根据以下给出的核心规则以及当前回合结束后的战场局势快照，为我方在下一回合的行动做出深度推演，给出明确指令。

==== 战场快照 ====
{{SNAPSHOT}}

==== 我方阵容分析 ====
{{TEAM_ANALYSIS}}

请按以下框架分析：
1. 局势痛点深度剖析（状态印记、血脉连锁、攻防匹配）
2. 敌方行动博弈预测（技能能量、战术意图、备战席联动）
3. 我方行动方案推演（留场、换宠、聚能）
4. 最终决策指令——格式：
【最终决策：使用技能"XXX"】 或 【最终决策：更换精灵为"XXX"】 或 【最终决策：选择聚能】`;

export const DEFAULT_TEAM_PROMPT = `你是一位顶级的《洛克王国世界》6v6战术分析师。
请根据下面我方6只精灵的完整配置，分析阵容打法，明确指出：

1. **主力输出**（谁担任主攻手，为什么）
2. **辅助/挂buff手**（谁为队友提供增益、续航或控场，特别注意一些特性对主攻手的加成）
3. **联防/抗伤位**（谁负责承受伤害、切换吃技能、反制敌方）
4. **战术轮转思路**（如何换宠等）

请给出清晰的分工和理由，基于属性克制、技能效果、血脉特性综合判断。总字数不超过500字。

==== 我方阵容 ====
{{TEAM_LINES}}`;

/** 默认精确阵容分析 Prompt（文件不可用时 fallback） */
export const DEFAULT_TEAM_PRECISE_PROMPT = `你是一位顶级的《洛克王国：世界》6v6战术分析师。

下面是对同一套我方阵容的三次独立分析结果。请仔细阅读这三份分析：

==== 第一次分析 ====
{{ANALYSIS_1}}

==== 第二次分析 ====
{{ANALYSIS_2}}

==== 第三次分析 ====
{{ANALYSIS_3}}

请对以上三次分析进行交叉校验和整合，生成一份更精确、更完整的阵容分析报告。

要求：
1. 找出三次分析中一致的观点，强化确认
2. 识别存在分歧或矛盾的地方，根据精灵特性、技能效果、属性克制关系给出你的判断
3. 补充任何被遗漏的关键信息
4. 整合为一份完整、连贯的最终分析

按以下结构输出：

1. **主力输出**：[指明主攻手，说明判断依据]
2. **辅助/挂buff手**：[指明辅助精灵及配合方式]
3. **联防/抗伤位**：[指明抗伤精灵及战术定位]
4. **战术轮转思路**：[整体节奏、核心连招或换人逻辑]

总字数不超过500字。`;
