import {Util} from "src/base/Util.js";
import {equate_Iterables} from "src/base/Equate.js";
import {describe} from "src/base/Describe.js";
import {stim} from "src/ext/stim.js";


class ExternalStabilizer {
    /**
     * @param {!string} input
     * @param {!string} output
     * @param {!int} sign
     */
    constructor(input, output, sign) {
        this.input = input;
        this.output = output;
        this.sign = sign;
    }

    /**
     * @param {!stim_PauliString} stabilizer
     * @param {!int} num_inputs
     * @returns {!ExternalStabilizer}
     */
    static from_dual(stabilizer, num_inputs) {
        let s = stabilizer.toString();
        let inp = s.substr(1, num_inputs);
        let out = s.substr(num_inputs + 1);
        let sign = +(s.substr(0, 1) + '1');
        for (let c of inp) {
            if (c === 'Y') {
                sign *= -1;
            }
        }
        return new ExternalStabilizer(inp, out, sign);
    }

    /**
     * @param {!int} num_inputs
     * @param {!Array.<stim_PauliString>} dual_stabilizers
     * @returns {!Array.<ExternalStabilizer>}
     */
    static from_duals(num_inputs, dual_stabilizers) {
        if (dual_stabilizers.length === 0) {
            return [];
        }

        let num_qubits = dual_stabilizers[0].length;
        let num_outputs = num_qubits - num_inputs;

        // Pivot on output qubits, to potentially isolate input-only stabilizers.
        let min_pivot = 0;
        for (let q = num_inputs; q < num_qubits; q++) {
            min_pivot = stabilizer_elimination_step(dual_stabilizers, min_pivot, q);
        }

        // Separate input-only stabilizers from the rest.
        let input_only_stabilizers = [];
        let output_using_stabilizers = [];
        for (let dual of dual_stabilizers) {
            if (dual.toString().endsWith('_'.repeat(num_outputs))) {
                input_only_stabilizers.push(dual);
            } else {
                output_using_stabilizers.push(dual);
            }
        }

        // Canonicalize the output-using stabilizers.
        min_pivot = 0;
        for (let q = 0; q < num_qubits; q++) {
            min_pivot = stabilizer_elimination_step(output_using_stabilizers, min_pivot, q);
        }
        // Canonicalize the input-only stabilizers.
        min_pivot = 0;
        for (let q = 0; q < num_inputs; q++) {
            min_pivot = stabilizer_elimination_step(input_only_stabilizers, min_pivot, q);
        }

        dual_stabilizers = [...input_only_stabilizers, ...output_using_stabilizers];

        return dual_stabilizers.map(e => ExternalStabilizer.from_dual(e, num_inputs));
    }

    /**
     * @param {any} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof ExternalStabilizer && this.output === other.output && this.input === other.input && this.sign === other.sign;
    }

    /**
     * @returns {!string}
     */
    toString() {
        let s = this.sign === +1 ? '+' : this.sign === -1 ? '-' : '?';
        return `+${this.input} -> ${s}${this.output}`;
    }
}

/**
 * @param {!Array.<!stim_PauliString>} duals
 * @param {!int} min_pivot
 * @param {!int} qubit
 * @returns {!int}
 */
function stabilizer_elimination_step(duals, min_pivot, qubit) {
    for (let b = 1; b < 4; b += 2) {
        let pivot;
        for (pivot = min_pivot; pivot < duals.length; pivot++) {
            let p = duals[pivot].pauli(qubit);
            if (p === 2 || p === b) {
                break;
            }
        }
        if (pivot === duals.length) {
            continue;
        }
        for (let s = 0; s < duals.length; s++) {
            let p = duals[s].pauli(qubit);
            if (s !== pivot && (p === 2 || p === b)) {
                duals[s].times_inplace(duals[pivot]);
            }
        }
        if (min_pivot !== pivot) {
            let t = duals[min_pivot];
            duals[min_pivot] = duals[pivot];
            duals[pivot] = t;
        }
        min_pivot += 1;
    }
    return min_pivot;
}

export {ExternalStabilizer, stabilizer_elimination_step}
