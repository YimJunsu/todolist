import { Router } from 'express';
import { todoController } from '../controllers/todo.controller.js';

const router = Router();

router.get('/', todoController.getTodos); // GET /api/todos
router.post('/', todoController.addTodo); // POST /api/todos
router.put('/:todoNum', todoController.updateTodo);    // PUT /api/todos/1
router.delete('/:todoNum', todoController.deleteTodo); // DELETE /api/todos/1

export default router;