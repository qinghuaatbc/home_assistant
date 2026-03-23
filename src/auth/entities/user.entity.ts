import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { LongLivedTokenEntity } from './long-lived-token.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'password_hash' })
  password_hash: string;

  @Column({ name: 'display_name', nullable: true })
  display_name: string;

  @Column({ name: 'is_admin', default: false })
  is_admin: boolean;

  @Column({ name: 'is_active', default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => LongLivedTokenEntity, (token) => token.user)
  long_lived_tokens: LongLivedTokenEntity[];
}
