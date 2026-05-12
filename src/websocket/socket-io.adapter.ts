import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  private readonly corsOrigins: string | string[];

  constructor(app: INestApplicationContext) {
    super(app);
    const configService = app.get(ConfigService);
    this.corsOrigins = configService.get<string[]>('http.cors_allowed_origins', ['*']);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins, credentials: true },
    });
  }
}
