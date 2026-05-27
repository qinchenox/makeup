'use strict';

// Column semantic detection — maps Chinese/English column names to semantic types
const COLUMN_SEMANTICS = {
  // Product/ingredient names
  product: { keys: ['产品', '商品', '品名', '名称', '品牌', '成分', '原料', 'product', 'name', 'brand', 'ingredient'], type: 'identifier', icon: 'tag' },
  // Sales metrics
  sales: { keys: ['销量', '销售', '卖出', '出售', 'sales', 'volume', 'sold', 'revenue'], type: 'metric', unit: '件', icon: 'chart' },
  revenue: { keys: ['收入', '营收', '金额', '价格', '单价', 'revenue', 'price', 'amount', 'value'], type: 'metric', unit: '元', icon: 'dollar' },
  // Percentage metrics
  rate: { keys: ['率', '占比', '比例', '百分', 'rate', 'ratio', 'percent', '%', 'percentage'], type: 'percentage', unit: '%', icon: 'pie' },
  // Satisfaction/survey
  satisfaction: { keys: ['满意', '好评', '评分', '得分', '评价', 'satisfaction', 'score', 'rating', 'review'], type: 'metric', unit: '分', icon: 'star' },
  // Complaint
  complaint: { keys: ['投诉', '抱怨', '不满', '客诉', 'complaint', 'issue', 'problem'], type: 'metric', unit: '次', icon: 'warning' },
  // Growth/trend
  growth: { keys: ['增长', '上涨', '环比', '同比', '趋势', '变化', 'growth', 'increase', 'trend', 'change', '涨', '升'], type: 'percentage', unit: '%', icon: 'rise' },
  // Market
  market: { keys: ['市场', '行业', '份额', '占有率', 'market', 'share', 'industry'], type: 'percentage', unit: '%', icon: 'global' },
  // Ingredient concentration
  concentration: { keys: ['含量', '浓度', '添加量', '剂量', '浓度', 'concentration', 'content', 'dose'], type: 'percentage', unit: '%', icon: 'experiment' },
  // Customer
  customer: { keys: ['客户', '用户', '消费者', '会员', 'customer', 'user', 'consumer', 'member'], type: 'count', unit: '人', icon: 'user' },
  // Date/time
  date: { keys: ['日期', '时间', '月份', '季度', '年份', 'date', 'time', 'month', 'quarter', 'year', 'Q1', 'Q2', 'Q3', 'Q4'], type: 'date', icon: 'calendar' },
  // Region
  region: { keys: ['地区', '区域', '省份', '城市', '国家', 'region', 'area', 'city', 'country'], type: 'category', icon: 'location' },
  // Target/goal
  target: { keys: ['目标', '指标', 'KPI', '计划', '预算', 'target', 'goal', 'kpi', 'plan', 'budget'], type: 'metric', icon: 'aim' },
};

const COSMETIC_KEYWORDS = [
  '敏感肌', '干性', '油性', '混合性', '痘痘', '痤疮', '粉刺', '黑头', '白头',
  '美白', '淡斑', '祛斑', '防晒', '抗老', '抗皱', '紧致', '保湿', '补水',
  '修复', '舒缓', '镇静', '抗氧化', '抗炎', '去角质', '清洁', '控油',
  '神经酰胺', '角鲨烷', '烟酰胺', '玻尿酸', '透明质酸', '胶原蛋白', '胜肽',
  '视黄醇', '维C', '维E', '水杨酸', '果酸', '红没药醇', '积雪草', '氨基酸',
  '面霜', '精华', '乳液', '爽肤水', '洁面', '面膜', '眼霜', '防晒霜',
  '成分党', '纯净美妆', '功效护肤', '医美', '轻医美', '药妆',
];

function analyzeColumns(columns) {
  const analysis = [];
  for (const col of columns) {
    const colLower = col.toLowerCase();
    let bestMatch = { type: 'text', icon: 'file', unit: '', confidence: 0 };

    for (const [_, sem] of Object.entries(COLUMN_SEMANTICS)) {
      for (const key of sem.keys) {
        if (colLower.includes(key) || key.includes(colLower)) {
          const conf = Math.max(key.length / Math.max(colLower.length, key.length), 0.5);
          if (conf > bestMatch.confidence) {
            bestMatch = { ...sem, confidence: Math.round(conf * 100) };
          }
        }
      }
    }
    analysis.push({ column: col, ...bestMatch });
  }
  return analysis;
}

function extractUnit(value) {
  const v = String(value || '').trim();
  if (/%|％/.test(v)) return { value: v.replace(/[%％]/g, ''), unit: '%' };
  if (/[¥￥]/.test(v)) return { value: v.replace(/[¥￥]/g, ''), unit: '¥' };
  if (/\$/.test(v)) return { value: v.replace(/\$/g, ''), unit: '$' };
  if (/元/.test(v)) return { value: v.replace(/元/g, ''), unit: '元' };
  if (/万/.test(v)) return { value: v.replace(/万/g, ''), unit: '万' };
  if (/亿/.test(v)) return { value: v.replace(/亿/g, ''), unit: '亿' };
  if (/分$/.test(v) && !isNaN(parseFloat(v))) return { value: v.replace(/分$/, ''), unit: '分' };
  if (/次$/.test(v) && !isNaN(parseFloat(v))) return { value: v.replace(/次$/, ''), unit: '次' };
  if (/人$/.test(v) && !isNaN(parseFloat(v))) return { value: v.replace(/人$/, ''), unit: '人' };
  if (/件$/.test(v) && !isNaN(parseFloat(v))) return { value: v.replace(/件$/, ''), unit: '件' };
  return { value: v, unit: '' };
}

function scoreDataQuality(point) {
  let score = 100;
  const issues = [];
  if (!point.value || point.value === '0' || point.value === '0.0') { score -= 30; issues.push('零值数据'); }
  if (point.value && isNaN(parseFloat(String(point.value).replace(/[,，]/g, '')))) { score -= 20; issues.push('非数值'); }
  if (!point.label || point.label.length < 2) { score -= 15; issues.push('标签过短'); }
  return { score: Math.max(0, score), issues, level: score >= 80 ? 'good' : score >= 50 ? 'warning' : 'poor' };
}

function extractInsights(points, columnAnalysis) {
  const numericPoints = points.filter(p => {
    const v = parseFloat(String(p.value || '').replace(/[,，%％]/g, ''));
    return !isNaN(v);
  });

  const insights = [];

  if (numericPoints.length >= 2) {
    const values = numericPoints.map(p => parseFloat(String(p.value).replace(/[,，%％]/g, '')));
    const max = Math.max(...values);
    const min = Math.min(...values);
    const maxPoint = numericPoints.find(p => parseFloat(String(p.value).replace(/[,，%％]/g, '')) === max);
    const minPoint = numericPoints.find(p => parseFloat(String(p.value).replace(/[,，%％]/g, '')) === min);

    insights.push({
      type: 'range', title: '数据范围',
      detail: `最高: ${maxPoint?.label} (${maxPoint?.value}), 最低: ${minPoint?.label} (${minPoint?.value})`,
      max, min,
    });

    if (numericPoints.length >= 3) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      insights.push({ type: 'average', title: '平均值', detail: `${avg.toFixed(2)}`, avg });

      // Detect outliers
      const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
      const outliers = numericPoints.filter(p => Math.abs(parseFloat(String(p.value).replace(/[,，%％]/g, '')) - avg) > 2 * stdDev);
      if (outliers.length) {
        insights.push({
          type: 'anomaly', title: '异常数据',
          detail: `检测到 ${outliers.length} 个异常值: ${outliers.map(p => p.label + '=' + p.value).join(', ')}`,
          level: 'warning',
        });
      }
    }
  }

  // Keyword extraction
  const allText = points.map(p => p.label + ' ' + p.value).join(' ');
  const keywords = COSMETIC_KEYWORDS.filter(kw => allText.includes(kw));
  if (keywords.length) {
    insights.push({ type: 'keywords', title: '美妆关键词', detail: keywords.join('、'), keywords });
  }

  // Column analysis insight
  const metricCols = (columnAnalysis || []).filter(c => c.type === 'metric' || c.type === 'percentage');
  if (metricCols.length) {
    insights.push({
      type: 'structure', title: '数据结构',
      detail: `识别到 ${metricCols.length} 个量化指标: ${metricCols.map(c => c.column).join(', ')}`,
    });
  }

  return insights;
}

function generateSummary(title, points, insights, columnAnalysis) {
  const parts = [];
  parts.push(`数据源「${title}」包含 ${points.length} 个数据点。`);

  const idCols = (columnAnalysis || []).filter(c => c.type === 'identifier');
  if (idCols.length) parts.push(`主要识别维度: ${idCols.map(c => c.column).join('、')}。`);

  const metricCols = (columnAnalysis || []).filter(c => c.type === 'metric' || c.type === 'percentage');
  if (metricCols.length) parts.push(`量化指标: ${metricCols.map(c => c.column).join('、')}。`);

  const anomalies = insights.filter(i => i.type === 'anomaly');
  if (anomalies.length) parts.push(`⚠ 检测到 ${anomalies.length} 类异常数据，建议人工核实。`);

  const keywords = insights.find(i => i.type === 'keywords');
  if (keywords && keywords.keywords) {
    parts.push(`关联美妆概念: ${keywords.keywords.slice(0, 8).join('、')}。`);
  }

  return parts.join('');
}

module.exports = { analyzeColumns, extractUnit, scoreDataQuality, extractInsights, generateSummary, COLUMN_SEMANTICS, COSMETIC_KEYWORDS };
