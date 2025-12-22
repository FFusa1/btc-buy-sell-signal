import { ArrowUp, ArrowDown, Minus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradingSignalProps {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function TradingSignal({ signal, confidence, reason, onRefresh, isRefreshing }: TradingSignalProps) {
  const signalConfig = {
    BUY: {
      icon: ArrowUp,
      bgClass: 'bg-emerald-500/20 border-emerald-500/50',
      textClass: 'text-emerald-400',
      glowClass: 'shadow-emerald-500/30',
      label: 'BUY'
    },
    SELL: {
      icon: ArrowDown,
      bgClass: 'bg-rose-500/20 border-rose-500/50',
      textClass: 'text-rose-400',
      glowClass: 'shadow-rose-500/30',
      label: 'SELL'
    },
    HOLD: {
      icon: Minus,
      bgClass: 'bg-amber-500/20 border-amber-500/50',
      textClass: 'text-amber-400',
      glowClass: 'shadow-amber-500/30',
      label: 'HOLD'
    }
  };

  const config = signalConfig[signal];
  const Icon = config.icon;

  return (
    <div className={cn(
      'relative rounded-2xl border-2 p-6 backdrop-blur-sm transition-all duration-300',
      config.bgClass,
      'shadow-lg',
      config.glowClass
    )}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Signal</h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', isRefreshing && 'animate-spin')} />
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        <div className={cn(
          'w-16 h-16 rounded-xl flex items-center justify-center',
          config.bgClass
        )}>
          <Icon className={cn('w-8 h-8', config.textClass)} />
        </div>
        
        <div>
          <div className={cn('text-4xl font-bold tracking-tight', config.textClass)}>
            {config.label}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {confidence}% confidence
          </div>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {reason}
        </p>
      </div>
      
      {/* Confidence bar */}
      <div className="mt-4">
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={cn('h-full rounded-full transition-all duration-500', config.textClass.replace('text-', 'bg-'))}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>
    </div>
  );
}
