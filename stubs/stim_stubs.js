class stim_Tableau {
    /**
     * @param {!int} arg
     */
    constructor(arg) {
    }
    /**
     * @returns {!stim_Tableau}
     */
    deleteLater();
    delete();
}
class stim_PauliString {
    /**
     * @param {!int|!string} arg
     */
    constructor(arg) {
    }
    /**
     * @returns {!int}
     */
    get length();

    /**
     * @param {!stim_PauliString} other
     * @returns {!stim_PauliString}
     */
    times(other);
    /**
     * @param {!stim_PauliString} other
     */
    times_inplace(other);
    /**
     * @param {!int} index
     * @returns {!int}
     */
    pauli(index);
    /**
     * @returns {!stim_PauliString}
     */
    deleteLater();
    delete();
}
class stim_TableauSimulator {
    constructor() {
    }
    /**
     * @returns {!stim_TableauSimulator}
     */
    deleteLater();
    delete();
    /**
     * @param {!int} new_num_qubits
     */
    set_num_qubits(new_num_qubits);
    /**
     * @param {!int} target
     * @returns {!boolean}
     */
    measure(target);
    /**
     * @param {!int} target
     * @returns {!boolean}
     */
    measure_x(target);
    /**
     * @param {!int} target
     * @returns {!boolean}
     */
    measure_y(target);
    /**
     * @param {!int} target
     * @returns {!{result: !boolean, kickback: undefined|!stim_PauliString}}
     */
    measure_kickback(target);
    /**
     * @param {!int} target
     * @returns {!{result: !boolean, kickback: undefined|!stim_PauliString}}
     */
    measure_kickback_x(target);
    /**
     * @param {!int} target
     * @returns {!{result: !boolean, kickback: undefined|!stim_PauliString}}
     */
    measure_kickback_y(target);
    /**
     * @returns {!Array.<!stim_PauliString>}
     */
    canonical_stabilizers();
    /**
     * @returns {!stim_Tableau}
     */
    current_inverse_tableau();
    /**
     * @param {!int} target
     */
    H(target);
    /**
     * @param {!int} target
     */
    S(target);
    /**
     * @param {!int} target
     */
    Z(target);
    /**
     * @param {!int} target
     */
    S_DAG(target);
    /**
     * @param {!int} target1
     * @param {!int} target2
     */
    SWAP(target1, target2);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    CNOT(control, target);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    CZ(control, target);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    CY(control, target);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    XCX(control, target);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    XCZ(control, target);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    XCY(control, target);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    YCX(control, target);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    YCZ(control, target);
    /**
     * @param {!int} control
     * @param {!int} target
     */
    YCY(control, target);
}

/**
 * @param {!int} v
 * @returns {!int}
 */
function target_rec(v) { return v; }
/**
 * @param {!int} v
 * @returns {!int}
 */
function target_inv(v) { return v; }
/**
 * @param {!int} v
 * @returns {!int}
 */
function target_x(v) { return v; }
/**
 * @param {!int} v
 * @returns {!int}
 */
function target_y(v) { return v; }
/**
 * @param {!int} v
 * @returns {!int}
 */
function target_z(v) { return v; }

let stim = {
    Tableau: stim_Tableau,
    PauliString: stim_PauliString,
    TableauSimulator: stim_TableauSimulator,
    target_rec,
    target_inv,
    target_x,
    target_y,
    target_z,
}

export {stim}
