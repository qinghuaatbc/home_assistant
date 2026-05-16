import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddVoiceMessage1779100000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS voice_message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        "senderId" TEXT NOT NULL,
        "senderName" TEXT NOT NULL,
        "recipientId" TEXT,
        filename TEXT NOT NULL,
        "durationMs" INTEGER NOT NULL DEFAULT 0,
        delivered INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS voice_message`)
  }
}
