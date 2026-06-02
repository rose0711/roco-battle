// ============================================================
// csv-loader.js — CSV 数据加载与解析
// ============================================================

import { DATA_PATHS } from './config.js';

// ===== 数据库容器 =====
export const SKILLS_DB = {};    // name -> {技能名,属性,类型,威力,耗能,效果描述}
export const SPRITES_DB = {};   // name -> {name,attributes,ability_name,...}
export const URLS_DB = {};      // name -> {name,type,url,local_path}
export const MARKS_DB = {};     // name -> {name,type,desc}
export const STATUS_DB = {};    // name -> {name,type,desc}
export const BOSSED_DB = {};    // name -> boss_name（可首领化精灵 → 进化形态）
export const LOCAL_PATHS = {};  // "type:name" -> local_path（本地图片路径索引，不再走网络）

export let allSpriteNames = [];
export let allSkillNames = [];

/**
 * 判断精灵是否可首领化，返回首领形态名（不可首领化返回 null）
 */
export function isBossifiable(name) {
  if (!name) return null;
  const entry = BOSSED_DB[name];
  return entry ? (entry.boss_name || null) : null;
}
export let dataLoaded = false;

// 图片路径 → 网络 URL 映射
export const PATH_TO_URL = {};

/**
 * CSV 行解析（支持引号转义）
 */
export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i+1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * 加载单个 CSV 文件
 */
async function loadCSV(url, encoding, db, keyField, processRow) {
  const resp = await fetch(url);
  let buf = await resp.arrayBuffer();
  // 处理 UTF-8 BOM（﻿），浏览器 TextDecoder 不支持 utf-8-sig
  if (encoding === 'utf-8-sig') {
    const bom = new Uint8Array(buf);
    if (bom[0] === 0xEF && bom[1] === 0xBB && bom[2] === 0xBF) {
      buf = buf.slice(3);
    }
    encoding = 'utf-8';
  }
  const decoder = new TextDecoder(encoding);
  const text = decoder.decode(buf);
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] || ''; });
    const key = obj[keyField];
    if (key) {
      if (processRow) processRow(obj);
      db[key] = obj;
    }
  }
}

/**
 * 加载所有数据（在应用初始化时调用）
 */
export async function loadAllData() {
  try {
    await loadCSV(DATA_PATHS.skills, 'utf-8', SKILLS_DB, '技能名', (obj) => {
      allSkillNames.push(obj['技能名']);
    });
    await loadCSV(DATA_PATHS.sprites, 'gbk', SPRITES_DB, 'name', (obj) => {
      allSpriteNames.push(obj['name']);
    });
    await loadCSV(DATA_PATHS.urls, 'utf-8', URLS_DB, 'name', (obj) => {
      if (obj['local_path']) {
        PATH_TO_URL[obj['local_path']] = obj['url'];
        // 按 type:name 建立本地路径索引
        LOCAL_PATHS[obj['type'] + ':' + obj['name']] = obj['local_path'];
      }
      const parts = (obj['local_path'] || '').split('/');
      const fname = parts[parts.length - 1];
      if (fname) PATH_TO_URL[fname] = obj['url'];
    });
    await loadCSV(DATA_PATHS.marks, 'gbk', MARKS_DB, 'name');
    await loadCSV(DATA_PATHS.status, 'gbk', STATUS_DB, 'name');
    await loadCSV(DATA_PATHS.bossed, 'utf-8-sig', BOSSED_DB, 'name');

    dataLoaded = true;
    console.log(`数据加载完成 (${allSpriteNames.length} 精灵, ${allSkillNames.length} 技能)`);
    return true;
  } catch(e) {
    console.error('数据加载失败:', e.message);
    throw e;
  }
}

/**
 * 构建 datalist 元素（精灵名、技能名、印记、状态）
 */
export function buildDatalists() {
  const body = document.body;

  // 精灵名 datalist
  const spriteDatalist = document.getElementById('spriteList');
  if (spriteDatalist) {
    const uniqueSprites = [...new Set(allSpriteNames)].sort();
    uniqueSprites.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      spriteDatalist.appendChild(opt);
    });
  }

  // 技能名 datalist
  const skillDatalist = document.getElementById('skillList');
  if (skillDatalist) {
    const uniqueSkills = [...new Set(allSkillNames)].sort();
    uniqueSkills.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      skillDatalist.appendChild(opt);
    });
  }

  // 印记 datalist
  let marksDatalist = document.createElement('datalist');
  marksDatalist.id = 'marksList';
  Object.keys(MARKS_DB).sort().forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    marksDatalist.appendChild(opt);
  });
  body.appendChild(marksDatalist);

  // 状态 datalist
  const statusDatalist = document.createElement('datalist');
  statusDatalist.id = 'statusList';
  Object.keys(STATUS_DB).sort().forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    statusDatalist.appendChild(opt);
  });
  body.appendChild(statusDatalist);
}
