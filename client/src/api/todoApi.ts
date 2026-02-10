import axios from 'axios';

export interface Todo {
    todoNum: number;
    content: string;
    completed: boolean;
    created: Date;
}

// 2. Axios 인스턴스 (공통 설정) - 현재 접속한 호스트로 API 요청
const api = axios.create({
    baseURL: `http://${window.location.hostname}:4000/api/todos`,
});

// 3. API 함수들
export const getTodos = () => api.get<Todo[]>('/');
export const createTodo = (content: string) => api.post<Todo>('/', { content });
export const updateTodo = (todoNum: number, completed: boolean) => api.put<Todo>(`/${todoNum}`, { completed });
export const deleteTodo = (todoNum: number) => api.delete(`/${todoNum}`);