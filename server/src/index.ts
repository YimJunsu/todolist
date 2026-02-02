import express from 'express';
import type { Request, Response } from 'express';
import todoRoutes from './routes/todo.routes.js';

const app = express();
const PORT = 4000;

// JSON 파싱 미들웨어
app.use(express.json());

// API TEST
app.get('/api/test', (req: Request, res: Response) => {
  res.json({ message: "Node.js 서버가 정상적으로 작동합니다!" });
});

// todos 요청 처리 + todoRoutes에서 처리 지정
app.use('/api/todos', todoRoutes);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
