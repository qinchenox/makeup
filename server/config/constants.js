const ROLES = { ADMIN: 'admin', EDITOR: 'editor', VIEWER: 'viewer' };

const TRUST_LEVELS = {
  INTERNAL: '内部资料',
  PUBLIC: '行业公开',
  USER: '用户提供',
};

const DOC_TYPES = { PPTX: 'pptx', DOCX: 'docx' };

const DOC_STATUS = {
  DRAFT: 'draft',
  GENERATING: 'generating',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

const AUDIT_ACTIONS = {
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  DATASOURCE_UPLOAD: 'datasource_upload',
  DATASOURCE_VIEW: 'datasource_view',
  DATASOURCE_EDIT: 'datasource_edit',
  DATASOURCE_DELETE: 'datasource_delete',
  DATAPOINT_EXTRACT: 'datapoint_extract',
  DOCUMENT_GENERATE: 'document_generate',
  DOCUMENT_DOWNLOAD: 'document_download',
  DOCUMENT_PREVIEW: 'document_preview',
  USER_CREATE: 'user_create',
  USER_EDIT: 'user_edit',
  USER_DISABLE: 'user_disable',
  SETTINGS_CHANGE: 'settings_change',
  CONTENT_SCAN_BLOCKED: 'content_scan_blocked',
};

const SEVERITY_LEVELS = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' };

const CATEGORIES = [
  { name: '市场数据', name_zh: '市场数据' },
  { name: '研发配方', name_zh: '研发配方' },
  { name: '安全检测', name_zh: '安全检测' },
  { name: '法规政策', name_zh: '法规政策' },
  { name: '消费者调研', name_zh: '消费者调研' },
  { name: '销售数据', name_zh: '销售数据' },
  { name: '竞品分析', name_zh: '竞品分析' },
  { name: '其他', name_zh: '其他' },
];

module.exports = {
  ROLES, TRUST_LEVELS, DOC_TYPES, DOC_STATUS, AUDIT_ACTIONS, SEVERITY_LEVELS, CATEGORIES,
};
