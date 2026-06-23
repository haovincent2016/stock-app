import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { get as httpGet } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(rootDir, "dist");
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const optionProducts = {
  JD0: { product: "jd_o", exchange: "dce" }
};

const sinaHeaders = {
  Referer: "https://stock.finance.sina.com.cn/futures/view/optionsDP.php/m_o/dce",
  "User-Agent": "Mozilla/5.0"
};

const eastmoneyHeaders = {
  Referer: "https://quote.eastmoney.com/",
  "User-Agent": "Mozilla/5.0"
};

const eastmoneyToken = "fa5fd1943c7b386f172d6893dbfba10b";
const eastmoneySearchToken = "D43BF722C8E33BDC906FB84D85E216E9";

const commonStockIndices = [
  { secid: "1.000016", code: "000016", name: "上证50" },
  { secid: "1.000001", code: "000001", name: "上证指数" },
  { secid: "0.399001", code: "399001", name: "深证成指" },
  { secid: "0.399006", code: "399006", name: "创业板指" },
  { secid: "1.000300", code: "000300", name: "沪深300" },
  { secid: "1.000905", code: "000905", name: "中证500" }
];

const optionCache = {
  expiresAt: 0,
  payload: null
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/intraday") {
    await serveIntraday(url, response);
    return;
  }

  if (pathname === "/api/options") {
    await serveOptions(url, response);
    return;
  }

  if (pathname === "/api/option-intraday") {
    await serveOptionIntraday(url, response);
    return;
  }

  if (pathname === "/api/stock-indices") {
    await serveStockIndices(response);
    return;
  }

  if (pathname === "/api/stock-search") {
    await serveStockSearch(url, response);
    return;
  }

  if (pathname === "/api/stock-detail") {
    await serveStockDetail(url, response);
    return;
  }

  const appRoot = existsSync(join(distDir, "index.html")) ? distDir : rootDir;
  const staticRoot = pathname.startsWith("/data/") ? rootDir : appRoot;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = resolve(join(staticRoot, safePath));

  if (!filePath.startsWith(staticRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(appRoot, "index.html");
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": filePath.endsWith(".json") ? "no-store" : "no-cache"
  });
  createReadStream(filePath).pipe(response);
});

async function serveIntraday(url, response) {
  const symbol = (url.searchParams.get("symbol") || "").trim();
  if (!/^[A-Za-z0-9]{1,8}$/.test(symbol)) {
    sendJson(response, 400, { error: "invalid symbol" });
    return;
  }
  try {
    sendJson(response, 200, await fetchFuturesIntraday(symbol));
  } catch (error) {
    sendJson(response, 502, { error: error.message || String(error) });
  }
}

async function serveOptions(url, response) {
  const limit = clampInt(url.searchParams.get("limit"), 1, 30, 8);
  const force = url.searchParams.get("refresh") === "1";
  try {
    const now = Date.now();
    if (!force && optionCache.payload && optionCache.expiresAt > now && optionCache.payload.limit >= limit) {
      sendJson(response, 200, {
        ...optionCache.payload,
        rows: optionCache.payload.rows.slice(0, limit)
      });
      return;
    }

    const market = await loadMarketData();
    const rows = await fetchOptionMovers(market, Math.max(limit, 8));
    const visibleRows = rows.slice(0, limit);
    const payload = {
      fetchedAt: new Date().toISOString(),
      source: "新浪商品期权实时行情",
      limit,
      rows: visibleRows
    };
    optionCache.payload = { ...payload, limit: rows.length, rows };
    optionCache.expiresAt = now + 60_000;
    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, 502, { error: error.message || String(error), rows: [] });
  }
}

async function serveOptionIntraday(url, response) {
  const symbol = (url.searchParams.get("symbol") || "").trim();
  const underlying = (url.searchParams.get("underlying") || "").trim();
  if (!/^P_OP_[A-Za-z0-9]+$/.test(symbol)) {
    sendJson(response, 400, { error: "invalid option symbol" });
    return;
  }
  if (underlying && !/^[A-Za-z0-9]{1,10}$/.test(underlying)) {
    sendJson(response, 400, { error: "invalid underlying symbol" });
    return;
  }

  try {
    const [quoteMap, minuteRows, dailyRows, futures] = await Promise.all([
      fetchOptionQuotes([symbol]),
      fetchOptionMinuteRows(symbol).catch(() => []),
      fetchOptionDayline(symbol).catch(() => []),
      underlying ? fetchFuturesIntraday(underlying).catch((error) => ({ symbol: underlying, error: error.message, points: [] })) : null
    ]);
    const quote = quoteMap.get(symbol) ?? {};
    const optionPoints = minuteRows.length ? minuteRows : buildOptionSnapshotPoints(quote, dailyRows);
    const prices = optionPoints.map((row) => row.price).filter(Number.isFinite);
    const last = optionPoints.at(-1);
    const previousClose = quote.previousClose ?? dailyRows.at(-2)?.close ?? null;
    const high = quote.high ?? (prices.length ? Math.max(...prices) : dailyRows.at(-1)?.high ?? null);
    const low = quote.low ?? (prices.length ? Math.min(...prices) : dailyRows.at(-1)?.low ?? null);

    sendJson(response, 200, {
      symbol,
      underlying,
      fetchedAt: new Date().toISOString(),
      option: {
        symbol,
        tradeDate: last?.date ?? quote.tradeDate ?? dailyRows.at(-1)?.date ?? null,
        latestPrice: quote.latestPrice ?? last?.price ?? dailyRows.at(-1)?.close ?? null,
        previousClose,
        changePct: quote.changePct ?? (previousClose && Number.isFinite(last?.price) ? (last.price - previousClose) / previousClose : null),
        open: quote.open ?? dailyRows.at(-1)?.open ?? null,
        high,
        low,
        volume: quote.volume ?? dailyRows.at(-1)?.volume ?? null,
        openInterest: quote.openInterest ?? null,
        source: minuteRows.length ? (minuteRows.length > 2 ? "东方财富期权分时" : "新浪商品期权分钟线") : "新浪商品期权实时行情",
        resolution: minuteRows.length ? "minute" : "snapshot",
        note: minuteRows.length ? "" : "期权分时数据暂不可用，展示真实开盘与最新快照。",
        points: optionPoints,
        daily: dailyRows.slice(-30)
      },
      futures
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || String(error) });
  }
}

async function serveStockIndices(response) {
  try {
    const quotes = await fetchStockQuotes(commonStockIndices.map((row) => row.secid));
    const rows = commonStockIndices.map((index) => ({
      ...index,
      ...(quotes.get(index.secid) ?? {})
    }));
    sendJson(response, 200, {
      fetchedAt: new Date().toISOString(),
      source: "东方财富实时行情",
      rows
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || String(error), rows: [] });
  }
}

async function serveStockSearch(url, response) {
  const query = (url.searchParams.get("q") || "").trim();
  const marketScope = url.searchParams.get("market") === "hk" ? "hk" : "a";
  if (!query || query.length > 40 || /[<>{}\\]/.test(query)) {
    sendJson(response, 400, { error: "invalid query", rows: [] });
    return;
  }

  try {
    const rows = await searchStocks(query, marketScope);
    sendJson(response, 200, {
      fetchedAt: new Date().toISOString(),
      source: "东方财富搜索",
      rows
    });
  } catch (error) {
    const fallback = stockCandidateFromCode(query, marketScope);
    if (fallback) {
      sendJson(response, 200, {
        fetchedAt: new Date().toISOString(),
        source: "代码推断",
        rows: [fallback],
        warning: error.message || String(error)
      });
      return;
    }
    sendJson(response, 502, { error: error.message || String(error), rows: [] });
  }
}

async function serveStockDetail(url, response) {
  const secidParam = (url.searchParams.get("secid") || "").trim();
  const codeParam = (url.searchParams.get("code") || "").trim();
  const marketScope = url.searchParams.get("market") === "hk" ? "hk" : "a";
  const fallback = stockCandidateFromCode(codeParam, marketScope);
  const secid = normalizeStockSecid(secidParam) || fallback?.secid;

  if (!secid) {
    sendJson(response, 400, { error: "invalid stock secid" });
    return;
  }

  try {
    const [quotes, intraday, daily, weekly, monthly, profile, boards] = await Promise.all([
      fetchStockQuotes([secid]),
      fetchStockIntraday(secid).catch(() => []),
      fetchStockKlines(secid, 101, 180),
      fetchStockKlines(secid, 102, 120),
      fetchStockKlines(secid, 103, 96),
      fetchCompanyProfile(secid).catch(() => null),
      fetchStockBoards(secid).catch(() => [])
    ]);
    const quote = quotes.get(secid);
    if (!quote) throw new Error("stock quote not found");

    sendJson(response, 200, {
      fetchedAt: new Date().toISOString(),
      source: "东方财富行情",
      quote,
      profile,
      boards: boards.length ? boards : fallbackStockBoards(quote),
      klines: {
        intraday,
        daily,
        weekly,
        monthly
      }
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || String(error) });
  }
}

async function searchStocks(query, marketScope = "a") {
  const target = new URL("https://searchapi.eastmoney.com/api/suggest/get");
  target.searchParams.set("input", query);
  target.searchParams.set("type", "14");
  target.searchParams.set("token", eastmoneySearchToken);
  target.searchParams.set("count", "12");

  const payload = await fetchJson(target.toString(), { headers: eastmoneyHeaders, timeoutMs: 8_000 });
  const rawRows = [
    ...(payload?.QuotationCodeTable?.Data ?? []),
    ...(payload?.Data ?? []),
    ...(payload?.data ?? [])
  ];
  const rows = rawRows
    .map((row) => stockSearchCandidateFromRow(row, marketScope))
    .filter(Boolean)
    .filter((row) => isSearchMarketMatch(row, marketScope))
    .slice(0, 10);

  if (rows.length) return rows;
  const fallback = stockCandidateFromCode(query, marketScope);
  return fallback ? [fallback] : [];
}

async function fetchStockQuotes(secids) {
  const cleanSecids = unique((secids ?? []).map(normalizeStockSecid).filter(Boolean));
  const result = new Map();
  if (!cleanSecids.length) return result;

  const target = new URL("https://push2.eastmoney.com/api/qt/ulist.np/get");
  target.searchParams.set("fltt", "2");
  target.searchParams.set("invt", "2");
  target.searchParams.set("ut", eastmoneyToken);
  target.searchParams.set("fields", [
    "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f12", "f13", "f14",
    "f15", "f16", "f17", "f18", "f20", "f21", "f23", "f24", "f25", "f26", "f57", "f58",
    "f112", "f113", "f114", "f115", "f116", "f117", "f124", "f152"
  ].join(","));
  target.searchParams.set("secids", cleanSecids.join(","));

  const payload = await fetchJson(target.toString(), { headers: eastmoneyHeaders, timeoutMs: 8_000 });
  const rows = payload?.data?.diff;
  if (!Array.isArray(rows)) return result;

  for (const row of rows) {
    const quote = normalizeStockQuote(row);
    if (quote) result.set(quote.secid, quote);
  }
  return result;
}

async function fetchStockKlines(secid, klt, limit = 160) {
  const cleanSecid = normalizeStockSecid(secid);
  if (!cleanSecid) return [];
  const target = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  target.searchParams.set("secid", cleanSecid);
  target.searchParams.set("ut", eastmoneyToken);
  target.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  target.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61");
  target.searchParams.set("klt", String(klt));
  target.searchParams.set("fqt", cleanSecid.startsWith("116.") ? "0" : "1");
  target.searchParams.set("beg", "0");
  target.searchParams.set("end", "20500101");
  target.searchParams.set("lmt", String(limit));

  const payload = await fetchJson(target.toString(), { headers: eastmoneyHeaders, timeoutMs: 8_000 });
  const rows = payload?.data?.klines;
  if (!Array.isArray(rows)) return [];
  return rows.map(parseStockKline).filter(Boolean).slice(-limit);
}

async function fetchStockIntraday(secid) {
  const cleanSecid = normalizeStockSecid(secid);
  if (!cleanSecid) return [];
  const target = new URL("https://push2.eastmoney.com/api/qt/stock/trends2/get");
  target.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13");
  target.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58");
  target.searchParams.set("ut", eastmoneyToken);
  target.searchParams.set("ndays", "1");
  target.searchParams.set("iscr", "0");
  target.searchParams.set("secid", cleanSecid);

  const payload = await fetchJson(target.toString(), { headers: eastmoneyHeaders, timeoutMs: 8_000 });
  const trends = payload?.data?.trends;
  if (!Array.isArray(trends)) return [];
  const previousClose = toNumber(payload?.data?.preClose ?? payload?.data?.prePrice);
  return trends
    .map((line) => {
      const parts = String(line || "").split(",");
      if (parts.length < 3) return null;
      const datetime = parts[0] || "";
      const price = toNumber(parts[2]) ?? toNumber(parts[1]);
      return {
        datetime,
        date: datetime.split(" ")[0] || null,
        time: (datetime.split(" ")[1] || datetime).slice(0, 5),
        price,
        open: toNumber(parts[1]),
        high: toNumber(parts[3]),
        low: toNumber(parts[4]),
        volume: toNumber(parts[5]),
        amount: toNumber(parts[6]),
        average: toNumber(parts[7]),
        previousClose
      };
    })
    .filter((row) => row?.time && Number.isFinite(row.price));
}

async function fetchCompanyProfile(secid) {
  const cleanSecid = normalizeStockSecid(secid);
  if (!cleanSecid) return null;
  const [market, code] = cleanSecid.split(".");
  if (market === "116") return null;
  const prefix = code.startsWith("8") || code.startsWith("4") ? "BJ" : market === "1" ? "SH" : "SZ";
  const target = new URL("https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax");
  target.searchParams.set("code", `${prefix}${code}`);
  const payload = await fetchJson(target.toString(), {
    headers: {
      ...eastmoneyHeaders,
      Referer: `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/Index?type=web&code=${prefix}${code}`
    },
    timeoutMs: 8_000
  });
  const row = payload?.jbzl?.[0] ?? payload?.gsgk?.[0] ?? null;
  if (!row) return null;
  return {
    companyName: row.ORG_NAME || row.COMPANY_NAME || row.SECURITY_NAME_ABBR || "",
    shortName: row.SECURITY_NAME_ABBR || "",
    industry: row.INDUSTRYCSRC1 || row.INDUSTRY_NAME || row.INDUSTRY || "",
    subIndustry: row.INDUSTRYCSRC2 || "",
    listingDate: row.LISTING_DATE || row.LIST_DATE || "",
    province: row.PROVINCE || row.REGION || "",
    chairman: row.CHAIRMAN || "",
    manager: row.PRESIDENT || row.GENERAL_MANAGER || "",
    secretary: row.SECRETARY || "",
    officeAddress: row.OFFICE_ADDRESS || "",
    website: row.WEB_SITE || row.WEBSITE || "",
    mainBusiness: row.MAIN_BUSINESS || row.BUSINESS_SCOPE || ""
  };
}

async function fetchStockBoards(secid) {
  if (String(secid || "").startsWith("116.")) return [];
  const secucode = stockSecucode(secid);
  if (!secucode) return [];
  const target = new URL("https://datacenter.eastmoney.com/securities/api/data/v1/get");
  target.searchParams.set("reportName", "RPT_F10_CORETHEME_BOARDTYPE");
  target.searchParams.set("columns", "SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,NEW_BOARD_CODE,BOARD_NAME,BOARD_TYPE,SELECTED_BOARD_REASON");
  target.searchParams.set("filter", `(SECUCODE="${secucode}")`);
  target.searchParams.set("pageNumber", "1");
  target.searchParams.set("pageSize", "80");
  target.searchParams.set("sortTypes", "1");
  target.searchParams.set("sortColumns", "BOARD_RANK");

  const payload = await fetchJson(target.toString(), {
    headers: {
      ...eastmoneyHeaders,
      Referer: `https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/Index?type=web&code=${stockProfileCode(secid)}`
    },
    timeoutMs: 8_000
  });
  const rows = payload?.result?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      code: row.NEW_BOARD_CODE || row.BOARD_CODE || "",
      name: row.BOARD_NAME || "",
      type: row.BOARD_TYPE || "其他",
      reason: row.SELECTED_BOARD_REASON || ""
    }))
    .filter((row) => row.name);
}

function stockSecucode(secid) {
  const cleanSecid = normalizeStockSecid(secid);
  if (!cleanSecid) return "";
  const [market, code] = cleanSecid.split(".");
  if (market === "116") return `${code}.HK`;
  const suffix = code.startsWith("8") || code.startsWith("4") ? "BJ" : market === "1" ? "SH" : "SZ";
  return `${code}.${suffix}`;
}

function stockProfileCode(secid) {
  const secucode = stockSecucode(secid);
  if (!secucode) return "";
  const [code, suffix] = secucode.split(".");
  return `${suffix}${code}`;
}

function stockSearchCandidateFromRow(row, marketScope = "a") {
  const code = String(row.Code || row.SecurityCode || row.SECURITY_CODE || row.code || "").trim();
  const quoteId = String(row.QuoteID || row.QuoteIDStr || row.quoteId || row.secid || "").trim();
  const secid = normalizeStockSecid(quoteId) || stockCandidateFromCode(code, marketScope)?.secid;
  if (!code || !secid) return null;
  const name = String(row.Name || row.SecurityName || row.SECURITY_NAME_ABBR || row.name || code).trim();
  const market = secid.split(".")[0];
  return {
    secid,
    code,
    name,
    exchange: stockExchangeLabel(market, code),
    type: row.SecurityTypeName || row.TypeName || row.type || "股票"
  };
}

function stockCandidateFromCode(value, marketScope = "a") {
  const rawCode = String(value || "").trim().replace(/^(SH|SZ|BJ|HK)/i, "");
  const code = marketScope === "hk" && /^\d{1,5}$/.test(rawCode) ? rawCode.padStart(5, "0") : rawCode;
  if (marketScope === "hk") {
    if (!isHongKongStockCode(code)) return null;
    return {
      secid: `116.${code}`,
      code,
      name: code,
      exchange: "HK",
      type: "港股"
    };
  }

  if (!isAStockLikeCode(code)) return null;
  const market = code.startsWith("6") || code.startsWith("9") ? "1" : "0";
  return {
    secid: `${market}.${code}`,
    code,
    name: code,
    exchange: stockExchangeLabel(market, code),
    type: "股票"
  };
}

function normalizeStockSecid(value) {
  const text = String(value || "").trim();
  const direct = text.match(/^([01])\.(\d{6})$/);
  if (direct) return `${direct[1]}.${direct[2]}`;
  const hkDirect = text.match(/^116\.(\d{5})$/);
  if (hkDirect) return `116.${hkDirect[1]}`;
  const code = text.replace(/^(SH|SZ|BJ)/i, "");
  return stockCandidateFromCode(code)?.secid ?? null;
}

function isAStockLikeCode(code) {
  return /^[03468]\d{5}$/.test(String(code || ""));
}

function isHongKongStockCode(code) {
  return /^\d{5}$/.test(String(code || ""));
}

function isSearchMarketMatch(row, marketScope) {
  if (marketScope === "hk") return row.secid.startsWith("116.") && isHongKongStockCode(row.code);
  return /^[01]\./.test(row.secid) && isAStockLikeCode(row.code) && row.type !== "基金";
}

function stockExchangeLabel(market, code) {
  if (market === "116") return "HK";
  if (code?.startsWith("8") || code?.startsWith("4")) return "BJ";
  return market === "1" ? "SH" : "SZ";
}

function normalizeStockQuote(row) {
  const code = String(row.f12 || row.f57 || "").trim();
  const market = String(row.f13 ?? "");
  if (!code || !market) return null;
  const secid = `${market}.${code}`;
  return {
    secid,
    code,
    name: String(row.f14 || row.f58 || code),
    exchange: stockExchangeLabel(market, code),
    latestPrice: toNumber(row.f2),
    changePct: pctNumber(row.f3),
    change: toNumber(row.f4),
    volume: toNumber(row.f5),
    amount: toNumber(row.f6),
    amplitudePct: pctNumber(row.f7),
    turnoverPct: pctNumber(row.f8),
    peDynamic: toNumber(row.f9),
    volumeRatio: toNumber(row.f10),
    high: toNumber(row.f15),
    low: toNumber(row.f16),
    open: toNumber(row.f17),
    previousClose: toNumber(row.f18),
    totalMarketCap: toNumber(row.f20),
    floatMarketCap: toNumber(row.f21),
    pb: toNumber(row.f23),
    changePct60Day: pctNumber(row.f24),
    changePctYtd: pctNumber(row.f25),
    listingDate: String(row.f26 || ""),
    peTtm: toNumber(row.f115 ?? row.f114),
    marketCap: toNumber(row.f116 ?? row.f20),
    floatMarketCap2: toNumber(row.f117 ?? row.f21),
    timestamp: Number.isFinite(toNumber(row.f124)) ? new Date(toNumber(row.f124) * 1000).toISOString() : null
  };
}

function fallbackStockBoards(quote) {
  if (!quote) return [];
  if (quote.exchange === "HK") {
    return [
      { code: "HK", name: "港股", type: "市场", reason: "" },
      { code: "HKEX", name: "香港交易所", type: "交易所", reason: "" }
    ];
  }
  return quote.exchange ? [{ code: quote.exchange, name: `${quote.exchange} 市场`, type: "市场", reason: "" }] : [];
}

function parseStockKline(line) {
  const parts = String(line || "").split(",");
  if (parts.length < 7) return null;
  return {
    date: parts[0],
    open: toNumber(parts[1]),
    close: toNumber(parts[2]),
    high: toNumber(parts[3]),
    low: toNumber(parts[4]),
    volume: toNumber(parts[5]),
    amount: toNumber(parts[6]),
    amplitudePct: pctNumber(parts[7]),
    changePct: pctNumber(parts[8]),
    change: toNumber(parts[9]),
    turnoverPct: pctNumber(parts[10])
  };
}

async function fetchFuturesIntraday(symbol) {
  const variableName = `minute_${symbol}_${Date.now()}`;
  const target = `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20${variableName}=/InnerFuturesNewService.getMinLine?symbol=${encodeURIComponent(symbol)}`;
  const text = await fetchText(target, {
    headers: {
      Referer: "https://finance.sina.com.cn/futures/quotes/",
      "User-Agent": "Mozilla/5.0"
    }
  });
  const raw = parseWrappedJson(text);
  if (!Array.isArray(raw)) throw new Error("unexpected futures minute payload");

  let carryDate = "";
  let carryPreviousClose = null;
  const points = raw
    .map((row) => {
      if (row[6]) carryDate = row[6];
      const previousClose = toNumber(row[5]);
      if (Number.isFinite(previousClose)) carryPreviousClose = previousClose;
      return {
        time: row[0],
        price: toNumber(row[1]),
        average: toNumber(row[2]),
        volume: toNumber(row[3]),
        openInterest: toNumber(row[4]),
        previousClose: carryPreviousClose,
        date: row[6] || carryDate
      };
    })
    .filter((row) => row.time && Number.isFinite(row.price));

  const prices = points.map((row) => row.price).filter(Number.isFinite);
  const last = points.at(-1);
  const previousClose = points.find((row) => Number.isFinite(row.previousClose))?.previousClose ?? null;
  const high = prices.length ? Math.max(...prices) : null;
  const low = prices.length ? Math.min(...prices) : null;
  const volume = points.reduce((sum, row) => sum + (Number.isFinite(row.volume) ? row.volume : 0), 0);

  return {
    symbol,
    fetchedAt: new Date().toISOString(),
    tradeDate: last?.date ?? null,
    latestPrice: last?.price ?? null,
    previousClose,
    changePct: previousClose && Number.isFinite(last?.price) ? (last.price - previousClose) / previousClose : null,
    rangePct: Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(last?.price) ? (high - low) / last.price : null,
    high,
    low,
    volume,
    points
  };
}

async function fetchOptionMovers(market, limit) {
  const commodities = market.commodities ?? [];
  const commodityBySymbol = new Map(commodities.map((item) => [item.symbol, item]));
  const chainTasks = Object.entries(optionProducts).flatMap(([underlyingSymbol, config]) => {
    const commodity = commodityBySymbol.get(underlyingSymbol);
    if (!commodity) return [];
    return [buildOptionChainTasks(commodity, config)];
  });

  const nested = await Promise.all(chainTasks);
  const rows = nested.flat(2);
  const deduped = [...new Map(rows.map((row) => [row.symbol, row])).values()];
  const quoteRows = deduped
    .filter((row) => Number.isFinite(row.changePct) && Number.isFinite(row.latestPrice))
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity))
    .slice(0, 40);
  const quotes = await fetchOptionQuotes(quoteRows.map((row) => row.symbol)).catch(() => new Map());

  const mergedRows = quoteRows.map((row) => mergeOptionQuote(row, quotes.get(row.symbol)));
  const quoteDates = mergedRows
    .map((row) => row.quoteDateTime?.slice(0, 10))
    .filter(Boolean)
    .sort();
  const latestQuoteDate = quoteDates.at(-1);

  return mergedRows
    .filter((row) => !latestQuoteDate || !row.quoteDateTime || row.quoteDateTime.startsWith(latestQuoteDate))
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity))
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function buildOptionChainTasks(commodity, config) {
  const fallback = contractToPinzhong(commodity.mainContract || commodity.symbol);
  const months = await fetchOptionMonths(config, fallback).catch(() => [fallback]);
  const selectedMonths = unique([fallback, ...months].filter(Boolean)).slice(0, 6);
  const results = await Promise.allSettled(
    selectedMonths.map((pinzhong) => fetchOptionChain(commodity, config, pinzhong))
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function fetchOptionMonths(config, fallback) {
  const target = `https://stock.finance.sina.com.cn/futures/view/optionsDP.php/${config.product}/${config.exchange}`;
  const html = await fetchText(target, { headers: sinaHeaders, timeoutMs: 8_000 });
  const optionSuffixBlock = html.match(/id=["']option_suffix["'][\s\S]*?<\/div>/i)?.[0] ?? "";
  const values = [...optionSuffixBlock.matchAll(/data-value=["']([^"']+)["']/g)].map((match) => match[1]);
  return unique(values.length ? values : [fallback]);
}

async function fetchOptionChain(commodity, config, pinzhong) {
  const target = new URL("https://stock.finance.sina.com.cn/futures/api/openapi.php/OptionService.getOptionData");
  target.searchParams.set("type", "futures");
  target.searchParams.set("product", config.product);
  target.searchParams.set("exchange", config.exchange);
  target.searchParams.set("pinzhong", pinzhong);
  const text = await fetchText(target.toString(), { headers: sinaHeaders, timeoutMs: 8_000 });
  const payload = parseWrappedJson(text);
  const data = payload?.result?.data ?? {};
  return [
    ...(Array.isArray(data.up) ? data.up.map((row) => normalizeOptionRow(row, commodity, config, pinzhong, "C")) : []),
    ...(Array.isArray(data.down) ? data.down.map((row) => normalizeOptionRow(row, commodity, config, pinzhong, "P")) : [])
  ].filter(Boolean);
}

function normalizeOptionRow(row, commodity, config, pinzhong, fallbackType) {
  const suffix = String(row.at(-1) || "");
  if (!suffix) return null;
  const optionTypeCode = /P\d+$/i.test(suffix) ? "P" : /C\d+$/i.test(suffix) ? "C" : fallbackType;
  const strike = toNumber(row[7]) ?? parseStrike(suffix);
  const latestPrice = toNumber(row[2]);
  const underlyingPrice = commodity.today?.latestPrice ?? commodity.latest?.close ?? null;
  const moneyness = Number.isFinite(strike) && Number.isFinite(underlyingPrice) && underlyingPrice
    ? optionTypeCode === "C"
      ? (underlyingPrice - strike) / underlyingPrice
      : (strike - underlyingPrice) / underlyingPrice
    : null;
  const contractMonth = parseOptionMonth(suffix);
  const optionType = optionTypeCode === "C" ? "看涨" : "看跌";
  const cleanName = commodity.name.replace(/连续$/, "");

  return {
    symbol: `P_OP_${suffix}`,
    contract: suffix,
    name: `${cleanName}${contractMonth || pinzhong.toUpperCase()}${optionType}${Number.isFinite(strike) ? strike : ""}`,
    optionType,
    optionTypeCode,
    strike,
    latestPrice,
    bidVolume: toNumber(row[0]),
    bidPrice: toNumber(row[1]),
    askPrice: toNumber(row[3]),
    askVolume: toNumber(row[4]),
    openInterest: toNumber(row[5]),
    volume: null,
    changePct: Number.isFinite(toNumber(row[6])) ? toNumber(row[6]) / 100 : null,
    moneyness,
    source: "新浪商品期权",
    product: config.product,
    exchange: config.exchange.toUpperCase(),
    pinzhong,
    contractMonth,
    underlying: {
      symbol: commodity.symbol,
      name: commodity.name,
      contract: commodity.mainContract || pinzhong.toUpperCase(),
      latestPrice: underlyingPrice,
      changePct: commodity.today?.changePct ?? null,
      rangePct: commodity.today?.rangePct ?? null,
      volume: commodity.today?.volume ?? commodity.latest?.volume ?? null
    }
  };
}

async function fetchOptionQuotes(symbols) {
  const cleanSymbols = unique(symbols.filter((symbol) => /^P_OP_[A-Za-z0-9]+$/.test(symbol)));
  const result = new Map();
  const chunks = [];
  for (let index = 0; index < cleanSymbols.length; index += 40) chunks.push(cleanSymbols.slice(index, index + 40));
  await Promise.all(chunks.map(async (chunk) => {
    if (!chunk.length) return;
    const target = `https://hq.sinajs.cn/list=${chunk.map(encodeURIComponent).join(",")}`;
    const text = await fetchText(target, { headers: sinaHeaders, timeoutMs: 8_000 });
    for (const match of text.matchAll(/var hq_str_([^=]+)="([^"]*)";/g)) {
      const symbol = match[1];
      const quote = parseOptionHq(match[2], symbol);
      if (quote) result.set(symbol, quote);
    }
  }));
  return result;
}

function parseOptionHq(raw, symbol) {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length < 10) return null;
  const quoteDateTime = parts[32] || "";
  const latestPrice = toNumber(parts[2]);
  const previousClose = toNumber(parts[8]);
  return {
    symbol,
    bidVolume: toNumber(parts[0]),
    bidPrice: toNumber(parts[1]),
    latestPrice,
    askPrice: toNumber(parts[3]),
    askVolume: toNumber(parts[4]),
    openInterest: toNumber(parts[5]),
    strike: toNumber(parts[7]) ?? parseStrike(symbol),
    previousClose,
    open: toNumber(parts[9]),
    high: toNumber(parts[39]),
    low: toNumber(parts[40]),
    volume: toNumber(parts[41]),
    amount: toNumber(parts[42]),
    tradeDate: quoteDateTime.split(" ")[0] || null,
    quoteTime: quoteDateTime.split(" ")[1]?.slice(0, 5) || null,
    quoteDateTime: quoteDateTime || null,
    changePct: Number.isFinite(latestPrice) && Number.isFinite(previousClose) && previousClose
      ? (latestPrice - previousClose) / previousClose
      : null
  };
}

function mergeOptionQuote(row, quote) {
  if (!quote) return row;
  return {
    ...row,
    latestPrice: quote.latestPrice ?? row.latestPrice,
    bidVolume: quote.bidVolume ?? row.bidVolume,
    bidPrice: quote.bidPrice ?? row.bidPrice,
    askPrice: quote.askPrice ?? row.askPrice,
    askVolume: quote.askVolume ?? row.askVolume,
    openInterest: quote.openInterest ?? row.openInterest,
    volume: quote.volume ?? row.volume,
    changePct: quote.changePct ?? row.changePct,
    previousClose: quote.previousClose ?? row.previousClose,
    open: quote.open ?? row.open,
    high: quote.high ?? row.high,
    low: quote.low ?? row.low,
    quoteDateTime: quote.quoteDateTime,
    quoteTime: quote.quoteTime
  };
}

function fetchHttp(url, headers = {}, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const req = httpGet(url, { headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function fetchEastmoneyOptionTrends(symbol) {
  const contract = symbol.replace(/^P_OP_/, "").toLowerCase();
  const emMarkets = [151, 140, 113, 114, 115, 142];
  for (const market of emMarkets) {
    const target = new URL("http://push2.eastmoney.com/api/qt/stock/trends2/get");
    target.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13");
    target.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58");
    target.searchParams.set("ut", "7eea3edcaed734bea9cbfc24409ed989");
    target.searchParams.set("ndays", "1");
    target.searchParams.set("iscr", "0");
    target.searchParams.set("secid", `${market}.${contract}`);
    try {
      const text = await fetchHttp(target.toString(), { "User-Agent": "Mozilla/5.0" }, 8_000);
      const payload = JSON.parse(text);
      const trends = payload?.data?.trends;
      if (!Array.isArray(trends) || !trends.length) continue;
      const preClose = toNumber(payload.data.preClose ?? payload.data.preSettlement ?? payload.data.prePrice) || null;
      return trends
        .map((line) => {
          const parts = String(line).split(",");
          if (parts.length < 4) return null;
          const datetime = parts[0] || "";
          const timePart = datetime.split(" ")[1] || datetime;
          return {
            time: timePart.slice(0, 5),
            price: toNumber(parts[1]),
            average: toNumber(parts[2]),
            volume: toNumber(parts[5]),
            openInterest: toNumber(parts[7]),
            previousClose: preClose,
            date: datetime.split(" ")[0] || null
          };
        })
        .filter((row) => row.time && Number.isFinite(row.price));
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchOptionMinuteRows(symbol) {
  const emRows = await fetchEastmoneyOptionTrends(symbol);
  if (emRows.length) return emRows;
  const variableName = `option_min_${Date.now()}`;
  const target = new URL("https://stock.finance.sina.com.cn/futures/api/openapi.php/StockOptionDaylineService.getOptionMinline");
  target.searchParams.set("symbol", symbol);
  target.searchParams.set("random", String(Date.now()));
  target.searchParams.set("callback", `var ${variableName}=`);
  const text = await fetchText(target.toString(), { headers: sinaHeaders, timeoutMs: 8_000 });
  const payload = parseWrappedJson(text);
  const rows = payload?.result?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      time: row.i || row.time || row[0],
      price: toNumber(row.p ?? row.price ?? row[1]),
      average: toNumber(row.a ?? row.average ?? row[2]),
      volume: toNumber(row.v ?? row.volume ?? row[3]),
      openInterest: toNumber(row.t ?? row.openInterest ?? row[4]),
      date: row.d || row.date || null
    }))
    .filter((row) => row.time && Number.isFinite(row.price));
}

async function fetchOptionDayline(symbol) {
  const suffix = symbol.replace(/^P_OP_/, "");
  const variableName = `option_day_${Date.now()}`;
  const target = `https://stock.finance.sina.com.cn/futures/api/jsonp.php/var%20${variableName}=/FutureOptionAllService.getOptionDayline?symbol=${encodeURIComponent(suffix)}`;
  const text = await fetchText(target, { headers: sinaHeaders, timeoutMs: 8_000 });
  const rows = parseWrappedJson(text);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      date: row.d,
      open: toNumber(row.o),
      high: toNumber(row.h),
      low: toNumber(row.l),
      close: toNumber(row.c),
      volume: toNumber(row.v)
    }))
    .filter((row) => row.date && Number.isFinite(row.close));
}

function buildOptionSnapshotPoints(quote, dailyRows) {
  const points = [];
  const latestDaily = dailyRows.at(-1);
  const tradeDate = quote.tradeDate ?? latestDaily?.date ?? null;
  if (Number.isFinite(quote.open)) {
    points.push({
      time: "09:30",
      price: quote.open,
      average: quote.open,
      volume: 0,
      openInterest: quote.openInterest ?? null,
      previousClose: quote.previousClose ?? dailyRows.at(-2)?.close ?? null,
      date: tradeDate
    });
  } else if (latestDaily && Number.isFinite(latestDaily.open)) {
    points.push({
      time: "09:30",
      price: latestDaily.open,
      average: latestDaily.open,
      volume: 0,
      openInterest: quote.openInterest ?? null,
      previousClose: dailyRows.at(-2)?.close ?? null,
      date: latestDaily.date
    });
  }
  const latestPrice = quote.latestPrice ?? latestDaily?.close ?? null;
  const latestTime = quote.quoteTime || "15:00";
  if (Number.isFinite(latestPrice) && (!points.length || points.at(-1).time !== latestTime || points.at(-1).price !== latestPrice)) {
    points.push({
      time: latestTime,
      price: latestPrice,
      average: latestPrice,
      volume: quote.volume ?? latestDaily?.volume ?? null,
      openInterest: quote.openInterest ?? null,
      previousClose: quote.previousClose ?? dailyRows.at(-2)?.close ?? null,
      date: tradeDate
    });
  }
  return points;
}

async function loadMarketData() {
  const file = join(rootDir, "data", "market.json");
  const text = await readFile(file, "utf8");
  return JSON.parse(text);
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const { timeoutMs, ...fetchOptions } = options;
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}) {
  return parseWrappedJson(await fetchText(url, options));
}

function parseWrappedJson(text) {
  const cleaned = text.replace(/^\/\*[\s\S]*?\*\//, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObject = cleaned.indexOf("{");
    const firstArray = cleaned.indexOf("[");
    const starts = [firstObject, firstArray].filter((index) => index >= 0);
    if (!starts.length) throw new Error("unexpected payload");
    const start = Math.min(...starts);
    const open = cleaned[start];
    const end = open === "{" ? cleaned.lastIndexOf("}") : cleaned.lastIndexOf("]");
    if (end < start) throw new Error("unexpected payload");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pctNumber(value) {
  const number = toNumber(value);
  return Number.isFinite(number) ? number / 100 : null;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function contractToPinzhong(contract) {
  return String(contract || "").replace(/0$/, "").toLowerCase();
}

function parseOptionMonth(symbol) {
  const match = String(symbol).match(/[A-Za-z]+(\d{4})[CP]\d+$/i);
  return match?.[1] ?? "";
}

function parseStrike(symbol) {
  const match = String(symbol).match(/[CP](\d+(?:\.\d+)?)$/i);
  return match ? toNumber(match[1]) : null;
}

server.on("error", (error) => {
  console.error(`Futures dashboard server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Futures dashboard: http://${host}:${port}`);
});
