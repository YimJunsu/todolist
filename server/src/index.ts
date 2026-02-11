import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import todoRoutes from './routes/todo.routes.js';

const app = express();

app.use(cors({ // cors 모든 요청에 설정
  origin: '*'
}));

app.use(express.json());
const PORT = 4000;

// API TEST
app.get('/api/test', (req: Request, res: Response) => {
  res.json({ message: "Node.js 서버가 정상적으로 작동합니다!" });
});

// todos 요청 처리 + todoRoutes에서 처리 지정
app.use('/api/todos', todoRoutes);

// 0.0.0.0으로 바인딩 → localhost + 192.168.10.122 모두 접속 가능
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
});
