<div align="center">

<img src="icons/icon128.png" alt="JSON Beauty icon" width="80" />

# JSON Beauty

**A Chrome extension to paste, format, and browse your JSON — right from the toolbar.**

![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest](https://img.shields.io/badge/Manifest-v3-7c6af7)
![License](https://img.shields.io/badge/License-GNU%20GPL-blue)

</div>

---

## Introduction

JSON Beauty is a minimal Chrome extension that turns raw JSON into a readable, collapsible tree — no tab-switching, no external tools, no internet required. Paste your payload, hit **Format**, and get a colour-coded viewer with full collapse/expand support. Every entry is saved locally so you can revisit past responses without re-pasting.

<table>
  <tr>
    <td><img src="images/Screenshot%202026-06-24%20232726.png" alt="JSON Beauty screenshot" /></td>
    <td><img src="images/day_screenshoot.png" alt="JSON Beauty day theme" /></td>
    <td><img src="images/night_screenShoot.png" alt="JSON Beauty night theme" /></td>
  </tr>
</table>

---

## Features

- ✦ **Instant formatting** — paste any valid JSON and render it as a collapsible tree in one click
- 🎨 **Colour-coded tokens** — keys, strings, numbers, booleans, and nulls each have a distinct colour
- 📂 **Persistent history** — up to 50 past entries stored locally via `chrome.storage.local`, survive browser restarts
- 🗂 **Auto-labelling** — entries are automatically titled from your JSON content (e.g. `Object {name, id, type}`) or you can set your own label
- ⎘ **One-click copy** — copies the pretty-printed JSON to your clipboard from the viewer
- 🗑 **History management** — delete individual entries on hover, or clear everything at once

---

## How to Install

> The extension is not on the Chrome Web Store. Install it manually in Developer mode.

**Steps:**

1. Download or clone this repository and unzip it
   ```bash
   git clone https://github.com/your-username/json-beauty.git
   ```

2. Open Chrome and navigate to the extensions page
   ```
   chrome://extensions
   ```

3. Enable **Developer mode** using the toggle in the top-right corner

4. Click **Load unpacked** and select the `json-beauty` folder

5. Pin the extension from the Chrome toolbar — look for the purple `{}` icon

---

## Usage

1. Click the **JSON Beauty** icon in the Chrome toolbar
2. *(Optional)* Type a label for the entry in the **Label** field
3. Paste your JSON into the text area
4. Click **Format →** to open the tree viewer
5. Click the **🕓** clock icon at any time to browse your history

---

## License

GNU GENERAL PUBLIC LICENSE © [Hihasan](https://hihasan.xyz/)