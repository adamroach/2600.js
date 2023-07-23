import {signed8, unsigned8} from "./util.mjs"

const cyclesPerLine = 228;
const linesPerFrame = 262;
const visibleLines = 200;

export class Tia {
  constructor() {
    this.clock = 0;
    this.line = 0;
  }

  read(address) {
    switch (address) {
    }
    return 0;
  }

  write(address, value) {
    switch (address) {
    }
  }

  drawRaster() {
  }

  tick() {
    this.clock++;
    if (this.clock == cyclesPerLine) {
      this.drawRaster();
      this.line++;
      this.clock = 0;
    }
    if (this.line > linesPerFrame) {
      this.line = 0;
    }
  }

}
