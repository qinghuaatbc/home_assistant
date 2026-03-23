import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('area_registry')
export class AreaEntity {
  /** Slug-based ID, e.g. "living_room" */
  @PrimaryColumn({ name: 'area_id' })
  area_id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  aliases_json: string;

  @Column({ nullable: true })
  picture: string;

  @UpdateDateColumn({ name: 'modified_at' })
  modified_at: Date;
}
