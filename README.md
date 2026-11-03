<div align="center">
  <img src="icon.png" width="100" height="100" alt="WTF Coursera Icon" />
  <h1>WTF Coursera</h1>
  <p><b>Automate Coursera course progress, fast-forward lessons, and solve quizzes with AI</b></p>

  [![Release](https://img.shields.io/github/v/release/chrollovale/WTF-Coursera?style=flat-square&color=38bdf8)](https://github.com/chrollovale/WTF-Coursera/releases/latest)
  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![Browser](https://img.shields.io/badge/Chromium-Chrome%20%7C%20Edge%20%7C%20Brave-4285F4?style=flat-square)](https://github.com/chrollovale/WTF-Coursera)
  [![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

  <br />
  <a href="https://github.com/chrollovale/WTF-Coursera/releases/latest"><b>📥 Download WTF-Coursera Extension (.zip)</b></a>
</div>

---

A compact, open-source browser extension for managing Coursera course progress. It uses Coursera APIs to update eligible lesson progress without leaving videos running in background tabs.

<p align="center">
  <img src="./Preview1.png" alt="WTF Coursera Preview" width="80%" />
</p>

---

## Features

- **Complete Current Lesson:** Instantly marks the active video or reading as completed.
- **Complete Readings Only:** Sweeps the course syllabus and bulk-completes all reading materials in the background.
- **Complete Entire Course:** Batches and completes all remaining video lectures and readings in the active course.
- **AI Quiz Solver:** Solves current quizzes, exams, and assignments, with retry attempts toward a configurable target grade.
- **Provider/API Integration:** Supports NVIDIA NIM, OpenAI, Anthropic, and Google Gemini. API keys and solver preferences are stored in this browser's extension storage.
- **Course Solver Modes:** Run the full course, graded items only, or fast-forward videos/readings only. The AI course solver can also process supported quiz and discussion items.
- **No telemetry:** The extension does not send analytics. When AI features are used, course questions and related context are sent to the selected AI provider.

## Privacy and security

- Your AI key is stored in Chrome extension storage on this browser. It is not encrypted as a password vault would be; remove it from the popup when you no longer need it.
- Recent course progress and error logs for up to 20 courses are also stored in extension storage on this browser.
- AI requests send assessment prompts and relevant course context to the provider you selected. Review that provider's data handling terms before use.
- The extension requests access to Coursera and the supported AI provider endpoints. It does not need access to unrelated websites.
- AI-generated discussion replies are not posted automatically by default. Enabling **Post AI discussion replies automatically** allows generated text to be submitted under your Coursera account.
- Course progress actions affect your Coursera account. Use the single-lesson action first if you are unsure what a bulk action will change.

<p align="center">
  <img src="./Preview2.png" alt="Quiz Solver Preview" width="80%" />
</p>

---

## Installation

1. Download **[WTF-Coursera.zip](https://github.com/chrollovale/WTF-Coursera/releases/latest)**.
2. Open Chrome (or Edge / Brave) and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Pin **WTF Coursera** to your extension toolbar.

---

## Usage

1. Log into Coursera and ensure you are **enrolled** in the target course.
2. Open any lesson page (e.g., `/learn/<course-slug>/lecture/...`).
3. Click the extension icon and select your desired action.
4. For quiz solving, choose an AI provider and enter its API key, then use **Solve Current Quiz** or **Run AI Full Course**.

<p align="center">
  <img src="./Preview3.png" alt="AI Solver Settings" width="80%" />
</p>

---

## Disclaimer

Built for educational research and personal time management. Use responsibly and at your own risk.

---

### ⭐ Support the Project
If this tool saved you hours or helped complete your coursework, please consider giving it a **Star** on GitHub!
