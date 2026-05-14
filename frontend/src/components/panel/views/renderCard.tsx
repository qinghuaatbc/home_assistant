import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { LightTile } from '../cards/LightCards'
import { MediaRtiCard } from '../cards/MediaCards'
import { SensorRtiCard, AlarmCard, LockTile, CurtainTile } from '../cards/SecurityCards'
import { CameraRtiCard } from '../cards/CameraCard'
import { ClimateRtiCard, ThermostatCard } from '../cards/ClimateCards'
import { GarageCoverCard } from '../cards/GarageCards'
import { SwitchTile, FanRtiCard } from '../cards/SwitchCards'
import { SceneTile, AutomationTile } from '../cards/SceneCards'

export function renderCard(s: HaState, cardType: string, icon?: string): React.ReactNode | null {
  switch (cardType) {
    case 'light':        return <LightTile        key={s.entity_id} s={s} />
    case 'sensor':       return <SensorRtiCard     key={s.entity_id} s={s} />
    case 'curtain':      return <CurtainTile       key={s.entity_id} s={s} />
    case 'camera':       return <CameraRtiCard     key={s.entity_id} s={s} />
    case 'lock':         return <LockTile          key={s.entity_id} s={s} />
    case 'alarm':        return <AlarmCard         key={s.entity_id} s={s} />
    case 'switch':       return <SwitchTile        key={s.entity_id} s={s} icon={icon} />
    case 'media-player': return <MediaRtiCard      key={s.entity_id} s={s} />
    case 'climate':      return <ClimateRtiCard    key={s.entity_id} s={s} />
    case 'thermostat':   return <ThermostatCard    key={s.entity_id} s={s} />
    case 'cover':        return <GarageCoverCard   key={s.entity_id} s={s} />
    case 'fan':          return <FanRtiCard        key={s.entity_id} s={s} />
    case 'scene':        return <SceneTile         key={s.entity_id} s={s} />
    case 'automation':   return <AutomationTile    key={s.entity_id} s={s} />
    default:             return null
  }
}

export function filterStates(states: Map<string, HaState>, test: (s: HaState) => boolean, mapped?: Set<string> | null) {
  return Array.from(states.values()).filter(s => test(s) && (!mapped || mapped.has(s.entity_id)))
}
