import { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Button, Upload, Table, Tag, message, Space, Row, Col, Input, Radio, Badge, Steps, Result, Progress, Modal, Checkbox, Select } from 'antd';
import { InboxOutlined, ThunderboltOutlined, DatabaseOutlined, FileTextOutlined, DeleteOutlined, ReloadOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import client from '../api/client.js';

const { Title, Text } = Typography;
const { Dragger } = Upload;

function getTemplateColor(name) {
  const map = {
    'business-blue': '#1E3A5F', 'beauty-pink': '#DB2777', 'academic-white': '#374151',
    'sugar_rush': '#FF6B6B', 'swiss_grid': '#1A1A2E', 'global_ai': '#38BDF8',
    'indie_bookstore': '#5C4033', 'glassmorphism': '#6366F1', 'pritzker': '#2D2D2D',
  };
  return map[name] || '#4F46E5';
}

export default function KnowledgePage() {
  const [entries, setEntries] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [docType, setDocType] = useState('pptx');
  const [template, setTemplate] = useState('business-blue');
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [progress, setProgress] = useState({ stage: '', progress: 0, message: '' });
  const [progressOpen, setProgressOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [step, setStep] = useState(1); // 1=configure, 2=outline, 3=generate
  const [outline, setOutline] = useState(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [templates, setTemplates] = useState([]);

  // Load templates on mount
  useEffect(() => {
    client.get('/knowledge/templates').then(res => {
      setTemplates(res.data.templates || []);
    }).catch(() => {});
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/knowledge');
      setEntries(res.data.data || []);
    } catch (_) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleUpload = async (file) => {
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name.replace(/\.[^.]+$/, ''));
      const res = await client.post('/knowledge/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const analysis = res.data.analysis || {};
      setUploadResult({
        title: res.data.entry?.title || file.name,
        ...analysis,
      });
      message.success(`AI 已梳理完成: ${(analysis.summary || '').substring(0, 50)}...`);
      fetchEntries();
    } catch (err) {
      message.error(err.response?.data?.error || '上传失败');
    } finally { setUploading(false); }
    return false;
  };

  // Step 1→2: Generate outline
  const handleGenerateOutline = async () => {
    if (!selectedIds.length) { message.error('请选择知识库资料'); return; }
    if (!title.trim()) { message.error('请输入文档标题'); return; }
    setOutlineLoading(true);
    try {
      // Step 1: Ask designer agent to clarify
      const clarifyRes = await client.post('/knowledge/clarify', { title, source_ids: selectedIds, instruction });

      if (clarifyRes.data?.needsClarification) {
        // Show clarifying questions
        setOutline({
          _clarify: true,
          questions: clarifyRes.data.questions || [],
          suggestedAudience: clarifyRes.data.suggestedAudience,
          suggestedStyle: clarifyRes.data.suggestedStyle,
          _title: title,
          _sourceIds: selectedIds,
          _instruction: instruction,
        });
        setStep(2);
        message.info('请回答以下问题以优化PPT内容');
        setOutlineLoading(false);
        return;
      }

      // Step 2: Generate outline
      const res = await client.post('/knowledge/outline', { title, source_ids: selectedIds, instruction });
      setOutlineFromResponse(res.data, title);
      setStep(3);
      message.success(`大纲已生成`);
    } catch (err) {
      message.error('大纲生成失败: ' + (err.response?.data?.error || err.message));
    } finally { setOutlineLoading(false); }
  };

  // Handle answering clarification questions
  const handleSubmitAnswers = async () => {
    const answers = {};
    for (const q of (outline?.questions || [])) {
      answers[q.id] = document.getElementById('clarify-q-' + q.id)?.value || '';
    }
    setOutlineLoading(true);
    try {
      const res = await client.post('/knowledge/outline', {
        title: outline._title, source_ids: outline._sourceIds,
        instruction: outline._instruction, answers,
      });
      setOutlineFromResponse(res.data, outline._title);
      setStep(3);
      message.success('大纲已生成');
    } catch (err) {
      message.error('生成失败');
    } finally { setOutlineLoading(false); }
  };

  function setOutlineFromResponse(data, title) {
    const d = data?.outline || data;
    setOutline({
      theme: d?.theme || title,
      totalSlides: d?.slides?.length || d?.totalSlides || 3,
      slides: d?.slides || [
        { pageNum: 1, title, layout: 'cover', purpose: '封面', keyContent: title },
        { pageNum: 2, title: '内容', layout: 'content', purpose: '主体', keyContent: '' },
        { pageNum: 3, title: '总结', layout: 'conclusion', purpose: '结尾', keyContent: '' },
      ],
      colorScheme: d?.colorScheme || '',
      designNotes: d?.designNotes || '',
    });
  }

  // Step 2→3: Generate from outline
  const handleGenerateFromOutline = async () => {
    if (!outline?.slides?.length) { message.error('大纲无效'); return; }
    setGenerating(true);
    try {
      const res = await client.post('/knowledge/generate-from-outline', {
        title, doc_type: docType, template_name: template,
        outline, source_ids: selectedIds, instruction,
      }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', title + (docType === 'pptx' ? '.pptx' : '.docx'));
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);

      message.success('PPT 已生成并下载');
      setStep(1);
      setOutline(null);
    } catch (err) {
      message.error('生成失败');
    } finally { setGenerating(false); }
  };

  // Edit a slide in the outline
  const updateSlide = (idx, field, value) => {
    const updated = { ...outline };
    updated.slides = [...updated.slides];
    updated.slides[idx] = { ...updated.slides[idx], [field]: value };
    setOutline(updated);
  };

  const handlePreview = async () => {
    if (!selectedIds.length) { message.error('请选择知识库资料'); return; }
    try {
      const res = await client.post('/knowledge/preview', { title: title || '预览', source_ids: selectedIds, instruction });
      setPreviewData(res.data);
      setPreviewOpen(true);
    } catch (err) {
      message.error('预览失败');
    }
  };

  const handleGenerate = async () => {
    if (!selectedIds.length) { message.error('请选择知识库资料'); return; }
    if (!title.trim()) { message.error('请输入文档标题'); return; }
    setGenerating(true);
    setResult(null);

    if (batchMode) {
      // Batch: PPTX + DOCX with SSE progress
      try {
        const res = await client.post('/knowledge/batch-generate', {
          title, template_name: template, instruction, source_ids: selectedIds,
        });
        const { jobId } = res.data;
        setProgress({ stage: 'queued', progress: 0, message: '排队中...' });
        setProgressOpen(true);

        // Listen to SSE
        const evtSource = new EventSource(`/api/knowledge/progress/${jobId}`);
        evtSource.onmessage = (e) => {
          const data = JSON.parse(e.data);
          setProgress(data);
          if (data.stage === 'done') {
            evtSource.close();
            setProgressOpen(false);
            message.success('PPTX + DOCX 生成完成');
            // Download both
            window.open(`/api/knowledge/download/pptx/${jobId}`);
            setTimeout(() => window.open(`/api/knowledge/download/docx/${jobId}`), 500);
            setResult({ success: true, filename: title + '.pptx + .docx' });
            setGenerating(false);
          } else if (data.stage === 'failed') {
            evtSource.close();
            setProgressOpen(false);
            message.error(data.error || '生成失败');
            setGenerating(false);
          }
        };
        evtSource.onerror = () => { evtSource.close(); setProgressOpen(false); setGenerating(false); };
      } catch (err) {
        message.error('启动批量生成失败');
        setGenerating(false);
      }
    } else {
      // Single generation
      try {
        const res = await client.post('/knowledge/generate', {
          title, doc_type: docType, template_name: template,
          instruction, source_ids: selectedIds,
        }, { responseType: 'blob' });

        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', title + (docType === 'pptx' ? '.pptx' : '.docx'));
        document.body.appendChild(link); link.click(); link.remove();
        window.URL.revokeObjectURL(url);

        setResult({ success: true, filename: title + (docType === 'pptx' ? '.pptx' : '.docx') });
        message.success('文档已生成并下载');
      } catch (err) {
        let errorMsg = '生成失败';
        try {
          if (err.response?.data instanceof Blob) {
            const text = await err.response.data.text();
            errorMsg = JSON.parse(text).error || errorMsg;
          }
        } catch (_) {}
        setResult({ success: false, error: errorMsg });
        message.error(errorMsg);
      } finally { setGenerating(false); }
    }
  };

  const handleDelete = async (id) => {
    await client.delete(`/knowledge/${id}`);
    message.success('已删除');
    fetchEntries();
  };

  const columns = [
    {
      title: '知识库资料', dataIndex: 'title', key: 'title', ellipsis: true,
      render: (v, r) => {
        const meta = typeof r.metadata_json === 'string' ? JSON.parse(r.metadata_json || '{}') : (r.metadata_json || {});
        return (
          <Space direction="vertical" size={0}>
            <Text strong>{v}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.file_type?.toUpperCase()} · {meta.rowCount || '?'} 行
              {meta.keywords?.length ? ' · ' + meta.keywords.slice(0, 4).join('、') : ''}
            </Text>
          </Space>
        );
      },
    },
    { title: '时间', dataIndex: 'created_at', key: 'time', width: 160, render: v => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    {
      title: '操作', key: 'act', width: 80,
      render: (_, r) => <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />,
    },
  ];

  return (
    <div>
      <Title level={4}><DatabaseOutlined /> 知识库与文档生成</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        上传文件 → AI 自动分析 → 生成文档（无需选数据点）
      </Text>

      <Row gutter={16}>
        <Col span={10}>
          <Card title="资料上传" size="small">
            <Dragger beforeUpload={handleUpload} showUploadList={false} accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg"
              disabled={uploading}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{uploading ? 'AI 分析中...' : '点击或拖拽文件上传'}</p>
              <p className="ant-upload-hint">PDF / Word / Excel / CSV / 图片</p>
            </Dragger>
            {uploadResult && (
              <Card size="small" style={{ marginTop: 12, background: '#F0FDF4', border: '1px solid #BBF7D0' }} title={
                <Space><Tag color="success">AI 已梳理</Tag><Text strong>{uploadResult.title}</Text></Space>
              }>
                <Text>{uploadResult.summary}</Text>
                {uploadResult.topics?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>主题标签: </Text>
                    {uploadResult.topics.map((t, i) => <Tag key={i} color="blue" style={{ fontSize: 11 }}>{t}</Tag>)}
                  </div>
                )}
                <Row gutter={8} style={{ marginTop: 8 }}>
                  {uploadResult.category && <Col><Tag color="purple">分类: {uploadResult.category}</Tag></Col>}
                  {uploadResult.suggestedUse && <Col><Tag color="cyan">建议: {uploadResult.suggestedUse}</Tag></Col>}
                  {uploadResult.qualityNote && <Col><Tag color={uploadResult.qualityNote.includes('完整') ? 'green' : 'orange'}>{uploadResult.qualityNote}</Tag></Col>}
                  {uploadResult.dataStats?.totalMetrics > 0 && <Col><Tag>数据指标: {uploadResult.dataStats.totalMetrics}个</Tag></Col>}
                </Row>
                {uploadResult.keywords?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {uploadResult.keywords.map((k, i) => <Tag key={i} color="default" style={{ fontSize: 11 }}>{k}</Tag>)}
                  </div>
                )}
              </Card>
            )}
          </Card>
          <Card title={<span><DatabaseOutlined /> 知识库 ({entries.length})</span>} size="small" style={{ marginTop: 12 }}
            extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchEntries} />}>
            <Table rowKey="id" columns={columns} dataSource={entries} loading={loading} size="small"
              rowSelection={{ selectedRowKeys: selectedIds, onChange: setSelectedIds }}
              pagination={{ pageSize: 6 }} scroll={{ y: 260 }}
              locale={{ emptyText: '上传文件开始构建知识库' }} />
          </Card>
        </Col>

        <Col span={14}>
          <Card title={<span><FileTextOutlined /> 文档生成</span>}
            extra={
              <Steps size="small" current={step - 1} style={{ width: 360 }}
                items={[{ title: '配置' }, { title: '澄清' }, { title: '大纲' }, { title: '生成' }]} />
            }>
            {step === 1 && (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Input size="large" placeholder="文档标题（必填）" value={title} onChange={e => setTitle(e.target.value)} />
                <Input.TextArea rows={2} placeholder="生成指令，如：分析敏感肌趋势，对比产品表现"
                  value={instruction} onChange={e => setInstruction(e.target.value)} />
                <Space>
                  <Text>格式:</Text>
                  <Radio.Group value={docType} onChange={e => setDocType(e.target.value)}>
                    <Radio.Button value="pptx">PPTX</Radio.Button>
                    <Radio.Button value="docx">DOCX</Radio.Button>
                  </Radio.Group>
                  <Select value={template} onChange={setTemplate} style={{ width: 280 }}
                    options={(templates.length ? templates : [
                      {id:'business-blue',label:'深蓝商务'},{id:'beauty-pink',label:'美妆粉'},{id:'academic-white',label:'学术白'}
                    ]).map(t => ({
                      value: t.id || t.name, label: (t.source === 'user' ? '📁 ' : '') + (t.label || t.name),
                    }))} />
                </Space>
                <Button type="primary" size="large" icon={<ThunderboltOutlined />} block
                  onClick={handleGenerateOutline} loading={outlineLoading} disabled={!selectedIds.length || !title.trim()}>
                  AI 生成大纲框架
                </Button>
                <Text type="secondary" style={{ textAlign: 'center', display: 'block' }}>
                  已选 {selectedIds.length} 份资料，AI 将先设计大纲再排版
                </Text>
              </Space>
            )}

            {/* Step 2: Clarification questions or Outline */}
            {step === 2 && outline?._clarify && (
              <div>
                <Card size="small" style={{ marginBottom: 12, background: '#FFF7ED', border: '1px solid #FED7AA' }}
                  title={<Space><Tag color="orange">需求澄清</Tag><Text strong>请回答以下问题，帮助优化PPT内容</Text></Space>}>
                  {outline.suggestedAudience && <Text type="secondary">建议受众: {outline.suggestedAudience}</Text>}
                  {outline.suggestedStyle && <><br /><Text type="secondary">建议风格: {outline.suggestedStyle}</Text></>}
                </Card>
                {(outline.questions || []).map((q) => (
                  <div key={q.id} style={{ marginBottom: 12 }}>
                    <Text strong>{q.question}</Text>
                    <Input id={`clarify-q-${q.id}`} placeholder={q.hint || '请输入...'} style={{ marginTop: 4 }} />
                  </div>
                ))}
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Button onClick={() => { setStep(1); setOutline(null); }}>返回</Button>
                  <Space>
                    <Button onClick={async () => {
                      setOutlineLoading(true);
                      try {
                        const res = await client.post('/knowledge/outline', {
                          title: outline._title, source_ids: outline._sourceIds, instruction: outline._instruction,
                        });
                        setOutlineFromResponse(res.data, outline._title);
                        setStep(3);
                        message.success('大纲已生成');
                      } catch (err) { message.error('生成失败'); }
                      finally { setOutlineLoading(false); }
                    }}>跳过，直接生成</Button>
                    <Button type="primary" onClick={handleSubmitAnswers} loading={outlineLoading}>提交并生成大纲</Button>
                  </Space>
                </Space>
              </div>
            )}

            {step === 3 && outline && !outline._clarify && (
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>大纲已生成，如需调整可编辑后确认</Text>
                <Card size="small" style={{ marginBottom: 12, background: '#F9FAFB' }}>
                  <Text strong>主题: </Text><Text>{outline.theme}</Text>
                  {outline.colorScheme && <><br /><Text strong>配色: </Text><Text>{outline.colorScheme}</Text></>}
                  {outline.designNotes && <><br /><Text strong>设计建议: </Text><Text type="secondary">{outline.designNotes}</Text></>}
                </Card>
                <div style={{ maxHeight: 380, overflow: 'auto' }}>
                  <Table rowKey="pageNum" dataSource={outline.slides || []} size="small"
                    pagination={false}
                    columns={[
                      { title: '#', dataIndex: 'pageNum', width: 40 },
                      { title: '页标题', dataIndex: 'title', width: 160, ellipsis: true,
                        render: (v, _, idx) => (
                          <Input size="small" value={v} onChange={e => updateSlide(idx, 'title', e.target.value)} bordered={false} />
                        ),
                      },
                      { title: '布局', dataIndex: 'layout', width: 90,
                        render: (v, _, idx) => (
                          <Select size="small" value={v} onChange={val => updateSlide(idx, 'layout', val)} bordered={false}
                            options={[
                              {value:'cover',label:'封面'},{value:'stats',label:'数据卡'},{value:'chart',label:'图表'},
                              {value:'content',label:'内容'},{value:'table',label:'表格'},{value:'comparison',label:'对比'},
                              {value:'quote',label:'引用'},{value:'image',label:'图片'},{value:'conclusion',label:'结论'},
                            ]} />
                        ),
                      },
                      { title: '作用', dataIndex: 'purpose', ellipsis: true, width: 100,
                        render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
                      { title: '核心内容', dataIndex: 'keyContent', ellipsis: true,
                        render: (v, _, idx) => (
                          <Input size="small" value={v} onChange={e => updateSlide(idx, 'keyContent', e.target.value)} bordered={false} />
                        ),
                      },
                    ]} />
                </div>
                <Space style={{ marginTop: 12, width: '100%', justifyContent: 'space-between' }}>
                  <Button onClick={() => { setStep(1); setOutline(null); }}>返回修改</Button>
                  <Space>
                    <Text type="secondary">{outline.totalSlides || outline.slides?.length} 页</Text>
                    <Button type="primary" size="large" icon={<ThunderboltOutlined />}
                      onClick={handleGenerateFromOutline} loading={generating}>
                      确认生成
                    </Button>
                  </Space>
                </Space>
              </div>
            )}
          </Card>

          {result?.success && (
            <Result status="success" title="生成完成" subTitle={`文件已下载: ${result.filename}`} style={{ padding: '12px 0' }} />
          )}
          {result && !result.success && (
            <Result status="error" title="生成失败" subTitle={result.error} style={{ padding: '12px 0' }} />
          )}
        </Col>
      </Row>

      {/* Preview Modal */}
      <Modal title="文档结构预览" open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width={700}>
        {previewData && (
          <div>
            <Text strong>资料来源: </Text>
            {previewData.sources?.map((s, i) => <Tag key={i}>{s.title} ({s.type})</Tag>)}
            <Card size="small" style={{ marginTop: 12 }} title="执行摘要">
              <Text>{previewData.preview?.summary || '无'}</Text>
            </Card>
            {previewData.preview?.chapters?.map((ch, i) => (
              <Card key={i} size="small" style={{ marginTop: 8 }} title={`第${i + 1}章: ${ch.title}`}>
                {(ch.findings || []).map((f, j) => <div key={j} style={{ padding: '4px 0' }}>• {f}</div>)}
              </Card>
            ))}
            {previewData.preview?.conclusion && (
              <Card size="small" style={{ marginTop: 8 }} title="结论">
                <Text>{previewData.preview.conclusion}</Text>
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* Progress Modal */}
      <Modal title="生成进度" open={progressOpen} footer={null} closable={false} width={400}>
        <Progress percent={progress.progress} status={progress.stage === 'failed' ? 'exception' : progress.stage === 'done' ? 'success' : 'active'} />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Steps direction="vertical" size="small" current={progress.stage === 'done' ? 4 :
            progress.stage === 'docx' ? 3 : progress.stage === 'pptx' ? 2 : progress.stage === 'ai' ? 1 : 0}
            items={[
              { title: '加载知识库', description: progress.stage === 'loading' ? progress.message : '' },
              { title: 'AI 分析', description: progress.stage === 'ai' ? progress.message : '' },
              { title: '生成 PPTX', description: progress.stage === 'pptx' ? progress.message : '' },
              { title: '生成 DOCX', description: progress.stage === 'docx' ? progress.message : '' },
              { title: '完成', description: progress.stage === 'done' ? '文件已就绪' : '' },
            ]} />
        </div>
      </Modal>
    </div>
  );
}
