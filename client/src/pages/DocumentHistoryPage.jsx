import { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Table, Button, Space, Tag, Popconfirm, message } from 'antd';
import { DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { documentApi } from '../api/document.api.js';

const { Title } = Typography;

const statusMap = {
  draft: { color: 'default', label: '草稿' },
  generating: { color: 'processing', label: '生成中' },
  complete: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '失败' },
};

export default function DocumentHistoryPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await documentApi.list({ page, limit: 20 });
      setDocs(res.data.data);
      setTotal(res.data.total);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleDelete = async (id) => {
    try {
      await documentApi.delete(id);
      message.success('已删除');
      fetchDocs();
    } catch { message.error('删除失败'); }
  };

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '类型', dataIndex: 'doc_type', key: 'doc_type', width: 70, render: (v) => v?.toUpperCase() },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v) => { const s = statusMap[v] || { color: 'default', label: v }; return <Tag color={s.color}>{s.label}</Tag>; },
    },
    { title: '数据点', dataIndex: 'source_link_count', key: 'source_link_count', width: 80 },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (v) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', key: 'actions', width: 180,
      render: (_, record) => (
        <Space>
          {record.status === 'complete' && (
            <Button type="link" icon={<DownloadOutlined />}
              href={documentApi.downloadUrl(record.id)} target="_blank">下载</Button>
          )}
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>文档历史</Title>
      <Card>
        <Table rowKey="id" columns={columns} dataSource={docs} loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage, showTotal: (t) => `共 ${t} 条` }} />
      </Card>
    </div>
  );
}
