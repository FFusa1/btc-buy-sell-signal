import { ArrowUp, ArrowDown, ShieldCheck, ShieldAlert, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Vote {
  source: string;
  signal: string;
  weight: number;
}

interface MasterSignalProps {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  actionable: boolean;
  threshold: number;
  agreement: number;
  votes: Vote[];
  reason: string;
}

export function MasterSignal({
  signal,
  confidence,
  actionable,
  threshold,
  agreement,
  votes,
  reason,
}: MasterSignalProps) {
  const color =
    signal === 'BUY'
      ? 'emerald'
      : signal === 'SELL'
      ? 'rose'
      : 'amber';

  const Icon = signal === 'BUY' ? ArrowUp : signal === 'SELL' ? ArrowDown : ShieldAlert;

  return (
    <div
      className={cn(
        'rounded-2xl border-2 p-6 backdrop-blur-sm transition-all',
        actionable
          ? `border-${color}-500 bg-${color}-500/15 shadow-lg shadow-${color}-500/20`
          : 'border-border/40 bg-card/40'
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-white/70" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">
            Master Bot Signal
          </h3>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md font-semibold',
            actionable
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-white/10 text-white/70'
          )}
        >
          {actionable ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" /> EXECUTE
            </>
          ) : (
            <>
              <ShieldAlert className="w-3.5 h-3.5" /> STAND DOWN
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={cn(
            'w-16 h-16 rounded-xl flex items-center justify-center',
            `bg-${color}-500/20`
          )}
        >
          <Icon className={cn('w-8 h-8', `text-${color}-400`)} />
        </div>
        <div>
          <div className={cn('text-4xl font-bold', `text-${color}-400`)}>
            {actionable ? signal : 'HOLD'}
          </div>
          <div className="text-sm text-white/70 mt-1">
            {confidence}% confidence · {agreement}% agreement
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-white/80 leading-relaxed">{reason}</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {votes.map((v) => (
          <div
            key={v.source}
            className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5"
          >
            <div className="text-[10px] uppercase tracking-wider text-white/50">
              {v.source}
            </div>
            <div
              className={cn(
                'text-xs font-semibold',
                v.signal === 'BUY'
                  ? 'text-emerald-400'
                  : v.signal === 'SELL'
                  ? 'text-rose-400'
                  : 'text-amber-400'
              )}
            >
              {v.signal} ·w{v.weight}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/60">
        <span>Bot threshold: ≥ {threshold}% conf & ≥ 75% agreement</span>
        <span className={actionable ? 'text-emerald-400' : 'text-amber-400'}>
          {actionable ? 'Conditions met' : 'Waiting for confluence'}
        </span>
      </div>
    </div>
  );
}
