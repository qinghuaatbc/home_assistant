import { Module } from '@nestjs/common';
import { WebSocketGateway_ } from './websocket.gateway';
import { WsSessionService } from './ws-session.service';
import { SubscribeEventsHandler } from './handlers/subscribe-events.handler';
import { UnsubscribeEventsHandler } from './handlers/unsubscribe-events.handler';
import { GetStatesHandler } from './handlers/get-states.handler';
import { GetServicesHandler } from './handlers/get-services.handler';
import { CallServiceHandler } from './handlers/call-service.handler';
import { PingHandler } from './handlers/ping.handler';
import { GetConfigHandler } from './handlers/get-config.handler';
import { AuthModule } from '../auth/auth.module';
import { ContextService } from '../core/context/context.service';

@Module({
  imports: [AuthModule],
  providers: [
    WebSocketGateway_,
    WsSessionService,
    ContextService,
    // Message handlers
    SubscribeEventsHandler,
    UnsubscribeEventsHandler,
    GetStatesHandler,
    GetServicesHandler,
    CallServiceHandler,
    PingHandler,
    GetConfigHandler,
  ],
  exports: [WsSessionService],
})
export class WebSocketModule {}
