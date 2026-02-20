import { Link, useLocation } from 'react-router-dom';

function Header() {
  const location = useLocation();

  return (
    <div style={{ marginBottom: '20px' }}>
      <Link to="/">
        <button
          style={{
            marginRight: '8px',
            padding: '8px 16px',
            background: location.pathname === '/' ? '#4CAF50' : '#eee',
            color: location.pathname === '/' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Todo List
        </button>
      </Link>

      <Link to="/editor">
        <button
          style={{
            padding: '8px 16px',
            background: location.pathname === '/editor' ? '#4CAF50' : '#eee',
            color: location.pathname === '/editor' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          공유 에디터
        </button>
      </Link>
    </div>
  );
}

export default Header;