import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAME } from './worker.module';

@Injectable()
export class WorkerService {
  constructor(@InjectQueue(QUEUE_NAME) private readonly queue: Queue) {}

  async addEmbeddingJob(data: { text: string; entityId: string }) {
    return this.queue.add('generate-embedding', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  async addProcessMemoryJob(data: { memoryId: string }) {
    return this.queue.add('process-memory', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  async getQueueStatus() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }
}
