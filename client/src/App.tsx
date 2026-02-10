import { useEffect, useState } from 'react'
import * as todoApi from './api/todoApi';
import type { Todo } from './api/todoApi';
import './App.css'

function App() {
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

    return (
        <div style={{ padding: '20px' }}>
            <h1>나의 투두 리스트</h1>
            <input value={input} onChange={(e) => setInput(e.target.value)} />
            <button onClick={handleAdd}>추가</button>

            <ul>
                {todos.map(todo => (
                    <li key={todo.todoNum}>
                        <input
                            type="checkbox"
                            checked={todo.completed}
                            onChange={() => handleToggle(todo.todoNum, todo.completed)}
                        />
                        <span style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>
              {todo.content}
            </span>
                        <button onClick={async () => { await todoApi.deleteTodo(todo.todoNum); fetchTodos(); }}>삭제</button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default App;