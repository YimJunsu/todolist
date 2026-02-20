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
    const ws = new WebSocket('ws://192.168.10.122:4000'); // 아이피로해야 같은 망 사용자들 접속가능, 운영 배포시 도메인으로, https시 wss로
    wsRef.current = ws;

    // 연결 성공
    ws.onopen = () => {
      console.log('WebSocket 연결됨!');
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
      console.log('WebSocket 연결 끊김');
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
      <h1>실시간 공유 에디터</h1>
      <p style={{ color: '#666' }}>실시간 공유</p>
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
