import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StateMachineService } from './state-machine.service';
import { StateHistoryEntity } from './state.entity';
import { ContextService } from '../context/context.service';

@Module({
  imports: [TypeOrmModule.forFeature([StateHistoryEntity])],
  providers: [StateMachineService, ContextService],
  exports: [StateMachineService, ContextService],
})
export class StateMachineModule {}
