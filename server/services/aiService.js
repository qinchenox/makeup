'use strict';

const OpenAI = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT, CHAPTER_PROMPT, PPT_STRUCTURE_PROMPT, VERIFY_PROMPT, DESIGNER_PROMPT, CLARIFY_PROMPT } = require('./agentRules.js');

// DeepSeek native (OpenAI-compatible) — primary
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-aeb70234e3a84f79b374109b361fcfaf',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
});

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// Anthropic-compatible (fallback)
const anthropic = new Anthropic({
  apiKey: process.env.DEEPSEEK_ANTHROPIC_KEY || 'sk-09dc3a2a37ca4468ab0e75c7a0d339c2',
  baseURL: process.env.DEEPSEEK_ANTHROPIC_URL || 'https://api.deepseek.com/anthropic',
});

async function askAI(systemPrompt, userPrompt, maxTokens = 2000) {
  // Try DeepSeek native first
  try {
    const res = await deepseek.chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return res.choices[0]?.message?.content || '';
  } catch (err) {
    console.error('[AI] DeepSeek native error:', err.message);
    // Fallback to Anthropic-compatible
    try {
      const msg = await anthropic.messages.create({
        model: 'deepseek-chat',
        max_tokens: maxTokens,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      return msg.content[0]?.text || '';
    } catch (err2) {
      console.error('[AI] Anthropic fallback also failed:', err2.message);
      return null;
    }
  }
}

function parseJSON(text) {
  if (!text) return null;
  const clean = text.replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

async function analyzeContent(title, rawText, dataSummary) {
  const prompt = `分析以下文件内容并输出结构化洞察。

【文件标题】${title}
【数据摘要】${dataSummary}
【原始文本】${rawText.substring(0, 4000)}

输出JSON:
{
  "summary": "200字内专业摘要",
  "topics": ["主题标签"],
  "dataStats": {"totalMetrics": 0, "numericCount": 0, "textCount": 0},
  "sections": [{"title": "段落主题", "content": "核心内容", "keyData": ["关键数据"]}],
  "keywords": ["关键词"],
  "category": "市场数据|研发配方|销售数据|消费者调研|竞品分析|其他",
  "suggestedUse": "建议用途",
  "qualityNote": "数据质量说明",
  "recommendations": ["建议"]
}`;
  return parseJSON(await askAI(SYSTEM_PROMPT, prompt, 2000));
}

async function structureForPPT(title, rawText) {
  return parseJSON(await askAI(SYSTEM_PROMPT, PPT_STRUCTURE_PROMPT(title, rawText), 3000));
}

async function generateDocContent(title, instruction, dataPoints) {
  const dataText = dataPoints.map(p => `- ${p.label}: ${p.value}${p.unit||''} [${p.ref_id}]`).join('\n');
  return parseJSON(await askAI(SYSTEM_PROMPT, CHAPTER_PROMPT(title, instruction, dataText), 4000));
}

async function smartCategorize(title, sampleData) {
  const text = await askAI(SYSTEM_PROMPT,
    `判断以下数据源的化妆品行业分类（仅输出一个分类名称）：\n标题：${title}\n样本：${JSON.stringify(sampleData).substring(0, 1000)}\n\n分类选项：市场数据、研发配方、安全检测、法规政策、消费者调研、销售数据、竞品分析、其他`, 50);
  return (text || '其他').trim();
}

async function verifyReportSources(reportContent, sourceLinks) {
  return parseJSON(await askAI(SYSTEM_PROMPT, VERIFY_PROMPT(reportContent, JSON.stringify(sourceLinks)), 1000));
}

module.exports = { analyzeContent, structureForPPT, generateDocContent, smartCategorize, verifyReportSources, askAI, parseJSON };
