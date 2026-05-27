import { Typography, Row, Col, Card, Statistic } from 'antd';
import { DatabaseOutlined, FileTextOutlined, AuditOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth.js';

const { Title } = Typography;

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <div>
      <Title level={4}>欢迎回来，{user?.displayName || user?.username}</Title>
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={6}><Card><Statistic title="数据源" value={0} prefix={<DatabaseOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="文档" value={0} prefix={<FileTextOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="审计条目" value={0} prefix={<AuditOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="用户" value={1} prefix={<UserOutlined />} /></Card></Col>
      </Row>
    </div>
  );
}
