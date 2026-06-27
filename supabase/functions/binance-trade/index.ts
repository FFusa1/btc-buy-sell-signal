// Binance Spot trading edge function (Testnet + Live)
// Supports: balance, buy (market by quoteOrderQty USDT), sell (market entire BTC balance)
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const HOSTS = {
  testnet: 'https://testnet.binance.vision',
  live: 'https://api.binance.com',
};

function getCreds(mode: 'testnet' | 'live') {
  if (mode === 'live') {
    return {
      key: Deno.env.get('BINANCE_API_KEY') ?? '',
      secret: Deno.env.get('BINANCE_API_SECRET') ?? '',
    };
  }
  return {
    key: Deno.env.get('BINANCE_TESTNET_API_KEY') ?? '',
    secret: Deno.env.get('BINANCE_TESTNET_API_SECRET') ?? '',
  };
}

async function hmacSha256(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signedRequest(mode: 'testnet' | 'live', path: string, params: Record<string, string>, method: 'GET' | 'POST' | 'DELETE' = 'GET') {
  const { key, secret } = getCreds(mode);
  if (!key || !secret) throw new Error(`Missing ${mode === 'live' ? 'BINANCE_API_KEY/SECRET' : 'BINANCE_TESTNET_API_KEY/SECRET'}`);
  const query = new URLSearchParams({ ...params, timestamp: Date.now().toString(), recvWindow: '5000' }).toString();
  const signature = await hmacSha256(secret, query);
  const url = `${HOSTS[mode]}${path}?${query}&signature=${signature}`;
  const res = await fetch(url, { method, headers: { 'X-MBX-APIKEY': key } });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`Binance ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function getBalance(mode: 'testnet' | 'live') {
  const acct = await signedRequest(mode, '/api/v3/account', {});
  const balances = (acct.balances ?? []).filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
  const usdt = acct.balances?.find((b: any) => b.asset === 'USDT');
  const btc = acct.balances?.find((b: any) => b.asset === 'BTC');
  return {
    usdt: usdt ? parseFloat(usdt.free) : 0,
    btc: btc ? parseFloat(btc.free) : 0,
    all: balances,
    canTrade: acct.canTrade,
    accountType: acct.accountType,
  };
}

async function marketBuy(mode: 'testnet' | 'live', quoteUsdt: number) {
  return await signedRequest(mode, '/api/v3/order', {
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    quoteOrderQty: quoteUsdt.toFixed(2),
  }, 'POST');
}

async function marketSellAllBtc(mode: 'testnet' | 'live') {
  const { btc } = await getBalance(mode);
  if (btc <= 0.00001) {
    return { skipped: true, reason: 'No BTC to sell', btc };
  }
  const qty = Math.floor(btc * 1e5) / 1e5;
  return await signedRequest(mode, '/api/v3/order', {
    symbol: 'BTCUSDT',
    side: 'SELL',
    type: 'MARKET',
    quantity: qty.toFixed(5),
  }, 'POST');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, quoteUsdt, mode: modeRaw } = await req.json().catch(() => ({}));
    const mode: 'testnet' | 'live' = modeRaw === 'live' ? 'live' : 'testnet';

    let result: any;
    switch (action) {
      case 'balance':
        result = await getBalance(mode);
        break;
      case 'buy': {
        const amt = Number(quoteUsdt);
        if (!amt || amt < 10) throw new Error('quoteUsdt must be >= 10');
        const order = await marketBuy(mode, amt);
        const bal = await getBalance(mode);
        result = { order, balance: bal };
        break;
      }
      case 'sell': {
        const order = await marketSellAllBtc(mode);
        const bal = await getBalance(mode);
        result = { order, balance: bal };
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    return new Response(JSON.stringify({ ok: true, mode, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
