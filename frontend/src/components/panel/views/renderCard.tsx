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
import { ButtonTile, NumberTile, SelectTile } from '../cards/ActionCards'
import { ChartCard } from '../cards/ChartCard'

export function renderCard(s: HaState, cardType: string, icon?: string, label?: string): React.ReactNode | null {
  const entity = label ? { ...s, attributes: { ...s.attributes, friendly_name: label } } : s
  switch (cardType) {
    case 'light':        return <LightTile        key={entity.entity_id} s={entity} />
    case 'sensor':       return <SensorRtiCard     key={entity.entity_id} s={entity} />
    case 'curtain':      return <CurtainTile       key={entity.entity_id} s={entity} />
    case 'camera':       return <CameraRtiCard     key={entity.entity_id} s={entity} />
    case 'lock':         return <LockTile          key={entity.entity_id} s={entity} />
    case 'alarm':        return <AlarmCard         key={entity.entity_id} s={entity} />
    case 'switch':       return <SwitchTile        key={entity.entity_id} s={entity} icon={icon} />
    case 'media-player': return <MediaRtiCard      key={entity.entity_id} s={entity} />
    case 'climate':      return <ClimateRtiCard    key={entity.entity_id} s={entity} />
    case 'thermostat':   return <ThermostatCard    key={entity.entity_id} s={entity} />
    case 'cover':        return <GarageCoverCard   key={entity.entity_id} s={entity} />
    case 'fan':          return <FanRtiCard        key={entity.entity_id} s={entity} />
    case 'scene':        return <SceneTile         key={entity.entity_id} s={entity} />
    case 'automation':   return <AutomationTile    key={entity.entity_id} s={entity} />
    case 'button':       return <ButtonTile        key={entity.entity_id} s={entity} />
    case 'number':       return <NumberTile        key={entity.entity_id} s={entity} />
    case 'select':       return <SelectTile        key={entity.entity_id} s={entity} />
    case 'chart':        return <ChartCard         key={entity.entity_id} s={entity} />
    default:             return null
  }
}

export function filterStates(states: Map<string, HaState>, test: (s: HaState) => boolean, mapped?: Set<string> | null) {
  return Array.from(states.values()).filter(s => test(s) && (!mapped || mapped.has(s.entity_id)))
}
