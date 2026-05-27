import { Tag } from 'antd';

const colorMap = { '内部资料': 'blue', '行业公开': 'green', '用户提供': 'orange' };

export default function TrustLevelTag({ level }) {
  return <Tag color={colorMap[level] || 'default'}>{level}</Tag>;
}
