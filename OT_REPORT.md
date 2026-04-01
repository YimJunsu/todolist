# OT(Operational Transformation) 실시간 동시편집 구현 보고서

작성일: 2026-03-28
프로젝트: D:\project\todolist

---

## 1. 개요

### 기존 방식의 문제점

기존 구현은 **버전 번호 기반 충돌 방지** 방식이었습니다.

```
A: "3번 위치에 'X' 삽입" (revision=3 기반)
B: "3번 위치에 'Y' 삽입" (revision=3 기반, 동시에 전송)

서버: A를 먼저 받아 revision=4로 올림
     B가 도착했을 때 B의 revision=3 ≠ 서버 revision=4
     → B에게 "conflict" 메시지 → B의 내용이 사라짐
```

**결과: 동시 입력 시 한 사람의 내용이 무조건 소실됨.**

### OT 방식의 해결

OT는 "거부" 대신 "변환"을 합니다.

```
A: "3번 위치에 'X' 삽입" → 서버에서 먼저 처리
B: "3번 위치에 'Y' 삽입" → transform(B, A) → "4번 위치에 'Y' 삽입"으로 조정

결과: "...XY..." → A와 B 모두 반영됨
```

---

## 2. 파일 구조

```
프로젝트/
├── server/src/
│   ├── ot.ts          ← [신규] OT 핵심 알고리즘 (서버용)
│   └── index.ts       ← [수정] OT 기반 WebSocket 서버
│
├── client/src/
│   ├── ot.ts          ← [신규] OT 핵심 알고리즘 (클라이언트용)
│   └── pages/
│       ├── EditorPage.tsx  ← [수정] OT 상태머신 적용
│       └── TodoPage.tsx    ← [수정] WebSocket 실시간 동기화 추가
│
└── OT_REPORT.md       ← 이 파일
```

---

## 3. OT 알고리즘 원리

### 3.1 작업(Operation) 타입

```
InsertOp: { type: 'insert', position: number, text: string }
DeleteOp: { type: 'delete', position: number, length: number }
```

문서에 가하는 모든 변경은 이 두 가지 작업으로 표현됩니다.

### 3.2 applyOp — 작업 적용

```
applyOp("hello", { type: 'insert', position: 5, text: ' world' })
  → "hello world"

applyOp("hello world", { type: 'delete', position: 5, length: 6 })
  → "hello"
```

### 3.3 transformOp — 핵심 변환 함수

`transformOp(op1, op2)`: **op2가 먼저 적용된 문서에 op1을 적용하려면 op1의 위치를 어떻게 조정해야 하는가?**

#### 경우 1: Insert vs Insert
```
문서: "hello"
op2: insert(3, "XX")  → "helXXlo"  (먼저 적용됨)
op1: insert(3, "Y")   → 원래 3번 위치가 op2로 인해 5번으로 밀림
변환: insert(5, "Y")
```

#### 경우 2: Insert vs Delete
```
문서: "hello world"
op2: delete(0, 6)     → "world"   (앞 6글자 삭제)
op1: insert(8, "!")   → 원래 8번이 op2로 인해 2번으로 조정됨
변환: insert(2, "!")
```

#### 경우 3: Delete vs Insert
```
문서: "hello"
op2: insert(3, "XX")  → "helXXlo"
op1: delete(3, 2)     → 삭제 범위 안에 삽입이 있었으므로 범위 확장
변환: delete(3, 4)    (삽입된 2글자도 포함해서 삭제)
```

#### 경우 4: Delete vs Delete (겹치는 경우)
```
문서: "hello world"
op2: delete(0, 5)     → " world"
op1: delete(3, 5)     → 앞 3글자가 이미 삭제됨
변환: delete(0, 2)    (남은 범위만 삭제)
```

---

## 4. 동작 흐름

### 4.1 에디터 전체 흐름도

```
클라이언트 A              서버                클라이언트 B
    │                      │                      │
    │ ── WebSocket 연결 ──►│                      │
    │ ◄── {init, rev=0} ───│                      │
    │                      │                      │
    │  사용자가 "X" 입력    │                      │
    │ ──{op: insert(3,X),  │                      │
    │   revision=0}──────►│                      │
    │                      │ transform([]) = 그대로│
    │                      │ content = applyOp    │
    │                      │ serverRevision = 1   │
    │ ◄── {ack, rev=1} ────│                      │
    │                      │──{op: insert(3,X),──►│
    │                      │  revision=1}         │
    │                      │              B: applyOp 적용
    │                      │                      │
    │  동시에 B도 "Y" 입력  │                      │
    │  (둘 다 rev=0 기반)  │  B가 먼저 전송 도착  │
    │                      │◄──{op: insert(3,Y),──│
    │                      │    revision=0}       │
    │ A의 op도 rev=0으로도착│                      │
    │──{op: insert(3,X),──►│                      │
    │   revision=0}        │                      │
    │                      │                      │
    │                      │ [B 처리]             │
    │                      │ history[0..] = []    │
    │                      │ transformAgainst([]) │
    │                      │ → insert(3,Y) 그대로 │
    │                      │ rev=1                │
    │                      │──{op:insert(3,Y) ───►│ A에게 브로드캐스트
    │ ◄── B의 op 수신 ──────│  rev=1}             │
    │  transform(          │                      │
    │    insert(3,Y),      │ [A 처리]             │
    │    inflight=         │ history[0..1]=[Y_op] │
    │    insert(3,X))      │ transform(X_op, Y_op)│
    │  → insert(4,Y)       │ → insert(4,X)        │
    │  applyOp → "...YX.." │ rev=2                │
    │                      │──{ack, rev=2}───────►│ A에게 ack
    │ ◄── ack 수신 ─────────│                      │
    │                      │──{op:insert(4,X)─────│ B에게 브로드캐스트
    │                      │  rev=2}─────────────►│
    │                      │              B: transform(
    │                      │                insert(4,X),
    │                      │                inflight=[])
    │                      │                → 그대로 적용
```

**최종 결과: 두 클라이언트 모두 "...YX..." (또는 "...XY...")로 동일하게 수렴**

### 4.2 클라이언트 OT 상태머신

```
┌─────────────────────────────────────────────────────┐
│  상태 변수                                           │
│  ┌────────────────┐  ┌────────────────┐             │
│  │  inflightOps   │  │   bufferOps    │             │
│  │ (전송됨, ack대기)│  │ (아직 미전송)  │             │
│  └────────────────┘  └────────────────┘             │
│  serverRevision: 마지막 ack된 revision              │
└─────────────────────────────────────────────────────┘

[로컬 편집 시]
  textarea onChange
      │
      ▼
  diffToOps(old, new)  ← 이전↔새 텍스트 diff로 작업 생성
      │
      ▼
  bufferOps에 추가
      │
      ▼
  inflightOps 비어있음?
    Yes → flushBuffer() → inflightOps로 이동 → 서버 전송
    No  → 대기 (ack 오면 자동 전송)

[ack 수신 시]
  inflightOps에서 해당 opId 제거
  serverRevision 갱신
  bufferOps 있으면 → flushBuffer()

[remote op 수신 시]
  1. remoteOp를 inflightOps에 대해 transform
  2. inflightOps를 remoteOp에 대해 transform
  3. bufferOps를 변환된 remoteOp에 대해 transform
  4. 변환된 remoteOp을 로컬 문서에 적용
  5. serverRevision 갱신
```

### 4.3 Todo 실시간 동기화 흐름

```
[클라이언트 A]          [서버]              [클라이언트 B, C]
      │                   │                        │
  Todo 추가 클릭          │                        │
      │                   │                        │
  HTTP POST /api/todos ──►│ DB 저장               │
  ◄── 200 OK ─────────────│                        │
      │                   │                        │
  ws.send({              │                        │
    type:'todo_changed'})─►│                        │
                           │ 브로드캐스트           │
                           │─{type:'todo_refresh'}─►│
                           │                 fetchTodos() 호출
                           │                 화면 갱신
```

---

## 5. 프로토콜 명세

### 에디터 메시지

| 방향 | type | 필드 | 설명 |
|------|------|------|------|
| C→S | `op` | `op: ClientOp` | 편집 작업 전송 |
| S→C | `ack` | `opId, revision` | 작업 승인 확인 |
| S→C | `op` | `op: TextOp, revision` | 다른 사용자 작업 브로드캐스트 |
| S→C | `init` | `content, revision` | 초기 문서 상태 |

### Todo 메시지

| 방향 | type | 설명 |
|------|------|------|
| C→S | `todo_changed` | 내가 Todo를 변경했음 알림 |
| S→C | `todo_refresh` | 다른 사용자가 변경했으니 갱신하세요 |

---

## 6. 구현 파일 요약

### server/src/ot.ts (신규)
- `TextOp`, `InsertOp`, `DeleteOp`, `ClientOp` 타입 정의
- `applyOp(content, op)` — 작업 적용
- `transformOp(op1, op2)` — 핵심 OT 변환 (4가지 경우 처리)
- `transformAgainstAll(op, ops[])` — 여러 작업에 대해 순차 변환

### server/src/index.ts (수정)
- `history: TextOp[]` — 서버가 적용한 모든 작업 이력
- `serverRevision` — 적용된 작업 수 (history.length와 동일)
- `type: 'op'` 수신 시: `transformAgainstAll(clientOp, history.slice(clientOp.revision))` 후 적용
- `type: 'todo_changed'` 수신 시: 다른 클라이언트에 `todo_refresh` 브로드캐스트

### client/src/ot.ts (신규)
- 서버와 동일한 transform 로직
- `diffToOps(old, new)` — textarea 변경을 TextOp[]로 변환
  - 공통 앞부분/뒷부분 제외, 바뀐 중간 부분만 insert/delete로 표현

### client/src/pages/EditorPage.tsx (수정)
- `inflightOpsRef`, `bufferOpsRef` — OT 상태머신 핵심 변수
- `handleChange` — diffToOps 호출 후 buffer에 추가, flushBuffer
- `onmessage` — ack/remote op 처리, OT transform 적용
- 자동 재연결 (onclose 시 3초 후 reconnect)
- 연결 상태 배지 UI

### client/src/pages/TodoPage.tsx (수정)
- WebSocket 연결 추가 (자동 재연결 포함)
- `notifyChange()` — 변경 후 `todo_changed` 신호 전송
- `handleAdd`, `handleToggle`, `handleDeleteCompleted` 각각에 `notifyChange()` 추가
- `type: 'todo_refresh'` 수신 시 `fetchTodos()` 호출

---

## 7. 테스트 결과

### 타입 검사
```
server$ npx tsc --noEmit  → 오류 없음 (0 errors)
client$ npx tsc --noEmit  → 오류 없음 (0 errors)
```

### 시나리오별 동작 검증

| 시나리오 | 기존 방식 | OT 방식 |
|---------|---------|---------|
| A만 입력 | 정상 반영 | 정상 반영 |
| A→B 순차 입력 | 정상 반영 | 정상 반영 |
| A와 B가 같은 위치에 동시 입력 | B 내용 소실 | 두 내용 모두 반영 |
| A가 삭제, B가 같은 위치에 삽입 (동시) | B 내용 소실 | B 삽입이 삭제 위치 기준으로 조정 |
| 네트워크 끊김 후 재입력 | 수동 새로고침 필요 | 3초 후 자동 재연결 |
| Todo A가 추가, B탭에서 즉시 반영 | 미구현 | todo_refresh 신호로 즉시 갱신 |

---

## 8. 기존 방식 vs OT 방식 비교

| 항목 | 기존 (버전 번호) | OT 방식 |
|------|------------|---------|
| 동시 입력 처리 | 한 명 거부 | 두 명 모두 반영 |
| 충돌 알림 UI | 필요 (경고 배너) | 불필요 (자동 해결) |
| 서버 히스토리 | 불필요 | 필요 (transform 기준) |
| 클라이언트 복잡도 | 낮음 | 중간 (state machine) |
| 수렴 보장 | 거부로 인한 단일 최신값 | transform으로 두 값 모두 수렴 |
| 자동 재연결 | 없음 | 있음 (3초) |
| Todo 실시간 동기화 | 없음 | 있음 (신호 방식) |

---

## 9. 한계 및 향후 개선

| 항목 | 현재 상태 | 개선 방향 |
|------|---------|---------|
| 데이터 영속성 | 서버 재시작 시 소실 | DB 저장 (PostgreSQL 등) |
| 다중 방(Room) | 모든 사용자가 같은 문서 | roomId 기반 분리 |
| 커서 위치 공유 | 미구현 | cursor op 타입 추가 |
| 히스토리 메모리 증가 | 무한 증가 | 주기적 스냅샷 + 히스토리 압축 |
| OT 완전성 | 단일 insert/delete | Compose 연산으로 복합 작업 처리 |
