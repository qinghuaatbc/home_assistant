# Home Assistant (NestJS)

A reimplementation of Home Assistant in NestJS + TypeScript, with a React frontend.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [FFmpeg](https://ffmpeg.org/) (for camera streaming)
- npm v9+

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/qinghuaatbc/home_assistant.git
cd home_assistant
```

### 2. Install backend dependencies

```bash
npm install
```

### 3. Install frontend dependencies

```bash
npm run frontend:install
# or: cd frontend && npm install
```

## Running

### Development (hot reload)

Run backend and frontend separately:

```bash
# Terminal 1 — NestJS backend (http://localhost:8123)
npm run start:dev

# Terminal 2 — Vite dev server (http://localhost:5173)
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

### Production (single port)

Build the frontend into `public/`, then serve everything from the backend:

```bash
cd frontend && npm run build
cd ..
npm start
```

Open **http://localhost:8123** in your browser.

## Default credentials

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

## Configuration

Edit [`config/configuration.yaml`](config/configuration.yaml) to configure integrations, cameras, MQTT, and other settings.

## API

- **REST API** — `http://localhost:8123/api/*`
- **Swagger UI** — `http://localhost:8123/api/doc`
- **WebSocket** — `ws://localhost:8123/api/websocket`
