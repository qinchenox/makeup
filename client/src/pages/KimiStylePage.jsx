import { useState, useEffect } from 'react';
import { Typography, Card, Button, Input, Tag, message, Space, Row, Col, Steps, Progress, Select, Badge, Upload } from 'antd';
import {
  ThunderboltOutlined, FileTextOutlined, EyeOutlined, DownloadOutlined, InboxOutlined,
  LeftOutlined, RightOutlined, CheckCircleOutlined, DatabaseOutlined, BulbOutlined,
  LayoutOutlined, FilePptOutlined, PictureOutlined, BarChartOutlined, TableOutlined, EditOutlined,
} from '@ant-design/icons';
import client from '../api/client.js';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

const TEMPLATES = [
  { id: 'business-blue', name: '深蓝商务', color: '#1E3A5F', desc: '企业报告', icon: <LayoutOutlined /> },
  { id: 'beauty-pink', name: '美妆粉', color: '#DB2777', desc: '产品展示', icon: <PictureOutlined /> },
  { id: 'academic-white', name: '学术白', color: '#374151', desc: '研究分析', icon: <FileTextOutlined /> },
  { id: 'sugar_rush', name: '孟菲斯', color: '#FF6B6B', desc: '创意活泼', icon: <BulbOutlined /> },
  { id: 'swiss_grid', name: '瑞士网格', color: '#1A1A2E', desc: '数据报告', icon: <BarChartOutlined /> },
  { id: 'glassmorphism', name: '玻璃态', color: '#6366F1', desc: '现代科技', icon: <FilePptOutlined /> },
];

const LAYOUT_ICONS = {
  cover: <FilePptOutlined />, stats: <BarChartOutlined />, chart: <BarChartOutlined />,
  content: <FileTextOutlined />, table: <TableOutlined />, comparison: <LayoutOutlined />,
  quote: <BulbOutlined />, image: <PictureOutlined />, conclusion: <CheckCircleOutlined />,
};

export default function KimiStylePage() {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [template, setTemplate] = useState('business-blue');
  const [outline, setOutline] = useState(null);
  const [sources, setSources] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedFile, setGeneratedFile] = useState(null);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    client.get('/knowledge').then(r => setSources(r.data.data || [])).catch(() => {});
  }, []);

  const handleGenerateOutline = async () => {
    if (!title.trim()) { message.error('请输入主题'); return; }
    if (!selectedIds.length) { message.error('请选择参考知识库'); return; }
    setLoading(true);
    try {
      const res = await client.post('/knowledge/outline', { title, source_ids: selectedIds, instruction });
      const d = res.data?.outline || res.data;
      setOutline({
        theme: d?.theme || title,
        slides: d?.slides || [{ pageNum: 1, title, layout: 'cover' }],
      });
      setStep(2);
      message.success(`大纲已生成: ${d?.slides?.length || d?.totalSlides || 0} 页`);
    } catch (err) { message.error('生成失败'); }
    finally { setLoading(false); }
  };

  const handleGenerate = async () => {
    if (!outline?.slides?.length) return;
    setLoading(true);
    setStep(3);
    setProgress(0);

    // Simulate progress
    const stages = [
      { p: 20, msg: 'AI分析内容中...' },
      { p: 40, msg: '填充第1-3页数据...' },
      { p: 60, msg: '生成图表组件...' },
      { p: 80, msg: '应用模板样式...' },
      { p: 95, msg: '打包文件...' },
    ];
    for (const s of stages) {
      setProgress(s.p);
      await new Promise(r => setTimeout(r, 300));
    }

    try {
      const res = await client.post('/knowledge/generate-from-outline', {
        title, doc_type: 'pptx', template_name: template,
        outline, source_ids: selectedIds, instruction,
      }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      setGeneratedFile({ url, name: title + '.pptx' });
      setProgress(100);
      message.success('PPT 已生成');
    } catch (err) {
      message.error('生成失败');
    } finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (!generatedFile) return;
    const a = document.createElement('a');
    a.href = generatedFile.url; a.download = generatedFile.name;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const layoutOptions = [
    { value: 'cover', label: '封面', icon: <FilePptOutlined /> },
    { value: 'stats', label: '数据卡', icon: <BarChartOutlined /> },
    { value: 'chart', label: '图表', icon: <BarChartOutlined /> },
    { value: 'content', label: '内容', icon: <FileTextOutlined /> },
    { value: 'table', label: '表格', icon: <TableOutlined /> },
    { value: 'comparison', label: '对比', icon: <LayoutOutlined /> },
    { value: 'conclusion', label: '结论', icon: <CheckCircleOutlined /> },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <ThunderboltOutlined style={{ color: '#6366F1', marginRight: 8 }} />
          AI 演示文稿生成
        </Title>
        <Text type="secondary">一句话描述主题，AI 帮你完成从大纲到PPT的全流程</Text>
      </div>

      <Steps size="small" current={step - 1} style={{ maxWidth: 400, margin: '16px auto' }}
        items={[
          { title: '输入主题', icon: <EditOutlined /> },
          { title: '确认大纲', icon: <CheckCircleOutlined /> },
          { title: '生成PPT', icon: <ThunderboltOutlined /> },
        ]} />

      {/* Step 1: Input */}
      {step === 1 && (
        <div>
          {/* Template Cards */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>选择模板风格</Text>
            <Row gutter={8}>
              {TEMPLATES.map(t => (
                <Col span={4} key={t.id}>
                  <Card size="small" hoverable
                    style={{
                      textAlign: 'center', cursor: 'pointer', borderRadius: 10,
                      border: template === t.id ? `2px solid ${t.color}` : '1px solid #f0f0f0',
                      background: template === t.id ? `${t.color}10` : '#fff',
                    }}
                    onClick={() => setTemplate(t.id)}>
                    <div style={{ fontSize: 20, color: t.color, marginBottom: 4 }}>{t.icon}</div>
                    <Text strong style={{ fontSize: 12 }}>{t.name}</Text>
                    <br /><Text type="secondary" style={{ fontSize: 10 }}>{t.desc}</Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>

          {/* Main Input Area */}
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <TextArea
              size="large"
              placeholder="输入PPT主题，例如：2024年敏感肌护肤品市场趋势分析"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 3 }}
              style={{ border: 'none', fontSize: 18, resize: 'none', padding: '8px 0' }}
              variant="borderless"
            />
            <TextArea
              placeholder="补充说明：目标受众、核心要点、风格偏好...（可选）"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              autoSize={{ minRows: 1, maxRows: 2 }}
              style={{ border: 'none', resize: 'none', color: '#888', padding: '4px 0' }}
              variant="borderless"
            />
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#F9FAFB', borderRadius: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <DatabaseOutlined /> 参考知识库:
              </Text>
              <Select mode="multiple" size="small" style={{ minWidth: 300, marginLeft: 8 }}
                value={selectedIds} onChange={setSelectedIds}
                placeholder="选择知识库资料（可选）"
                options={sources.map(s => ({ value: s.id, label: s.title }))} />
            </div>
            <Button type="primary" size="large" icon={<ThunderboltOutlined />} block
              onClick={handleGenerateOutline} loading={loading}
              style={{ marginTop: 16, height: 48, borderRadius: 10, fontSize: 16, background: '#6366F1' }}>
              AI 生成大纲
            </Button>
          </Card>
        </div>
      )}

      {/* Step 2: Outline */}
      {step === 2 && outline && (
        <Row gutter={16}>
          <Col span={8}>
            <Card size="small" title="幻灯片结构" style={{ borderRadius: 12, maxHeight: '70vh', overflow: 'auto' }}
              extra={<Button size="small" type="text" onClick={() => setStep(1)}>返回修改</Button>}>
              {(outline.slides || []).map((s, i) => (
                <div key={i}
                  onClick={() => setActiveSlide(i)}
                  style={{
                    padding: '10px 12px', marginBottom: 6, borderRadius: 8, cursor: 'pointer',
                    background: activeSlide === i ? '#EEF2FF' : '#FAFAFA',
                    border: activeSlide === i ? '1px solid #6366F1' : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}>
                  <Space>
                    <Badge count={s.pageNum || i + 1} size="small"
                      style={{ backgroundColor: activeSlide === i ? '#6366F1' : '#999' }} />
                    <div>
                      <Text strong style={{ fontSize: 13 }}>{s.title}</Text>
                      <br /><Tag color="default" style={{ fontSize: 10, marginTop: 2 }}>{s.layout}</Tag>
                    </div>
                  </Space>
                </div>
              ))}
            </Card>
          </Col>
          <Col span={16}>
            <Card size="small" title="大纲预览" style={{ borderRadius: 12 }}
              extra={<Button type="primary" icon={<ThunderboltOutlined />} onClick={handleGenerate}>确认并生成PPT</Button>}>
              {outline.slides?.[activeSlide] && (
                <div style={{ padding: 16 }}>
                  <Space>
                    <Tag color="#6366F1">{outline.slides[activeSlide].layout}</Tag>
                    <Text strong style={{ fontSize: 16 }}>{outline.slides[activeSlide].title}</Text>
                  </Space>
                  <Paragraph style={{ marginTop: 12, color: '#666' }}>
                    {outline.slides[activeSlide].keyContent || outline.slides[activeSlide].purpose || '该页将根据知识库内容自动填充'}
                  </Paragraph>
                  {outline.slides[activeSlide].visualHint && (
                    <Tag color="purple" style={{ fontSize: 11 }}>可视化建议: {outline.slides[activeSlide].visualHint}</Tag>
                  )}
                  <div style={{ marginTop: 20, padding: '40px 20px', background: '#F9FAFB', borderRadius: 8, textAlign: 'center', border: '1px dashed #DDD' }}>
                    <div style={{ fontSize: 32, color: '#CCC' }}>
                      {LAYOUT_ICONS[outline.slides[activeSlide].layout] || <FilePptOutlined />}
                    </div>
                    <Text type="secondary">幻灯片预览区域</Text>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                <Button icon={<LeftOutlined />} disabled={activeSlide === 0}
                  onClick={() => setActiveSlide(activeSlide - 1)}>上一页</Button>
                <Text type="secondary">{activeSlide + 1} / {outline.slides?.length || 0}</Text>
                <Button icon={<RightOutlined />} disabled={activeSlide >= (outline.slides?.length || 1) - 1}
                  onClick={() => setActiveSlide(activeSlide + 1)}>下一页</Button>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* Step 3: Generating */}
      {step === 3 && (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
          <Progress type="circle" percent={progress} size={120}
            strokeColor={{ '0%': '#6366F1', '100%': '#A78BFA' }} />
          <Title level={4} style={{ marginTop: 24 }}>
            {progress < 100 ? 'AI 正在生成您的演示文稿...' : '生成完成！'}
          </Title>
          <Text type="secondary">
            {progress < 20 ? '分析内容结构' :
             progress < 40 ? '填充页面数据' :
             progress < 60 ? '渲染图表组件' :
             progress < 90 ? '应用模板样式' :
             '文件已就绪'}
          </Text>
          {progress >= 100 && (
            <div style={{ marginTop: 24 }}>
              <Button type="primary" size="large" icon={<DownloadOutlined />} onClick={handleDownload}
                style={{ height: 48, borderRadius: 10, background: '#6366F1' }}>
                下载 PPTX
              </Button>
              <br />
              <Button type="link" onClick={() => { setStep(1); setOutline(null); setGeneratedFile(null); setProgress(0); }}
                style={{ marginTop: 12 }}>生成新的 PPT</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

