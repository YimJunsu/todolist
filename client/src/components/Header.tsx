import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Todo List', color: '#4CAF50' },
  { path: '/editor', label: '공유 에디터', color: '#4CAF50' },
  { path: '/chat', label: 'AI 챗봇', color: '#4285f4' },
  { path: '/crypto', label: '📈 암호화폐', color: '#f59e0b' },
];

function Header() {
  const location = useLocation();

  return (
    <div style={{ marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {NAV_ITEMS.map(item => {
        const isActive = location.pathname === item.path;
        return (
          <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
            <button
              style={{
                padding: '8px 16px',
                background: isActive ? item.color : '#eee',
                color: isActive ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {item.label}
            </button>
          </Link>
        );
      })}
    </div>
  );
}

export default Header;