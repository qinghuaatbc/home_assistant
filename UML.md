# Home Assistant — UML 架构图

## 1. 系统整体架构（Component Diagram）

```mermaid
graph TB
    subgraph Client["客户端 (Browser / Mobile)"]
        direction LR
        FE["React/Vite SPA<br/>20+ Pages"]
        SIO_C["Socket.io Client"]
        WS_C["WebSocket Client"]
        WebRTC_C["WebRTC Client"]
    end

    subgraph Backend["后端 (NestJS · PM2)"]
        direction TB

        subgraph Core["Core Engine"]
            EB["EventBusService<br/>(EventEmitter2 wildcard)"]
            SM["StateMachineService<br/>(in-memory states)"]
            SR["ServiceRegistryService"]
            CS["ContextService"]
            PL["PluginLoaderService"]
        end

        subgraph Auth["AuthModule"]
            AC["AuthController"]
            AS["AuthService (JWT/bcrypt)"]
            G["Guards: JWT / Local / Admin / RateLimit"]
        end

        subgraph WS["WebSocketModule"]
            WGW["WebSocketGateway (Socket.io)"]
            WSS["WsSessionService"]
            HND["Handlers: get_states / call_service<br/>subscribe_events / ping ..."]
        end

        subgraph Comm["CommModule"]
            CGW["CommGateway (Socket.io)"]
            VMS["VoiceMessageService"]
            VMC["VoiceMessageController"]
        end

        subgraph API["ApiModule (REST)"]
            CTRL["Controllers: States · Services · History<br/>Config · Events · AI · Backup<br/>OTA · Plugin · GLB · Health · Weather"]
        end

        subgraph Registry["RegistryModule"]
            AR["AreaRegistryService"]
            DR["DeviceRegistryService"]
            ER["EntityRegistryService"]
        end

        subgraph Integrations["IntegrationsModule"]
            ISY["ISY-994<br/>(Z-Wave/Insteon)"]
            MQTT_I["MQTT"]
            ECO["Ecobee"]
            LUT["Lutron Caséta"]
            YAM["Yamaha AVR"]
            NEST["Nest Thermostat"]
            CAM["Camera (RTSP/HLS)"]
            ENV["Envisalink (DSC)"]
            MISC["Weather · Scene · Switch<br/>Light · Fan · Sensor · RTI · Demo"]
        end

        subgraph Others["Other Modules"]
            PUSH["PushModule<br/>(Web Push / VAPID)"]
            GEO["GeofenceModule"]
            SCH["ScheduleModule<br/>(Thermostat)"]
            SUN["SunModule<br/>(Sunrise/Sunset)"]
            VL["VoiceLogModule"]
            ANO["AnomalyModule<br/>(AI anomaly detection)"]
            WEBRTC["WebrtcModule<br/>(go2rtc signaling)"]
        end
    end

    DB[("SQLite<br/>(better-sqlite3 + WAL)")]

    FE -->|REST HTTP| CTRL
    FE -->|Socket.io| WGW
    SIO_C -->|Socket.io chat/media| CGW
    WS_C -->|WS messages| WGW
    WebRTC_C -->|SDP/ICE signaling| WEBRTC

    WGW --> SM
    WGW --> SR
    WGW --> EB
    HND --> SM
    HND --> SR

    CTRL --> SM
    CTRL --> SR
    CTRL --> Registry
    CTRL --> Auth

    SM -->|state_changed event| EB
    SR --> EB
    Integrations -->|fire events| EB
    EB -->|notify| Integrations
    EB -->|notify| WGW
    ANO -->|listen events| EB

    SM --> DB
    Auth --> DB
    Registry --> DB
    PUSH --> DB
    GEO --> DB
    SCH --> DB
    VL --> DB
    Comm --> DB
```

---

## 2. 后端模块依赖图（Module Dependency）

```mermaid
graph LR
    APP[AppModule]

    APP --> CORE[CoreModule<br/>EventBus · StateMachine<br/>ServiceRegistry · Context]
    APP --> REG[RegistryModule<br/>Area · Device · Entity]
    APP --> AUTH[AuthModule<br/>JWT · bcrypt · Guards]
    APP --> WSMOD[WebSocketModule]
    APP --> APIMOD[ApiModule]
    APP --> INTMOD[IntegrationsModule]
    APP --> PUSH[PushModule]
    APP --> COMM[CommModule]
    APP --> SCHED[ScheduleModule]
    APP --> GEO[GeofenceModule]
    APP --> SUN[SunModule]
    APP --> VL[VoiceLogModule]
    APP --> ANO[AnomalyModule]
    APP --> WRTC[WebrtcModule]

    WSMOD --> CORE
    WSMOD --> AUTH
    APIMOD --> CORE
    APIMOD --> REG
    APIMOD --> AUTH
    INTMOD --> CORE
    INTMOD --> REG
    PUSH --> CORE
    COMM --> AUTH
    GEO --> CORE
    ANO --> CORE
    SCHED --> CORE
```

---

## 3. 数据库实体关系图（ER Diagram）

```mermaid
erDiagram
    users {
        uuid id PK
        string username UK
        string password_hash
        string display_name
        bool is_admin
        bool is_active
        datetime created_at
        datetime updated_at
    }

    long_lived_tokens {
        uuid id PK
        uuid user_id FK
        string name
        string token_hash
        text expires_at
        text last_used_at
        datetime created_at
    }

    area_registry {
        string area_id PK
        string name
        text picture
        string aliases
        datetime modified_at
    }

    device_registry {
        string device_id PK
        string name
        string manufacturer
        string model
        string sw_version
        string area_id FK
        string identifiers_json
        datetime modified_at
    }

    entity_registry {
        string entity_id PK
        string domain
        string unique_id
        string name
        string device_id FK
        string area_id FK
        bool disabled
        string unit_of_measurement
        datetime modified_at
    }

    states_history {
        int id PK
        string entity_id
        string state
        text attributes
        string last_changed
        string last_updated
        string context_id
        string context_user_id
        datetime created_at
    }

    push_subscriptions {
        uuid id PK
        string endpoint
        string p256dh
        string auth
        text label
        datetime created_at
    }

    notification_log {
        int id PK
        string title
        string body
        string rule_id
        datetime created_at
    }

    thermostat_schedule {
        int id PK
        string entity_id
        string day_of_week
        string time
        real temperature
        bool enabled
    }

    geofence_zone {
        int id PK
        string name
        real latitude
        real longitude
        real radius
        string icon
    }

    device_location {
        string device_id PK
        real latitude
        real longitude
        real accuracy
        int zone_id FK
        string source
        datetime updated_at
    }

    voice_message {
        int id PK
        text role
        text content
        text media_url
        text type
        int read
        int delivered
        datetime created_at
    }

    users ||--o{ long_lived_tokens : "has"
    area_registry ||--o{ device_registry : "groups"
    device_registry ||--o{ entity_registry : "exposes"
    entity_registry ||--o{ states_history : "tracks"
    geofence_zone ||--o{ device_location : "contains"
```

---

## 4. 前端页面结构（Frontend Page Map）

```mermaid
graph TD
    APP["App.tsx<br/>(React Router + AuthContext)"]

    APP --> LOGIN[LoginPage]
    APP --> AUTH_LAYOUT["AuthLayout (需登录)"]

    AUTH_LAYOUT --> DASH[DashboardPage<br/>状态卡片 + 快捷控制]
    AUTH_LAYOUT --> FP2D[FloorPlan2DPage<br/>SVG 平面图]
    AUTH_LAYOUT --> FP3D[FloorPlanPage<br/>Three.js 3D场景]
    AUTH_LAYOUT --> ENTITIES[EntitiesPage<br/>实体列表]
    AUTH_LAYOUT --> AUTO[AutomationsPage<br/>自动化规则]
    AUTH_LAYOUT --> SCENES[ScenesPage<br/>场景/脚本]
    AUTH_LAYOUT --> THERMO[ThermostatPage<br/>温控 + 周计划]
    AUTH_LAYOUT --> ENERGY[EnergyPage<br/>能耗SVG图表]
    AUTH_LAYOUT --> CAMERAS[CameraGridPage<br/>HLS多路流]
    AUTH_LAYOUT --> HISTORY[HistoryPage<br/>状态历史]
    AUTH_LAYOUT --> EVENTS[EventsPage<br/>事件总线日志]
    AUTH_LAYOUT --> SEC[SecurityPage<br/>Envisalink防盗]
    AUTH_LAYOUT --> GEO[GeofencePage<br/>地理围栏/地图]
    AUTH_LAYOUT --> NOTIF[NotificationsPage<br/>Push通知规则]
    AUTH_LAYOUT --> INTEGR[IntegrationsPage<br/>集成管理]
    AUTH_LAYOUT --> SETTINGS[SettingsPage<br/>系统健康/配置]
    AUTH_LAYOUT --> OTA[OtaPage<br/>固件升级]
    AUTH_LAYOUT --> BACKUP[BackupPage<br/>备份/恢复]
    AUTH_LAYOUT --> AREAS[AreasPage]
    AUTH_LAYOUT --> PERSONS[PersonsPage]
    AUTH_LAYOUT --> RTI[RtiPanelPage<br/>RTI控制面板]

    AUTH_LAYOUT --> PANEL["Panel (常驻浮层)"]
    PANEL --> AICHAT[AiChatPanel<br/>AI对话 + 语音]
    PANEL --> DOORBELL[DoorbellOverlay<br/>门铃呼叫]
    PANEL --> EDITPANEL[EditPanel<br/>实体编辑]

    subgraph "全局组件"
        TABBAR[TabBar 12项导航]
        SHORTCUT[ShortcutBar 快捷键]
        SYSSTAT[SystemStats CPU/RAM/Disk]
    end
```

---

## 5. 实时通信流（Sequence Diagram）

```mermaid
sequenceDiagram
    participant FE as React Frontend
    participant WS as WebSocketGateway
    participant SM as StateMachine
    participant EB as EventBus
    participant INT as Integration (e.g. ISY-994)

    INT->>EB: fire("state_changed", {entity_id, new_state})
    EB->>SM: onStateChanged()
    SM->>SM: update in-memory state
    SM->>DB: persist to states_history (async)
    SM->>EB: fire("state_changed", payload)
    EB->>WS: emit to all subscribers
    WS->>FE: socket.emit("state_changed", {...})
    FE->>FE: update UI (React state)

    Note over FE,WS: 控制指令反向流
    FE->>WS: call_service {domain, service, entity_id}
    WS->>SM: getState(entity_id)
    WS->>INT: serviceRegistry.callService()
    INT->>INT: 执行硬件指令
    INT->>EB: fire("state_changed")
```

---

## 图示说明

| 层级 | 技术 | 职责 |
|------|------|------|
| Frontend | React + Vite + Socket.io | 20+ 页面，实时状态订阅 |
| API Layer | NestJS REST + WebSocket | 状态查询、服务调用、认证 |
| Core Engine | EventBus + StateMachine | 事件驱动，状态中心存储 |
| Integrations | 13+ 设备驱动 | 设备协议适配（MQTT/TCP/HTTP） |
| Database | SQLite (WAL mode) | 状态历史、用户、注册表 |
| Real-time | Socket.io + WebRTC | 聊天、门铃呼叫、摄像头流 |
