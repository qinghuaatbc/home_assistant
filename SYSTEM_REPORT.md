# Home Assistant NestJS 系统技术分析报告

**版本：** 2026.3.0 | **日期：** 2026-05-17

---

## 1. 系统架构概览

**技术栈：** NestJS（后端）+ React 18（前端）+ SQLite（数据库）+ Socket.io（WebSocket）

```
浏览器 (React + Vite)
    ↕ WebSocket / REST
NestJS Backend (:8123)
    ├── 核心模块 (Event Bus, State Machine, Context)
    ├── 集成系统 (19个内置集成)
    ├── 业务模块 (Auth, Automations, Comm, Push, Geofence)
    └── API 控制器 (14个)
    ↕
SQLite (ha.db)
```

整体数据流：
```
实体状态变更
    → StateMachineService.setState()
    → 更新内存 Map + fire 'state_changed'
    → WebSocket 广播给所有订阅客户端
    → 自动化引擎检查触发器
    → 异步持久化到 states_history 表（30天自动清理）
```

---

## 2. 核心模块 (`src/core/`)

| 模块 | 文件 | 职责 |
|------|------|------|
| **EventBusService** | `event-bus/event-bus.service.ts` | EventEmitter2 发布/订阅，支持通配符 |
| **StateMachineService** | `state-machine/state-machine.service.ts` | 中央内存状态 Map，异步持久化历史 |
| **ContextService** | `context/context.service.ts` | 追踪事件来源（id, user_id） |
| **ServiceRegistryService** | `service-registry/service-registry.service.ts` | 注册/调用 domain.service |
| **PluginLoaderService** | `plugin-loader/plugin-loader.service.ts` | 动态加载外部插件 |

**关键设计原则：**
- State 对象不可变（`Object.freeze`）
- `last_changed` 仅当值变化时更新，`last_updated` 每次都更新
- 历史记录30天后自动清理（cron job）

---

## 3. 认证模块 (`src/auth/`)

- **短期 JWT**：30分钟（浏览器 session）
- **长效 Token (LLT)**：最长10年（脚本/集成用）
- **密码加密**：bcrypt hash
- 默认账户：`admin / admin`
- 通过 `HA_JWT_SECRET` 环境变量覆盖密钥

**认证流程：**
```
POST /api/auth/login
    → bcrypt.compare(password, hash)
    → JwtService.sign({sub: user.id})
    → 返回 access_token
    → 客户端存入 localStorage('ha_token')
    → 后续请求: Authorization: Bearer {token}
```

---

## 4. WebSocket 协议 (`src/websocket/`)

HA 兼容协议，Socket.io 实现，路径：`/api/websocket`

**Phase 1 - 认证：**
```json
C→S: {"type":"auth","access_token":"..."}
S→C: {"type":"auth_ok"}
```

**Phase 2 - 命令：**
```json
C→S: {"id":1,"type":"get_states"}
S→C: {"id":1,"type":"result","success":true,"states":[...]}
```

**Phase 3 - 实时订阅：**
```json
C→S: {"id":2,"type":"subscribe_events","event_type":"state_changed"}
S→C: {"id":2,"type":"event","event":{...}}
```

**支持命令：**
| type | 说明 |
|------|------|
| `get_states` | 获取所有实体状态 |
| `get_services` | 获取所有注册服务 |
| `get_config` | 获取系统配置 |
| `call_service` | 调用服务（控制设备） |
| `subscribe_events` | 订阅事件（实时推送） |
| `unsubscribe_events` | 取消订阅 |
| `ping` | 心跳 |

---

## 5. 集成系统 (`src/integrations/`)

### 5.1 集成接口

```typescript
export interface HaIntegration {
  manifest: IntegrationManifest
  setup(config: IntegrationConfig): Promise<boolean>
  teardown(): Promise<void>
  on_start?(): Promise<void>
  on_stop?(): Promise<void>
  on_config_change?(config: IntegrationConfig): Promise<void>
}
```

### 5.2 加载流程

```
homeassistant_start 事件
    → 读取 configuration.yaml 中的 integrations 列表
    → 总是前置 demo（三层保护，见下文）
    → 顺序调用 setup(config)
    → 注册实体 + 服务
    → 触发 component_loaded 事件
    → 关闭时反序调用 on_stop() + teardown()
```

### 5.3 内置集成列表（19个）

| Domain | 集成类 | 说明 |
|--------|--------|------|
| `demo` | DemoIntegration | 演示实体，**必须始终加载** |
| `light` | LightIntegration | 灯光控制服务 |
| `switch` | SwitchIntegration | 开关服务 |
| `sensor` | SensorIntegration | 传感器（温度/湿度等） |
| `binary_sensor` | BinarySensorIntegration | 二进制传感器（门/窗/运动） |
| `camera` | CameraIntegration | RTSP 摄像头 + HLS |
| `mqtt` | MqttIntegration | MQTT broker 集成 |
| `isy994` | Isy994Integration | ISY-994 Z-Wave 控制器 |
| `lutron_caseta` | LutronCasetaIntegration | Lutron Caseta 照明 |
| `yamaha_avr` | YamahaAvrIntegration | 雅马哈功放 |
| `nest_thermostat` | NestThermostatIntegration | Nest 温控器 |
| `ecobee` | EcobeeIntegration | Ecobee 温控器 |
| `weather` | WeatherIntegration | 天气数据 |
| `fan` | FanIntegration | 风扇控制 |
| `scene` | SceneIntegration | 场景快捷组合 |
| `envisalink` | EnvisalinkIntegration | DSC/Honeywell 报警器 |
| `rti` | RtiIntegration | RTI 控制系统 |
| `rtsp2webrtc` | Rtsp2WebrtcIntegration | RTSP → WebRTC 转码 |
| `automation` | AutomationIntegration | 自动化引擎 |

### 5.4 demo 三层保护机制

防止 demo 集成被误删（它注册了 light/switch/scene 核心服务）：

1. **`integration-loader.service.ts`**：加载时若无 demo 则自动前置
2. **`config.controller.ts` `applyConfig`**：UI 保存配置时强制注入 demo
3. **`config.controller.ts` `saveConfigText`**：直接编辑 YAML 时解析后注入 demo

---

## 6. 摄像头 & 视频流 (`src/api/webrtc/`)

### 6.1 整体架构

```
RTSP 摄像头
    ↓
[go2rtc 进程] (HTTP port: 1984, RTSP output: :8554)
    ↓
┌─────────────────────────────────────┐
│ WebRTC WHEP                         │
│ POST /api/webrtc/whep/:name         │
│ → SDP offer/answer 交换             │
│ → 浏览器直连（延迟 50-100ms）        │
└─────────────────────────────────────┘

并行：
RTSP → ffmpeg → /tmp/ha_hls/{name}/*.ts
    → NestJS 静态服务 /hls/{name}/index.m3u8
    → 浏览器 hls.js 播放（延迟 3-5s）
```

### 6.2 磁盘式 HLS 方案

原因：go2rtc session-based HLS 的 session ID 约3-4秒过期，浏览器总拿到404。  
解法：绕开 go2rtc HLS，用 ffmpeg 直接从 go2rtc 的 RTSP 输出读取并写到磁盘。

**ffmpeg 参数：**
```bash
ffmpeg -fflags +genpts -rtsp_transport tcp
       -i rtsp://localhost:8554/{name}
       -c copy -f hls
       -hls_time 1 -hls_list_size 3
       -hls_flags delete_segments+append_list+split_by_time
       -hls_segment_filename /tmp/ha_hls/{name}/seg%03d.ts
       -y /tmp/ha_hls/{name}/index.m3u8
```

**hls.js 低延迟配置：**
```typescript
liveSyncDurationCount: 2
liveMaxLatencyDurationCount: 4
maxBufferLength: 4
maxMaxBufferLength: 8
backBufferLength: 1
```

**故障恢复：** ffmpeg 进程退出后5秒自动重启

### 6.3 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/webrtc/streams` | 获取所有流列表 |
| `POST` | `/api/webrtc/streams` | 手动添加 RTSP 流 |
| `DELETE` | `/api/webrtc/streams/:name` | 删除流 |
| `POST` | `/api/webrtc/whep/:name` | WebRTC WHEP 端点 |
| `GET` | `/hls/{name}/index.m3u8` | HLS 播放列表（静态服务） |

---

## 7. 通讯系统 (`src/comm/`)

### 7.1 架构

```
CommGateway (Socket.io)
    path: /api/comm/socket    ← 与 REST 分离，避免路径冲突
    ↕
CommContext (前端)
    ↕
VoiceMessageController
    POST /api/comm/voice-message  ← 语音消息
    POST /api/comm/media          ← 图片/视频/文件
```

### 7.2 功能

| 功能 | 事件/端点 | 说明 |
|------|-----------|------|
| 文字聊天 | `chat_message` | 一对一或广播 |
| 已读回执 | `read_receipt` | 消息已读状态同步 |
| 语音消息 | `POST /comm/voice-message` | WebM 上传，SQLite 持久化 |
| 媒体上传 | `POST /comm/media` | 图片/视频/文件，最大100MB |
| WebRTC 1:1 | `signal` (offer/answer/ice) | P2P 视频通话 |
| 群组通话 | `join_group_call` / `leave_group_call` | 多人视频 |
| 推送呼叫 | `push_call` | 唤醒离线用户 |
| 用户列表 | `users` | 在线+有推送端点的离线用户 |

### 7.3 文件上传技术方案

**问题：** multer 2.x 与 NestJS FileInterceptor 不兼容；Socket.io 网关路径冲突导致 "Transport unknown"

**解法：**
- Socket.io 网关路径改为 `/api/comm/socket`
- 弃用 `FileInterceptor`，改用 `busboy` 直接解析 multipart

```typescript
const Busboy = require('busboy')   // CJS require，避免 ESM 互操作问题

function parseMultipart(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: maxBytes } })
    const fields = {}
    let file = null
    bb.on('file', (_name, stream, info) => { /* 收集 chunks */ })
    bb.on('field', (name, val) => { fields[name] = val })
    bb.on('close', () => resolve({ fields, file }))
    bb.on('error', reject)
    req.pipe(bb)
  })
}
```

### 7.4 前端消息本地注入

上传成功后立即注入本地状态，不依赖 socket echo：

```typescript
const sendMedia = async (file, to?) => {
  // 上传 → 获取 URL
  const res = await fetch('/api/comm/media', { method: 'POST', body: form })
  const data = await res.json()
  // 立即注入本地消息（msgId 去重防止 socket echo 双显）
  setMessages(prev => {
    if (prev.some(m => m.msgId === msgId)) return prev
    return [...prev, localMsg].slice(-MAX_MESSAGES)
  })
  // socket emit 通知其他客户端
  socket.emit('chat_message', { mediaUrl: data.url, ... })
}
```

---

## 8. 自动化引擎 (`src/automations/`)

### 8.1 配置格式 (`config/automations.yaml`)

```yaml
- id: motion_light
  alias: "运动触发灯光"
  mode: single          # single | parallel | restart
  trigger:
    - platform: state
      entity_id: binary_sensor.motion
      to: "on"
  condition:
    - condition: time
      after: "07:00"
      before: "23:00"
  action:
    - action: call_service
      service: light.turn_on
      target:
        entity_id: light.living_room
      data:
        brightness: 200
```

### 8.2 触发器类型

| platform | 说明 |
|----------|------|
| `state` | 实体状态变化 |
| `numeric_state` | 数值大小比较（above/below） |
| `time` | 特定时间点 |
| `event` | 事件触发 |
| `template` | 模板表达式 |

### 8.3 动作类型

| action | 说明 |
|--------|------|
| `call_service` | 调用服务 |
| `delay` | 延迟（支持 ms/s） |
| `repeat` | 循环执行 |
| `condition` | 条件分支 |

---

## 9. 前端架构 (`frontend/src/`)

**技术栈：** React 18.3 + React Router 7 + Vite + Socket.io-client + Three.js + hls.js

### 9.1 页面列表（23个）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/dashboard` | DashboardPage | 主仪表板 |
| `/entities` | EntitiesPage | 实体列表 |
| `/floor-plan` | FloorPlanPage | 2D/3D 户型图 |
| `/automations` | AutomationsPage | 自动化管理 |
| `/integrations` | IntegrationsPage | 集成配置 |
| `/settings` | SettingsPage | 系统设置 |
| `/security` | SecurityPage | 摄像头/安全 |
| `/energy` | EnergyPage | 能量监控 |
| `/thermostat` | ThermostatPage | 温控管理 |
| `/geofence` | GeofencePage | 地理围栏 |
| `/notifications` | NotificationsPage | 推送通知 |
| `/history` | HistoryPage | 历史数据 |
| `/comm` | CommPage | 通讯（聊天/通话） |
| ...（其余页面） | | |

### 9.2 核心 Context

**HaContext** (`frontend/src/context/HaContext.tsx`)
- WebSocket 连接管理（自动重连）
- 全局状态 Map (`Map<entityId, HaState>`)
- 服务调用 (`callService`)
- 认证管理（token、login、logout）

**CommContext** (`frontend/src/context/CommContext.tsx`)
- 消息列表管理
- WebRTC 通话状态机
- 媒体上传（sendMedia）
- 推送通知注册

**ToastContext** — 全局 toast 通知

### 9.3 特色功能

- **Three.js 3D 户型图**：加载 GLB 文件，点击设备控制
- **Siri 风格浮动麦克风**：录音 → Whisper 转录 → GPT 解析 → TTS 回复
- **AI 聊天面板**：对话式设备控制
- **门铃悬浮覆盖层**：来电时全屏提示

---

## 10. 其他业务模块

### 10.1 推送通知 (`src/push/`)

```
ServiceWorker 注册 push subscription
    → POST /api/push/subscribe
    → 存储 PushSubscriptionEntity
    → 监听 state_changed 事件
    → NotificationRulesService 规则匹配
    → webpush.sendNotification(subscription, {title, body})
```

**通知规则示例：**
- 前门传感器：`off → on` → "🚪 前门被打开"
- 温度传感器：`> 28°C` → "🌡️ 温度过高"

### 10.2 地理围栏 (`src/geofence/`)

- 区域定义：经纬度 + 半径（米）
- 使用 Haversine 公式计算距离
- 进入/离开区域触发推送通知和自动化

### 10.3 异常检测 (`src/anomaly/`)

| 检测类型 | 条件 | 动作 |
|----------|------|------|
| 功率尖峰 | 当前功率 > 基线×3 | 推送告警 |
| 门窗左开 | 二进制传感器开启 > 30分钟 | 推送提醒 |

每60秒检查一次，启动延迟15秒（等待状态机恢复）。

### 10.4 温控日程 (`src/schedule/`)

```typescript
// 按星期+时间自动设定温度
{ dayOfWeek: 0, hour: 7, temperature: 20, enabled: true }  // 周一 7:00 → 20°C
{ dayOfWeek: 0, hour: 22, temperature: 18, enabled: true } // 周一 22:00 → 18°C
```

每5分钟检查一次，匹配到当前时间槽则调用 `thermostat.set_temperature`。

---

## 11. API 控制器索引（14个）

| 路径前缀 | 控制器 | 说明 |
|----------|--------|------|
| `/api/states` | StatesController | 实体状态 CRUD |
| `/api/services` | ServicesController | 服务调用 |
| `/api/events` | EventsController | 事件查询 |
| `/api/history` | HistoryController | 历史记录查询 |
| `/api/registry` | RegistryController | 实体注册表 |
| `/api/config` | ConfigController | 配置文件管理 |
| `/api/webrtc` | WebrtcController | 视频流管理 |
| `/api/ai` | AiController | AI 语音/聊天 |
| `/api/backup` | BackupController | 备份/恢复 |
| `/api/plugin` | PluginController | 插件管理 |
| `/api/ota` | OtaController | OTA 更新 |
| `/api/glb` | GlbController | 3D GLB 文件上传 |
| `/api/push` | PushController | 推送订阅管理 |
| `/api/health` | HealthController | 健康检查 |

---

## 12. 数据库实体（13个）

| 实体 | 表名 | 说明 |
|------|------|------|
| `StateHistoryEntity` | `states_history` | 状态变更历史 |
| `UserEntity` | `users` | 用户账号 |
| `LongLivedTokenEntity` | `long_lived_tokens` | 长效访问令牌 |
| `AutomationEntity` | `automations` | 自动化配置 |
| `PushSubscriptionEntity` | `push_subscriptions` | 推送端点 |
| `NotificationLogEntity` | `notification_logs` | 通知历史 |
| `VoiceMessageEntity` | `voice_messages` | 语音消息 |
| `VoiceLogEntity` | `voice_logs` | 语音命令历史 |
| `ZoneEntity` | `zones` | 地理围栏区域 |
| `DeviceLocationEntity` | `device_locations` | 设备位置 |
| `ScheduleEntryEntity` | `schedule_entries` | 温控日程 |
| `NotificationRuleEntity` | `notification_rules` | 通知规则 |
| `PluginEntity` | `plugins` | 已安装插件 |

---

## 13. 部署

### 13.1 关键环境变量 (`.env`)

```bash
HA_HTTP_PORT=8123
HA_JWT_SECRET=<32字符以上随机字符串>
HA_JWT_EXPIRY=24h
HA_DB_PATH=ha.db
HA_CONFIG_PATH=/path/to/configuration.yaml

OPENAI_API_KEY=sk-...     # Whisper 语音转录
ANTHROPIC_API_KEY=sk-...  # AI 聊天（可选）
```

### 13.2 pm2 配置

```javascript
// ecosystem.config.js
{
  name: 'home-assistant',
  script: 'dist/main.js',
  max_memory_restart: '500M',
  min_uptime: '10s',
  max_restarts: 10,
  restart_delay: 5000,
  exp_backoff_restart_delay: 10000,
}
```

### 13.3 部署命令

```bash
# 部署到远程服务器
SSH_PASSWORD=<password> ./deploy.sh user@host port

# 服务器操作
pm2 restart home-assistant
pm2 logs home-assistant --lines 100

# 数据库迁移
npm run migration:run
```

---

## 14. 关键数据流示例：打开卧室灯

```
前端点击 LightCard "开" 按钮
    ↓
HaContext.callService('light', 'turn_on', {brightness:255}, 'light.bedroom')
    ↓
WebSocket: {id:123, type:"call_service", domain:"light", service:"turn_on",
            service_data:{brightness:255}, target:{entity_id:"light.bedroom"}}
    ↓
CallServiceHandler.handle()
    ↓
ServiceRegistryService.call(call)
    ↓
LightIntegration service handler
    ↓
StateMachineService.setState('light.bedroom', 'on', {brightness:255})
    ↓
┌── 更新内存 Map
├── fire 'state_changed' 事件
└── 异步保存历史
    ↓
EventBusService 广播
    ├── WebSocketGateway → 推送给所有订阅客户端
    ├── AutomationEngine → 检查触发器
    └── AnomalyService → 监听（若为功率传感器）
    ↓
前端 HaContext 更新 states Map
    ↓
React 重新渲染 → LightCard 显示"开"状态
```

---

## 15. 技术债务 & 已知限制

| 问题 | 优先级 | 说明 |
|------|--------|------|
| SQLite 单线程写入 | 低 | 适合 <100 设备，高并发需换 PostgreSQL |
| WebRTC 无 TURN 中继 | 中 | 跨 NAT 通话可能失败，需部署 TURN 服务器 |
| 配置变更需重启 | 低 | automations.yaml 无热重载 |
| 推送通知无去重 | 低 | 短时间内同一条件可能重复推送 |
| HLS 延迟 3-5s | 低 | 相比 WebRTC 高，但稳定性更好，可接受 |
| go2rtc 无 systemd 管理 | 低 | 进程崩溃由 NestJS 重启逻辑处理，不够健壮 |
| 前端 bundle 体积 | 低-中 | Three.js 较大，已用 lazy routes 优化 |
| MQTT 重连策略 | 低 | 手动重连，可改为指数退避 |

---

## 16. 性能特性

| 操作 | 复杂度 | 备注 |
|------|--------|------|
| 状态查询 | O(1) | 内存 Map |
| 事件订阅广播 | O(n) | n = 订阅者数量，通常 < 50 |
| 历史记录查询 | O(log n) | 按 entity_id + timestamp 索引 |
| WebSocket 延迟 | < 50ms | 局域网 |
| WebRTC 延迟 | 50-100ms | 局域网 P2P |
| HLS 延迟 | 3-5s | 磁盘段文件方式 |

---

## 17. 代码规模统计

| 类别 | 数量 |
|------|------|
| 后端 TypeScript 文件 | ~80 个 |
| 前端 React 组件 | 43 个 |
| 内置集成 | 19 个 |
| API 控制器 | 14 个 |
| 数据库实体 | 13 个 |
| 前端页面 | 23 个 |

**主要依赖：**
- 后端：`@nestjs/*`、`typeorm`、`better-sqlite3`、`socket.io`、`passport`、`eventemitter2`、`mqtt`、`web-push`、`busboy`
- 前端：`react 18.3`、`react-router-dom 7`、`socket.io-client`、`three 0.183`、`hls.js 1.5`

---

## 18. 总结

**Home Assistant NestJS** 是一个功能完整的家庭自动化平台：

**优势：**
- 事件驱动架构，实时响应 < 50ms
- 19个内置集成，覆盖主流智能家居协议
- 完整的语音交互（录音 → Whisper → GPT → TTS）
- 双路视频流（WebRTC 低延迟 + HLS 高兼容）
- WebRTC 通讯（1:1 + 群组通话 + 推送通知）
- 3D 户型图可视化控制

**适用场景：**
- 中小规模家庭自动化（< 100 设备）
- IoT 原型开发与测试
- NestJS + HA 协议学习与二次开发

**局限：**
- SQLite 不适合超大规模（> 10,000 实体）
- WebRTC P2P 跨 NAT 需要 TURN 服务器
- 配置修改需重启服务
