import {signed8, unsigned8} from "./util.mjs"

export class Cpu6502 {
  constructor() {
    this.chips = [];
    this.PC = 0x0000;
    this.A = 0x00;
    this.X = 0x00;
    this.Y = 0x00;
    this.P = 0x00;
    this.SP = 0xff;
    this.cyclesToWait = 0;
  }

  // Attach a memory-mapped chip to the CPU
  attach(chip, mask, key, addressLimit) {
    this.chips.push({chip, mask, key, addressLimit});
  }

  reset() {
    this.PC = this.read2(0xfffc);
  }

  nmi() {
    this.interrupt(0xfffa);
  }

  irq() {
    if (!(this.P & Flag.I)) {
      this.interrupt(0xfffe);
    }
  }

  interrupt(vector) {
    this.push((this.PC >>> 8) & 0xff);
    this.push(this.PC & 0xff);
    this.push(this.P | Flag.unused);
    this.PC = this.read2(vector);
  }

  read2(address) {
    return this.read(address) + (this.read(address+1) << 8);
  }

  read(address) {
    for (var i = 0; i < this.chips.length; i++) {
      let chip = this.chips[i];
      if ((address & chip.mask) == chip.key) {
        return chip.chip.read(address & chip.addressLimit);
      }
    }
    throw new Error("No chip registered for address 0x" +
      address.toString(16).padStart(4, "0"));
  }

  write2(address, value) {
    this.write(address, value & 0xff);
    this.write(address+1, (value >>> 8) & 0xff);
  }

  write(address, value) {
    value = unsigned8(value);
    for (var i = 0; i < this.chips.length; i++) {
      let chip = this.chips[i];
      if ((address & chip.mask) == chip.key) {
        chip.chip.write(address & chip.addressLimit, value);
        return;
      }
    }
    throw new Error("No chip registered for address 0x" +
      address.toString(16).padStart(4, "0"));
  }

  setpNZ(x) {
    this.setFlag(Flag.N, !!(x&0x80));
    this.setFlag(Flag.Z, !x);
  }

  setFlag(flag, val) {
    if (val) {
      this.P |= flag;
    } else {
      this.P &= (~flag) & 0xff;
    }
  }

  flagIsSet(flag) {
    return !!(this.P & flag);
  }

  // convenience functions for flags
  get N() { return this.flagIsSet(Flag.N); }
  get V() { return this.flagIsSet(Flag.V); }
  get B() { return this.flagIsSet(Flag.B); }
  get D() { return this.flagIsSet(Flag.D); }
  get I() { return this.flagIsSet(Flag.I); }
  get Z() { return this.flagIsSet(Flag.Z); }
  get C() { return this.flagIsSet(Flag.C); }
  set N(x) { this.setFlag(Flag.N, !!x); }
  set V(x) { this.setFlag(Flag.V, !!x); }
  set B(x) { this.setFlag(Flag.B, !!x); }
  set D(x) { this.setFlag(Flag.D, !!x); }
  set I(x) { this.setFlag(Flag.I, !!x); }
  set Z(x) { this.setFlag(Flag.Z, !!x); }
  set C(x) { this.setFlag(Flag.C, !!x); }

  push(x) {
    this.write(this.SP | 0x100, x);
    this.SP = unsigned8(this.SP - 1);
  }

  pop() {
    this.SP = unsigned8(this.SP + 1);
    return this.read(this.SP | 0x100);
  }

  carry() {
    return this.P & 1;
  }

  branch(cond, distance) {
    if (!cond) {
      return;
    }
    let temp = this.PC;
    this.PC += signed8(distance);
    this.cyclesToWait++;
    if ((temp & 0xff00) != (this.PC & 0xff00)) {
      this.cyclesToWait++;
    }
  }

  tick() {
    if (this.cyclesToWait) {
      this.cyclesToWait--;
      return;
    }
    let arg, temp, AH, AL;
    let bytecode = [this.read(this.PC)];
    let op = Opcode[bytecode[0]];
    if (op.length > 1) {
      bytecode.push(this.read(this.PC+1));
    }
    if (op.length > 2) {
      bytecode.push(this.read(this.PC+2));
    }

    let argumentAddress = 0;
    switch (op.mode) {
      case Mode.ABS:     /* Absolute */
        if (!(op.attrs & Attr.REL)) {
          argumentAddress = bytecode[1] | (bytecode[2] << 8);
        }
        break;
      case Mode.ACC:     /* Accumulator */
        // Accumulator is the target, which is special.
        // This only happens for ROR, ROL, LSR, and ASL.
        // We'll check for Mode.ACC manually in those
        // four opcodes.
        break;
      case Mode.AX:      /* Absolute, X indexed */
        argumentAddress = bytecode[1] | (bytecode[2] << 8);
        argumentAddress += this.X;
        if (((argumentAddress & 0xff) < bytecode[1])
          && (op.attrs & Attrs.Read)) {
          this.cyclesToWait++;
        }
        break;
      case Mode.AY:      /* Absolute, Y indexed */
        argumentAddress = bytecode[1] | (bytecode[2] << 8);
        argumentAddress += this.Y;
        if (((argumentAddress & 0xff) < bytecode[1])
          && (op.attrs & Attrs.Read)) {
          this.cyclesToWait++;
        }
        break;
      case Mode.IMM:     /* Immediate */
        argumentAddress = this.PC+1
        break;
      case Mode.IMPL:    /* Implied */
        break;
      case Mode.INDR:    /* Absolute Indirect */
        argumentAddress = bytecode[1] | (bytecode[2] << 8);
        argumentAddress = this.read2(argumentAddress);
        break;
      case Mode.IX:      /* (zp,X) Zero Page X indexed Indirect */
        argumentAddress = this.read2((bytecode[1] + this.X) & 0xff);
        break;
      case Mode.IY:      /* (zp),Y Zero Page Indirect, Y indexed */
        argumentAddress = this.read2(bytecode[1]);
        let temp = argumentAddress;
        argumentAddress += this.Y;
        if (((argumentAddress & 0xff) < (temp & 0xff))
          && (op.attrs & Attrs.Read)) {
          this.cyclesToWait++;
        }
        break;
      case Mode.ZABS:    /* Zero Page Absolute */
        argumentAddress = bytecode[1];
        break;
      case Mode.ZAX:     /* Zero Page Absolute, X indexed */
        argumentAddress = (bytecode[1] + this.X) & 0xff;
        break;
      case Mode.ZAY:     /* Zero Page Absolute, Y indexed */
        argumentAddress = (bytecode[1] + this.Y) & 0xff;
        break;
    }
    argumentAddress &= 0xFFFF;

    switch (op.instruction) {
      case Instruction.ADC: /* NZCV */
        if(this.D){ /* Binary Coded Decimal calculation */
          arg = this.read(argumentAddress);
          let AL = (this.A & 0x0F) + (arg & 0x0F) + this.carry();
          if (AL > 9) { AL += 6; } /* Fix lower nybble */
          let AH = (this.A >>> 4) + (arg >>> 4) +
            ((AL & 0xF0)?1:0);
          this.Z = !((this.A + arg + this.carry())&0xFF);
          this.N = (AH & 0x08);
          this.V = (this.N && !(this.A & 0x80));
          if (AH > 9) { AH += 6; } /* Fix upper nybble */
          this.C = (AH & 0xF0);
          this.A = ((AH << 4) | (AL & 0x0F));
        } else { /* binary calculation */
          let temp = this.A + this.read(argumentAddress) + this.carry();
          this.V = ((temp & 0x80) && !(this.A & 0x80));
          this.A = temp & 0xFF;
          this.C = (temp & 0xFF00) >>> 8;
          this.setpNZ(this.A);
        }
      break;

      case Instruction.AND: /* NZ */
        this.A &= this.read(argumentAddress)
        this.setpNZ(this.A);
      break;

      case Instruction.ASL: /* NZC */
        if (op.mode == Mode.ACC) {
          this.C = this.A & 0x80;
          this.A <<= 1;
          this.setpNZ(this.A);
        } else {
          let val = this.read(argumentAddress);
          this.C = val & 0x80;
          val <<= 1;
          this.write(argumentAddress, val);
          this.setpNZ(val);
        }
      break;

      case Instruction.BCC:
        this.branch(!this.C, bytecode[1]);
      break;

      case Instruction.BCS:
        this.branch(this.C, bytecode[1]);
      break;

      case Instruction.BEQ:
        this.branch(this.Z, bytecode[1]);
      break;

      case Instruction.BIT: /* NZV -- special case Instruction.*/
        arc = this.read(argumentAddress);
        this.Z= ~(arg&this.A);
        this.N=(arg&128);
        this.V=(arg&64);
      break;

      case Instruction.BMI:
        this.branch(this.N, bytecode[1]);
      break;

      case Instruction.BNE:
        this.branch(this.Z, bytecode[1]);
      break;

      case Instruction.BPL:
        this.branch(!this.N, bytecode[1]);
      break;

      case Instruction.BRK: /* B */
        this.PC++;
        this.B = true;
        this.interrupt(0xFFFE);
        this.B = false;
        this.PC--;
      break;

      case Instruction.BVC:
        this.branch(!this.V, bytecode[1]);
      break;

      case Instruction.BVS:
        this.branch(this.V, bytecode[1]);
      break;

      case Instruction.CLC: /* C */
        this.C = false;
      break;

      case Instruction.CLD: /* D */
        this.D = false;
      break;

      case Instruction.CLI: /* I */
        this.I = false;
      break;

      case Instruction.CLV: /* V */
        this.V = false;
      break;

      case Instruction.CMP: /* NZC */
        arg = this.read(argumentAddress);
        this.C = (this.A >= arg);
        this.setpNZ(unsigned8(this.A - arg));
      break;

      case Instruction.CPX: /* NZC */
        arg = this.read(argumentAddress);
        this.C = (this.X >= arg);
        this.setpNZ(unsigned8(this.X - arg));
      break;

      case Instruction.CPY: /* NZC */
        arg = this.read(argumentAddress);
        this.C = (this.Y >= arg);
        this.setpNZ(unsigned8(this.Y - arg));
      break;

      case Instruction.DEC: /* NZ */
        arg = this.read(argumentAddress);
        arg = unsigned8(arg - 1);
        this.write(argumentAddress, arg);
        this.setpNZ(arg);
      break;

      case Instruction.DEX: /* NZ */
        this.X = unsigned8(this.X-1);
        this.setpNZ(this.X);
      break;

      case Instruction.DEY: /* NZ */
        this.Y = unsigned8(this.Y-1);
        this.setpNZ(this.Y);
      break;

      case Instruction.EOR: /* NZ */
        this.A ^= this.read(argumentAddress);
        this.setpNZ(this.A);
      break;

      case Instruction.INC: /* NZ */
        arg = this.read(argumentAddress);
        arg = unsigned8(arg + 1);
        this.write(argumentAddress, arg);
        this.setpNZ(arg);
      break;

      case Instruction.INX: /* NZ */
        this.X = unsigned8(this.X+1);
        this.setpNZ(this.X);
      break;

      case Instruction.INY: /* NZ */
        this.Y = unsigned8(this.Y+1);
        this.setpNZ(this.Y);
      break;

      case Instruction.JSR:
        /* instruction is 3 bytes long, but we push (ret-1) */
        this.PC += 2;
        this.push((this.PC >>> 8) & 0xff);
        this.push(this.PC & 0xff);
        this.PC = argumentAddress - op.length;
      break;

      case Instruction.JMP:
        this.PC = argumentAddress - op.length;
      break;

      case Instruction.LDA: /* NZ */
        this.A = this.read(argumentAddress);
        this.setpNZ(this.A);
      break;

      case Instruction.LDX: /* NZ */
        this.X = this.read(argumentAddress);
        this.setpNZ(this.X);
      break;

      case Instruction.LDY: /* NZ */
        this.Y = this.read(argumentAddress);
        this.setpNZ(this.Y);
      break;

      case Instruction.LSR: /* NZC */
        if (op.mode == Mode.ACC) {
          this.C = this.A & 0x01;
          this.A = (this.A >>> 1) & 0x7F;
          this.setpNZ(this.A);
        } else {
          let val = this.read(argumentAddress);
          this.C = val & 0x01;
          val = (val >>> 1) & 0x7F;
          this.write(argumentAddress, val);
          this.setpNZ(val);
        }
      break;

      case Instruction.NOP:
      break;

      case Instruction.ORA: /* NZ */
        this.A |= this.read(argumentAddress);
        this.setpNZ(this.A);
      break;

      case Instruction.PHA:
        this.push(A);
      break;

      case Instruction.PHP:
        this.push(P);
      break;

      case Instruction.PLA: /* NZ */
        this.A = this.pop();
        this.setpNZ(this.A);
      break;

      case Instruction.PLP: /* NZCIDV */
        this.P = this.pop() & 0xCF; // ignore bit 5 and break flag
      break;

      case Instruction.ROL: /* NZC */
        if (op.mode == Mode.ACC) {
          let carry = this.A & 0x80;
          this.A = (this.A << 1) | this.carry();
          this.C = carry;
          this.setpNZ(this.A);
        } else {
          let val = this.read(argumentAddress);
          let carry = val & 0x80;
          val = (val << 1) | this.carry();
          this.C = carry;
          this.setpNZ(val);
        }
      break;

      case Instruction.ROR: /* NZC */
        if (op.mode == Mode.ACC) {
          let carry = this.A & 0x01;
          this.A = ((this.A >>> 1) & 0x7F) | (this.carry() << 7);
          this.C = carry;
          this.setpNZ(this.A);
        } else {
          let val = this.read(argumentAddress);
          let carry = val & 0x01;
          val = ((val >>> 1) & 0x7f) | (this.carry() << 7);
          this.C = carry;
          this.setpNZ(val);
        }
      break;

      case Instruction.RTI: /* NZCIDV */
        this.P = this.pop();
        this.PC = this.pop();
        this.PC |= this.pop() << 8;
        this.PC -= 1;
      break;

      case Instruction.RTS:
        this.PC = this.pop();
        this.PC |= this.pop() << 8;
      break;

      case Instruction.SBC: /* NZCV */
        if(this.D){ /* Binary Coded Decimal calculation */
          arg = this.read(argumentAddress);
          let AL = (this.A & 0x0F) - (arg & 0x0F) - (this.C?0:1);
          if (AL & 0x10) { AL -= 6; } /* Fix lower nybble */
          AH = (this.A >>> 4) - (arg >>> 4) - ((AL & 0x10)?1:0);
          if (AH & 0x10) { AH -= 6; } /* Fix upper nybble */
          /* set flags just like non-BCD calculation */
          temp = this.A - arg - this.carry();
          this.V = (!(temp & 0x80) & (this.A & 0x80));
          this.C = !((temp & 0xFF00) >>> 8);
          this.setpNZ(temp);
          this.A = ((AH << 4) | (AL & 0x0F));
        } else { /* binary calculation */
          temp = this.A - this.read(argumentAddress) - (this.C?0:1);
          this.V = (!(temp & 0x80) && (this.A & 0x80));
          this.A = temp & 0xFF;
          this.C = !((temp & 0xFF00) >>> 8);
          this.setpNZ(this.A);
        }
      break;

      case Instruction.SEC: /* C */
        this.C = true;
      break;

      case Instruction.SED: /* D */
        this.D = true;
      break;

      case Instruction.SEI: /* I */
        this.I = true;
      break;

      case Instruction.STA:
        this.write(argumentAddress, this.A);
      break;

      case Instruction.STX:
        this.write(argumentAddress, this.X);
      break;

      case Instruction.STY:
        this.write(argumentAddress, this.Y);
      break;

      case Instruction.TAX: /* NZ */
        this.X = this.A;
        this.setpNZ(this.X);
      break;

      case Instruction.TAY: /* NZ */
        this.Y = this.A;
        this.setpNZ(this.Y);
      break;

      case Instruction.TSX: /* NZ */
        this.X = this.SP;
        this.setpNZ(this.X);
      break;

      case Instruction.TXA: /* NZ */
        this.A = this.X;
        this.setpNZ(this.A);
      break;

      case Instruction.TXS:
        this.SP = this.X;
      break;

      case Instruction.TYA: /* NZ */
        this.A = this.Y;
        this.setpNZ(A);
      break;
    }
    if (op.cycles) {
      this.cyclesToWait += op.cycles - 1;
    }
    this.PC += op.length;
  }

  state() {
    return "" +
      "PC=" + this.PC.toString(16).padStart(4, "0") +
      " A=" + this.A.toString(16).padStart(2, "0") +
      " X=" + this.X.toString(16).padStart(2, "0") +
      " Y=" + this.Y.toString(16).padStart(2, "0") +
      " P=" + this.P.toString(16).padStart(2, "0") + " (" +
        (this.N?"N":"-") +
        (this.V?"V":"-") +
        ((this.P & Flag.unused)?"*":"-") +
        (this.B?"B":"-") +
        (this.D?"D":"-") +
        (this.I?"I":"-") +
        (this.Z?"Z":"-") +
        (this.C?"C":"-") +
      ")"+
      " SP=" + this.SP.toString(16).padStart(2, "0") +
      "\n";
  }

  disassemble(start, end) {
    let result = "";
    for (let addr = start; addr < end;) {
      let op = Opcode[this.read(addr)];
      result += addr.toString(16).padStart(4, "0") + " ";
      for (let i = 0; i < 3; i++) {
        if (i < op.length) {
          let byte = this.read(addr+i)
          if (byte != undefined) {
            result += this.read(addr+i).toString(16).padStart(2, "0") + " ";
          }
        } else {
          result += ".. ";
        }
      }
      result += op.mnemonic;

      let arg = "";
      switch (op.length) {
        case 2:
          arg = this.read(addr+1).toString(16).padStart(2, "0");
          break;
        case 3:
          arg = this.read2(addr+1).toString(16).padStart(4, "0");
          break;
      }

      switch (op.mode) {
        case Mode.ABS:     /* Absolute */
        case Mode.ZABS:    /* Zero Page Absolute */
          if (op.attrs & Attr.REL) {
            result += " $" + (addr + signed8(this.read(addr+1)+2))
              .toString(16).padStart(2, "0");
          } else {
            result += " $" + arg;
          }
          break;
        case Mode.ACC:     /* Accumulator */
          break;
        case Mode.AX:      /* Absolute, X indexed */
        case Mode.ZAX:     /* Zero Page Absolute, X indexed */
          result += " $" + arg + ",X";
          break;
        case Mode.AY:      /* Absolute, Y indexed */
        case Mode.ZAY:     /* Zero Page Absolute, Y indexed */
          result += " $" + arg + ",Y";
          break;
        case Mode.IMM:     /* Immediate */
          result += " #$" + arg;
          break;
        case Mode.IMPL:    /* Implied */
          break;
        case Mode.INDR:    /* Absolute Indirect */
          result += " ($" + arg + ")";
          break;
        case Mode.IX:      /* Zero Page X indexed Indirect */
          result += " ($" + arg + ",X)";
          break;
        case Mode.IY:      /* Zero Page Indirect, Y indexed */
          result += " ($" + arg + "),Y";
          break;
      }

      addr += op.length;
      result += "\n";
    }
    return result;
  }

}

const Flag = {
  N: 0x80,
  V: 0x40,
  unused: 0x20,
  B: 0x10,
  D: 0x08,
  I: 0x04,
  Z: 0x02,
  C: 0x01,
}

const Instruction = {
  Bad: 0,
  ADC: 1,
  AND: 2,
  ASL: 3,
  BCC: 4,
  BCS: 5,
  BEQ: 6,
  BIT: 7,
  BMI: 8,
  BNE: 9,
  BPL: 10,
  BRK: 11,
  BVC: 12,
  BVS: 13,
  CLC: 14,
  CLD: 15,
  CLI: 16,
  CLV: 17,
  CMP: 18,
  CPX: 19,
  CPY: 20,
  DEC: 21,
  DEX: 22,
  DEY: 23,
  EOR: 24,
  INC: 25,
  INX: 26,
  INY: 27,
  JMP: 28,
  JSR: 29,
  LDA: 30,
  LDX: 31,
  LDY: 32,
  LSR: 33,
  NOP: 34,
  ORA: 35,
  PHA: 36,
  PHP: 37,
  PLA: 38,
  PLP: 39,
  ROL: 40,
  ROR: 41,
  RTI: 42,
  RTS: 43,
  SBC: 44,
  SEC: 45,
  SED: 46,
  SEI: 47,
  STA: 48,
  STX: 49,
  STY: 50,
  TAX: 51,
  TAY: 52,
  TSX: 53,
  TXA: 54,
  TXS: 55,
  TYA: 56,
}

const Mode = {
  Bad:  0,
  ABS:  1,    /* Absolute */
  ACC:  2,    /* Accumulator */
  AX:   3,    /* Absolute, X indexed */
  AY:   4,    /* Absolute, Y indexed */
  IMM:  5,    /* Immediate */
  IMPL: 6,    /* Implied */
  INDR: 7,    /* Absolute Indirect */
  IX:   8,    /* Zero Page X indexed Indirect */
  IY:   9,    /* Zero Page Indirect, Y indexed */
  ZABS: 10,   /* Zero Page Absolute */
  ZAX:  11,   /* Zero Page Absolute, X indexed */
  ZAY:  12,   /* Zero Page Absolute, Y indexed */
};

const Attr = {
  READ:  1,
  WRITE: 2,
  REL:   4,
}

class Op {
  constructor(mnemonic, instruction, mode, length, cycles, attrs) {
    Object.assign(this, {mnemonic, instruction, mode, length, cycles, attrs});
  }
}

const Opcode = [
  new Op("BRK", Instruction.BRK, Mode.IMPL, 1, 7, 0                   ), // 0x00
  new Op("ORA", Instruction.ORA, Mode.IX,   2, 6, Attr.READ           ), // 0x01
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x02
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x03
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x04
  new Op("ORA", Instruction.ORA, Mode.ZABS, 2, 3, Attr.READ           ), // 0x05
  new Op("ASL", Instruction.ASL, Mode.ZABS, 2, 5, Attr.READ|Attr.WRITE), // 0x06
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x07
  new Op("PHP", Instruction.PHP, Mode.IMPL, 1, 3, 0                   ), // 0x08
  new Op("ORA", Instruction.ORA, Mode.IMM,  2, 2, 0                   ), // 0x09
  new Op("ASL", Instruction.ASL, Mode.ACC,  1, 2, 0                   ), // 0x0A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x0B
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x0C
  new Op("ORA", Instruction.ORA, Mode.ABS,  3, 4, Attr.READ           ), // 0x0D
  new Op("ASL", Instruction.ASL, Mode.ABS,  3, 6, Attr.READ|Attr.WRITE), // 0x0E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x0F
  new Op("BPL", Instruction.BPL, Mode.ABS,  2, 2, Attr.REL            ), // 0x10
  new Op("ORA", Instruction.ORA, Mode.IY,   2, 5, Attr.READ           ), // 0x11
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x12
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x13
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x14
  new Op("ORA", Instruction.ORA, Mode.ZAX,  2, 4, Attr.READ           ), // 0x15
  new Op("ASL", Instruction.ASL, Mode.ZAX,  2, 6, Attr.READ|Attr.WRITE), // 0x16
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x17
  new Op("CLC", Instruction.CLC, Mode.IMPL, 1, 2, 0                   ), // 0x18
  new Op("ORA", Instruction.ORA, Mode.AY,   3, 4, Attr.READ           ), // 0x19
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x1A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x1B
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x1C
  new Op("ORA", Instruction.ORA, Mode.AX,   3, 4, Attr.READ           ), // 0x1D
  new Op("ASL", Instruction.ASL, Mode.AX,   3, 7, Attr.READ           ), // 0x1E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x1F
  new Op("JSR", Instruction.JSR, Mode.ABS,  3, 6, 0                   ), // 0x20
  new Op("AND", Instruction.AND, Mode.IX,   2, 6, Attr.READ           ), // 0x21
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x22
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x23
  new Op("BIT", Instruction.BIT, Mode.ZABS, 2, 3, Attr.READ           ), // 0x24
  new Op("AND", Instruction.AND, Mode.ZABS, 2, 3, Attr.READ           ), // 0x25
  new Op("ROL", Instruction.ROL, Mode.ZABS, 2, 5, Attr.READ|Attr.WRITE), // 0x26
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x27
  new Op("PLP", Instruction.PLP, Mode.IMPL, 1, 4, 0                   ), // 0x28
  new Op("AND", Instruction.AND, Mode.IMM,  2, 2, 0                   ), // 0x29
  new Op("ROL", Instruction.ROL, Mode.ACC,  1, 2, 0                   ), // 0x2A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x2B
  new Op("BIT", Instruction.BIT, Mode.ABS,  3, 4, Attr.READ           ), // 0x2C
  new Op("AND", Instruction.AND, Mode.ABS,  3, 4, Attr.READ           ), // 0x2D
  new Op("ROL", Instruction.ROL, Mode.ABS,  3, 6, Attr.READ|Attr.WRITE), // 0x2E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x2F
  new Op("BMI", Instruction.BMI, Mode.ABS,  2, 2, Attr.REL            ), // 0x30
  new Op("AND", Instruction.AND, Mode.IY,   2, 5, Attr.READ           ), // 0x31
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x32
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x33
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x34
  new Op("AND", Instruction.AND, Mode.ZAX,  2, 4, Attr.READ           ), // 0x35
  new Op("ROL", Instruction.ROL, Mode.ZAX,  2, 6, Attr.READ|Attr.WRITE), // 0x36
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x37
  new Op("SEC", Instruction.SEC, Mode.IMPL, 1, 2, 0                   ), // 0x38
  new Op("AND", Instruction.AND, Mode.AY,   3, 4, Attr.READ           ), // 0x39
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x3A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x3B
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x3C
  new Op("AND", Instruction.AND, Mode.AX,   3, 4, Attr.READ           ), // 0x3D
  new Op("ROL", Instruction.ROL, Mode.AX,   3, 7, Attr.READ|Attr.WRITE), // 0x3E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x3F
  new Op("RTI", Instruction.RTI, Mode.IMPL, 1, 6, 0                   ), // 0x40
  new Op("EOR", Instruction.EOR, Mode.IX,   2, 6, Attr.READ           ), // 0x41
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x42
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x43
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x44
  new Op("EOR", Instruction.EOR, Mode.ZABS, 2, 3, Attr.READ           ), // 0x45
  new Op("LSR", Instruction.LSR, Mode.ZABS, 2, 5, Attr.READ|Attr.WRITE), // 0x46
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x47
  new Op("PHA", Instruction.PHA, Mode.IMPL, 1, 3, 0                   ), // 0x48
  new Op("EOR", Instruction.EOR, Mode.IMM,  2, 2, 0                   ), // 0x49
  new Op("LSR", Instruction.LSR, Mode.ACC,  1, 2, 0                   ), // 0x4A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x4B
  new Op("JMP", Instruction.JMP, Mode.ABS,  3, 3, 0                   ), // 0x4C
  new Op("EOR", Instruction.EOR, Mode.ABS,  3, 4, Attr.READ           ), // 0x4D
  new Op("LSR", Instruction.LSR, Mode.ABS,  3, 6, Attr.READ|Attr.WRITE), // 0x4E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x4F
  new Op("BVC", Instruction.BVC, Mode.ABS,  2, 2, Attr.REL            ), // 0x50
  new Op("EOR", Instruction.EOR, Mode.IY,   2, 5, Attr.READ           ), // 0x51
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x52
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x53
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x54
  new Op("EOR", Instruction.EOR, Mode.ZAX,  2, 4, Attr.READ           ), // 0x55
  new Op("LSR", Instruction.LSR, Mode.ZAX,  2, 6, Attr.READ|Attr.WRITE), // 0x56
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x57
  new Op("CLI", Instruction.CLI, Mode.IMPL, 1, 2, 0                   ), // 0x58
  new Op("EOR", Instruction.EOR, Mode.AY,   3, 4, Attr.READ           ), // 0x59
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x5A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x5B
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x5C
  new Op("EOR", Instruction.EOR, Mode.AX,   3, 4, Attr.READ           ), // 0x5D
  new Op("LSR", Instruction.LSR, Mode.AX,   3, 7, Attr.READ|Attr.WRITE), // 0x5E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x5F
  new Op("RTS", Instruction.RTS, Mode.IMPL, 1, 6, 0                   ), // 0x60
  new Op("ADC", Instruction.ADC, Mode.IX,   2, 6, Attr.READ           ), // 0x61
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x62
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x63
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x64
  new Op("ADC", Instruction.ADC, Mode.ZABS, 2, 3, Attr.READ           ), // 0x65
  new Op("ROR", Instruction.ROR, Mode.ZABS, 2, 5, Attr.READ|Attr.WRITE), // 0x66
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x67
  new Op("PLA", Instruction.PLA, Mode.IMPL, 1, 4, 0                   ), // 0x68
  new Op("ADC", Instruction.ADC, Mode.IMM,  2, 2, 0                   ), // 0x69
  new Op("ROR", Instruction.ROR, Mode.ACC,  1, 2, 0                   ), // 0x6A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x6B
  new Op("JMP", Instruction.JMP, Mode.INDR, 3, 5, 0                   ), // 0x6C
  new Op("ADC", Instruction.ADC, Mode.ABS,  3, 4, Attr.READ           ), // 0x6D
  new Op("ROR", Instruction.ROR, Mode.ABS,  3, 6, Attr.READ|Attr.WRITE), // 0x6E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x6F
  new Op("BVS", Instruction.BVS, Mode.ABS,  2, 2, Attr.REL            ), // 0x70
  new Op("ADC", Instruction.ADC, Mode.IY,   2, 5, Attr.READ           ), // 0x71
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x72
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x73
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x74
  new Op("ADC", Instruction.ADC, Mode.ZAX,  2, 4, Attr.READ           ), // 0x75
  new Op("ROR", Instruction.ROR, Mode.ZAX,  2, 6, Attr.READ|Attr.WRITE), // 0x76
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x77
  new Op("SEI", Instruction.SEI, Mode.IMPL, 1, 2, 0                   ), // 0x78
  new Op("ADC", Instruction.ADC, Mode.AY,   3, 4, Attr.READ           ), // 0x79
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x7A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x7B
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x7C
  new Op("ADC", Instruction.ADC, Mode.AX,   3, 4, Attr.READ           ), // 0x7D
  new Op("ROR", Instruction.ROR, Mode.AX,   3, 7, Attr.READ|Attr.WRITE), // 0x7E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x7F
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x80
  new Op("STA", Instruction.STA, Mode.IX,   2, 6, Attr.WRITE          ), // 0x81
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x82
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x83
  new Op("STY", Instruction.STY, Mode.ZABS, 2, 3, Attr.WRITE          ), // 0x84
  new Op("STA", Instruction.STA, Mode.ZABS, 2, 3, Attr.WRITE          ), // 0x85
  new Op("STX", Instruction.STX, Mode.ZABS, 2, 3, Attr.WRITE          ), // 0x86
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x87
  new Op("DEY", Instruction.DEY, Mode.IMPL, 1, 2, 0                   ), // 0x88
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x89
  new Op("TXA", Instruction.TXA, Mode.IMPL, 1, 2, 0                   ), // 0x8A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x8B
  new Op("STY", Instruction.STY, Mode.ABS,  3, 4, Attr.WRITE          ), // 0x8C
  new Op("STA", Instruction.STA, Mode.ABS,  3, 4, Attr.WRITE          ), // 0x8D
  new Op("STX", Instruction.STX, Mode.ABS,  3, 4, Attr.WRITE          ), // 0x8E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x8F
  new Op("BCC", Instruction.BCC, Mode.ABS,  2, 2, Attr.REL            ), // 0x90
  new Op("STA", Instruction.STA, Mode.IY,   2, 6, Attr.WRITE          ), // 0x91
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x92
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x93
  new Op("STY", Instruction.STY, Mode.ZAX,  2, 5, Attr.WRITE          ), // 0x94
  new Op("STA", Instruction.STA, Mode.ZAX,  2, 4, Attr.WRITE          ), // 0x95
  new Op("STX", Instruction.STX, Mode.ZAY,  2, 4, Attr.WRITE          ), // 0x96
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x97
  new Op("TYA", Instruction.TYA, Mode.IMPL, 1, 2, 0                   ), // 0x98
  new Op("STA", Instruction.STA, Mode.AY,   3, 5, Attr.WRITE          ), // 0x99
  new Op("TXS", Instruction.TXS, Mode.IMPL, 1, 2, 0                   ), // 0x9A
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x9B
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x9C
  new Op("STA", Instruction.STA, Mode.AX,   3, 5, Attr.WRITE          ), // 0x9D
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x9E
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0x9F
  new Op("LDY", Instruction.LDY, Mode.IMM,  2, 2, Attr.READ           ), // 0xA0
  new Op("LDA", Instruction.LDA, Mode.IX,   2, 6, Attr.READ           ), // 0xA1
  new Op("LDX", Instruction.LDX, Mode.IMM,  2, 2, Attr.READ           ), // 0xA2
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xA3
  new Op("LDY", Instruction.LDY, Mode.ZABS, 2, 3, Attr.READ           ), // 0xA4
  new Op("LDA", Instruction.LDA, Mode.ZABS, 2, 3, Attr.READ           ), // 0xA5
  new Op("LDX", Instruction.LDX, Mode.ZABS, 2, 3, Attr.READ           ), // 0xA6
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xA7
  new Op("TAY", Instruction.TAY, Mode.IMPL, 1, 2, 0                   ), // 0xA8
  new Op("LDA", Instruction.LDA, Mode.IMM,  2, 2, Attr.READ           ), // 0xA9
  new Op("TAX", Instruction.TAX, Mode.IMPL, 1, 2, 0                   ), // 0xAA
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xAB
  new Op("LDY", Instruction.LDY, Mode.ABS,  3, 4, Attr.READ           ), // 0xAC
  new Op("LDA", Instruction.LDA, Mode.ABS,  3, 4, Attr.READ           ), // 0xAD
  new Op("LDX", Instruction.LDX, Mode.ABS,  3, 4, Attr.READ           ), // 0xAE
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xAF
  new Op("BCS", Instruction.BCS, Mode.ABS,  2, 2, Attr.REL            ), // 0xB0
  new Op("LDA", Instruction.LDA, Mode.IY,   2, 5, Attr.READ           ), // 0xB1
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xB2
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xB3
  new Op("LDY", Instruction.LDY, Mode.ZAX,  2, 4, Attr.READ           ), // 0xB4
  new Op("LDA", Instruction.LDA, Mode.ZAX,  2, 4, Attr.READ           ), // 0xB5
  new Op("LDX", Instruction.LDX, Mode.ZAY,  2, 4, Attr.READ           ), // 0xB6
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xB7
  new Op("CLV", Instruction.CLV, Mode.IMPL, 1, 2, 0                   ), // 0xB8
  new Op("LDA", Instruction.LDA, Mode.AY,   3, 4, Attr.READ           ), // 0xB9
  new Op("TSX", Instruction.TSX, Mode.IMPL, 1, 2, 0                   ), // 0xBA
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xBB
  new Op("LDY", Instruction.LDY, Mode.AX,   3, 4, Attr.READ           ), // 0xBC
  new Op("LDA", Instruction.LDA, Mode.AX,   3, 4, Attr.READ           ), // 0xBD
  new Op("LDX", Instruction.LDX, Mode.AY,   3, 4, Attr.READ           ), // 0xBE
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xBF
  new Op("CPY", Instruction.CPY, Mode.IMM,  2, 2, 0                   ), // 0xC0
  new Op("CMP", Instruction.CMP, Mode.IX,   2, 6, Attr.READ           ), // 0xC1
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xC2
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xC3
  new Op("CPY", Instruction.CPY, Mode.ZABS, 2, 3, Attr.READ           ), // 0xC4
  new Op("CMP", Instruction.CMP, Mode.ZABS, 2, 3, Attr.READ           ), // 0xC5
  new Op("DEC", Instruction.DEC, Mode.ZABS, 2, 5, Attr.READ|Attr.WRITE), // 0xC6
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xC7
  new Op("INY", Instruction.INY, Mode.IMPL, 1, 2, 0                   ), // 0xC8
  new Op("CMP", Instruction.CMP, Mode.IMM,  2, 2, 0                   ), // 0xC9
  new Op("DEX", Instruction.DEX, Mode.IMPL, 1, 2, 0                   ), // 0xCA
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xCB
  new Op("CPY", Instruction.CPY, Mode.ABS,  3, 4, Attr.READ           ), // 0xCC
  new Op("CMP", Instruction.CMP, Mode.ABS,  3, 4, Attr.READ           ), // 0xCD
  new Op("DEC", Instruction.DEC, Mode.ABS,  3, 6, Attr.READ|Attr.WRITE), // 0xCE
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xCF
  new Op("BNE", Instruction.BNE, Mode.ABS,  2, 2, Attr.REL            ), // 0xD0
  new Op("CMP", Instruction.CMP, Mode.IY,   2, 5, Attr.READ           ), // 0xD1
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xD2
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xD3
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xD4
  new Op("CMP", Instruction.CMP, Mode.ZAX,  2, 4, Attr.READ           ), // 0xD5
  new Op("DEC", Instruction.DEC, Mode.ZAX,  2, 6, Attr.READ|Attr.WRITE), // 0xD6
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xD7
  new Op("CLD", Instruction.CLD, Mode.IMPL, 1, 2, 0                   ), // 0xD8
  new Op("CMP", Instruction.CMP, Mode.AY,   3, 4, Attr.READ           ), // 0xD9
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xDA
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xDB
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xDC
  new Op("CMP", Instruction.CMP, Mode.AX,   3, 4, Attr.READ           ), // 0xDD
  new Op("DEC", Instruction.DEC, Mode.AX,   3, 7, Attr.READ|Attr.WRITE), // 0xDE
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xDF
  new Op("CPX", Instruction.CPX, Mode.IMM,  2, 2, 0                   ), // 0xE0
  new Op("SBC", Instruction.SBC, Mode.IX,   2, 6, Attr.READ           ), // 0xE1
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xE2
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xE3
  new Op("CPX", Instruction.CPX, Mode.ZABS, 2, 3, Attr.READ           ), // 0xE4
  new Op("SBC", Instruction.SBC, Mode.ZABS, 2, 3, Attr.READ           ), // 0xE5
  new Op("INC", Instruction.INC, Mode.ZABS, 2, 5, Attr.READ|Attr.WRITE), // 0xE6
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xE7
  new Op("INX", Instruction.INX, Mode.IMPL, 1, 2, 0                   ), // 0xE8
  new Op("SBC", Instruction.SBC, Mode.IMM,  2, 2, 0                   ), // 0xE9
  new Op("NOP", Instruction.NOP, Mode.IMPL, 1, 2, 0                   ), // 0xEA
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xEB
  new Op("CPX", Instruction.CPX, Mode.ABS,  3, 4, Attr.READ           ), // 0xEC
  new Op("SBC", Instruction.SBC, Mode.ABS,  3, 4, Attr.READ           ), // 0xED
  new Op("INC", Instruction.INC, Mode.ABS,  3, 6, Attr.READ|Attr.WRITE), // 0xEE
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xEF
  new Op("BEQ", Instruction.BEQ, Mode.ABS,  2, 2, Attr.REL            ), // 0xF0
  new Op("SBC", Instruction.SBC, Mode.IY,   2, 5, Attr.READ           ), // 0xF1
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xF2
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xF3
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xF4
  new Op("SBC", Instruction.SBC, Mode.ZAX,  2, 4, Attr.READ           ), // 0xF5
  new Op("INC", Instruction.INC, Mode.ZAX,  2, 6, Attr.READ|Attr.WRITE), // 0xF6
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xF7
  new Op("SED", Instruction.SED, Mode.IMPL, 1, 2, 0                   ), // 0xF8
  new Op("SBC", Instruction.SBC, Mode.AY,   3, 4, Attr.READ           ), // 0xF9
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xFA
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xFB
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xFC
  new Op("SBC", Instruction.SBC, Mode.AX,   3, 4, Attr.READ           ), // 0xFD
  new Op("INC", Instruction.INC, Mode.AX,   3, 7, Attr.READ|Attr.WRITE), // 0xFE
  new Op("---", Instruction.Bad, Mode.Bad,  1, 0, 0                   ), // 0xFF
];
