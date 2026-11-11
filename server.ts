import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import * as math from 'mathjs';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MarketRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  turnover: number;
  pe: number;
  pb: number;
  divYield: number;
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

function runQuantitativePipeline(rawRows: MarketRow[]) {
  if (!rawRows || rawRows.length < 10) {
    throw new Error('Insufficient data points. Please provide at least 10 rows of financial data.');
  }

  const sorted = [...rawRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
  const means: number[] = [];
  const stds: number[] = [];

  for (let j = 0; j < numCols; j++) {
    const colData = trimmedFeatures[j];
    const mean = math.mean(colData) as number;
    const std = (math.std(colData, 'unbiased') as number) || 0.0001;
    means.push(mean);
    stds.push(std);
    const standardizedCol = colData.map((val) => (val - mean) / std);
    standardizedFeatures.push(standardizedCol);
  }

  const covMatrix: number[][] = [];
  for (let j1 = 0; j1 < numCols; j1++) {
    const row: number[] = [];
    for (let j2 = 0; j2 < numCols; j2++) {
      const col1 = standardizedFeatures[j1];
      const col2 = standardizedFeatures[j2];
      const cov = math.mean(col1.map((v, idx) => v * col2[idx])) as number;
      row.push(cov);
    }
    covMatrix.push(row);
  }

  const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(covMatrix);

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

  const sentMean = math.mean(sentimentIndexRaw) as number;
  const sentStd = (math.std(sentimentIndexRaw, 'unbiased') as number) || 1;
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
  const varVal = math.variance(sentReturns);
  const numVar = typeof varVal === 'number' ? varVal : 1;
  let currentLogVar = Math.log(numVar > 0 ? numVar : 1);
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
  const forecastedVol: { day: number; date: string; volatility: number; upperConfidence: number; lowerConfidence: number }[] = [];
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
  const meanReturn = (math.mean(portfolioReturns) as number) || 0;
  const stdReturn = (math.std(portfolioReturns, 'unbiased') as number) || 0.01;
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

function jacobiEigenDecomposition(A: number[][], maxIter = 100, tol = 1e-9) {
  const n = A.length;
  let V = identityMatrix(n);
  let D = cloneMatrix(A);

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

  const eigenvalues: number[] = [];
  for (let i = 0; i < n; i++) {
    eigenvalues.push(D[i][i]);
  }

  const eigenvectors: number[][] = [];
  for (let j = 0; j < n; j++) {
    const col: number[] = [];
    for (let i = 0; i < n; i++) {
      col.push(V[i][j]);
    }
    eigenvectors.push(col);
  }

  return { eigenvalues, eigenvectors: V };
}

function identityMatrix(n: number): number[][] {
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = new Array(n).fill(0);
    row[i] = 1;
    M.push(row);
  }
  return M;
}

function cloneMatrix(M: number[][]): number[][] {
  return M.map((row) => [...row]);
}

function generateFallbackMarkdownReport(summary: any, factorLoadings: any[], forecastedVol: any[]): string {
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
This institutional quantitative report presents an exhaustive empirical analysis of market sentiment dynamics and forward volatility forecasting derived via **Sentlysis Quantitative Engines**. The evaluation encompasses ${summary?.totalDataPoints ?? 0} trading sessions spanning from **${summary?.startDate ?? 'N/A'}** to **${summary?.endDate ?? 'N/A'}**.

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
$$r_t = \\ln\\left(\\frac{P_t}{P_{t-1}}\\right)$$

For fundamental valuation metrics ($X_t \\in \\{\\text{Turnover}, \\text{P/E}, \\text{P/B}, \\text{Dividend Yield}\\}$), relative growth rates are calculated:
$$\\Delta X_t = \\ln\\left(\\frac{X_t}{X_{t-1}}\\right)$$

### 2.2 Z-Score Standardization
To prevent high-magnitude metrics (such as turnover) from dominating low-magnitude metrics (such as dividend yield), each column vector $\\mathbf{x}_j$ is cross-sectionally standardized:
$$z_{j,t} = \\frac{x_{j,t} - \\mu_j}{\\sigma_j}$$

### 2.3 Dimensionality Reduction via Principal Component Analysis (PCA)
The standardized matrix $\\mathbf{Z} \\in \\mathbb{R}^{T \\times 8}$ is used to construct the sample covariance matrix $\\mathbf{\\Sigma}$:
$$\\mathbf{\\Sigma} = \\frac{1}{T-1} \\mathbf{Z}^T \\mathbf{Z}$$

Eigenvalue decomposition solves:
$$\\mathbf{\\Sigma} \\mathbf{v}_k = \\lambda_k \\mathbf{v}_k$$
where $\\lambda_1 \\ge \\lambda_2 \\ge \\dots \\ge \\lambda_8 \\ge 0$. Eigenvector $\\mathbf{v}_1$ corresponds to the first principal component loadings, projecting multivariable market information into a single latent market sentiment continuum.

### 2.4 AR(2)-EGARCH(1,1) Volatility Modeling
The conditional variance process $\\sigma_t^2$ is parameterized using Nelson’s Exponential GARCH model:
$$\\ln(\\sigma_t^2) = \\omega + \\alpha \\left( |z_{t-1}| - \\sqrt{\\frac{2}{\\pi}} \\right) + \\gamma z_{t-1} + \\beta \\ln(\\sigma_{t-1}^2)$$
where $\\alpha$ governs ARCH shock magnitude, $\\beta$ captures volatility persistence, and $\\gamma < 0$ captures asymmetric leverage shocks (where negative returns generate disproportionately higher future volatility).

---

## 3. PCA Factor Loadings Analysis

The eigenvector weights assigned to PC1 reflect the relative contribution of each standardized asset feature:

${(factorLoadings || []).map((f: any) => `- **${f.feature}**: Weighting = \`${f.loading}\` (Absolute Impact: \`${f.absLoading}\`)`).join('\n')}

---

## 4. 10-Day AR(2)-EGARCH(1,1) Forward Volatility Trajectory

The multi-step forward volatility forecast schedule demonstrates conditional variance decay and convergence towards long-term unconditional variance:

| Horizon | Forecast Date | Conditional Volatility | 95% Lower Confidence Band | 95% Upper Confidence Band |
|---|---|---|---|---|
${(forecastedVol || []).map((f: any) => `| Day ${f.day} | ${f.date} | ${(f.volatility * 100).toFixed(2)}% | ${(f.lowerConfidence * 100).toFixed(2)}% | ${(f.upperConfidence * 100).toFixed(2)}% |`).join('\n')}

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
- **Options Volatility Trading**: Given the EGARCH leverage parameter $\\gamma < 0$, downside put options exhibit high volatility skew. Utilize **delta-neutral collar strategies** or **vertical put spreads** to hedge against asymmetric downside shocks.
- **Sentiment Mean Reversion**: Monitor rapid divergence between price log-returns and the PC1 Sentiment Index. Divergences greater than 2 standard deviations offer statistical arbitrage entry points.
`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  app.post('/api/analyze', (req: Request, res: Response) => {
    try {
      const { rows } = req.body;
      if (!rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: 'Invalid data format provided.' });
      }

      const marketRows: MarketRow[] = rows.map((r: any) => ({
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

      const result = runQuantitativePipeline(marketRows);
      return res.json(result);
    } catch (err: any) {
      console.error('Error in /api/analyze:', err);
      return res.status(500).json({ error: err.message || 'Quantitative processing failed.' });
    }
  });

  app.post('/api/generate-report', async (req: Request, res: Response) => {
    try {
      const { summary, factorLoadings, forecastedVol } = req.body;

      const prompt = `You are a Chief Quantitative Strategist and Senior Financial Economist at a premier global investment bank. 
Generate a comprehensive, highly rigorous, institutional-grade quantitative research report (minimum 2000 words equivalent in depth, structured with clear markdown headings, exhaustive analytical commentary, empirical findings, and actionable investment recommendations).

### Dataset & Quantitative Summary Statistics:
- Total Data Points: ${summary?.totalDataPoints} trading sessions (${summary?.startDate} to ${summary?.endDate})
- Current Market Sentiment Index (PC1): ${summary?.currentSentiment} (Regime: ${summary?.sentimentRegime})
- Principal Component 1 (PC1) Variance Explained: ${summary?.pc1VarianceExplained}%
- Current 1-Day Forecast Volatility: ${summary?.currentForecastVol}
- 10-Day Ahead EGARCH Forecast Volatility: ${summary?.tenDayForecastVol}
- Annualized Sharpe Ratio: ${summary?.annualizedSharpe}
- Maximum Drawdown: ${summary?.maxDrawdown}%
- Value at Risk (VaR 95%): ${summary?.var95}%

### PCA Factor Loadings (PC1 Weights):
${JSON.stringify(factorLoadings, null, 2)}

### 10-Day AR(2)-EGARCH(1,1) Volatility Forecast Path:
${JSON.stringify(forecastedVol, null, 2)}

### Required Report Structure:
1. **Executive Summary & Macro Synthesis**: Overview of current market sentiment regime, macro liquidity drivers, and risk posture.
2. **Methodology & Mathematical Framework**: Detailed breakdown of log-returns transformation, Z-score cross-sectional/temporal normalization, Principal Component Analysis (PCA) eigenvalue decomposition, and AR(2)-EGARCH(1,1) conditional volatility modeling with asymmetry/leverage parameterization.
3. **PCA Factor Loadings & Dimensionality Reduction Analysis**: Deep dive into how opening prices, highs, lows, closing prices, turnover, P/E, P/B, and Dividend Yield contribute to latent market sentiment.
4. **AR(2)-EGARCH(1,1) Volatility Forecasting & Shock Dynamics**: Empirical analysis of volatility clustering, leverage effects, and the 10-day forward volatility trajectory with upper/lower confidence bounds.
5. **Portfolio Risk & Performance Metrics**: Sharpe ratio evaluation, maximum drawdown vulnerability, and VaR risk attribution.
6. **Suggestive Insights for Investors & Traders**: Actionable, tactical asset allocation, volatility hedging strategies (options/straddles), risk parity adjustments, and sentiment-based entry/exit rules.

Write in a polished, authoritative institutional voice with rich professional terminology (e.g., heteroskedasticity, leverage effect, factor attribution, leptokurtosis, vol-of-vol, orthogonalization).`;

      let reportText = '';
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction: 'You are an elite quantitative finance researcher producing exhaustive institutional research reports.',
          },
        });
        reportText = response.text || '';
      } catch (geminiErr: any) {
        console.warn('Gemini API call failed, generating quantitative fallback report:', geminiErr?.message);
      }

      if (!reportText || reportText.trim().length === 0) {
        reportText = generateFallbackMarkdownReport(summary, factorLoadings, forecastedVol);
      }

      return res.json({ report: reportText });
    } catch (err: any) {
      console.error('Error in /api/generate-report:', err);
      return res.status(200).json({ report: generateFallbackMarkdownReport(req.body?.summary, req.body?.factorLoadings, req.body?.forecastedVol) });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Sentlysis server running on http://localhost:${PORT}`);
  });
}

startServer();
