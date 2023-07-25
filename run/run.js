#!/usr/bin/env node

import fs from "fs";
import process from "process";

import {Cpu6502} from "../modules/6502.mjs"
import {Rom} from "../modules/rom.mjs"
import {Ram} from "../modules/ram.mjs"
import {Riot} from "../modules/riot.mjs"
import {Tia} from "../modules/tia.mjs"

const cpu = new Cpu6502();
const rom = new Rom(fs.readFileSync(process.argv[2]));
const ram = new Ram(0x80);
const riot = new Riot();
const tia = new Tia({ draw: function(y, r) { console.log("draw line", y); } });

cpu.attach(rom, 0x1000, 0x1000, 0x0fff);
cpu.attach(ram, 0x1280, 0x0080, 0x007f);
cpu.attach(riot, 0x1280, 0x0280, 0x007f);
cpu.attach(tia, 0x1080, 0x0000, 0x003f);

cpu.reset();
for (let i = 0; i < 1000000; i++) {
  tia.tick();
  if (!(i%3)) {
    riot.tick();
    let log = false;
    if (cpu.cyclesToWait == 0) {
      process.stdout.write(cpu.disassemble(cpu.PC, cpu.PC+1));
      log = true;
    }
    cpu.tick();
    if (log) {
      process.stdout.write(cpu.state());
    }
  }
}
