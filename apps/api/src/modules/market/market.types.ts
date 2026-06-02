export interface MarketQuote {
  ticker: string;
  name: string | null;
  price: string;
  currency: string;
  change: string;
  changePercent: number;
  volume: number;
  marketCap: string | null;
  dataTimestamp: string;
  isDelayed: boolean;
}

export interface MarketSearchItem {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

export interface MarketSearchResult {
  results: MarketSearchItem[];
}

export interface CompanyOverview {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string;
  marketCap: string | null;
  peRatio: string | null;
  sector: string | null;
  description: string | null;
}
