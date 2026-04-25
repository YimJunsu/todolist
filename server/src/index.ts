/**
 * index.ts — Express + WebSocket 서버 (OT 방식 실시간 동시편집)
 *
 * ─────────────────────────────────────────────────────────────────
 * 기존(버전 번호) vs OT 방식 비교
 * ─────────────────────────────────────────────────────────────────
 * [기존] 버전 불일치 → "conflict" 메시지 → 클라이언트가 내용을 잃음
 * [OT]  버전 불일치 → 히스토리 기반 transform → 두 작업 모두 반영
 *
 * ─────────────────────────────────────────────────────────────────
 * OT 서버 프로토콜
 * ─────────────────────────────────────────────────────────────────
 * 클라이언트 → 서버:
 *   { type: 'op', op: ClientOp }
 *     op.revision: 클라이언트가 기반하는 서버 revision
 *     op.opId:     작업 고유 ID (ack 수신 시 매칭용)
 *
 * 서버 → 클라이언트 (ack, 작업 보낸 본인에게):
 *   { type: 'ack', opId: string, revision: number }
 *
 * 서버 → 클라이언트 (broadcast, 나머지 모두에게):
 *   { type: 'op', op: TextOp, revision: number }
 *
 * 서버 → 클라이언트 (init, 새 접속자에게):
 *   { type: 'init', content: string, revision: number }
 *
 * 클라이언트 → 서버 (Todo 변경 알림):
 *   { type: 'todo_changed' }
 *
 * 서버 → 클라이언트 (Todo 갱신 신호, 변경한 본인 제외):
 *   { type: 'todo_refresh' }
 * ─────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Request, Response } from 'express';
import todoRoutes from './routes/todo.routes.js';
import aiRoutes from './routes/ai.routes.js';
import { applyOp, transformAgainstAll } from './ot.js';
import type { ClientOp, TextOp } from './ot.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = 4000;

// ──────────────────────────────────────────────────────────────────
// REST API 라우팅
// ──────────────────────────────────────────────────────────────────

app.get('/api/test', (req: Request, res: Response) => {
  res.json({ message: "Node.js 서버가 정상적으로 작동합니다!" });
});

app.use('/api/todos', todoRoutes);
app.use('/api/ai', aiRoutes);

// ──────────────────────────────────────────────────────────────────
// WebSocket 서버 설정
// ──────────────────────────────────────────────────────────────────

const httpServer = createServer(app);

// HTTP 서버와 같은 포트(4000)에서 WebSocket 서버를 실행합니다.
// 클라이언트는 ws://host:4000/ws 로 접속합니다.
const wss = new WebSocketServer({ server: httpServer });

// ──────────────────────────────────────────────────────────────────
// 서버 상태 (에디터)
// ──────────────────────────────────────────────────────────────────

/** 현재 에디터 전체 텍스트 (서버 메모리에 보관) */
let editorContent = '';

/**
 * 서버 revision 번호
 *
 * 서버가 작업을 하나 승인할 때마다 1씩 증가합니다.
 * history.length와 항상 같습니다.
 *
 * 예시:
 *   초기 상태: revision=0, history=[]
 *   A 삽입 승인: revision=1, history=[opA]
 *   B 삭제 승인: revision=2, history=[opA, opB]
 */
let serverRevision = 0;

/**
 * 작업 히스토리 (서버가 적용한 모든 작업의 목록)
 *
 * 새 클라이언트의 작업이 revision=R로 오면,
 * history[R..current] 에 있는 작업들에 대해 transform을 수행합니다.
 * 즉, "R 이후에 다른 사람이 한 작업들"에 맞게 위치를 조정합니다.
 */
const history: TextOp[] = [];

/** 접속 중인 WebSocket 클라이언트 목록 */
const clients = new Set<WebSocket>();

// ──────────────────────────────────────────────────────────────────
// WebSocket 이벤트 처리
// ──────────────────────────────────────────────────────────────────

// 순서2번
wss.on('connection', (ws: WebSocket) => {
  clients.add(ws);
  console.log(`[WS] 새 클라이언트 접속 — 현재 ${clients.size}명`);

  // ── 초기화: 새 접속자에게 현재 문서 상태를 전송합니다 ──
  // 클라이언트는 이 revision을 기준으로 첫 작업을 만들게 됩니다.
  ws.send(JSON.stringify({
    type: 'init',
    content: editorContent,
    revision: serverRevision,
  }));

  // ── 메시지 수신 처리 ──
  ws.on('message', (data: Buffer) => {
    let message: { type: string; op?: ClientOp };

    try {
      message = JSON.parse(data.toString());
    } catch {
      console.error('[WS] JSON 파싱 실패');
      return;
    }

    // ────────────────────────────────────────────────────────
    // [에디터 작업] type: 'op'
    // ────────────────────────────────────────────────────────
    // 순서8번
    if (message.type === 'op' && message.op) {
      console.log('[message.op] =' + message.op);
      const clientOp = message.op;

      // clientOp.revision: 클라이언트가 기반한 서버 revision
      // serverRevision: 현재 서버 revision
      //
      // 두 값이 다르면 → 클라이언트가 보내는 사이에 다른 작업이 적용됐다는 뜻
      // history[clientOp.revision .. serverRevision] 에 있는 작업들에 대해 transform

      // 순서9번
      const concurrentOps = history.slice(clientOp.revision)
      //     ^ 클라이언트가 모르는 (서버에서 먼저 처리된) 작업들

      // 클라이언트의 작업을 concurrent ops에 맞게 변환
      // (위치 정보를 조정해서 현재 문서 상태에 올바르게 적용할 수 있게 함)
      // 순서10번
      const transformedOp: TextOp = transformAgainstAll(
        { type: clientOp.type, ...(clientOp.type === 'insert'
          ? { position: clientOp.position, text: (clientOp as any).text }
          : { position: clientOp.position, length: (clientOp as any).length }
        ) } as TextOp,
        concurrentOps
      );

      // 변환된 작업을 문서에 적용
      // 순서11번
      editorContent = applyOp(editorContent, transformedOp);
      // 순서12번
      serverRevision += 1;
      history.push(transformedOp);
      console.log('[history] : ' + history)

      console.log(
        `[WS] op 적용 — revision ${serverRevision - 1}→${serverRevision}`,
        `type=${transformedOp.type}`,
        `pos=${transformedOp.position}`
      );

      // ── 작업 보낸 클라이언트에게 ack 전송 ──
      // ack를 받은 클라이언트는 inflight 상태를 해제하고 buffer를 보냅니다.
      // 순서13번 - 너 작업 성공
      ws.send(JSON.stringify({
        type: 'ack',
        opId: clientOp.opId,       // 어떤 작업에 대한 ack인지 식별
        revision: serverRevision,  // 새 서버 revision
      }));

      // ── 나머지 클라이언트에게 변환된 작업을 브로드캐스트 ──
      // 다른 클라이언트들도 자신의 pending 작업에 대해 transform을 수행해야 합니다.
      clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          // 순서14번 op -> 다른 사람에게
          client.send(JSON.stringify({
            type: 'op',
            op: transformedOp,       // 변환 완료된 작업
            revision: serverRevision, // 새 서버 revision
          }));
        }
      });
    }

    // ────────────────────────────────────────────────────────
    // [Todo 변경 알림] type: 'todo_changed'
    // 할 일이 추가/수정/삭제됐을 때 다른 클라이언트에게 갱신을 요청합니다.
    // 데이터는 HTTP API가 이미 처리했으므로 여기서는 신호만 보냅니다.
    // ────────────────────────────────────────────────────────
    if (message.type === 'todo_changed') {
      console.log('[WS] Todo 변경 알림 수신 → 브로드캐스트');

      clients.forEach((client) => {
        // 변경한 본인은 제외 (이미 화면이 업데이트되어 있음)
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'todo_refresh' }));
        }
      });
    }
  });

  // ── 접속 종료 처리 ──
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] 클라이언트 연결 종료 — 현재 ${clients.size}명`);
  });

  ws.on('error', (err) => {
    console.error('[WS] 오류:', err.message);
    clients.delete(ws);
  });
});

// ──────────────────────────────────────────────────────────────────
// 서버 시작
// ──────────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
  console.log(`WebSocket server is also running on ws://0.0.0.0:${PORT}`);
  console.log(`OT(Operational Transformation) 방식 실시간 동시편집 활성화`);
});
