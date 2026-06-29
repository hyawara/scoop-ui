# Scoop UI

A modern GUI for the [Scoop](https://scoop.sh) package manager on Windows, built with Electron and Vue 3.

## Tech Stack

- **Frontend**: Vue 3 (Composition API) + TypeScript + Tailwind CSS + Naive UI + Pinia
- **Backend**: Electron Main Process + PowerShell (child_process.spawn)
- **Design**: Windows 11 Mica / Acrylic + Bento Box Layout

## Features

- Environment detection & one-click Scoop installation
- Search, install, uninstall, and update packages
- Real-time progress tracking with progress bars
- Cache management with visual dashboard
- Proxy configuration (HTTP / SOCKS5)
- Scoop directory migration
- Windows 11 Mica blur effect & Fluent Design
- Dark / Light theme support

## Development

```bash
# Install dependencies
npm install

# Run frontend dev server
npm run dev

# Build and run in Electron
npm run electron:dev

# Build for production
npm run electron:build
```

## Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # Window creation, Mica config
│   ├── ipc/
│   │   └── scoop.ts   # Scoop IPC handlers
│   └── utils/
│       └── powershell.ts  # PowerShell execution wrapper
├── preload/
│   └── index.ts       # contextBridge API
└── renderer/
    ├── index.html
    └── src/
        ├── App.vue
        ├── main.ts
        ├── components/
        │   ├── Header.vue
        │   ├── Dashboard.vue
        │   ├── SearchPanel.vue
        │   ├── AppDetail.vue
        │   ├── Onboarding.vue
        │   ├── CacheCard.vue
        │   ├── StorageCard.vue
        │   └── ProxyCard.vue
        ├── stores/
        │   ├── app.ts
        │   ├── packages.ts
        │   └── settings.ts
        ├── types/
        │   └── index.ts
        └── assets/
            └── main.css
```

## License

MIT
