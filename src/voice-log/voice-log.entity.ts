import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('voice_log')
export class VoiceLogEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: 'text' })
  transcript: string

  @Column({ type: 'text', nullable: true })
  response: string | null

  @Column({ type: 'text', default: 'en' })
  lang: string

  @Column({ type: 'text', nullable: true })
  action: string | null

  @CreateDateColumn()
  createdAt: Date
}
