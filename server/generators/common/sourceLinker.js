'use strict';

function formatSourceLink(dataPoint, dataSource) {
  const trustLabel = dataSource ? dataSource.trust_level : '未知来源';
  const refId = dataPoint.ref_id || 'REF-UNKNOWN';
  return `[来源: ${refId} | ${trustLabel}]`;
}

function injectSourceAnnotation(textRun, dataPoint, dataSource) {
  const link = formatSourceLink(dataPoint, dataSource);
  return {
    text: dataPoint.label + ': ' + dataPoint.value + (dataPoint.unit ? dataPoint.unit : ''),
    sourceAnnotation: link,
    refId: dataPoint.ref_id,
    trustLevel: dataSource ? dataSource.trust_level : '未知来源',
    sourceTitle: dataSource ? dataSource.title : '',
  };
}

function buildReferencesTable(dataPoints, dataSources) {
  const sourceMap = {};
  if (dataSources) {
    dataSources.forEach((s) => { sourceMap[s.id] = s; });
  }
  return dataPoints.map((dp) => ({
    refId: dp.ref_id,
    label: dp.label,
    value: dp.value + (dp.unit || ''),
    sourceTitle: (sourceMap[dp.source_id] || {}).title || '未知',
    trustLevel: (sourceMap[dp.source_id] || {}).trust_level || '未知来源',
    sourceRefId: (sourceMap[dp.source_id] || {}).ref_id || '',
  }));
}

module.exports = { formatSourceLink, injectSourceAnnotation, buildReferencesTable };
