import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('entity_registry')
export class EntityRegistryEntity {
  /** Entity ID: "domain.object_id" */
  @PrimaryColumn({ name: 'entity_id' })
  entity_id: string;

  /** The platform/integration that registered this entity */
  @Column()
  platform: string;

  /** Platform-specific unique identifier for deduplication */
  @Column({ name: 'unique_id', nullable: true })
  @Index()
  unique_id: string;

  /** User-facing name */
  @Column({ nullable: true })
  name: string;

  /** Original name from the integration */
  @Column({ nullable: true, name: 'original_name' })
  original_name: string;

  /** Icon (e.g., "mdi:lightbulb") */
  @Column({ nullable: true })
  icon: string;

  /** Device this entity belongs to */
  @Column({ nullable: true, name: 'device_id' })
  @Index()
  device_id: string;

  /** Area this entity is assigned to */
  @Column({ nullable: true, name: 'area_id' })
  @Index()
  area_id: string;

  /** Whether the entity is disabled */
  @Column({ default: false })
  disabled: boolean;

  /** Reason for disable ("user", "integration", "config_entry") */
  @Column({ nullable: true, name: 'disabled_by' })
  disabled_by: string;

  /** Unit of measurement (for sensors) */
  @Column({ nullable: true, name: 'unit_of_measurement' })
  unit_of_measurement: string;

  /** Device class (e.g., "temperature", "motion") */
  @Column({ nullable: true, name: 'device_class' })
  device_class: string;

  @UpdateDateColumn({ name: 'modified_at' })
  modified_at: Date;
}
