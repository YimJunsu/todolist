/**
 * TodoPage.tsx — 실시간 Todo 리스트 (WebSocket 동기화 적용)
 *
 * ─────────────────────────────────────────────────────────────────
 * 실시간 동기화 방식
 * ─────────────────────────────────────────────────────────────────
 * Todo 데이터의 CRUD는 기존대로 HTTP REST API가 담당합니다.
 * WebSocket은 "누군가 Todo를 변경했다"는 신호만 주고받습니다.
 *
 * [흐름]
 *   내가 Todo 변경(추가/토글/삭제)
 *     → HTTP API로 서버 DB 업데이트
 *     → WebSocket으로 { type: 'todo_changed' } 신호 전송
 *     → 서버가 다른 모든 클라이언트에게 { type: 'todo_refresh' } 브로드캐스트
 *     → 다른 클라이언트들이 fetchTodos() 호출 → 화면 갱신
 *
 * [자동 재연결]
 *   WebSocket 연결이 끊기면 3초 후 자동으로 재연결합니다.
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as todoApi from '../api/todoApi';
import type { Todo } from '../api/todoApi';

function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');

  // WebSocket 연결 객체
  const wsRef = useRef<WebSocket | null>(null);

  // 재연결 타이머
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ──────────────────────────────────────────────────────────────
  // Todo 데이터 로드 (HTTP API)
  // ──────────────────────────────────────────────────────────────

  const fetchTodos = useCallback(async () => {
    const res = await todoApi.getTodos();
    setTodos(res.data);
  }, []);

  // ──────────────────────────────────────────────────────────────
  // WebSocket으로 변경 신호 전송
  // ──────────────────────────────────────────────────────────────

  /**
   * Todo가 변경된 후 다른 클라이언트에게 갱신 신호를 보냅니다.
   * 서버는 이 신호를 받아 다른 모든 클라이언트에게 todo_refresh를 브로드캐스트합니다.
   */
  const notifyChange = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'todo_changed' }));
    }
  }, []);

  // ──────────────────────────────────────────────────────────────
  // WebSocket 연결 (자동 재연결 포함)
  // ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Todo WS] 연결됨');
    };

    ws.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      // 다른 사용자가 Todo를 변경했다는 신호 → fetchTodos로 최신 목록 갱신
      if (message.type === 'todo_refresh') {
        console.log('[Todo WS] todo_refresh 수신 → 목록 갱신');
        fetchTodos();
      }

      // init/op/ack 메시지는 에디터용이므로 여기서는 무시
    };

    ws.onclose = () => {
      console.log('[Todo WS] 연결 끊김 — 3초 후 재연결');
      // 자동 재연결
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [fetchTodos]);

  // 컴포넌트 마운트 시 초기 로드 + WebSocket 연결
  useEffect(() => {
    fetchTodos();
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [fetchTodos, connect]);

  // ──────────────────────────────────────────────────────────────
  // Todo CRUD 핸들러
  // ──────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!input) return;
    await todoApi.createTodo(input);
    setInput('');
    fetchTodos();
    notifyChange(); // 다른 탭에게 갱신 신호
  };

  const handleToggle = async (id: number, completed: boolean) => {
    await todoApi.updateTodo(id, !completed);
    fetchTodos();
    notifyChange(); // 다른 탭에게 갱신 신호
  };

  const handleDeleteCompleted = async () => {
    const completedTodos = todos.filter(todo => todo.completed);
    await Promise.all(completedTodos.map(todo => todoApi.deleteTodo(todo.todoNum)));
    fetchTodos();
    notifyChange(); // 다른 탭에게 갱신 신호
  };

  // ──────────────────────────────────────────────────────────────
  // 렌더링
  // ──────────────────────────────────────────────────────────────

  return (
    <div>
      <h1>나의 투두 리스트</h1>
      <input
        style={{ borderRadius: '10px' }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        placeholder="할 일을 입력하세요"
      />
      <button
        style={{ background: 'green', borderRadius: '10px', fontWeight: 'bold', color: 'white' }}
        onClick={handleAdd}
      >
        추가
      </button>
      <button
        style={{ background: 'red', borderRadius: '10px', fontWeight: 'bold', color: 'white' }}
        onClick={handleDeleteCompleted}
      >
        완료된 항목 삭제
      </button>

      <table style={{ margin: '0 auto', borderCollapse: 'collapse' }}>
        {todos.map((todo) => (
          <tr key={todo.todoNum}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => handleToggle(todo.todoNum, todo.completed)}
            />
            <span style={{
              justifyContent: 'center',
              textDecoration: todo.completed ? 'line-through' : 'none',
              color: todo.completed ? 'red' : 'black',
            }}>
              {todo.todoNum} 번 -&gt; {todo.content}
            </span>
          </tr>
        ))}
      </table>
    </div>
  );
}

export default TodoPage;
