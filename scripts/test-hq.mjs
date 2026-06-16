async function testFetchKline(symbol) {
  const variableName = `daily_${symbol}_${Date.now()}`;
  const url = `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20${variableName}=/InnerFuturesNewService.getDailyKLine?symbol=${encodeURIComponent(symbol)}`;
  const r = await fetch(url, {
    headers: { Referer: 'https://finance.sina.com.cn/futures/', 'User-Agent': 'Mozilla/5.0' }
  });
  const text = await r.text();
  const match = text.match(/=\s*\(?\s*(\[.*\])\s*\)?\s*;?\s*$/s);
  if (!match) { console.log(`${symbol}: no data`); return; }
  const data = JSON.parse(match[1]);
  console.log(`${symbol}: ${data.length} rows, last 3:`);
  data.slice(-3).forEach(row => console.log(`  ${JSON.stringify(row)}`));
}

(async () => {
  await testFetchKline('JD2607');
  await testFetchKline('JD2608');
  await testFetchKline('JD0');
})();
