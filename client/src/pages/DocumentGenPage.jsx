import { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Form, Input, Button, Table, message, Space, Radio, Row, Col, Tag, Badge, Statistic } from 'antd';
import { FileTextOutlined, EyeOutlined, DatabaseOutlined } from '@ant-design/icons';
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
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [selectedSources, setSelectedSources] = useState([]);
  const [sourceDetails, setSourceDetails] = useState({});
  const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState('pptx');
  const [template, setTemplate] = useState('business-blue');

  const fetchSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const res = await datasourceApi.list({ limit: 100 });
      setSources(res.data.data || []);
    } catch (_) { /* ignore */ }
    finally { setLoadingSources(false); }
  }, []);

  // Load source details on demand when selection changes
  const loadSourceDetail = async (sourceId) => {
    if (sourceDetails[sourceId]) return;
    try {
      const detail = await datasourceApi.get(sourceId);
      setSourceDetails(prev => ({ ...prev, [sourceId]: detail.data }));
    } catch (err) {
      message.error('加载数据源详情失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSourceSelect = (selectedKeys) => {
    setSelectedSources(selectedKeys);
    // Load details for newly selected sources
    for (const key of selectedKeys) {
      loadSourceDetail(key);
    }
  };

  useEffect(() => { fetchSources(); }, [fetchSources]);

  // Calculate total data points from selected sources
  const totalPoints = selectedSources.reduce((sum, sid) => {
    const detail = sourceDetails[sid];
    return sum + (detail?.data_points?.length || 0);
  }, 0);

  const totalInsights = selectedSources.reduce((sum, sid) => {
    const detail = sourceDetails[sid];
    return sum + (detail?.analysis?.insights?.length || 0);
  }, 0);

  const handleGenerate = async () => {
    const values = await form.validateFields();
    if (!selectedSources.length) { message.error('请选择至少一个知识库数据源'); return; }
    setLoading(true);
    try {
      // Load details for selected sources into local cache
      const detailsMap = { ...sourceDetails };
      for (const sid of selectedSources) {
        if (!detailsMap[sid]) {
          try {
            const detail = await datasourceApi.get(sid);
            detailsMap[sid] = detail.data;
          } catch (err) {
            message.error('加载数据源失败: ' + (err.response?.data?.error || err.message));
            setLoading(false);
            return;
          }
        }
      }
      // Update state cache
      setSourceDetails(detailsMap);

      // Collect all data point IDs from selected sources
      const allPointIds = [];
      for (const sid of selectedSources) {
        const detail = detailsMap[sid];
        if (detail?.data_points?.length) {
          allPointIds.push(...detail.data_points.map(p => p.id));
        }
      }
      if (!allPointIds.length) { message.error('所选知识库中没有数据点，请先在数据源管理中上传文件'); setLoading(false); return; }

      const res = await documentApi.generate({
        title: values.title,
        doc_type: docType,
        instruction: values.instruction || '',
        data_point_ids: allPointIds,
        template_name: template,
        author_name: values.author || '',
      });
      message.success(`${docType.toUpperCase()} 生成成功！${res.data.data_points_count} 个数据点已注入`);
    } catch (err) {
      message.error(err.response?.data?.error || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const sourceColumns = [
    {
      title: '知识库数据源', dataIndex: 'title', key: 'title', ellipsis: true,
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {sourceDetails[r.id]?.data_points?.length || '...'} 个数据点
            {sourceDetails[r.id]?.analysis?.insights?.length ? ` · ${sourceDetails[r.id].analysis.insights.length} 个洞察` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: '分类', dataIndex: 'category', key: 'category', width: 100,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: '可信度', dataIndex: 'trust_level', key: 'trust_level', width: 100,
      render: (v) => {
        const colors = { '内部资料': 'blue', '行业公开': 'green', '用户提供': 'orange' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '类型', dataIndex: 'file_type', key: 'file_type', width: 70,
      render: (v) => v ? <Tag>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: '关键词', key: 'keywords', width: 200, ellipsis: true,
      render: (_, r) => {
        const kw = sourceDetails[r.id]?.analysis?.insights?.find(i => i.type === 'keywords');
        return kw ? kw.keywords?.slice(0, 5).map((k, i) => <Tag key={i} color="purple" style={{ fontSize: 11 }}>{k}</Tag>) : '-';
      },
    },
  ];

  return (
    <div>
      <Title level={4}>文档生成</Title>
      <Row gutter={16}>
        <Col span={12}>
          <Card title={<span><DatabaseOutlined /> 选择知识库</span>} size="small"
            extra={<Button size="small" onClick={fetchSources} loading={loadingSources}>刷新</Button>}>
            <Table rowKey="id" columns={sourceColumns} dataSource={sources} size="small"
              rowSelection={{
                selectedRowKeys: selectedSources,
                onChange: handleSourceSelect,
              }}
              pagination={{ pageSize: 8 }} scroll={{ y: 380 }}
              locale={{ emptyText: '暂无数据源，请先在「数据源管理」中上传' }} />
          </Card>
        </Col>
        <Col span={12}>
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
                  <Radio.Button value="pptx">PPTX 演示文稿</Radio.Button>
                  <Radio.Button value="docx">DOCX Word文档</Radio.Button>
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
                <Input.TextArea rows={2} placeholder="描述文档重点，例如：对比各产品投诉率，生成饼图" />
              </Form.Item>
            </Form>

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Card size="small">
                  <Statistic title="已选知识库" value={selectedSources.length} suffix="个" />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic title="数据点" value={totalPoints} suffix="条" />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic title="洞察" value={totalInsights} suffix="项" />
                </Card>
              </Col>
            </Row>

            <Button type="primary" icon={<FileTextOutlined />} onClick={handleGenerate} loading={loading} block size="large"
              disabled={!selectedSources.length}>
              生成 {docType.toUpperCase()} 文档
            </Button>
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 8 }}>
              系统将自动关联所选知识库的全部数据点，注入溯源链接
            </Text>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
