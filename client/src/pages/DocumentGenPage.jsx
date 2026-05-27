import { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Form, Input, Select, Button, Table, message, Space, Radio, Row, Col, Tag, Badge } from 'antd';
import { FileTextOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import { documentApi } from '../api/document.api.js';
import { datasourceApi } from '../api/datasource.api.js';

const { Title, Text } = Typography;

const TEMPLATES = [
  { value: 'business-blue', label: '深蓝商务风', color: '#1E3A5F' },
  { value: 'beauty-pink', label: '美妆粉色风', color: '#DB2777' },
  { value: 'academic-white', label: '学术白皮书风', color: '#374151' },
];

export default function DocumentGenPage() {
  const [form] = Form.useForm();
  const [points, setPoints] = useState([]);
  const [selectedPoints, setSelectedPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState('pptx');
  const [template, setTemplate] = useState('business-blue');
  const [preview, setPreview] = useState(null);

  const fetchPoints = useCallback(async () => {
    try {
      const res = await datasourceApi.list({ limit: 100 });
      const sources = res.data.data || [];
      const allPoints = [];
      for (const s of sources) {
        try {
          const detail = await datasourceApi.get(s.id);
          (detail.data.data_points || []).forEach((p) => {
            allPoints.push({ ...p, _sourceTitle: s.title, _trustLevel: s.trust_level, _sourceRefId: s.ref_id });
          });
        } catch (_) { /* skip */ }
      }
      setPoints(allPoints);
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => { fetchPoints(); }, [fetchPoints]);

  const buildPreview = () => {
    const selected = points.filter((p) => selectedPoints.includes(p.id));
    const bySource = {};
    selected.forEach((p) => {
      const key = p._sourceTitle || '未分类';
      if (!bySource[key]) bySource[key] = [];
      bySource[key].push(p);
    });
    setPreview({ total: selected.length, bySource });
  };

  const handleGenerate = async () => {
    const values = await form.validateFields();
    if (!selectedPoints.length) { message.error('请选择至少一个数据点'); return; }
    setLoading(true);
    try {
      const res = await documentApi.generate({
        title: values.title,
        doc_type: docType,
        instruction: values.instruction || '',
        data_point_ids: selectedPoints,
        template_name: template,
        author_name: values.author || '',
      });
      message.success(`生成成功！${res.data.data_points_count} 个数据点已注入到${docType.toUpperCase()}`);
      setPreview(null);
    } catch (err) {
      message.error(err.response?.data?.error || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const pointColumns = [
    { title: '标签', dataIndex: 'label', key: 'label', ellipsis: true },
    { title: '值', dataIndex: 'value', key: 'value', width: 100 },
    { title: '来源', dataIndex: '_sourceTitle', key: '_sourceTitle', ellipsis: true, width: 160 },
    { title: 'REF-ID', dataIndex: 'ref_id', key: 'ref_id', width: 130 },
    {
      title: '可信度', dataIndex: '_trustLevel', key: '_trustLevel', width: 80,
      render: (v) => {
        const colors = { '内部资料': 'blue', '行业公开': 'green', '用户提供': 'orange' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={4}>文档生成</Title>
      <Row gutter={16}>
        <Col span={11}>
          <Card title="数据点库" size="small" extra={<Button size="small" onClick={fetchPoints}>刷新</Button>}>
            <Table rowKey="id" columns={pointColumns} dataSource={points} size="small"
              rowSelection={{ selectedRowKeys: selectedPoints, onChange: setSelectedPoints }}
              pagination={{ pageSize: 8 }} scroll={{ y: 380 }} />
          </Card>
        </Col>
        <Col span={13}>
          <Card title="生成配置">
            <Form form={form} layout="vertical" size="middle">
              <Form.Item name="title" label="文档标题" rules={[{ required: true }]}>
                <Input placeholder="例如：2024年Q3敏感肌护肤趋势报告" />
              </Form.Item>
              <Form.Item name="author" label="作者">
                <Input placeholder="可选" />
              </Form.Item>
              <Form.Item label="文档类型">
                <Radio.Group value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <Radio.Button value="pptx">PPTX</Radio.Button>
                  <Radio.Button value="docx">DOCX</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item label="模板">
                <Radio.Group value={template} onChange={(e) => setTemplate(e.target.value)}>
                  {TEMPLATES.map((t) => (
                    <Radio.Button key={t.value} value={t.value}>
                      <Badge color={t.color} text={t.label} />
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>
              <Form.Item name="instruction" label="生成指令">
                <Input.TextArea rows={2} placeholder="描述文档结构和重点，例如：对比各产品投诉率，生成饼图" />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" icon={<FileTextOutlined />} onClick={handleGenerate} loading={loading}>
                    生成 {docType.toUpperCase()}
                  </Button>
                  <Button icon={<EyeOutlined />} onClick={buildPreview} disabled={!selectedPoints.length}>
                    预览结构
                  </Button>
                  <Text type="secondary">{selectedPoints.length} 个数据点已选</Text>
                </Space>
              </Form.Item>
            </Form>
          </Card>
          {preview && (
            <Card title="文档结构预览" size="small" style={{ marginTop: 16 }}>
              <Text>共 {preview.total} 个数据点，{Object.keys(preview.bySource).length} 个章节</Text>
              {Object.entries(preview.bySource).map(([src, pts]) => (
                <Card key={src} size="small" style={{ marginTop: 8 }} title={src}>
                  {pts.map((p) => (
                    <Tag key={p.id} style={{ marginBottom: 4 }}>{p.label}: {p.value}{p.unit || ''}</Tag>
                  ))}
                </Card>
              ))}
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
