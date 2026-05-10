import { HaState } from './context/HaContext'

export type { HaState }

export interface MappingEntry {
  entity: string
  behavior: string
}

export type Mappings = Record<string, string | MappingEntry>

export type BehaviorMap = Record<string, string>

export interface DeviceItem {
  id: string
  name: string
}

export type FloorId = 1 | 2 | 3

export interface GlbLightCfg {
  entityId: string
  name: string
  floor: FloorId
  meshName: string
}

export interface SphereLightCfg {
  entityId: string
  name: string
  floor: FloorId
  x: number
  z: number
}

export interface SensorCfg {
  entityId: string
  name: string
  floor: FloorId
  x: number
  z: number
  deviceClass: string
}

export interface SensorGlbCfg {
  entityId: string
  name: string
  floor: FloorId
  meshName: string
  deviceClass: string
  pos?: [number, number]
}
