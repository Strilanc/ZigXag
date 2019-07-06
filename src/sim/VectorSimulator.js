import {DetailedError} from "src/base/DetailedError.js"
import {Format, UNICODE_FRACTIONS} from "src/base/Format.js"
import {Util} from "src/base/Util.js"
import {Matrix} from "src/base/Matrix.js"
import {Complex} from "src/base/Complex.js"
import {Controls} from "src/sim/Controls.js";
import {SimulatorSpec} from "src/sim/SimulatorSpec.js";

class VectorSimulator extends SimulatorSpec {
    constructor() {
        super();
        this._state = Matrix.solo(1);
        this._nextQubitId = 0;
        this._qubitToSlotMap = new Map();
        this._qubitSlots = [];
    }

    qalloc() {
        let src = this._state.rawBuffer();
        let n = src.length;
        let state = new Float64Array(n << 1);
        for (let i = 0; i < n; i++) {
            state[i] = src[i];
        }
        let id = this._nextQubitId;
        this._nextQubitId += 1;
        this._qubitToSlotMap.set(id, this._qubitSlots.length);
        this._qubitSlots.push(id);
        this._state = new Matrix(1, n, state);
        return id;
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

        // Drop empty final half of state vector.
        let raw = this._state.rawBuffer();
        let n = raw.length >> 1;
        let state = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            state[i] = raw[i];
        }
        this._state = new Matrix(1, n >> 1, state);
    }

    /**
     * @param {!Matrix} mat
     * @param {!int} target
     * @param {undefined|!int} control
     */
    op(mat, target, control=undefined) {
        let k = this._slotFor(target);
        let kc = control === undefined ? undefined : this._slotFor(control);
        if (k === kc) {
            throw new DetailedError('target and control are the same.', {target, control})
        }
        let controls = kc === undefined ? Controls.NONE : Controls.bit(kc, true);
        this._state = mat.applyToStateVectorAtQubitWithControls(this._state, k, controls);
    }

    phase(q) {
        this.op(Matrix.square(1, 0, 0, Complex.I), q)
    }

    hadamard(q) {
        this.op(Matrix.HADAMARD, q)
    }

    x(a) {
        this.op(Matrix.PAULI_X, a)
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

    probability(q) {
        let k = this._slotFor(q);
        let m = 2 << k;
        let raw = this._state.rawBuffer();
        let n = raw.length;
        let t = 0;
        for (let i = 0; i < n; i++) {
            if ((i & m) !== 0) {
                t += raw[i] * raw[i];
            }
        }
        return t;
    }

    collapse(q, outcome) {
        if (outcome) {
            this.x(q);
        }
        let d = Math.sqrt(1 - this.probability(q));
        let k = this._slotFor(q);
        let m = 2 << k;
        let buf = this._state.rawBuffer();
        let n = buf.length;
        for (let i = 0; i < n; i++) {
            if ((i & m) !== 0) {
                buf[i] = 0;
            } else {
                buf[i] /= d;
            }
        }
        if (outcome) {
            this.x(q);
        }
    }

    cnot(control, target) {
        this.op(Matrix.PAULI_X, target, control)
    }

    toString() {
        return `VectorSimulator(${this._qubitSlots.length} qubits)`;
    }
}

export {VectorSimulator}
