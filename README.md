# WTF Coursera

[![Release](https://img.shields.io/github/v/release/chrollovale/WTF-Coursera?style=flat-square&color=38bdf8)](https://github.com/chrollovale/WTF-Coursera/releases/latest)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Browser](https://img.shields.io/badge/Chromium-Chrome%20%7C%20Edge%20%7C%20Brave-4285F4?style=flat-square)](https://github.com/chrollovale/WTF-Coursera)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

<a href="https://github.com/chrollovale/WTF-Coursera/releases/latest"><b>📥 Download WTF-Coursera Extension (.zip)</b></a>

> Built by Aniket — "Fuck these credit courses."

A clean, open-source browser extension that automates Coursera progress by directly interacting with native APIs. Mark videos and readings complete instantly without leaving content playing in background tabs.

 ![Image Alt](./Preview1.png)

---

## Features

* **Complete Current Lesson:** Instantly marks the active video or reading as completed.
* **Complete Readings Only:** Sweeps the course syllabus and bulk-completes all reading materials in the background.
* **Complete Entire Course:** Batches and completes all remaining video lectures and readings in the active course.
* **AI Quiz Solver:** Solves current quizzes, exams, and assignments, with retry attempts toward a configurable target grade.
* **Provider/API Integration:** Supports NVIDIA NIM, OpenAI, Anthropic, and Google Gemini. API keys can be stacked with commas for fallback; keys and solver preferences are stored in local extension storage.
* **Course Solver Modes:** Run the full course, graded items only, or fast-forward videos/readings only. The AI course solver can also process supported quiz and discussion items.
* **Clean and Private:** 100% client-side logic. No tracking, telemetry, or remote servers.
  ![Image Alt](./Preview2.png)

---

## Installation

1. Download or clone this repository to your computer.
2. Open Chrome (or Edge / Brave) and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Pin **WTF Coursera** to your extension toolbar.

---

## Usage

1. Log into Coursera and ensure you are **enrolled** in the target course.
2. Open any lesson page (e.g., `/learn/<course-slug>/lecture/...`).
3. Click the extension icon and select your desired action.
4. For quiz solving, choose an AI provider and enter its API key, then use **Solve Current Quiz** or **Run AI Full Course**. Leave Model blank to use the provider's default model.

  ![Image Alt](https://github.com/chrollovale/wtf-coursera/blob/3d995f300a8a492382a7e06db1cfee57dd38c9c2/Preview3.png)
  
---

## Disclaimer

Built for educational research and personal time management. Use responsibly and at your own risk.

---

### ⭐ Support the Project
If this tool saved you hours or helped complete your coursework, please consider giving it a **Star** on GitHub!
