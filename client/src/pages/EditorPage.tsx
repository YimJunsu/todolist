/**
 * EditorPage.tsx — OT(Operational Transformation) 방식 실시간 공유 에디터
 *
 * ─────────────────────────────────────────────────────────────────
 * 기존(버전 번호) vs OT 방식 비교
 * ─────────────────────────────────────────────────────────────────
 * [기존] 동시 입력 → "충돌" → 한 명의 내용이 사라짐
 * [OT]  동시 입력 → transform → 두 입력 모두 올바르게 반영됨
 *
 * ─────────────────────────────────────────────────────────────────
 * 클라이언트 OT 상태 머신
 * ─────────────────────────────────────────────────────────────────
 *
 *   serverRevision  : 마지막으로 서버가 확인한(ack) revision 번호
 *   inflightOpRef   : 서버에 보냈으나 아직 ack를 받지 못한 작업 큐
 *   bufferOpsRef    : 로컬에서 생성됐지만 아직 서버에 보내지 않은 작업 큐
 *
 *         로컬 편집
 *            │
 *            ▼
 *     bufferOps에 추가
 *            │ inflightOps가 비어있으면
 *            ▼
 *     서버로 전송 → inflightOps로 이동
 *            │
 *     ┌──────┴──────┐
 *     │             │
 *  ack 수신      remote op 수신
 *     │             │
 *  inflight 해제  transform 후 로컬 적용
 *  buffer 전송   inflight/buffer도 transform
 *
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { applyOp, transformOp, diffToOps } from '../ot';
import type { TextOp } from '../ot';

// 서버로 보내는 작업 타입 (TextOp + 메타정보)
type ClientOp = TextOp & {
  revision: number; // 작업 기반 서버 revision
  opId: string;     // ack 매칭용 고유 ID
};

/** 고유 ID 생성기 (타임스탬프 + 랜덤) */
function genOpId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function EditorPage() {
  // 에디터에 표시할 텍스트
  const [content, setContent] = useState('');

  // 연결 상태 표시용 (connected / disconnected / reconnecting)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  // OT 상태: 서버 revision (ref를 쓰는 이유 — 값 변경 시 리렌더링 불필요)
  const serverRevisionRef = useRef<number>(0);

  /**
   * inflightOps: 서버에 전송했으나 ack를 받지 못한 작업 배열
   *
   * ack가 오면 앞에서부터 하나씩 제거합니다.
   * remote op를 수신하면 이 배열의 모든 작업에 대해 transform합니다.
   */
  const inflightOpsRef = useRef<ClientOp[]>([]);

  /**
   * bufferOps: 아직 서버에 보내지 않은 로컬 작업 배열
   *
   * inflightOps가 모두 ack되면 이 배열을 서버로 전송합니다.
   * remote op를 수신하면 이 배열도 transform합니다.
   */
  const bufferOpsRef = useRef<TextOp[]>([]);

  // WebSocket 연결 객체
  const wsRef = useRef<WebSocket | null>(null);

  // 현재 로컬 텍스트 (ref로도 유지 — 이벤트 핸들러에서 최신값 참조용)
  const contentRef = useRef<string>('');

  // 재연결 타이머
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ──────────────────────────────────────────────────────────────
  // 서버로 작업 전송
  // ──────────────────────────────────────────────────────────────

  /**
   * bufferOps를 서버로 전송합니다.
   *
   * 호출 조건: inflightOps가 비어있을 때만 호출해야 합니다.
   * (한 번에 하나의 작업만 inflight 상태로 유지 — 단순 OT 구현)
   */
  const flushBuffer = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (bufferOpsRef.current.length === 0) return;
    if (inflightOpsRef.current.length > 0) return; // 아직 대기 중인 inflight 있음

    // bufferOps를 모두 inflight로 이동하고 서버에 전송
    const opsToSend = bufferOpsRef.current.splice(0);
    const clientOps: ClientOp[] = opsToSend.map(op => ({
      ...op,
      revision: serverRevisionRef.current,
      opId: genOpId(),
    }));

    inflightOpsRef.current = clientOps;

    // 각 작업을 개별 메시지로 전송
    for (const clientOp of clientOps) {
      ws.send(JSON.stringify({ type: 'op', op: clientOp }));
      console.log(`[OT] → 서버 전송: ${clientOp.type} pos=${clientOp.position} rev=${clientOp.revision}`);
    }
  }, []);

  // ──────────────────────────────────────────────────────────────
  // WebSocket 연결 및 메시지 처리
  // ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] 연결됨');
      setConnectionStatus('connected');
    };

    ws.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      // ── 초기화: 서버의 현재 문서 상태 수신 ──
      if (message.type === 'init') {
        contentRef.current = message.content;
        setContent(message.content);
        serverRevisionRef.current = message.revision;
        console.log(`[OT] 초기화 — revision=${message.revision}`);
      }

      // ── ack: 내가 보낸 작업이 서버에서 승인됨 ──
      if (message.type === 'ack') {
        // ack된 opId와 일치하는 작업을 inflight에서 제거
        inflightOpsRef.current = inflightOpsRef.current.filter(
          op => op.opId !== message.opId
        );
        serverRevisionRef.current = message.revision;
        console.log(`[OT] ack 수신 — revision=${message.revision}, inflight 남음=${inflightOpsRef.current.length}`);

        // inflight가 모두 처리됐으면 buffer를 전송
        if (inflightOpsRef.current.length === 0) {
          flushBuffer();
        }
      }

      // ── remote op: 다른 사용자의 작업 수신 ──
      if (message.type === 'op') {
        let remoteOp: TextOp = message.op;
        serverRevisionRef.current = message.revision;

        console.log(`[OT] remote op 수신: ${remoteOp.type} pos=${remoteOp.position} rev=${message.revision}`);

        /**
         * [OT 핵심] remote op를 내 pending 작업들에 대해 transform합니다.
         *
         * 왜 필요한가?
         *   서버는 remote op를 적용한 뒤의 문서 상태를 기준으로 내 작업을 transform합니다.
         *   클라이언트는 remote op 적용 전의 문서에 내 작업을 쌓아뒀습니다.
         *   remote op가 문서를 바꿨으므로 내 작업의 위치도 조정해야 합니다.
         *
         * 변환 방향:
         *   remoteOp' = transform(remoteOp, inflightOp1, inflightOp2, ...)
         *             → 내 inflight 작업들이 먼저 적용된 상태에서 remote op를 적용
         *   inflightOp' = transform(inflightOp, remoteOp)
         *             → remote op가 적용된 상태에서 내 작업을 적용
         */

        // 1단계: inflightOps에 대해 remoteOp를 변환
        for (const inflightOp of inflightOpsRef.current) {
          remoteOp = transformOp(remoteOp, inflightOp);
        }

        // 2단계: remoteOp에 대해 inflightOps를 변환 (각 inflight 순서대로)
        let prevRemote = message.op as TextOp; // 원본 remote op
        inflightOpsRef.current = inflightOpsRef.current.map(inflightOp => {
          const newInflight = transformOp(inflightOp, prevRemote) as typeof inflightOp;
          prevRemote = transformOp(prevRemote, inflightOp);
          return newInflight;
        });

        // 3단계: bufferOps도 변환된 remoteOp에 대해 transform
        bufferOpsRef.current = bufferOpsRef.current.map(bufOp => {
          const transformed = transformOp(bufOp, remoteOp);
          remoteOp = transformOp(remoteOp, bufOp);
          return transformed;
        });

        // 4단계: 변환된 remote op를 로컬 문서에 적용
        const newContent = applyOp(contentRef.current, remoteOp);
        contentRef.current = newContent;
        setContent(newContent);

        console.log(`[OT] remote op 적용 완료 — 현재 문서 길이=${newContent.length}`);
      }
    };

    ws.onclose = () => {
      console.log('[WS] 연결 끊김 — 3초 후 재연결 시도');
      setConnectionStatus('reconnecting');

      // 자동 재연결 (3초 후)
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      console.error('[WS] 오류 발생');
      ws.close();
    };
  }, [flushBuffer]);

  // 컴포넌트 마운트 시 연결, 언마운트 시 해제
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ──────────────────────────────────────────────────────────────
  // 텍스트 입력 처리
  // ──────────────────────────────────────────────────────────────

  /**
   * textarea 값이 변경될 때마다 호출됩니다.
   *
   * 처리 흐름:
   * 1. 이전 텍스트와 새 텍스트를 diff → TextOp[] 생성
   * 2. 각 작업을 로컬 문서에 즉시 적용 (반응성)
   * 3. bufferOps에 추가
   * 4. inflight가 없으면 즉시 서버로 전송 (flushBuffer)
   */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const oldContent = contentRef.current;

    // 변화 없으면 무시
    if (newContent === oldContent) return;

    // diff: 이전↔새 텍스트 차이를 작업 목록으로 변환
    const ops = diffToOps(oldContent, newContent);

    if (ops.length === 0) return;

    // 로컬 문서 즉시 업데이트 (사용자 반응성)
    contentRef.current = newContent;
    setContent(newContent);

    // bufferOps에 추가
    bufferOpsRef.current.push(...ops);

    // inflight가 없으면 즉시 전송
    flushBuffer();
  };

  // ──────────────────────────────────────────────────────────────
  // 렌더링
  // ──────────────────────────────────────────────────────────────

  /** 연결 상태 배지 색상 */
  const statusColor = {
    connected: '#4CAF50',
    disconnected: '#f44336',
    reconnecting: '#ff9800',
  }[connectionStatus];

  const statusLabel = {
    connected: '연결됨',
    disconnected: '연결 끊김',
    reconnecting: '재연결 중...',
  }[connectionStatus];

  return (
    <div style={{ padding: '20px' }}>
      <h1>실시간 공유 에디터 <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#888' }}>(OT 방식)</span></h1>

      {/* 연결 상태 배지 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{
          display: 'inline-block',
          width: '10px', height: '10px',
          borderRadius: '50%',
          backgroundColor: statusColor,
        }} />
        <span style={{ fontSize: '13px', color: '#666' }}>{statusLabel}</span>
        <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '8px' }}>
          revision: {serverRevisionRef.current}
        </span>
      </div>

      {/* OT 설명 배너 */}
      <div style={{
        background: '#e8f5e9',
        border: '1px solid #4CAF50',
        color: '#2e7d32',
        padding: '8px 14px',
        borderRadius: '6px',
        marginBottom: '12px',
        fontSize: '13px',
      }}>
        OT 방식: 동시 입력이 충돌 없이 모두 반영됩니다. 여러 탭에서 동시에 입력해보세요!
      </div>

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
          lineHeight: '1.6',
        }}
        placeholder="여기에 내용을 입력해보세요. 다른 탭에서도 동시에 입력해보세요!"
      />

      {/* 현재 OT 상태 디버그 정보 */}
      <div style={{ marginTop: '8px', fontSize: '12px', color: '#aaa' }}>
        inflight: {inflightOpsRef.current.length}개 &nbsp;|&nbsp;
        buffer: {bufferOpsRef.current.length}개
      </div>
    </div>
  );
}

export default EditorPage;
