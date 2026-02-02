import type { Request, Response } from 'express';
import { todoService } from '../services/todo.service.js';

export const todoController = {
    getTodos: (req: Request, res: Response) => {
        const todoList = todoService.getAllTodos();
        res.json(todoList);
    },

    addTodo: (req: Request, res: Response) => {
        const { content } = req.body; // 스프링의 @RequestBody 역할
        if (!content) {
        return res.status(400).json({ message: "내용은 필수입니다." });
        }
        const newTodo = todoService.createTodo(content);
        res.status(200).json(newTodo);
    },

    updateTodo: (req: Request, res: Response) => {
    const todoNum = parseInt(req.params.todoNum); // URL의 :id 값을 가져옴
    const { content, completed } = req.body;

    const updated = todoService.updateTodo(todoNum, content, completed);
    
    if (!updated) {
      return res.status(404).json({ message: "해당 ID의 할 일을 찾을 수 없습니다." });
    }
    res.json(updated);
  },

  deleteTodo: (req: Request, res: Response) => {
    const todoNum = parseInt(req.params.todoNum);
    const success = todoService.deleteTodo(todoNum);

    if (!success) {
      return res.status(404).json({ message: "해당 ID의 할 일을 찾을 수 없습니다." });
    }
    // 삭제 성공 시 보통 204(No Content)를 보내거나 성공 메시지를 보냄
    res.status(200).json({ message: "삭제되었습니다." });
  }
}
