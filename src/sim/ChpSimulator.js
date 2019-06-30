import {DetailedError} from "src/base/DetailedError.js"
import {SimulatorSpec} from "src/sim/SimulatorSpec.js";
import {BitTable} from "src/sim/BitTable.js";
import {
    QState,
    init_state,
    free_state,
    cnot,
    hadamard,
    phase,
    clone_state,
    measure,
    peek_state_x,
    peek_state_z,
    peek_state_r,
} from "src/sim/chp_gen.js"
/**
 How to produce chp_gen.js

 0) Go to https://www.scottaaronson.com/chp/ and download "chp.c" as a starting point

 1) Rename chp.c to chp.cpp

 2) Delete unused functions and types that cause trouble.

        delete error
        delete main
        delete readprog
        delete runprog
        delete QProg struct
        delete unused gate macro defs
        delete preparestate
        delete printstate
        delete printbasisstate
        delete printket
        drop s parameter of initstae_ and delete the line that was using it

 3) Every line with a malloc needs a static_cast to the correct type.

 4) Emscripten is confused by pointer args. Use references instead of pointers.
        search-replace "struct QState *" with "struct QState &"
        search-replace "q->" with "q."

 5) Replace includes with:

        #include <cstring>
        #include <cstdlib>

 6) Append this code to the end of the file:

        void free_state(struct QState &q) {
            for (long i = 0; i < 2 * q.n + 1; i++) {
                free(q.x[i]);
                free(q.z[i]);
            }
            free(q.x);
            free(q.z);
            free(q.r);
        }

        QState clone_state(const struct QState &src) {
            QState q = {};
            q.n = src.n;
            q.over32 = src.over32;
            memcpy(q.pw, src.pw, sizeof(q.pw));

            int s = 2 * q.n + 1;
            q.r = static_cast<int *>(malloc(s * sizeof(int)));
            memcpy(q.r, src.r, s * sizeof(int));

            q.x = static_cast<unsigned long **>(malloc(s * sizeof(unsigned long *)));
            q.z = static_cast<unsigned long **>(malloc(s * sizeof(unsigned long *)));
            for (int i = 0; i < s; i++) {
                q.x[i] = static_cast<unsigned long *>(malloc(q.over32 * sizeof(unsigned long)));
                q.z[i] = static_cast<unsigned long *>(malloc(q.over32 * sizeof(unsigned long)));
                memcpy(q.x[i], src.x[i], q.over32 * sizeof(unsigned long));
                memcpy(q.z[i], src.z[i], q.over32 * sizeof(unsigned long));
            }
            return q;
        }

         char peek_state_x(const struct QState &src, int row, int col) {
            int c = col >> 5;
            int m = 1 << (col & 31);
            return src.x[row][c] & m ? 1 : 0;
        }

         char peek_state_z(const struct QState &src, int row, int col) {
            int c = col >> 5;
            int m = 1 << (col & 31);
            return src.x[row][c] & m ? 1 : 0;
        }

         char peek_state_r(const struct QState &src, int row) {
            return src.r[row] ? 1 : 0;
        }

        #include <emscripten/bind.h>
        using namespace emscripten;
        EMSCRIPTEN_BINDINGS(my_module) {
            class_<QState>("QState").constructor<>();
            function("init_state", &initstae_);
            function("cnot", &cnot);
            function("hadamard", &hadamard);
            function("phase", &phase);
            function("measure", &measure);
            function("free_state", &free_state);
            function("clone_state", &clone_state);
            function("peek_state_x", &peek_state_x);
            function("peek_state_z", &peek_state_z);
            function("peek_state_r", &peek_state_r);
        }

    7) Add bool random_result parameter to measure

        search-replace "rand()%2" with "random_result ? 1 : 0"

    8) Compile with Emscripten

        emcc -O1 --bind chp.cpp -std=c++11 -o chp_gen.js -s WASM=0

        Note: using -O2 causes a "could not load memory initializer" error when running. Not sure why.

    9) Append export lines to generated code

         let QState = Module.QState;
         let init_state = Module.init_state;
         let free_state = Module.free_state;
         let cnot = Module.cnot;
         let hadamard = Module.hadamard;
         let phase = Module.phase;
         let measure = Module.measure;
         let clone_state = Module.clone_state;
         let peek_state_x = Module.peek_state_x;
         let peek_state_z = Module.peek_state_z;
         let peek_state_r = Module.peek_state_r;
         export {QState, init_state, free_state, cnot, hadamard, phase, clone_state, measure, peek_state_x, peek_state_z, peek_state_r}
*/


class ChpSimulator extends SimulatorSpec {
    /**
     * @param {!int} maxQubitCount
     */
    constructor(maxQubitCount=10) {
        super();
        this._state = new QState();
        init_state(this._state, maxQubitCount);
        this._maxQubitCount = maxQubitCount;
        this._nextQubitId = 0;
        this._qubitToSlotMap = new Map();
        this._qubitSlots = [];
    }

    /**
     * @returns {!ChpSimulator}
     */
    clone() {
        let result = new ChpSimulator(this._maxQubitCount);
        result.destruct();
        result._state = clone_state(this._state);
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
     * @returns {!boolean} The measurement result.
     */
    measure(q, bias=undefined) {
        if (bias === undefined) {
            bias = 0.5;
        }
        let randomResult = Math.random() < bias;
        let a = this._slotFor(q);
        let m = measure(this._state, a, 0, randomResult);
        return (m & 1) !== 0;
    }

    free(q) {
        // Decohere the qubit.
        if (this.measure(q)) {
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
        cnot(this._state, a, b);
    }

    hadamard(target) {
        let a = this._slotFor(target);
        hadamard(this._state, a);
    }

    phase(target) {
        let a = this._slotFor(target);
        phase(this._state, a);
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
        let q = clone_state(this._state);
        let a = this._slotFor(target);
        let m = measure(q, a, 0, false);
        free_state(q);
        if ((m & 2) !== 0) {
            return 0.5;
        }
        return m;
    }

    collapse(target, outcome) {
        let a = this._slotFor(target);
        let m = measure(this._state, a, 0, outcome);
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
                out.set(row, col, peek_state_x(this._state, row, col));
            }
            for (let col = 0; col < n; col++) {
                out.set(row, col + n, peek_state_z(this._state, row, col));
            }
            out.set(row, 2 * n, peek_state_r(this._state, row));
        }
        return out;
    }

    destruct() {
        free_state(this._state);
        this._state = undefined;
    }

    /**
     * @returns {!string}
     */
    toString() {
        let n = this._maxQubitCount;

        let _cell = (row, col) => {
            let k = peek_state_x(this._state, row, col) + 2 * peek_state_z(this._state, row, col);
            return ['.', 'X', 'Z', 'Y'][k]
        };

        let _row = row => {
            let result = peek_state_r(this._state, row) ? '-' : '+';
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
