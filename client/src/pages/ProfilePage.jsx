import { Typography, Card, Descriptions } from 'antd';
import { useAuth } from '../hooks/useAuth.js';
const { Title } = Typography;

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <Card>
      <Title level={4}>个人信息</Title>
      <Descriptions column={1} bordered>
        <Descriptions.Item label="用户名">{user?.username}</Descriptions.Item>
        <Descriptions.Item label="显示名称">{user?.displayName}</Descriptions.Item>
        <Descriptions.Item label="邮箱">{user?.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="部门">{user?.department || '-'}</Descriptions.Item>
        <Descriptions.Item label="角色">{user?.role}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
