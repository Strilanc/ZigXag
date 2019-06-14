class SimulatorSpec {
    /**
     * Adds a new qubit to the system and returns a handle used to refer to it.
     * @returns {!int}
     */
    qalloc() {
        throw new Error(`qalloc() not implemented in ${this}`);
    }

    /**
     * Removes a qubit from the system. Decoheres the qubit.
     * @param {!int} q The qubit handle.
     */
    free(q) {
        throw new Error(`free(${q}) not implemented in ${this}`);
    }

    /**
     * Applies an S gate to a qubit.
     * @param {!int} q The handle of the qubit to operate on.
     */
    phase(q) {
        throw new Error(`phase(${q}) not implemented in ${this}`);
    }

    /**
     * Applies a Z gate to a qubit.
     * @param {!int} q The handle of the qubit to operate on.
     */
    z(q) {
        this.phase(q);
        this.phase(q);
    }

    /**
     * Applies a NOT gate to a qubit.
     * @param {!int} q The handle of the qubit to operate on.
     */
    x(q) {
        this.hadamard(q);
        this.phase(q);
        this.phase(q);
        this.hadamard(q);
    }

    /**
     * Applies a Hadamard gate to a qubit.
     * @param {!int} q The handle of the qubit to operate on.
     */
    hadamard(q) {
        throw new Error(`hadamard(${q}) not implemented in ${this}`);
    }

    /**
     * Applies a controlled not gate to a pair of qubits.
     * @param {!int} control The handle of the operation's control qubit.
     * @param {!int} target The handle of the operation's target qubit.
     */
    cnot(control, target) {
        throw new Error(`cnot(${control}, ${target}) not implemented in ${this}`);
    }

    /**
     * Measures a qubit.
     * @param {!int} q The handle of the qubit to measure.
     * @param {!number|undefined=} bias When a measurement result is non-deterministic, this determines the probability of True.
     * @returns {!boolean} The measurement result.
     */
    measure(q, bias=undefined) {
        let p = this.probability(q);
        if (Math.abs(p - 0.5) < 0.001 && bias !== undefined) {
            p = bias;
        }
        let outcome = Math.random() < p;
        this.collapse(q, outcome);
        return outcome;
    }

    /**
     * Determines the probability of a qubit measurement returning ON, if it was performed.
     * @param {!int} q The handle of the qubit to inspect.
     * @returns {!number} The probability.
     */
    probability(q) {
        throw new Error(`probability(${q}) not implemented in ${this}`);
    }

    /**
     * Determines the probability of a qubit X-basis measurement returning |0>-|1>, if it was performed.
     * @param {!int} q The handle of the qubit to inspect.
     * @returns {!number} The probability.
     */
    probability_x(q) {
        this.hadamard(q);
        let r = this.probability(q);
        this.hadamard(q);
        return r;
    }

    /**
     * Determines the probability of a qubit Y-basis measurement returning |0>-i|1>, if it was performed.
     * @param {!int} q The handle of the qubit to inspect.
     * @returns {!number} The probability.
     */
    probability_y(q) {
        this.phase(q);
        this.phase(q);
        this.phase(q);
        this.hadamard(q);
        let r = this.probability(q);
        this.hadamard(q);
        this.phase(q);
        return r;
    }

    /**
     * Determines the mixed state of a qubit as a vector on the Bloch sphere.
     * @param {!int} q The handle of the qubit to inspect.
     * @returns {!{x: !number, y: !number, z: !number}} The x, y, and z components of the vector.
     */
    blochVector(q) {
        let z = this.probability(q);
        let y = this.probability_y(q);
        let x = this.probability_x(q);
        x = 1 - x * 2;
        y = 1 - y * 2;
        z = 1 - z * 2;
        return {x, y, z};
    }

    /**
     * Measures a qubit while forcing the result.
     * @param {!int} q The handle of the qubit to collapse.
     * @param {!boolean} outcome The outcome to force the qubit into.
     */
    collapse(q, outcome) {
        throw new Error(`collapse(${q}, ${outcome}) not implemented in ${this}`);
    }

    /**
     * Swaps the values of two qubits. It is permitted for both arguments to be the same, in which case nothing happens.
     * @param {!int} a The handle of one of the qubits.
     * @param {!int} b The handle of one of the qubits.
     */
    swap(a, b) {
        if (a === b) {
            return;
        }
        this.cnot(a, b);
        this.cnot(b, a);
        this.cnot(a, b);
    }

    /**
     * Free's any manually-managed resources used by the instance.
     */
    destruct() {
    }
}

export {SimulatorSpec}
