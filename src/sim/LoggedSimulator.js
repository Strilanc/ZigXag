import {SimulatorSpec} from "src/sim/SimulatorSpec.js";
import {Seq} from "src/base/Seq.js";


class LoggedSimulation {
    /**
     * @param {!SimulatorSpec} sim
     */
    constructor(sim) {
        this.qasm_logger = new QasmLog();
        this.quirk_logger = new QuirkLog();
        this.sim = sim;
    }

    /**
     * @param {!int|!Array.<!int>} targets One target or an array of targets.
     */
    initPlus(targets) {
        if (!Array.isArray(targets)) {
            targets = [targets];
        }
        this.quirk_logger.init(targets, '+');
        this.qasm_logger.hadamard(targets);
        for (let target of targets) {
            this.sim.hadamard(target);
        }
    }

    /**
     * Classically controlled Pauli operations.
     * @param {!Array.<!int>} parityControls
     * @param {!Set.<!int>} activeMeasurements
     * @param {!QubitAxis} pauli
     */
    feedback(parityControls, activeMeasurements, pauli) {
        if (parityControls.length === 0) {
            return;
        }
        this._sim_feedback(parityControls, activeMeasurements, pauli);
        this.qasm_logger.feedback(parityControls, pauli);
        this.quirk_logger.cnot(pauli.qubit, parityControls, !pauli.axis, true);
    }

    /**
     * @param {!Array.<!int>} parityControls
     * @param {!Set.<!int>} activeMeasurements
     * @param {!QubitAxis} pauli
     */
    _sim_feedback(parityControls, activeMeasurements, pauli) {
        let parity = 0;
        for (let c of parityControls) {
            if (activeMeasurements.has(c)) {
                parity ^= 1;
            }
        }

        if (parity !== 0) {
            if (pauli.axis) {
                this.sim.hadamard(pauli.qubit);
            }
            this.sim.phase(pauli.qubit);
            this.sim.phase(pauli.qubit);
            if (pauli.axis) {
                this.sim.hadamard(pauli.qubit);
            }
        }
    }

    /**
     * @param {!Array.<![!int, !string]>} changes
     */
    basisChange(changes) {
        if (changes.length === 0) {
            return;
        }
        this.quirk_logger.basisChange(changes);
        this.qasm_logger.basisChange(changes);
        for (let [target, basis] of changes) {
            if (basis === 'h') {
                this.sim.hadamard(target);
            } else if (basis === 'x') {
                this.sim.hadamard(target);
                this.sim.phase(target);
                this.sim.phase(target);
                this.sim.hadamard(target);
            } else if (basis === 'z') {
                this.sim.phase(target);
                this.sim.phase(target);
            } else if (basis === 's') {
                this.sim.phase(target);
            } else if (basis === 'f') {
                this.sim.hadamard(target);
                this.sim.phase(target);
                this.sim.hadamard(target);
            } else {
                throw new Error(`Unrecognized basis change: ${basis}`);
            }
        }
    }

    /**
     * @param {!int|!Array.<!int>} targets
     */
    hadamard(targets) {
        if (!Array.isArray(targets)) {
            targets = [targets];
        }
        if (targets.length === 0) {
            return;
        }
        this.quirk_logger.hadamard(targets);
        this.qasm_logger.hadamard(targets);
        for (let target of targets) {
            this.sim.hadamard(target);
        }
    }

    /**
     * @param {!int|!Array.<!int>} targets
     */
    phase(targets) {
        if (!Array.isArray(targets)) {
            targets = [targets];
        }
        if (targets.length === 0) {
            return;
        }
        this.quirk_logger.phase(targets);
        this.qasm_logger.phase(targets);
        for (let target of targets) {
            this.sim.phase(target);
        }
    }

    /**
     * @param {!int|!Array.<!int>} targets
     * @returns {!boolean|!Array.<!boolean>} The measurement results.
     */
    measure(targets) {
        this.quirk_logger.measure(targets);
        this.qasm_logger.measure(targets);
        if (!Array.isArray(targets)) {
            return this.sim.measure(targets);
        }
        return targets.map(e => this.sim.measure(e));
    }

    /**
     * Performs a single or multi target CNOT, CZ, CxNOT, or CxZ interaction.
     * @param {!int} control
     * @param {!int|!Array.<!int>} targets One target or an array of targets.
     * @param {!boolean=true} controlXz
     * @param {!boolean=false} targetXz
     */
    cnot(control, targets, controlXz=true, targetXz=false) {
        this.quirk_logger.cnot(control, targets, controlXz, targetXz);
        this.qasm_logger.cnot(control, targets, controlXz, targetXz);
        this._sim_cnot(control, targets, controlXz, targetXz);
    }

    _sim_cnot(control, targets, controlXz, targetXz) {
        if (!Array.isArray(targets)) {
            targets = [targets];
        }
        if (!controlXz) {
            this.sim.hadamard(control);
        }
        if (targetXz) {
            for (let target of targets) {
                this.sim.hadamard(target);
            }
        }
        for (let target of targets) {
            this.sim.cnot(control, target);
        }
        if (!controlXz) {
            this.sim.hadamard(control);
        }
        if (targetXz) {
            for (let target of targets) {
                this.sim.hadamard(target);
            }
        }
    }

}

class QasmLog {
    constructor() {
        this.lines = [];
    }

    /**
     * Performs a single or multi target CNOT, CZ, CxNOT, or CxZ interaction.
     * @param {!int} control
     * @param {!int|!Array.<!int>} targets One target or an array of targets.
     * @param {!boolean=true} controlXz
     * @param {!boolean=false} targetXz
     */
    cnot(control, targets, controlXz=true, targetXz=false) {
        if (!Array.isArray(targets)) {
            targets = [targets];
        }
        if (!controlXz && !targetXz) {
            this.hadamard([control]);
        }
        for (let target of targets) {
            if (controlXz && targetXz) {
                this.lines.push(`cz q[${control}], q[${target}];`);
            } else if (controlXz && !targetXz) {
                this.lines.push(`cx q[${control}], q[${target}];`);
            } else if (!controlXz && targetXz) {
                this.lines.push(`cx q[${target}], q[${control}];`);
            } else {
                this.lines.push(`cx q[${control}], q[${target}];`);
            }
        }
        if (!controlXz && !targetXz) {
            this.hadamard([control]);
        }
    }

    /**
     * @param {!Array.<![!int, !string]>} changes
     */
    basisChange(changes) {
        let rewrites = {
            'h': ['h'],
            'x': ['x'],
            'z': ['z'],
            's': ['s'],
            'f': ['h', 's', 'h'],
        };
        for (let [target, basis] of changes) {
            for (let op of rewrites[basis]) {
                this.lines.push(`${op} q[${target}];`);
            }
        }
    }

    /**
     * @param {!int|!Array.<!int>} parityControls
     * @param {!QubitAxis} pauli
     */
    feedback(parityControls, pauli) {
        if (!Array.isArray(parityControls)) {
            parityControls = [parityControls];
        }
        let condition = parityControls.map(e => `m[${e}]`).join(' ^ ');
        this.lines.push(`if (${condition}) {
    ${pauli.axis ? 'x' : 'z'} q[${pauli.qubit}];
}`);
    }

    /**
     * @param {!Array.<!int>} targets
     */
    hadamard(targets) {
        for (let target of targets) {
            this.lines.push(`h q[${target}];`);
        }
    }

    /**
     * @param {!int|!Array.<!int>} targets
     */
    phase(targets) {
        if (!Array.isArray(targets)) {
            targets = [targets];
        }
        for (let target of targets) {
            this.lines.push(`s q[${target}];`);
        }
    }

    /**
     * @param {!int|!Array.<!int>} targets
     */
    measure(targets) {
        if (!Array.isArray(targets)) {
            targets = [targets];
        }
        for (let target of targets) {
            this.lines.push(`measure q[${target}] -> c[${target}]`);
        }
    }
}

class QuirkLog {
    constructor() {
        this.inits = [];
        this.cols = [];
    }

    /**
     * @param {!Array.<!int>} targets One target or an array of targets.
     * @param {!string} state
     */
    init(targets, state) {
        for (let target of targets) {
            while (this.inits.length <= target) {
                this.inits.push(0);
            }
            this.inits[target] = state;
        }
    }

    /**
     * @returns {!string}
     */
    url() {
        return `https://algassert.com/quirk#circuit=${JSON.stringify({
            'cols': this.cols,
            'init': this.inits
        })}`;
    }

    /**
     * Appends a column to the log.
     * @param {![!int|!Array.<!int>, !string]} pairs
     */
    sparse(...pairs) {
        let col = [];
        for (let [keys, val] of pairs) {
            let targets = Array.isArray(keys) ? keys : [keys];
            for (let target of targets) {
                while (col.length <= target) {
                    col.push(1);
                }
                col[target] = val;
            }
        }
        this.cols.push(col)
    }

    /**
     * Performs a single or multi target CNOT, CZ, CxNOT, or CxZ interaction.
     * @param {!int} control
     * @param {!int|!Array.<!int>} targets One target or an array of targets.
     * @param {!boolean=true} controlXz
     * @param {!boolean=false} targetXz
     */
    cnot(control, targets, controlXz=true, targetXz=false) {
        if (!Array.isArray(targets)) {
            targets = [targets];
        }
        this.sparse(
            [control, controlXz ? '•' : '⊖'],
            ...targets.map(target => [target, targetXz ? 'Z' : 'X'])
        );
    }

    /**
     * @param {!Array.<![!int, !string]>} changes
     */
    basisChange(changes) {
        let rewrites = {
            'h': 'H',
            'x': 'X',
            'z': 'Z',
            's': 'Z^½',
            'f': 'X^½',
        };
        this.sparse(...changes.map(e => [e[0], rewrites[e[1]]]));
    }

    /**
     * @param {!Array.<!int>} targets
     */
    hadamard(targets) {
        this.sparse([targets, 'H']);
    }

    /**
     * @param {!int|!Array.<!int>} targets
     */
    phase(targets) {
        this.sparse([targets, 'Z^½']);
    }

    /**
     * @param {!int|!Array.<!int>} targets
     */
    measure(targets) {
        this.sparse([targets, 'Measure']);
    }
}

export {LoggedSimulation, QuirkLog, QasmLog}
