import { Injectable } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';

import type { Delay } from '../../domain/ports/delay.port';

@Injectable()
export class TimerDelay implements Delay {
  async wait(milliseconds: number): Promise<void> {
    await sleep(milliseconds);
  }
}
