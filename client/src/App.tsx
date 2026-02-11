import { useEffect, useState } from 'react'
import * as todoApi from './api/todoApi';
import type { Todo } from './api/todoApi';
import './App.css'

function App() {

  // 1️⃣ 서버에서 받아온 할 일 목록을 저장하는 공간
  const [todos, setTodos] = useState<Todo[]>([]);

  // 2️⃣ 입력창에 쓰는 글자를 저장하는 공간
  const [input, setInput] = useState('');

  // 3️⃣ 처음 화면이 열릴 때 한 번 실행
  useEffect(() => {
    fetchTodos();
  }, []);

  // 📌 서버에서 할 일 목록을 가져오는 함수
  const fetchTodos = async () => {
    const res = await todoApi.getTodos(); // 서버에 요청
    setTodos(res.data); // 받아온 데이터를 저장
  };

  // 📌 할 일 추가하는 함수
  const handleAdd = async () => {

    // 입력이 비어있으면 아무것도 안함
    if (input === '') return;

    await todoApi.createTodo(input); // 서버에 새 할 일 추가

    setInput(''); // 입력창 비우기

    fetchTodos(); // 목록 다시 불러오기
  };

  // 📌 체크박스 클릭했을 때
  const handleToggle = async (id: number, completed: boolean) => {
    await todoApi.updateTodo(id, !completed); // true ↔ false 바꾸기
    fetchTodos(); // 다시 불러오기
  };

  return (
    <div style={{ padding: "20px" }}>

      <h1>나의 투두 리스트</h1>

      {/* 입력창 */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="할 일을 입력하세요"
      />

      {/* 추가 버튼 */}
      <button onClick={handleAdd}>추가</button>

      <ul>
        {todos.map((todo) => (
          <li key={todo.todoNum}>

            {/* 체크박스 */}
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() =>
                handleToggle(todo.todoNum, todo.completed)
              }
            />

            {/* 완료되면 줄 긋기 */}
            <span
              style={{
                textDecoration: todo.completed
                  ? "line-through"
                  : "none"
              }}
            >
              {todo.content}
            </span>

          </li>
        ))}
      </ul>

    </div>
  );
}

export default App;
