/**
 * Seeds reference data only: instrument specifications.
 * Never seeds personal financial data (PRD guardrail).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INSTRUMENTS = [
  {
    symbol: "XAUUSD",
    name: "Gold vs US Dollar",
    category: "metal",
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1,
    lotMin: 0.01,
    lotMax: 100,
    lotStep: 0.01,
    pricePrecision: 2,
  },
  {
    symbol: "XAGUSD",
    name: "Silver vs US Dollar",
    category: "metal",
    contractSize: 5000,
    tickSize: 0.001,
    tickValue: 5,
    lotMin: 0.01,
    lotMax: 50,
    lotStep: 0.01,
    pricePrecision: 3,
  },
  {
    symbol: "EURUSD",
    name: "Euro vs US Dollar",
    category: "forex",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1,
    lotMin: 0.01,
    lotMax: 100,
    lotStep: 0.01,
    pricePrecision: 5,
  },
  {
    symbol: "GBPUSD",
    name: "British Pound vs US Dollar",
    category: "forex",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1,
    lotMin: 0.01,
    lotMax: 100,
    lotStep: 0.01,
    pricePrecision: 5,
  },
  {
    symbol: "USDJPY",
    name: "US Dollar vs Japanese Yen",
    category: "forex",
    contractSize: 100000,
    tickSize: 0.001,
    tickValue: 6.67,
    lotMin: 0.01,
    lotMax: 100,
    lotStep: 0.01,
    pricePrecision: 3,
  },
  {
    symbol: "USDCAD",
    name: "US Dollar vs Canadian Dollar",
    category: "forex",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 0.74,
    lotMin: 0.01,
    lotMax: 100,
    lotStep: 0.01,
    pricePrecision: 5,
  },
  {
    symbol: "AUDUSD",
    name: "Australian Dollar vs US Dollar",
    category: "forex",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1,
    lotMin: 0.01,
    lotMax: 100,
    lotStep: 0.01,
    pricePrecision: 5,
  },
  {
    symbol: "BTCUSD",
    name: "Bitcoin vs US Dollar",
    category: "crypto",
    contractSize: 1,
    tickSize: 0.1,
    tickValue: 0.1,
    lotMin: 0.01,
    lotMax: 10,
    lotStep: 0.01,
    pricePrecision: 1,
  },
];

async function main() {
  for (const inst of INSTRUMENTS) {
    await prisma.instrument.upsert({
      where: { symbol: inst.symbol },
      update: {}, // reference data stays as seeded; broker overrides live per-trade
      create: inst,
    });
  }
  console.log(`Seeded ${INSTRUMENTS.length} instruments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
