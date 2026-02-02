import { todo } from 'node:test';
import type { Todo } from '../models/todo.model.js';

let todoList: Todo[] = [
    {
    todoNum: 1,
    content: "test1",
    completed: false,
    created: new Date()
    }
];

export const todoService = {
    getAllTodos: (): Todo[] => todoList,

    createTodo: (content: string): Todo => {
        const newTodo: Todo = {
            todoNum: todoList.length + 1,
            content,
            completed: false,
            created: new Date()
        };
        todoList.push(newTodo);
        return newTodo;
    },

    // 투두 수정 (상태 변경 또는 제목 변경)
  updateTodo: (todoNum: number, title?: string, completed?: boolean): Todo | null => {
    const index = todoList.findIndex(t => t.todoNum === todoNum);
    if (index === -1) return null; // 찾지 못함

    // 기존 데이터에 전달받은 값만 덮어쓰기 (Spread Operator)
    todoList[index] = { 
      ...todoList[index], 
      ...(title !== undefined && { title }), 
      ...(completed !== undefined && { completed }) 
    };
    return todoList[index];
  },

  // 투두 삭제
  deleteTodo: (todoNum: number): boolean => {
    const initialLength = todoList.length;
    todoList = todoList.filter(t => t.todoNum !== todoNum);
    return todoList.length < initialLength; // 삭제 전후 길이를 비교해 성공 여부 반환
  }
}
