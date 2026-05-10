import { HaState, Mappings, MappingEntry, BehaviorMap } from '../types'
import { guessBehavior, BEHAVIORS, BehaviorSelect, DevicePicker } from './DevicePicker'

interface Props {
  token: string | null
  meshNames: string[]
  mappings: Mappings
  behaviors: BehaviorMap
  states: Map<string, HaState>
  clickedMesh: string | null
  onSetMappings: (m: Mappings) => void
  onSetBehaviors: (b: BehaviorMap) => void
  onSetClickedMesh: (n: string | null) => void
  onPick: (mesh: string, eid: string, nextMappings: Mappings, nextBehaviors: BehaviorMap) => void
  onDelete: (nextMappings: Mappings, nextBehaviors: BehaviorMap) => void
  onSaveMappings: () => void
}

export default function EditPanel({
  token, meshNames, mappings, behaviors, states, clickedMesh,
  onSetMappings, onSetBehaviors, onSetClickedMesh,
  onPick, onDelete, onSaveMappings,
}: Props) {
  return (
    <div className="fp-edit-panel" style={{
      position: 'absolute', left: 12, top: 60, zIndex: 20, width: 220,
      background: 'var(--card)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      padding: 10, maxHeight: '60vh', overflowY: 'auto', fontSize: 11,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>📋 Meshes</span>
        <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }}
          onClick={onSaveMappings}>
          💾 Save
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>Tap a mesh to bind/unbind</div>
      {meshNames.map(meshName => {
        const mapped = !!mappings[meshName]
        return (
          <div key={meshName} data-mesh={meshName} ref={el => { if (clickedMesh === meshName && el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 4, background: clickedMesh === meshName ? 'rgba(77,143,255,0.2)' : mapped ? 'rgba(48,209,88,0.08)' : 'transparent', outline: clickedMesh === meshName ? '1px solid #4d8fff' : 'none' }}>
              <span style={{ width: 14, fontSize: 10, color: mapped ? '#30d158' : 'var(--text3)', cursor: 'pointer' }}
                onClick={() => onSetClickedMesh(meshName)}>{mapped ? '✓' : '○'}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', flex: 1 }}
                onClick={() => onSetClickedMesh(meshName)}>{meshName}</span>
              {mapped ? (
                <span style={{ fontSize: 9, color: 'var(--text2)' }}>{(() => {
                  const mv = mappings[meshName]; const eid = typeof mv === 'string' ? mv : (mv as any)?.entity
                  const b = behaviors[meshName] || guessBehavior(eid || '')
                  const bl = BEHAVIORS.find(x => x.id === b)?.label || ''
                  return bl + ' ' + (eid ? (states.get(eid)?.attributes?.friendly_name as string) || eid : '')
                })()}</span>
              ) : (
                <DevicePicker meshName={meshName} states={states} onPick={async (mesh, eid) => {
                  const next = { ...mappings, [mesh]: eid } as Mappings
                  const beh = { ...behaviors, [mesh]: guessBehavior(eid) }
                  onPick(mesh, eid, next, beh)
                }} />
              )}
              {mapped && <button className="btn" style={{ fontSize: 9, padding: '1px 5px', color: '#ff453a' }}
                onClick={() => {
                  const next = { ...mappings } as Mappings; delete (next as any)[meshName]
                  const beh = { ...behaviors }; delete beh[meshName]
                  onDelete(next, beh)
                }}>✕</button>}
            </div>
            {!mapped && <div style={{ padding: '2px 6px' }}><BehaviorSelect behavior={behaviors[meshName] || 'light'} onChange={b => onSetBehaviors({ ...behaviors, [meshName]: b })} /></div>}
          </div>
        )
      })}
    </div>
  )
}
