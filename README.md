# TRMNL Web

A web application that displays your TRMNL device screen in your browser. This is a web-based alternative to the [TRMNL Chrome Extension](https://github.com/usetrmnl/trmnl-chrome).

## Features

- **Display TRMNL Screen**: View your TRMNL device display directly in your browser
- **Auto Refresh**: Automatically fetches new images at the interval set by your device (default: 30 seconds)
- **Countdown Timer**: Shows time until next refresh
- **Manual Refresh**: Force refresh the display at any time
- **Multi-Device Support**: Switch between multiple TRMNL devices (if you have more than one)
- **Persistent Storage**: Your settings and cached image are stored in localStorage
- **Dark/Light Mode**: E-ink display filters adapt to your system preference

## Getting Started

### Prerequisites

- A TRMNL account with either a physical device or a [BYOD (Bring Your Own Device)](https://shop.usetrmnl.com/products/byod) license
- Bun installed

### Installation

1. Clone this repository:

   ```bash
   git clone <your-repo-url>
   cd trmnl-web
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Start the development server:

   ```bash
   bun run dev
   ```

4. Open http://localhost:5173 in your browser

### Setup

1. **Get Your API Key**:

   - Log in to [usetrmnl.com](https://usetrmnl.com)
   - Go to your Dashboard → Device Settings
   - Copy your device's API key

2. **Enter the API Key**:

   - Paste your API key in the input field on the welcome screen
   - Click "Connect"

3. **View Your Display**:
   - Your TRMNL device screen will load
   - The display auto-refreshes based on your device settings

## How It Works

This web app replicates the functionality of the TRMNL Chrome Extension:

1. **API Communication**: Fetches device images from the TRMNL API (`/api/current_screen`) using your device's API key
2. **Image Caching**: Converts images to base64 data URLs and stores them in localStorage for instant loading
3. **Smart Refresh**: Compares image URLs to skip re-downloading unchanged images
4. **Error Handling**: Implements exponential backoff for rate limiting and network errors

### API Endpoints Used

| Endpoint                                  | Purpose                                    |
| ----------------------------------------- | ------------------------------------------ |
| `https://usetrmnl.com/api/current_screen` | Fetches the current screen image metadata  |
| `https://usetrmnl.com/devices.json`       | Fetches device list (requires cookie auth) |
| `https://usetrmnl.com/login`              | Authentication page                        |

## Development

### Available Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run lint` - Run ESLint

### Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **localStorage** - State persistence
