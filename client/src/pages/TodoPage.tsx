import { useEffect, useState } from 'react';
import * as todoApi from '../api/todoApi';
import type { Todo } from '../api/todoApi';

function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    const res = await todoApi.getTodos();
    setTodos(res.data);
  };

  const handleAdd = async () => {
    if (!input) return;
    await todoApi.createTodo(input);
    setInput('');
    fetchTodos();
  };

  const handleToggle = async (id: number, completed: boolean) => {
    await todoApi.updateTodo(id, !completed);
    fetchTodos();
  };

  const handleDeleteCompleted = async () => {
  const completedTodos = todos.filter(todo => todo.completed);

  await Promise.all(
    completedTodos.map(todo => todoApi.deleteTodo(todo.todoNum))
  );

  fetchTodos();
};

  return (
    <div>
      <h1>나의 투두 리스트</h1>
      <input
        style={{borderRadius: '10px'}}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="할 일을 입력하세요"
      />
      <button style={{background: 'green', borderRadius: '10px', fontWeight: 'bold', color: 'white'}} onClick={handleAdd}>추가</button>
      <button style={{background: 'red', borderRadius: '10px', fontWeight: 'bold', color: 'white'}} onClick={handleDeleteCompleted}>완료된 항목 삭제</button>

      <table style={{ margin: '0 auto', borderCollapse: 'collapse' }}>
        {todos.map((todo) => (
          <tr key={todo.todoNum}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => handleToggle(todo.todoNum, todo.completed)}
            />
            <span style={{ justifyContent: 'center', textDecoration: todo.completed ? 'line-through' : 'none', color: todo.completed ? 'red' : 'black' }}>
              {todo.todoNum} 번 -&gt;
              {todo.content}    
            </span>
          </tr>
        ))}
      </table>
    </div>
  );
}

export default TodoPage;