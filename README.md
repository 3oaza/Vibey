# ✨ Vibey — The Ultimate Artist Canvas & Mood Board Tool

Vibey is a powerful browser extension designed for artists, designers, and creators to seamlessly collect inspiration from the web and organize ideas on a dynamic, high-performance canvas.

![Vibey Banner](assets/icons/logo-icon128.png)

## 🚀 Overview
Whether you're building a character reference sheet, a design mood board, or just organizing visual research, Vibey provides a professional-grade interface directly in your browser. It transforms the way you collect and interact with visual data across the web.

## 🌟 Key Features

### 🎨 Creative Canvas
- **Infinite Interaction**: Fluid zoom (up to 400%) and pan navigation.
- **Drag & Drop**: Collect images from any website and drop them directly into your workspace.
- **Smart Queue**: Gather images into a temporary queue before placing them on the board.

### 🖌️ Design Tools
- **Drawing Engine**: Sketch, annotate, and mark up your board with a customizable brush tool.
- **Text Engine**: Add titles, notes, and labels with full control over typography, size, and color.
- **Layer System**: Manage complex boards with a professional layer panel, supporting reordering (Bring to Front/Send to Back) and visibility toggles.

### 📤 Professional Exporting
Export your creations in multiple formats tailored for every platform:
- **Static**: Crystal clear PNG, JPEG, and WebP (High-Res).
- **Animated**: High-quality GIF and Pro-quality 4K MP4 (optimized for Behance and Pinterest).
- **Match View**: Choose to export the entire board or exactly what you see in the viewport.

### ⚡ Workflow Efficiency
- **Command Palette**: A fast, keyboard-centric interface to trigger any tool or action (`Ctrl+K` inspired).
- **Project Persistence**: Save your entire board state as a JSON file and reload it anytime.
- **Preview Mode**: A distraction-free mode for presenting your mood boards.

## 🛠️ Technology Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas API, CSS3 (Glassmorphism UI).
- **Engine**: 
  - `CCapture.js` for frame-perfect animation recording.
  - `gif.js` & `gifenc.js` for high-performance GIF encoding.
  - `gifshot.js` for fast previews.
- **Extension**: manifest V3 (Chrome, Edge, Brave supported).

## 📂 Project Structure
```text
Vibey_organized/
â”œâ”€â”€ assets/          # Brand assets, icons, and logo
â”œâ”€â”€ popup/           # Extension UI (Canvas, Popup, Styles)
â”œâ”€â”€ src/             # Core logic (Background, Canvas engine)
â”œâ”€â”€ vendor/          # Third-party libraries (CCapture, etc.)
â”œâ”€â”€ manifest.json    # Extension configuration
â””â”€â”€ LICENSE          # Project license
```

## 📦 Installation
### For Users
1. Download the latest release from the [Releases](https://github.com/Fragment/Vibey/releases) page.
2. Go to `chrome://extensions/` in your browser.
3. Enable **Developer Mode** (top right).
4. Click **Load Unpacked** and select the extracted folder.

### For Developers
1. Clone the repo: `git clone https://github.com/Fragment/Vibey.git`
2. Make your changes in `src/` or `popup/`.
3. Refresh the extension in `chrome://extensions/` to see changes.

## 🤝 Contributing
Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---
Created with â€ڈ by **Fragment**
