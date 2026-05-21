import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'

@Entity('chat_message')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: 'text' })
  from: string

  @Column({ type: 'text' })
  fromName: string

  @Column({ type: 'text', nullable: true })
  to: string | null

  @Column({ type: 'text', default: '' })
  text: string

  @Column({ type: 'text', nullable: true })
  msgId: string | null

  @Column({ type: 'text', nullable: true })
  mediaUrl: string | null

  @Column({ type: 'text', nullable: true })
  mediaType: string | null

  @Column({ type: 'text', nullable: true })
  mediaName: string | null

  @Index()
  @Column({ type: 'integer' })
  timestamp: number

  @Column({ type: 'integer', default: 0 })
  isSystem: number
}
