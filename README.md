# Sentlysis: A Comprehensive Application for Market Sentiment and Volatility Analysis

**Sentlysis** is an institutional-grade quantitative finance application designed to construct a real-time **Market Sentiment Index** using **Principal Component Analysis (PCA)** from raw equity time-series data and forecast **10-day ahead conditional market volatility** using an **AR(2)-EGARCH(1,1)** stochastic process. It also leverages **Google Gemini AI** to generate 2,000+ word deep-dive quantitative research reports.

---

## 🌟 Key Features

- **Multi-Factor Input Pipeline**: Accepts raw financial time series (Excel `.xlsx` / `.xls` or CSV) containing:
  - `Date`, `Open`, `High`, `Low`, `Close`, `Turnover`, `P/E`, `P/B`, and `Dividend Yield`.
- **Pre-Processing & Normalization**:
  - Log-Returns Transformation: $r_t = \ln(P_t / P_{t-1})$
  - Z-score Standardization: $z = \frac{x - \mu}{\sigma}$
- **PCA Market Sentiment Index**:
  - Eigenvalue decomposition of cross-sectional covariance matrix.
  - Principal Component 1 (PC1) factor loading projection onto a normalized 0–100 sentiment score.
- **AR(2)-EGARCH(1,1) Volatility Forecasting**:
  - Models volatility clustering, persistence ($\beta = 0.85$), and asymmetric leverage effects ($\gamma = -0.08$).
  - Outputs a 10-day forward conditional volatility path with 95% upper and lower confidence intervals.
- **Interactive Dashboard**:
  - Built with React, TypeScript, Tailwind CSS, and Recharts.
  - Real-time time series charts, PCA Scree plots, factor weightings, and risk metrics (Sharpe ratio, VaR 95%, Max Drawdown).
- **Gemini AI Institutional Research Reports**:
  - Automated 2,000+ word quantitative report synthesis powered by `@google/genai` (`gemini-3.8-flash`).
  - One-click Markdown report export.

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/sentlysis.git
cd sentlysis

# Install dependencies
npm install

# Set environment variables (.env)
GEMINI_API_KEY="your_google_gemini_api_key"

# Run development server (Vite + Express server)
npm run dev
```

App will run locally at `http://localhost:3000`.

---

## 📐 Mathematical Architecture

### 1. Log Returns & Z-score Standardization
$$\text{Log Return } r_{i,t} = \ln\left(\frac{P_{i,t}}{P_{i,t-1}}\right)$$
$$z_{i,t} = \frac{r_{i,t} - \mu_i}{\sigma_i}$$

### 2. PCA Eigenvalue Decomposition
$$\mathbf{\Sigma} = \frac{1}{T-1} \mathbf{Z}^T \mathbf{Z}$$
$$\mathbf{\Sigma} \mathbf{v}_k = \lambda_k \mathbf{v}_k$$
$$\text{Sentiment Index } S_t = 50 + 15 \cdot \left( \frac{\mathbf{Z}_t \cdot \mathbf{v}_1 - \mu_{\text{PC1}}}{\sigma_{\text{PC1}}} \right)$$

### 3. AR(2)-EGARCH(1,1) Variance Dynamics
$$\ln(\sigma_t^2) = \omega + \alpha \left(|z_{t-1}| - \sqrt{\frac{2}{\pi}}\right) + \gamma z_{t-1} + \beta \ln(\sigma_{t-1}^2)$$

---

## 🛠️ Built With

- **Frontend**: React 19, Vite, Tailwind CSS v4, Recharts, Lucide Icons, Math.js, SheetJS (XLSX), PapaParse.
- **Backend**: Node.js, Express, TSX, Google GenAI SDK (`@google/genai`).
- **AI Model**: `gemini-3.8-flash`

---

## 📄 License
Apache-2.0 License
