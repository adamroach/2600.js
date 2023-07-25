import {Cpu6502} from "6502.mjs"
import {Rom} from "rom.mjs"
import {Ram} from "ram.mjs"
import {Riot} from "riot.mjs"
import {Tia} from "tia.mjs"

export class Vcs {
  constructor(cartridge, screen) {
    this.tickDuration = 1000 / 3.579545;
    this.divider = 0;

    this.cpu = new Cpu6502();
    this.rom = new Rom(cartridge);
    this.ram = new Ram(128);
    this.riot = new Riot();
    this.tia = new Tia(screen);
    cpu.attach(Rom, 0x1000, 0x1000, 0x0fff);
    cpu.attach(Ram, 0x1280, 0x0080, 0x007f);
    cpu.attach(Riot, 0x1280, 0x0280, 0x007f);
    cpu.attach(Tia, 0x1080, 0x0000, 0x003f);
  }

  start() {
    setInterval(this.tick.bind(this), this.tickDuration);
  }

  tick() {
    this.tia.tick();
    if (!this.divider) {
      this.riot.tick();
      this.cpu.tick();
    }
    this.divider = (this.divider + 1) % 3;
  }
}
