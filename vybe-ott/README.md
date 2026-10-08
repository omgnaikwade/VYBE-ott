# VYBE OTT — LG webOS TV App

A Netflix-style movie and series streaming application crafted for **LG webOS TV (webOS 4.0+ / Chromium 52)**, fully navigable with LG Magic Remote D-pad and Pointer, backed by your Cloudflare Worker.

---

## 1. Quick Setup (Before Installing)

1. Open `js/config.js` and set:
   ```javascript
   API_BASE_URL: "https://your-worker-subdomain.workers.dev"
   ```
2. Make sure your Cloudflare Worker has the TMDB passthrough and stream routes enabled (see `worker_tmdb_patch.js` included in repository root).

---

## 2. Phone-Only Installation (No PC Required!)

You do not need a computer to build or install VYBE OTT on your LG Smart TV.

### Method A: Automatic Build via GitHub Actions (Recommended)
1. Fork or push this repository to your GitHub account.
2. The GitHub Action in `.github/workflows/build-ipk.yml` automatically triggers on push.
3. Once finished (~1 min), go to the **Actions** tab on GitHub in your phone's browser.
4. Download the **`vybe-ott-webos-package`** zip artifact. It contains `com.vybe.ott_1.0.0_all.ipk`.
5. On your LG TV:
   - Install and open the official **Developer Mode** app from the LG Content Store.
   - Log in with your LG account, toggle **Dev Mode Status: ON**, and toggle **Key Server: ON**.
   - Note the TV's IP address and Passphrase displayed on screen.
6. Install to TV using an Android Phone:
   - **Option 1 (Web / Android Dev Manager):** Use an open-source webOS installer on your phone (such as webOS Dev Manager or Device Manager web tool) connecting to your TV's IP and Passphrase, and upload the `.ipk`.
   - **Option 2 (Termux on Android):**
     ```bash
     pkg update && pkg install nodejs openssh
     npm install -g @webos-tools/cli
     # Add your TV device (follow prompts for IP and Port 9922)
     ares-setup-device
     # Get the dev key from TV
     ares-novacom --device <device-name> --getkey
     # Install the IPK directly to TV
     ares-install --device <device-name> com.vybe.ott_1.0.0_all.ipk
     ```

### Method B: Build Locally via Termux (Android)
If you have Termux installed on your Android device:
```bash
pkg install nodejs git
npm install -g @webos-tools/cli
git clone <your-repo>
cd vybe-ott
ares-package ./ -o ./dist
```
This generates the `.ipk` in `dist/`.

---

## 3. Remote Control Cheat Sheet

| Button / Key | Function |
| :--- | :--- |
| **D-Pad (Up / Down / Left / Right)** | Move focus between cards, buttons, shelves, and player sliders |
| **Enter / OK** | Activate card, toggle Play/Pause in player |
| **Back (461 / Backspace / Esc)** | Close drawer panel &rarr; Exit player &rarr; Pop back screen &rarr; Exit confirm prompt |
| **Down (during video playback)** | Open Player Settings Drawer (Source, Language, Quality, Subtitles) |
| **Up (during video playback)** | Show video controls overlay |
| **Left / Right (during playback)** | Fast seek &plusmn;10 seconds |
| **Play (415) / Pause (19)** | Dedicated playback toggle |
| **FF (417) / RW (412)** | Fast skip &plusmn;30 seconds |
| **Press "0" 5 Times** | Toggle on-screen Diagnostics & Timings HUD (Worker latency, active stream info) |
| **Magic Remote Pointer** | Hover over any card/button to focus, click to open |
| **Magic Remote Microphone** | Speak directly into Search input field for voice search |

---

## 4. Key Architecture & Features

- **webOS 4.0 (Chromium 53) Compatibility:** Vanilla JavaScript (ES5/ES2015 Promises). Zero build step needed for TV execution.
- **Provider Isolation:** Providers are never mixed. Hierarchy is `Provider -> Language -> Quality -> Mirrors`.
- **Parallel Source Checking:** Details screen queries providers in parallel with 12s timeouts. Play activates on the very first available stream.
- **Cost-Conscious Proxying:** Automatically tries direct streams first; routes through `/api/proxy` only if custom headers (`Referer`, `Origin`) are needed or if direct playback encounters a CORS/CDN stall.
- **Resilient Failover:** Auto-fails over across CDN mirrors &rarr; proxy retry &rarr; lower bitrate &rarr; next provider.
- **Custom Subtitle Renderer:** WebVTT/SRT parsed and rendered through an inline styled TV overlay with S/M/L scaling.
- **Progress Memory:** Remembers playback position per movie and series episode, with automatic Resume prompts.
