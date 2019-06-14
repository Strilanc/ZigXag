import {SimulatorSpec} from "src/sim/SimulatorSpec.js";
import {Seq} from "src/base/Seq.js";


class LoggedSimulator extends SimulatorSpec {
    /**
     * @param {!SimulatorSpec} sub
     */
    constructor(sub) {
        super();
        this.qasm_log = [];
        this.quirk_init = [];
        this.quirk_log = [];
        this.sub = sub;
    }

    qalloc() {
        return this.sub.qalloc();
    }

    free(q) {
        return this.sub.free(q);
    }

    cnot(control, target) {
        this.qasm_log.push(`cx q[${control}], q[${target}];`);
        let col = Seq.repeat(1, Math.max(control, target) + 1).toArray();
        col[control] = '•';
        col[target] = 'X';
        this.quirk_log.push(col);
        return this.sub.cnot(control, target);
    }

    hadamard(target) {
        this.qasm_log.push(`h q[${target}];`);
        let col = Seq.repeat(1, target).toArray();
        col.push('H');
        this.quirk_log.push(col);
        return this.sub.hadamard(target);
    }

    phase(target) {
        this.qasm_log.push(`s q[${target}];`);
        let col = Seq.repeat(1, target).toArray();
        col.push('Z^½');
        this.quirk_log.push(col);
        return this.sub.phase(target);
    }

    probability(target) {
        return this.sub.probability(target);
    }

    collapse(target, outcome) {
        this.qasm_log.push(`measure q[${target}] -> c[${target}]`);
        let col = Seq.repeat(1, target).toArray();
        col.push('Measure');
        this.quirk_log.push(col);
        return this.sub.collapse(target, outcome);
    }
}

export {LoggedSimulator}
