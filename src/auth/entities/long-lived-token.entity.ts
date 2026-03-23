import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * Long-lived access tokens (LLTs).
 * Similar to Home Assistant's long-lived tokens, valid up to 10 years.
 * Only the SHA-256 hash is stored; the plaintext token is shown once at creation.
 */
@Entity('long_lived_tokens')
export class LongLivedTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  user_id: string;

  /** User-provided label for this token (e.g., "My Dashboard App") */
  @Column()
  name: string;

  /** SHA-256 hash of the token - never store plaintext */
  @Column({ name: 'token_hash' })
  @Index({ unique: true })
  token_hash: string;

  /** ISO 8601 expiry date, null = never expires */
  @Column({ name: 'expires_at', type: 'text', nullable: true })
  expires_at: string | null;

  @Column({ name: 'last_used_at', type: 'text', nullable: true })
  last_used_at: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => UserEntity, (user) => user.long_lived_tokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
