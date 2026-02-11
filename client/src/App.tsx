import { useEffect, useState } from 'react'
import * as todoApi from './api/todoApi';
import type { Todo } from './api/todoApi';
import './App.css'

/**
 * 
 * useState의 역할: 컴포넌트 안에서 "상태값"을 저장하고, 값이 바뀌면 화면을 다시 그리게 해주는 훅 (노트에 적어두는 메모)
 * useEffect의 역할: 컴포넌트가 렌더링된 후 실행되는 함수 ("처음 시작할 때 해야 할 일" 체크리스트)
 */
function App() {
    // todos 상태: 서버에서 받아온 Todo 목록을 저장
    const [todos, setTodos] = useState<Todo[]>([]);

    // input 상태: 사용자가 입력창에 작성한 값 저장
    const [input, setInput] = useState('');

    // 컴포넌트가 처음 마운트될 때 한 번 실행
    // 빈 배열 [] → 최초 1회 실행
    useEffect(() => {
        fetchTodos();
    }, []);

    // 서버에서 Todo 목록을 가져오는 함수
    const fetchTodos = async () => {
        // API 호출
        const res = await todoApi.getTodos();

        // 응답 데이터로 상태 업데이트 → 화면 리렌더링
        setTodos(res.data);
    };

    // Todo 추가 함수
    const handleAdd = async () => {
        // 입력값이 비어있으면 실행 중단
        if (!input) return;

        // 서버에 새 Todo 생성 요청
        await todoApi.createTodo(input);

        // 입력창 초기화
        setInput('');

        // 목록 다시 불러오기 (최신 상태 반영)
        fetchTodos();
    };

    // 체크박스 토글 함수 (완료/미완료 변경)
    const handleToggle = async (id: number, completed: boolean) => {
        // 현재 상태의 반대값으로 업데이트 요청
        await todoApi.updateTodo(id, !completed);

        // 변경된 목록 다시 불러오기
        fetchTodos();
    };

    return (
        <div style={{ padding: "20px" }}>
      <h1>나의 투두 리스트</h1>

      {/* 입력창과 추가 버튼 */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="할 일을 입력하세요"
      />
      <button onClick={handleAdd}>추가</button>

      {/* 투두 리스트 */}
      <ul>
        {todos.map((todo) => (
          <li key={todo.todoNum}>
            {/* 완료 체크박스 */}
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => handleToggle(todo.todoNum, todo.completed)}
            />
            {/* 완료되면 글자 취소선 */}
            <span style={{ textDecoration: todo.completed ? "line-through" : "none" }}>
              {todo.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
    );
}

export default App;