import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Persists state history to the database.
 * Each row represents a state at a point in time.
 * The current state is always in-memory; this table is for history queries.
 */
@Entity('states_history')
@Index(['entity_id', 'last_updated'])
export class StateHistoryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'entity_id' })
  @Index()
  entity_id: string;

  @Column({ nullable: true })
  state: string;

  @Column({ name: 'attributes', type: 'text', nullable: true })
  attributes_json: string;

  @Column({ name: 'last_changed', nullable: true })
  last_changed: string;

  @Column({ name: 'last_updated', nullable: true })
  last_updated: string;

  @Column({ name: 'context_id', nullable: true })
  context_id: string;

  @Column({ name: 'context_user_id', nullable: true })
  context_user_id: string;

  @Column({ name: 'context_parent_id', nullable: true })
  context_parent_id: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
