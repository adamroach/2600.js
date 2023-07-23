#!/usr/bin/env node

import fs from "fs";
import process from "process";

import {Cpu6502} from "../modules/6502.mjs"
import {Rom} from "../modules/rom.mjs"
import {Ram} from "../modules/ram.mjs"

const cpu = new Cpu6502();
const rom = new Rom(fs.readFileSync("../roms/colrtest.bit"));

cpu.attach(rom, 0x1000, 0x1000, 0x0fff);
cpu.attach(new Ram(0x80), 0x1280, 0x0080, 0x007f);
cpu.attach(new Ram(0x80), 0x1280, 0x0280, 0x007f); // would be RIOT chip
cpu.attach(new Ram(0x40), 0x1080, 0x0000, 0x003f); // would be TIA chip

console.log(cpu.disassemble(0x1000, 0x1000 + rom.length));
