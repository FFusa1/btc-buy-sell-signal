import { Activity, TrendingUp, TrendingDown, Minus, Gauge, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IndicatorStripProps {
  sma7: number;
  sma25: number;
  rsi: number;
  momentum: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

function rsiTone(rsi: number) {
  if (rsi >= 70) return { label: 'Overbought', color: 'text-rose-400', bar: 'bg-rose-400' };
  if (rsi <= 30) return { label: 'Oversold', color: 'text-emerald-400', bar: 'bg-emerald-400' };
  if (rsi >= 55) return { label: 'Bullish', color: 'text-emerald-400', bar: 'bg-emerald-400' };
  if (rsi <= 45) return { label: 'Bearish', color: 'text-rose-400', bar: 'bg-rose-400' };
  return { label: 'Neutral', color: 'text-amber-400', bar: 'bg-amber-400' };
}

export function IndicatorStrip({ sma7, sma25, rsi, momentum, trend }: IndicatorStripProps) {
  const smaDiff = ((sma7 - sma25) / sma25) * 100;
  const smaBull = sma7 > sma25;
  const r = rsiTone(rsi);
  const momPositive = momentum >= 0;

  const TrendIcon = trend === 'BULLISH' ? TrendingUp : trend === 'BEARISH' ? TrendingDown : Minus;
  const trendColor =
    trend === 'BULLISH' ? 'text-emerald-400' : trend === 'BEARISH' ? 'text-rose-400' : 'text-amber-400';
  const trendBg =
    trend === 'BULLISH' ? 'bg-emerald-500/15' : trend === 'BEARISH' ? 'bg-rose-500/15' : 'bg-amber-500/15';

  const rsiPct = Math.max(0, Math.min(100, rsi));

  return (
    <div className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-white/70" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">
            Live Indicators (1h)
          </h3>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md',
            trendBg,
            trendColor
          )}
        >
          <TrendIcon className="w-3.5 h-3.5" />
          {trend}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* SMA Crossover */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-white/60" />
              <span className="text-[11px] uppercase tracking-wider text-white/60">SMA 7 / 25</span>
            </div>
            <span className={cn('text-xs font-semibold', smaBull ? 'text-emerald-400' : 'text-rose-400')}>
              {smaBull ? 'Bull cross' : 'Bear cross'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white">
              {smaDiff >= 0 ? '+' : ''}
              {smaDiff.toFixed(2)}%
            </span>
            <span className="text-[11px] text-white/50">SMA7 vs SMA25</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn('h-full', smaBull ? 'bg-emerald-400' : 'bg-rose-400')}
              style={{ width: `${Math.min(100, Math.abs(smaDiff) * 20)}%` }}
            />
          </div>
        </div>

        {/* RSI */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-white/60" />
              <span className="text-[11px] uppercase tracking-wider text-white/60">RSI 14</span>
            </div>
            <span className={cn('text-xs font-semibold', r.color)}>{r.label}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white">{rsi.toFixed(1)}</span>
            <span className="text-[11px] text-white/50">/ 100</span>
          </div>
          <div className="mt-2 relative h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className={cn('h-full', r.bar)} style={{ width: `${rsiPct}%` }} />
            {/* 30 / 70 markers */}
            <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: '30%' }} />
            <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: '70%' }} />
          </div>
        </div>

        {/* Momentum */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {momPositive ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span className="text-[11px] uppercase tracking-wider text-white/60">Momentum</span>
            </div>
            <span
              className={cn(
                'text-xs font-semibold',
                momPositive ? 'text-emerald-400' : 'text-rose-400'
              )}
            >
              {momPositive ? 'Rising' : 'Falling'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white">
              {momentum >= 0 ? '+' : ''}
              {momentum.toFixed(2)}%
            </span>
            <span className="text-[11px] text-white/50">10-period</span>
          </div>
          <div className="mt-2 relative h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
            <div
              className={cn('absolute top-0 bottom-0', momPositive ? 'bg-emerald-400' : 'bg-rose-400')}
              style={{
                left: momPositive ? '50%' : `${50 - Math.min(50, Math.abs(momentum) * 10)}%`,
                width: `${Math.min(50, Math.abs(momentum) * 10)}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
