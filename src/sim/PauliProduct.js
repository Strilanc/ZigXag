import {Complex} from "src/base/Complex.js";
import {Seq} from "src/base/Seq.js";


const _PAULI_NAMES = ['.', 'X', 'Z', 'Y'];


class QubitAxis {
    /**
     * @param {!int} qubit
     * @param {!boolean} axis
     */
    constructor(qubit, axis) {
        this.qubit = qubit;
        this.axis = axis;
    }

    /**
     * @param {!int} qubit
     * @returns {!QubitAxis}
     */
    static x(qubit) {
        return new QubitAxis(qubit, false);
    }

    /**
     * @param {!int} qubit
     * @returns {!QubitAxis}
     */
    static z(qubit) {
        return new QubitAxis(qubit, true);
    }

    /**
     * @param {object|!QubitAxis} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof QubitAxis && other.axis === this.axis && other.qubit === this.qubit;
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `${this.axis ? 'Z' : 'X'}${this.qubit}`;
    }
}


class PauliProduct {
    /**
     * @param {!int} phase_exponent
     * @param {!Uint8Array} paulis
     */
    constructor(phase_exponent, paulis) {
        this.phase_exponent = phase_exponent & 3;
        this.paulis = paulis;
    }

    /**
     * @param {!int} n
     * @param {!Array.<!QubitAxis>} qubitAxes
     */
    static fromSparseQubitAxes(n, qubitAxes) {
        let result = new PauliProduct(0, new Uint8Array(n));
        for (let qa of qubitAxes) {
            result.inline_times(qa);
        }
        return result;
    }

    /**
     * @param {!int} n
     * @param {!object.<!int, !string|!int>} indexToTypeMap
     */
    static fromSparse(n, indexToTypeMap) {
        let paulis = new Uint8Array(n);
        for (let k of Object.keys(indexToTypeMap)) {
            if (k < 0 || k >= n) {
                throw new Error(`Bad index ${k}.`);
            }
            let v = indexToTypeMap[k];
            if (typeof v === 'string') {
                v = _PAULI_NAMES.indexOf(v);
                if (v === -1) {
                    throw new Error(`Bad character.`);
                }
            }
            paulis[k] = v;
        }
        return new PauliProduct(0, paulis);
    }

    /**
     * @param {!int} n
     * @param {!object.<!string, !Array.<!int>>} typeToIndexMap
     */
    static fromSparseByType(n, typeToIndexMap) {
        let paulis = new Uint8Array(n);
        for (let k of Object.keys(typeToIndexMap)) {
            let p = _PAULI_NAMES.indexOf(k);
            let indices = typeToIndexMap[k];
            if (!Array.isArray(indices)) {
                indices = [indices];
            }
            for (let i of indices) {
                if (i < 0 || i >= n) {
                    throw new Error(`Bad index ${i}.`);
                }
                paulis[i] = p;
            }
        }
        return new PauliProduct(0, paulis);
    }

    /**
     * @param {!int} n
     * @param {!boolean} axis False means X, true means Z.
     * @param {!Array.<!int>} qubits
     * @param {!boolean=false} negate
     */
    static fromXzParity(n, axis, qubits, negate=false) {
        let p = axis ? 2 : 1;
        let paulis = new Uint8Array(n);
        for (let q of qubits) {
            paulis[q] ^= p;
        }
        let phase = negate ? 2 : 0;
        return new PauliProduct(phase, paulis);
    }

    /**
     * @param {!string} text
     * @returns {!PauliProduct}
     */
    static fromString(text) {
        let phase = 0;
        if (text[0] === '+') {
            text = text.slice(1);
        }
        if (text[0] === '-') {
            text = text.slice(1);
            phase += 2;
        }
        if (text[0] === 'i') {
            text = text.slice(1);
            phase += 1;
        }
        let paulis = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) {
            let k = _PAULI_NAMES.indexOf(text[i]);
            if (k === -1) {
                throw new Error(`Bad character: ${text[i]}`);
            }
            paulis[i] = k;
        }
        return new PauliProduct(phase, paulis);
    }

    /**
     * @param {!int} start
     * @param {!int|undefined=undefined} stop
     * @returns {!PauliProduct}
     */
    slice(start, stop=undefined) {
        return new PauliProduct(this.phase_exponent, this.paulis.slice(start, stop));
    }

    /**
     * @returns {!int}
     */
    xzBitWeight() {
        let t = 0;
        for (let i = 0; i < this.paulis.length; i++) {
            if ((this.paulis[i] & 1) !== 0) {
                t++;
            }
            if ((this.paulis[i] & 2) !== 0) {
                t++;
            }
        }
        return t;
    }

    /**
     * @returns {!QubitAxis}
     */
    xzSingleton() {
        if (this.xzBitWeight() !== 1) {
            throw new Error('Not a singleton.');
        }
        return this.firstActiveQubitAxis();
    }

    /**
     * @param {!PauliProduct|!Complex|!int} other
     */
    inline_times(other) {
        if (other instanceof PauliProduct) {
            for (let i = 0; i < other.paulis.length; i++) {
                let p = other.paulis[i];
                this.phase_exponent += _pauli_product_phase(this.paulis[i], p);
                this.paulis[i] ^= p;
            }
            this.phase_exponent += other.phase_exponent;
        } else if (other instanceof QubitAxis) {
            let i = other.qubit;
            let p = other.axis ? 2 : 1;
            this.phase_exponent += _pauli_product_phase(this.paulis[i], p);
            this.paulis[i] ^= p;
        } else {
            let c = Complex.from(other);
            let p;
            if (c.isEqualTo(1)) {
                p = 0;
            } else if (c.isEqualTo(-1)) {
                p = 2;
            } else if (c.isEqualTo(Complex.I)) {
                p = 1;
            } else if (c.isEqualTo(Complex.I.neg())) {
                p = 3;
            } else {
                throw new Error(`Multiplied PauliProduct by unsupported value ${other}.`);
            }
            this.phase_exponent += p;
        }
        this.phase_exponent &= 3;
        return this;
    }

    /**
     * @param {!PauliProduct|!Complex|!int} other
     */
    times(other) {
        let n = this.paulis.length;
        if (other instanceof PauliProduct) {
            n = Math.max(n, other.paulis.length);
        } else if (other instanceof QubitAxis) {
            n = Math.max(n, other.qubit + 1);
        }
        let copy = new PauliProduct(this.phase_exponent, new Uint8Array(n));
        for (let i = 0; i < this.paulis.length; i++) {
            copy.paulis[i] = this.paulis[i];
        }
        copy.inline_times(other);
        return copy;
    }

    /**
     * @returns {!PauliProduct}
     */
    abs() {
        return new PauliProduct(0, new Uint8Array(this.paulis));
    }

    /**
     * @param {!PauliProduct} other
     */
    bitwiseAnd(other) {
        let n = Math.min(this.paulis.length, other.paulis.length);
        let paulis = new Uint8Array(n);
        let phase = this.phase_exponent & other.phase_exponent;
        for (let i = 0; i < n; i++) {
            paulis[i] = this.paulis[i] & other.paulis[i];
        }
        return new PauliProduct(phase, paulis);
    }

    /**
     * @returns {!Array.<!QubitAxis>}
     */
    activeQubitAxes() {
        let result = [];
        for (let i = 0; i < this.paulis.length; i++) {
            if ((this.paulis[i] & 1) !== 0) {
                result.push(new QubitAxis(i, false));
            }
            if ((this.paulis[i] & 2) !== 0) {
                result.push(new QubitAxis(i, true));
            }
        }
        return result;
    }

    /**
     * @param {object|!PauliProduct} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof PauliProduct)) {
            return false;
        }
        if (other.phase_exponent !== this.phase_exponent) {
            return false;
        }
        if (other.paulis.length !== this.paulis.length) {
            return false;
        }
        for (let k = 0; k < this.paulis.length; k++) {
            if (other.paulis[k] !== this.paulis[k]) {
                return false;
            }
        }
        return true;
    }

    /**
     * @returns {!string}
     */
    toString() {
        let sign = ['+', '+i', '-', '-i'][this.phase_exponent];
        let paulis = [...this.paulis].map(e => _PAULI_NAMES[e]).join('');
        return sign + paulis;
    }

    /**
     * @returns {!QubitAxis|undefined}
     */
    firstActiveQubitAxis() {
        for (let i = 0; i < this.paulis.length; i++) {
            if (this.paulis[i] !== 0) {
                return new QubitAxis(i, (this.paulis[i] & 2) !== 0);
            }
        }
        return undefined;
    }

    /**
     * @param {!PauliProduct} other
     * @returns {!boolean}
     */
    commutesWith(other) {
        let n = Math.min(this.paulis.length, other.paulis.length);
        let t = 0;
        for (let k = 0; k < n; k++) {
            if (_pauli_product_phase(this.paulis[k], other.paulis[k]) !== 0) {
                t++;
            }
        }
        return (t & 1) === 0;
    }

    /**
     * @param {!int} index
     * @param {!boolean} xz
     * @returns {!boolean}
     */
    _hasPauliXZ(index, xz) {
        let p = this.paulis[index];
        p >>= xz ? 1 : 0;
        return (p & 1) !== 0;
    }

    /**
     * @param {!Array.<!PauliProduct>} table
     * @returns {!Array.<!PauliProduct>}
     */
    static gaussianEliminate(table) {
        table = [...table];
        if (table.length === 0) {
            return table;
        }

        let h = table.length;
        let w = table[0].paulis.length;
        let next_row = 0;

        for (let col = 0; col < w; col++) {
            for (let xz of [false, true]) {
                // Locate pivot.
                let row = undefined;
                for (let k = next_row; k < h; k++) {
                    if (table[k]._hasPauliXZ(col, xz)) {
                        row = k;
                        break;
                    }
                }
                if (row === undefined) {
                    continue;
                }

                // Eliminate column entry in other rows.
                for (let row2 = 0; row2 < h; row2++) {
                    if (row !== row2 && table[row2]._hasPauliXZ(col, xz)) {
                        table[row2] = table[row2].times(table[row]);
                    }
                }

                // Keep it sorted.
                if (row !== next_row) {
                    [table[next_row], table[row]] = [table[row], table[next_row]];
                }
                next_row += 1;
            }
        }
        return table;
    }
}

/**
 * Determines the power of i in the product of two Paulis.
 *
 * For example, X*Y = iZ and so this method would return +1 for X and Y.
 *
 * The input Paulis are encoded into the following form:
 *
 * x z | Pauli
 * ----+-------
 * 0 0 | 0 I
 * 1 0 | 1 X
 * 1 1 | 3 Y
 * 0 1 | 2 Z
 *
 * @param {!int} p1
 * @param {!int} p2
 * @private
 */
function _pauli_product_phase(p1, p2) {
    // Analyze by case over first gate.
    let x1 = p1 & 1;
    let z1 = p1 >> 1;
    let x2 = p2 & 1;
    let z2 = p2  >> 1;

    if (x1 && z1) { // Y gate.
        // No phase for YI = Y
        // -1 phase for YX = -iZ
        // No phase for YY = I
        // +1 phase for YZ = +iX
        return z2 - x2;
    }

    if (x1) { // X gate.
        // No phase for XI = X
        // No phase for XX = I
        // +1 phase for XY = iZ
        // -1 phase for XZ = -iY
        return z2 && (2 * x2 - 1);
    }

    if (z1) { // Z gate.
        // No phase for ZI = Z
        // +1 phase for ZX = -iY
        // -1 phase for ZY = iX
        // No phase for ZZ = I
        return x2 && (1 - 2 * z2);
    }

    // Identity gate.
    return 0;
}

export {QubitAxis, PauliProduct, _pauli_product_phase}
