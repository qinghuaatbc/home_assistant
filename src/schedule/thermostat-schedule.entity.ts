import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity('thermostat_schedule')
export class ThermostatScheduleEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  entityId: string

  @Column()
  dayOfWeek: number // 0=Mon..6=Sun

  @Column()
  hour: number // 0..23

  @Column('real')
  temperature: number

  @Column({ default: 1 })
  enabled: number
}
