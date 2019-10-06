import {DetailedError} from "src/base/DetailedError.js"
import {SimulatorSpec} from "src/sim/SimulatorSpec.js";
import {BitTable} from "src/sim/BitTable.js";
import {Measurement} from "src/sim/Measurement.js";
import {Module} from "src/sim/chp_wasm_gen.js";

/**
 * Activate Emscripten. E.g. on windows from emsdk cloned repo directory:
 *
 *     emsdk activate latest
 *     emsdk_env.bst
 *
 * Compile with Emscripten:
 *
 *      emcc -O1 --bind chp.cpp -std=c++11 -o chp_gen.js -s WASM=0
 *
 *      Note: using -O2 causes a "could not load memory initializer" error when running. Not sure why.
 *
 *  The build system automatically adds the `export {Module}` line.
 */


class ChpSimulator extends SimulatorSpec {
    /**
     * @param {!int} maxQubitCount
     * @param {!number} defaultBias
     * @param {!Module.QState} _state
     */
    constructor(maxQubitCount=10, defaultBias=0.5, _state=undefined) {
        super();
        this._state = _state !== undefined ? _state : new Module.QState(maxQubitCount);
        this._maxQubitCount = maxQubitCount;
        this._nextQubitId = 0;
        this._qubitToSlotMap = new Map();
        this._qubitSlots = [];
        this._defaultBias = defaultBias;
    }

    /**
     * @returns {!ChpSimulator}
     */
    clone() {
        let result = new ChpSimulator(this._maxQubitCount, this._defaultBias, new Module.QState(this._state, 0));
        result._nextQubitId = this._nextQubitId;
        for (let [k, v] of this._qubitToSlotMap.entries()) {
            result._qubitToSlotMap.set(k, v);
        }
        result._qubitSlots = this._qubitSlots.slice();
        return result;
    }

    qalloc() {
        if (this._qubitSlots.length >= this._maxQubitCount) {
            throw new Error("Too many qubits");
        }
        let id = this._nextQubitId;
        this._nextQubitId += 1;
        this._qubitToSlotMap.set(id, this._qubitSlots.length);
        this._qubitSlots.push(id);
        return id;
    }

    /**
     * Measures a qubit.
     * @param {!int} q The handle of the qubit to measure.
     * @param {!number|undefined=} bias When a measurement result is non-deterministic, this determines the probability of True.
     * @returns {!Measurement} The measurement result.
     */
    measure(q, bias=undefined) {
        if (bias === undefined) {
            bias = this._defaultBias;
        }
        let randomResult = Math.random() < bias;
        let a = this._slotFor(q);
        let m = Module.measure(this._state, a, 0, randomResult);
        return new Measurement((m & 1) !== 0, (m & 2) !== 0);
    }

    free(q) {
        // Decohere the qubit.
        if (this.measure(q).result) {
            this.x(q);
        }

        // Move qubit to deallocate to the end of the list, then pop it off.
        let k = this._slotFor(q);
        let q2 = this._qubitSlots[this._qubitSlots.length - 1];
        this.swap(q, q2);
        this._qubitToSlotMap.set(q2, k);
        this._qubitSlots[k] = q2;
        this._qubitSlots.pop();
        this._qubitToSlotMap.delete(q);
    }

    cnot(control, target) {
        let a = this._slotFor(control);
        let b = this._slotFor(target);
        if (a === b) {
            throw new DetailedError('target and control are the same.', {target, control})
        }
        Module.cnot(this._state, a, b);
    }

    hadamard(target) {
        let a = this._slotFor(target);
        Module.hadamard(this._state, a);
    }

    phase(target) {
        let a = this._slotFor(target);
        Module.phase(this._state, a);
    }

    /**
     * @param {!int} q
     * @returns {!int}
     * @private
     */
    _slotFor(q) {
        if (!this._qubitToSlotMap.has(q)) {
            throw new Error(`Invalid qubit handle: ${q}`);
        }
        return this._qubitToSlotMap.get(q);
    }

    probability(target) {
        let tmp = new Module.QState(this._state, 0);
        try {
            let a = this._slotFor(target);
            let m = Module.measure(tmp, a, 0, false);
            if ((m & 2) !== 0) {
                return 0.5;
            }
            return m;
        } finally {
            tmp.delete();
        }
    }

    collapse(target, outcome) {
        let a = this._slotFor(target);
        let m = Module.measure(this._state, a, 0, outcome);
        let result = (m & 1) !== 0;
        if (result !== outcome) {
            throw new DetailedError("Failed to post-select; result impossible.", {target, m, result, outcome});
        }
    }

    /**
     * @returns {!BitTable}
     */
    table() {
        let n = this._maxQubitCount;
        let out = BitTable.zeros(2*n+1, 2*n);
        for (let row = 0; row < 2*n; row++) {
            for (let col = 0; col < n; col++) {
                out.set(row, col, Module.peek_state_x(this._state, row, col));
            }
            for (let col = 0; col < n; col++) {
                out.set(row, col + n, Module.peek_state_z(this._state, row, col));
            }
            out.set(row, 2 * n, Module.peek_state_r(this._state, row));
        }
        return out;
    }

    destruct() {
        this._state.delete();
        this._state = undefined;
    }

    /**
     * @returns {!string}
     */
    toString() {
        let n = this._maxQubitCount;

        let _cell = (row, col) => {
            let k = Module.peek_state_x(this._state, row, col) + 2 * Module.peek_state_z(this._state, row, col);
            return ['.', 'X', 'Z', 'Y'][k]
        };

        let _row = row => {
            let result = Module.peek_state_r(this._state, row) ? '-' : '+';
            for (let col = 0; col < n; col++) {
                result += _cell(row, col)
            }
            return result;
        };

        let out = [];
        for (let row = 0; row < n; row++) {
            out.push(_row(row));
        }
        out.push('-'.repeat(n + 1));
        for (let row = 0; row < n; row++) {
            out.push(_row(row + n));
        }
        return out.join('\n');
    }
}

export {ChpSimulator}
