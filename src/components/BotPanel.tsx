import { useEffect, useRef, useState } from 'react';
import { Bot, Play, Square, Wallet, AlertTriangle, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface MiniSignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
}

interface BotPanelProps {
  open: boolean;
  onClose: () => void;
  masterSignal?: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    actionable: boolean;
    confidence: number;
  };
  fiveMinSignal?: MiniSignal;
  oneMinSignal?: MiniSignal;
  currentPrice: number;
}

type LogEntry = {
  ts: number;
  kind: 'info' | 'buy' | 'sell' | 'error' | 'skip' | 'scalp';
  msg: string;
};

type Position = 'FLAT' | 'LONG';

export function BotPanel({ open, onClose, masterSignal, fiveMinSignal, oneMinSignal, currentPrice }: BotPanelProps) {
  const [running, setRunning] = useState(false);
  const [quoteInput, setQuoteInput] = useState<string>(() => localStorage.getItem('bot_quote_usdt') || '20');
  const quoteUsdt = Math.max(10, Number(quoteInput) || 0);
  const [balance, setBalance] = useState<{ usdt: number; btc: number } | null>(null);
  const [position, setPosition] = useState<Position>('FLAT');
  const [entryPrice, setEntryPrice] = useState<number | null>(() => {
    const v = localStorage.getItem('bot_entry_price');
    return v ? Number(v) : null;
  });
  const [entrySource, setEntrySource] = useState<'master' | 'scalp' | null>(() => {
    return (localStorage.getItem('bot_entry_source') as any) || null;
  });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'testnet' | 'live'>(() => (localStorage.getItem('bot_mode') as any) || 'testnet');
  const [confirmLive, setConfirmLive] = useState(false);
  const [scalpMode, setScalpMode] = useState<boolean>(() => localStorage.getItem('bot_scalp') === '1');
  const [tpInput, setTpInput] = useState<string>(() => localStorage.getItem('bot_tp_pct') || '0.35');
  const [slInput, setSlInput] = useState<string>(() => localStorage.getItem('bot_sl_pct') || '0.5');
  const tpPct = Math.max(0.3, Number(tpInput) || 0.35); // min 0.3% to cover fees
  const slPct = Math.max(0.1, Number(slInput) || 0.5);
  const lastSigRef = useRef<string>('');
  const lastScalpRef = useRef<string>('');

  // Binance spot fee = 0.1% per side. Round-trip = 0.2%. Require extra 0.15% profit buffer.
  const FEE_PER_SIDE = 0.001;
  const MIN_PROFIT_BUFFER = 0.0015;
  const BREAKEVEN_MULT = 1 + 2 * FEE_PER_SIDE + MIN_PROFIT_BUFFER; // ~1.0035


  const addLog = (kind: LogEntry['kind'], msg: string) =>
    setLog((l) => [{ ts: Date.now(), kind, msg }, ...l].slice(0, 50));

  const callTrade = async (action: 'balance' | 'buy' | 'sell', extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('binance-trade', {
      body: { action, mode, ...extra },
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
  }, [open, mode]);

  useEffect(() => { localStorage.setItem('bot_mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('bot_scalp', scalpMode ? '1' : '0'); }, [scalpMode]);
  useEffect(() => { localStorage.setItem('bot_tp_pct', String(tpPct)); }, [tpPct]);
  useEffect(() => { localStorage.setItem('bot_sl_pct', String(slPct)); }, [slPct]);

  // Shared buy helper
  const doBuy = async (source: 'master' | 'scalp', conf: number, label: string) => {
    if (quoteUsdt < 10) { addLog('skip', `Order size ${quoteUsdt} USDT below min 10. Adjust.`); return false; }
    if (balance && balance.usdt < quoteUsdt) { addLog('skip', `Insufficient USDT: have ${balance.usdt.toFixed(2)}, need ${quoteUsdt}`); return false; }
    addLog('info', `${label} BUY @ ${conf}% → market BUY ${quoteUsdt} USDT`);
    const d = await callTrade('buy', { quoteUsdt });
    const fillPrice = currentPrice || (d.order?.fills?.[0]?.price ? Number(d.order.fills[0].price) : 0);
    if (fillPrice > 0) {
      setEntryPrice(fillPrice);
      localStorage.setItem('bot_entry_price', String(fillPrice));
    }
    setEntrySource(source);
    localStorage.setItem('bot_entry_source', source);
    addLog(source === 'scalp' ? 'scalp' : 'buy', `Bought ~${quoteUsdt} USDT BTC @ ${fillPrice.toFixed(2)} [${source}]`);
    setBalance({ usdt: d.balance.usdt, btc: d.balance.btc });
    setPosition('LONG');
    return true;
  };

  const doSell = async (label: string, ignoreBreakeven = false) => {
    if (entryPrice && currentPrice > 0 && !ignoreBreakeven) {
      const breakeven = entryPrice * BREAKEVEN_MULT;
      if (currentPrice < breakeven) {
        const lossPct = ((currentPrice / entryPrice - 1) * 100).toFixed(3);
        addLog('skip', `${label} SELL skipped — ${currentPrice.toFixed(2)} < breakeven ${breakeven.toFixed(2)} (${lossPct}%)`);
        return false;
      }
    }
    const d = await callTrade('sell');
    if (d.order?.skipped) {
      addLog('skip', `${label}: ${d.order.reason}`);
    } else {
      const pnl = entryPrice ? `${((currentPrice/entryPrice - 1) * 100).toFixed(3)}%` : '?';
      addLog('sell', `${label} SOLD BTC @ ${currentPrice.toFixed(2)} (PnL ${pnl})`);
      setEntryPrice(null);
      setEntrySource(null);
      localStorage.removeItem('bot_entry_price');
      localStorage.removeItem('bot_entry_source');
    }
    setBalance({ usdt: d.balance.usdt, btc: d.balance.btc });
    setPosition('FLAT');
    return true;
  };

  // Bot loop — react to actionable master signal
  useEffect(() => {
    if (!running || !masterSignal || busy) return;
    if (!masterSignal.actionable) return;
    const sig = masterSignal.signal;
    if (sig === 'HOLD') return;
    const key = `M-${sig}-${position}`;
    if (lastSigRef.current === key) return;

    (async () => {
      setBusy(true);
      try {
        if (sig === 'BUY' && position === 'FLAT') {
          await doBuy('master', masterSignal.confidence, 'Master');
        } else if (sig === 'SELL' && position === 'LONG') {
          await doSell('Master');
        }
        lastSigRef.current = key;
      } catch (e: any) {
        addLog('error', `Trade failed: ${e.message}`);
      } finally { setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterSignal?.signal, masterSignal?.actionable, running, position]);

  // SCALP entry loop — react to 5m short-term BUY signals for micro-trades
  useEffect(() => {
    if (!running || !scalpMode || busy) return;
    if (position !== 'FLAT') return;
    const s = fiveMinSignal;
    if (!s || s.signal !== 'BUY' || s.confidence < 70) return;
    // Optional 1m confirmation: don't enter if 1m is strongly bearish
    if (oneMinSignal && oneMinSignal.signal === 'SELL' && oneMinSignal.confidence >= 65) return;
    const key = `S-${s.signal}-${s.confidence}`;
    if (lastScalpRef.current === key) return;
    lastScalpRef.current = key;
    (async () => {
      setBusy(true);
      try { await doBuy('scalp', s.confidence, 'Scalp (5m)'); }
      catch (e: any) { addLog('error', `Scalp buy failed: ${e.message}`); }
      finally { setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiveMinSignal?.signal, fiveMinSignal?.confidence, running, scalpMode, position]);

  // SCALP exit watcher — take-profit / stop-loss every price tick when scalp position open
  useEffect(() => {
    if (!running || busy || position !== 'LONG' || !entryPrice || !currentPrice) return;
    if (entrySource !== 'scalp') return;
    const change = (currentPrice / entryPrice - 1) * 100;
    const hitTP = change >= tpPct;
    const hitSL = change <= -slPct;
    // Also exit if 5m flips to strong SELL
    const flipSell = fiveMinSignal?.signal === 'SELL' && (fiveMinSignal?.confidence ?? 0) >= 70;
    if (!hitTP && !hitSL && !flipSell) return;
    (async () => {
      setBusy(true);
      try {
        const label = hitTP ? `Scalp TP +${change.toFixed(3)}%` : hitSL ? `Scalp SL ${change.toFixed(3)}%` : `Scalp flip-SELL`;
        // Stop-loss & flip-sell bypass breakeven guard (cut losses)
        await doSell(label, hitSL || flipSell);
      } catch (e: any) { addLog('error', `Scalp exit failed: ${e.message}`); }
      finally { setBusy(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, fiveMinSignal?.signal, running, position, entrySource]);


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={cn(
        "w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden bg-[#0b0f17]",
        mode === 'live' ? 'border-rose-500/40' : 'border-white/10'
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-5 py-4 border-b border-white/10",
          mode === 'live'
            ? 'bg-gradient-to-r from-rose-500/15 to-transparent'
            : 'bg-gradient-to-r from-yellow-500/10 to-transparent'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center",
              mode === 'live' ? 'bg-rose-500/20' : 'bg-yellow-500/20')}>
              <Bot className={cn("w-5 h-5", mode === 'live' ? 'text-rose-400' : 'text-yellow-400')} />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Binance Spot — Auto Trader</div>
              <div className={cn("text-[11px]", mode === 'live' ? 'text-rose-400' : 'text-yellow-400/80')}>
                {mode === 'live' ? 'LIVE • REAL FUNDS' : 'TESTNET'} • BTC/USDT
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Mode toggle */}
            <div className="flex items-center rounded-lg bg-white/5 border border-white/10 p-0.5 text-[11px] font-bold">
              <button
                onClick={() => { if (running) return; setMode('testnet'); setConfirmLive(false); lastSigRef.current=''; }}
                disabled={running}
                className={cn('px-2.5 py-1 rounded-md transition-colors',
                  mode === 'testnet' ? 'bg-yellow-500 text-black' : 'text-white/60 hover:text-white')}
              >TESTNET</button>
              <button
                onClick={() => { if (running) return; setMode('live'); lastSigRef.current=''; }}
                disabled={running}
                className={cn('px-2.5 py-1 rounded-md transition-colors',
                  mode === 'live' ? 'bg-rose-500 text-white' : 'text-white/60 hover:text-white')}
              >LIVE</button>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none px-2">×</button>
          </div>
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

        {/* Live confirmation banner */}
        {mode === 'live' && !running && (
          <div className="px-5 py-3 border-b border-rose-500/30 bg-rose-500/10 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-bold text-rose-300">LIVE MODE — REAL MONEY</div>
              <div className="text-[11px] text-rose-200/80">Bot will place real market BUY/SELL orders on your Binance account using the saved API key. Start with a small order size.</div>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-white/80 cursor-pointer">
              <input type="checkbox" checked={confirmLive} onChange={(e) => setConfirmLive(e.target.checked)} />
              I understand
            </label>
          </div>
        )}

        {/* Controls — Start at top */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-white/10">
          {!running ? (
            <button
              onClick={() => { setRunning(true); lastSigRef.current = ''; addLog('info', `Bot started [${mode.toUpperCase()}] — waiting for actionable master signal`); }}
              disabled={mode === 'live' && !confirmLive}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed text-black font-bold"
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
              inputMode="decimal"
              min={10}
              step={1}
              value={quoteInput}
              onChange={(e) => setQuoteInput(e.target.value)}
              onBlur={() => {
                const n = Math.max(10, Number(quoteInput) || 10);
                setQuoteInput(String(n));
                localStorage.setItem('bot_quote_usdt', String(n));
              }}
              disabled={running}
              className="w-24 px-2 py-1 rounded bg-white/10 border border-white/10 text-white text-sm"
            />
            <button onClick={refreshBalance} className="text-xs text-white/60 hover:text-white underline">refresh</button>
          </div>
        </div>

        {/* Scalp mode controls */}
        <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center gap-3 bg-white/[0.02]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={scalpMode} onChange={(e) => setScalpMode(e.target.checked)} />
            <Zap className={cn("w-4 h-4", scalpMode ? 'text-amber-400' : 'text-white/40')} />
            <span className="text-xs font-bold text-white">Scalp mode (5m micro-trades)</span>
          </label>
          <div className="flex items-center gap-1.5 ml-auto">
            <label className="text-[11px] text-white/60">TP %</label>
            <input
              type="number" step={0.05} min={0.3}
              value={tpInput}
              onChange={(e) => setTpInput(e.target.value)}
              onBlur={() => setTpInput(String(Math.max(0.3, Number(tpInput) || 0.35)))}
              disabled={running}
              className="w-16 px-2 py-1 rounded bg-white/10 border border-white/10 text-white text-xs"
            />
            <label className="text-[11px] text-white/60 ml-2">SL %</label>
            <input
              type="number" step={0.05} min={0.1}
              value={slInput}
              onChange={(e) => setSlInput(e.target.value)}
              onBlur={() => setSlInput(String(Math.max(0.1, Number(slInput) || 0.5)))}
              disabled={running}
              className="w-16 px-2 py-1 rounded bg-white/10 border border-white/10 text-white text-xs"
            />
          </div>
          <div className="basis-full text-[10px] text-white/50">
            Enters on 5m BUY ≥ 70% conf. Exits at +{tpPct}% (take-profit) or −{slPct}% (stop-loss), or if 5m flips to strong SELL. TP must be ≥ 0.3% to clear Binance fees.
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

        <div className={cn("px-5 py-2 border-t border-white/10 text-[10px] flex items-center gap-1",
          mode === 'live' ? 'text-rose-400' : 'text-amber-400/80')}>
          <AlertTriangle className="w-3 h-3" />
          {mode === 'live'
            ? 'LIVE: real orders on your Binance account. Monitor closely.'
            : 'Testnet only. No real funds. Verify before going live.'}
        </div>
      </div>
    </div>
  );
}
