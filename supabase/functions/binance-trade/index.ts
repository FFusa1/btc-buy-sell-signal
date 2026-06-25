// Binance Spot Testnet trading edge function
// Supports: balance, buy (market by quoteOrderQty USDT), sell (market entire BTC balance)
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const BASE = 'https://testnet.binance.vision';
const API_KEY = Deno.env.get('BINANCE_TESTNET_API_KEY') ?? '';
const API_SECRET = Deno.env.get('BINANCE_TESTNET_API_SECRET') ?? '';

async function hmacSha256(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signedRequest(path: string, params: Record<string, string>, method: 'GET' | 'POST' | 'DELETE' = 'GET') {
  const query = new URLSearchParams({ ...params, timestamp: Date.now().toString(), recvWindow: '5000' }).toString();
  const signature = await hmacSha256(API_SECRET, query);
  const url = `${BASE}${path}?${query}&signature=${signature}`;
  const res = await fetch(url, { method, headers: { 'X-MBX-APIKEY': API_KEY } });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`Binance ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function getBalance() {
  const acct = await signedRequest('/api/v3/account', {});
  const balances = (acct.balances ?? []).filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
  const usdt = acct.balances?.find((b: any) => b.asset === 'USDT');
  const btc = acct.balances?.find((b: any) => b.asset === 'BTC');
  return {
    usdt: usdt ? parseFloat(usdt.free) : 0,
    btc: btc ? parseFloat(btc.free) : 0,
    all: balances,
  };
}

async function marketBuy(quoteUsdt: number) {
  // BUY market with quoteOrderQty = spend N USDT
  return await signedRequest('/api/v3/order', {
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    quoteOrderQty: quoteUsdt.toFixed(2),
  }, 'POST');
}

async function marketSellAllBtc() {
  const { btc } = await getBalance();
  if (btc <= 0.00001) {
    return { skipped: true, reason: 'No BTC to sell', btc };
  }
  // Round down to 5 decimals (testnet LOT_SIZE stepSize 0.00001)
  const qty = Math.floor(btc * 1e5) / 1e5;
  return await signedRequest('/api/v3/order', {
    symbol: 'BTCUSDT',
    side: 'SELL',
    type: 'MARKET',
    quantity: qty.toFixed(5),
  }, 'POST');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!API_KEY || !API_SECRET) {
      throw new Error('Missing BINANCE_TESTNET_API_KEY / BINANCE_TESTNET_API_SECRET');
    }
    const { action, quoteUsdt } = await req.json().catch(() => ({}));
    let result: any;
    switch (action) {
      case 'balance':
        result = await getBalance();
        break;
      case 'buy': {
        const amt = Number(quoteUsdt);
        if (!amt || amt < 10) throw new Error('quoteUsdt must be >= 10');
        const order = await marketBuy(amt);
        const bal = await getBalance();
        result = { order, balance: bal };
        break;
      }
      case 'sell': {
        const order = await marketSellAllBtc();
        const bal = await getBalance();
        result = { order, balance: bal };
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
