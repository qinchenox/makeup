import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined, DatabaseOutlined, FileTextOutlined,
  HistoryOutlined, AuditOutlined, UserOutlined,
  SettingOutlined, ProfileOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth.js';

const { Sider } = Layout;

export default function Sidebar({ collapsed }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const items = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/datasources', icon: <DatabaseOutlined />, label: '数据源管理' },
    { key: '/documents/generate', icon: <FileTextOutlined />, label: '文档生成' },
    { key: '/documents/history', icon: <HistoryOutlined />, label: '文档历史' },
    { key: '/audit', icon: <AuditOutlined />, label: '审计日志' },
    ...(user?.role === 'admin' ? [
      { key: '/users', icon: <UserOutlined />, label: '用户管理' },
      { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
    ] : []),
    { key: '/profile', icon: <ProfileOutlined />, label: '个人信息' },
  ];

  return (
    <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#fff', fontSize: collapsed ? 16 : 20, fontWeight: 700 }}>
          {collapsed ? 'M' : 'Makeup'}
        </span>
      </div>
      <Menu
        theme="dark" mode="inline"
        selectedKeys={[location.pathname]}
        items={items}
        onClick={({ key }) => navigate(key)}
      />
    </Sider>
  );
}
