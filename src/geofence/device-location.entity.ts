import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm'

@Entity('device_location')
export class DeviceLocationEntity {
  @PrimaryColumn()
  deviceId: string

  @Column('real')
  latitude: number

  @Column('real')
  longitude: number

  @Column('real', { nullable: true })
  accuracy: number

  @Column({ type: 'integer', nullable: true })
  zoneId: number | null

  @Column({ nullable: true })
  displayName: string

  @UpdateDateColumn()
  updatedAt: Date
}
