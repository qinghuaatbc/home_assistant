import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity('geofence_zone')
export class ZoneEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  name: string

  @Column('real')
  latitude: number

  @Column('real')
  longitude: number

  @Column('real')
  radiusMeters: number

  @Column({ nullable: true })
  icon: string
}
