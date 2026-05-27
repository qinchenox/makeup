import { useState } from 'react';
import { Modal, Form, Input, Select, Upload, Button, message, Tabs } from 'antd';
import { UploadOutlined, LinkOutlined, InboxOutlined } from '@ant-design/icons';
import { datasourceApi } from '../../api/datasource.api.js';

const { Dragger } = Upload;

export default function FileUploader({ open, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('file');

  const handleFileUpload = async () => {
    try {
      const values = await form.validateFields();
      if (!file) { message.error('请选择文件'); return; }
      setLoading(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', values.title);
      fd.append('category', values.category || '其他');
      fd.append('trust_level', values.trust_level || '用户提供');
      fd.append('description', values.description || '');
      const res = await datasourceApi.upload(fd);
      message.success(`数据源已创建，提取 ${res.data.data_points?.length || 0} 个数据点`);
      form.resetFields();
      setFile(null);
      onSuccess?.();
      onClose();
    } catch (err) {
      message.error(err.response?.data?.error || '上传失败');
    } finally { setLoading(false); }
  };

  const handleUrlImport = async () => {
    try {
      const values = await form.validateFields();
      if (!values.url) { message.error('请输入链接'); return; }
      setLoading(true);
      const res = await datasourceApi.fromUrl({
        url: values.url, title: values.title,
        category: values.category || '其他', trust_level: values.trust_level || '用户提供',
      });
      message.success(`链接导入成功，提取 ${res.data.data_points?.length || 0} 个数据点`);
      form.resetFields();
      onSuccess?.();
      onClose();
    } catch (err) {
      message.error(err.response?.data?.error || '导入失败');
    } finally { setLoading(false); }
  };

  const handleOk = activeTab === 'file' ? handleFileUpload : handleUrlImport;

  const commonFields = (
    <>
      <Form.Item name="title" label="数据源标题" rules={[{ required: true, message: '请输入标题' }]}>
        <Input placeholder="例如：2024年Q3敏感肌成分分析报告" />
      </Form.Item>
      <Form.Item name="category" label="分类" initialValue="其他">
        <Select options={['市场数据','研发配方','安全检测','法规政策','消费者调研','销售数据','竞品分析','其他'].map(v=>({value:v,label:v}))} />
      </Form.Item>
      <Form.Item name="trust_level" label="可信度" initialValue="用户提供">
        <Select options={[{value:'内部资料',label:'内部资料'},{value:'行业公开',label:'行业公开'},{value:'用户提供',label:'用户提供'}]} />
      </Form.Item>
      <Form.Item name="description" label="描述">
        <Input.TextArea rows={2} placeholder="数据源的简要说明（选填）" />
      </Form.Item>
    </>
  );

  return (
    <Modal title="导入数据源" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={loading} width={600}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'file', label: <span><UploadOutlined /> 上传文件</span>,
          children: (
            <Form form={form} layout="vertical">
              {commonFields}
              <Form.Item label="文件 (CSV/Excel/PDF/Word/图片/JSON)">
                <Dragger beforeUpload={(f) => { setFile(f); return false; }} maxCount={1}
                  accept=".csv,.xlsx,.xls,.json,.pdf,.docx,.png,.jpg,.jpeg,.txt"
                  onRemove={() => setFile(null)} fileList={file ? [{uid:'-1',name:file.name,status:'done'}] : []}>
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text">点击或拖拽文件到此处</p>
                  <p className="ant-upload-hint">CSV / Excel / PDF / Word / 图片 / JSON</p>
                </Dragger>
              </Form.Item>
            </Form>
          ),
        },
        {
          key: 'url', label: <span><LinkOutlined /> 网页链接</span>,
          children: (
            <Form form={form} layout="vertical">
              {commonFields}
              <Form.Item name="url" label="网页链接" rules={[{ required: true, message: '请输入URL' }, { type: 'url', message: '请输入有效URL' }]}>
                <Input placeholder="https://example.com/cosmetics-report" prefix={<LinkOutlined />} />
              </Form.Item>
            </Form>
          ),
        },
      ]} />
    </Modal>
  );
}
