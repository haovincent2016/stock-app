import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOptionMovers } from "../src/utils/data.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = resolve(rootDir, "data", "market.json");

const commodities = [
  { symbol: "RB0", name: "螺纹钢连续", category: "黑色", exchange: "SHFE", digits: 0, limitPct: 0.05, query: "螺纹钢 期货 库存 供需" },
  { symbol: "I0", name: "铁矿石连续", category: "黑色", exchange: "DCE", digits: 1, limitPct: 0.09, query: "铁矿石 港口库存 期货 供需" },
  { symbol: "JM0", name: "焦煤连续", category: "黑色", exchange: "DCE", digits: 1, limitPct: 0.08, query: "焦煤 期货 供应 需求 库存" },
  { symbol: "J0", name: "焦炭连续", category: "黑色", exchange: "DCE", digits: 1, limitPct: 0.08, query: "焦炭 期货 供应 需求 库存" },
  { symbol: "CU0", name: "沪铜连续", category: "有色", exchange: "SHFE", digits: 0, limitPct: 0.10, query: "沪铜 铜库存 供需 期货" },
  { symbol: "AL0", name: "沪铝连续", category: "有色", exchange: "SHFE", digits: 0, limitPct: 0.10, query: "沪铝 电解铝 库存 供需" },
  { symbol: "AO0", name: "氧化铝连续", category: "有色", exchange: "SHFE", digits: 0, limitPct: 0.10, query: "氧化铝 期货 铝土矿 库存 供需" },
  { symbol: "SS0", name: "不锈钢连续", category: "有色", exchange: "SHFE", digits: 0, limitPct: 0.07, query: "不锈钢 期货 镍铁 库存 供需", contracts: ["SS2607", "SS2608"] },
  { symbol: "SC0", name: "原油连续", category: "能源", exchange: "INE", digits: 1, limitPct: 0.17, query: "原油 期货 EIA OPEC 供需 库存" },
  { symbol: "FU0", name: "燃油连续", category: "能源", exchange: "SHFE", digits: 0, limitPct: 0.17, query: "燃料油 期货 库存 供需 原油" },
  { symbol: "TA0", name: "PTA连续", category: "化工", exchange: "CZCE", digits: 0, limitPct: 0.11, query: "PTA 期货 开工率 库存 供需" },
  { symbol: "SA0", name: "纯碱连续", category: "化工", exchange: "CZCE", digits: 0, limitPct: 0.07, query: "纯碱 期货 库存 供需" },
  { symbol: "SH0", name: "烧碱连续", category: "化工", exchange: "CZCE", digits: 0, limitPct: 0.10, query: "烧碱 期货 库存 供需" },
  { symbol: "UR0", name: "尿素连续", category: "化工", exchange: "CZCE", digits: 0, limitPct: 0.07, query: "尿素 期货 农需 库存 供需" },
  { symbol: "M0", name: "豆粕连续", category: "农产品", exchange: "DCE", digits: 0, limitPct: 0.06, query: "豆粕 大豆压榨 库存 供需 期货" },
  { symbol: "P0", name: "棕榈油连续", category: "农产品", exchange: "DCE", digits: 0, limitPct: 0.07, query: "棕榈油 马来西亚 库存 供需 期货" },
  { symbol: "JD0", name: "鸡蛋连续", category: "农产品", exchange: "DCE", digits: 0, limitPct: 0.06, query: "鸡蛋 期货 现货 蛋鸡 存栏 供需", contracts: ["JD2607", "JD2608"] },
  { symbol: "CF0", name: "棉花连续", category: "农产品", exchange: "CZCE", digits: 0, limitPct: 0.06, query: "棉花 期货 供需 库存 美棉" },
  { symbol: "AU0", name: "沪金连续", category: "贵金属", exchange: "SHFE", digits: 2, limitPct: 0.17, query: "黄金 期货 美债 美联储 需求" }
];

const eastmoneyQuoteToken = "1101ffec61617c99be287c1bec3085ff";
const eastmoneyMarketIds = {
  SHFE: "113",
  DCE: "114",
  CZCE: "115",
  INE: "142"
};
const eastmoneyQuoteFields = [
  "name", "sc", "dm", "p", "zsjd", "zdf", "zde", "utime", "o", "zjsj",
  "qrspj", "h", "l", "mrj", "mcj", "vol", "cclbh", "zt", "dt", "np",
  "wp", "ccl", "rz", "cje", "mcl", "mrl", "jjsj", "j", "lb", "zf"
];
const fallbackLimitRules = {
  RB0: { limitPct: 0.05, tickSize: 1 },
  I0: { limitPct: 0.09, tickSize: 0.5 },
  JM0: { limitPct: 0.08, tickSize: 0.5 },
  J0: { limitPct: 0.08, tickSize: 0.5 },
  CU0: { limitPct: 0.10, tickSize: 10 },
  AL0: { limitPct: 0.10, tickSize: 5 },
  AO0: { limitPct: 0.10, tickSize: 1 },
  SS0: { limitPct: 0.07, tickSize: 5 },
  SC0: { limitPct: 0.17, tickSize: 0.1 },
  FU0: { limitPct: 0.17, tickSize: 1 },
  TA0: { limitPct: 0.11, tickSize: 2 },
  SA0: { limitPct: 0.07, tickSize: 1 },
  SH0: { limitPct: 0.10, tickSize: 1 },
  UR0: { limitPct: 0.07, tickSize: 1 },
  M0: { limitPct: 0.06, tickSize: 1 },
  P0: { limitPct: 0.07, tickSize: 2 },
  JD0: { limitPct: 0.06, tickSize: 1 },
  CF0: { limitPct: 0.06, tickSize: 5 },
  AU0: { limitPct: 0.17, tickSize: 0.02 }
};

const positiveKeywords = ["减产", "去库", "库存下降", "库存减少", "供应收紧", "限产", "进口减少", "产量下降", "开工下降", "需求回升", "需求增加", "出口增加", "低库存"];
const negativeKeywords = ["增产", "累库", "库存上升", "库存增加", "供应增加", "进口增加", "产量增加", "开工回升", "需求疲软", "需求下降", "出口减少", "高库存"];

const eastmoneyNewsUrls = [
  "https://qhweb.eastmoney.com/news",
  "https://futures.eastmoney.com/news/cqsyw.html",
  "https://futures.eastmoney.com/news/cjdgc.html",
  "https://futures.eastmoney.com/news/czhzx.html",
  "https://futures.eastmoney.com/news/cwpsd.html"
];

const commodityKeywordMap = {
  RB0: ["螺纹钢", "钢材", "建材", "热卷", "钢厂", "铁水"],
  I0: ["铁矿石", "铁矿", "港口铁矿", "澳矿", "巴西矿"],
  JM0: ["焦煤", "炼焦煤", "煤矿", "双焦"],
  J0: ["焦炭", "焦企", "双焦"],
  CU0: ["沪铜", "精铜", "铜矿", "铜库存", "电解铜"],
  AL0: ["沪铝", "电解铝", "铝锭", "铝水", "铝库存"],
  AO0: ["氧化铝", "铝土矿", "氧化铝库存", "氧化铝期货"],
  SS0: ["不锈钢", "304", "镍铁", "不锈钢库存", "不锈钢现货"],
  SC0: ["原油", "OPEC", "EIA", "成品油", "WTI", "布伦特"],
  FU0: ["燃料油", "燃油", "高硫燃料油", "低硫燃料油", "船燃", "保税燃料油"],
  TA0: ["PTA", "PX", "聚酯", "织造", "逸盛"],
  SA0: ["纯碱", "碱厂", "重碱", "轻碱"],
  SH0: ["烧碱", "液碱", "片碱", "氯碱"],
  UR0: ["尿素", "复合肥", "煤化工尿素", "尿素库存"],
  M0: ["豆粕", "大豆压榨", "油厂", "美豆", "豆粕库存"],
  P0: ["棕榈油", "棕油", "MPOB", "马来棕榈"],
  JD0: ["鸡蛋", "蛋鸡", "蛋价", "鸡蛋现货"],
  CF0: ["棉花", "郑棉", "美棉", "纺织", "棉纱"],
  AU0: ["黄金", "沪金", "贵金属", "金价"]
};

const spotKeywordMap = {
  RB0: ["螺纹钢"],
  I0: ["铁矿石", "铁矿"],
  JM0: ["焦煤", "炼焦煤"],
  J0: ["焦炭"],
  CU0: ["铜", "电解铜", "1#铜"],
  AL0: ["铝", "电解铝", "A00铝"],
  AO0: ["氧化铝"],
  SS0: ["不锈钢", "304不锈钢"],
  SC0: ["原油", "WTI原油", "布伦特"],
  FU0: ["燃料油", "燃油"],
  TA0: ["PTA", "精对苯二甲酸"],
  SA0: ["纯碱", "重质纯碱"],
  SH0: ["烧碱", "片碱", "液碱"],
  UR0: ["尿素"],
  M0: ["豆粕"],
  P0: ["棕榈油"],
  JD0: ["鸡蛋"],
  CF0: ["棉花"],
  AU0: ["黄金"]
};

const fundamentalProfiles = {
  RB0: {
    supply: ["钢厂高炉和电炉开工决定近端产量弹性", "长流程利润、废钢到货和限产政策影响供应节奏", "社会库存和钢厂库存是观察供应压力的核心变量"],
    demand: ["地产施工、基建开工和资金到位决定建材需求", "雨季、高温和冬储会改变表观消费节奏", "成交量与库存去化配合验证终端承接强弱"]
  },
  I0: {
    supply: ["澳洲、巴西发运和到港量决定港口供给", "矿山检修、天气扰动和港口压港影响短期供应", "港口库存结构和高低品资源可用性影响盘面定价"],
    demand: ["铁水产量是铁矿需求的核心观察项", "钢厂利润和烧结限产会改变补库意愿", "成材需求兑现程度决定铁水维持能力"]
  },
  JM0: {
    supply: ["煤矿安监、产地发运和进口蒙煤通关影响供应", "洗煤厂开工和煤矿库存反映近端供给压力", "澳煤、俄煤和蒙煤价格变化影响替代供应"],
    demand: ["焦化利润和焦企开工决定炼焦煤采购强度", "钢厂铁水和焦炭补库节奏传导到焦煤需求", "低库存阶段对优质主焦煤更敏感"]
  },
  J0: {
    supply: ["焦企开工、利润和环保限产决定焦炭供应", "焦企库存和厂内订单反映出货压力", "焦煤成本变化影响焦炭成本支撑"],
    demand: ["钢厂铁水产量决定焦炭刚性需求", "钢厂库存天数和补库节奏影响现货议价", "成材利润收缩时焦炭需求弹性下降"]
  },
  CU0: {
    supply: ["铜矿TC、冶炼检修和进口到港决定精铜供应", "交易所库存和保税区库存反映可流通货源", "进口盈亏影响境内外货源流入"],
    demand: ["电网、家电、汽车和新能源是主要消费方向", "下游开工率和订单改善验证需求强度", "旺季补库和价格回落会影响采购节奏"]
  },
  AL0: {
    supply: ["电解铝运行产能、电力约束和复产节奏决定供应", "铝锭铝棒库存变化反映流通压力", "氧化铝和电力成本影响利润与开工稳定性"],
    demand: ["型材、板带箔、线缆和新能源订单驱动消费", "地产与汽车链条决定终端需求弹性", "铝棒加工费和出库量验证实际需求"]
  },
  AO0: {
    supply: ["铝土矿供应、矿石品位和进口到港影响氧化铝产量", "氧化铝厂检修、焙烧和环保约束影响开工", "厂库和港口库存决定现货流通宽松程度"],
    demand: ["电解铝运行产能决定氧化铝刚性需求", "铝厂补库节奏和长单执行影响成交活跃度", "电解铝利润变化会影响原料采购节奏"]
  },
  SS0: {
    supply: ["不锈钢厂排产、检修和新增产能决定供应", "镍铁、铬铁和废不锈钢成本影响利润与开工", "无锡、佛山社会库存和厂库变化反映流通压力"],
    demand: ["地产、家电、机械和出口订单驱动消费", "下游加工厂开工和原料补库节奏影响成交", "终端补库窗口和现货升贴水验证需求强弱"]
  },
  SC0: {
    supply: ["OPEC+产量政策、美国页岩油和地缘扰动影响供应", "EIA库存、出口和炼厂开工反映供给压力", "进口成本和运费变化影响内盘估值"],
    demand: ["炼厂开工、成品油裂解价差和出行需求决定消费", "汽柴油库存和航煤需求验证终端表现", "宏观增长预期影响能源需求定价"]
  },
  FU0: {
    supply: ["炼厂出料、进口到港和保税船燃库存影响供应", "高硫与低硫资源结构决定可交割压力", "原油成本和炼厂利润影响产出节奏"],
    demand: ["航运燃料需求和发电需求影响消费", "船燃加注量和运价变化反映终端活跃度", "替代燃料价差会改变采购偏好"]
  },
  TA0: {
    supply: ["PTA装置开工、检修和新产能投放决定供应", "PX成本和加工差影响装置负荷", "社会库存和仓单压力体现供给宽松程度"],
    demand: ["聚酯开工和织造订单决定PTA需求", "终端纺服订单和出口变化影响消费", "聚酯库存和现金流决定原料补库节奏"]
  },
  SA0: {
    supply: ["纯碱装置开工、检修和新增产能决定供应", "轻重碱结构和厂库变化影响现货压力", "碱厂利润变化影响负荷稳定性"],
    demand: ["浮法玻璃和光伏玻璃产线决定重碱需求", "玻璃冷修、点火和日熔量变化影响消费", "下游补库节奏和库存天数验证需求"]
  },
  SH0: {
    supply: ["氯碱装置开工和检修影响烧碱供应", "液碱、片碱区域货源和运输半径影响流通", "氧化铝采购和出口变化会影响价格弹性"],
    demand: ["氧化铝、粘胶、造纸和印染是主要需求方向", "下游开工率和采购周期影响成交", "区域价差和库存变化验证需求强弱"]
  },
  UR0: {
    supply: ["煤头、气头装置开工和检修决定日产水平", "企业库存和港口库存反映供应压力", "出口政策和国际价差影响外流预期"],
    demand: ["农业追肥、复合肥开工和淡储决定需求节奏", "季节性农需窗口对价格弹性较强", "工业需求和复合肥库存影响采购强度"]
  },
  M0: {
    supply: ["进口大豆到港、油厂开机和压榨量决定豆粕供应", "豆粕库存和未执行合同反映现货压力", "美豆天气和南美供应影响成本端"],
    demand: ["生猪、禽类和水产饲料需求决定消费", "养殖利润和存栏变化影响补库", "饲料企业库存天数反映采购意愿"]
  },
  P0: {
    supply: ["马来西亚和印尼产量、出口及库存决定供应", "MPOB数据和产地降雨影响供应预期", "进口利润影响国内买船节奏"],
    demand: ["餐饮消费、食品工业和生物柴油决定需求", "豆棕价差影响油脂替代消费", "国内库存和成交量验证终端采购"]
  },
  JD0: {
    supply: ["蛋鸡存栏、补栏和淘鸡节奏决定鸡蛋供应", "产蛋率、天气和疾病影响短期产量", "养殖利润变化影响中期补栏意愿"],
    demand: ["食品厂、学校开学和节假日备货影响需求", "高温淡季和替代品价格改变消费节奏", "销区到货和走货速度验证终端承接"]
  },
  CF0: {
    supply: ["新疆棉产量、加工进度和商业库存决定供应", "进口棉配额和外棉价差影响补充供应", "仓单数量和库存结构影响盘面压力"],
    demand: ["纺企开工、棉纱库存和订单决定需求", "纺织服装出口和内销影响消费预期", "纱线利润和原料库存影响采购节奏"]
  },
  AU0: {
    supply: ["矿产金、回收金和进口流入影响实物供应", "央行购金和ETF持仓改变边际配置需求", "内外盘价差影响进口窗口"],
    demand: ["避险需求、实际利率和美元走势驱动投资需求", "金饰消费和节庆需求影响实物消费", "美联储政策预期决定估值重心"]
  }
};

async function main() {
  await mkdir(dirname(outputFile), { recursive: true });

  const rows = await Promise.all(
    commodities.map(async (item) => {
      const [history, intraday, mainContract] = await Promise.all([
        fetchDailyKline(item.symbol).catch(() => []),
        fetchIntradayLine(item.symbol).catch(() => []),
        fetchMainContract(item.symbol).catch(() => null)
      ]);
      const limitQuote = mainContract
        ? await fetchLimitQuote(item, mainContract).catch((err) => {
            console.warn(`limit quote ${item.symbol} ${mainContract} failed: ${err.message}`);
            return null;
          })
        : null;
      const built = buildCommodity(item, history, intraday, limitQuote);
      if (built && mainContract) {
        built.mainContract = mainContract;
        built.contractMonth = formatContractMonth(mainContract);
      }
      if (built && item.contracts?.length) {
        built.contracts = await fetchContractData(item, mainContract);
      }
      return built;
    })
  );

  const tradableRows = rows.filter(Boolean);
  const recentDates = collectRecentDates(tradableRows, 10);
  const [news, spotByDate] = await Promise.all([
    fetchAllNews(commodities).catch(() => []),
    fetchSpotPriceMaps(recentDates).catch((err) => {
      console.warn(`spot price fetch failed: ${err.message}`);
      return new Map();
    })
  ]);
  const enrichedRows = tradableRows.map((item) => {
    const relatedNews = news.filter((row) => row.symbol === item.symbol);
    const dateMap = spotByDate.get(item.symbol) ?? new Map();
    const latestSpot = pickLatestSpot(dateMap);
    return applySpotBasis(
      {
        ...item,
        summary: buildSupplySummary(item, news),
        monthly: buildMonthlyMetrics(item.history, relatedNews, latestSpot, item)
      },
      dateMap
    );
  });

  const haveSpot = enrichedRows.some((item) => Number.isFinite(item.latest?.spotBasis?.basis));
  const haveLimitQuote = enrichedRows.some((item) => item.limitSource === "东方财富期货行情");
  const sourceParts = ["Sina 日K/分钟线"];
  if (haveLimitQuote) sourceParts.push("东方财富期货涨跌停价");
  if (haveSpot) sourceParts.push("生意社现期表");
  if (!haveSpot) sourceParts.push("生意社现期表暂未返回");
  if (news.length) sourceParts.push("东方财富期货资讯", "Google News RSS");
  if (!news.length) sourceParts.push("资讯源暂未返回");

  const payload = {
    meta: {
      tradeDate: latestTradeDate(enrichedRows),
      updatedAt: new Date().toISOString(),
      status: haveSpot || news.length ? "已更新" : "行情已更新",
      sourceNote: sourceParts.join(" / ")
    },
    commodities: enrichedRows,
    options: buildOptionMovers(enrichedRows, 8),
    news
  };

  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputFile}`);
  console.log(`Commodities: ${enrichedRows.length}; news: ${news.length}`);
}

async function fetchMainContract(symbol) {
  const url = `https://finance.sina.com.cn/futures/quotes/${encodeURIComponent(symbol)}.shtml`;
  const response = await fetch(url, {
    headers: {
      Referer: "https://finance.sina.com.cn/futures/",
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("gb18030").decode(buffer);
  const direct = text.match(/chicang_code\s*=\s*"([A-Z]+\d{3,4})"/)?.[1];
  if (direct) return direct;
  const month = text.match(/inner_futures_per_month\s*=\s*\{[^}]*"data"\s*:\s*\[((?:[^\]])*)\]/);
  if (month) {
    const candidates = month[1].split(",").map((value) => value.replace(/["\s]/g, "")).filter(Boolean);
    return candidates.find((value) => /^[A-Z]+\d{3,4}$/.test(value)) ?? null;
  }
  return null;
}

async function fetchContractData(config, mainContract) {
  const contractCodes = config.contracts ?? [];
  if (!contractCodes.length) return [];
  const results = await Promise.all(
    contractCodes.map(async (contract) => {
      const [history, intraday] = await Promise.all([
        fetchDailyKline(contract).catch(() => []),
        fetchIntradayLine(contract).catch(() => [])
      ]);
      const limitQuote = await fetchLimitQuote(config, contract).catch(() => null);
      const built = buildCommodity(config, history, intraday, limitQuote);
      if (!built) return null;
      built.mainContract = contract;
      built.contractMonth = formatContractMonth(contract);
      built.isMainContract = contract === mainContract;
      return built;
    })
  );
  return results.filter(Boolean);
}

async function fetchLimitQuote(config, contract) {
  const marketId = eastmoneyMarketIds[config.exchange];
  const quoteCode = toEastmoneyContractCode(contract, config.exchange);
  if (!marketId || !quoteCode) return null;

  const url = `https://futsseapi.eastmoney.com/static/${marketId}_${quoteCode}_qt?callbackName=&field=${eastmoneyQuoteFields.join(",")}&token=${eastmoneyQuoteToken}`;
  const text = await fetchText(url, {
    headers: {
      Referer: `https://quote.eastmoney.com/qihuo/${quoteCode}.html`,
      "User-Agent": "Mozilla/5.0"
    }
  });
  const payload = parseWrappedJson(text);
  const quote = payload?.qt;
  if (!quote) return null;
  const limitUp = toNumber(quote.zt);
  const limitDown = toNumber(quote.dt);
  if (!Number.isFinite(limitUp) || !Number.isFinite(limitDown)) return null;
  const previousSettlement = toNumber(quote.zjsj);
  const limitPct = Number.isFinite(previousSettlement) && previousSettlement
    ? inferLimitPct(previousSettlement, limitUp, limitDown)
    : config.limitPct ?? null;
  return {
    contract,
    quoteCode,
    source: "东方财富期货行情",
    sourceUrl: `https://quote.eastmoney.com/qihuo/${quoteCode}.html`,
    tradeDate: quote.utime ? formatUnixSeconds(quote.utime) : null,
    previousSettlement,
    limitUp: roundPrice(limitUp, config.digits),
    limitDown: roundPrice(limitDown, config.digits),
    limitPct,
    priceDigits: Number.isFinite(quote.zsjd) ? quote.zsjd : config.digits
  };
}

function toEastmoneyContractCode(contract, exchange) {
  const match = typeof contract === "string" ? contract.match(/^([A-Z]+)(\d{3,4})$/) : null;
  if (!match) return null;
  const [, letters, digits] = match;
  if (exchange === "CZCE") {
    return `${letters}${digits.length === 4 ? digits.slice(1) : digits}`;
  }
  return `${letters.toLowerCase()}${digits}`;
}

function parseWrappedJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Unexpected Eastmoney payload");
  return JSON.parse(text.slice(start, end + 1));
}

function formatUnixSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function inferLimitPct(previousSettlement, limitUp, limitDown) {
  const upPct = Number.isFinite(limitUp) ? limitUp / previousSettlement - 1 : null;
  const downPct = Number.isFinite(limitDown) ? 1 - limitDown / previousSettlement : null;
  const values = [upPct, downPct].filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatContractMonth(contract) {
  if (typeof contract !== "string") return null;
  const match = contract.match(/^[A-Z]+(\d{3,4})$/);
  if (!match) return null;
  const digits = match[1];
  if (digits.length === 4) {
    const year = `20${digits.slice(0, 2)}`;
    const month = digits.slice(2, 4);
    return { year, month, label: `${year.slice(2)}年${Number(month)}月` };
  }
  const year = `202${digits.slice(0, 1)}`;
  const month = digits.slice(1, 3);
  return { year, month, label: `${year.slice(2)}年${Number(month)}月` };
}

async function fetchDailyKline(symbol) {
  const variableName = `daily_${symbol}_${Date.now()}`;
  const url = `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20${variableName}=/InnerFuturesNewService.getDailyKLine?symbol=${encodeURIComponent(symbol)}`;
  const text = await fetchText(url, {
    headers: sinaHeaders()
  });
  const data = parseJsonpArray(text, symbol);
  return data
    .map((row) => ({
      date: row.d,
      open: toNumber(row.o),
      high: toNumber(row.h),
      low: toNumber(row.l),
      close: toNumber(row.c),
      volume: toNumber(row.v),
      openInterest: toNumber(row.p),
      settlement: toNumber(row.s)
    }))
    .filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite));
}

async function fetchIntradayLine(symbol) {
  const variableName = `minute_${symbol}_${Date.now()}`;
  const url = `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20${variableName}=/InnerFuturesNewService.getMinLine?symbol=${encodeURIComponent(symbol)}`;
  const text = await fetchText(url, {
    headers: sinaHeaders()
  });
  const data = parseJsonpArray(text, symbol);
  let carryDate = "";
  let carryPreviousClose = null;
  return data
    .map((row) => {
      if (row[6]) carryDate = row[6];
      if (Number.isFinite(toNumber(row[5]))) carryPreviousClose = toNumber(row[5]);
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
}

function buildCommodity(config, history, intraday, limitQuote = null) {
  const cleanHistory = history.slice(-260).map((row) => ({
    ...row,
    spotBasis: buildSpotBasis(row, config, null)
  }));

  if (intraday.length) {
    const intradayDate = intraday.find((row) => row.date)?.date;
    const lastHistoryDate = cleanHistory.at(-1)?.date;
    if (intradayDate && intradayDate !== lastHistoryDate) {
      const prices = intraday.map((row) => row.price).filter(Number.isFinite);
      const volumes = intraday.map((row) => row.volume).filter(Number.isFinite);
      const openInterests = intraday.map((row) => row.openInterest).filter(Number.isFinite);
      if (prices.length) {
        const limit = normalizeLimitQuote(config, { settlement: cleanHistory.at(-1)?.settlement, close: cleanHistory.at(-1)?.close }, limitQuote);
        const todayRow = {
          date: intradayDate,
          open: prices[0],
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: prices.at(-1),
          volume: volumes.reduce((sum, v) => sum + v, 0),
          openInterest: openInterests.length ? openInterests.at(-1) : null,
          settlement: null,
          spotBasis: buildSpotBasis({ date: intradayDate, close: prices.at(-1) }, config, null),
          isLive: true,
          limitUp: limit.limitUp,
          limitDown: limit.limitDown
        };
        cleanHistory.push(todayRow);
      }
    }
  }

  if (cleanHistory.length < 15) return null;

  const latest = cleanHistory.at(-1);
  const previous = cleanHistory.at(-2);
  const today = buildTodaySnapshot(latest, previous, intraday);
  const wrSeries = calculateWilliamsSeries(cleanHistory, 14);
  const williamsR = wrSeries.at(-1);
  const previousWilliamsR = wrSeries.at(-2);
  const atr14 = calculateAtr(cleanHistory, 14);
  const rangePct = latest.close ? (latest.high - latest.low) / latest.close : null;
  const changePct = previous?.close ? (latest.close - previous.close) / previous.close : null;

  const limit = normalizeLimitQuote(config, latest, limitQuote);

  return {
    symbol: config.symbol,
    name: config.name,
    category: config.category,
    exchange: config.exchange,
    priceDigits: config.digits,
    limitPct: limit.limitPct,
    limitUp: limit.limitUp,
    limitDown: limit.limitDown,
    limitSource: limit.source,
    limitSourceUrl: limit.sourceUrl,
    limitPreviousSettlement: limit.previousSettlement,
    limitQuoteAt: limit.quoteAt,
    limitMethod: limit.method,
    latest,
    today,
    metrics: {
      changePct,
      rangePct,
      williamsR,
      previousWilliamsR,
      atr14,
      williamsSignal: williamsSignal(williamsR, previousWilliamsR)
    },
    intraday,
    history: cleanHistory,
    weekly: buildWeeklyKline(cleanHistory),
    fundamentals: buildFundamentals(config)
  };
}

function normalizeLimitQuote(config, latest, quote) {
  if (Number.isFinite(quote?.limitUp) && Number.isFinite(quote?.limitDown)) {
    return {
      limitUp: quote.limitUp,
      limitDown: quote.limitDown,
      limitPct: Number.isFinite(quote.limitPct) ? quote.limitPct : (config.limitPct ?? null),
      source: quote.source,
      sourceUrl: quote.sourceUrl,
      previousSettlement: quote.previousSettlement,
      quoteAt: quote.tradeDate,
      method: "quote-field"
    };
  }

  const fallback = buildFallbackLimit(config, latest);
  return {
    ...fallback,
    method: fallback.limitUp == null || fallback.limitDown == null ? "unavailable" : "rule-fallback"
  };
}

function buildFallbackLimit(config, latest) {
  const rule = fallbackLimitRules[config.symbol] ?? {
    limitPct: config.limitPct,
    tickSize: 10 ** -(config.digits ?? 0)
  };
  const previousSettlement = latest?.settlement ?? latest?.close ?? null;
  if (!Number.isFinite(previousSettlement) || !Number.isFinite(rule.limitPct)) {
    return {
      limitPct: rule.limitPct ?? config.limitPct ?? null,
      limitUp: null,
      limitDown: null,
      source: "涨跌停规则兜底",
      sourceUrl: null,
      previousSettlement,
      quoteAt: null
    };
  }
  return {
    limitPct: rule.limitPct,
    limitUp: roundLimitPrice(previousSettlement * (1 + rule.limitPct), rule.tickSize, config.exchange, "up", config.digits),
    limitDown: roundLimitPrice(previousSettlement * (1 - rule.limitPct), rule.tickSize, config.exchange, "down", config.digits),
    source: "涨跌停规则兜底",
    sourceUrl: null,
    previousSettlement,
    quoteAt: latest?.date ?? null
  };
}

function buildSpotBasis(row, config, spot) {
  const rawSpot = Number.isFinite(spot?.spotPrice) ? spot.spotPrice : null;
  const futuresPrice = row.close;
  const reasonable =
    Number.isFinite(rawSpot) &&
    Number.isFinite(futuresPrice) &&
    futuresPrice > 0 &&
    Math.abs(rawSpot - futuresPrice) / futuresPrice <= 0.35;
  const spotPrice = reasonable ? rawSpot : null;
  const basis = reasonable ? rawSpot - futuresPrice : null;
  const basisPct = reasonable && futuresPrice ? basis / futuresPrice : null;
  const status = reasonable
    ? "已接入"
    : Number.isFinite(rawSpot)
      ? "现货与主力期货品级不可比"
      : "待接入现货价源";
  const source = reasonable ? "生意社现期表 (100ppi.com/sf/)" : "现货价源待配置";
  return {
    date: row.date,
    spotPrice,
    futuresPrice,
    basis,
    basisPct,
    formula: "现货价 - 期货收盘价",
    status,
    source,
    commodity: spot?.commodity || config.name.replace("连续", "")
  };
}

function buildFundamentals(config) {
  return fundamentalProfiles[config.symbol] ?? {
    supply: ["关注主产区产量、装置开工、进口到港和库存变化", "库存结构和仓单压力会影响近端供应弹性", "利润变化会改变中短期开工和投放节奏"],
    demand: ["关注下游开工、订单和采购节奏", "季节性消费窗口会影响补库强弱", "终端利润和库存天数决定需求承接能力"]
  };
}

function buildTodaySnapshot(latest, previous, intraday) {
  const points = intraday.length
    ? intraday.map((row) => ({
        time: row.time,
        date: row.date,
        price: row.price,
        average: row.average,
        volume: row.volume,
        openInterest: row.openInterest
      }))
    : dailyAsIntraday(latest);

  const prices = points.map((row) => row.price).filter(Number.isFinite);
  const latestPoint = points.at(-1);
  const previousClose = intraday.find((row) => Number.isFinite(row.previousClose))?.previousClose ?? previous?.close ?? latest?.open ?? null;
  const latestPrice = latestPoint?.price ?? latest.close;
  const high = prices.length ? Math.max(...prices) : latest.high;
  const low = prices.length ? Math.min(...prices) : latest.low;
  const volume = intraday.length
    ? intraday.reduce((sum, row) => sum + (Number.isFinite(row.volume) ? row.volume : 0), 0)
    : latest.volume;

  return {
    date: latestPoint?.date || latest.date,
    latestPrice,
    previousClose,
    changePct: previousClose ? (latestPrice - previousClose) / previousClose : null,
    rangePct: latestPrice ? (high - low) / latestPrice : null,
    high,
    low,
    volume,
    points
  };
}

function dailyAsIntraday(latest) {
  return [
    { time: "开盘", date: latest.date, price: latest.open, average: latest.open, volume: 0, openInterest: latest.openInterest },
    { time: "最高", date: latest.date, price: latest.high, average: latest.high, volume: latest.volume / 3, openInterest: latest.openInterest },
    { time: "最低", date: latest.date, price: latest.low, average: latest.low, volume: latest.volume / 3, openInterest: latest.openInterest },
    { time: "收盘", date: latest.date, price: latest.close, average: latest.close, volume: latest.volume / 3, openInterest: latest.openInterest }
  ];
}

function buildWeeklyKline(history) {
  const weeks = new Map();
  history.forEach((row) => {
    const key = weekKey(row.date);
    if (!weeks.has(key)) {
      weeks.set(key, {
        date: key,
        endDate: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume ?? 0,
        openInterest: row.openInterest ?? null
      });
      return;
    }
    const week = weeks.get(key);
    week.endDate = row.date;
    week.high = Math.max(week.high, row.high);
    week.low = Math.min(week.low, row.low);
    week.close = row.close;
    week.volume += row.volume ?? 0;
    week.openInterest = row.openInterest ?? week.openInterest;
  });
  return [...weeks.values()].slice(-120);
}

function buildMonthlyMetrics(history, relatedNews, spot, item) {
  const months = new Map();
  history.forEach((row) => {
    const key = row.date.slice(0, 7);
    if (!months.has(key)) {
      months.set(key, {
        month: key,
        startDate: row.date,
        endDate: row.date,
        firstClose: row.close,
        close: row.close,
        settlement: row.settlement,
        high: row.high,
        low: row.low,
        volume: 0,
        tradingDays: 0,
        openInterestStart: row.openInterest,
        openInterest: row.openInterest
      });
      return;
    }

    const month = months.get(key);
    month.endDate = row.date;
    month.close = row.close;
    month.settlement = row.settlement;
    month.high = Math.max(month.high, row.high);
    month.low = Math.min(month.low, row.low);
    if (Number.isFinite(row.openInterest)) month.openInterest = row.openInterest;
  });

  history.forEach((row) => {
    const month = months.get(row.date.slice(0, 7));
    month.volume += row.volume ?? 0;
    month.tradingDays += 1;
  });

  return [...months.values()].map((month, index, arr) => {
    const monthNews = relatedNews.filter((row) => {
      if (!row.publishedAt) return false;
      return row.publishedAt.slice(0, 7) === month.month;
    });
    const tightCount = monthNews.filter((row) => row.tone === "tight").length;
    const looseCount = monthNews.filter((row) => row.tone === "loose").length;
    const neutralCount = monthNews.filter((row) => row.tone === "neutral").length;
    const basis = Number.isFinite(month.settlement) && Number.isFinite(month.close)
      ? month.settlement - month.close
      : null;
    const isLatestMonth = index === arr.length - 1;
    const rawSpotPrice = isLatestMonth && Number.isFinite(spot?.spotPrice) ? spot.spotPrice : null;
    const reasonable =
      Number.isFinite(rawSpotPrice) &&
      Number.isFinite(month.close) &&
      month.close > 0 &&
      Math.abs(rawSpotPrice - month.close) / month.close <= 0.35;
    const spotPrice = reasonable ? rawSpotPrice : null;
    const spotBasisValue = reasonable ? rawSpotPrice - month.close : null;
    const spotBasisPct = reasonable && month.close ? spotBasisValue / month.close : null;

    const row = {
      month: month.month,
      startDate: month.startDate,
      endDate: month.endDate,
      tradingDays: month.tradingDays,
      volume: month.volume,
      avgVolume: month.tradingDays ? month.volume / month.tradingDays : null,
      openInterest: month.openInterest,
      openInterestChange: Number.isFinite(month.openInterest) && Number.isFinite(month.openInterestStart)
        ? month.openInterest - month.openInterestStart
        : null,
      close: month.close,
      settlement: month.settlement,
      basis,
      basisPct: Number.isFinite(basis) && Number.isFinite(month.close) && month.close
        ? basis / month.close
        : null,
      spotBasis: {
        month: month.month,
        spotPrice,
        futuresPrice: month.close,
        basis: spotBasisValue,
        basisPct: spotBasisPct,
        formula: "现货价 - 月末期货收盘价",
        status: Number.isFinite(spotBasisValue) ? "已接入" : "待接入现货价源",
        source: Number.isFinite(spotBasisValue) ? "生意社现期表 (100ppi.com/sf/)" : "现货价源待配置"
      },
      changePct: Number.isFinite(month.firstClose) && month.firstClose
        ? (month.close - month.firstClose) / month.firstClose
        : null,
      high: month.high,
      low: month.low,
      newsCount: monthNews.length,
      tightCount,
      looseCount,
      neutralCount,
      supplyTone: tightCount > looseCount ? "tight" : looseCount > tightCount ? "loose" : "neutral",
      latestNewsTitle: monthNews[0]?.title ?? ""
    };
    row.fundamentals = buildMonthlyFundamentals(row, index > 0 ? arr[index - 1] : null, monthNews, item);
    return row;
  });
}

function buildFundamentalsFromNews(monthNews) {
  const supplyPattern = /供应|产量|开工|库存|进口|出口|检修|发运|到港|存栏|产能|装置|减产|增产|累库|去库|油价|原油|OPEC|EIA|地缘|空袭|伊朗|战争|制裁|关税|降息|加息|美联储|美元|限产/;
  const demandPattern = /需求|消费|采购|订单|下游|终端|补库|成交|出货|利润|价差|纺织|养殖|铁水|地产|建材|车市|金店|消费者|销售|出口订单/;
  const supplyTitles = monthNews
    .filter((row) => supplyPattern.test(`${row.title} ${row.summary}`))
    .slice(0, 4)
    .map((row) => stripNewsTitle(row.title));
  const demandTitles = monthNews
    .filter((row) => demandPattern.test(`${row.title} ${row.summary}`))
    .slice(0, 4)
    .map((row) => stripNewsTitle(row.title));
  return {
    supplyNews: supplyTitles,
    demandNews: demandTitles
  };
}

function buildMonthlyFundamentals(month, previousMonth, monthNews, item) {
  const newsFundamentals = buildFundamentalsFromNews(monthNews);
  const supplyNews = uniqueText(newsFundamentals.supplyNews);
  const demandNews = uniqueText(newsFundamentals.demandNews);
  const previousAvgVolume = previousMonth?.tradingDays ? previousMonth.volume / previousMonth.tradingDays : null;
  const avgVolumeChange = Number.isFinite(month.avgVolume) && Number.isFinite(previousAvgVolume) && previousAvgVolume
    ? (month.avgVolume - previousAvgVolume) / previousAvgVolume
    : null;
  const closePosition = Number.isFinite(month.high) && Number.isFinite(month.low) && month.high > month.low
    ? (month.close - month.low) / (month.high - month.low)
    : null;

  if (Number.isFinite(month.changePct)) {
    if (month.changePct > 0.015) {
      pushText(supplyNews, `本月价格上涨 ${formatSignedPctText(month.changePct)}，供应压力暂未压制盘面，关注库存去化或成本支撑。`);
    } else if (month.changePct < -0.015) {
      pushText(supplyNews, `本月价格下跌 ${formatSignedPctText(month.changePct)}，供应宽松、库存压力或成本走弱需要重点排查。`);
    } else {
      pushText(supplyNews, "本月价格围绕月初窄幅波动，供应端暂未形成明确单边驱动。");
    }
  }

  if (Number.isFinite(month.openInterestChange)) {
    const direction = month.openInterestChange > 0 ? "增加" : month.openInterestChange < 0 ? "减少" : "基本持平";
    pushText(supplyNews, `月末持仓较月初${direction} ${formatSignedNumberText(month.openInterestChange)}，套保与资金分歧变化值得跟踪。`);
  }

  if (Number.isFinite(month.spotBasis?.basis)) {
    const basisTone = month.spotBasis.basis > 0
      ? "现货升水期货，近端货源或现货承接相对偏强"
      : month.spotBasis.basis < 0
        ? "现货贴水期货，现货端压力或远月预期仍需观察"
        : "现货与期货基本平水";
    pushText(supplyNews, `月末期现基差 ${formatSignedNumberText(month.spotBasis.basis, item?.priceDigits ?? 0)}，${basisTone}。`);
  }

  if (Number.isFinite(avgVolumeChange)) {
    if (avgVolumeChange > 0.12) {
      pushText(demandNews, `本月日均成交 ${compactNumberText(month.avgVolume)}，较上月放大 ${formatSignedPctText(avgVolumeChange)}，需求预期与资金博弈升温。`);
    } else if (avgVolumeChange < -0.12) {
      pushText(demandNews, `本月日均成交 ${compactNumberText(month.avgVolume)}，较上月收缩 ${formatSignedPctText(avgVolumeChange)}，终端追价和补库意愿偏谨慎。`);
    } else {
      pushText(demandNews, `本月日均成交 ${compactNumberText(month.avgVolume)}，较上月变化不大，需求端维持观察。`);
    }
  } else if (Number.isFinite(month.avgVolume)) {
    pushText(demandNews, `本月日均成交 ${compactNumberText(month.avgVolume)}，成交强弱需结合后续月份对比。`);
  }

  if (Number.isFinite(closePosition)) {
    if (closePosition >= 0.7) {
      pushText(demandNews, "月末收盘靠近月内高位，补库预期或终端承接仍对盘面有支撑。");
    } else if (closePosition <= 0.3) {
      pushText(demandNews, "月末收盘靠近月内低位，需求兑现偏弱或采购节奏放缓。");
    } else {
      pushText(demandNews, "月末收盘处于月内区间中部，需求端暂无明确方向。");
    }
  }

  if (Number.isFinite(month.volume)) {
    pushText(demandNews, `本月累计成交 ${compactNumberText(month.volume)}，覆盖 ${month.tradingDays || "--"} 个交易日。`);
  }

  const baseSupply = item?.fundamentals?.supply ?? [];
  const baseDemand = item?.fundamentals?.demand ?? [];
  const seed = Math.max(0, Number(month.month.slice(5, 7)) - 1);
  if (baseSupply.length) pushText(supplyNews, `基础关注：${baseSupply[seed % baseSupply.length]}`);
  if (baseDemand.length) pushText(demandNews, `基础关注：${baseDemand[seed % baseDemand.length]}`);

  return {
    supplyNews: supplyNews.slice(0, 5),
    demandNews: demandNews.slice(0, 5),
    source: monthNews.length ? "当月资讯 + 行情推导" : "行情推导"
  };
}

function stripNewsTitle(title) {
  return (title ?? "").replace(/\s+-\s+.*$/, "").trim();
}

function uniqueText(values) {
  const out = [];
  (values ?? []).forEach((value) => pushText(out, value));
  return out;
}

function pushText(rows, value) {
  const text = (value ?? "").toString().trim();
  if (!text || rows.includes(text)) return;
  rows.push(text);
}

function formatSignedPctText(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

function formatSignedNumberText(value, digits = 0) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value)}`;
}

function compactNumberText(value) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function weekKey(dateValue) {
  const date = new Date(`${dateValue}T00:00:00+08:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function calculateWilliamsSeries(history, period) {
  return history.map((row, index) => {
    if (index + 1 < period) return null;
    const window = history.slice(index + 1 - period, index + 1);
    const highestHigh = Math.max(...window.map((item) => item.high));
    const lowestLow = Math.min(...window.map((item) => item.low));
    const span = highestHigh - lowestLow;
    if (!span) return 0;
    return ((highestHigh - row.close) / span) * -100;
  });
}

function calculateAtr(history, period) {
  if (history.length < period + 1) return null;
  const trueRanges = history.slice(1).map((row, index) => {
    const previousClose = history[index].close;
    return Math.max(
      row.high - row.low,
      Math.abs(row.high - previousClose),
      Math.abs(row.low - previousClose)
    );
  });
  const slice = trueRanges.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

function williamsSignal(current, previous) {
  if (!Number.isFinite(current)) return "暂无";
  if (Number.isFinite(previous) && previous <= -80 && current > -80) return "低位回升";
  if (Number.isFinite(previous) && previous >= -20 && current < -20) return "高位回落";
  if (current <= -80) return "低位";
  if (current >= -20) return "高位";
  return "中性";
}

async function fetchAllNews(configs) {
  const pageNews = await fetchEastmoneyNews().catch(() => []);
  const rssResults = await Promise.allSettled(configs.map((config) => fetchCommodityNews(config)));
  const rssNews = rssResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return dedupeNews([...pageNews, ...rssNews])
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function fetchCommodityNews(config) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(config.query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  const xml = await fetchText(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 4)
    .map(([, item]) => {
      const title = decodeXml(readTag(item, "title"));
      const url = decodeXml(readTag(item, "link"));
      const date = new Date(readTag(item, "pubDate"));
      const source = decodeXml(readNestedTag(item, "source") || "Google News");
      const summary = cleanSummary(decodeXml(readTag(item, "description")));
      return {
        symbol: config.symbol,
        commodity: config.name.replace("连续", ""),
        title,
        url,
        source,
        publishedAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        summary,
        tone: classifyTone(`${title} ${summary}`)
      };
    })
    .filter((item) => item.title && item.url);
}

async function fetchEastmoneyNews() {
  const pages = await Promise.allSettled(
    eastmoneyNewsUrls.map((url) =>
      fetchText(url, {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      })
    )
  );
  return dedupeNews(
    pages.flatMap((result) => (result.status === "fulfilled" ? parseEastmoneyNews(result.value) : []))
  );
}

function parseEastmoneyNews(html) {
  const rows = [];
  const listPattern = /<a\b(?=[^>]*class=["'][^"']*\blist\b)(?=[^>]*href=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, rawUrl, block] of html.matchAll(listPattern)) {
    const title = readClassText(block, "title");
    const summary = readClassText(block, "summary");
    const source = readClassText(block, "source") || "东方财富";
    if (!title || title.length < 6) continue;
    const matched = matchCommodity(`${title} ${summary}`);
    if (!matched) continue;
    rows.push({
      symbol: matched.symbol,
      commodity: matched.name.replace("连续", ""),
      title,
      url: absolutizeEastmoneyUrl(rawUrl),
      source,
      publishedAt: inferDateFromUrl(rawUrl),
      summary,
      tone: classifyTone(`${title} ${summary}`)
    });
  }

  const legacyPattern = /<a\b[^>]*href=["']([^"']*\/news\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, rawUrl, rawTitle] of html.matchAll(legacyPattern)) {
    if (/\bclass=["'][^"']*\btitle\b/i.test(rawTitle)) continue;
    const title = cleanSummary(decodeXml(rawTitle));
    if (!title || title.length < 6) continue;
    const matched = matchCommodity(title);
    if (!matched) continue;
    rows.push({
      symbol: matched.symbol,
      commodity: matched.name.replace("连续", ""),
      title,
      url: absolutizeEastmoneyUrl(rawUrl),
      source: "东方财富",
      publishedAt: inferDateFromUrl(rawUrl),
      summary: title,
      tone: classifyTone(title)
    });
  }
  return rows;
}

function readClassText(html, className) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  return cleanSummary(decodeXml(html.match(pattern)?.[1] ?? ""));
}

function matchCommodity(text) {
  for (const item of commodities) {
    const keywords = commodityKeywordMap[item.symbol] ?? [item.name.replace("连续", "")];
    if (keywords.some((keyword) => text.includes(keyword))) return item;
  }
  return null;
}

function buildSupplySummary(item, news) {
  const related = news.filter((row) => row.symbol === item.symbol);
  const signal = item.metrics?.williamsSignal ? `W%R ${item.metrics.williamsSignal}` : "W%R 待更新";
  if (!related.length) return `${signal}；等待最新供需资讯。`;
  const tight = related.filter((row) => row.tone === "tight").length;
  const loose = related.filter((row) => row.tone === "loose").length;
  const tone = tight > loose ? "供需线索偏紧" : loose > tight ? "供需线索偏松" : "供需线索中性";
  return `${signal}；${tone}，近端关注 ${related[0].title.replace(/\s+-\s+.*$/, "")}`;
}

function classifyTone(text) {
  const positiveScore = positiveKeywords.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
  const negativeScore = negativeKeywords.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
  if (positiveScore > negativeScore) return "tight";
  if (negativeScore > positiveScore) return "loose";
  return "neutral";
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

async function fetchSpotPriceMaps(dates) {
  const userAgent = "Mozilla/5.0";
  const challengeUrl = "https://www.100ppi.com/sf/";
  const probe = await fetchText(challengeUrl, { headers: { "User-Agent": userAgent } });
  const token = probe.match(/_0x2 = "([a-f0-9]+)"/)?.[1];
  const cookie = token ? `HW_CHECK=${token}` : "";

  const todayHtml = cookie
    ? await fetchText(challengeUrl, { headers: { "User-Agent": userAgent, Cookie: cookie, Referer: challengeUrl } })
    : probe;
  const todayDate = todayHtml.match(/(20\d{2})年(\d{2})月(\d{2})日/)?.slice(1).join("-") ?? null;

  const htmlByDate = new Map();
  if (todayDate) htmlByDate.set(todayDate, todayHtml);

  await Promise.all(
    dates
      .filter((date) => date && date !== todayDate)
      .map(async (date) => {
        try {
          const html = await fetchText(`https://www.100ppi.com/sf/day-${date}.html`, {
            headers: { "User-Agent": userAgent, Cookie: cookie, Referer: "https://www.100ppi.com/sf2/" }
          });
          const rows = parseSpotPriceTable(html);
          if (rows.length) htmlByDate.set(date, html);
        } catch (err) {
          console.warn(`spot ${date} fetch failed: ${err.message}`);
        }
      })
  );

  const result = new Map();
  for (const config of commodities) {
    const keywords = spotKeywordMap[config.symbol] ?? [config.name.replace("连续", "")];
    const dateMap = new Map();
    for (const [date, html] of htmlByDate) {
      const rows = parseSpotPriceTable(html);
      const matched = rows.find((row) => keywords.some((keyword) => row.commodity === keyword))
        ?? rows.find((row) => keywords.some((keyword) => row.commodity.includes(keyword)));
      if (matched) dateMap.set(date, { ...matched, tradeDate: date });
    }
    if (dateMap.size) result.set(config.symbol, dateMap);
  }
  return result;
}

function collectRecentDates(rows, count) {
  const seen = new Set();
  for (const row of rows) {
    const history = row?.history ?? [];
    for (const entry of history.slice(-count)) {
      if (entry?.date) seen.add(entry.date);
    }
  }
  return [...seen].sort().slice(-count);
}

function pickLatestSpot(dateMap) {
  if (!dateMap?.size) return null;
  const lastDate = [...dateMap.keys()].sort().at(-1);
  return dateMap.get(lastDate) ?? null;
}

function parseSpotPriceTable(html) {
  const rows = [];
  const rowPattern = /<tr\s[^>]*bgcolor=["'][^"']*["'][^>]*>([\s\S]*?)<\/tr>/g;
  for (const [, body] of html.matchAll(rowPattern)) {
    const linkMatch = body.match(/<a[^>]*href=["'][^"']*\/sf\/\d+\.html["'][^>]*>([^<]+)<\/a>/);
    if (!linkMatch) continue;
    const commodity = linkMatch[1].trim();
    const cellTexts = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(([, cell]) => decodeXml(cell.replace(/<[^>]+>/g, " "))
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim());
    const spotPrice = toNumber(cellTexts[1]);
    const mainContract = cellTexts[2];
    const mainFutures = toNumber(cellTexts[3]);
    const mainBasis = parseSignedNumber(cellTexts[4]);
    const mainBasisPct = parsePercent(cellTexts[4]);
    if (!Number.isFinite(spotPrice)) continue;
    rows.push({
      commodity,
      spotPrice,
      mainContract,
      mainFutures: Number.isFinite(mainFutures) ? mainFutures : null,
      basis: Number.isFinite(mainBasis) ? mainBasis : null,
      basisPct: Number.isFinite(mainBasisPct) ? mainBasisPct : null
    });
  }
  return rows;
}

function parseSignedNumber(text) {
  if (!text) return NaN;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function parsePercent(text) {
  if (!text) return NaN;
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) / 100 : NaN;
}

function applySpotBasis(item, dateMap) {
  if (!item) return item;
  const history = item.history?.map((row) => {
    const spot = dateMap?.get(row.date) ?? null;
    return { ...row, spotBasis: buildSpotBasis(row, item, spot) };
  }) ?? [];
  const latest = history.at(-1) ?? item.latest;
  return { ...item, history, latest };
}

function parseJsonpArray(text, symbol) {
  const match = text.match(/=\s*\(?\s*(\[.*\])\s*\)?\s*;?\s*$/s);
  if (!match) throw new Error(`Unexpected payload for ${symbol}`);
  return JSON.parse(match[1]);
}

function sinaHeaders() {
  return {
    Referer: "https://finance.sina.com.cn/futures/quotes/",
    "User-Agent": "Mozilla/5.0"
  };
}

function readTag(xml, tag) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "";
}

function readNestedTag(xml, tag) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.replace(/<[^>]+>/g, "") ?? "";
}

function cleanSummary(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function decodeXml(value) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim();
}

function absolutizeEastmoneyUrl(url) {
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://futures.eastmoney.com${url}`;
  return `https://futures.eastmoney.com/${url}`;
}

function inferDateFromUrl(url) {
  const match = url.match(/20\d{6}/);
  if (!match) return new Date().toISOString();
  const raw = match[0];
  return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T12:00:00+08:00`).toISOString();
}

function dedupeNews(rows) {
  const seen = new Set();
  return rows.filter((item) => {
    const key = `${item.symbol}-${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function latestTradeDate(rows) {
  return rows
    .map((item) => item.today?.date || item.latest?.date)
    .filter(Boolean)
    .sort()
    .at(-1) ?? new Date().toISOString().slice(0, 10);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundPrice(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundLimitPrice(value, tickSize, exchange, direction, digits = 0) {
  if (!Number.isFinite(value)) return null;
  const tick = Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 10 ** -digits;
  const scaled = value / tick;
  let ticks;
  if (exchange === "CZCE") {
    ticks = direction === "up" ? Math.ceil(scaled - 1e-10) : Math.floor(scaled + 1e-10);
  } else if (exchange === "DCE") {
    ticks = direction === "up" ? Math.floor(scaled + 1e-10) : Math.ceil(scaled - 1e-10);
  } else {
    ticks = Math.floor(scaled + 1e-10);
  }
  return roundPrice(ticks * tick, digits);
}

main().catch(async (error) => {
  await mkdir(dirname(outputFile), { recursive: true });
  const fallback = buildFallbackPayload(error);
  await writeFile(outputFile, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  console.error(error);
  console.error(`Wrote fallback ${outputFile}`);
  process.exitCode = 1;
});

function buildFallbackPayload(error) {
  const today = new Date().toISOString().slice(0, 10);
  const seeded = commodities.map((item, index) => {
    const base = [3350, 820, 1450, 2050, 78000, 20500, 3300, 612, 3300, 4860, 1680, 1950, 2100, 3020, 7480, 3600, 16000, 560][index];
    const history = Array.from({ length: 80 }, (_, day) => {
      const drift = Math.sin((day + index) / 4) * base * 0.018 + (day - 40) * base * 0.001;
      const close = base + drift;
      return {
        date: new Date(Date.now() - (79 - day) * 86400000).toISOString().slice(0, 10),
        open: close * 0.996,
        high: close * 1.012,
        low: close * 0.988,
        close,
        settlement: close * 1.0006,
        volume: Math.round(120000 + index * 38000 + day * 1600),
        openInterest: Math.round(220000 + index * 12000)
      };
    });
    const intraday = Array.from({ length: 80 }, (_, minute) => {
      const price = base + Math.sin((minute + index) / 7) * base * 0.006 + (minute - 40) * base * 0.00015;
      return {
        time: `${String(9 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
        date: today,
        price,
        average: price * 0.999,
        volume: 500 + minute * 8,
        openInterest: 200000 + index * 1000,
        previousClose: base
      };
    });
    return buildCommodity(item, history, intraday);
  });

  return {
    meta: {
      tradeDate: today,
      updatedAt: new Date().toISOString(),
      status: "示例数据",
      sourceNote: `实时数据更新失败：${error.message}`
    },
    commodities: seeded,
    options: buildOptionMovers(seeded, 8),
    news: []
  };
}
