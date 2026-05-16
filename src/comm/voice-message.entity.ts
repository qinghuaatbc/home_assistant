import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('voice_message')
export class VoiceMessageEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: 'text' })
  senderId: string

  @Column({ type: 'text' })
  senderName: string

  @Column({ type: 'text', nullable: true })
  recipientId: string | null  // null = broadcast to all

  @Column({ type: 'text' })
  filename: string

  @Column({ type: 'integer', default: 0 })
  durationMs: number

  @Column({ type: 'integer', default: 0 })
  delivered: number  // 0 = pending, 1 = delivered

  @CreateDateColumn()
  createdAt: Date
}
