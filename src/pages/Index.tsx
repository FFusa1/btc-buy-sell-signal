import { useBinanceSignals } from '@/hooks/useBinanceSignals';
import { TradingSignal } from '@/components/TradingSignal';
import { PriceDisplay } from '@/components/PriceDisplay';
import { IndicatorsPanel } from '@/components/IndicatorsPanel';
import { MiniChart } from '@/components/MiniChart';
import { CandlestickChart5s } from '@/components/CandlestickChart5s';
import { ShortTermSignal } from '@/components/ShortTermSignal';
import { PatternSignal } from '@/components/PatternSignal';
import { SupportResistancePanel } from '@/components/SupportResistancePanel';
import { Loader2, AlertCircle } from 'lucide-react';
const Index = () => {
  const {
    data,
    loading,
    error,
    lastUpdated,
    refetch
  } = useBinanceSignals(1000);
  if (loading && !data) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground">Analyzing BTC/USDT market...</p>
        </div>
      </div>;
  }
  if (error && !data) {
    return <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">Failed to load data</h2>
          <p className="text-muted-foreground">{error}</p>
          <button onClick={refetch} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            Try Again
          </button>
        </div>
      </div>;
  }
  return <div className="min-h-screen text-purple-50 bg-secondary">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">BTC Trading Signals</h1>
            <p className="text-xs text-muted-foreground">Binance • Real-time analysis</p>
          </div>
          {lastUpdated && <div className="text-right">
              <p className="text-xs text-muted-foreground">Last updated</p>
              <p className="text-sm font-medium text-foreground">
                {lastUpdated.toLocaleTimeString()}
              </p>
            </div>}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {data && <div className="flex gap-6">
          {/* Left Content */}
          <div className="flex-1 space-y-6">
            {/* Price Display - Full Width */}
            <PriceDisplay currentPrice={data.currentPrice} priceChange24h={data.priceChange24h} priceChangePercent24h={data.priceChangePercent24h} />
            
            {/* Hourly Signal with 1% Growth Indicator */}
            <TradingSignal signal={data.signal} confidence={data.confidence} reason={data.reason} onRefresh={refetch} isRefreshing={loading} showGrowthIndicator currentPrice={data.currentPrice} />

            {/* Chart and Indicators */}
            <div className="grid md:grid-cols-2 gap-6">
              <MiniChart candles={data.recentCandles} />
              <IndicatorsPanel indicators={data.indicators} />
            </div>

            {/* Short-Term Signals (1-minute and 5-minute) */}
            <div className="grid md:grid-cols-2 gap-6">
              {data.shortTermSignal && <ShortTermSignal signal={data.shortTermSignal.signal} confidence={data.shortTermSignal.confidence} reason={data.shortTermSignal.reason} timeframe={data.shortTermSignal.timeframe} />}
              {data.fiveMinSignal && <ShortTermSignal signal={data.fiveMinSignal.signal} confidence={data.fiveMinSignal.confidence} reason={data.fiveMinSignal.reason} timeframe={data.fiveMinSignal.timeframe} />}
            </div>

            {/* 5-Second Candlestick Chart */}
            <CandlestickChart5s candles={data.recentCandles} />

            {/* Candlestick Pattern Signals */}
            <div className="grid md:grid-cols-2 gap-6">
              {data.patternSignal && (
                <PatternSignal 
                  signal={data.patternSignal.signal}
                  confidence={data.patternSignal.confidence}
                  reason={data.patternSignal.reason}
                  patterns={data.patternSignal.patterns}
                  timeframe={data.patternSignal.timeframe}
                />
              )}
              {data.fiveMinPatternSignal && (
                <PatternSignal 
                  signal={data.fiveMinPatternSignal.signal}
                  confidence={data.fiveMinPatternSignal.confidence}
                  reason={data.fiveMinPatternSignal.reason}
                  patterns={data.fiveMinPatternSignal.patterns}
                  timeframe={data.fiveMinPatternSignal.timeframe}
                />
              )}
            </div>

            {/* 30-Second Pattern Signal */}
            {data.thirtySecPatternSignal && (
              <PatternSignal 
                signal={data.thirtySecPatternSignal.signal}
                confidence={data.thirtySecPatternSignal.confidence}
                reason={data.thirtySecPatternSignal.reason}
                patterns={data.thirtySecPatternSignal.patterns}
                timeframe={data.thirtySecPatternSignal.timeframe}
              />
            )}
          </div>

          {/* Right Sidebar - Support & Resistance */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-24">
              {data.supportResistance && (
                <SupportResistancePanel
                  currentPrice={data.currentPrice}
                  support={data.supportResistance.support}
                  resistance={data.supportResistance.resistance}
                  strongestSupport={data.supportResistance.strongestSupport}
                  strongestResistance={data.supportResistance.strongestResistance}
                />
              )}
            </div>
          </div>
        </div>}
      </main>
    </div>;
};
export default Index;