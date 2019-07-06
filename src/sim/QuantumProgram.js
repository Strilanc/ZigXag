import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {seq, Seq} from "src/base/Seq.js";
import {SimulatorSpec} from "src/sim/SimulatorSpec.js"
import {equate} from "src/base/Equate.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {VectorSimulator} from "src/sim/VectorSimulator.js"
import {Measurement} from "src/sim/Measurement.js"
import {Complex} from "src/base/Complex.js"
import {Matrix} from "src/base/Matrix.js"
import {ZxPort, ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js"
import {BitTable} from "src/sim/BitTable.js"
import {QubitAxis,PauliProduct} from "src/sim/PauliProduct.js"
import {popcnt} from "src/base/Util.js";
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js";


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
        for (let [q, _] of this.qubitPairs) {
            statements.push(`h q[${q}];`);
        }
        for (let [q1, q2] of this.qubitPairs) {
            statements.push(`cx q[${q1}], q[${q2}];`);
        }
    }

    writeQuirk(init, cols) {
        for (let [q, _] of this.qubitPairs) {
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
        for (let [q, _] of this.qubitPairs) {
            sim.hadamard(q);
        }

        for (let [q1, q2] of this.qubitPairs) {
            sim.cnot(q1, q2);
        }
    }
}

class MultiCnot extends QuantumStatement {
    /**
     * @param {!int} control
     * @param {!Array.<!int>} targets
     * @param {!boolean} axis The control qubit's interaction axis, and the inverse axis of the target qubits.
     *     When axis is true does CNOTs, when axis is false does NOTCs.
     */
    constructor(control, targets, axis) {
        super();
        this.control = control;
        this.targets = targets;
        this.axis = axis;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof MultiCnot &&
            this.control === other.control &&
            this.axis === other.axis &&
            equate(this.targets, other.targets));
    }

    writeQasm(statements) {
        for (let target of this.targets) {
            if (this.axis) {
                statements.push(`cx q[${this.control}], q[${target}];`);
            } else {
                statements.push(`cx q[${target}], q[${this.control}];`);
            }
        }
    }

    writeQuirk(init, cols) {
        if (this.targets.length === 0) {
            return;
        }

        let controlType = this.axis ? '•' : '⊖';
        let targetType = this.axis ? 'X' : 'Z';

        let col = [];
        padSetTo(col, 1, this.control, controlType);
        for (let target of this.targets) {
            padSetTo(col, 1, target, targetType);
        }
        cols.push(col);
    }

    interpret(sim, out) {
        for (let target of this.targets) {
            if (this.axis) {
                sim.cnot(this.control, target);
            } else {
                sim.cnot(target, this.control);
            }
        }
    }
}

class SingleQubitGates extends QuantumStatement {
    /**
     * @param {!GeneralMap.<!int, !string>|Map.<!int, !string>} changes Qubit to gate mapping.
     *      Allowed gate strings are: h, x, z, s, f
     */
    constructor(changes) {
        super();
        this.changes = changes;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof SingleQubitGates && equate(this.changes, other.changes);
    }

    writeQasm(statements) {
        let rewrites = {
            'h': ['h'],
            'x': ['x'],
            'z': ['z'],
            's': ['s'],
            'f': ['h', 's', 'h'],
        };
        for (let [qubit, gate] of this.changes.entries()) {
            let ops = rewrites[gate];
            if (ops === undefined) {
                throw new Error(`Unrecognized gate: ${gate}`);
            }
            for (let op of ops) {
                statements.push(`${op} q[${qubit}];`);
            }
        }
    }

    writeQuirk(init, cols) {
        let rewrites = {
            'h': 'H',
            'x': 'X',
            'z': 'Z',
            's': 'Z^½',
            'f': 'X^½',
        };
        let col = [];
        for (let [qubit, gate] of this.changes.entries()) {
            let quirkGate = rewrites[gate];
            if (quirkGate === undefined) {
                throw new Error(`Unrecognized gate: ${gate}`);
            }
            padSetTo(col, 1, qubit, quirkGate);
        }
        cols.push(col);
    }

    interpret(sim, out) {
        for (let [qubit, gate] of this.changes.entries()) {
            if (gate === 'h') {
                sim.hadamard(qubit);
            } else if (gate === 'x') {
                sim.hadamard(qubit);
                sim.phase(qubit);
                sim.phase(qubit);
                sim.hadamard(qubit);
            } else if (gate === 'z') {
                sim.phase(qubit);
                sim.phase(qubit);
            } else if (gate === 's') {
                sim.phase(qubit);
            } else if (gate === 'f') {
                sim.hadamard(qubit);
                sim.phase(qubit);
                sim.hadamard(qubit);
            } else {
                throw new Error(`Unrecognized gate: ${gate}`);
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
     * @param {!GeneralMap.<!int, !boolean>} qubitAxes
     */
    constructor(qubitAxes) {
        super();
        this.qubitAxes = qubitAxes;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof PostSelection &&
            equate(this.qubitAxes, other.qubitAxes));
    }

    writeQasm(statements) {
        statements.push('');
        statements.push('// Post-selected measurements that must return 0.');
        statements.push(...seq(this.qubitAxes.entries()).
            filter(e => !e[1]).
            map(e => e[0]).
            sorted().
            map(q => `h q[${q}];`));
        statements.push(...seq(this.qubitAxes.keys()).
            sorted().
            mapWithIndex((q, i) => `measure q[${q}] -> post[${i}];`));
    }

    writeQuirk(init, cols) {
        let col = [];
        for (let [qubit, axis] of this.qubitAxes.entries()) {
            padSetTo(col, 1, qubit, axis ? '|0⟩⟨0|' : '|+⟩⟨+|');
        }
        cols.push(col);
    }

    interpret(sim, out) {
        for (let [qubit, axis] of this.qubitAxes.entries()) {
            if (!axis) {
                sim.hadamard(qubit);
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
    SingleQubitGates,
    MeasurementsWithPauliFeedback,
    Comment,
    HeaderAlloc,
    inverseMultiMap,
    scatter,
    padSetTo,
    MultiCnot,
    AmpsDisplay,
    PostSelection,
}
