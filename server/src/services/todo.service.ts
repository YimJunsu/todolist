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
        console.log(`[TodoList 생성 완료] 현재 갯수: ${todoList.length}개 - ${Date()}`)
        return newTodo;
    },

  updateTodo: (todoNum: number, title?: string, completed?: boolean): Todo | null => {
    const index = todoList.findIndex(t => t.todoNum === todoNum);
    if (index === -1) return null; // 찾지 못함

    todoList[index] = { 
      ...todoList[index], 
      ...(title !== undefined && { title }), 
      ...(completed !== undefined && { completed }) 
    };
    if (completed === true) console.log(`[TodoList 수정 완료 --- 상태 완료!] 현재 TODO-ID: [${todoNum}] - ${Date()}`)
    else console.log(`[TodoList 수정 완료 --- 상태 미완료!] 현재 TODO-ID: [${todoNum}] - ${Date()}`)
    return todoList[index];
  },

  // 투두 삭제
  deleteTodo: (todoNum: number): boolean => {
    const initialLength = todoList.length;
    todoList = todoList.filter(t => t.todoNum !== todoNum);
    console.log(`[TodoList 삭제완료] 삭제된 TODO-ID: [${todoNum}] - 현재 남은 갯수: ${todoList.length}개 - ${Date()}`)
    return todoList.length < initialLength;
  }
}
