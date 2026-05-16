import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

@Entity('push_subscriptions')
export class PushSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'endpoint' })
  @Index({ unique: true })
  endpoint: string

  @Column({ name: 'p256dh' })
  p256dh: string

  @Column({ name: 'auth' })
  auth: string

  @Column({ name: 'label', type: 'text', nullable: true })
  label: string | null

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date
}
