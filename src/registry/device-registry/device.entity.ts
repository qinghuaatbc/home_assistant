import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('device_registry')
export class DeviceEntity {
  @PrimaryColumn({ name: 'device_id' })
  device_id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  manufacturer: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  sw_version: string;

  @Column({ nullable: true })
  hw_version: string;

  @Column({ nullable: true })
  area_id: string;

  /** JSON array of [integration, unique_id] tuples */
  @Column({ name: 'identifiers_json', type: 'text', nullable: true })
  identifiers_json: string;

  @Column({ nullable: true })
  integration: string;

  @Column({ nullable: true, name: 'via_device_id' })
  via_device_id: string;

  @Column({ nullable: true, name: 'configuration_url' })
  configuration_url: string;

  @UpdateDateColumn({ name: 'modified_at' })
  modified_at: Date;
}
