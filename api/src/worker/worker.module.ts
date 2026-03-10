import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkerProcessor } from './worker.processor';
import { WorkerService } from './worker.service';

export const QUEUE_NAME = 'memory';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAME })],
  providers: [WorkerProcessor, WorkerService],
  exports: [WorkerService],
})
export class WorkerModule {}
