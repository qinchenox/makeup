import { useState } from 'react';
import { Typography, Card, Form, Input, Button, Upload, message, Space, Radio, Badge, Result, Row, Col, Steps } from 'antd';
import { InboxOutlined, FileTextOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import client from '../api/client.js';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const TEMPLATES = [
  { value: 'business-blue', label: '深蓝商务风', color: '#1E3A5F' },
  { value: 'beauty-pink', label: '美妆粉色风', color: '#DB2777' },
  { value: 'academic-white', label: '学术白皮书风', color: '#374151' },
];

export default function QuickConvertPage() {
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [docType, setDocType] = useState('pptx');
  const [template, setTemplate] = useState('business-blue');

  const handleConvert = async () => {
    const values = await form.validateFields();
    if (!file) { message.error('请选择PDF或Word文件'); return; }
    setLoading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', values.title || file.name);
      fd.append('doc_type', docType);
      fd.append('template_name', template);
      if (values.author) fd.append('author_name', values.author);

      const res = await client.post('/convert', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });

      // Trigger download
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext = docType === 'pptx' ? '.pptx' : '.docx';
      link.setAttribute('download', (values.title || file.name.replace(/\.[^.]+$/, '')) + ext);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setResult({ success: true, filename: (values.title || file.name.replace(/\.[^.]+$/, '')) + ext });
      message.success('转换完成，文件已自动下载');
    } catch (err) {
      let errorMsg = '转换失败';
      if (err.response?.data instanceof Blob) {
        // Blob error response — try to read it
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          errorMsg = json.error || errorMsg;
        } catch (_) { errorMsg = '服务器错误 (HTTP ' + err.response.status + ')'; }
      } else if (err.response?.data?.error) {
        errorMsg = err.response.data.error;
      } else if (err.message) {
        errorMsg = err.message;
      }
      setResult({ success: false, error: errorMsg });
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Title level={4}><ThunderboltOutlined /> 快速转换</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        上传 PDF / Word / TXT 文件，直接生成 PPT 或 Word 文档，无需存入数据库
      </Text>

      <Row gutter={16}>
        <Col span={14}>
          <Card title="上传文件">
            <Form form={form} layout="vertical">
              <Form.Item>
                <Dragger beforeUpload={(f) => { setFile(f); return false; }} maxCount={1}
                  accept=".pdf,.docx,.txt,.csv,.xlsx,.xls"
                  onRemove={() => { setFile(null); setResult(null); }}
                  fileList={file ? [{ uid: '-1', name: file.name, status: 'done' }] : []}>
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text">点击或拖拽文件到此处</p>
                  <p className="ant-upload-hint">支持 PDF、Word、TXT、CSV、Excel</p>
                </Dragger>
              </Form.Item>
              <Form.Item name="title" label="文档标题（可选，默认用文件名）">
                <Input placeholder="生成的文档标题" />
              </Form.Item>
              <Form.Item name="author" label="作者（可选）">
                <Input placeholder="作者名称" />
              </Form.Item>
              <Form.Item label="输出格式">
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
              <Button type="primary" size="large" icon={<ThunderboltOutlined />}
                onClick={handleConvert} loading={loading} block disabled={!file}>
                开始转换
              </Button>
            </Form>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="转换流程">
            <Steps direction="vertical" size="small" current={loading ? 2 : file ? 1 : 0}
              items={[
                { title: '选择文件', description: '上传 PDF / Word / TXT 文件' },
                { title: '自动解析', description: '提取文字内容，识别结构' },
                { title: '生成文档', description: '直接输出 PPTX 或 DOCX' },
              ]} />
            {result?.success && (
              <Result status="success" title="转换完成" subTitle={`文件已下载: ${result.filename}`}
                style={{ padding: '16px 0' }} />
            )}
            {result && !result.success && (
              <Result status="error" title="转换失败" subTitle={result.error}
                style={{ padding: '16px 0' }} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
