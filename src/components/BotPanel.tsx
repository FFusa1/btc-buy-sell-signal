import { useEffect, useRef, useState } from 'react';
import { Bot, Play, Square, Wallet, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface BotPanelProps {
  open: boolean;
  onClose: () => void;
  masterSignal?: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    actionable: boolean;
    confidence: number;
  };
  currentPrice: number;
}

type LogEntry = {
  ts: number;
  kind: 'info' | 'buy' | 'sell' | 'error' | 'skip';
  msg: string;
};

type Position = 'FLAT' | 'LONG';

export function BotPanel({ open, onClose, masterSignal, currentPrice }: BotPanelProps) {
  const [running, setRunning] = useState(false);
  const [quoteUsdt, setQuoteUsdt] = useState(20);
  const [balance, setBalance] = useState<{ usdt: number; btc: number } | null>(null);
  const [position, setPosition] = useState<Position>('FLAT');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const lastSigRef = useRef<string>('');

  const addLog = (kind: LogEntry['kind'], msg: string) =>
    setLog((l) => [{ ts: Date.now(), kind, msg }, ...l].slice(0, 50));

  const callTrade = async (action: 'balance' | 'buy' | 'sell', extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('binance-trade', {
      body: { action, ...extra },
    });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error || 'Unknown error');
    return data;
  };

  const refreshBalance = async () => {
    try {
      const d = await callTrade('balance');
      setBalance({ usdt: d.usdt, btc: d.btc });
      // Infer position from BTC holdings (>$5 worth means LONG)
      setPosition(d.btc * currentPrice > 5 ? 'LONG' : 'FLAT');
    } catch (e: any) {
      addLog('error', `Balance: ${e.message}`);
    }
  };

  useEffect(() => {
    if (open) refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Bot loop — react to actionable master signal
  useEffect(() => {
    if (!running || !masterSignal || busy) return;
    if (!masterSignal.actionable) return;

    const sig = masterSignal.signal;
    if (sig === 'HOLD') return;

    // Dedupe — only act when signal flips
    const key = `${sig}-${position}`;
    if (lastSigRef.current === key) return;

    const execute = async () => {
      setBusy(true);
      try {
        if (sig === 'BUY' && position === 'FLAT') {
          addLog('info', `Signal BUY @ ${masterSignal.confidence}% conf → placing market BUY ${quoteUsdt} USDT`);
          const d = await callTrade('buy', { quoteUsdt });
          addLog('buy', `Bought ~${quoteUsdt} USDT of BTC (order ${d.order?.orderId ?? '?'})`);
          setBalance({ usdt: d.balance.usdt, btc: d.balance.btc });
          setPosition('LONG');
          lastSigRef.current = key;
        } else if (sig === 'SELL' && position === 'LONG') {
          addLog('info', `Signal SELL @ ${masterSignal.confidence}% conf → selling entire BTC balance`);
          const d = await callTrade('sell');
          if (d.order?.skipped) {
            addLog('skip', `Skipped: ${d.order.reason}`);
          } else {
            addLog('sell', `Sold BTC (order ${d.order?.orderId ?? '?'})`);
          }
          setBalance({ usdt: d.balance.usdt, btc: d.balance.btc });
          setPosition('FLAT');
          lastSigRef.current = key;
        } else {
          // already in target position
          lastSigRef.current = key;
        }
      } catch (e: any) {
        addLog('error', `Trade failed: ${e.message}`);
      } finally {
        setBusy(false);
      }
    };
    execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterSignal?.signal, masterSignal?.actionable, running, position]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl overflow-hidden">
        {/* Header — looks like a "Binance window" */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-gradient-to-r from-yellow-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Binance Spot — Auto Trader</div>
              <div className="text-[11px] text-yellow-400/80">TESTNET • BTC/USDT</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none px-2">×</button>
        </div>

        {/* Status row */}
        <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-white/10">
          <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[10px] uppercase text-white/50 flex items-center gap-1"><Wallet className="w-3 h-3" /> USDT</div>
            <div className="text-sm font-bold text-white">{balance ? balance.usdt.toFixed(2) : '—'}</div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[10px] uppercase text-white/50">BTC</div>
            <div className="text-sm font-bold text-white">{balance ? balance.btc.toFixed(6) : '—'}</div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
            <div className="text-[10px] uppercase text-white/50">Position</div>
            <div className={cn('text-sm font-bold', position === 'LONG' ? 'text-emerald-400' : 'text-white/70')}>{position}</div>
          </div>
        </div>

        {/* Controls — Start at top */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-white/10">
          {!running ? (
            <button
              onClick={() => { setRunning(true); lastSigRef.current = ''; addLog('info', 'Bot started — waiting for actionable master signal'); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold"
            >
              <Play className="w-4 h-4" /> START
            </button>
          ) : (
            <button
              onClick={() => { setRunning(false); addLog('info', 'Bot stopped'); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold"
            >
              <Square className="w-4 h-4" /> STOP
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-white/60">Order size (USDT)</label>
            <input
              type="number"
              min={10}
              step={5}
              value={quoteUsdt}
              onChange={(e) => setQuoteUsdt(Math.max(10, Number(e.target.value) || 10))}
              disabled={running}
              className="w-24 px-2 py-1 rounded bg-white/10 border border-white/10 text-white text-sm"
            />
            <button onClick={refreshBalance} className="text-xs text-white/60 hover:text-white underline">refresh</button>
          </div>
        </div>

        {/* Current signal preview */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between text-xs">
          <div className="text-white/70">
            Master signal:{' '}
            <span className={cn('font-bold',
              masterSignal?.signal === 'BUY' ? 'text-emerald-400' :
              masterSignal?.signal === 'SELL' ? 'text-rose-400' : 'text-amber-400')}>
              {masterSignal?.signal ?? '—'}
            </span>{' '}
            · {masterSignal?.confidence ?? 0}% · {masterSignal?.actionable ? 'actionable' : 'stand down'}
          </div>
          <div className={cn('flex items-center gap-1', running ? 'text-emerald-400' : 'text-white/40')}>
            <span className={cn('w-2 h-2 rounded-full', running ? 'bg-emerald-400 animate-pulse' : 'bg-white/30')} />
            {running ? 'RUNNING' : 'IDLE'}{busy && ' · placing order…'}
          </div>
        </div>

        {/* Log */}
        <div className="px-5 py-3 max-h-64 overflow-y-auto bg-black/30">
          {log.length === 0 ? (
            <div className="text-xs text-white/40 text-center py-6">No activity yet. Press START to begin trading on testnet.</div>
          ) : (
            <ul className="space-y-1">
              {log.map((l, i) => (
                <li key={i} className={cn('text-xs font-mono flex gap-2',
                  l.kind === 'buy' ? 'text-emerald-400' :
                  l.kind === 'sell' ? 'text-rose-400' :
                  l.kind === 'error' ? 'text-red-400' :
                  l.kind === 'skip' ? 'text-amber-400' : 'text-white/70')}>
                  <span className="text-white/40">{new Date(l.ts).toLocaleTimeString()}</span>
                  <span>{l.msg}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-2 border-t border-white/10 text-[10px] text-amber-400/80 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Testnet only. No real funds. Verify before going live.
        </div>
      </div>
    </div>
  );
}
