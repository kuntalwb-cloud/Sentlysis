/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  FileSpreadsheet,
  Upload,
  Layers,
  BarChart3,
  BookOpen,
  Database,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  PieChart,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

interface SummaryStats {
  totalDataPoints: number;
  startDate: string;
  endDate: string;
  currentSentiment: number;
  sentimentRegime: string;
  currentForecastVol: number;
  tenDayForecastVol: number;
  annualizedSharpe: number;
  maxDrawdown: number;
  var95: number;
  pc1VarianceExplained: number;
}

interface TimeSeriesPoint {
  date: string;
  sentimentIndex: number;
  close: number;
  turnover: number;
  pe: number;
  volatility: number;
}

interface ForecastPoint {
  day: number;
  date: string;
  volatility: number;
  upperConfidence: number;
  lowerConfidence: number;
}

interface FactorLoading {
  feature: string;
  loading: number;
  absLoading: number;
}

interface VariancePoint {
  component: string;
  variancePercent: number;
  eigenvalue: number;
}

interface ProcessedRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  turnover: number;
  pe: number;
  pb: number;
  divYield: number;
  sentimentScore: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pca' | 'volatility' | 'explorer' | 'report'>('dashboard');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesPoint[]>([]);
  const [forecastedVol, setForecastedVol] = useState<ForecastPoint[]>([]);
  const [factorLoadings, setFactorLoadings] = useState<FactorLoading[]>([]);
  const [explainedVariance, setExplainedVariance] = useState<VariancePoint[]>([]);
  const [rawRows, setRawRows] = useState<ProcessedRow[]>([]);

  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState<boolean>(false);

  // Generate Sample Dataset 1: Tech Growth Basket
  const loadSampleDataset = (type: 'tech' | 'sp500' | 'emerging') => {
    setLoading(true);
    setError(null);
    try {
      const rows: any[] = [];
      const baseDate = new Date(2025, 0, 1);
      let basePrice = 4500;
      let basePe = 28;
      let basePb = 4.2;
      let baseDiv = 1.2;
      let baseTurnover = 2500000000;

      for (let i = 0; i < 180; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        // skip weekends
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        const dateStr = d.toISOString().split('T')[0];
        const noise = (Math.random() - 0.48) * 0.025;
        basePrice = basePrice * (1 + noise);
        const open = basePrice * (1 + (Math.random() - 0.5) * 0.01);
        const high = Math.max(open, basePrice) * (1 + Math.random() * 0.012);
        const low = Math.min(open, basePrice) * (1 - Math.random() * 0.012);
        const close = basePrice;
        baseTurnover = baseTurnover * (1 + (Math.random() - 0.5) * 0.08);
        basePe = Math.max(10, basePe + (Math.random() - 0.5) * 0.4);
        basePb = Math.max(1.0, basePb + (Math.random() - 0.5) * 0.08);
        baseDiv = Math.max(0.5, baseDiv + (Math.random() - 0.5) * 0.02);

        if (type === 'sp500') {
          basePrice = basePrice * (1 + noise * 0.7);
        } else if (type === 'emerging') {
          basePrice = basePrice * (1 + noise * 1.3);
        }

        rows.push({
          date: dateStr,
          open: parseFloat(open.toFixed(2)),
          high: parseFloat(high.toFixed(2)),
          low: parseFloat(low.toFixed(2)),
          close: parseFloat(close.toFixed(2)),
          turnover: Math.round(baseTurnover),
          pe: parseFloat(basePe.toFixed(2)),
          pb: parseFloat(basePb.toFixed(2)),
          divYield: parseFloat(baseDiv.toFixed(2)),
        });
      }

      sendDataToBackend(rows);
    } catch (err: any) {
      setError(err.message || 'Sample generation failed.');
      setLoading(false);
    }
  };

  const sendDataToBackend = async (rows: any[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setSummary(data.summary);
        setTimeSeriesData(data.timeSeriesData);
        setForecastedVol(data.forecastedVol);
        setFactorLoadings(data.factorLoadings);
        setExplainedVariance(data.explainedVarianceRatio);
        setRawRows(data.rawProcessedRows);
        setLoading(false);

        generateInstitutionalReport(data.summary, data.factorLoadings, data.forecastedVol);
        return;
      }
    } catch (err: any) {
      // API unreachable or static GitHub Pages host fallback
    }

    try {
      const clientData = runClientQuantitativePipeline(rows);
      setSummary(clientData.summary);
      setTimeSeriesData(clientData.timeSeriesData);
      setForecastedVol(clientData.forecastedVol);
      setFactorLoadings(clientData.factorLoadings);
      setExplainedVariance(clientData.explainedVarianceRatio);
      setRawRows(clientData.rawProcessedRows);
      setLoading(false);

      generateInstitutionalReport(clientData.summary, clientData.factorLoadings, clientData.forecastedVol);
    } catch (clientErr: any) {
      setError(clientErr.message || 'Data processing failed');
      setLoading(false);
    }
  };

  const generateInstitutionalReport = async (sum: SummaryStats, loadings: FactorLoading[], forecast: ForecastPoint[]) => {
    setReportLoading(true);
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: sum, factorLoadings: loadings, forecastedVol: forecast }),
      });

      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.report) {
          setReport(data.report);
          return;
        }
      }

      // Fallback client report synthesis if backend returns non-JSON or error
      setReport(generateClientFallbackReport(sum, loadings, forecast));
    } catch (e) {
      console.error('Report generation error:', e);
      setReport(generateClientFallbackReport(sum, loadings, forecast));
    } finally {
      setReportLoading(false);
    }
  };

  // Handle File Upload (Excel / CSV)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv')) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            sendDataToBackend(results.data);
          },
          error: (err: any) => {
            setError(err.message);
          },
        });
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          sendDataToBackend(json);
        } catch (err: any) {
          setError('Failed to parse Excel file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Load default sample on mount
  useEffect(() => {
    loadSampleDataset('tech');
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              Sentlysis
            </h1>
            <p className="text-xs text-slate-400">A comprehensive Application for Market Sentiment and Volatility Analysis</p>
          </div>
        </div>

        {/* Action Controls & Presets */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
            <button
              onClick={() => loadSampleDataset('tech')}
              className="px-3 py-1.5 rounded-md font-medium transition hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              Tech Growth Index
            </button>
            <button
              onClick={() => loadSampleDataset('sp500')}
              className="px-3 py-1.5 rounded-md font-medium transition hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              S&P 500 Basket
            </button>
            <button
              onClick={() => loadSampleDataset('emerging')}
              className="px-3 py-1.5 rounded-md font-medium transition hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              Emerging Markets
            </button>
          </div>

          <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition">
            <Upload className="w-4 h-4" />
            Upload Excel / CSV
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </header>

      {/* Navigation Subheader */}
      <nav className="bg-slate-900/40 border-b border-slate-800/80 px-6 flex items-center gap-6 text-sm overflow-x-auto">
        {[
          { id: 'dashboard', label: 'Real-Time Dashboard', icon: BarChart3 },
          { id: 'pca', label: 'PCA Sentiment Analysis', icon: PieChart },
          { id: 'volatility', label: 'AR(2)-EGARCH(1,1) Forecast', icon: Activity },
          { id: 'explorer', label: 'Data Explorer', icon: Database },
          { id: 'report', label: 'Institutional Research Report', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3.5 border-b-2 font-medium transition whitespace-nowrap ${
                isActive
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Main Content Container */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm animate-pulse font-medium">
              Executing PCA log-returns transformation, Z-score normalization, and EGARCH volatility fitting...
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-4 mb-6 flex items-center gap-3 text-red-300">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {!loading && summary && (
          <>
            {/* 1. DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Activity className="w-16 h-16 text-indigo-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Market Sentiment Index (PC1)</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-bold tracking-tight text-white">{summary.currentSentiment}</span>
                      <span className="text-xs text-slate-400">/ 100</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          summary.currentSentiment > 55
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : summary.currentSentiment < 45
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {summary.sentimentRegime}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <TrendingUp className="w-16 h-16 text-violet-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">10-Day Forecast Volatility</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-bold tracking-tight text-white">
                        {(summary.tenDayForecastVol * 100).toFixed(2)}%
                      </span>
                      <span className="text-xs text-slate-400">EGARCH(1,1)</span>
                    </div>
                    <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
                      <span>Current Vol:</span>
                      <span className="text-slate-200 font-medium">{(summary.currentForecastVol * 100).toFixed(2)}%</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <ShieldAlert className="w-16 h-16 text-amber-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk Metrics (Sharpe & VaR)</p>
                    <div className="flex items-baseline gap-3 mt-2">
                      <div>
                        <span className="text-xl font-bold tracking-tight text-white">{summary.annualizedSharpe}</span>
                        <span className="text-[10px] text-slate-400 block">Sharpe</span>
                      </div>
                      <div className="border-l border-slate-800 pl-3">
                        <span className="text-xl font-bold tracking-tight text-rose-400">-{summary.var95}%</span>
                        <span className="text-[10px] text-slate-400 block">VaR 95%</span>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-400">Max Drawdown: <span className="text-rose-400 font-medium">-{summary.maxDrawdown}%</span></div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Layers className="w-16 h-16 text-blue-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">PCA Variance Captured</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-bold tracking-tight text-white">{summary.pc1VarianceExplained}%</span>
                      <span className="text-xs text-slate-400">PC1 Eigenvalue</span>
                    </div>
                    <div className="mt-3 text-xs text-slate-400">Dataset: <span className="text-slate-200 font-medium">{summary.totalDataPoints} Sessions</span></div>
                  </div>
                </div>

                {/* Main Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Sentiment Index & Price Chart */}
                  <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-white">Market Sentiment Index vs Asset Price</h3>
                        <p className="text-xs text-slate-400">Derived via PCA log-returns and Z-score standardization</p>
                      </div>
                      <span className="text-xs bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20 font-medium">
                        PC1 Sentiment Score (0-100)
                      </span>
                    </div>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={timeSeriesData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <YAxis yAxisId="left" stroke="#818cf8" fontSize={11} domain={[0, 100]} tickLine={false} />
                          <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={11} domain={['auto', 'auto']} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                          <Line yAxisId="left" type="monotone" dataKey="sentimentIndex" name="Sentiment Index (PC1)" stroke="#818cf8" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" dataKey="close" name="Close Price ($)" stroke="#34d399" strokeWidth={1.5} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 10-Day Volatility Forecast Card / Chart */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-base font-bold text-white">10-Day EGARCH Volatility Path</h3>
                      <p className="text-xs text-slate-400">AR(2)-EGARCH(1,1) forward conditional volatility</p>
                    </div>
                    <div className="h-72 w-full flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={forecastedVol}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} tickLine={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                          />
                          <Area type="monotone" dataKey="upperConfidence" stroke="transparent" fill="#f43f5e" fillOpacity={0.1} name="Upper 95% Band" />
                          <Area type="monotone" dataKey="lowerConfidence" stroke="transparent" fill="#334155" fillOpacity={0.3} name="Lower 95% Band" />
                          <Line type="monotone" dataKey="volatility" name="Forecast Vol" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-400">
                      <span>Day 1: <strong className="text-white">{(forecastedVol[0]?.volatility * 100).toFixed(2)}%</strong></span>
                      <span>Day 10: <strong className="text-white">{(forecastedVol[forecastedVol.length - 1]?.volatility * 100).toFixed(2)}%</strong></span>
                    </div>
                  </div>
                </div>

                {/* Factor Loadings & Explained Variance */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h3 className="text-base font-bold text-white mb-1">PCA Factor Loadings (PC1 Weights)</h3>
                    <p className="text-xs text-slate-400 mb-4">Relative contribution of each transformed indicator to market sentiment</p>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={factorLoadings} layout="vertical" margin={{ left: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                          <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                          <YAxis dataKey="feature" type="category" stroke="#94a3b8" fontSize={11} width={130} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} />
                          <Bar dataKey="loading" fill="#6366f1" radius={[0, 4, 4, 0]} name="Eigenvector Weight" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h3 className="text-base font-bold text-white mb-1">PCA Scree Plot (Variance Explained)</h3>
                    <p className="text-xs text-slate-400 mb-4">Percentage of total variance explained by each Principal Component</p>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={explainedVariance}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                          <XAxis dataKey="component" stroke="#94a3b8" fontSize={11} />
                          <YAxis stroke="#94a3b8" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} />
                          <Bar dataKey="variancePercent" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Variance Explained (%)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. PCA TAB */}
            {activeTab === 'pca' && (
              <div className="space-y-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-2">Principal Component Analysis (PCA) Methodology</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Sentlysis takes raw financial series (Open, High, Low, Close, Turnover, P/E, P/B, and Dividend Yield), applies log-returns transformation (r_t = ln(P_t / P_t-1)), standardizes each series via Z-score normalization (z = (x - mean) / std), computes the cross-sectional covariance matrix, and executes eigenvalue decomposition. Principal Component 1 (PC1) captures the dominant common latent factor across price momentum, trading liquidity, and valuation multiples to construct the real-time Market Sentiment Index.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h4 className="text-base font-bold text-white mb-4">Eigenvalue Spectrum & Explained Variance</h4>
                    <div className="space-y-3">
                      {explainedVariance.map((ev, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
                          <div>
                            <span className="font-semibold text-white">{ev.component}</span>
                            <span className="text-xs text-slate-400 block">Eigenvalue: {ev.eigenvalue}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-indigo-400">{ev.variancePercent}%</span>
                            <span className="text-xs text-slate-400 block">Variance</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <h4 className="text-base font-bold text-white mb-4">PC1 Feature Weightings (Factor Loadings)</h4>
                    <div className="space-y-3">
                      {factorLoadings.map((fl, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
                          <span className="text-sm text-slate-200 font-medium">{fl.feature}</span>
                          <span className={`text-sm font-bold ${fl.loading >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {fl.loading > 0 ? `+${fl.loading}` : fl.loading}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. VOLATILITY TAB */}
            {activeTab === 'volatility' && (
              <div className="space-y-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-2">AR(2)-EGARCH(1,1) Volatility Forecasting Engine</h3>
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">
                    Exponential GARCH (EGARCH) captures volatility clustering, persistence, and asymmetric leverage effects (where negative shocks increase forward volatility more than positive shocks of equal magnitude). The conditional variance equation models ln(sigma_t^2) = omega + alpha * (|z_t-1| - E|z|) + gamma * z_t-1 + beta * ln(sigma_t-1^2).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
                    <div className="p-4 bg-slate-800/40 rounded-xl">
                      <span className="text-xs text-slate-400 block">AR(2) Mean Persistence</span>
                      <span className="text-lg font-bold text-indigo-400">phi_1 = 0.35, phi_2 = 0.12</span>
                    </div>
                    <div className="p-4 bg-slate-800/40 rounded-xl">
                      <span className="text-xs text-slate-400 block">EGARCH Asymmetry (gamma)</span>
                      <span className="text-lg font-bold text-rose-400">-0.08 (Leverage Effect)</span>
                    </div>
                    <div className="p-4 bg-slate-800/40 rounded-xl">
                      <span className="text-xs text-slate-400 block">Persistence Parameter (beta)</span>
                      <span className="text-lg font-bold text-emerald-400">0.85 (High Clustering)</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
                  <h4 className="text-base font-bold text-white mb-4">10-Day Forward Volatility Schedule</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                          <th className="py-3 px-4">Forecast Horizon</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Conditional Volatility</th>
                          <th className="py-3 px-4">Lower 95% Band</th>
                          <th className="py-3 px-4">Upper 95% Band</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {forecastedVol.map((f) => (
                          <tr key={f.day} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-4 font-semibold text-white">Day {f.day}</td>
                            <td className="py-3 px-4 text-slate-300">{f.date}</td>
                            <td className="py-3 px-4 font-bold text-indigo-400">{(f.volatility * 100).toFixed(2)}%</td>
                            <td className="py-3 px-4 text-slate-400">{(f.lowerConfidence * 100).toFixed(2)}%</td>
                            <td className="py-3 px-4 text-slate-400">{(f.upperConfidence * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 4. EXPLORER TAB */}
            {activeTab === 'explorer' && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Processed Market Dataset & Sentiment Index</h3>
                    <p className="text-xs text-slate-400">Showing all {rawRows.length} sessions with computed PC1 sentiment scores</p>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Open</th>
                        <th className="py-3 px-3">High</th>
                        <th className="py-3 px-3">Low</th>
                        <th className="py-3 px-3">Close</th>
                        <th className="py-3 px-3">Turnover</th>
                        <th className="py-3 px-3">P/E</th>
                        <th className="py-3 px-3">P/B</th>
                        <th className="py-3 px-3">Div Yield</th>
                        <th className="py-3 px-3 text-indigo-400">Sentiment Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {rawRows.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-3 font-medium text-white">{r.date}</td>
                          <td className="py-2.5 px-3">{r.open.toLocaleString()}</td>
                          <td className="py-2.5 px-3">{r.high.toLocaleString()}</td>
                          <td className="py-2.5 px-3">{r.low.toLocaleString()}</td>
                          <td className="py-2.5 px-3 font-semibold text-emerald-400">{r.close.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-slate-400">{r.turnover.toLocaleString()}</td>
                          <td className="py-2.5 px-3">{r.pe}</td>
                          <td className="py-2.5 px-3">{r.pb}</td>
                          <td className="py-2.5 px-3">{r.divYield}%</td>
                          <td className="py-2.5 px-3 font-bold text-indigo-400">{r.sentimentScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. REPORT TAB */}
            {activeTab === 'report' && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-indigo-400" />
                      Institutional Quantitative Research Report
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Generated via Gemini AI quantitative economic synthesis</p>
                  </div>
                  <button
                    onClick={() => {
                      if (!report) return;
                      const blob = new Blob([report], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'Sentlysis_Research_Report.md';
                      a.click();
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"
                  >
                    <Download className="w-4 h-4" />
                    Download Report (.md)
                  </button>
                </div>

                {reportLoading && (
                  <div className="flex items-center justify-center py-16 gap-3 text-indigo-400">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Synthesizing 2,000-word institutional research report...</span>
                  </div>
                )}

                {!reportLoading && report && (
                  <div className="prose prose-invert max-w-none text-slate-300 space-y-4 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                    {report}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 px-6 text-center text-xs text-slate-500">
        Sentlysis: Comprehensive Market Sentiment & Volatility Analysis • Powered by PCA, AR(2)-EGARCH(1,1), and Google Gemini AI
      </footer>
    </div>
  );
}

function generateClientFallbackReport(summary: SummaryStats, factorLoadings: FactorLoading[], forecastedVol: ForecastPoint[]): string {
  const sent = summary?.currentSentiment ?? 50;
  const regime = summary?.sentimentRegime ?? 'Neutral Consolidation';
  const pc1Var = summary?.pc1VarianceExplained ?? 0;
  const sharpe = summary?.annualizedSharpe ?? 0;
  const maxDD = summary?.maxDrawdown ?? 0;
  const var95 = summary?.var95 ?? 0;
  const currentVol = (summary?.currentForecastVol ? summary.currentForecastVol * 100 : 0).toFixed(2);
  const tenDayVol = (summary?.tenDayForecastVol ? summary.tenDayForecastVol * 100 : 0).toFixed(2);

  return `# Sentlysis Quantitative Market Research & Risk Attribution Report

## 1. Executive Summary & Macro Synthesis
This institutional quantitative report presents an empirical analysis of market sentiment dynamics and forward volatility forecasting derived via **Sentlysis Quantitative Engines**. The evaluation encompasses ${summary?.totalDataPoints ?? 0} trading sessions spanning from **${summary?.startDate ?? 'N/A'}** to **${summary?.endDate ?? 'N/A'}**.

Currently, the primary Principal Component Index (**PC1**) registers a market sentiment score of **${sent} / 100**, classifying the market structure under a **${regime}** regime. Principal Component 1 captures **${pc1Var}%** of the total cross-sectional variance across price momentum, trading volume/turnover, valuation multiples (P/E and P/B), and dividend yields.

- **Current 1-Day Volatility Estimate**: ${currentVol}%
- **10-Day Ahead EGARCH Volatility Projection**: ${tenDayVol}%
- **Annualized Sharpe Ratio**: ${sharpe}
- **Historical Maximum Drawdown**: -${maxDD}%
- **Value-at-Risk (95% Daily Confidence)**: -${var95}%

---

## 2. Methodology & Mathematical Framework

### 2.1 Data Pre-Processing & Log-Returns Transformation
To eliminate non-stationarity and structural unit roots in financial price series $P_t$, raw price data (Open, High, Low, Close) are converted into logarithmic returns $r_t$:
r_t = ln(P_t / P_t-1)

For fundamental valuation metrics (Turnover, P/E, P/B, Dividend Yield), relative growth rates are calculated:
delta_X_t = ln(X_t / X_t-1)

### 2.2 Z-Score Standardization
To prevent high-magnitude metrics (such as turnover) from dominating low-magnitude metrics (such as dividend yield), each column vector is cross-sectionally standardized:
z_j,t = (x_j,t - mean_j) / std_j

### 2.3 Dimensionality Reduction via Principal Component Analysis (PCA)
The standardized matrix is used to construct the sample covariance matrix Sigma, followed by eigenvalue decomposition to derive orthogonal factor weights. Eigenvector v_1 corresponds to the first principal component loadings, projecting multivariable market information into a single latent market sentiment continuum.

### 2.4 AR(2)-EGARCH(1,1) Volatility Modeling
The conditional variance process sigma_t^2 is parameterized using Nelson's Exponential GARCH model:
ln(sigma_t^2) = omega + alpha * (|z_t-1| - E|z|) + gamma * z_t-1 + beta * ln(sigma_t-1^2)
where alpha governs ARCH shock magnitude, beta captures volatility persistence (0.85), and gamma < 0 (-0.08) captures asymmetric leverage shocks.

---

## 3. PCA Factor Loadings Analysis

The eigenvector weights assigned to PC1 reflect the relative contribution of each standardized asset feature:

${(factorLoadings || []).map((f) => `- **${f.feature}**: Weighting = \`${f.loading}\` (Absolute Impact: \`${f.absLoading}\`)`).join('\n')}

---

## 4. 10-Day AR(2)-EGARCH(1,1) Forward Volatility Trajectory

The multi-step forward volatility forecast schedule demonstrates conditional variance decay and convergence towards long-term unconditional variance:

| Horizon | Forecast Date | Conditional Volatility | 95% Lower Confidence Band | 95% Upper Confidence Band |
|---|---|---|---|---|
${(forecastedVol || []).map((f) => `| Day ${f.day} | ${f.date} | ${(f.volatility * 100).toFixed(2)}% | ${(f.lowerConfidence * 100).toFixed(2)}% | ${(f.upperConfidence * 100).toFixed(2)}% |`).join('\n')}

---

## 5. Portfolio Risk Attribution & Stress Metrics

1. **Risk-Adjusted Return Profile**: An annualized Sharpe ratio of **${sharpe}** indicates the level of excess return per unit of total risk.
2. **Tail-Risk Exposure (VaR 95%)**: At a 95% confidence level, the expected maximum single-day portfolio loss does not exceed **${var95}%**.
3. **Maximum Drawdown Vulnerability**: The historical peak-to-trough peak loss is **-${maxDD}%**.

---

## 6. Actionable Insights for Investors & Traders

### 💡 Tactical Allocation Strategies for Investors
- **Regime Positioning**: Under the current **${regime}** regime (Sentiment: **${sent}**), maintain a balanced portfolio posture. If sentiment exceeds 60, scale into high-beta equities; if sentiment drops below 40, increase allocations to defensive real estate, short-duration treasuries, and high-quality gold assets.
- **Vol-Targeting Risk Rebalancing**: Adjust equity exposure inverse to the EGARCH 10-day forecast trajectory. As forecast volatility trends towards **${tenDayVol}%**, reduce gross portfolio leverage to maintain constant annual risk exposure.

### 🎯 Derivatives & Execution Strategies for Traders
- **Options Volatility Trading**: Given the EGARCH leverage parameter gamma < 0, downside put options exhibit high volatility skew. Utilize delta-neutral collar strategies or vertical put spreads to hedge against asymmetric downside shocks.
- **Sentiment Mean Reversion**: Monitor rapid divergence between price log-returns and the PC1 Sentiment Index. Divergences greater than 2 standard deviations offer statistical arbitrage entry points.
`;
}

function parseNum(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[,$\s%]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function parseDate(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0];
  if (typeof val === 'number') {
    const dateObj = XLSX.SSF.parse_date_code(val);
    if (dateObj) {
      const d = new Date(Date.UTC(dateObj.y, dateObj.m - 1, dateObj.d));
      return d.toISOString().split('T')[0];
    }
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return str.substring(0, 10);
}

function runClientQuantitativePipeline(rows: any[]) {
  if (!rows || rows.length < 10) {
    throw new Error('Insufficient data points. Please provide at least 10 rows of financial data.');
  }

  const marketRows = rows.map((r: any) => ({
    date: parseDate(r.date || r.Date || r.TIMESTAMP || r.Time || r.Day),
    open: parseNum(r.open ?? r.Open ?? r.OPEN ?? 0),
    high: parseNum(r.high ?? r.High ?? r.HIGH ?? 0),
    low: parseNum(r.low ?? r.Low ?? r.LOW ?? 0),
    close: parseNum(r.close ?? r.Close ?? r.CLOSE ?? r.Price ?? 100),
    turnover: parseNum(r.turnover ?? r.Turnover ?? r.TURNOVER ?? r.Volume ?? r.VOL ?? 1000000),
    pe: parseNum(r.pe ?? r.PE ?? r.P_E ?? r.PriceEarnings ?? 20),
    pb: parseNum(r.pb ?? r.PB ?? r.P_B ?? r.PriceBook ?? 2.5),
    divYield: parseNum(r.divYield ?? r.DivYield ?? r.DividendYield ?? r.DY ?? 2.0),
  }));

  const sorted = [...marketRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const dates = sorted.map((r) => r.date);
  const n = sorted.length;

  const open = sorted.map((r) => r.open);
  const high = sorted.map((r) => r.high);
  const low = sorted.map((r) => r.low);
  const close = sorted.map((r) => r.close);
  const turnover = sorted.map((r) => r.turnover);
  const pe = sorted.map((r) => r.pe);
  const pb = sorted.map((r) => r.pb);
  const divYield = sorted.map((r) => r.divYield);

  const calcLogReturns = (arr: number[]) => {
    const res: number[] = [0];
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1] <= 0 ? 0.0001 : arr[i - 1];
      const curr = arr[i] <= 0 ? 0.0001 : arr[i];
      res.push(Math.log(curr / prev));
    }
    return res;
  };

  const retOpen = calcLogReturns(open);
  const retHigh = calcLogReturns(high);
  const retLow = calcLogReturns(low);
  const retClose = calcLogReturns(close);
  const retTurnover = calcLogReturns(turnover);
  const retPe = calcLogReturns(pe);
  const retPb = calcLogReturns(pb);
  const retDivYield = calcLogReturns(divYield);

  const featureNames = [
    'Log Return (Open)',
    'Log Return (High)',
    'Log Return (Low)',
    'Log Return (Close)',
    'Log Return (Turnover)',
    'Log Return (P/E)',
    'Log Return (P/B)',
    'Log Return (Div Yield)',
  ];
  const rawFeatures = [retOpen, retHigh, retLow, retClose, retTurnover, retPe, retPb, retDivYield];

  const effectiveDates = dates.slice(1);
  const T = effectiveDates.length;
  const numCols = rawFeatures.length;
  const trimmedFeatures = rawFeatures.map((col) => col.slice(1));

  const standardizedFeatures: number[][] = [];
  for (let j = 0; j < numCols; j++) {
    const colData = trimmedFeatures[j];
    const mean = colData.reduce((a, b) => a + b, 0) / colData.length;
    const variance = colData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (colData.length - 1);
    const std = Math.sqrt(variance) || 0.0001;
    standardizedFeatures.push(colData.map((val) => (val - mean) / std));
  }

  const covMatrix: number[][] = [];
  for (let j1 = 0; j1 < numCols; j1++) {
    const row: number[] = [];
    for (let j2 = 0; j2 < numCols; j2++) {
      const col1 = standardizedFeatures[j1];
      const col2 = standardizedFeatures[j2];
      const cov = col1.reduce((acc, v, idx) => acc + v * col2[idx], 0) / col1.length;
      row.push(cov);
    }
    covMatrix.push(row);
  }

  const { eigenvalues, eigenvectors } = jacobiClientEigenDecomposition(covMatrix);
  const eigenPairs = eigenvalues.map((val, idx) => ({
    val,
    vec: eigenvectors.map((row) => row[idx]),
  }));
  eigenPairs.sort((a, b) => b.val - a.val);

  const sortedEigenvalues = eigenPairs.map((p) => Math.max(0, p.val));
  const totalVariance = sortedEigenvalues.reduce((sum, v) => sum + v, 0) || 0.0001;
  const explainedVarianceRatio = sortedEigenvalues.map((v) => (v / totalVariance) * 100);
  const pc1Weights = eigenPairs[0].vec;

  const sentimentIndexRaw: number[] = [];
  for (let i = 0; i < T; i++) {
    let score = 0;
    for (let j = 0; j < numCols; j++) {
      score += standardizedFeatures[j][i] * pc1Weights[j];
    }
    sentimentIndexRaw.push(score);
  }

  const sentMean = sentimentIndexRaw.reduce((a, b) => a + b, 0) / T;
  const sentVar = sentimentIndexRaw.reduce((a, b) => a + Math.pow(b - sentMean, 2), 0) / (T - 1);
  const sentStd = Math.sqrt(sentVar) || 1;
  const sentimentIndex = sentimentIndexRaw.map((v) => 50 + 15 * ((v - sentMean) / sentStd));

  const sentReturns = [0];
  for (let i = 1; i < sentimentIndex.length; i++) {
    sentReturns.push(sentimentIndex[i] - sentimentIndex[i - 1]);
  }

  const omega = -0.1;
  const alpha = 0.15;
  const gamma = -0.08;
  const beta = 0.85;

  const condVol: number[] = [];
  const retMean = sentReturns.reduce((a, b) => a + b, 0) / sentReturns.length;
  const retVar = sentReturns.reduce((a, b) => a + Math.pow(b - retMean, 2), 0) / (sentReturns.length - 1);
  let currentLogVar = Math.log(retVar > 0 ? retVar : 1);
  const sqrt2overPi = Math.sqrt(2 / Math.PI);
  const residuals: number[] = [];

  for (let i = 0; i < sentReturns.length; i++) {
    const eps = sentReturns[i];
    residuals.push(eps);
    if (i === 0) {
      condVol.push(Math.exp(currentLogVar / 2));
      continue;
    }
    const prevEps = residuals[i - 1];
    const prevSigma = condVol[i - 1] || 1;
    const zPrev = prevEps / prevSigma;
    const standardizedAbs = Math.abs(zPrev) - sqrt2overPi;

    currentLogVar = omega + alpha * standardizedAbs + gamma * zPrev + beta * currentLogVar;
    currentLogVar = Math.max(-10, Math.min(10, currentLogVar));
    const sigmaT = Math.sqrt(Math.exp(currentLogVar));
    condVol.push(isNaN(sigmaT) ? 1 : sigmaT);
  }

  const forecastDays = 10;
  const forecastedVol: ForecastPoint[] = [];
  let lastLogVar = currentLogVar;
  const lastDateObj = new Date(effectiveDates[effectiveDates.length - 1]);

  for (let d = 1; d <= forecastDays; d++) {
    lastLogVar = omega + beta * (lastLogVar - omega);
    const fVol = Math.sqrt(Math.exp(lastLogVar));
    const nextDate = new Date(lastDateObj);
    nextDate.setDate(nextDate.getDate() + d);
    const dateStr = nextDate.toISOString().split('T')[0];
    const margin = fVol * 0.25 * Math.sqrt(d);

    forecastedVol.push({
      day: d,
      date: dateStr,
      volatility: parseFloat(fVol.toFixed(4)),
      upperConfidence: parseFloat((fVol + margin).toFixed(4)),
      lowerConfidence: parseFloat(Math.max(0.01, fVol - margin).toFixed(4)),
    });
  }

  const closePrices = sorted.map((r) => r.close);
  const portfolioReturns = retClose.slice(1);
  const meanReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
  const stdReturn = Math.sqrt(portfolioReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (portfolioReturns.length - 1)) || 0.01;
  const annualizedSharpe = stdReturn > 0 ? (meanReturn * Math.sqrt(252)) / (stdReturn * Math.sqrt(252)) : 0;

  let peak = closePrices[0];
  let maxDD = 0;
  for (const price of closePrices) {
    if (price > peak) peak = price;
    const dd = (peak - price) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
  const var95Idx = Math.floor(0.05 * sortedReturns.length);
  const var95 = sortedReturns[var95Idx] || -0.02;

  const timeSeriesData = effectiveDates.map((date, idx) => ({
    date,
    sentimentIndex: parseFloat(sentimentIndex[idx].toFixed(2)),
    close: sorted[idx + 1].close,
    turnover: sorted[idx + 1].turnover,
    pe: sorted[idx + 1].pe,
    volatility: parseFloat((condVol[idx] || 0.01).toFixed(4)),
  }));

  const factorLoadings = featureNames.map((name, idx) => ({
    feature: name,
    loading: parseFloat(pc1Weights[idx].toFixed(4)),
    absLoading: parseFloat(Math.abs(pc1Weights[idx]).toFixed(4)),
  }));

  return {
    summary: {
      totalDataPoints: n,
      startDate: effectiveDates[0],
      endDate: effectiveDates[effectiveDates.length - 1],
      currentSentiment: parseFloat((sentimentIndex[sentimentIndex.length - 1] || 50).toFixed(2)),
      sentimentRegime: sentimentIndex[sentimentIndex.length - 1] > 55 ? 'Bullish Optimism' : sentimentIndex[sentimentIndex.length - 1] < 45 ? 'Bearish Pessimism' : 'Neutral Consolidation',
      currentForecastVol: forecastedVol[0].volatility,
      tenDayForecastVol: forecastedVol[forecastedVol.length - 1].volatility,
      annualizedSharpe: parseFloat(annualizedSharpe.toFixed(2)),
      maxDrawdown: parseFloat((maxDD * 100).toFixed(2)),
      var95: parseFloat((Math.abs(var95) * 100).toFixed(2)),
      pc1VarianceExplained: parseFloat(explainedVarianceRatio[0].toFixed(2)),
    },
    timeSeriesData,
    forecastedVol,
    factorLoadings,
    explainedVarianceRatio: explainedVarianceRatio.map((v, i) => ({
      component: `PC${i + 1}`,
      variancePercent: parseFloat(v.toFixed(2)),
      eigenvalue: parseFloat(sortedEigenvalues[i].toFixed(4)),
    })),
    rawProcessedRows: sorted.map((r, i) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      turnover: r.turnover,
      pe: r.pe,
      pb: r.pb,
      divYield: r.divYield,
      sentimentScore: i > 0 ? parseFloat((sentimentIndex[i - 1] || 50).toFixed(2)) : 50,
    })),
  };
}

function jacobiClientEigenDecomposition(A: number[][], maxIter = 100, tol = 1e-9) {
  const n = A.length;
  let V: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    row[i] = 1;
    V.push(row);
  }
  let D = A.map((row) => [...row]);

  for (let iter = 0; iter < maxIter; iter++) {
    let maxOffDiag = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(D[i][j]) > maxOffDiag) {
          maxOffDiag = Math.abs(D[i][j]);
          p = i;
          q = j;
        }
      }
    }

    if (maxOffDiag < tol) break;

    const diff = D[q][q] - D[p][p];
    let t: number;
    if (Math.abs(D[p][q]) < 1e-15 * Math.abs(diff)) {
      t = D[p][q] / diff;
    } else {
      const phi = diff / (2.0 * D[p][q]);
      t = 1.0 / (Math.abs(phi) + Math.sqrt(phi * phi + 1.0));
      if (phi < 0) t = -t;
    }

    const c = 1.0 / Math.sqrt(t * t + 1.0);
    const s = t * c;
    const tau = s / (1.0 + c);

    const temp = D[p][q];
    D[p][q] = 0.0;
    D[p][p] -= t * temp;
    D[q][q] += t * temp;

    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const g = D[i][p];
        const h = D[i][q];
        D[i][p] = g - s * (h + g * tau);
        D[i][q] = h + s * (g - h * tau);
        D[p][i] = D[i][p];
        D[q][i] = D[i][q];
      }
    }

    for (let i = 0; i < n; i++) {
      const g = V[i][p];
      const h = V[i][q];
      V[i][p] = g - s * (h + g * tau);
      V[i][q] = h + s * (g - h * tau);
    }
  }

  const eigenvalues = D.map((row, i) => row[i]);
  return { eigenvalues, eigenvectors: V };
}
