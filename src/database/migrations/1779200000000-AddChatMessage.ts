import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddChatMessage1779200000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS chat_message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        "from" TEXT NOT NULL,
        "fromName" TEXT NOT NULL,
        "to" TEXT,
        text TEXT NOT NULL DEFAULT '',
        "msgId" TEXT,
        "mediaUrl" TEXT,
        "mediaType" TEXT,
        "mediaName" TEXT,
        timestamp INTEGER NOT NULL,
        "isSystem" INTEGER NOT NULL DEFAULT 0
      )
    `)
    await runner.query(`CREATE INDEX IF NOT EXISTS idx_chat_message_timestamp ON chat_message (timestamp)`)
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS chat_message`)
  }
}
