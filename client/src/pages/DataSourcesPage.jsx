import { useState, useEffect, useCallback } from 'react';
import { Typography, Table, Button, Space, Input, Select, Tag, Popconfirm, message, Card } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import { datasourceApi } from '../api/datasource.api.js';
import FileUploader from '../components/datasource/FileUploader.jsx';
import TrustLevelTag from '../components/datasource/TrustLevelTag.jsx';

const { Title } = Typography;

export default function DataSourcesPage() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [trustFilter, setTrustFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (catFilter) params.category = catFilter;
      if (trustFilter) params.trust_level = trustFilter;
      const res = await datasourceApi.list(params);
      setSources(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, search, catFilter, trustFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id) => {
    try {
      await datasourceApi.delete(id);
      message.success('已删除');
      fetchData();
    } catch { message.error('删除失败'); }
  };

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '分类', dataIndex: 'category', key: 'category', width: 100 },
    {
      title: '可信度', dataIndex: 'trust_level', key: 'trust_level', width: 100,
      render: (v) => <TrustLevelTag level={v} />,
    },
    { title: '文件类型', dataIndex: 'file_type', key: 'file_type', width: 80 },
    { title: 'REF-ID', dataIndex: 'ref_id', key: 'ref_id', width: 160 },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180,
      render: (v) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_, record) => (
        <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>数据源管理</Title>
      <Card>
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <Input placeholder="搜索标题..." prefix={<SearchOutlined />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 200 }} allowClear />
          <Select placeholder="分类" value={catFilter || undefined} onChange={(v) => { setCatFilter(v || ''); setPage(1); }}
            allowClear style={{ width: 120 }}
            options={['市场数据','研发配方','安全检测','法规政策','消费者调研','销售数据','竞品分析','其他'].map(v => ({ value: v, label: v }))} />
          <Select placeholder="可信度" value={trustFilter || undefined} onChange={(v) => { setTrustFilter(v || ''); setPage(1); }}
            allowClear style={{ width: 120 }}
            options={[{ value: '内部资料', label: '内部资料' }, { value: '行业公开', label: '行业公开' }, { value: '用户提供', label: '用户提供' }]} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadOpen(true)}>上传数据源</Button>
        </Space>
        <Table rowKey="id" columns={columns} dataSource={sources} loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage, showTotal: (t) => `共 ${t} 条` }} />
      </Card>
      <FileUploader open={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={fetchData} />
    </div>
  );
}
