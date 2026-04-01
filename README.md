# Benner Terminal

A macOS menubar investment tool with real-time market news, a portfolio tracker, and an AI investment advisor powered by Claude.

## Features

- **News Tab** — Fetches the latest market and investing news via NewsAPI, sorted by publication date. Click any article to open it in your browser.
- **Portfolio Tab** — Add stock positions (ticker, shares, average cost), fetch live prices from Yahoo Finance, and track total value and P&L in real time.
- **AI Advisor Tab** — Chat with a Claude-powered investment advisor for analysis, strategy, and market insights. Maintains full conversation history within the session.

## Setup

1. Clone the repository and navigate into it:
   ```bash
   git clone <repo-url>
   cd benner-terminal
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env` and fill in your API keys:
   ```bash
   cp .env .env.local
   ```
   Edit `.env` (or create it if missing) with the following values:
   - `ANTHROPIC_API_KEY` — Get your key at [console.anthropic.com](https://console.anthropic.com)
   - `NEWS_API_KEY` — Get a free key at [newsapi.org](https://newsapi.org) (free tier supports 100 requests/day)

4. Run in development mode:
   ```bash
   npm start
   ```
   The app will appear as a menubar icon. Click the icon to open the terminal window.

5. Build a distributable `.dmg` (outputs to `dist/`):
   ```bash
   npm run build
   ```

## Notes

- **AI model**: The AI Advisor uses `claude-sonnet-4-6` via the Anthropic Messages API.
- **Stock prices**: Live quotes are fetched from Yahoo Finance (no API key required).
- **Unsigned build**: The macOS build is unsigned. On first launch, macOS will display a security warning. To bypass it, right-click the app in Finder and select **Open**, then confirm in the dialog.
- **Portfolio storage**: Portfolio data is stored locally in Electron's `userData` directory (`~/Library/Application Support/Benner Terminal/portfolio.json`).
