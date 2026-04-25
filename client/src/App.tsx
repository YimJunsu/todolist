import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import TodoPage from './pages/TodoPage';
import EditorPage from './pages/EditorPage';
import ChatPage from './pages/ChatPage';
import CryptoPage from './pages/CryptoPage';
import './App.css';

function App() {
  return (
    <div style={{ padding: '20px' }}>
      <Header />

      <Routes>
        <Route path="/" element={<TodoPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/crypto" element={<CryptoPage />} />
      </Routes>
    </div>
  );
}

export default App;