import { Layout, Button, Dropdown, Space } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth.js';
import { useNavigate } from 'react-router-dom';

const { Header } = Layout;

export default function HeaderBar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: '个人信息', onClick: () => navigate('/profile') },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: () => logout() },
    ],
  };

  return (
    <Header style={{ padding: '0 24px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
      <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={onToggle} />
      <Space>
        <Dropdown menu={items} placement="bottomRight">
          <Button type="text" icon={<UserOutlined />}>
            {user?.displayName || user?.username || '用户'}
          </Button>
        </Dropdown>
      </Space>
    </Header>
  );
}
