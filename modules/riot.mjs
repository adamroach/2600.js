import {signed8, unsigned8} from "./util.mjs"

export class Riot {
  constructor() {
    this.timer = 0xff;
    this.intervalCounter = 0;
    this.timerInterval = 1;
    this.joysticks = 0xff;
    this.console = 0xff;
  }

  read(address) {
    switch (address) {
      case 0x00:
        return this.joysticks;
      case 0x02:
        return this.console;
      case 0x04:
        return this.timer;
    }
    return 0;
  }

  write(address, value) {
    switch (address) {
      case 0x14:
        this.timer = value;
        this.intervalCounter = 0;
        this.timerInterval = 1;
        break;
      case 0x15:
        this.timer = value;
        this.intervalCounter = 0;
        this.timerInterval = 8;
        break;
      case 0x16:
        this.timer = value;
        this.intervalCounter = 0;
        this.timerInterval = 64;
        break;
      case 0x17:
        this.timer = value;
        this.intervalCounter = 0;
        this.timerInterval = 1024;
        break;
    }
  }

  tick() {
    this.intervalCounter++;
    if (this.intervalCounter == this.timerInterval) {
      this.timer = unsigned8(this.timer - 1);
      this.IntervalCounter = 0;
    }
    if (this.timer == 0) {
      this.timerInterval = 1;
    }
  }

}
