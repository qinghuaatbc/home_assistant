import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('notification_log')
export class NotificationLogEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  title: string

  @Column({ nullable: true })
  body: string

  @Column({ nullable: true })
  icon: string

  @CreateDateColumn()
  createdAt: Date
}
