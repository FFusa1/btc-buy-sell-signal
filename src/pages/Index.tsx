import { useBinanceSignals } from '@/hooks/useBinanceSignals';
import { TradingSignal } from '@/components/TradingSignal';
import { PriceDisplay } from '@/components/PriceDisplay';
import { IndicatorsPanel } from '@/components/IndicatorsPanel';
import { MiniChart } from '@/components/MiniChart';
import { CandlestickChart5s } from '@/components/CandlestickChart5s';
import { Loader2, AlertCircle } from 'lucide-react';

const Index = () => {
  const { data, loading, error, lastUpdated, refetch } = useBinanceSignals(10000);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground">Analyzing BTC/USDT market...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">Failed to load data</h2>
          <p className="text-muted-foreground">{error}</p>
          <button 
            onClick={refetch}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">BTC Trading Signals</h1>
            <p className="text-xs text-muted-foreground">Binance • Real-time analysis</p>
          </div>
          {lastUpdated && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Last updated</p>
              <p className="text-sm font-medium text-foreground">
                {lastUpdated.toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {data && (
          <>
            {/* Price and Signal Row */}
            <div className="grid md:grid-cols-2 gap-6">
              <PriceDisplay 
                currentPrice={data.currentPrice}
                priceChange24h={data.priceChange24h}
                priceChangePercent24h={data.priceChangePercent24h}
              />
              <TradingSignal 
                signal={data.signal}
                confidence={data.confidence}
                reason={data.reason}
                onRefresh={refetch}
                isRefreshing={loading}
              />
            </div>

            {/* Chart and Indicators */}
            <div className="grid md:grid-cols-2 gap-6">
              <MiniChart candles={data.recentCandles} />
              <IndicatorsPanel indicators={data.indicators} />
            </div>

            {/* 5-Second Candlestick Chart */}
            <CandlestickChart5s candles={data.recentCandles} />

            {/* Disclaimer */}
            <div className="text-center text-xs text-muted-foreground py-4 border-t border-border/50">
              <p>⚠️ This is for informational purposes only. Not financial advice.</p>
              <p className="mt-1">Data refreshes every 10 seconds from Binance API.</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
