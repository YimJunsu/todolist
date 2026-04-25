import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';

const COINS = [
  { symbol: 'BTCUSDT', label: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', label: 'ETH', name: 'Ethereum' },
  { symbol: 'BNBUSDT', label: 'BNB', name: 'BNB Chain' },
  { symbol: 'SOLUSDT', label: 'SOL', name: 'Solana' },
  { symbol: 'XRPUSDT', label: 'XRP', name: 'XRP' },
  { symbol: 'ADAUSDT', label: 'ADA', name: 'Cardano' },
  { symbol: 'DOGEUSDT', label: 'EDOG', name: 'Dogecoin' },
  { symbol: 'AVAXUSDT', label: 'AVAX', name: 'Avalanche' },
  { symbol: 'DOTUSDT', label: 'DOT', name: 'Polkadot' },
  { symbol: 'LINKUSDT', label: 'LINK', name: 'Chainlink' },
];

const INTERVALS = [
  { value: '1m', label: '1M' },
  { value: '5m', label: '5M' },
  { value: '15m', label: '15M' },
  { value: '30m', label: '30M' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

interface Ticker {
  price: string;
  rawChange: number;
  changePercent: string;
  high: string;
  low: string;
  volume: string;
}

const S = {
  page: {
    minHeight: '100vh',
    background: '#0a0e17',
    color: '#f1f5f9',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    padding: '20px',
  } as React.CSSProperties,
  card: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
  } as React.CSSProperties,
  coinBtn: (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: '8px',
    border: active ? '1px solid #3b82f6' : '1px solid #1f2937',
    background: active ? '#1d4ed820' : 'transparent',
    color: active ? '#60a5fa' : '#9ca3af',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    marginRight: '6px',
    marginBottom: '6px',
  }),
  intervalBtn: (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    background: active ? '#3b82f6' : 'transparent',
    color: active ? '#fff' : '#6b7280',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
  }),
};

export default function CryptoPage() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [coin, setCoin] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Init chart once on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d1117' },
        textColor: '#94a3b8',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: '#1e293b',
        textColor: '#94a3b8',
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 460,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });

    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const onResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
    };
  }, []);

  // Load data & connect WS when coin/interval changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    // Close existing WS
    wsRef.current?.close();
    setConnected(false);

    // Fetch 24hr ticker
    fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${coin}`)
      .then(r => r.json())
      .then(d => {
        const chg = parseFloat(d.priceChangePercent);
        setTicker({
          price: parseFloat(d.lastPrice).toLocaleString('en-US', { maximumFractionDigits: 8 }),
          rawChange: chg,
          changePercent: chg.toFixed(2),
          high: parseFloat(d.highPrice).toLocaleString('en-US', { maximumFractionDigits: 8 }),
          low: parseFloat(d.lowPrice).toLocaleString('en-US', { maximumFractionDigits: 8 }),
          volume: parseFloat(d.quoteVolume).toLocaleString('en-US', {
            maximumFractionDigits: 0,
          }),
        });
      })
      .catch(() => {});

    // Fetch historical klines
    setLoading(true);
    fetch(`https://api.binance.com/api/v3/klines?symbol=${coin}&interval=${interval}&limit=500`)
      .then(r => r.json())
      .then((data: any[][]) => {
        const candles: CandlestickData[] = data.map(k => ({
          time: Math.floor(k[0] / 1000) as Time,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
        }));

        const volumes = data.map(k => ({
          time: Math.floor(k[0] / 1000) as Time,
          value: parseFloat(k[5]),
          color: parseFloat(k[4]) >= parseFloat(k[1]) ? '#10b98130' : '#ef444430',
        }));

        candleSeriesRef.current?.setData(candles);
        volumeSeriesRef.current?.setData(volumes);
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Connect WebSocket
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${coin.toLowerCase()}@kline_${interval}`
    );

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data);
      const k = msg.k;

      const candle: CandlestickData = {
        time: Math.floor(k.t / 1000) as Time,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
      };

      candleSeriesRef.current?.update(candle);
      volumeSeriesRef.current?.update({
        time: Math.floor(k.t / 1000) as Time,
        value: parseFloat(k.v),
        color: parseFloat(k.c) >= parseFloat(k.o) ? '#10b98130' : '#ef444430',
      });

      const livePrice = parseFloat(k.c);
      setTicker(prev =>
        prev
          ? { ...prev, price: livePrice.toLocaleString('en-US', { maximumFractionDigits: 8 }) }
          : prev
      );
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [coin, interval]);

  const coinInfo = COINS.find(c => c.symbol === coin)!;
  const isUp = (ticker?.rawChange ?? 0) >= 0;

  return (
    <div style={S.page}>
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        {/* Coin Name + Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>
              {coinInfo.label}
              <span style={{ fontSize: '13px', color: '#6b7280', marginLeft: '6px', fontWeight: 400 }}>
                / USDT
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>{coinInfo.name}</div>
          </div>
        </div>

        {/* Price + Change */}
        {ticker && (
          <>
            <div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: isUp ? '#10b981' : '#ef4444',
                  letterSpacing: '-0.5px',
                }}
              >
                ${ticker.price}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isUp ? '#10b98115' : '#ef444415',
                border: `1px solid ${isUp ? '#10b98130' : '#ef444430'}`,
                borderRadius: '8px',
                padding: '6px 12px',
              }}
            >
              <span style={{ fontSize: '18px' }}>{isUp ? '▲' : '▼'}</span>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: isUp ? '#10b981' : '#ef4444',
                }}
              >
                {isUp ? '+' : ''}{ticker.changePercent}%
              </span>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
              {[
                { label: '24H 고가', value: `$${ticker.high}`, color: '#10b981' },
                { label: '24H 저가', value: `$${ticker.low}`, color: '#ef4444' },
                { label: '24H 거래량', value: `$${ticker.volume}`, color: '#94a3b8' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: item.color }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Connection status */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: connected ? '#10b981' : '#6b7280',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: connected ? '#10b981' : '#4b5563',
              display: 'inline-block',
              boxShadow: connected ? '0 0 6px #10b981' : 'none',
            }}
          />
          {connected ? 'LIVE' : '연결 중...'}
        </div>
      </div>

      {/* Coin Selector */}
      <div style={S.card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0' }}>
          {COINS.map(c => (
            <button
              key={c.symbol}
              style={S.coinBtn(c.symbol === coin)}
              onClick={() => setCoin(c.symbol)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Card */}
      <div
        style={{
          ...S.card,
          padding: '0',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Interval selector bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid #1e293b',
            gap: '4px',
          }}
        >
          <span style={{ fontSize: '12px', color: '#6b7280', marginRight: '8px' }}>구간</span>
          {INTERVALS.map(iv => (
            <button
              key={iv.value}
              style={S.intervalBtn(iv.value === interval)}
              onClick={() => setInterval(iv.value)}
            >
              {iv.label}
            </button>
          ))}
        </div>

        {/* Loading overlay */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0d111780',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <div style={{ color: '#3b82f6', fontSize: '14px' }}>데이터 로딩 중...</div>
          </div>
        )}

        <div ref={chartContainerRef} style={{ width: '100%' }} />
      </div>
    </div>
  );
}
