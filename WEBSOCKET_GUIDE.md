# 🔌 WebSocket 교육 가이드 — 실시간 공유 에디터 만들기

> **대상:** JS·React 입문자 (Java 기초 보유)
> **목표:** WebSocket 개념 이해 → `ws` 패키지 설치 → 노션처럼 여러 명이 동시에 수정하는 에디터 페이지 구현

---

## 1. WebSocket 이란? (이론)

### 기존 HTTP 통신의 한계

지금까지 우리가 만든 TodoList는 이런 방식으로 동작했습니다.

```
[브라우저]  →  "할 일 목록 줘!"  →  [서버]
[브라우저]  ←  "여기 있어!"      ←  [서버]
```

이걸 **HTTP 요청-응답 (Request-Response)** 방식이라고 합니다.
Java로 비유하면: 클라이언트가 메서드를 호출하고 결과를 반환받는 것과 비슷합니다.

**문제점:** 브라우저가 먼저 물어봐야만 서버가 대답할 수 있습니다.
서버가 "야, 새로운 일이 생겼어!" 하고 먼저 알릴 수가 없어요.

예) A가 TodoList에 새 항목을 추가했는데, B의 화면에는 B가 새로고침을 눌러야만 보입니다.

---

### WebSocket — 전화 연결 방식

WebSocket은 **서버와 브라우저 사이에 전화선을 개통**하는 것입니다.

```
[브라우저] ←———— 전화선 (연결 유지) ————→ [서버]

언제든지:
  브라우저 → 서버: "내가 글자 입력했어"
  서버 → 브라우저: "다른 사람이 글자 입력했어"
```

한번 연결하면 **양쪽 모두 언제든 먼저 말을 걸 수 있습니다.**

| 구분 | HTTP | WebSocket |
|------|------|-----------|
| 연결 방식 | 요청할 때마다 새로 연결 | 한 번 연결하면 계속 유지 |
| 통신 방향 | 클라이언트 → 서버 (단방향) | 양방향 (서버도 먼저 보낼 수 있음) |
| 용도 | 일반 데이터 조회/저장 | 채팅, 실시간 협업, 알림 |

---

### WebSocket 주요 용어 해설

**연결(Connection):** 브라우저와 서버 사이의 전화선이 개통된 상태
→ Java의 `Socket` 객체를 열어두는 것과 같은 개념

**핸드셰이크(Handshake, 악수):** 처음 연결할 때 서로 "나 WebSocket 써도 돼?" "응 써!" 하고 확인하는 과정
→ 실제로 HTTP 요청 한 번으로 시작해서 WebSocket 프로토콜로 업그레이드합니다

**프로토콜(Protocol):** 통신 규칙. HTTP → `http://`, WebSocket → `ws://`

**브로드캐스트(Broadcast, 방송):** 서버가 연결된 **모든** 클라이언트에게 동시에 메시지를 보내는 것
→ 공지방송처럼, 접속한 모든 브라우저에 한꺼번에 알림

**클라이언트(Client):** 서버에 접속한 브라우저 각각
→ 사용자 A의 브라우저, 사용자 B의 브라우저 각각이 하나의 클라이언트

**이벤트(Event):** 무언가 일어났을 때 자동으로 실행되는 함수
→ Java의 리스너 패턴과 동일 (`onopen`, `onmessage`, `onclose`)

**페이로드(Payload):** 메시지에 담긴 실제 데이터
→ 택배 박스(메시지) 안에 들어있는 물건(데이터)

---

### 실시간 에디터가 동작하는 흐름

```
사용자 A가 "안녕" 입력
       ↓
A의 브라우저 → 서버: { type: "edit", content: "안녕" }
       ↓
서버가 받아서 내용 저장 후 → B, C, D 브라우저에 브로드캐스트
       ↓
B, C, D 화면이 자동으로 "안녕"으로 업데이트
```

---

## 2. `ws` vs `socket.io` — 뭐가 다른가?

### `ws` (우리가 쓸 것)

```
npm install ws
```

- Node.js의 **순수 WebSocket 표준** 구현체
- 브라우저에 내장된 `WebSocket` API와 1:1로 통신
- 가볍고 빠르며, 웹 표준을 그대로 배울 수 있음
- 자동 재연결, 룸(room) 기능 등이 **없음** → 직접 구현해야 함

### `socket.io`

```
npm install socket.io        # 서버
npm install socket.io-client # 클라이언트
```

- WebSocket을 기반으로 편의 기능을 **많이 추가한 라이브러리**
- 자동 재연결, 룸(room: 특정 그룹에만 브로드캐스트), 네임스페이스(namespace: 채널 분리) 제공
- 브라우저가 WebSocket을 지원하지 않으면 폴링(Polling: 주기적으로 HTTP 요청)으로 자동 전환
- **단점:** `socket.io` 서버에는 반드시 `socket.io-client`로 접속해야 함 (표준 WebSocket 클라이언트 사용 불가)

| 기준 | `ws` | `socket.io` |
|------|------|-------------|
| 용도 | 표준 학습, 가벼운 프로젝트 | 실무 복잡한 기능 필요 시 |
| 크기 | 작음 | 큼 |
| 재연결 | 직접 구현 | 자동 |
| 룸/채널 | 직접 구현 | 내장 |
| 브라우저 호환 | 최신 브라우저 (99%+) | 구형 브라우저까지 |
| 학습 난이도 | 낮음 (표준과 동일) | 중간 (자체 API 별도 학습) |

> **회사에서는?** 실시간 채팅, 게임, 협업 도구처럼 기능이 많이 필요하면 `socket.io`,
> 단순한 실시간 알림이나 표준이 중요하면 `ws`를 씁니다.

---

## 3. 과제: 실시간 공유 에디터 구현

### 완성 목표

- 브라우저 두 개(또는 두 사람)가 같은 페이지를 열면
- 한쪽에서 글자를 입력하는 순간 다른 쪽에도 실시간으로 반영
- TodoList 옆에 "에디터" 탭으로 이동할 수 있도록 화면 전환 추가

---

### Step 1 — 서버에 `ws` 패키지 설치

`server` 폴더에서 아래 명령어를 실행합니다.

```bash
cd server
npm install ws
npm install --save-dev @types/ws
```

- `ws`: WebSocket 서버를 만드는 패키지
- `@types/ws`: TypeScript가 `ws`의 타입을 이해할 수 있게 해주는 타입 정의

---

### Step 2 — 서버 코드 수정 (`server/src/index.ts`)

기존 `app.listen(...)` 부분을 **전부 아래 코드로 교체**합니다.

```typescript
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

// ─────────────────────────────────────────────
// ① Express 앱을 HTTP 서버로 감싸기
//    → WebSocket은 HTTP 서버 위에서 동작하기 때문에 필요
// ─────────────────────────────────────────────
const httpServer = createServer(app);

// ─────────────────────────────────────────────
// ② WebSocket 서버 생성 (같은 포트 4000 사용)
// ─────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

// ③ 현재 접속 중인 클라이언트(브라우저)들을 저장하는 집합(Set)
//    Set: 중복 없이 여러 개를 담는 자료구조 (Java의 HashSet과 동일)
const clients = new Set<WebSocket>();

// ④ 에디터 내용을 서버 메모리에 저장 (서버가 꺼지면 사라짐)
let editorContent = '';

// ─────────────────────────────────────────────
// ⑤ 누군가 접속했을 때 (connection 이벤트)
// ─────────────────────────────────────────────
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
```

> **핵심 포인트:**
> `createServer(app)` → Express를 HTTP 서버로 감싸야 WebSocket과 같은 포트를 공유할 수 있습니다.
> `new Set<WebSocket>()` → 접속한 브라우저들을 저장. 누군가 글을 쓰면 이 Set을 순회하며 모두에게 브로드캐스트.

---

### Step 3 — 에디터 페이지 컴포넌트 생성 (`client/src/EditorPage.tsx`)

`client/src/` 폴더에 `EditorPage.tsx` 파일을 **새로 생성**합니다.

```tsx
import { useEffect, useRef, useState } from 'react';

function EditorPage() {
  // ① 에디터에 표시할 텍스트 상태
  const [content, setContent] = useState('');

  // ② WebSocket 객체를 저장. useRef를 쓰는 이유:
  //    - useState는 값이 바뀌면 화면이 다시 그려짐(리렌더링)
  //    - useRef는 값이 바뀌어도 화면을 다시 그리지 않음
  //    - ws 연결 객체는 화면 갱신이 필요 없으니 useRef가 적합
  const wsRef = useRef<WebSocket | null>(null);

  // ③ 컴포넌트가 화면에 나타날 때 WebSocket 연결
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:4000'); // 서버에 연결
    wsRef.current = ws;

    // 연결 성공
    ws.onopen = () => {
      console.log('✅ WebSocket 연결됨!');
    };

    // 서버에서 메시지 수신
    ws.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      // 처음 접속했을 때 현재 내용 받기 (type: 'init')
      // 다른 사람이 수정했을 때 받기 (type: 'update')
      if (message.type === 'init' || message.type === 'update') {
        setContent(message.content);
      }
    };

    // 연결이 끊겼을 때
    ws.onclose = () => {
      console.log('❌ WebSocket 연결 끊김');
    };

    // ④ 컴포넌트가 화면에서 사라질 때 연결 종료 (메모리 누수 방지)
    return () => {
      ws.close();
    };
  }, []); // [] → 컴포넌트가 처음 나타날 때 딱 한 번만 실행

  // ⑤ 텍스트를 입력할 때마다 실행되는 함수
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent); // 내 화면 즉시 업데이트

    // 서버에 변경 사항 전송 (서버가 다른 사람들에게 브로드캐스트)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'edit',
        content: newContent
      }));
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>📝 실시간 공유 에디터</h1>
      <p style={{ color: '#666' }}>여기에 입력하면 접속한 모든 사람에게 실시간으로 보여요!</p>
      <textarea
        value={content}
        onChange={handleChange}
        style={{
          width: '100%',
          height: '400px',
          fontSize: '16px',
          padding: '12px',
          boxSizing: 'border-box',
          border: '2px solid #4CAF50',
          borderRadius: '8px',
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: '1.6'
        }}
        placeholder="여기에 내용을 입력해보세요. 다른 탭에서도 동시에 열어보세요!"
      />
    </div>
  );
}

export default EditorPage;
```

---

### Step 4 — App.tsx에 페이지 전환 추가 (`client/src/App.tsx`)

기존 `App.tsx`에 에디터 페이지로 이동하는 탭 버튼을 추가합니다.

```tsx
import { useEffect, useState } from 'react'
import * as todoApi from './api/todoApi';
import type { Todo } from './api/todoApi';
import EditorPage from './EditorPage'; // ← 추가
import './App.css'

function App() {
  // 현재 보여줄 페이지: 'todo' 또는 'editor'
  const [page, setPage] = useState<'todo' | 'editor'>('todo');

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
    if (input === '') return;
    await todoApi.createTodo(input);
    setInput('');
    fetchTodos();
  };

  const handleToggle = async (id: number, completed: boolean) => {
    await todoApi.updateTodo(id, !completed);
    fetchTodos();
  };

  return (
    <div style={{ padding: "20px" }}>

      {/* ── 탭 버튼 ── */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => setPage('todo')}
          style={{
            marginRight: '8px',
            padding: '8px 16px',
            background: page === 'todo' ? '#4CAF50' : '#eee',
            color: page === 'todo' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          📋 Todo List
        </button>
        <button
          onClick={() => setPage('editor')}
          style={{
            padding: '8px 16px',
            background: page === 'editor' ? '#4CAF50' : '#eee',
            color: page === 'editor' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          📝 공유 에디터
        </button>
      </div>

      {/* ── 페이지 전환 ── */}
      {page === 'todo' ? (
        <div>
          <h1>나의 투두 리스트</h1>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="할 일을 입력하세요"
          />
          <button onClick={handleAdd}>추가</button>
          <ul>
            {todos.map((todo) => (
              <li key={todo.todoNum}>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => handleToggle(todo.todoNum, todo.completed)}
                />
                <span style={{ textDecoration: todo.completed ? "line-through" : "none" }}>
                  {todo.content}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EditorPage />
      )}

    </div>
  );
}

export default App;
```

---

### Step 5 — 실행 및 테스트

**서버 실행**
```bash
cd server
npm run dev
```

콘솔에 이런 메시지가 나오면 성공:
```
Server is running at http://0.0.0.0:4000
WebSocket server is also running on ws://0.0.0.0:4000
```

**클라이언트 실행**
```bash
cd client
npm run dev
```

**테스트 방법**
1. 브라우저에서 `http://localhost:5173` 열기
2. "공유 에디터" 탭 클릭
3. **새 탭** 또는 **다른 브라우저**에서도 같은 주소 열기
4. 한쪽에서 글자 입력 → 다른 쪽에 실시간 반영 확인!
5. 서버 콘솔에서 접속 인원 로그 확인

---

## 4. 코드 흐름 전체 그림

```
[브라우저 A]                  [서버]                  [브라우저 B]
    |                           |                           |
    |── ws://localhost:4000 ───>|                           |
    |                   (connection 이벤트 발생)             |
    |<── { type:'init', ... } ──|                           |
    |                           |<── ws://localhost:4000 ───|
    |                   (connection 이벤트 발생)             |
    |                           |── { type:'init', ... } ──>|
    |                           |                           |
    | (A가 글자 입력)             |                           |
    |── { type:'edit',          |                           |
    |    content:'안녕' } ──────>|                           |
    |                   editorContent = '안녕'              |
    |                           |── { type:'update',        |
    |                           |    content:'안녕' } ──────>|
    |                           |               (B 화면 갱신)|
```

---

## 5. 추가 학습 포인트 (여유가 있다면)

### 현재 구현의 한계
- **서버 재시작 시 내용이 사라짐** → DB에 저장하면 해결
- **커서 위치가 겹침** → 실제 Notion은 OT(Operational Transformation) 또는 CRDT 알고리즘 사용
- **자동 재연결 없음** → 네트워크 끊기면 수동 새로고침 필요

### 심화 질문
1. 현재 `editorContent`는 서버 메모리에만 있습니다. 서버가 꺼지면 내용이 사라져요. 어떻게 DB에 저장할 수 있을까요?
2. A와 B가 동시에 같은 위치를 수정하면 어떻게 될까요? (충돌 문제)
3. `client !== ws` 조건을 빼면 어떻게 될까요? 직접 테스트해보세요.

---

## 정리

| 오늘 배운 것 | 핵심 |
|------------|------|
| WebSocket | 서버-클라이언트 양방향 통신, 연결 유지 |
| `ws` 패키지 | Node.js용 순수 WebSocket 서버 구현체 |
| `socket.io` 차이 | 편의 기능이 많지만 표준 클라이언트와 호환 안됨 |
| 브로드캐스트 | 접속한 모든 클라이언트에게 동시 메시지 전송 |
| `useRef` | 리렌더링 없이 값을 저장할 때 사용 (ws 객체 보관) |
| `Set` | 중복 없는 클라이언트 목록 관리 |
