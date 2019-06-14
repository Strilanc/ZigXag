/**
 * Measurement result from a stabilizer simulator, with known random-vs-deterministic origin.
 */
class Measurement {
    /**
     * @param {!boolean} result
     * @param {!boolean} random
     */
    constructor(result, random) {
        this.result = result;
        this.random = random;
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `${this.result} (${this.random ? 'random' : 'determined'})`;
    }

    /**
     * @param {!Measurement|*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return other instanceof Measurement && this.result === other.result && this.random === other.random;
    }
}

export {Measurement}
