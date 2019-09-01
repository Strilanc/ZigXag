import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {seq, Seq} from "src/base/Seq.js";
import {SimulatorSpec} from "src/sim/SimulatorSpec.js"
import {equate} from "src/base/Equate.js"
import {QubitAxis} from "src/sim/PauliProduct.js"
import {PauliProduct} from "src/sim/PauliProduct.js";


/**
 * A quantum effect which can be simulated, translated into QASM, and translated into Quirk.
 */
class QuantumStatement {
    /**
     * @returns {!string}
     */
    qasm() {
        let out = [];
        this.writeQasm(out);
        return out.join('\n');
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `QuantumStatement(${this.constructor.name}) {\n    ${this.qasm().split('\n').join('\n    ')}\n}`;
    }

    /**
     * @returns {!string}
     */
    quirkUrl() {
        let init = [];
        let cols = [];
        this.writeQuirk(init, cols);
        let circuit = {cols};
        if (init.length > 0) {
            circuit.init = init;
        }
        return `https://algassert.com/quirk#circuit=${JSON.stringify(circuit)}`;
    }

    /**
     * @param {!Array.<!string>} statements The output array of statements to mutate.
     */
    writeQasm(statements) { }

    /**
     * @param {!Array.<undefined|!int|!string>} init The initial states array to mutate.
     * @param {!Array.<!Array.<!int|!string>>} cols The output columns array to mutate.
     */
    writeQuirk(init, cols) { }

    /**
     * @param {!SimulatorSpec} sim
     * @param {!{
     *     measurements: !Array.<[!int, !boolean]>,
     *     successProbability: !number,
     * }} out
     */
    interpret(sim, out) { }
}

class QuantumProgram extends QuantumStatement {
    /**
     * @param {!Array.<!QuantumStatement>} statements
     */
    constructor(statements = []) {
        super();
        this.statements = statements;
    }

    /**
     * @returns {!string}
     */
    toString() {
        let body = this.statements.map((e, i) => `// ${i+1}\n${e}\n`).join('\n');
        return `QuantumStatement(QuantumProgram) {\n    ${body.split('\n').join('\n    ')}\n}`;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof QuantumProgram && equate(this.statements, other.statements);
    }

    writeQuirk(init, cols) {
        for (let statement of this.statements) {
            statement.writeQuirk(init, cols);
        }
    }

    writeQasm(out) {
        for (let statement of this.statements) {
            statement.writeQasm(out);
        }
    }

    interpret(sim, out) {
        for (let statement of this.statements) {
            statement.interpret(sim, out);
        }
    }
}

class InitEprPairs extends QuantumStatement {
    /**
     * @param {[!int, !int]} qubitPairs
     */
    constructor(...qubitPairs) {
        super();
        this.qubitPairs = qubitPairs;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof InitEprPairs && equate(this.qubitPairs, other.qubitPairs);
    }

    writeQasm(statements) {
        for (let [q] of this.qubitPairs) {
            statements.push(`h q[${q}];`);
        }
        for (let [q1, q2] of this.qubitPairs) {
            statements.push(`cx q[${q1}], q[${q2}];`);
        }
    }

    writeQuirk(init, cols) {
        for (let [q] of this.qubitPairs) {
            while (init.length <= q) {
                init.push(0);
            }
            init[q] = '+';
        }

        for (let [q1, q2] of this.qubitPairs) {
            let col = [];
            padSetTo(col, 1, q1, '•');
            padSetTo(col, 1, q2, 'X');
            cols.push(col);
        }
    }

    interpret(sim, out) {
        for (let [q] of this.qubitPairs) {
            sim.hadamard(q);
        }

        for (let [q1, q2] of this.qubitPairs) {
            sim.cnot(q1, q2);
        }
    }
}

class InitPlusStates extends QuantumStatement {
    /**
     * @param {!int} qubits
     */
    constructor(...qubits) {
        super();
        this.qubits = qubits;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof InitPlusStates && equate(this.qubits, other.qubits);
    }

    writeQasm(statements) {
        for (let q of this.qubits) {
            statements.push(`h q[${q}];`);
        }
    }

    writeQuirk(init, cols) {
        for (let q of this.qubits) {
            while (init.length <= q) {
                init.push(0);
            }
            init[q] = '+';
        }
    }

    interpret(sim, out) {
        for (let q of this.qubits) {
            sim.hadamard(q);
        }
    }
}

class Hadamards extends QuantumStatement {
    /**
     * @param {!int} qubits
     */
    constructor(...qubits) {
        super();
        this.qubits = qubits;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof Hadamards && equate(this.qubits, other.qubits);
    }

    writeQasm(statements) {
        for (let q of this.qubits) {
            statements.push(`h q[${q}];`);
        }
    }

    writeQuirk(init, cols) {
        let col = [];
        for (let qubit of this.qubits) {
            padSetTo(col, 1, qubit, 'H');
        }
        cols.push(col);
    }

    interpret(sim, out) {
        for (let q of this.qubits) {
            sim.hadamard(q);
        }
    }
}

class MultiCnot extends QuantumStatement {
    /**
     * @param {!int} control
     * @param {!Array.<!int>} targets
     * @param {!boolean} controlAxis
     * @param {!boolean} targetAxis
     */
    constructor(control, targets, controlAxis, targetAxis) {
        super();
        this.control = control;
        this.targets = targets;
        this.controlAxis = controlAxis;
        this.targetAxis = targetAxis;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof MultiCnot &&
            this.control === other.control &&
            this.controlAxis === other.controlAxis &&
            this.targetAxis === other.targetAxis &&
            equate(this.targets, other.targets));
    }

    writeQasm(statements) {
        for (let target of this.targets) {
            if (this.controlAxis && this.targetAxis) {
                statements.push(`cz q[${this.control}], q[${target}];`);
            } else if (this.controlAxis && !this.targetAxis) {
                statements.push(`cx q[${this.control}], q[${target}];`);
            } else if (!this.controlAxis && this.targetAxis) {
                statements.push(`cx q[${target}], q[${this.control}];`);
            } else {
                statements.push(`h q[${this.control}];`);
                statements.push(`cx q[${this.control}], q[${target}];`);
                statements.push(`h q[${this.control}];`);
            }
        }
    }

    writeQuirk(init, cols) {
        if (this.targets.length === 0) {
            return;
        }

        let controlType = this.controlAxis ? '•' : '⊖';
        let targetType = this.targetAxis ? 'Z' : 'X';

        let col = [];
        padSetTo(col, 1, this.control, controlType);
        for (let target of this.targets) {
            padSetTo(col, 1, target, targetType);
        }
        cols.push(col);
    }

    interpret(sim, out) {
        for (let target of this.targets) {
            if (this.controlAxis && this.targetAxis) {
                sim.hadamard(target);
                sim.cnot(this.control, target);
                sim.hadamard(target);
            } else if (this.controlAxis && !this.targetAxis) {
                sim.cnot(this.control, target);
            } else if (!this.controlAxis && this.targetAxis) {
                sim.cnot(target, this.control);
            } else {
                sim.hadamard(this.control);
                sim.cnot(this.control, target);
                sim.hadamard(this.control);
            }
        }
    }
}

class HeaderAlloc extends QuantumStatement {
    /**
     * @param {!PortQubitMapping} portQubitMapping
     */
    constructor(portQubitMapping) {
        super();
        this.portQubitMapping = portQubitMapping;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof HeaderAlloc &&
            this.portQubitMapping.isEqualTo(other.portQubitMapping));
    }

    writeQasm(statements) {
        statements.push(
            'OPENQASM 2.0;',
            'include "qelib1.inc";',
            `qreg q[${this.portQubitMapping.numQubits}];`,
            ...Seq.range(this.portQubitMapping.numInternal).map(i => `creg m_${i}[1];`),
            ...(this.portQubitMapping.numPost === 0 ? [] : [`creg post[${this.portQubitMapping.numPost}]`]),
        );
    }

    writeQuirk(init, cols) {
    }

    interpret(sim, out) {
        for (let i = 0; i < this.portQubitMapping.numQubits; i++) {
            sim.qalloc();
        }
    }
}

class PostSelection extends QuantumStatement {
    /**
     * @param {!Map.<!int, !string>} qubitStabilizerMap
     */
    constructor(qubitStabilizerMap) {
        super();
        this.qubitStabilizerMap = qubitStabilizerMap;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof PostSelection &&
            equate(this.qubitStabilizerMap, other.qubitStabilizerMap));
    }

    writeQasm(statements) {
        statements.push('');
        statements.push('// Post-selected measurements that must return 0.');
        let i = 0;
        for (let [qubit, stabilizer] of this.qubitStabilizerMap.entries()) {
            if (stabilizer === '+X') {
                statements.push(`h q[${qubit}];`);
            } else if (stabilizer === '-X') {
                statements.push(
                    `z q[${qubit}];`,
                    `h q[${qubit}];`);
            } else if (stabilizer === '+Y') {
                statements.push(
                    `z q[${qubit}];`,
                    `s q[${qubit}];`,
                    `h q[${qubit}];`);
            } else if (stabilizer === '-Y') {
                statements.push(
                    `s q[${qubit}];`,
                    `h q[${qubit}];`);
            } else if (stabilizer === '-Z') {
                statements.push(`x q[${qubit}];`);
            } else if (stabilizer !== '+Z') {
                throw new Error(`Unrecognized post-selection stabilizer: ${stabilizer}`);
            }
            statements.push(`measure q[${qubit}] -> post[${i}];`);
            i += 1;
        }
    }

    writeQuirk(init, cols) {
        let col = [];
        let map = {
            '+Z': '|0⟩⟨0|',
            '-Z': '|1⟩⟨1|',
            '+X': '|+⟩⟨+|',
            '-X': '|-⟩⟨-|',
            '+Y': '|X⟩⟨X|',
            '-Y': '|/⟩⟨/|',
        };
        for (let [qubit, stabilizer] of this.qubitStabilizerMap.entries()) {
            let gate = map[stabilizer];
            if (gate === undefined) {
                throw new Error(`Unrecognized post-selection stabilizer: ${stabilizer}`);
            }
            padSetTo(col, 1, qubit, gate);
        }
        cols.push(col);
    }

    interpret(sim, out) {
        for (let [qubit, stabilizer] of this.qubitStabilizerMap.entries()) {
            if (stabilizer === '+X') {
                sim.hadamard(qubit);
            } else if (stabilizer === '-X') {
                sim.phase(qubit);
                sim.phase(qubit);
                sim.hadamard(qubit);
            } else if (stabilizer === '+Y') {
                sim.phase(qubit);
                sim.phase(qubit);
                sim.phase(qubit);
                sim.hadamard(qubit);
            } else if (stabilizer === '-Y') {
                sim.phase(qubit);
                sim.hadamard(qubit);
            } else if (stabilizer === '-Z') {
                sim.hadamard(qubit);
                sim.phase(qubit);
                sim.phase(qubit);
                sim.hadamard(qubit);
            } else if (stabilizer !== '+Z') {
                throw new Error(`Unrecognized post-selection stabilizer: ${stabilizer}`);
            }

            let measurement = sim.measure(qubit, 0.0);
            out.measurements.push([qubit, measurement.result]);
            if (measurement.random) {
                out.successProbability *= 0.5;
            }
            if (measurement.result) {
                out.successProbability = 0;
            }
        }
    }
}

class Comment extends QuantumStatement {
    /**
     * @param {!string} lines
     */
    constructor(...lines) {
        super();
        this.lines = lines;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof Comment && equate(this.lines, other.lines);
    }

    writeQasm(statements) {
        statements.push(...this.lines.map(line => line === '' ? '' : `// ${line}`));
    }

    writeQuirk(inits, cols) {
    }

    interpret(sim, out) {
    }
}

class MeasurementsWithPauliFeedback extends QuantumStatement {
    /**
     * @param {!GeneralMap.<!int, !Array.<!QubitAxis>>} measurementToEffectMap
     */
    constructor(measurementToEffectMap) {
        super();
        this.measurementToEffectMap = measurementToEffectMap;
        this._effectToControlsMap = /** @type {!GeneralMap.<!QubitAxis, !Array.<!int>>} */ inverseMultiMap(
            this.measurementToEffectMap);
        this._orderedEffects = [...this._effectToControlsMap.keys()];
        this._orderedEffects.sort((a, b) => a.orderVal() - b.orderVal());
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof MeasurementsWithPauliFeedback &&
            equate(this.measurementToEffectMap, other.measurementToEffectMap));
    }

    writeQasm(statements) {
        for (let q of this.measurementToEffectMap.keys()) {
            statements.push(`measure q[${q}] -> m_${q};`);
        }

        statements.push('');
        statements.push('// Adjust Pauli frame based on measurements.');
        let qubits = [...this.measurementToEffectMap.keys()];
        qubits.sort((a, b) => a - b);
        for (let qubit of qubits) {
            let effects = this.measurementToEffectMap.get(qubit);
            for (let effect of effects) {
                let op = `${effect.axis ? 'z' : 'x'} q[${effect.qubit}]`;
                statements.push(`if (m_${qubit} == 1) ${op};`);
            }
        }

        // BLOCKED TODO: use this cleaner output when QASM supports more general conditions.
        // for (let effect of this._orderedEffects) {
        //     let controls = this._effectToControlsMap.get(effect);
        //     let condition = controls.map(e => `m[${e}]`).join(' ^ ');
        //     let op = `${effect.axis ? 'z' : 'x'} q[${effect.qubit}]`;
        //     statements.push(`if (${condition}) {\n    ${op};\n}`);
        // }
    }

    writeQuirk(inits, cols) {
        let measureCol = [];
        for (let qubit of this.measurementToEffectMap.keys()) {
            padSetTo(measureCol, 1, qubit, 'Measure');
        }
        cols.push(measureCol);

        for (let effect of this._orderedEffects) {
            let controls = this._effectToControlsMap.get(effect);
            if (controls.length === 0) {
                continue;
            }
            let col = [];
            padSetTo(col, 1, effect.qubit, effect.axis ? '•' : '⊖');
            for (let control of controls) {
                padSetTo(col, 1, control, 'Z');
            }
            cols.push(col);
        }
    }

    interpret(sim, out) {
        let allEffects = new GeneralSet();

        let qubits = [...this.measurementToEffectMap.keys()];
        qubits.sort((a, b) => a - b);
        for (let qubit of qubits) {
            let effects = this.measurementToEffectMap.get(qubit);
            let measurement = sim.measure(qubit);

            out.measurements.push([qubit, measurement.result]);

            if (measurement.result) {
                for (let effect of effects) {
                    if (allEffects.has(effect)) {
                        allEffects.delete(effect);
                    } else {
                        allEffects.add(effect);
                    }
                }
            }
        }

        for (let effect of allEffects) {
            if (effect.axis) {
                sim.z(effect.qubit);
            } else {
                sim.x(effect.qubit);
            }
        }
    }
}

class AmpsDisplay extends QuantumStatement {
    /**
     * @param {!int} offset
     * @param {!int} len
     */
    constructor(offset, len) {
        super();
        this.offset = offset;
        this.len = len;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof AmpsDisplay && this.offset === other.offset && this.len === other.len;
    }

    writeQasm(statements) {
    }

    writeQuirk(inits, cols) {
        if (this.len > 0) {
            let col = [];
            padSetTo(col, 1, this.offset, `Amps${this.len}`);
            cols.push(col);
        }
    }

    interpret(sim, measurementsOut) {
    }
}

/**
 * @param {!GeneralMap.<TKey, !Array.<TVal>>} multiMap
 * @returns {!GeneralMap.<TVal, !Array.<TKey>>}
 * @template TKey, TVal
 */
function inverseMultiMap(multiMap) {
    let result = new GeneralMap();
    for (let [key, vals] of multiMap.entries()) {
        for (let val of vals) {
            if (!result.has(val)) {
                result.set(val, []);
            }
            result.get(val).push(key);
        }
    }
    return result;
}

/**
 * @param {!Array.<![!int, T]>} indexedItems
 * @param {T=undefined} defaultValue
 * @returns {!Array.<T>}
 * @template T
 */
function scatter(indexedItems, defaultValue=undefined) {
    let result = [];
    for (let [index, item] of indexedItems) {
        while (result.length <= index) {
            result.push(defaultValue);
        }
        result[index] = item;
    }
    return result;
}

/**
 * @param {!Array.<T>} items
 * @param {!int} index
 * @param {T} defaultValue
 * @param {T} item
 * @template T
 */
function padSetTo(items, defaultValue, index, item) {
    while (items.length <= index) {
        items.push(defaultValue);
    }
    items[index] = item;
}

export {
    QuantumStatement,
    QuantumProgram,
    InitEprPairs,
    MeasurementsWithPauliFeedback,
    Comment,
    HeaderAlloc,
    inverseMultiMap,
    scatter,
    padSetTo,
    MultiCnot,
    AmpsDisplay,
    PostSelection,
    InitPlusStates,
    Hadamards,
}
