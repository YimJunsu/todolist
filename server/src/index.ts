import express from 'express';
import cors from 'cors';
import { createServer } from 'http';           // ← 추가
import { WebSocketServer, WebSocket } from 'ws'; // ← 추가
import type { Request, Response } from 'express';
import todoRoutes from './routes/todo.routes.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = 4000;

// API TEST
app.get('/api/test', (req: Request, res: Response) => {
  res.json({ message: "Node.js 서버가 정상적으로 작동합니다!" });
});

app.use('/api/todos', todoRoutes);

// ① Express 앱을 HTTP 서버로 감싸기
//    → WebSocket은 HTTP 서버 위에서 동작하기 때문에 필요
const httpServer = createServer(app);

// ② WebSocket 서버 생성 (같은 포트 4000 사용)
const wss = new WebSocketServer({ server: httpServer });

// ③ 현재 접속 중인 클라이언트(브라우저)들을 저장하는 집합(Set)
//    Set: 중복 없이 여러 개를 담는 자료구조
const clients = new Set<WebSocket>();

// ④ 에디터 내용을 서버 메모리에 저장 (서버가 꺼지면 사라짐)
let editorContent = '';

// ⑤ 누군가 접속했을 때 (connection 이벤트)
wss.on('connection', (ws: WebSocket) => {
  clients.add(ws); // 새 클라이언트 등록
  console.log(`새 클라이언트 접속! 현재 ${clients.size}명 접속 중`);

  // 새로 접속한 사람에게 현재 에디터 내용 전송
  ws.send(JSON.stringify({
    type: 'init',        // 메시지 종류: 초기 데이터
    content: editorContent
  }));

  // ⑥ 클라이언트에서 메시지가 왔을 때
  ws.on('message', (data: Buffer) => {
    const message = JSON.parse(data.toString()); // Buffer → 문자열 → 객체

    if (message.type === 'edit') {
      editorContent = message.content; // 서버의 내용 업데이트

      // ⑦ 브로드캐스트: 나(ws)를 제외한 모든 클라이언트에게 전송
      clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'update',
            content: editorContent
          }));
        }
      });
    }
  });

  // ⑧ 클라이언트가 연결을 끊었을 때
  ws.on('close', () => {
    clients.delete(ws); // 목록에서 제거
    console.log(`클라이언트 연결 종료. 현재 ${clients.size}명 접속 중`);
  });
});

// ─────────────────────────────────────────────
// ⑨ app.listen 대신 httpServer.listen 사용
//    (HTTP + WebSocket 모두 같은 4000 포트로)
// ─────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
  console.log(`WebSocket server is also running on ws://0.0.0.0:${PORT}`);
});