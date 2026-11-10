import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AreaSeries, ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp, type WhitespaceData, type AreaData } from 'lightweight-charts';
import { usd, type PriceSample, type Side } from './api';

export type StrikeLine = { value: number; who: 'you' | 'ghost' | 'beat'; side: Side };
const EMBER = '#d24e17';
const INK = '#16131e';
const GHOST = '#5b6474';
const STEP = 4; // the server samples the Predict forward every 4 s

/**
 * BTC on DeepBook Predict (the forward the server samples every 4 s), drawn up to the market's close.
 * Dashed lines: the price to beat, your strike and the ghost's strike. The hatched band between your strike
 * and the ghost's is the dead zone, where you both lose.
 */
export default function Chart({ samples, expiryMs, lines, compact = false, minutes = 8 }: { samples: PriceSample[]; expiryMs: number | null; lines: StrikeLine[]; compact?: boolean; minutes?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Area'> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const extra = useRef<number[]>([]);
  const [overlay, setOverlay] = useState<{ dead: [number, number] | null; close: number | null }>({ dead: null, close: null });

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#6a6575', fontFamily: 'Space Mono, ui-monospace, monospace', fontSize: compact ? 10 : 11, attributionLogo: false },
      grid: { vertLines: { color: 'rgba(23,19,33,0.04)' }, horzLines: { color: 'rgba(23,19,33,0.06)' } },
      rightPriceScale: { borderColor: 'rgba(23,19,33,0.1)', scaleMargins: { top: 0.12, bottom: 0.1 } },
      timeScale: { borderColor: 'rgba(23,19,33,0.1)', timeVisible: true, secondsVisible: !compact, rightOffset: 0, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(23,19,33,0.3)', labelBackgroundColor: INK }, horzLine: { color: 'rgba(23,19,33,0.3)', labelBackgroundColor: INK } },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: (p: number) => usd(p, compact ? 0 : 2) },
    });
    const s = c.addSeries(AreaSeries, {
      lineColor: EMBER,
      lineWidth: 2,
      topColor: 'rgba(210,78,23,0.16)',
      bottomColor: 'rgba(210,78,23,0)',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = original();
        if (!r || !extra.current.length) return r;
        return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...extra.current), maxValue: Math.max(r.priceRange.maxValue, ...extra.current) } };
      },
    });
    chart.current = c;
    series.current = s;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      priceLines.current = [];
    };
  }, [compact]);

  // Price data, then whitespace every 4 s up to the close so the close sits at the right edge.
  const lastAt = samples.at(-1)?.at ?? 0;
  useEffect(() => {
    const s = series.current;
    const c = chart.current;
    if (!s || !c) return;
    const since = lastAt - minutes * 60_000;
    const bySec = new Map<number, number>();
    for (const x of samples) if (x.at >= since) bySec.set(Math.floor(x.at / 1000), x.forward);
    const data: (AreaData | WhitespaceData)[] = [...bySec.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ time: t as UTCTimestamp, value: v }));
    const last = data.at(-1);
    if (last && expiryMs) {
      const end = Math.floor(expiryMs / 1000);
      for (let t = (last.time as number) + STEP; t < end; t += STEP) data.push({ time: t as UTCTimestamp });
      if (end > (last.time as number)) data.push({ time: end as UTCTimestamp });
    }
    s.setData(data);
    c.timeScale().fitContent();
  }, [lastAt, expiryMs, samples.length, minutes]);

  // Strike lines.
  const key = lines.map((l) => `${l.who}:${l.value}:${l.side}`).join('|');
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    for (const p of priceLines.current) s.removePriceLine(p);
    extra.current = lines.map((l) => l.value);
    priceLines.current = lines.map((l) =>
      s.createPriceLine({
        price: l.value,
        color: l.who === 'ghost' ? GHOST : l.who === 'you' ? EMBER : INK,
        lineWidth: l.who === 'beat' ? 1 : 2,
        lineStyle: l.who === 'ghost' ? LineStyle.Dashed : l.who === 'beat' ? LineStyle.LargeDashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: compact ? '' : l.who === 'beat' ? `${l.side === 'up' ? 'Up above' : 'Down below'}` : l.who === 'you' ? `You · ${l.side === 'up' ? 'Up' : 'Down'}` : `Ghost · ${l.side === 'up' ? 'Up' : 'Down'}`,
      }),
    );
  }, [key]);

  // The dead zone band and the close line are HTML on top of the canvas, placed with the chart's own coordinates.
  const you = lines.find((l) => l.who === 'you');
  const gh = lines.find((l) => l.who === 'ghost');
  useLayoutEffect(() => {
    const c = chart.current;
    const s = series.current;
    if (!c || !s) return;
    const place = () => {
      let dead: [number, number] | null = null;
      if (you && gh && you.value !== gh.value) {
        const a = s.priceToCoordinate(Math.max(you.value, gh.value));
        const b = s.priceToCoordinate(Math.min(you.value, gh.value));
        if (a != null && b != null) dead = [a, b];
      }
      const close = expiryMs ? c.timeScale().timeToCoordinate(Math.floor(expiryMs / 1000) as UTCTimestamp) : null;
      setOverlay({ dead, close });
    };
    const raf = requestAnimationFrame(place);
    c.timeScale().subscribeSizeChange(place);
    return () => {
      cancelAnimationFrame(raf);
      c.timeScale().unsubscribeSizeChange(place);
    };
  }, [key, lastAt, expiryMs]);

  const waiting = samples.length < 2;
  return (
    <div className="chart-wrap">
      <div className="chart" ref={box} aria-hidden={waiting} />
      {!waiting && overlay.dead && (
        <div className="deadzone" style={{ top: overlay.dead[0], height: Math.max(3, overlay.dead[1] - overlay.dead[0]) }} data-film="dead-zone">
          {overlay.dead[1] - overlay.dead[0] > 16 && <span>Dead zone · you both lose</span>}
        </div>
      )}
      {!waiting && overlay.close != null && overlay.close > 0 && (
        <div className="closeline" style={{ left: overlay.close }}>
          <span>close</span>
        </div>
      )}
      {waiting && (
        <div className="chart-wait">
          <i className="pulse" /> Collecting live BTC prices from DeepBook Predict…
        </div>
      )}
    </div>
  );
}
