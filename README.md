<div align="center">
  <img src="icon.svg" width="100" height="100" alt="WTF Coursera book and check logo" />
  <h1>WTF Coursera</h1>
  <p><b>A focused course companion for Coursera progress and supported assessments.</b></p>

  [![Release](https://img.shields.io/badge/release-v1.1.5-38bdf8?style=flat-square)](https://github.com/chrollovale/WTF-Coursera/releases/latest)
  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![Browser](https://img.shields.io/badge/Chromium-Chrome%20%7C%20Edge%20%7C%20Brave-4285F4?style=flat-square)](https://github.com/chrollovale/WTF-Coursera)
  [![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

  <br />
  <a href="https://github.com/chrollovale/WTF-Coursera/releases/latest"><b>Download the latest extension</b></a>
</div>

---

WTF Coursera is a local browser extension with a compact dark interface, course progress controls, and an optional AI workspace. It works with your active Coursera session. If you use AI features, assessment prompts and relevant course context are sent to the provider you choose.

**Designed for:** Chrome, Edge, and Brave · **Manifest:** V3 · **Current release:** [v1.1.5](https://github.com/chrollovale/WTF-Coursera/releases/tag/v1.1.5)

## Features

- **Current lesson:** Request completion for an eligible video or reading.
- **Course progress:** Process readings or eligible course content in batches, with results based on Coursera's responses.
- **AI-assisted assessments:** Work on supported quizzes, exams, programming assignments, and other supported assessment types. The solver validates responses and avoids submitting an incomplete draft.
- **Provider choice:** Use NVIDIA NIM, OpenAI, Anthropic, or Google Gemini with your own API key.
- **Course modes:** Run the AI course workflow, focus on graded items, or process videos and readings.
- **Optional discussion replies:** Generated replies are not posted automatically unless you enable that option.
- **No analytics:** The extension does not send telemetry.

## What's new in 1.1.5

- Refreshed the whole popup with a sleek dark design and a book-and-check extension mark.
- Added support for multiple-choice fill-in-the-blanks assessments.
- Added stricter question and option matching; incomplete or invalid answers stop before submission.
- Removed placeholder URLs from file-upload handling. File-upload assessments now stop with a message so you can provide the file yourself.
- Improved progress confirmation and failure handling for Coursera API actions.
- Restricted Coursera requests to the secure Coursera origin, bounded locally stored course history, and removed page-script scraping for user IDs.

## Privacy and security

- Your AI key and preferences are stored in this browser's extension storage. The key is not encrypted like a password-vault secret; remove it from the popup when you no longer need it.
- Recent course progress and error logs for up to 20 courses are stored locally in extension storage.
- When AI runs, assessment prompts and relevant course context are sent to the selected provider. Review that provider's data-handling terms before use.
- The extension requests access to Coursera and the supported AI provider endpoints. It does not request access to unrelated websites.
- Progress actions affect your Coursera account. AI-generated answers may be submitted to Coursera when you run the solver; automatic discussion posting requires opt-in.
- File-upload assessments and peer-review workflows are not completed by the AI solver.

## Installation

1. Download the latest **WTF-Coursera** ZIP from [GitHub Releases](https://github.com/chrollovale/WTF-Coursera/releases/latest).
2. Extract the ZIP to a folder on your computer.
3. Open Chrome, Edge, or Brave and visit `chrome://extensions/` (use `edge://extensions/` in Edge).
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
6. Pin **WTF Coursera** to the browser toolbar.

## Usage

1. Sign in to Coursera and open a course page under `/learn/<course-slug>/`.
2. Open the extension panel and choose a progress action, or expand the AI workspace.
3. For AI features, select a provider and enter its API key.
4. Review the task and settings before starting. Use the single-lesson or current-assessment action first if you want to see how it behaves.

## Troubleshooting

- **The extension panel says no Coursera page was detected:** Open a Coursera course page on `www.coursera.org` and reopen the panel.
- **A progress action reports an error:** Confirm you are enrolled and signed in, then refresh the course page and retry.
- **An assessment was left unsubmitted:** Check whether it contains an unsupported question type or whether the selected AI provider returned an invalid or incomplete response.
- **The AI provider rejects a request:** Check the provider, API key, model name, and provider account limits.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

---

Built for educational research and personal time management. Use responsibly and follow your course and platform requirements.
